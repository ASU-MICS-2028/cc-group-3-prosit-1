# AgroConnect Infrastructure

Terraform-managed infra in `af-south-1`. Root is a thin orchestrator; each concern
lives in its own module under `modules/`.

## Layout

```
infra/
├── backend.tf           # S3 remote state (bucket + native lockfile)
├── main.tf              # providers, locals, module wiring
├── variables.tf         # root inputs
├── outputs.tf           # pulls from module outputs
├── bootstrap/           # one-time: creates the state bucket (own local state)
└── modules/
    ├── network/         # VPC, subnets (×6), IGW, route tables
    ├── nat/             # fck-nat instance + SG + ENI
    ├── alb/             # ALB, SGs, target group, listeners, ACM cert
    ├── compute/         # EC2 IAM, launch template, ASG, scaling policy
    ├── ecr/             # container registry
    ├── database/        # RDS Postgres in the isolated data subnets
    ├── storage/         # S3 media bucket + lifecycle
    ├── secrets/         # app secrets (Arkesel SMS); values set out-of-band
    ├── observability/   # SNS alarms, CloudWatch dashboard, AWS Budgets
    ├── cicd/            # GitHub Actions OIDC + deploy role
    └── frontend/        # AWS Amplify Hosting in eu-west-1 (app.agroconnect.space)
```

## Remote state

State lives in S3 (`agroconnect-tfstate-<account-id>`, key
`agroconnect/dev/terraform.tfstate`) with a **native lockfile** — no local
state, no DynamoDB.

The bucket is created once by `infra/bootstrap/`, which is kept separate
because it can't live in the state it stores:

```bash
cd infra/bootstrap && terraform init && terraform apply
cd .. && terraform init          # picks up backend.tf
```

The bootstrap root keeps its own local state (gitignored); if that is lost, the
bucket can be re-adopted with `terraform import`. After any change to the
`backend` block, run `terraform init -migrate-state`.


## Shape

- VPC `10.20.0.0/16`, two AZs (`af-south-1a`, `af-south-1b`)
- 2 public subnets (ALB + fck-nat + IGW)
- 2 private-app subnets (EC2 app tier, routes to fck-nat for egress)
- 2 private-data subnets (RDS Postgres, no default route, fully isolated)
- fck-nat on `t4g.nano` in `af-south-1a` for private-tier egress
- ALB: `:80` → 301 → HTTPS `:443` (ACM cert for `api.agroconnect.space`) → target group `/health` on port 8000
- Launch Template: Ubuntu 24.04, `t3.micro`, IMDSv2, SSM-managed (no SSH keys)
- ASG: min 1, max 3, desired 1, rolling instance refresh
- Scaling: target-tracking policy on `ALBRequestCountPerTarget` @ 500 req/min/target (scales 1→3 under load, back to 1 when quiet). Request-count fits an IO-bound API better than CPU — a slow DB call blocks a worker without burning CPU.
- ECR repo `agroconnect-dev-backend`
- IAM OIDC provider + role for GitHub Actions (no long-lived keys)
- Frontend: AWS Amplify Hosting in `eu-west-1` via provider alias, custom domain `app.agroconnect.space` with auto-managed TLS (ADR-009)

## First-time bring-up

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Costs (af-south-1 list): fck-nat `t4g.nano` (~\$3/mo), ALB (~\$19/mo), 2x
`t3.micro` (free tier covers one), ECR storage pennies, plus RDS `db.t4g.micro`
and its storage, Secrets Manager (\$0.40 per secret per month, five secrets) and
CloudWatch. Public IPv4s bill at \$0.005/hr each — the fck-nat ENI carries one
auto-assigned address (no Elastic IP).

## After apply

```bash
terraform output
# alb_dns, ecr_repo_url, asg_name, gha_role_arn
```

Set the GitHub repo secret: `AWS_DEPLOY_ROLE_ARN` = `gha_role_arn` output.
Set `github_repo` in `variables.tf` (or a `terraform.tfvars`) to the real repo
before applying — the OIDC trust condition is pinned to it.

### Secret values (once, out-of-band)

Terraform creates the secret containers empty, so values never enter git or
state. `terraform output app_secret_names` lists them. The API starts without
them (a throwaway signing key, simulated payments, SMS refused), so set them,
then refresh the instances so they pick the values up:

```bash
R=af-south-1
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/jwt.pem
aws secretsmanager put-secret-value --region $R --secret-id agroconnect-dev-jwt-signing-key \
  --secret-string "$(jq -n --rawfile k /tmp/jwt.pem '{private_key_pem: $k}')" && rm /tmp/jwt.pem
aws secretsmanager put-secret-value --region $R --secret-id agroconnect-dev-arkesel-sms \
  --secret-string '{"api_key":"<ARKESEL_API_KEY>","sender_id":"<SENDER_ID>"}'
aws secretsmanager put-secret-value --region $R --secret-id agroconnect-dev-votex365 \
  --secret-string '{"api_key":"vxp_test_…","webhook_secret":"whsec_…"}'
aws secretsmanager put-secret-value --region $R --secret-id agroconnect-dev-admin-seed \
  --secret-string '{"login_id":"ADM-002","name":"…","phone":"+233…","password":"<12+ chars>"}'
aws autoscaling start-instance-refresh --region $R --auto-scaling-group-name agroconnect-dev-asg \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}'
```

In the votex365 dashboard (Developers, test mode) set the webhook URL to
`https://api.agroconnect.space/webhooks/votex365`.

`auth_test_mode` and `seed_demo_accounts` (both default `false`) go in
`terraform.tfvars`. The demo accounts have public passwords: turn them off
before real data.

## Rollback

The deployed image tag lives in SSM at `/agroconnect-dev/app-image-tag`. CI
pins it to the merge commit's SHA on every deploy, and instances pull
`:<sha>` — never the mutable `:latest`. So a rollback is two commands:

```bash
# 1. Point the parameter at the last good SHA.
aws ssm put-parameter --name /agroconnect-dev/app-image-tag \
  --value <previous-sha> --type String --overwrite \
  --region af-south-1 --profile ashesi-dev

# 2. Roll the fleet onto it.
aws autoscaling start-instance-refresh --auto-scaling-group-name agroconnect-dev-asg \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}' \
  --region af-south-1 --profile ashesi-dev
```

List available tags with
`aws ecr list-images --repository-name agroconnect-dev-backend --region af-south-1`.

## Teardown

```bash
terraform destroy
```

## Known shortcuts (technical debt)

- Single `fck-nat` instance in `af-south-1a`, no HA. If it or its AZ fails,
  egress breaks until recovery. Mitigation path: wrap it in a 1-instance ASG for
  ~2-min MTTR, upgrade to per-AZ fck-nat (~\$6/mo), or revert to Managed NAT
  Gateway (~\$32/mo) when traffic justifies.
- RDS is single-AZ with no final snapshot and no deletion protection (lab
  settings, see `modules/database`). Flip `multi_az`, `skip_final_snapshot` and
  `deletion_protection` before any real data. The data route table has no
  default route, so the DB tier is internet-isolated by construction.
- `:latest` image tag + instance refresh — no fast rollback. Switch to immutable
  SHA tags + an SSM parameter pointing at the current one when needed.
- HTTPS terminates at the ALB (ACM cert for `api.agroconnect.space`); the `api`
  record and the cert's DNS validation CNAME live at Hostinger, outside Terraform.
- Instance role has broad ECR read; narrow to the specific repo ARN later.
