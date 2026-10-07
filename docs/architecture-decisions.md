# Architectural Decision Records (ADRs)

This document formalizes the key architectural decisions made for **AgroConnect Ghana** during PROSIT 1.

---

## Index of Architectural Decisions

* [ADR-001: Cloud Provider & Target Region Selection (AWS `af-south-1`)](#adr-001-cloud-provider--target-region-selection)
* [ADR-002: Offline-First Client Architecture with Client-Generated Identity](#adr-002-offline-first-client-architecture-with-client-generated-identity)
* [ADR-003: Stateless Containerized Application Tier on Auto-Scaled Compute](#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute)
* [ADR-004: Three-Tier Subnet Segmentation with Cost-Optimized NAT (`fck-nat`)](#adr-004-three-tier-subnet-segmentation-with-cost-optimized-nat)
* [ADR-005: Zero-Trust GitOps CI/CD Deployment via AWS IAM OIDC](#adr-005-zero-trust-gitops-cicd-deployment-via-aws-iam-oidc)

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

## Related References
* [Empirical Research & Benchmark Details](./empirical-research.md)
* [Cloud Infrastructure Deep Dive](./cloud-infrastructure.md)
* [CI/CD & Operations Deep Dive](./ci-cd-and-operations.md)
