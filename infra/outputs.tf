output "alb_dns" {
  value = module.alb.alb_dns
}

output "api_url" {
  value = "https://${var.api_hostname}"
}

output "ecr_repo_url" {
  value = module.ecr.repository_url
}

output "asg_name" {
  value = module.compute.asg_name
}

output "scaling_policy_arn" {
  value = module.compute.scaling_policy_arn
}

output "gha_role_arn" {
  value = module.cicd.gha_role_arn
}

output "aws_region" {
  value = var.region
}

output "data_subnet_ids" {
  value = module.network.data_subnet_ids
}

output "nat_instance_id" {
  value = module.nat.instance_id
}

output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "amplify_app_id" {
  value = module.frontend.app_id
}

output "amplify_default_url" {
  value = "https://${module.frontend.default_domain}"
}

output "frontend_url" {
  value = module.frontend.custom_url
}

output "frontend_dns_records_to_publish" {
  description = "Add these CNAMEs at Hostinger: sub_domain + cert validation"
  value       = module.frontend.dns_records_to_publish
}

output "frontend_cert_validation_record" {
  value = module.frontend.certificate_verification_dns_record
}

output "db_endpoint" {
  value = module.database.endpoint
}

output "db_name" {
  value = module.database.db_name
}

output "db_master_user_secret_arn" {
  description = "Secrets Manager ARN with JSON {username, password}. Rotated by RDS."
  value       = module.database.master_user_secret_arn
}

output "media_bucket_name" {
  value = module.storage.bucket_name
}

output "media_bucket_arn" {
  value = module.storage.bucket_arn
}

output "alarm_topic_arn" {
  description = "SNS topic for CloudWatch alarms. Add email/Slack subscriptions here."
  value       = module.observability.alarm_topic_arn
}

output "observability_dashboard_url" {
  value = module.observability.dashboard_url
}
