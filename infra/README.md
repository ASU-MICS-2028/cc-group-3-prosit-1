# AgroConnect Infrastructure

Terraform-managed infra in `af-south-1`. Root is a thin orchestrator; each concern
lives in its own module under `modules/`.

## Layout

```
infra/
├── main.tf              # providers, locals, module wiring
├── variables.tf         # root inputs
├── outputs.tf           # pulls from module outputs
├── migrate-state.sh     # one-shot state-mv helper (idempotent)
└── modules/
    ├── network/         # VPC, subnets (×6), IGW, route tables
    ├── nat/             # fck-nat instance + SG + ENI
    ├── alb/             # ALB, SGs, target group, listeners, ACM cert
    ├── compute/         # EC2 IAM, launch template, ASG, scaling policy
    ├── ecr/             # container registry
    └── cicd/            # GitHub Actions OIDC + deploy role
```

## Shape

- VPC `10.20.0.0/16`, two AZs (`af-south-1a`, `af-south-1b`)
- 2 public subnets (ALB + fck-nat + IGW)
- 2 private-app subnets (EC2 app tier, routes to fck-nat for egress)
- 2 private-data subnets (Week 4 RDS, no default route, fully isolated)
- fck-nat on `t4g.nano` in `af-south-1a` for private-tier egress
- ALB: `:80` → 301 → HTTPS `:443` (ACM cert for `api.agroconnect.space`) → target group `/health` on port 8000
- Launch Template: Ubuntu 24.04, `t3.micro`, IMDSv2, SSM-managed (no SSH keys)
- ASG: min 1, max 3, desired 1, rolling instance refresh
- Scaling: target-tracking policy on `ALBRequestCountPerTarget` @ 500 req/min/target (scales 1→3 under load, back to 1 when quiet). Request-count fits an IO-bound API better than CPU — a slow DB call blocks a worker without burning CPU.
- ECR repo `agroconnect-dev-backend`
- IAM OIDC provider + role for GitHub Actions (no long-lived keys)

## First-time bring-up

```bash
cd infra
terraform init
terraform plan
terraform apply       # ~29 resources
```

Costs (af-south-1 list): fck-nat `t4g.nano` (~\$3/mo), ALB (~\$19/mo), 2x
`t3.micro` (free tier covers one), ECR storage pennies. Total ~\$32/mo before
Week 4 RDS. Public IPv4s bill at \$0.005/hr each — the fck-nat ENI carries one
auto-assigned address (no Elastic IP).

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

- Single `fck-nat` instance in `af-south-1a`, no HA. If it or its AZ fails,
  egress breaks until recovery. Mitigation path: wrap it in a 1-instance ASG for
  ~2-min MTTR, upgrade to per-AZ fck-nat (~\$6/mo), or revert to Managed NAT
  Gateway (~\$32/mo) when traffic justifies.
- Data subnets are provisioned but empty — RDS lands in Week 4. The data route
  table has no default route, so the DB tier is internet-isolated by
  construction.
- `:latest` image tag + instance refresh — no fast rollback. Switch to immutable
  SHA tags + an SSM parameter pointing at the current one when needed.
- HTTPS terminates at the ALB (ACM cert for `api.agroconnect.space`); the `api`
  record and the cert's DNS validation CNAME live at Hostinger, outside Terraform.
- Instance role has broad ECR read; narrow to the specific repo ARN later.
