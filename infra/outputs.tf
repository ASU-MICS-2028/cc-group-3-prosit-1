output "alb_dns" {
  value = aws_lb.app.dns_name
}

output "ecr_repo_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "asg_name" {
  value = aws_autoscaling_group.app.name
}

output "gha_role_arn" {
  value = aws_iam_role.gha_deploy.arn
}

output "aws_region" {
  value = var.region
}

output "data_subnet_ids" {
  value = aws_subnet.data[*].id
}

output "nat_instance_id" {
  value = aws_instance.nat.id
}

output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

data "aws_caller_identity" "current" {}
