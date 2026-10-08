# API Tier — Containerized Application Backend

**Lead:** Elise Kennedy-Angbo ([@Elise-Oyi](https://github.com/Elise-Oyi))  
**Production Endpoint:** [`https://api.agroconnect.space`](https://api.agroconnect.space)  
**Hosting Infrastructure:** AWS EC2 Auto Scaling Group (`af-south-1` Cape Town) behind ALB  
**Associated Architectural Records:** [ADR-003 (Stateless Compute)](./architecture-decisions.md#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute), [ADR-006 (HTTPS via ACM)](./architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-008 (Target-Tracking Scaling)](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget), [ADR-011 (Node.js/TypeScript Runtime)](./architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript)

---

## 1. Role & Architectural Responsibilities

The API tier is the ingestion and processing engine of the AgroConnect cloud platform. It provides high-throughput, idempotent profile registration and retrieval for field agents operating across Ghana.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AWS Application Load Balancer (ALB)                  │
│   Listens: :443 (ACM TLS for api.agroconnect.space)                    │
│   Redirects: :80 -> 301 Permanent Redirect to :443                    │
│   Health Probe: GET /health every 15s                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Reverse Proxy (Port 8000)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Private Application Tier (Auto Scaling Group)              │
│             af-south-1a & af-south-1b (No Public IPs)                  │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ EC2 t3.micro (Docker runtime, unprivileged `USER node`)      │     │
│   │                                                              │     │
│   │   Node.js 24 LTS Runtime                                     │     │
│   │      └── Express 5 TypeScript API (farmer-profile-service)   │     │
│   │             ├── GET  /                 (Metadata)            │     │
│   │             ├── GET  /health           (ALB Liveness Probe)  │     │
│   │             ├── POST /farmers          (Idempotent Ingest)   │     │
│   │             ├── GET  /farmers/:id      (Profile Fetch)       │     │
│   │             └── POST /farmers/:id/photo (Week 4 Media)       │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Design Goals
1. **Stateless Scalability:** Individual compute nodes retain zero local session state. Requests can hit any instance in the Auto Scaling Group (ASG).
2. **Unified TypeScript Ecosystem:** Migrated from Python/FastAPI to **Node.js 24** and **TypeScript** (see [ADR-011](./architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript)), aligning domain models directly with the React 19 PWA and mock server.
3. **Idempotent Ingestion:** Handles duplicate submissions gracefully when mobile clients flush queued records over intermittent cellular connectivity.
4. **Least-Privilege Container Security:** The production container executes as an unprivileged system user (`USER node`) in a minimal Alpine Linux footprint.
5. **Zero-Trust Network Perimeter:** The service binds strictly to internal interfaces in private subnets with no public IPv4 addresses and no SSH access.

---

## 2. Technology Stack & Implementation

* **Runtime:** Node.js 24 LTS
* **Framework:** **Express 5** (`^5.2.1`)
* **Language:** **TypeScript** (`^7.0.2`) with `NodeNext` module resolution and ES2022 target
* **Development Runner:** `tsx` (`^4.23.15`) for TypeScript watch and reload
* **Source Location:** [`backend/src/server.ts`](../backend/src/server.ts)
* **Configuration:** [`backend/package.json`](../backend/package.json) and [`backend/tsconfig.json`](../backend/tsconfig.json)

---

## 3. API Specifications & Contracts

### Endpoints Overview

| Method | Route | Description | Auth Required | ALB Monitored |
|---|---|---|---|---|
| `GET` | `/` | Service metadata, active version & endpoint discovery | No | No |
| `GET` | `/health` | Liveness probe returning JSON status | No | Yes (every 15s) |
| `POST` | `/farmers` | Idempotent registration of farmer profile | Optional (Dev) / Yes | No |
| `GET` | `/farmers/:farmer_id` | Fetch registered farmer profile by primary key | Optional (Dev) / Yes | No |

---

### Detailed Endpoint Contracts

#### 1. `GET /health` (ALB Health Probe)
Queried continuously by the AWS ALB target group to verify instance availability.
* **Response Status:** `200 OK`
* **Response Body:**
  ```json
  {
    "status": "ok"
  }
  ```

#### 2. `GET /` (Service Metadata)
Returns service identification, version, and supported routes.
* **Response Status:** `200 OK`
* **Response Body:**
  ```json
  {
    "service": "farmer-profile-service",
    "version": "0.1.0",
    "description": "AgroConnect Ghana — farmer profile API (ICS 534, Group 3)",
    "endpoints": [
      { "method": "GET", "path": "/", "description": "service metadata" },
      { "method": "GET", "path": "/health", "description": "liveness probe" },
      { "method": "POST", "path": "/farmers", "description": "create a farmer" },
      { "method": "GET", "path": "/farmers/{farmer_id}", "description": "fetch a farmer" }
    ]
  }
  ```

#### 3. `POST /farmers` (Profile Ingestion)
Accepts farmer data submitted by the PWA client sync queue.
* **Request Headers:**
  * `Content-Type: application/json`
  * `Authorization: Bearer <token>` (enforced in production)
* **Request Body:**
  ```json
  {
    "name": "Kwame Mensah",
    "phone": "+233241234567",
    "region": "Northern",
    "language": "dag",
    "farm_size": 3.5
  }
  ```
* **Responses:**
  * `201 Created`: Profile registered successfully. Returns full record including assigned `id` and `created_at`.
  * `400 Bad Request`: Validation failure (empty or missing `name` or `phone`).

#### 4. `GET /farmers/:farmer_id`
Fetches a single farmer record by primary key.
* **Parameters:** `farmer_id` (numeric route parameter)
* **Responses:**
  * `200 OK`: Returns farmer record JSON.
  * `404 Not Found`: If no record matches `farmer_id` (`{"error": "farmer not found"}`).

---

## 4. Multi-Stage Containerization & ECR Packaging

The backend is packaged using a two-stage Alpine Dockerfile ([`backend/Dockerfile`](../backend/Dockerfile)):

```dockerfile
# --- build stage: install dev deps and compile TypeScript ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production deps + compiled output only ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]
```

### Key Security & Optimization Highlights
* **Unprivileged Execution:** Runs as `USER node` instead of `root`, preventing container escape vulnerabilities.
* **Lean Runtime Image:** Development dependencies (`typescript`, `@types/*`, `tsx`) are discarded after compilation; only compiled JavaScript in `dist/` and production dependencies ship in the runtime image (~120 MB).
* **Deterministic Tagging:** Automated GitHub Actions workflows push dual tags (`:latest` and `:${{ github.sha }}`) to Amazon ECR (`agroconnect-dev-backend`) in `af-south-1`.
* **Centralized CloudWatch Logging:** The container runs under Docker's native `awslogs` driver (`--log-driver=awslogs`), streaming stdout/stderr directly to CloudWatch log group `/${name_prefix}/app` under individual EC2 `INSTANCE_ID` streams. No logs are stored on ephemeral EC2 disk.
* **Dynamic Secret & Environment Injection:**
  * `DATABASE_URL`: Assembled on instance boot via EC2 user-data by pulling master credentials from AWS Secrets Manager.
  * `PHOTO_BUCKET`: Injected with the Terraform-provisioned S3 media bucket name (`agroconnect-media-<account-id>`).
  * `SMS_SECRET_ARN`: Injected with the AWS Secrets Manager ARN storing Arkesel SMS gateway credentials.
  * `AWS_REGION`: Defaults to `af-south-1`.

---

## 5. Load Balancing & Network Security

### Application Load Balancer Integration
* **Listeners:**
  * Port `80` (HTTP): Returns `HTTP 301` redirecting all traffic to HTTPS on port `443`.
  * Port `443` (HTTPS): Terminates TLS using an AWS Certificate Manager (ACM) DNS-validated certificate for `api.agroconnect.space`.
* **Target Group Configuration:**
  * Target type: `instance` (EC2)
  * Protocol & Port: `HTTP:8000`
  * Health check path: `/health`
  * Interval: `15 seconds`
  * Timeout: `5 seconds`
  * Healthy threshold: `2 consecutive successes`
  * Unhealthy threshold: `2 consecutive failures`

### Chained Security Groups
The backend instances accept traffic **exclusively** from the ALB security group:
$$\text{Public Internet} \xrightarrow{\text{Port 443}} \text{ALB SG} \xrightarrow{\text{Port 8000}} \text{App SG}$$
Direct inbound connections from the internet or other ports are blocked at the hypervisor layer.

---

## 6. Auto Scaling & Demand Management

AgroConnect scales compute nodes using **`ALBRequestCountPerTarget`** (see [ADR-008](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)):

* **Metric:** Sum of requests per EC2 target per 1-minute period.
* **Target Utilization:** `500 requests/minute/target` (~8 req/s per instance).
* **Capacity Bounds:**
  * Minimum instances: `1`
  * Desired instances: `1`
  * Maximum instances: `3`
* **Engineering Rationale:** An I/O-bound web service waiting on database queries or slow rural cellular uploads blocks worker threads without burning significant CPU. Scaling based on request count provides an immediate, proactive response to seasonal registration surges.

---

## 7. Local Development & Testing

### Running with tsx Watch
```bash
cd backend
npm ci
npm run dev
# Starts server at http://localhost:3001 with hot reloading
```

### Compiling and Running Production Server
```bash
npm run build
npm start
# Runs compiled server from dist/server.js
```

### Running with Docker
```bash
docker build -t agroconnect-backend .
docker run -p 8000:8000 -e PORT=8000 agroconnect-backend
curl http://localhost:8000/health
# {"status":"ok"}
```
