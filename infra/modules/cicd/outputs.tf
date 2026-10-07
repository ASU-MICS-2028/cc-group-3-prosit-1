output "gha_role_arn" {
  value = aws_iam_role.gha_deploy.arn
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
