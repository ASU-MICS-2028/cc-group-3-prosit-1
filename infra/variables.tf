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
