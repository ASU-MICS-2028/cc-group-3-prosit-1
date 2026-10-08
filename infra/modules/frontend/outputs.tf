output "app_id" {
  value = aws_amplify_app.pwa.id
}

output "default_domain" {
  description = "Amplify-provided URL, e.g. main.d1234.amplifyapp.com"
  value       = "${aws_amplify_branch.main.branch_name}.${aws_amplify_app.pwa.default_domain}"
}

output "custom_url" {
  value = "https://${var.custom_subdomain_prefix}.${var.custom_domain}"
}

# DNS records you need to publish at your DNS provider (Hostinger). After
# `terraform apply` these are populated; use them to seed the CNAMEs.
output "dns_records_to_publish" {
  description = "Add these at Hostinger: the sub_domain CNAME + the ACM validation CNAME."
  value       = aws_amplify_domain_association.app.sub_domain
}

output "certificate_verification_dns_record" {
  description = "ACM cert validation CNAME Amplify needs at your DNS provider."
  value       = aws_amplify_domain_association.app.certificate_verification_dns_record
}
