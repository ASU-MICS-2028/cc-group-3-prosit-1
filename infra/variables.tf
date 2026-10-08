variable "project" {
  type    = string
  default = "agroconnect"
}

variable "env" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "af-south-1"
}

variable "azs" {
  type    = list(string)
  default = ["af-south-1a", "af-south-1b"]
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.11.0/24", "10.20.12.0/24"]
}

variable "data_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.21.0/24", "10.20.22.0/24"]
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "nat_instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "app_port" {
  type    = number
  default = 8000
}

variable "github_repo" {
  description = "org/repo for GitHub Actions OIDC trust (e.g. eugene-sewor/agroconnect-backend)"
  type        = string
  default     = "ASU-MICS-2028/cc-group-3-prosit-1"
}

variable "api_hostname" {
  type    = string
  default = "api.agroconnect.space"
}

variable "frontend_apex_domain" {
  type    = string
  default = "agroconnect.space"
}

variable "frontend_subdomain_prefix" {
  type    = string
  default = "app"
}

variable "alarm_email_addresses" {
  description = "Emails subscribed to the CloudWatch alarm SNS topic and the AWS Budgets notifications. Set these in terraform.tfvars (gitignored); each recipient must confirm the SNS email before alarms arrive."
  type        = list(string)
  default     = []
}

variable "monthly_budget_warn_usd" {
  description = "Forecasted monthly spend above this triggers a warning budget notification."
  type        = number
  default     = 50
}

variable "monthly_budget_critical_usd" {
  description = "Actual month-to-date spend above this triggers a critical budget notification (also the budget limit)."
  type        = number
  default     = 100
}

variable "auth_test_mode" {
  type        = bool
  description = "Return sign-in codes in API responses instead of texting them (AUTH_TEST_MODE). Demo only."
  default     = false
}

variable "seed_demo_accounts" {
  type        = bool
  description = "Seed the public demo accounts from WALKTHROUGH.md (SEED_DEMO_ACCOUNTS). Never with real data."
  default     = false
}
