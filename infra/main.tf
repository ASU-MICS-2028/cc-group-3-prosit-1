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

  name_prefix           = local.name
  region                = var.region
  instance_type         = var.instance_type
  app_port              = var.app_port
  ami_id                = data.aws_ssm_parameter.ubuntu.value
  app_security_group_id = module.alb.app_security_group_id
  private_subnet_ids    = module.network.private_subnet_ids
  target_group_arn      = module.alb.target_group_arn
  ecr_repository_url    = module.ecr.repository_url
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
