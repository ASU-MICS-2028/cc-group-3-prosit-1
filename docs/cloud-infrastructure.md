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
│           └── Egress: Routed through fck-nat ENI                      │
│                                                                        │
│   [Private Data Subnets (af-south-1a & af-south-1b)]                   │
│     └── PostgreSQL / Amazon RDS (Completely isolated, no internet route│
└────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles
1. **Empirical Performance:** Provisioned in `af-south-1` based on empirical network testing from Ghana demonstrating a **74 ms median application RTT** (36% faster than European options).
2. **Aggressive Cost Optimization:** Standard AWS Managed NAT Gateways (~$32/mo) are replaced with an ARM64 `fck-nat` instance on `t4g.nano` (~$3/mo), cutting NAT overhead by over 90%.
3. **Strict Subnet Tiering:** Public, private application, and private data subnets are isolated into distinct network segments. Application servers have zero public IPs.
4. **Zero SSH / Session Manager Administration:** Administrative port 22 is completely closed. Shell access is conducted solely via AWS Systems Manager (SSM) Session Manager with IMDSv2 mandated.
5. **Modular Decoupling:** Infrastructure is split into 7 cohesive modules under `infra/modules/`. Root `main.tf` acts as a thin orchestrator.

---

## 2. Network Topology & Subnet Allocation

The Virtual Private Cloud (VPC) spans two Availability Zones (`af-south-1a` and `af-south-1b`):

| Subnet Tier | Zone | CIDR Block | Route Destination (`0.0.0.0/0`) | Purpose |
|---|---|---|---|---|
| **Public A** | `af-south-1a` | `10.20.1.0/24` | Internet Gateway (`igw`) | ALB Node A, `fck-nat` ENI |
| **Public B** | `af-south-1b` | `10.20.2.0/24` | Internet Gateway (`igw`) | ALB Node B |
| **Private App A** | `af-south-1a` | `10.20.11.0/24` | `fck-nat` ENI (`eni-xxx`) | ASG EC2 Worker Instances |
| **Private App B** | `af-south-1b` | `10.20.12.0/24` | `fck-nat` ENI (`eni-xxx`) | ASG EC2 Worker Instances |
| **Private Data A** | `af-south-1a` | `10.20.21.0/24` | *None (Local only)* | RDS PostgreSQL (Primary) |
| **Private Data B** | `af-south-1b` | `10.20.22.0/24` | *None (Local only)* | RDS PostgreSQL (Standby) |

---

## 3. Modular Terraform Architecture (`infra/modules/`)

The infrastructure codebase is organized into seven specialized modules:

```
infra/
├── main.tf                    # Root orchestrator (provider configuration & module calls)
├── variables.tf               # Environment variables, CIDRs & domain declarations
├── outputs.tf                 # Exported endpoints, ARNs, and connection strings
├── migrate-state.sh           # State migration helper for zero-downtime refactors
└── modules/
    ├── network/               # VPC, 6 subnets across 2 AZs, IGW, routing tables
    ├── nat/                   # fck-nat ARM64 instance, ENI, and security group
    ├── alb/                   # ALB, ACM certificate, HTTP :80 -> HTTPS :443 redirect
    ├── compute/               # IAM roles, Launch Template, ASG, target-tracking policy
    ├── ecr/                   # Container registry with lifecycle management
    ├── cicd/                  # GitHub Actions IAM OIDC provider & deploy role
    └── frontend/              # AWS Amplify Hosting in eu-west-1 (app.agroconnect.space)
```

### Module Breakdown

#### 1. `modules/network`
* Provisions VPC `10.20.0.0/16`, Internet Gateway, and 6 subnets.
* Configures separate route tables for public, app, and data tiers.
* App tier route tables route `0.0.0.0/0` outbound traffic through the `fck-nat` Elastic Network Interface (ENI).

#### 2. `modules/nat` (`fck-nat`)
* Provisions a lightweight ARM64 EC2 instance (`t4g.nano`) running the [`fck-nat`](https://github.com/nathanpeck/fck-nat) AMI.
* Uses an explicit ENI attached to `public_subnet_ids[0]` with `source_dest_check = false`.
* Provides outbound internet access (ECR image pulls, OS package updates) for private instances at $3/month instead of $32/month.

#### 3. `modules/alb`
* Deploys an Application Load Balancer across public subnets.
* Requests and validates a free AWS Certificate Manager (ACM) TLS certificate for `api.agroconnect.space`.
* Enforces HTTP `:80` redirect to HTTPS `:443`.
* Directs HTTPS traffic to target group on port `8000` probing `/health`.

#### 4. `modules/compute`
* Defines an EC2 Launch Template running Ubuntu 24.04 LTS on `t3.micro`.
* Attaches the `AmazonSSMManagedInstanceCore` IAM policy.
* Configures **Auto Scaling Group** with capacity `min = 1, desired = 1, max = 3`.
* Attaches a target-tracking scaling policy on **`ALBRequestCountPerTarget`** tuned to `500 req/min/target` (~8 req/s/instance).
* Automatically replaces unhealthy nodes based on ALB health checks.

#### 5. `modules/ecr`
* Deploys a private container registry (`agroconnect-dev-backend`).
* Configures automated vulnerability image scanning on push.

#### 6. `modules/cicd`
* Establishes an AWS IAM OpenID Connect (OIDC) identity provider for GitHub Actions (`token.actions.githubusercontent.com`).
* Grants short-lived role assumption (`sts:AssumeRoleWithWebIdentity`) strictly scoped to `repo:ASU-MICS-2028/cc-group-3-prosit-1:*`.

#### 7. `modules/frontend`
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
* **IMDSv2 Enforced:** Instance metadata is configured with `http_tokens = "required"` and `http_put_response_hop_limit = 1`, blocking SSRF-based credential theft.

---

## 5. Cost Breakdown & Economics

AgroConnect is architected to operate well within student and smallholder agricultural project budgets:

| Component | AWS Resource | Monthly Cost (af-south-1) |
|---|---|---|
| Outbound NAT | `fck-nat` on `t4g.nano` (ARM64) | ~\$3.10 |
| Application Load Balancer | AWS ALB (720 hrs + LCU) | ~\$19.20 |
| Compute (App Tier) | 1× `t3.micro` EC2 (Free-Tier eligible) | ~\$0.00 – \$10.40 |
| Frontend Hosting | AWS Amplify Hosting (`eu-west-1`) | ~\$0.15 (Build & hosting pennies) |
| Container Registry | Amazon ECR (<1 GB storage) | ~\$0.10 |
| Public IPv4 Address | 1× In-use public IPv4 on NAT ENI (\$0.005/hr) | ~\$3.60 |
| **Total Baseline Cost** | | **~\$26.00 – \$36.50 / month** |

*Cost Protection:* AWS Budgets is configured with an aggressive **\$5 spending threshold anomaly alert**.

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

