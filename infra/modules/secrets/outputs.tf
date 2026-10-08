output "arkesel_sms_secret_arn" {
  description = "ARN of the Arkesel SMS credentials secret"
  value       = aws_secretsmanager_secret.arkesel_sms.arn
}

output "arkesel_sms_secret_name" {
  description = "Name of the Arkesel SMS credentials secret (for put-secret-value)"
  value       = aws_secretsmanager_secret.arkesel_sms.name
}
