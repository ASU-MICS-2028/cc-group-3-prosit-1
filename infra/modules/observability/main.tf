# Single SNS topic fans out to every subscribed email. All alarms publish here.
# When an alarm transitions to ALARM state, every confirmed subscriber receives
# an email within ~1 minute.

resource "aws_sns_topic" "alarms" {
  name = "${var.name_prefix}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alarm_email_addresses)
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
  # SNS sends a confirmation email automatically; subscribers must click the
  # link before they'll receive alarms. endpoint_auto_confirms = false (default)
  # keeps the opt-in explicit.
}

# ---------- ALB alarms ----------

# Any unhealthy target → someone wake up. ASG replaces unhealthy EC2s on its
# own, but a sustained unhealthy count means the replacement cycle isn't keeping
# up (bad image, failing migrations, etc.).
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-alb-unhealthy-hosts"
  alarm_description   = "ALB sees >=1 unhealthy target for 10 minutes (2 periods of 5 min)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  alarm_name          = "${var.name_prefix}-alb-target-5xx"
  alarm_description   = "Backend returned >10 HTTP 5xx responses in a 5-minute window."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency_p95" {
  alarm_name          = "${var.name_prefix}-alb-target-latency-p95"
  alarm_description   = "p95 target response time >2s for 10 min (2 periods). Suggests backend slow (DB, cold start, saturation)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

# ---------- RDS alarms ----------

# t4g.micro has 1 GiB RAM total. Postgres starts behaving badly well before
# memory hits zero — 100 MB freeable is already in the "swap or die" zone.
resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${var.name_prefix}-rds-freeable-memory-low"
  alarm_description   = "RDS freeable memory under 100 MB — OOM imminent on t4g.micro (1 GiB total)."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 104857600 # 100 MB in bytes
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.name_prefix}-rds-free-storage-low"
  alarm_description   = "RDS free storage under 2 GB. Autoscale ceiling is 100 GB; this is early-warning so there's time to react."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GB in bytes
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  alarm_description   = "RDS CPU >80% sustained for 10 min. Likely a bad query, missing index, or genuine load."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

# ---------- EC2 alarms ----------

# fck-nat: single instance, no HA. If it's down, every private-subnet egress
# breaks (ECR pulls, apt updates, SSM Session Manager, outbound app traffic).
# System StatusCheck covers hardware/host failures the ASG doesn't catch.
resource "aws_cloudwatch_metric_alarm" "nat_status_check" {
  alarm_name          = "${var.name_prefix}-nat-status-check-failed"
  alarm_description   = "fck-nat instance status check failed. Private-subnet egress is broken until recovery."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    InstanceId = var.nat_instance_id
  }
}

# ASG-level aggregate: alerts if ANY instance in the group fails system checks.
# ASG will auto-replace, but worth knowing something flaky is happening.
resource "aws_cloudwatch_metric_alarm" "asg_status_check" {
  alarm_name          = "${var.name_prefix}-asg-status-check-failed"
  alarm_description   = "An ASG EC2 instance failed its system status check. ASG replaces automatically; this just notifies."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    AutoScalingGroupName = var.asg_name
  }
}

# ---------- Monthly cost guardrail ----------
# AWS Budgets lives in us-east-1 regardless of our primary region; the resource
# itself is global, but notifications fire from us-east-1 behind the scenes.
# Two notifications: forecast warning + actual critical.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_critical_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_tax          = true
    include_subscription = true
    include_credit       = false # don't let free-tier credits mask real spend
    use_amortized        = false
  }

  # AWS rejects a notification with no subscribers, so only emit them when at
  # least one address is configured. Without addresses the budget still tracks
  # spend; set alarm_email_addresses to turn the emails on.
  dynamic "notification" {
    for_each = length(var.alarm_email_addresses) > 0 ? [1] : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = (var.monthly_budget_warn_usd / var.monthly_budget_critical_usd) * 100
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = var.alarm_email_addresses
    }
  }

  dynamic "notification" {
    for_each = length(var.alarm_email_addresses) > 0 ? [1] : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 100 # 100% of limit_amount = absolute cap
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alarm_email_addresses
    }
  }
}
