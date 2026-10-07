# Architectural Decision Records (ADRs)

This document formalizes the key architectural decisions made for **AgroConnect Ghana** during PROSIT 1.

---

## Index of Architectural Decisions

* [ADR-001: Cloud Provider & Target Region Selection (AWS `af-south-1`)](#adr-001-cloud-provider--target-region-selection)
* [ADR-002: Offline-First Client Architecture with Client-Generated Identity](#adr-002-offline-first-client-architecture-with-client-generated-identity)
* [ADR-003: Stateless Containerized Application Tier on Auto-Scaled Compute](#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute)
* [ADR-004: Three-Tier Subnet Segmentation with Cost-Optimized NAT (`fck-nat`)](#adr-004-three-tier-subnet-segmentation-with-cost-optimized-nat)
* [ADR-005: Zero-Trust GitOps CI/CD Deployment via AWS IAM OIDC](#adr-005-zero-trust-gitops-cicd-deployment-via-aws-iam-oidc)
* [ADR-006: HTTPS via AWS Certificate Manager with External DNS (Hostinger)](#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger)
* [ADR-007: Terraform Modularization](#adr-007-terraform-modularization)
* [ADR-008: Target-Tracking Auto Scaling on `ALBRequestCountPerTarget`](#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)
* [ADR-009: Frontend Hosting on AWS Amplify in `eu-west-1`](#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)

---

## ADR-001: Cloud Provider & Target Region Selection

### Status
Accepted

### Context
AgroConnect Ghana serves users located physically in Ghana (West Africa). Latency, regional presence, and cost predictability are paramount. We evaluated three major hyperscalers: Amazon Web Services (AWS), Microsoft Azure, and Google Cloud Platform (GCP).

Empirical network latency testing was conducted directly from Ghana to evaluate TCP connect times and application HTTP request round-trip times (RTT).

### Decision
1. **Cloud Provider:** We selected **Amazon Web Services (AWS)** due to its mature infrastructure tooling, robust Terraform provider support, and generous credit allocations for education/startups.
2. **Primary Region:** We selected **`af-south-1` (Cape Town, South Africa)** as the primary cloud region.

### Empirical Justification
* **AWS `af-south-1`:** Achieved **74 ms median application RTT** (fastest among all tested endpoints).
* **AWS `eu-west-2` (London):** Achieved **117 ms median RTT** (+43 ms latency penalty).
* **AWS `us-east-1` (N. Virginia):** Achieved **175 ms median RTT** (+101 ms latency penalty).
* **Azure `southafricanorth` (Johannesburg):** Achieved **129 ms median RTT** despite low TCP connect times.
* **GCP `europe-west9` (Paris):** Achieved **127 ms median RTT**.

### Consequences
* **Positive:** Minimizes round-trip delay for mobile clients uploading data; keeps data within the African continent.
* **Negative:** AWS charges for inter-region data transfer; `af-south-1` pricing is slightly higher than `us-east-1` for certain services. Egress costs require strict architectural control.

---

## ADR-002: Offline-First Client Architecture with Client-Generated Identity

### Status
Accepted

### Context
Field extension agents register farmers in remote rural communities where cellular network connectivity is intermittent, degraded, or entirely absent. A traditional web app that relies on synchronous HTTP POST requests will fail, freeze, or drop user input.

### Decision
1. **Offline-First Storage Engine:** Implement a Progressive Web App (PWA) backed by **IndexedDB** using the **Dexie** library.
2. **Immediate Persistence:** Every keystroke and form transition is saved to local storage with a 300 ms debounce.
3. **Client-Generated UUIDs (`clientId`):** Every profile is assigned a cryptographically random UUID on the client device upon creation.
4. **On-Device Pre-Processing:**
   * Photos captured via camera are rendered onto an HTML Canvas and compressed to JPEG `<100 KB` before enqueueing.
   * Device hardware GPS is polled independently of cellular networks.

### Consequences
* **Positive:** Zero data loss when battery dies or connection drops; registration continues seamlessly in airplane mode; backend retries are idempotent because `clientId` prevents duplicate rows.
* **Negative:** Increased client application complexity; the backend must support client-generated primary keys and resolve synchronization status codes (e.g., HTTP 409 conflict handling).

---

## ADR-003: Stateless Containerized Application Tier on Auto-Scaled Compute

### Status
Accepted

### Context
Field registrations fluctuate dramatically between quiet off-peak periods and intense agricultural subsidy distribution windows (e.g., Ministry of Food and Agriculture campaigns), where request volume jumps tenfold (50 &rarr; 500 req/s). The application backend must scale dynamically without session locking or operational overhead.

### Decision
1. **Stateless Framework:** Build the `farmer-profile-service` using **FastAPI** (Python 3.12).
2. **Containerization:** Package the application into a Docker container image deployed via Amazon Elastic Container Registry (ECR).
3. **Auto Scaling Group (ASG):** Run compute on EC2 instances (`t3.micro`) inside an ASG spanning two Availability Zones (`af-south-1a`, `af-south-1b`), configured with `min = 1, desired = 2, max = 2`.
4. **Health Probing:** The Application Load Balancer (ALB) continuously checks `GET /health` on port 8000; failed instances are terminated and replaced automatically.

### Consequences
* **Positive:** Completely stateless instances can be replaced or scaled in/out at any moment without dropping active user sessions.
* **Negative:** Shared state must reside externally in the database (Week 4 RDS) rather than local memory.

---

## ADR-004: Three-Tier Subnet Segmentation with Cost-Optimized NAT

### Status
Accepted

### Context
Industry security standards dictate that application servers and databases must not have public IP addresses or direct internet accessibility. However, application instances in private subnets require outbound internet egress to pull container images from ECR, install OS security patches, and communicate with external services. Standard AWS Managed NAT Gateways cost ~$32/month per zone plus bandwidth charges, exceeding our budget.

### Decision
1. **VPC Subnet Architecture (`10.20.0.0/16`):**
   * **Public Subnets (`10.20.1.0/24`, `10.20.2.0/24`):** ALB and NAT instances only. Direct route to Internet Gateway (IGW).
   * **Private App Subnets (`10.20.11.0/24`, `10.20.12.0/24`):** EC2 instances running Docker. Default route (`0.0.0.0/0`) directed to the NAT instance ENI.
   * **Private Data Subnets (`10.20.21.0/24`, `10.20.22.0/24`):** PostgreSQL database. Completely isolated route table with **no default internet route**.
2. **Cost-Optimized NAT (`fck-nat`):** Deploy a lightweight ARM64 EC2 instance (`t4g.nano`) running the open-source `fck-nat` AMI instead of an AWS Managed NAT Gateway.

```
                    Internet Gateway (IGW)
                              │
                    ┌─────────▼─────────┐
                    │   Public Subnet   │
                    │   ALB & fck-nat   │
                    └─────────┬─────────┘
                              │ Egress
                    ┌─────────▼─────────┐
                    │ Private App Subnet│
                    │ EC2 App Instances │
                    └─────────┬─────────┘
                              │ Port 5432 (Internal Only)
                    ┌─────────▼─────────┐
                    │Private Data Subnet│
                    │   PostgreSQL RDS  │ (No Internet Route)
                    └───────────────────┘
```

### Consequences
* **Positive:** Provides true enterprise-grade defense-in-depth security; reduces VPC fixed NAT egress cost from ~$32/month down to ~$3/month.
* **Negative (Ponytail Debt):** Single `fck-nat` instance in `af-south-1a` represents a single point of failure (SPOF) for outbound egress if that specific AZ fails. In production, this can be upgraded to an ASG-wrapped NAT or multi-AZ fck-nat.

---

## ADR-005: Zero-Trust GitOps CI/CD Deployment via AWS IAM OIDC

### Status
Accepted

### Context
Automated deployments from GitHub Actions to AWS typically require long-lived AWS IAM Access Keys (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) stored in repository secrets. If compromised, these static credentials grant attackers persistent access to cloud infrastructure.

### Decision
1. **OpenID Connect (OIDC) Web Identity Federation:** Configure an AWS IAM OIDC Identity Provider trusted for `token.actions.githubusercontent.com`.
2. **Short-Lived Role Assumption:** GitHub Actions workflows request temporary STS tokens via `sts:AssumeRoleWithWebIdentity` scoped strictly to `repo:ASU-MICS-2028/cc-group-3-prosit-1:*`.
3. **Automated Rolling Refresh:** On merge to `main`, GitHub Actions builds and pushes the container image to Amazon ECR and triggers an ASG instance refresh (`aws autoscaling start-instance-refresh`) with a 50% minimum healthy threshold.

### Consequences
* **Positive:** Zero static AWS secrets stored in GitHub; credentials expire within minutes; audit trails in AWS CloudTrail clearly reflect individual GitHub workflow runs.
* **Negative:** Requires initial setup of IAM OIDC trust policies and repository subject condition matching.

---

## ADR-006: HTTPS via AWS Certificate Manager with External DNS (Hostinger)

### Status
Accepted

### Context
The ALB was initially provisioned HTTP-only. ADR-001's security story and the Lab 2 Well-Architected report both commit to encryption in transit. Additionally, once the PWA ships (served over HTTPS by Amplify), browsers will block mixed-content requests from an HTTPS origin to an HTTP API.

Two sub-decisions were required: (a) where to obtain the TLS certificate, and (b) where to host DNS. The team already owned `agroconnect.space` registered through **Hostinger**. Options for DNS were (1) delegate the entire zone to AWS Route 53, or (2) keep DNS at Hostinger and publish only the records AWS needs.

### Decision
1. **TLS Certificate:** AWS Certificate Manager (ACM) in `af-south-1`, issued for `api.agroconnect.space`, validated via DNS. ACM certs are free, auto-renewed, and native to the ALB listener.
2. **DNS Provider:** Keep DNS at **Hostinger**. Publish only two CNAMEs there: (a) ACM's DNS validation record, and (b) `api.agroconnect.space` → ALB DNS name. The Hostinger MCP (`dns_records_update`) applies both idempotently.
3. **Listener Configuration:** ALB listens on `:443` with the ACM cert and TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`. Port `:80` returns `HTTP 301` to `:443`.

### Consequences
* **Positive:** Zero cost (ACM free, no Route 53 hosted zone fee); DNS consolidated at one provider the team already pays for; one-line toggle to add new subdomains (`app.`, future).
* **Negative (Ponytail Debt):** DNS records at Hostinger are managed via MCP calls, not Terraform. Changing them requires either MCP access or the Hostinger console — not a `terraform apply`. Documented as debt in `infra/README.md`. Migration to Route 53 later is a one-time delegation if an all-IaC story becomes necessary.

---

## ADR-007: Terraform Modularization

### Status
Accepted

### Context
The initial Week-3 bring-up kept all 36+ Terraform resources in a single ~500-line `infra/main.tf`. As Week 4 approached (RDS, dedicated frontend hosting), the monolith was projected to grow to ~60 resources, blurring the boundary between concerns and complicating independent evolution (e.g., swapping NAT strategies, retiring a tier).

### Decision
1. **Split `infra/main.tf` into six focused modules** under `infra/modules/`:
   * `network/` — VPC, subnets (public, private-app, private-data), IGW, route tables, associations.
   * `nat/` — fck-nat instance, SG, ENI (consumes a shared instance profile from `compute/`).
   * `alb/` — ALB, SGs (`alb-sg`, `app-sg`), target group, HTTP+HTTPS listeners, ACM cert.
   * `compute/` — EC2 IAM role/profile, launch template, ASG, scaling policy.
   * `ecr/` — container registry (kept separate so `compute/` has no cross-concern dependency).
   * `cicd/` — GitHub Actions OIDC provider, deploy role, inline policy.
2. **Root `main.tf` is a thin ~90-line orchestrator** that wires modules together and nothing else.
3. **State migration via a one-shot `migrate-state.sh` script** that runs `terraform state mv` for each pre-module address. Idempotent (dry-run default). 43 entries migrated with zero destroys. ALB `/health` served uninterrupted throughout.

### Consequences
* **Positive:** Each module reasons about one concern; Week 4 RDS lands as a new `database/` module without touching existing code; swapping NAT strategies, deleting the ALB, or spinning a second environment all become module-scope changes.
* **Negative:** More files; `terraform state mv` is tedious one-time work (mitigated by the script); contributors must understand the orchestrator pattern (documented in `infra/README.md`).

---

## ADR-008: Target-Tracking Auto Scaling on `ALBRequestCountPerTarget`

### Status
Accepted (supersedes an earlier UI-created CPU-based policy)

### Context
A target-tracking scaling policy was initially created via the AWS Console using `ASGAverageCPUUtilization` at 60% target. For an IO-bound HTTP API (database calls, container-pull-blocked startup, FastAPI awaiting network), **CPU is a poor demand signal**: a worker blocked on a slow DB call occupies a slot but consumes near-zero CPU, so the alarm never trips even when real-world throughput is saturated. CPU-based policies for such workloads tend to lag demand by minutes and under-provision.

### Decision
1. **Metric:** `ALBRequestCountPerTarget` (sum of HTTP requests per registered target per 1-minute period). Captured in Terraform under `module.compute.aws_autoscaling_policy.cpu_target` (name preserved for state continuity).
2. **Target Value:** 500 requests per target per minute (~8 req/s per instance). Chosen because a `t3.micro` running Python/FastAPI comfortably sustains ~200 req/s; 8 req/s keeps per-instance utilization under 5% and leaves generous headroom for intermittent traffic bursts.
3. **ASG Capacity:** `min = 1`, `desired = 1`, `max = 3`. Scales out to 3 under sustained load, back to 1 when quiet. Keeps the normal-day cost at one instance (~$10/mo), with ceiling at three (~$30/mo).
4. **Resource Label:** Built from `module.alb.alb_arn_suffix` and `module.alb.target_group_arn_suffix` so the policy stays tied to the correct ALB/TG pair even if either is replaced.

### Consequences
* **Positive:** Scaling responds to real demand (request volume), not a proxy signal. Target value is a single variable (`requests_per_target_target_value`) and can be re-tuned without touching the policy structure.
* **Negative:** For CPU-bound workloads (image resizing, PDF rendering, ML inference), request count would be the wrong signal; the policy would need to be swapped back to CPU or extended to a dual-metric approach. Current workload is strictly IO-bound.
* **Note:** AWS auto-manages the two CloudWatch alarms backing this target-tracking policy; they are intentionally **not** declared in Terraform.

---

## ADR-009: Frontend Hosting on AWS Amplify in `eu-west-1`

### Status
Accepted

### Context
Perfect Avugla's React 19 + Vite PWA (`frontend/agroconnect-pwa/`) ships as a static SPA with a service worker, PWA manifest, and offline-first storage via Dexie/IndexedDB. The team needed a hosting option that: (a) matches the "AWS-only" architectural story from Lab 2, (b) handles PWA service-worker cache semantics correctly, (c) auto-deploys on `git push`, and (d) supports a custom domain over HTTPS.

Two candidates were considered: **AWS Amplify Hosting** (managed Git-connected deploy pipeline) and **S3 + CloudFront** (fully Terraform-managed static hosting). Both are AWS-native, both are cheap at lab scale.

A region constraint surfaced during Terraform apply: **AWS Amplify Hosting is not offered in `af-south-1` (Cape Town)**. The nearest supported regions are `eu-west-1` (Ireland), `eu-west-2` (London), and `eu-central-1` (Frankfurt).

### Decision
1. **Hosting Platform:** AWS Amplify Hosting (not Amplify Gen 2 — pin to Hosting-only so the managed-backend features of Gen 2 don't conflict with the existing FastAPI/Node service).
2. **Region:** `eu-west-1` (Ireland). Closest supported region to Ghana among Amplify Hosting regions.
3. **Build Pipeline:** `amplify.yml` committed at repo root; monorepo build spec with `appRoot: frontend/agroconnect-pwa`. Only the `main` branch deploys; preview URLs for other branches are disabled.
4. **Custom Domain:** `app.agroconnect.space` via `aws_amplify_domain_association`, with the CNAME + ACM-validation records published at Hostinger (same pattern as ADR-006).
5. **Repo Access:** AWS Amplify **GitHub App** installed on the `ASU-MICS-2028` org, scoped to only `cc-group-3-prosit-1`. No Personal Access Token (PAT), no deploy key.

   A PAT-based flow was attempted first and rejected: Amplify's PAT path creates a GitHub **deploy key** on the repo under the hood, and the org disables deploy keys. The GitHub App bypasses deploy keys entirely because it authenticates via GitHub's App Installation API, not SSH keys. The install is a one-time console step; subsequent Terraform `apply` runs create/update Amplify apps against the installed App automatically.

   **Rotation:** The GitHub App is owned by AWS; GitHub rotates its signing keys automatically. The repo-level install can be revoked at any time from `https://github.com/organizations/ASU-MICS-2028/settings/installations` — doing so would break Amplify's ability to clone and would require re-installing + a Terraform re-apply of the `aws_amplify_app` resource.

### Why `eu-west-1` does not harm farmer latency

Three facts jointly determine end-user latency for a PWA, and none are controlled by Amplify's region after first visit:

| Request type | Serving layer | Location | Round-trip impact of Amplify region |
|---|---|---|---|
| First-ever page load (HTML, JS, CSS, service worker) | CloudFront edge | Lagos / Jo'burg / Cape Town / Nairobi | +~30 ms on cache miss (one time) |
| Every subsequent page load | Service worker on the phone | The phone itself | **0 ms** |
| API calls (`POST /farmers`, uploads, syncs) | **ALB in `af-south-1`** | Cape Town | **0 ms** — unchanged |
| Offline-first field work | IndexedDB on the phone | The phone itself | **0 ms** |

CloudFront serves the PWA assets from edges globally (including Lagos and Cape Town), so repeat visits are instant. API traffic goes **directly** from the phone to `api.agroconnect.space` → ALB in `af-south-1`, at the measured 74 ms RTT from Ghana. **Amplify's region only affects origin-fetch latency on cold cache**, which the PWA model intentionally minimizes.

### Alternatives Considered

* **S3 + CloudFront in `af-south-1`:** Fully IaC, slightly cheaper, saves ~30 ms on first-ever cache miss. Loses Amplify's one-click Git-connected deploys, PR previews (if enabled later), and managed cert workflow. Rejected on team-ergonomics grounds — Perfect's iteration speed on frontend outweighs ~30 ms once-per-first-visit.
* **Cloudflare Pages:** Cheapest option, excellent PWA support. Rejected to preserve the single-cloud (AWS) architectural story.
* **Hostinger static hosting:** Bundled with existing plan. Rejected — insufficient control over PWA-specific cache headers (`index.html` no-cache, `sw.js` no-store, hashed assets `max-age=31536000`).

### Consequences
* **Positive:** Git-connected deploys with zero pipeline code; auto-managed TLS cert for `app.agroconnect.space`; farmer-facing latency essentially unchanged vs. a Cape-Town-hosted option; no long-lived secret to rotate.
* **Negative (Ponytail Debt):** Build logs and the Amplify console live in `eu-west-1`, not `af-south-1` — team members need to switch regions in the console to view them. The GitHub App install itself is a one-time ClickOps action outside Terraform; the Terraform resource is unaware of it and will fail with `Deploy keys are disabled for this repository` if the install is ever revoked.
* **Note:** The GitHub App install is scoped to the single repo (`cc-group-3-prosit-1`). Future repos in the same org would need either their own install or a widened scope on this install.

---

## Related References
* [Empirical Research & Benchmark Details](./empirical-research.md)
* [Cloud Infrastructure Deep Dive](./cloud-infrastructure.md)
* [CI/CD & Operations Deep Dive](./ci-cd-and-operations.md)
