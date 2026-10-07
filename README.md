# AgroConnect Ghana — Group 3 (Highlanders)

**Course:** ICS 534 Cloud Computing | **Milestone:** PROSIT 1  
**Target Region:** AWS `af-south-1` (Cape Town) | **Domain:** [`api.agroconnect.space`](https://api.agroconnect.space)

AgroConnect Ghana is an offline-first agricultural profiling and registration platform designed for field extension agents operating in rural communities across Ghana where cellular connectivity is intermittent or unavailable.

---

## Documentation Hub (`docs/`)

Comprehensive system documentation is maintained inside the [`docs/`](./docs) folder:

| Document | Description |
|---|---|
| [**Documentation Index**](./docs/README.md) | Navigation index and high-level project summary |
| [**1. System Overview**](./docs/system-overview.md) | Operational context, high-level topology & Well-Architected Framework alignment |
| [**2. Architecture Decisions (ADRs)**](./docs/architecture-decisions.md) | Formal records: ADR-001 through ADR-005 |
| [**3. Empirical Research & Benchmarks**](./docs/empirical-research.md) | Network latency testing from Ghana & cloud provider comparison matrix |
| [**4. Client Tier (PWA)**](./docs/client-tier.md) | Offline-first architecture, Dexie IndexedDB, sync queue & hardware hooks |
| [**5. API Tier**](./docs/api-tier.md) | Containerized FastAPI `farmer-profile-service`, endpoints & health probes |
| [**6. Data Tier**](./docs/data-tier.md) | PostgreSQL relational schema (`db/schema.sql`) & S3 media offloading |
| [**7. Cloud Infrastructure**](./docs/cloud-infrastructure.md) | Terraform AWS `af-south-1` VPC, `fck-nat` cost optimization, ALB TLS & ASG |
| [**8. CI/CD & Operations**](./docs/ci-cd-and-operations.md) | GitHub Actions OIDC deployment, ASG rolling refresh & team IAM governance |

---

## Architecture Overview

The system is architected as an offline-first client syncing with a highly available, dual-AZ cloud runtime on AWS, automated via GitOps CI/CD.

![AgroConnect Architecture v2](./AgroConnect%20Architecture%20v2.png)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Client Tier (Offline-First PWA)                   │
│   Service Worker Cache • IndexedDB (Dexie) • Client UUIDs • GPS • Camera│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS :443 (api.agroconnect.space)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AWS Cloud — af-south-1 (Cape Town)                   │
│                                                                         │
│   [Public Subnets (10.20.1.0/24, 10.20.2.0/24)]                         │
│     ├── Internet Gateway (IGW)                                          │
│     ├── Application Load Balancer (ALB) — ACM TLS Termination           │
│     └── fck-nat (t4g.nano) — Cost-optimized outbound NAT gateway       │
│                                                                         │
│   [Private App Subnets (10.20.11.0/24, 10.20.12.0/24)]                 │
│     └── Auto Scaling Group (min 1, des 2, max 2)                       │
│           └── EC2 (t3.micro) + Docker running FastAPI :8000             │
│                                                                         │
│   [Private Data Subnets (10.20.21.0/24, 10.20.22.0/24)] (Week 4)        │
│     └── PostgreSQL / Amazon RDS (Isolated — no default internet route)  │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│                    CI/CD & GitOps Automation (GitHub)                   │
│   PR: Smoke Test + Terraform Validate                                   │
│   Push to main: AWS IAM OIDC Auth ➔ ECR Push ➔ ASG Instance Refresh     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Regional Strategy & Empirical Benchmarks

The deployment region was selected through empirical network latency testing conducted from Ghana:

| Cloud Provider | Region | Location | Median TCP (ms) | Median Request RTT (ms) | Notes |
|---|---|---|---|---|---|
| **AWS** | **`af-south-1`** | **Cape Town** | **133 ms** | **74 ms** | **Selected primary region (lowest RTT)** |
| AWS | `eu-south-2` | Spain | 120 ms | 112 ms | Low TCP handshake, higher RTT |
| AWS | `eu-west-2` | London | 125 ms | 117 ms | European alternative (+43 ms RTT) |
| AWS | `us-east-1` | N. Virginia | 255 ms | 175 ms | High round-trip penalty |
| Azure | `southafricanorth` | Johannesburg | 103 ms | 129 ms | Higher app RTT than AWS af-south-1 |
| GCP | `europe-west9` | Paris | 118 ms | 127 ms | Good European performance |

*Full analysis & dataset:* See [`docs/empirical-research.md`](./docs/empirical-research.md) and [`labs/Cloud Platform Regions Latency Investigation.xlsx`](/Users/josetseph/Library/CloudStorage/GoogleDrive-joseph.etse@ashesi.edu.gh/My%20Drive/CC%20Group%203%20Highlanders/Prosits/1/labs/Cloud%20Platform%20Regions%20Latency%20Investigation.xlsx).

---

## System Subsystems & Directory Structure

Each tier is decoupled and maintained in its respective subdirectory:

```
.
├── docs/                   # Detailed system documentation dossier
├── frontend/               # Offline-first Progressive Web App (PWA)
├── backend/                # Containerized FastAPI farmer-profile-service
├── db/                     # Relational schema & migration scripts
├── infra/                  # Terraform IaC for AWS af-south-1
├── scripts/                # Administrative & IAM onboarding scripts
├── .github/                # Workflows (CI/CD) and CODEOWNERS
├── CONTRIBUTING.md         # GitOps branch & contribution guidelines
└── AgroConnect Architecture v2.png # System architecture diagram
```

### 1. Client Tier — Offline-First PWA ([`frontend/`](./frontend))
* **Primary Principle:** *The app never waits for the network.*
* **Local Storage:** Utilizes browser **IndexedDB** wrapped with **Dexie** across three isolated tables (`drafts`, `farmers`, `photos`). Unsaved forms autosave every 300 ms.
* **Client-Side UUIDs:** Every profile generates a client UUID (`clientId`) upon initiation, allowing idempotent retries against the backend without duplicate record creation.
* **Hardware Resilience:**
  * In-browser photo compression reducing camera captures to `<100 KB` via HTML Canvas before queueing.
  * Direct satellite GPS polling (independent of cellular network coverage).
* **Localization:** Custom font subsets (Onest, Unbounded) supporting local Ghanaian character sets (`Ɛɛ`, `Ɔɔ`, `Ŋŋ`, `Đɖ`, `Ƒƒ`, `Ɣɣ`, `Ʋʋ`, `Ʒʒ`) and currency formatting (`₵`).
* *Details & specifications:* See [`docs/client-tier.md`](./docs/client-tier.md) and [`frontend/README.md`](./frontend/README.md).

### 2. Application & API Tier ([`backend/`](./backend))
* **Service:** `farmer-profile-service` implemented in Python with **FastAPI**.
* **Containerization:** Packaged with Docker ([`backend/Dockerfile`](./backend/Dockerfile)), bound to port `8000`.
* **API Endpoints:**
  * `GET /` — Service metadata and OpenAPI discovery
  * `GET /health` — Liveness probe queried every 15s by the AWS ALB
  * `POST /farmers` — Idempotent profile registration
  * `GET /farmers/{farmer_id}` — Profile retrieval
* *Details & run instructions:* See [`docs/api-tier.md`](./docs/api-tier.md) and [`backend/README.md`](./backend/README.md).

### 3. Database Tier ([`db/`](./db))
* **Engine:** PostgreSQL relational model designed for Week 4 Amazon RDS deployment.
* **Schema ([`db/schema.sql`](./db/schema.sql)):**
  * `farmers`: Unique phone constraint (`phone UNIQUE`), personal details, language preference, timestamps.
  * `farms`: Parcel plots per farmer (`farmer_id REFERENCES farmers(id) ON DELETE CASCADE`), soil types, hectare sizing.
  * `farm_crops`: Many-to-one crop allocations per farm plot.
  * `farm_media`: S3 object keys and metadata for farm images (keeping relational tables lightweight).
* *Details:* See [`docs/data-tier.md`](./docs/data-tier.md).

### 4. Cloud Infrastructure as Code ([`infra/`](./infra))
* **Orchestration:** HashiCorp Terraform (`>= 1.6`).
* **VPC Networking:** Dual-AZ subnets across `af-south-1a` and `af-south-1b`:
  * Public subnets (`10.20.1.0/24`, `10.20.2.0/24`) with Internet Gateway.
  * Private application subnets (`10.20.11.0/24`, `10.20.12.0/24`).
  * Private isolated data subnets (`10.20.21.0/24`, `10.20.22.0/24`) with no public route.
* **Cost-Optimized NAT:** Replaced AWS Managed NAT Gateway (~$32/mo) with an ARM64 [`fck-nat`](https://github.com/nathanpeck/fck-nat) AMI on `t4g.nano` (~$3/mo).
* **Load Balancing & TLS:** AWS ALB with automatic HTTP :80 to HTTPS :443 redirection and ACM DNS-validated certificate for `api.agroconnect.space`.
* **Zero-SSH Administration:** Instances boot with AWS Systems Manager Core policy (`AmazonSSMManagedInstanceCore`) using IMDSv2; port 22 is completely closed.
* *Details & deployment commands:* See [`docs/cloud-infrastructure.md`](./docs/cloud-infrastructure.md) and [`infra/README.md`](./infra/README.md).

### 5. GitOps CI/CD & Deployments ([`.github/workflows/`](./.github/workflows))
* **Continuous Integration ([`ci.yml`](./.github/workflows/ci.yml)):**
  * Gated on pull requests into `main`.
  * Executes Python dependency resolution, smoke tests (`app.main`), and Terraform validation (`fmt -check`, `validate`).
* **Continuous Deployment ([`deploy.yml`](./.github/workflows/deploy.yml)):**
  * Triggered exclusively on merges to `main`.
  * Authenticates to AWS via **IAM OIDC Web Identity Federation** (no long-lived credentials stored in GitHub).
  * Builds and pushes versioned + `:latest` Docker images to Amazon ECR (`agroconnect-dev-backend`).
  * Triggers an automated rolling instance refresh (`MinHealthyPercentage: 50%`) across the Auto Scaling Group.
* *Details:* See [`docs/ci-cd-and-operations.md`](./docs/ci-cd-and-operations.md).

### 6. Operations & Team Governance ([`scripts/`](./scripts), [`CONTRIBUTING.md`](./CONTRIBUTING.md))
* **IAM Onboarding Script ([`scripts/create_team_iam.sh`](./scripts/create_team_iam.sh)):** Automated provisioning of team members with `PowerUserAccess`, strict `ForceMFA` policy enforcement, and mandatory first-login password resets.
* **Contribution Flow:** Documented in [`CONTRIBUTING.md`](./CONTRIBUTING.md). Direct commits to `main` are restricted; code ownership is enforced via [`.github/CODEOWNERS`](./.github/CODEOWNERS).

---

## AWS Well-Architected Framework Alignment

| Pillar | Architectural Implementation in AgroConnect |
|---|---|
| **Operational Excellence** | Infrastructure managed 100% via Terraform. Immutable container deployments through ECR and ASG rolling refreshes. CloudWatch metric collection and health probes on `/health`. |
| **Security** | Multi-tier security groups (`ALB -> App -> Data`). Private subnets with zero public IPs for app and database tiers. No open SSH ports (SSM Session Manager only). GitHub Actions authenticates via short-lived OIDC tokens. IAM team members protected by mandatory MFA. |
| **Reliability** | Multi-AZ deployment across `af-south-1a` and `af-south-1b`. Application Load Balancer health checks with automatic ASG replacement of unhealthy nodes. Stateless backend application design. |
| **Performance Efficiency** | Region selected via empirical latency testing (`af-south-1` @ ~74 ms median RTT). Burstable EC2 `t3.micro` instances accommodating registration bursts. Client-side IndexedDB caching and photo compression minimizing payload overhead. |
| **Cost Optimization** | Usage of `fck-nat` (`t4g.nano`) reducing NAT egress costs by ~90%. Right-sized compute with free-tier `t3.micro` credits. ASG configured with aggressive scale-in. $5 AWS Budgets anomaly alert. |
| **Sustainability** | Elimination of redundant network transfers via offline-first batch syncing. Dynamic instance scaling during off-peak hours. Planned evaluation of AWS Graviton processors for the app tier. |

*Full architectural deep-dive:* See [`docs/system-overview.md`](./docs/system-overview.md).

---

## Team

| Name | Role | GitHub Handle | Responsibility Area |
|---|---|---|---|
| **Joseph Etse** | Project Manager | [@josetseph](https://github.com/josetseph) | Overall Project Architecture & Coordination |
| **Eugene Sewor** | Cloud / DevOps Lead | [@eugene-sew](https://github.com/eugene-sew) | Terraform IaC, AWS af-south-1, CI/CD GitOps |
| **Elise Kennedy-Angbo** | Data Lead | [@Elise-Oyi](https://github.com/Elise-Oyi) | Backend Service, Database Schema & Migrations |
| **Perfect Avugla** | Frontend Lead | [@PeaElorm](https://github.com/PeaElorm) | Offline-First PWA, Mobile UI & Synchronization |
