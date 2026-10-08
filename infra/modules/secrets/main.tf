# Application secrets. Terraform owns only the secret *containers*; the values
# are set out-of-band with `aws secretsmanager put-secret-value` so they never
# enter git or Terraform state.
#
# recovery_window_in_days = 0 lets `terraform destroy` remove the secret
# immediately — convenient for this dev/lab account that tears down often.

resource "aws_secretsmanager_secret" "arkesel_sms" {
  name                    = "${var.name_prefix}-arkesel-sms"
  description             = "Arkesel SMS credentials — JSON { sender_id, api_key }"
  recovery_window_in_days = 0
}
