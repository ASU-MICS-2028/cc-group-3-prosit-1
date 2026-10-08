# System Overview & Architectural Vision

## 1. Problem Statement & Operational Context

In Ghana, smallholder agriculture forms the backbone of the rural economy, particularly across the Northern, Upper East, Upper West, and Savannah regions. Government initiatives (such as Ministry of Food and Agriculture — MoFA input subsidy distribution) and cooperative networks (e.g., Northern Ghana Farmers Network) require accurate farmer profiling, parcel mapping, and biometric/photographic proof of presence.

However, field extension agents operate under severe environmental constraints:
* **Intermittent or Nonexistent Cellular Data:** Farmlands and rural settlements often have zero 3G/4G coverage.
* **Bursty Demand:** Registration spikes dramatically during short seasonal subsidy eligibility windows (jumping from ~50 req/s to ~500 req/s).
* **Device Constraints:** Agents utilize entry-level Android smartphones or tablets with limited battery life, modest processing power, and restricted onboard memory.
* **Cost Sensitivities:** Operating budgets are tight; running idle cloud servers or high-overhead cloud-native services outside registration windows is unaffordable.

---

## 2. Core Architectural Principles

AgroConnect Ghana addresses these constraints through four foundational design principles:

### Principle 1: The App Never Waits for the Network
Every registration, plot update, and photo capture is written immediately to persistent client-side storage (IndexedDB). User interactions are zero-latency and 100% functional in airplane mode. Synchronization to the cloud operates asynchronously in the background whenever signal is acquired (via in-app sync and W3C Background Sync with Web Locks concurrency control even after the app is closed).

### Principle 2: Client-Generated Permanent Identity
Every entity receives an immutable UUID (`clientId`) on the mobile device at creation. The cloud backend accepts client-generated UUIDs, guaranteeing that network retries, connection timeouts, or duplicate pushes never result in duplicate database records.

### Principle 3: Strict Subnet Segmentation & Least-Privilege Access
The cloud architecture strictly isolates tiers into dedicated subnets. Application servers and databases have zero public IP addresses and zero open administrative ports (no SSH / port 22). Public exposure is strictly restricted to an Application Load Balancer terminating TLS.

### Principle 4: Lean, Right-Sized Cloud Operations
Avoid unnecessary managed cloud bloat. Deploy cost-effective alternatives (e.g., replacing AWS Managed NAT Gateways with lightweight ARM64 EC2 NAT instances) and auto-scale dynamically so the system consumes minimal resources during quiet periods while handling burst traffic smoothly.

---

## 3. High-Level System Architecture

The end-to-end architecture is depicted below:

