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
