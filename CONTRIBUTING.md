# Contributing

`main` is the deploy branch. We don't push to it directly — every change arrives
through a pull request, and **merging to `main` is what ships to production**.

## The flow

1. Branch off an up-to-date `main`:
   - `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`
2. Open a pull request into `main`.
3. CI runs automatically ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):
   - `backend smoke test` — installs deps and imports the app
   - `terraform fmt + validate` — checks `infra/`
4. [`.github/CODEOWNERS`](./.github/CODEOWNERS) requests a review from whoever owns
   the paths you touched.
5. Merge (squash) once it's green and approved. The push to `main` triggers
   [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) → build → push
   to ECR → ASG instance refresh.

Nothing deploys from a branch. The deploy job is guarded with
`if: github.ref == 'refs/heads/main'`, so even a manual **Actions → Run workflow**
from another branch is a no-op.

## Who owns what

Summary of [`CODEOWNERS`](./.github/CODEOWNERS):

| Path | Owner |
| --- | --- |
| `backend/` | Elise Kennedy-Angbo (`@Elise-Oyi`) |
| `frontend/` | Perfect Avugla (`@PeaElorm`) |
| `infra/`, `.github/`, `scripts/` | Eugene Sewor (`@eugene-sew`) |
| everything else | Joseph Etse (`@josetseph`) |

## Branch protection for `main`

These live in GitHub, not in the repo. Configure under **Settings → Branches → Add
branch protection rule** for `main`:

- Require a pull request before merging
- Require at least 1 approval
- **Require review from Code Owners**
- Require status checks to pass: `backend smoke test`, `terraform fmt + validate`
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

## Commit messages

Conventional-ish, imperative, scoped:

```
feat(backend): add GET / service metadata
fix(infra): keep ALB SG description to avoid replacement
chore(ci): gate merges with terraform validate
```
