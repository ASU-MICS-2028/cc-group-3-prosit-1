# Cloud Infrastructure Specification — AWS & Terraform IaC

**Lead:** Eugene Sewor ([@eugene-sew](https://github.com/eugene-sew))  
**Primary Region:** AWS `af-south-1` (Cape Town, South Africa)  
**Edge / Frontend Region:** AWS `eu-west-1` (Dublin, Ireland — Amplify Hosting)  
**Infrastructure Code:** [`infra/`](../infra/)  
**Associated Architectural Records:** [ADR-001 (Region)](./architecture-decisions.md#adr-001-cloud-provider--target-region-selection), [ADR-004 (fck-nat & Subnets)](./architecture-decisions.md#adr-004-three-tier-subnet-segmentation-with-cost-optimized-nat), [ADR-006 (ACM HTTPS)](./architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-007 (Modularization)](./architecture-decisions.md#adr-007-terraform-modularization), [ADR-008 (Request Scaling)](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget), [ADR-009 (Amplify Region)](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)

---

## 1. Architectural Overview & Design Philosophy

AgroConnect Ghana runs a dual-AZ, highly available cloud infrastructure managed 100% declaratively through HashiCorp Terraform (`>= 1.6`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AWS Cloud — af-south-1 (Cape Town)                │
│                                                                        │
│   VPC: 10.20.0.0/16                                                    │
│                                                                        │
│   [Public Subnets (af-south-1a & af-south-1b)]                         │
│     ├── Internet Gateway (IGW)                                         │
│     ├── Application Load Balancer (ALB) — ACM TLS (:443)               │
│     └── fck-nat (t4g.nano) — ARM64 NAT Instance                        │
│                                                                        │
│   [Private App Subnets (af-south-1a & af-south-1b)]                    │
│     └── Auto Scaling Group (min 1, des 1, max 3)                      │
│           ├── Target-Tracking: 500 req/min/target                      │
│           ├── Launch Template: Ubuntu 24.04, t3.micro, IMDSv2          │
│           ├── Logging: Docker awslogs driver ─> CloudWatch Logs        │
│           └── Egress: Routed through fck-nat ENI                      │
│                                                                        │
│   [Private Data Subnets (af-south-1a & af-south-1b)]                   │
│     └── PostgreSQL / Amazon RDS (db.t4g.micro, isolated, no IGW route)│
│                                                                        │
│   [Storage & Security & Observability (Regional Services)]             │
│     ├── Amazon S3: Media Bucket (agroconnect-media-*, encrypted)       │
│     ├── AWS Secrets Manager: DB master creds & Arkesel SMS key         │
│     ├── CloudWatch Logs: /agroconnect-dev/app log group                │
│     ├── CloudWatch Alarms: ALB (5xx, latency, health), ASG, RDS, EC2   │
│     ├── SNS Topic: agroconnect-dev-alarms (fan-out email alerts)       │
│     ├── CloudWatch Dashboard: agroconnect-dev-operational              │
│     └── AWS Budgets: $10/mo guardrail (80% forecast, 100% actual)      │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles
1. **Empirical Performance:** Provisioned in `af-south-1` based on empirical network testing from Ghana demonstrating a **74 ms median application RTT** (36% faster than European options).
2. **Aggressive Cost Optimization:** Standard AWS Managed NAT Gateways (~$32/mo) are replaced with an ARM64 `fck-nat` instance on `t4g.nano` (~$3/mo), cutting NAT overhead by over 90%.
3. **Strict Subnet Tiering:** Public, private application, and private data subnets are isolated into distinct network segments. Application servers have zero public IPs.
4. **Zero SSH / Session Manager Administration:** Administrative port 22 is completely closed. Shell access is conducted solely via AWS Systems Manager (SSM) Session Manager with IMDSv2 mandated.
5. **Modular Decoupling:** Infrastructure is split into 11 cohesive modules under `infra/modules/`. Root `main.tf` acts as a thin orchestrator.
6. **Centralized Observability & Automated Alerting:** Full operational visibility through CloudWatch metrics, dashboards, and automated SNS email dispatches for host degradation, 5xx spikes, or budget overages.
7. **Remote State with Native S3 Locking:** State stored securely in Amazon S3 using Terraform 1.10+ native lockfiles (`use_lockfile = true`), completely eliminating external DynamoDB dependencies.

---

## 2. Network Topology & Subnet Allocation

The Virtual Private Cloud (VPC) spans two Availability Zones (`af-south-1a` and `af-south-1b`):

| Subnet Tier | Zone | CIDR Block | Route Destination (`0.0.0.0/0`) | Purpose |
|---|---|---|---|---|
| **Public A** | `af-south-1a` | `10.20.1.0/24` | Internet Gateway (`igw`) | ALB Node A, `fck-nat` ENI |
| **Public B** | `af-south-1b` | `10.20.2.0/24` | Internet Gateway (`igw`) | ALB Node B |
| **Private App A** | `af-south-1a` | `10.20.11.0/24` | `fck-nat` ENI (`eni-xxx`) | ASG EC2 Worker Instances |
| **Private App B** | `af-south-1b` | `10.20.12.0/24` | `fck-nat` ENI (`eni-xxx`) | ASG EC2 Worker Instances |
| **Private Data A** | `af-south-1a` | `10.20.21.0/24` | *None (Local only)* | RDS PostgreSQL (single-AZ instance) |
| **Private Data B** | `af-south-1b` | `10.20.22.0/24` | *None (Local only)* | RDS subnet group only (a Multi-AZ standby would go here) |

---

## 3. Modular Terraform Architecture (`infra/modules/`)

The infrastructure codebase is organized into 11 specialized, decoupled modules orchestrating compute, networking, persistence, security, and observability:

```
infra/
├── backend.tf                 # S3 remote state backend with native lockfile (use_lockfile = true)
├── main.tf                    # Root orchestrator (provider configuration & module calls)
├── variables.tf               # Environment variables, CIDRs & domain declarations
├── outputs.tf                 # Exported endpoints, ARNs, and connection strings
├── migrate-state.sh           # State migration helper for zero-downtime refactors
├── bootstrap/                 # Decoupled root provisioning S3 remote state bucket
└── modules/
    ├── network/               # VPC, 6 subnets across 2 AZs, IGW, routing tables
    ├── nat/                   # fck-nat ARM64 instance, ENI, and security group
    ├── alb/                   # ALB, ACM certificate, HTTP :80 -> HTTPS :443 redirect
    ├── compute/               # EC2 IAM, Launch Template, ASG, awslogs driver, scaling policy
    ├── ecr/                   # Container registry with lifecycle management
    ├── database/              # RDS PostgreSQL 16 on db.t4g.micro in isolated data subnets
    ├── storage/               # S3 media bucket with AES256, versioning, and multipart lifecycle
    ├── secrets/               # AWS Secrets Manager container for Arkesel SMS API credentials
    ├── observability/         # SNS alarms topic, CloudWatch dashboard, alarms & $10 budget
    ├── cicd/                  # GitHub Actions IAM OIDC provider & deploy role
    └── frontend/              # AWS Amplify Hosting in eu-west-1 (app.agroconnect.space)
```

### Remote State Management with Native S3 Locking
State is stored centrally in Amazon S3 (`agroconnect-tfstate-<account-id>`, key `agroconnect/dev/terraform.tfstate`) in `af-south-1`:
* **Native S3 Locking (`backend.tf`):** Uses Terraform 1.10+ native lockfile support (`use_lockfile = true`), eliminating the cost and maintenance of an external DynamoDB lock table.
* **Decoupled Bootstrap Root ([`infra/bootstrap/`](../infra/bootstrap)):** A standalone, one-time configuration provisions the state bucket with AES256 server-side encryption, bucket versioning, and public access blocks. Because the bootstrap root cannot live inside the bucket it creates, it manages its own local state.

### Module Breakdown

#### 1. `modules/network`
* Provisions VPC `10.20.0.0/16`, Internet Gateway, and 6 subnets across two AZs (`af-south-1a` and `af-south-1b`).
* Configures separate route tables for public, app, and data tiers.
* App tier route tables route `0.0.0.0/0` outbound traffic through the `fck-nat` Elastic Network Interface (ENI).

#### 2. `modules/nat` (`fck-nat`)
* Provisions a lightweight ARM64 EC2 instance (`t4g.nano`) running the [`fck-nat`](https://github.com/nathanpeck/fck-nat) AMI.
* Uses an explicit ENI attached to `public_subnet_ids[0]` with `source_dest_check = false`.
* Provides outbound internet access (ECR image pulls, OS package updates, outbound API calls) for private instances at $3/month instead of $32/month.

#### 3. `modules/alb`
* Deploys an Application Load Balancer across public subnets.
* Requests and validates a free AWS Certificate Manager (ACM) TLS certificate for `api.agroconnect.space`.
* Enforces HTTP `:80` redirect to HTTPS `:443`.
* Directs HTTPS traffic to target group on port `8000` probing `/health` every 15 seconds.

#### 4. `modules/compute`
* Defines an EC2 Launch Template running Ubuntu 24.04 LTS on `t3.micro` with IMDSv2 mandated.
* Configures Docker with native **`awslogs` driver**, shipping container stdout/stderr directly to CloudWatch Logs group `/${var.name_prefix}/app` with log streams named after the EC2 `INSTANCE_ID`.
* Provisions dynamic credentials via EC2 user-data: retrieves DB master credentials from Secrets Manager to build `DATABASE_URL`, injects `PHOTO_BUCKET`, and passes `SMS_SECRET_ARN`.
* Attaches IAM policies: `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`, S3 media bucket read/write, Secrets Manager read access, and CloudWatch Logs write access.
* Configures **Auto Scaling Group** with capacity `min = 1, desired = 1, max = 3`.
* Attaches a target-tracking scaling policy on **`ALBRequestCountPerTarget`** tuned to `500 req/min/target` (~8 req/s/instance).

#### 5. `modules/ecr`
* Deploys a private container registry (`agroconnect-dev-backend`).
* Configures automated vulnerability image scanning on push.

#### 6. `modules/database` (Amazon RDS)
* Deploys **PostgreSQL 16** on a `db.t4g.micro` ARM64 Graviton instance in the isolated private data subnets.
* Configures 20 GB `gp3` storage with storage autoscaling up to 100 GB.
* Enforces storage encryption via AWS KMS and automated daily backups with a 7-day retention period.
* Master credentials managed securely via AWS Secrets Manager with automatic credential rotation support.
* Ingress is restricted via `data-sg` to accept port 5432 exclusively from `app-sg`.

#### 7. `modules/storage` (Amazon S3 Media Bucket)
* Provisions `agroconnect-media-<account-id>` for offloading farmer identification photos and field verification media.
* Enforces AES256 server-side encryption and bucket versioning.
* Blocks all public access (4/4 S3 block public access settings enabled).
* Implements a lifecycle rule automatically aborting incomplete multipart uploads after 7 days.

#### 8. `modules/secrets` (AWS Secrets Manager)
* Manages sensitive third-party integration secrets, including Arkesel SMS API credentials (`agroconnect/dev/arkesel`), populated out-of-band.
* Grants least-privilege read access strictly to the EC2 application instance role.

#### 9. `modules/observability` (CloudWatch & Alerts)
* **SNS Alarms Topic:** Provisions `agroconnect-dev-alarms` with automated email fan-out subscriptions.
* **ALB Metric Alarms:**
  * `alb_unhealthy_hosts`: Alerts if $\ge 1$ target is unhealthy for 10 minutes.
  * `alb_5xx_rate`: Alerts if target returns $> 10$ HTTP 5xx responses in a 5-minute window.
  * `alb_latency_p95`: Alerts if p95 response time exceeds 2 seconds for 10 minutes.
* **RDS Metric Alarms:**
  * `rds_freeable_memory`: Alerts when freeable memory dips below 100 MB on the `db.t4g.micro` (1 GB total).
  * `rds_free_storage`: Alerts when free storage space falls below 2 GB.
  * `rds_cpu`: Alerts if sustained CPU exceeds 80% for 10 minutes.
* **EC2 Host Alarms:**
  * `nat_status_check`: Alerts on `fck-nat` system status check failures (private egress failure).
  * `asg_status_check`: Alerts if any ASG EC2 instance fails host checks.
* **Operational Dashboard:** Provisions CloudWatch Dashboard `agroconnect-dev-operational` visualizing ALB request volume, latency, HTTP status codes, EC2 CPU, ASG capacity, RDS memory/connections/IOPS, and live container logs.
* **Monthly Budget Guardrail:** Provisions an AWS Budget ($10/month) with dual alerts: a warning at 80% forecasted spend and a critical alert at 100% actual spend dispatched to SNS and email.

#### 10. `modules/cicd`
* Establishes an AWS IAM OpenID Connect (OIDC) identity provider for GitHub Actions (`token.actions.githubusercontent.com`).
* Grants short-lived role assumption (`sts:AssumeRoleWithWebIdentity`) strictly scoped to `repo:ASU-MICS-2028/cc-group-3-prosit-1:*`.

#### 11. `modules/frontend`
* Deploys the Progressive Web App to **AWS Amplify Hosting** in `eu-west-1` via provider alias.
* Connects repository branch `main` with build specification from `amplify.yml`.
* Manages custom domain association for `app.agroconnect.space` with auto-renewing TLS certificates.

---

## 4. Multi-Tier Security Group Isolation

Security groups are chained hierarchically so that each tier only accepts traffic from its preceding layer:

```
[Public Internet]
       │
       ▼ (Port 443 / HTTPS)
[alb-sg] (Application Load Balancer)
       │
       ▼ (Port 8000 / HTTP)
[app-sg] (EC2 Auto Scaling Group)
       │
       ▼ (Port 5432 / PostgreSQL)
[data-sg] (RDS PostgreSQL Database)
```

* **No Open Port 22:** Ingress on port 22 is completely blocked. Shell access requires authenticated SSM sessions logged in AWS CloudTrail.
* **IMDSv2 Enforced:** Instance metadata requires session tokens (`http_tokens = "required"`), which blocks the classic SSRF credential theft that IMDSv1 allowed. `http_put_response_hop_limit = 2` lets the token reach the app's Docker container, one hop beyond the instance, so the AWS SDK inside it can use the instance role for S3 and Secrets Manager.

---

## 5. Cost Breakdown & Economics

AgroConnect is architected to operate well within student and smallholder agricultural project budgets:

| Component | AWS Resource | Monthly Cost (af-south-1) |
|---|---|---|
| Outbound NAT | `fck-nat` on `t4g.nano` (ARM64) | ~\$3.10 |
| Application Load Balancer | AWS ALB (720 hrs + LCU) | ~\$19.20 |
| Compute (App Tier) | 1× `t3.micro` EC2 (Free-Tier eligible) | ~\$0.00 – \$10.40 |
| Database Tier | RDS PostgreSQL 16 on `db.t4g.micro` (Free-Tier eligible) | ~\$0.00 – \$13.50 |
| Media Storage | Amazon S3 Standard + requests (<10 GB) | ~\$0.25 |
| Secrets Management | AWS Secrets Manager (2 secrets) | ~\$0.80 |
| Observability & Alarms | CloudWatch (Dashboard, Alarms, Logs) + SNS | ~\$3.50 |
| Frontend Hosting | AWS Amplify Hosting (`eu-west-1`) | ~\$0.15 (Build & hosting pennies) |
| Container Registry | Amazon ECR (<1 GB storage) | ~\$0.10 |
| Public IPv4 Address | 1× In-use public IPv4 on NAT ENI (\$0.005/hr) | ~\$3.60 |
| **Total Baseline Cost** | | **~\$27.00 – \$51.60 / month** |

*Cost Protection:* AWS Budgets is configured with a strict **\$10/month guardrail** (`agroconnect-dev-monthly-budget`) triggering automated warning emails at 80% forecasted spend and critical alerts at 100% actual spend via Amazon SNS.

---

## 6. Terraform Execution Workflow

```bash
cd infra

# Initialize providers and modules
terraform init

# Validate syntax and configuration
terraform validate

# Inspect execution plan
terraform plan

# Provision cloud resources
terraform apply
```

