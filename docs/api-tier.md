# API Tier — Containerized Application Backend

**Lead:** Elise Kennedy-Angbo ([@Elise-Oyi](https://github.com/Elise-Oyi))  
**Production Endpoint:** [`https://api.agroconnect.space`](https://api.agroconnect.space)  
**Interactive API Docs:** [`https://api.agroconnect.space/docs`](https://api.agroconnect.space/docs)  
**Associated Architectural Records:** [ADR-003 (Stateless Compute)](./architecture-decisions.md#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute), [ADR-006 (HTTPS via ACM)](./architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-008 (Target-Tracking Scaling)](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)

---

## 1. Role & Architectural Responsibilities

The API tier is the ingestion engine of the AgroConnect platform. It provides high-throughput, idempotent profile registration and retrieval for field agents operating across Ghana.

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
│   │ EC2 t3.micro (Docker runtime)                                │     │
│   │                                                              │     │
│   │   Uvicorn Process Manager                                    │     │
│   │      └── FastAPI Application (farmer-profile-service)        │     │
│   │             ├── GET  /                 (Metadata)            │     │
│   │             ├── GET  /health           (ALB Liveness Probe)  │     │
│   │             ├── POST /farmers          (Idempotent Ingest)   │     │
│   │             ├── GET  /farmers/{id}     (Profile Fetch)       │     │
│   │             └── POST /farmers/{id}/photo (Week 4 Media)      │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Design Goals
1. **Stateless Scalability:** Individual compute nodes retain zero local session state. Requests can hit any instance in the Auto Scaling Group (ASG).
2. **Idempotent Ingestion:** Handles duplicate submissions gracefully when mobile clients reconnect and flush queued records.
3. **Low-Latency Response:** Built on **FastAPI** and **Starlette**, achieving sub-10 ms internal processing overhead to complement the 74 ms network latency to Ghana.
4. **Zero-Trust Network Perimeter:** The service binds strictly to internal interfaces in private subnets with no public IPv4 addresses and no SSH access.

---

## 2. Technology Stack & Implementation

* **Runtime:** Python 3.12
* **Framework:** **FastAPI** (`0.115.x`) with **Pydantic v2** for declarative schema validation.
* **ASGI Server:** **Uvicorn** (`0.32.x`) running high-performance `uvloop` and `httptools`.
* **Container Base:** `python:3.12-slim` (minimal attack surface, ~150 MB final image size).
* **Source Location:** [`backend/app/main.py`](../backend/app/main.py).

---

## 3. API Specifications & Contracts

### Endpoints Overview

| Method | Route | Description | Auth Required | ALB Monitored |
|---|---|---|---|---|
| `GET` | `/` | Service metadata, active version & endpoint discovery | No | No |
| `GET` | `/health` | Liveness probe returning JSON status | No | Yes (every 15s) |
| `POST` | `/farmers` | Idempotent registration of farmer profile | Optional (Dev) / Yes | No |
| `GET` | `/farmers/{farmer_id}` | Fetch registered farmer profile by ID | Optional (Dev) / Yes | No |
| `GET` | `/docs` | Interactive Swagger UI documentation | No | No |
| `GET` | `/openapi.json` | OpenAPI 3.1 schema specification | No | No |

---

### Detailed Endpoint Contracts

#### 1. `GET /health` (ALB Health Probe)
Queried continuously by the AWS ALB target group to determine instance availability.
* **Response Status:** `200 OK`
* **Response Body:**
  ```json
  {
    "status": "ok",
    "service": "farmer-profile-service"
  }
  ```

#### 2. `POST /farmers` (Profile Ingestion)
Accepts farmer data submitted by the PWA client sync queue.
* **Request Headers:**
  * `Content-Type: application/json`
  * `Authorization: Bearer <token>` (enforced in production)
* **Request Body:**
  ```json
  {
    "clientId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Kwame Mensah",
    "phone": "+233241234567",
    "region": "Northern",
    "language": "dag",
    "farm_size": 3.5
  }
  ```
* **Responses:**
  * `201 Created`: Profile registered successfully. Returns full record including assigned `id` and `created_at`.
  * `200 OK`: Duplicate `clientId` detected. Returns the existing record without duplicating entries in the database.
  * `400 Bad Request`: Validation failure (empty name, missing phone).
  * `409 Conflict`: Phone number already registered under a different `clientId`.

#### 3. `GET /farmers/{farmer_id}`
Fetches a single farmer record by primary key.
* **Parameters:** `farmer_id` (integer)
* **Responses:**
  * `200 OK`: Returns farmer record JSON.
  * `404 Not Found`: If no record matches `farmer_id`.

---

## 4. Containerization & ECR Packaging

The backend is packaged as an immutable Docker container via [`backend/Dockerfile`](../backend/Dockerfile):

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Build & Registry Workflow
* Images are built automatically in GitHub Actions on push to `main` ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)).
* Images are published to **Amazon ECR** (`agroconnect-dev-backend`) in `af-south-1` using two tags:
  1. `:latest` — The current active deployment pointer.
  2. `:${{ github.sha }}` — Immutable commit SHA for deterministic tracking and rollback capabilities.

---

## 5. Load Balancing & Network Security

### Application Load Balancer Integration
* **Listeners:**
  * Port `80` (HTTP): Automatically returns `HTTP 301` redirecting all traffic to HTTPS on port `443`.
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

Rather than traditional CPU-based metrics, AgroConnect scales compute nodes using **`ALBRequestCountPerTarget`** (see [ADR-008](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)):

* **Metric:** Sum of requests per EC2 target per 1-minute period.
* **Target Utilization:** `500 requests/minute/target` (~8 req/s per instance).
* **Capacity Bounds:**
  * Minimum instances: `1`
  * Desired instances: `1`
  * Maximum instances: `3`
* **Engineering Rationale:** An I/O-bound web service waiting on database queries or slow rural cellular uploads blocks worker threads without burning significant CPU. Scaling based on request count provides an immediate, proactive response to seasonal registration surges.

---

## 7. Local Development & Testing

### Running with Uvicorn
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Running with Docker
```bash
cd backend
docker build -t agroconnect-backend .
docker run -p 8000:8000 agroconnect-backend
curl http://localhost:8000/health
```

