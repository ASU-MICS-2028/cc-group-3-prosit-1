# farmer-profile-service

FastAPI backend. In-memory store until Week 4.

## Endpoints

- `GET  /` — service metadata (name, version, endpoint list)
- `GET  /health`
- `POST /farmers` → `{name, phone, region?, language?, farm_size?}`
- `GET  /farmers/{id}`

## Local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Docker

```bash
docker build -t agroconnect-backend .
docker run -p 8000:8000 agroconnect-backend
curl http://localhost:8000/health
```

## Deploy

Push to `main` → GitHub Actions builds, pushes to ECR, triggers ASG instance
refresh. See `.github/workflows/deploy.yml`.
