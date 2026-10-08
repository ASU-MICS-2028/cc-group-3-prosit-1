terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = "ashesi-dev"
  default_tags {
    tags = {
      Project   = var.project
      Env       = var.env
      ManagedBy = "terraform"
      Team      = "highlanders"
    }
  }
}

# Amplify Hosting is not offered in af-south-1 (Cape Town). We host it in
# eu-west-1 (Ireland) — closest supported region. CloudFront still serves the
# app from its global edges (including Cape Town/Johannesburg), so user-facing
# latency is unaffected; only the build runners live in Ireland.
provider "aws" {
  alias   = "amplify"
  region  = "eu-west-1"
  profile = "ashesi-dev"
  default_tags {
    tags = {
      Project   = var.project
      Env       = var.env
      ManagedBy = "terraform"
      Team      = "highlanders"
    }
  }
}

locals {
  name = "${var.project}-${var.env}"
}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

data "aws_caller_identity" "current" {}

# ---------- compute (IAM + ASG + launch template + scaling policy) ----------
# Comes first because `nat` needs the shared instance profile, and `network`
# needs the NAT ENI id.
module "compute" {
  source = "./modules/compute"

  name_prefix             = local.name
  region                  = var.region
  instance_type           = var.instance_type
  app_port                = var.app_port
  ami_id                  = data.aws_ssm_parameter.ubuntu.value
  app_security_group_id   = module.alb.app_security_group_id
  private_subnet_ids      = module.network.private_subnet_ids
  target_group_arn        = module.alb.target_group_arn
  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  ecr_repository_url      = module.ecr.repository_url

  # Data-tier wiring (RDS + S3). Compute uses these to construct DATABASE_URL
  # and PHOTO_BUCKET env vars at EC2 boot via user_data.
  db_endpoint               = module.database.endpoint
  db_name                   = module.database.db_name
  db_master_user_secret_arn = module.database.master_user_secret_arn
  media_bucket_name         = module.storage.bucket_name
  media_bucket_policy_json  = module.storage.app_access_policy_json
}

# ---------- nat (fck-nat instance for private-tier egress) ----------
module "nat" {
  source = "./modules/nat"

  name_prefix           = local.name
  vpc_id                = module.network.vpc_id
  vpc_cidr              = module.network.vpc_cidr
  public_subnet_id      = module.network.public_subnet_ids[0]
  instance_type         = var.nat_instance_type
  instance_profile_name = module.compute.instance_profile_name
}

# ---------- network (VPC + subnets + route tables) ----------
module "network" {
  source = "./modules/network"

  name_prefix          = local.name
  vpc_cidr             = var.vpc_cidr
  azs                  = var.azs
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  data_subnet_cidrs    = var.data_subnet_cidrs
  nat_eni_id           = module.nat.eni_id
}

# ---------- ecr (container registry) ----------
module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name
}

# ---------- database (RDS Postgres in the isolated data subnets) ----------
module "database" {
  source = "./modules/database"

  name_prefix           = local.name
  data_subnet_ids       = module.network.data_subnet_ids
  app_security_group_id = module.alb.app_security_group_id
}

# ---------- storage (S3 bucket for farmer + crop-check photos) ----------
module "storage" {
  source = "./modules/storage"

  name_prefix = local.name
}

# ---------- alb (ALB + SGs + target group + listeners + ACM cert) ----------
module "alb" {
  source = "./modules/alb"

  name_prefix       = local.name
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  app_port          = var.app_port
  api_hostname      = var.api_hostname
}

# ---------- cicd (GitHub Actions OIDC + deploy role) ----------
module "cicd" {
  source      = "./modules/cicd"
  name_prefix = local.name
  github_repo = var.github_repo
}

# ---------- frontend (AWS Amplify Hosting for the Vite+React PWA) ----------
# Repo auth is via the AWS Amplify GitHub App installed on the org (see
# docs/architecture-decisions.md ADR-009). No PAT, no Secrets Manager lookup.
module "frontend" {
  source = "./modules/frontend"
  providers = {
    aws = aws.amplify
  }

  name_prefix             = local.name
  repository_url          = "https://github.com/${var.github_repo}"
  production_branch       = "main"
  api_url                 = "https://${var.api_hostname}"
  custom_domain           = var.frontend_apex_domain
  custom_subdomain_prefix = var.frontend_subdomain_prefix
}

# ---------- observability (SNS topic + CloudWatch alarms + monthly budget) ----------
# Alarms span every tier: ALB (unhealthy targets, target 5xx, latency),
# RDS (memory, storage, CPU), and EC2 (fck-nat + ASG system status checks).
# All publish to one SNS topic; the budget emails directly.
module "observability" {
  source = "./modules/observability"

  name_prefix                 = local.name
  alarm_email_addresses       = var.alarm_email_addresses
  monthly_budget_warn_usd     = var.monthly_budget_warn_usd
  monthly_budget_critical_usd = var.monthly_budget_critical_usd

  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  db_instance_identifier  = module.database.identifier
  asg_name                = module.compute.asg_name
  nat_instance_id         = module.nat.instance_id
}
