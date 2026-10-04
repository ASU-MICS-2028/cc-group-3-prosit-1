# AgroConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing, PROSIT 1.

Monorepo for the course project:

- `backend/` — FastAPI `farmer-profile-service` (Docker-ized)
- `infra/` — Terraform for VPC, ALB, ASG, ECR in `af-south-1`
- `.github/workflows/` — build → ECR push → ASG instance refresh on push to `main`
- `scripts/` — one-off ops scripts (IAM team user bootstrap)

See each folder's README for details.

## Team

- Joseph Etse — project manager
- Eugene Sewor — infra / cloud
- Elise Kennedy-Angbo — data lead
- Perfect Avugla — frontend lead