![AgroConnect Architecture v3](./assets/architecture-v3.png)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Client Tier (Offline-First PWA)                   │
│   React 19 • Vite • Dexie (IndexedDB) • Client UUIDs • GPS • Camera     │
│   Hosted on AWS Amplify (eu-west-1 origin + global CloudFront edges)    │
│   Domain: https://app.agroconnect.space                                 │
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
│     └── Auto Scaling Group (min 1, des 1, max 3)                       │
│           ├── Target-Tracking on ALBRequestCountPerTarget (500 req/min) │
│           └── EC2 (t3.micro) + Docker running Express :8000 (Node/TS)   │
│                 └── awslogs driver ─> CloudWatch Logs (/.../app)        │
│                                                                         │
│   [Private Data Subnets (10.20.21.0/24, 10.20.22.0/24)]                 │
│     └── PostgreSQL / Amazon RDS (db.t4g.micro, isolated data subnets)   │
│                                                                         │
│   [Storage & Observability Platform]                                    │
│     ├── S3 Media Bucket (agroconnect-dev-media, AES256, versioned)      │
│     ├── AWS Secrets Manager (DB master credentials & Arkesel SMS key)   │
│     ├── CloudWatch Operational Dashboard (agroconnect-dev-overview)     │
│     └── CloudWatch Alarms & SNS (ALB, ASG, RDS, EC2, $100/mo Budget)    │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│                    CI/CD & GitOps Automation (GitHub)                   │
│   PR: Smoke Test + Terraform Validate (11 modules)                      │
│   Push to main (Backend): AWS IAM OIDC Auth ➔ ECR ➔ ASG Rolling Refresh │
│   Push to main (Frontend): AWS Amplify Git-Connected Deploy (amplify.yml│
└─────────────────────────────────────────────────────────────────────────┘
```

The system is organized into decoupled layers:
1. [**Client Tier (`frontend/`)**](./client-tier.md): Progressive Web App built with React 19, Vite, TypeScript, and Dexie for client-side persistence, hosted on AWS Amplify (`https://app.agroconnect.space`).
2. [**API Tier (`backend/`)**](./api-tier.md): Node.js 24 / Express 5 TypeScript service running in Docker on EC2, exposing REST endpoints for profile creation, health checks, and discovery (`https://api.agroconnect.space`).
3. [**Data Tier (`db/`)**](./data-tier.md): Schema and migrations (`backend/migrations/`) for PostgreSQL 16 on Amazon RDS (`infra/modules/database`), with S3 object storage offloading for binary media (`infra/modules/storage`).
4. [**Cloud Infrastructure (`infra/`)**](./cloud-infrastructure.md): Modular Terraform IaC across 11 modules in `af-south-1` (and `eu-west-1` for Amplify) with native S3 state locking.
5. [**CI/CD & Operations (`.github/`, `amplify.yml`, `scripts/`)**](./ci-cd-and-operations.md): GitHub Actions utilizing AWS IAM OIDC federation for automated backend deployments and AWS Amplify for automated frontend deployments.

---

## 4. Alignment with the 6 AWS Well-Architected Pillars

AgroConnect Ghana was engineered to address each pillar of the AWS Well-Architected Framework:

### 1. Operational Excellence
* **Infrastructure as Code (IaC):** 100% of AWS cloud resources are defined declaratively across 11 modules in Terraform ([`infra/`](../infra)) backed by S3 remote state with native locking. Environments are reproducible with zero manual console drift.
* **Automated GitOps Workflows:** Changes to code or infrastructure land via pull requests validated by automated smoke tests and Terraform format/validation checks across all 11 modules ([`ci.yml`](../.github/workflows/ci.yml)). Backend deployments in [`deploy.yml`](../.github/workflows/deploy.yml) include concurrency retry synchronization against in-flight launch template refreshes.
* **Unified Observability & Alerting:** Docker containers stream logs directly to CloudWatch Logs via the `awslogs` driver. The ALB probes `/health` every 15s. A single CloudWatch operational dashboard (`agroconnect-dev-overview`) aggregates metrics across ALB, EC2, ASG, and RDS, while an SNS topic (`agroconnect-dev-alarms`) dispatches automated email alerts on threshold breaches.
* **Consistent Tagging Schema:** Every resource carries standardized tags: `Project = agroconnect`, `Env = dev`, `Team = highlanders`, `ManagedBy = terraform`.

### 2. Security
* **Network Isolation:** Only the ALB and the NAT instance reside in public subnets. Application servers and RDS database instances are housed in private subnets with private RFC 1918 IPs.
* **Chained Security Groups:** Strict least-privilege traffic flow:
  $$\text{Public Internet} \xrightarrow{\text{Port 443}} \text{ALB SG} \xrightarrow{\text{Port 8000}} \text{App SG} \xrightarrow{\text{Port 5432}} \text{Data SG}$$
* **Secrets Management:** Database master credentials and third-party SMS tokens (Arkesel) are managed in AWS Secrets Manager and retrieved dynamically at runtime, avoiding plaintext secrets in Git, user-data, or container layers.
* **Zero SSH / Closed Port 22:** Administrative shell access is exclusively conducted over **AWS Systems Manager (SSM) Session Manager** with IMDSv2 mandated. No SSH keys are provisioned or stored.
* **Zero Static Cloud Secrets:** GitHub Actions deploys via OpenID Connect (OIDC) Web Identity Federation (`sts:AssumeRoleWithWebIdentity`). No long-lived `AWS_ACCESS_KEY_ID` secrets exist in GitHub.
* **Identity & Access Governance:** Root AWS account is protected with MFA. Daily operations are conducted via IAM users provisioned with strict `ForceMFA` policies and mandatory password resets ([`create_team_iam.sh`](../scripts/create_team_iam.sh)).
* **Encryption in Transit & at Rest:** Strict TLS 1.3/1.2 termination at the ALB and Amplify via ACM. RDS storage is encrypted using AWS KMS. S3 media objects are protected by AES256 server-side encryption.

### 3. Reliability
* **Multi-AZ Availability:** The ALB and the app instances span two Availability Zones (`af-south-1a` and `af-south-1b`). If one data center experiences an outage, the ALB automatically routes traffic to the surviving zone. The RDS instance is single-AZ for the lab (`multi_az = false`), so a zone outage in its AZ would take the database down until it is restored; switching to Multi-AZ is one variable at roughly twice the database cost.
* **Dynamic Target Tracking:** Auto Scaling Group dynamically tracks `ALBRequestCountPerTarget` (500 req/min/target), scaling between 1 and 3 instances to handle load without human intervention.
* **Stateless Application Architecture:** EC2 instances maintain zero local session state. Requests can be served interchangeably by any instance in the Auto Scaling Group.
* **Automated Self-Healing:** The Auto Scaling Group replaces failed or unhealthy instances automatically when ALB health probes fail.
* **Client-Side Fault Tolerance:** Network dropouts cause zero data loss on the frontend; requests queue safely in local IndexedDB until connectivity recovers. The W3C Background Sync API (`agroconnect-sync`) and Web Locks concurrency control ensure zero-touch outbox drainage when signal returns even when the phone is locked or the app is closed, with strict mutual exclusion against foreground sync runs.

### 4. Performance Efficiency
* **Empirical Regional Selection:** AWS `af-south-1` (Cape Town) was selected following empirical benchmark testing from Ghana, achieving **74 ms median application RTT**—significantly faster than European regions (~117 ms) and US regions (>170 ms).
* **Decoupled PWA Edge Delivery:** While the API terminates in Cape Town for ultra-low DB and compute latency, the static PWA is served from AWS Amplify via CloudFront global edge points of presence (including Lagos and Cape Town). Static cache hits take **0 ms**, and API calls take **74 ms** (see [ADR-009](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)).
* **Burstable Compute:** EC2 instances use `t3.micro` burstable compute, providing baseline efficiency while effortlessly handling registration bursts during MoFA subsidy campaigns.
* **Client-Side Edge Offloading:** High-resolution photos captured by phone cameras are downscaled and compressed to `<100 KB` using client-side HTML Canvas before transmission, reducing network payload and upload time by over 95%.

### 5. Cost Optimization
* **`fck-nat` Architecture:** Standard AWS NAT Gateways incur a flat charge of ~$32/month per gateway plus data processing fees. AgroConnect deploys `fck-nat` on an ARM64 `t4g.nano` instance (~$3/month), cutting NAT costs by over 90%.
* **Free-Tier Leverage & Aggressive Scale-In:** Compute instances leverage AWS Free Tier credits; the ASG scales down to 1 instance during off-peak hours (monthly baseline compute cost ~$10/mo).
* **Cost Controls & Anomaly Detection:** AWS Budgets is configured with a strict **\$100/month guardrail** (`agroconnect-dev-monthly-budget`) dispatching automated warning emails at 50% forecasted spend and critical alerts at 100% actual spend via Amazon SNS.

### 6. Sustainability
* **Payload Minimization:** The offline-first PWA sends compressed, batched JSON payloads and optimized images, minimizing cellular radio uptime and battery drain on low-end farmer phones.
* **Right-Sized Compute Footprint:** Dynamic auto-scaling eliminates idle, over-provisioned compute capacity.
* **Graviton Adoption:** Adoption of ARM64 Graviton instances for NAT (`t4g.nano`) and Amazon RDS (`db.t4g.micro`), reducing power consumption and environmental impact.

---

## Next Steps & Further Reading

* [Architectural Decision Records (ADR-001 through ADR-013)](./architecture-decisions.md)
* [Engineering Learnings Journal](./learnings.md)
* [AI Tools Usage & Academic Integrity Disclosure](./ai-tools-usage.md)
* [Empirical Latency & Provider Benchmark Results](./empirical-research.md)
* [Client Tier Architecture & Offline Sync](./client-tier.md)
* [API Tier Architecture & Contracts](./api-tier.md)
* [Data Tier Schema & Models](./data-tier.md)
* [Cloud Infrastructure Specification](./cloud-infrastructure.md)
* [CI/CD & Operations Deep Dive](./ci-cd-and-operations.md)
