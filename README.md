# AgroConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing, PROSIT 1.

Monorepo for the course project:

- `backend/` — FastAPI `farmer-profile-service` (Docker-ized)
- `frontend/` — web app (placeholder — see its README)
- `infra/` — Terraform for VPC, ALB, ASG, ECR in `af-south-1`
- `.github/workflows/` — CI on pull requests; build → ECR → ASG refresh on merge to `main`
- `scripts/` — one-off ops scripts (IAM team user bootstrap)

See each folder's README for details. Contributions land via PR — see
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for the branch, review, and deploy flow.

## Team

- Joseph Etse — project manager
- Eugene Sewor — infra / cloud
- Elise Kennedy-Angbo — data lead
- Perfect Avugla — frontend lead
