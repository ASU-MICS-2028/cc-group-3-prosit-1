variable "name_prefix" {
  type = string
}

variable "repository_url" {
  type        = string
  description = "GitHub repo URL (e.g. https://github.com/org/repo)"
}

variable "production_branch" {
  type    = string
  default = "main"
}

variable "api_url" {
  type        = string
  description = "VITE_API_URL baked into the build (e.g. https://api.agroconnect.space)"
}

variable "custom_domain" {
  type        = string
  description = "Apex domain, e.g. agroconnect.space"
}

variable "custom_subdomain_prefix" {
  type        = string
  description = "Subdomain prefix, e.g. app -> app.agroconnect.space"
  default     = "app"
}
