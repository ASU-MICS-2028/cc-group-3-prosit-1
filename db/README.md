# Database

The schema lives with the service that owns it: [`backend/migrations/`](../backend/migrations). Each file is applied once, in name order, when the API boots (`backend/src/migrate.ts`). A Postgres advisory lock means two instances starting together never apply the same migration twice, and `schema_migrations` records what has run.

- **Design:** [`DATA-CONTRACT.md`](../DATA-CONTRACT.md) (storage rules) and the wire contracts in [`frontend/agroconnect-pwa/docs/`](../frontend/agroconnect-pwa/docs).
- **Current schema:** [`backend/migrations/001_initial.sql`](../backend/migrations/001_initial.sql).
- **Adding a change:** create `backend/migrations/002_<what>.sql`. Never edit a migration that has already run on RDS; write a new one.

There is no separate migration step in CI or deploy: the ASG's next instance refresh boots the new image, which migrates before it starts serving.
