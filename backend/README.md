# AgroConnect Backend — `farmer-profile-service`

**Lead:** Elise Kennedy-Angbo ([@Elise-Oyi](https://github.com/Elise-Oyi))  
**Production Endpoint:** [`https://api.agroconnect.space`](https://api.agroconnect.space)  
**Hosting Infrastructure:** AWS EC2 Auto Scaling Group (`af-south-1` Cape Town) behind ALB  
**Architectural Decisions:** [ADR-003 (Stateless Compute)](../docs/architecture-decisions.md#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute), [ADR-006 (HTTPS/ACM)](../docs/architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-008 (Target-Tracking Scaling)](../docs/architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget), [ADR-011 (Node.js/TypeScript Runtime)](../docs/architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript)

---

## Overview

The `farmer-profile-service` is the core application backend for AgroConnect Ghana. It handles high-throughput farmer registrations and queries from field extension agents operating mobile devices across rural Ghana.

Migrated from Python/FastAPI to **Node.js 24**, **Express 5**, and **TypeScript** (see [ADR-011](../docs/architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript)) to establish a unified TypeScript domain model with the frontend PWA, simplify contract verification, and run as an unprivileged container process.

---

## Technology Stack

* **Runtime:** Node.js 24 LTS
* **Framework:** Express 5 (`^5.2.1`)
* **Language:** TypeScript 7 (`^7.0.2`) with `NodeNext` module resolution
* **Dev Runner:** `tsx` for live-reloading watch mode
* **Containerization:** Multi-stage Alpine Dockerfile (`node:24-alpine`) running unprivileged as `USER node`
* **Logging:** Native Docker `awslogs` driver shipping container stdout/stderr to Amazon CloudWatch Logs (`/agroconnect-dev/app`)

---

## API Endpoints

| Method | Path | Description | Response Status |
|---|---|---|---|
| `GET` | `/` | Service metadata, active version & endpoint discovery | `200 OK` |
| `GET` | `/health` | Liveness probe polled every 15s by AWS ALB | `200 OK` |
| `POST` | `/farmers` | Idempotent registration of a farmer profile | `201 Created` / `400 Bad Request` |
| `GET` | `/farmers/:farmer_id` | Retrieve registered farmer profile by primary key | `200 OK` / `404 Not Found` |

### Sample Payloads

#### `POST /farmers`
```json
{
  "name": "Kwame Mensah",
  "phone": "+233241234567",
  "region": "Northern",
  "language": "dag",
  "farm_size": 3.5
}
```

#### Response (`201 Created`)
```json
{
  "id": 1,
  "name": "Kwame Mensah",
  "phone": "+233241234567",
  "region": "Northern",
  "language": "dag",
  "farm_size": 3.5,
  "created_at": "2026-10-07T22:30:00.000Z"
}
```

---

## Local Development

### 1. Install Dependencies
```bash
npm ci
```

### 2. Run with Live Reloading
```bash
npm run dev
# Starts server at http://localhost:3001 using tsx watch
```

### 3. Build & Run Production Bundle
```bash
npm run build
# Compiles TypeScript to dist/

npm start
# Runs compiled server from dist/server.js
```

---

## Docker Containerization

The backend packages into a lightweight (~120 MB), two-stage Docker image:

```bash
# Build container image
docker build -t agroconnect-backend .

# Run container (maps port 8000)
docker run -p 8000:8000 -e PORT=8000 agroconnect-backend

# Verify health probe
curl http://localhost:8000/health
# {"status":"ok"}
```

---

## CI/CD Deployment Workflow

1. **Pull Requests:** Evaluated by [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Installs dependencies (`npm ci`), builds TypeScript (`npm run build`), starts the compiled server, and verifies the `/health` endpoint.
2. **Merge to `main`:** Deployed via [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Builds Docker image, pushes dual tags (`:latest` and `:${{ github.sha }}`) to Amazon ECR (`agroconnect-dev-backend`), and initiates an automated rolling instance refresh with concurrency retry protection (`InstanceRefreshInProgress`) across the Auto Scaling Group in `af-south-1`.

*Full deep dive:* See [`../docs/api-tier.md`](../docs/api-tier.md) and [`../docs/ci-cd-and-operations.md`](../docs/ci-cd-and-operations.md).