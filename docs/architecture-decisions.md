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
* [ADR-010: App Languages Limited to English, Twi and Ewe](#adr-010-app-languages-limited-to-english-twi-and-ewe)
* [ADR-011: Backend Runtime Migration to Node.js and TypeScript](#adr-011-backend-runtime-migration-to-nodejs-and-typescript)
* [ADR-012: Service Worker Background Sync with Web Locks Concurrency](#adr-012-service-worker-background-sync-with-web-locks-concurrency)
* [ADR-013: One Backend Service for Every Contract, on Postgres](#adr-013-one-backend-service-for-every-contract-on-postgres)

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
Accepted (superseded in part: scaling policy updated by ADR-008; runtime migrated to Node.js and TypeScript by ADR-011)

### Context
Field registrations fluctuate dramatically between quiet off-peak periods and intense agricultural subsidy distribution windows (e.g., Ministry of Food and Agriculture campaigns), where request volume jumps tenfold (50 &rarr; 500 req/s). The application backend must scale dynamically without session locking or operational overhead.

### Decision
1. **Stateless Framework:** Build the `farmer-profile-service` using **FastAPI** (Python 3.12). *Superseded by [ADR-011](#adr-011-backend-runtime-migration-to-nodejs-and-typescript) (Node.js/TypeScript) and [ADR-013](#adr-013-one-backend-service-for-every-contract-on-postgres); the stateless design stands.*
2. **Containerization:** Package the application into a Docker container image deployed via Amazon Elastic Container Registry (ECR).
3. **Auto Scaling Group (ASG):** Run compute on EC2 instances (`t3.micro`) inside an ASG spanning two Availability Zones (`af-south-1a`, `af-south-1b`), configured with `min = 1, desired = 2, max = 2`.
4. **Health Probing:** The Application Load Balancer (ALB) continuously checks `GET /health` on port 8000; failed instances are terminated and replaced automatically.

### Consequences
* **Positive:** Completely stateless instances can be replaced or scaled in/out at any moment without dropping active user sessions.
* **Negative:** Shared state must reside externally in the database (RDS Postgres, now in place) rather than local memory.

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
* **Negative (Technical Debt):** Single `fck-nat` instance in `af-south-1a` represents a single point of failure (SPOF) for outbound egress if that specific AZ fails. In production, this can be upgraded to an ASG-wrapped NAT or multi-AZ fck-nat.

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
* **Negative (Technical Debt):** DNS records at Hostinger are managed via MCP calls, not Terraform. Changing them requires either MCP access or the Hostinger console — not a `terraform apply`. Documented as debt in `infra/README.md`. Migration to Route 53 later is a one-time delegation if an all-IaC story becomes necessary.

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
2. **Target Value:** 500 requests per target per minute (~8 req/s per instance). Chosen because a `t3.micro` running the API (then Python/FastAPI, now Node.js) comfortably sustains ~200 req/s; 8 req/s keeps per-instance utilization under 5% and leaves generous headroom for intermittent traffic bursts.
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
1. **Hosting Platform:** AWS Amplify Hosting (not Amplify Gen 2 — pin to Hosting-only so the managed-backend features of Gen 2 don't conflict with the existing Node.js API).
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
* **Negative (Technical Debt):** Build logs and the Amplify console live in `eu-west-1`, not `af-south-1` — team members need to switch regions in the console to view them. The GitHub App install itself is a one-time ClickOps action outside Terraform; the Terraform resource is unaware of it and will fail with `Deploy keys are disabled for this repository` if the install is ever revoked.
* **Note:** The GitHub App install is scoped to the single repo (`cc-group-3-prosit-1`). Future repos in the same org would need either their own install or a widened scope on this install.

---

## ADR-010: App Languages Limited to English, Twi and Ewe

### Status
Accepted

### Context
The PWA was built with four interface languages: English, Twi, Ewe and Dagbani. English was complete; the other three fell back to English. The translations ship inside the app bundle (`src/i18n/*.json`) because the app must work offline, so a live translation service at runtime is not an option. Every string has to be translated ahead of time.

Google Translate supports Twi (`ak`) and Ewe (`ee`) but **not Dagbani**; it is absent from Google's 249 target languages. No team member writes Dagbani, so there was no reliable source for its strings.

Google's Twi and Ewe output was also compared against hand-written drafts and found unsafe to use directly: it translated the `{placeholder}` names (so names, dates and prices would render blank), rendered "signal" as "sign/symbol" (*Nsɛnkyerɛnne*, *Dzesi*) and "sign out" as "put down a signature".

### Decision
1. **App languages:** English, Twi and Ewe. Dagbani is removed from the language picker (`AppLanguage`) until a Dagbani speaker can supply the strings.
2. **Farmer data keeps Dagbani:** `dag` stays a valid *preferred language* on the farmer record (`FARMER_LANGUAGES`, the API contract and the `language` CHECK constraint). That field describes the farmer, not the app, and agents in the north still need to record it.
3. **Translation source:** the hand-written Twi and Ewe drafts, not Google Translate. A test in `translate.test.ts` fails if a translation uses a key missing from `en.json` or drops a placeholder.

### Consequences
* **Positive:** No half-translated language in the picker; every language offered is complete. A wrong-placeholder or stale-key regression fails CI.
* **Negative:** Dagbani-speaking farmers use the app in English, Twi or Ewe for now. The Twi and Ewe text still needs review by native speakers, especially the wallet, loan and consent strings.
* **Reversal:** Add `dag.json`, restore `'dag'` in `AppLanguage` and the `dictionaries` map in `src/i18n/translate.ts`, and add it to the translation test.

---

## ADR-011: Backend Runtime Migration to Node.js and TypeScript

### Status
Accepted (supersedes runtime selection in ADR-003)

### Context
The backend service (`farmer-profile-service`) was originally scaffolded in Python with FastAPI. As the frontend PWA expanded rapidly in TypeScript (React 19, Dexie IndexedDB, Vitest, mock server), maintaining two separate programming language stacks created significant operational and technical friction:
1. **Type & Schema Disconnect:** Data models, validation rules, and contract types defined in TypeScript on the frontend could not be shared or verified against the Python backend without duplicate definitions.
2. **Mock Server Divergence:** The frontend mock server (`frontend/agroconnect-pwa/mock-server/server.mjs`) was written in JavaScript, meaning contract tests against the mock server did not test the Python code.
3. **Developer Ergonomics:** Full-stack contributors had to maintain dual toolchains (`python3`, `pip`, `venv`, `uvicorn` alongside `node`, `npm`, `tsx`, `vite`), complicating local setup and CI pipelines.

### Decision
1. **Runtime & Framework:** Migrate `farmer-profile-service` to **Node.js 24 LTS** with **Express 5** and **TypeScript** (`backend/src/server.ts`).
2. **Compilation & Packaging:** Use `tsc` for build compilation (`ES2022`, `NodeNext` resolution). Package in a multi-stage Docker build (`node:24-alpine`) with unprivileged runtime execution (`USER node`) on port 8000.
3. **CI Smoke Test:** Update GitHub Actions CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) to set up Node 24, run `npm ci` and `npm run build`, boot the compiled server in the background, and probe `http://localhost:8000/health`.

### Consequences
* **Positive:**
  * Unified TypeScript ecosystem across the entire stack (PWA client, mock server, and production backend API).
  * Simplified container lifecycle with multi-stage Alpine build (~120 MB runtime image) running as a non-root user (`USER node`).
  * Fast event-driven I/O throughput on Node.js fitting the IO-bound workload.
* **Negative:**
  * Loss of FastAPI's automatic Swagger/OpenAPI documentation generation; API contracts are maintained explicitly in documentation and TypeScript types.
* **Reversal:** The container interface (Docker on port 8000 probing `/health`) and ALB configuration are unchanged. Swapping runtimes in the future requires no infrastructure changes.

---

## ADR-012: Service Worker Background Sync with Web Locks Concurrency

### Status
Accepted

### Context
Field extension agents in rural Ghana register smallholder farmers in areas with zero cellular reception. When an agent completes a registration or takes farm photos offline, the data queues in local IndexedDB. Agents typically lock their phones or put them away until returning to a trading center or transit point where mobile signal is restored.

In a standard PWA, outbound network synchronization only runs while the browser tab or PWA window is actively open in the foreground. If the agent does not reopen AgroConnect after acquiring signal, queued registrations remain stranded on the device indefinitely.

Conversely, if the browser supports background wakeups while the user simultaneously opens the app to perform another task, two independent execution contexts (the main UI thread and the Service Worker thread) would attempt to drain the shared IndexedDB queue concurrently. Without mutual exclusion, duplicate HTTP requests, race conditions on status transitions, and conflicting token refreshes would occur.

### Decision
1. **Custom Service Worker (`injectManifest`):** Switch `vite-plugin-pwa` from `generateSW` to `injectManifest` with a dedicated service worker source ([`src/sw.ts`](../frontend/agroconnect-pwa/src/sw.ts)). Preserve Workbox asset precaching while adding a custom `sync` event listener.
2. **W3C Background Sync API:** When an in-app sync pass finishes with items remaining unsent, or when an offline registration completes, register the `agroconnect-sync` tag with the browser's `SyncManager` ([`src/sync/background.ts`](../frontend/agroconnect-pwa/src/sync/background.ts)). The browser automatically wakes the service worker once network connectivity is re-established, even if the PWA has been closed.
3. **W3C Web Locks Concurrency Control:** Both the in-app queue runner and the service worker background handler acquire a shared exclusive Web Lock (`navigator.locks.request('agroconnect-sync', ...)`) before touching the outbox. Only one thread processes queue records at any given moment.
4. **Safe Status Reset:** Because holding the Web Lock guarantees that no other process is actively transmitting, queue runs can safely reset records trapped in `'sending'` state back to `'saved'` on every run, preventing permanently stuck records if the browser is terminated mid-upload.
5. **Background Authentication Handling:** The background worker reads the saved session token from IndexedDB, injects it into outgoing requests, and transparently invokes `/auth/refresh` upon encountering an `HTTP 401 Unauthorized`.
6. **Browser Fallback:** The Background Sync API is fully supported in Chromium-based browsers on Android (the target field device ecosystem). On browsers without Background Sync support (e.g., iOS Safari or desktop Firefox), the app gracefully degrades to in-app foreground synchronization.

### Consequences
* **Positive:**
  * Zero-touch outbox drainage: field agents do not need to remember to reopen the application when returning to cellular coverage.
  * Robust concurrency guarantees: Web Locks eliminate duplicate HTTP dispatches and race conditions between foreground and background workers.
  * Reliable error recovery: failing the `sync` event when items remain triggers the browser's internal exponential backoff algorithm.
* **Negative:**
  * Background Sync is not supported on WebKit/Safari (iOS), meaning iOS devices require foreground app execution to drain the queue.
  * Added complexity in service worker lifecycle and build tooling (`vite-plugin-pwa` injectManifest mode).
* **Reversal:** If Background Sync proves problematic, `src/sw.ts` can drop the `sync` listener, and `vite-plugin-pwa` can revert to `generateSW`.

---

## ADR-013: One Backend Service for Every Contract, on Postgres

### Status
Accepted (8 Oct 2026)

### Context
The PWA was built against six contracts (farmers, auth, admin, payments, advice, listings) and a mock server that implements all of them with tests. The real backend implemented four routes with an in-memory map, so the hosted app could not get past its sign-in screen, and the backend lead was unavailable with the deadline close. RDS, the S3 media bucket and an SMS secret already existed in Terraform but were unused.

The contracts imply an auth-service and several other services, but the infrastructure has one ECR repository, one Auto Scaling Group and one ALB target group.

### Decision
1. **One service, `agroconnect-api`,** implements every contract, in route modules per contract ([`backend/src/routes/`](../backend/src/routes)). The PWA's separate `VITE_*_URL` settings all fall back to `api.agroconnect.space`, so no frontend change is needed, and services can still be split later behind the same paths.
2. **Port the mock, not rewrite from scratch.** The mock is the executable reference; its 89 contract tests are ported into `backend/test/` and run against the real service. Two differences were resolved in favour of the contracts (normalised timestamps; coordinator creation audited as `users.insert`).
3. **Postgres does the integrity work.** Migrations in `backend/migrations/` run on boot under an advisory lock. Every offline-created row has `client_id UUID NOT NULL UNIQUE`; the service inserts and maps `23505` by constraint name. A trigger writes the audit log with the actor from `set_config('app.actor', $1, true)`.
4. **Secrets by reference.** Instances get secret ARNs only; the app reads values with its instance role. The RDS password is fetched per connection (rotation-safe) and TLS to RDS is verified with the CA bundle in the image. This needed the IMDSv2 hop limit raised to 2 for the container.
5. **Real integrations in test mode:** Arkesel SMS for sign-in codes; **votex365** hosted checkout (test keys) for cedi collections, with an HMAC-signed webhook. Payouts, NGN and KES, which votex365 cannot do, stay simulated as the payments contract allows. votex365 is temporary; Flutterwave or Paystack can replace it behind the same `CheckoutProvider` interface.
6. **Tests without infrastructure:** the suite runs on PGlite (Postgres in WebAssembly) by default and on a real Postgres with `TEST_DATABASE_URL`; CI does both against Postgres 16 and boots the image.

### Alternatives Considered
* **Separate services per contract** (auth-service, payments-service, …): matches the contracts' wording, but needs more ECR repositories, target groups and listener rules for no benefit at this scale. Rejected for now.
* **Run migrations from CI:** the database is only reachable from the app subnets, so CI would need a bastion or SSM tunnel. Migrating on boot needs neither.
* **Keep payments fully simulated:** simpler, but proves nothing about a real provider integration. votex365 offered test keys immediately.

### Consequences
* **Positive:** the hosted PWA works end to end against real infrastructure; contract parity with the mock is proven by its own tests; no secret value appears in user data, Terraform state or the repository.
* **Negative:** one service means one blast radius and one deploy for every area. The payment provider is a small local company, not a regional standard; live mode would need KYC and a provider change. Demo accounts with public passwords are enabled for the prosit (`SEED_DEMO_ACCOUNTS`) and must be turned off before real data.
* **Reversal:** each route module depends only on the shared context, so one can be moved into its own service behind the same path.

---

## Related References
* [Empirical Research & Benchmark Details](./empirical-research.md)
* [Cloud Infrastructure Deep Dive](./cloud-infrastructure.md)
* [CI/CD & Operations Deep Dive](./ci-cd-and-operations.md)


