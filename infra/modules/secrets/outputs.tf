output "arkesel_sms_secret_arn" {
  description = "ARN of the Arkesel SMS credentials secret"
  value       = aws_secretsmanager_secret.arkesel_sms.arn
}

output "arkesel_sms_secret_name" {
  description = "Name of the Arkesel SMS credentials secret (for put-secret-value)"
  value       = aws_secretsmanager_secret.arkesel_sms.name
}

output "jwt_signing_key_secret_arn" {
  description = "ARN of the API token-signing key secret"
  value       = aws_secretsmanager_secret.jwt_signing_key.arn
}

output "votex365_secret_arn" {
  description = "ARN of the votex365 payments secret"
  value       = aws_secretsmanager_secret.votex365.arn
}

output "admin_seed_secret_arn" {
  description = "ARN of the first-admin seed secret"
  value       = aws_secretsmanager_secret.admin_seed.arn
}

output "vapid_secret_arn" {
  description = "ARN of the Web Push VAPID keys secret"
  value       = aws_secretsmanager_secret.vapid.arn
}

output "secret_names" {
  description = "Names of the secrets whose values are set out-of-band (for put-secret-value)"
  value = {
    arkesel_sms     = aws_secretsmanager_secret.arkesel_sms.name
    jwt_signing_key = aws_secretsmanager_secret.jwt_signing_key.name
    votex365        = aws_secretsmanager_secret.votex365.name
    admin_seed      = aws_secretsmanager_secret.admin_seed.name
    vapid           = aws_secretsmanager_secret.vapid.name
  }
}
