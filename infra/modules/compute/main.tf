# ---------- EC2 instance role (shared by app ASG + fck-nat) ----------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${var.name_prefix}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_ecr" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# S3 photo bucket access — scoped to the specific bucket by the storage module.
resource "aws_iam_role_policy" "ec2_media_bucket" {
  name   = "${var.name_prefix}-ec2-media-bucket"
  role   = aws_iam_role.ec2.id
  policy = var.media_bucket_policy_json
}

# Secrets Manager read for the DB master-user secret only.
data "aws_iam_policy_document" "db_secret_read" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_master_user_secret_arn]
  }
}

resource "aws_iam_role_policy" "ec2_db_secret" {
  name   = "${var.name_prefix}-ec2-db-secret"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.db_secret_read.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ---------- Launch Template + ASG ----------
# ponytail: `:latest` tag + instance refresh is the simplest working CI loop.
# Swap to immutable SHA tags + SSM parameter when a rollback story is needed.
locals {
  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive

    apt-get update -y
    apt-get install -y ca-certificates curl gnupg unzip

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    CODENAME=$(. /etc/os-release; echo $VERSION_CODENAME)
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io
    systemctl enable --now docker

    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install

    REGION="${var.region}"
    REPO="${var.ecr_repository_url}"
    IMAGE="$REPO:latest"

    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REPO"

    # Retry pull in case the first CI build is still in flight.
    for i in 1 2 3 4 5 6; do
      docker pull "$IMAGE" && break || sleep 15
    done

    # Build DATABASE_URL from the Secrets-Manager-managed master credentials.
    # Resolves to postgres://<user>:<pass>@<host>:<port>/<db>
    DB_SECRET=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "${var.db_master_user_secret_arn}" --query SecretString --output text 2>/dev/null || echo "")
    if [ -n "$DB_SECRET" ]; then
      DB_USER=$(echo "$DB_SECRET" | python3 -c "import sys,json;print(json.load(sys.stdin)['username'])")
      DB_PASS=$(echo "$DB_SECRET" | python3 -c "import sys,json;print(json.load(sys.stdin)['password'])")
      DB_URL="postgres://$DB_USER:$DB_PASS@${var.db_endpoint}/${var.db_name}"
    else
      DB_URL=""
    fi

    docker rm -f app 2>/dev/null || true
    docker run -d --restart=always --name app \
      -p ${var.app_port}:${var.app_port} \
      -e DATABASE_URL="$DB_URL" \
      -e PHOTO_BUCKET="${var.media_bucket_name}" \
      -e AWS_REGION="$REGION" \
      "$IMAGE"
  EOT
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.name_prefix}-lt-"
  image_id      = var.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  vpc_security_group_ids = [var.app_security_group_id]

  metadata_options {
    http_tokens = "required"
  }

  user_data = base64encode(local.user_data)

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name_prefix}-app" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  name                      = "${var.name_prefix}-asg"
  min_size                  = var.min_size
  max_size                  = var.max_size
  desired_capacity          = var.desired_capacity
  vpc_zone_identifier       = var.private_subnet_ids
  target_group_arns         = [var.target_group_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.name_prefix}-app"
    propagate_at_launch = true
  }
}

# Target-tracking on ALBRequestCountPerTarget — scales out when sustained
# request volume per instance exceeds target_value (requests per target per
# minute). Better fit than CPU for an IO-bound API: a slow DB call blocks the
# worker without ever burning CPU.
#
# AWS auto-manages the two CloudWatch alarms backing this policy — don't try
# to own them in Terraform.
resource "aws_autoscaling_policy" "cpu_target" {
  name                   = "Target Tracking Policy"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
    target_value = var.requests_per_target_target_value
  }
}
