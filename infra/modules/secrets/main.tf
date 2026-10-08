# Application secrets. Terraform owns only the secret *containers*; the values
# are set out-of-band with `aws secretsmanager put-secret-value` so they never
# enter git or Terraform state.
#
# recovery_window_in_days = 0 lets `terraform destroy` remove the secret
# immediately — convenient for this dev/lab account that tears down often.

resource "aws_secretsmanager_secret" "arkesel_sms" {
  name                    = "${var.name_prefix}-arkesel-sms"
  description             = "Nalo Solutions SMS credentials — JSON { key, sender_id }"
  recovery_window_in_days = 0
}

# The API's RS256 token-signing key. One key for every instance, so a token signed by one is valid on all,
# and tokens survive deploys. Generated with openssl and put out-of-band like the others.
resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name                    = "${var.name_prefix}-jwt-signing-key"
  description             = "API token-signing key — JSON { private_key_pem } (RSA 2048, PKCS#8)"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "votex365" {
  name                    = "${var.name_prefix}-votex365"
  description             = "votex365 payments — JSON { api_key, webhook_secret }"
  recovery_window_in_days = 0
}

# Web Push keys (VAPID). Generated once with `npx web-push generate-vapid-keys --json`.
resource "aws_secretsmanager_secret" "vapid" {
  name                    = "${var.name_prefix}-vapid"
  description             = "Web Push VAPID keys — JSON { public_key, private_key, subject }"
  recovery_window_in_days = 0
}

# The first administrator. AUTH-CONTRACT: admins are seeded, never created through the API.
resource "aws_secretsmanager_secret" "admin_seed" {
  name                    = "${var.name_prefix}-admin-seed"
  description             = "First admin account — JSON { login_id, name, phone, password }"
  recovery_window_in_days = 0
}
