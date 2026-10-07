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
