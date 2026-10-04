# AgroConnect Infrastructure (Week 3)

Terraform-managed infra in `af-south-1`.

## Shape

- VPC `10.20.0.0/16`, two AZs (`af-south-1a`, `af-south-1b`)
- 2 public subnets (ALB, NAT, IGW) + 2 private subnets (EC2 app tier)
- ALB → target group `/health` on port 8000
- Launch Template: Ubuntu 24.04, `t3.micro`, IMDSv2, SSM-managed (no SSH keys)
- ASG: min 1, max 2, desired 2, rolling instance refresh
- ECR repo `agroconnect-dev-backend`
- IAM OIDC provider + role for GitHub Actions (no long-lived keys)

## First-time bring-up

```bash
cd infra
terraform init
terraform plan
terraform apply       # ~29 resources
```

Costs: NAT gateway (~\$32/mo), ALB (~\$18/mo), 2x `t3.micro` (free tier eligible),
1 EIP, ECR storage pennies.

## After apply

```bash
terraform output
# alb_dns, ecr_repo_url, asg_name, gha_role_arn
```

Set the GitHub repo secret: `AWS_DEPLOY_ROLE_ARN` = `gha_role_arn` output.
Set `github_repo` in `variables.tf` (or a `terraform.tfvars`) to the real repo
before applying — the OIDC trust condition is pinned to it.

## Teardown

```bash
terraform destroy
```

## Known shortcuts (ponytail debt)

- Single NAT gateway shared across AZs — one AZ down takes outbound egress with
  it. Add a second when the architecture needs it.
- `:latest` image tag + instance refresh — no fast rollback. Switch to immutable
  SHA tags + an SSM parameter pointing at the current one when needed.
- HTTP-only listener. Add ACM cert + HTTPS listener before any production use.
- Instance role has broad ECR read; narrow to the specific repo ARN later.
