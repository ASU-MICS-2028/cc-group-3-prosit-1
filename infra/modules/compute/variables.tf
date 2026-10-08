variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "instance_type" {
  type = string
}

variable "app_port" {
  type = number
}

variable "ami_id" {
  type        = string
  description = "Ubuntu AMI resolved from SSM at the root"
}

variable "app_security_group_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "target_group_arn" {
  type = string
}

variable "ecr_repository_url" {
  type = string
}

variable "min_size" {
  type    = number
  default = 1
}

variable "max_size" {
  type    = number
  default = 3
}

variable "desired_capacity" {
  type    = number
  default = 1
}

variable "alb_arn_suffix" {
  type        = string
  description = "ALB arn_suffix (e.g. app/<name>/<id>) — used to build the policy's resource_label"
}

variable "target_group_arn_suffix" {
  type        = string
  description = "Target group arn_suffix (e.g. targetgroup/<name>/<id>)"
}

variable "requests_per_target_target_value" {
  type        = number
  default     = 500
  description = "Target requests per target per minute. ~8 req/s per instance; keeps a t3.micro comfortable."
}

variable "db_endpoint" {
  type        = string
  description = "Postgres host:port — baked into DATABASE_URL at boot"
  default     = ""
}

variable "db_name" {
  type    = string
  default = ""
}

variable "db_master_user_secret_arn" {
  type        = string
  description = "Secrets Manager ARN with the DB master credentials. EC2 role gets GetSecretValue on just this ARN."
  default     = ""
}

variable "media_bucket_name" {
  type        = string
  description = "S3 photo bucket — exported as PHOTO_BUCKET env var to the container"
  default     = ""
}

variable "media_bucket_policy_json" {
  type        = string
  description = "Inline IAM policy JSON from the storage module, attached to the EC2 role for S3 read/write"
  default     = ""
}

variable "sms_secret_arn" {
  type        = string
  description = "Secrets Manager ARN holding the Arkesel SMS credentials. EC2 role gets GetSecretValue on just this ARN; passed to the container as SMS_SECRET_ARN."
  default     = ""
}

variable "log_retention_days" {
  type        = number
  description = "Retention for the app's CloudWatch log group."
  default     = 14
}

variable "jwt_secret_arn" {
  type        = string
  description = "Secrets Manager ARN of the API token-signing key ({ private_key_pem }). Passed as JWT_SECRET_ARN."
  default     = ""
}

variable "votex_secret_arn" {
  type        = string
  description = "Secrets Manager ARN of the votex365 credentials ({ api_key, webhook_secret }). Passed as VOTEX_SECRET_ARN."
  default     = ""
}

variable "admin_seed_secret_arn" {
  type        = string
  description = "Secrets Manager ARN of the first admin account ({ login_id, name, phone, password }). Passed as ADMIN_SEED_SECRET_ARN."
  default     = ""
}

variable "pwa_origins" {
  type        = string
  description = "Comma-separated browser origins the API allows (CORS)."
}

variable "payment_return_url" {
  type        = string
  description = "Where votex365 sends the farmer's browser after checkout."
}

variable "auth_test_mode" {
  type        = bool
  description = "true returns sign-in codes in API responses instead of texting them. Demo only."
  default     = false
}

variable "seed_demo_accounts" {
  type        = bool
  description = "true seeds the public demo accounts from WALKTHROUGH.md. Never with real data."
  default     = false
}

variable "image_tag_param_name" {
  type        = string
  description = "SSM parameter holding the image tag the container pulls."
  default     = ""
}

variable "image_tag_param_arn" {
  type        = string
  description = "ARN of the image-tag parameter (EC2 role gets ssm:GetParameter on just this one)."
  default     = ""
}
