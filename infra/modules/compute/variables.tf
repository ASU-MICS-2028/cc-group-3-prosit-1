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

variable "cpu_target_value" {
  type        = number
  default     = 60
  description = "Target average CPU % for the scaling policy"
}
