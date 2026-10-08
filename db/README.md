# Database

The schema lives with the service that owns it: [`backend/migrations/`](../backend/migrations). Each file is applied once, in name order, when the API boots (`backend/src/migrate.ts`). A Postgres advisory lock means two instances starting together never apply the same migration twice, and `schema_migrations` records what has run.

- **Design:** [`DATA-CONTRACT.md`](../DATA-CONTRACT.md) (storage rules) and the wire contracts in [`frontend/agroconnect-pwa/docs/`](../frontend/agroconnect-pwa/docs).
- **Current schema:** [`backend/migrations/001_initial.sql`](../backend/migrations/001_initial.sql), then `002_market_prices_and_advice.sql`, `003_indexes_and_delete_policy.sql` and `004_feedback_audit.sql`.
- **Adding a change:** create `backend/migrations/005_<what>.sql` (the next free number). Never edit a migration that has already run on RDS; write a new one.

There is no separate migration step in CI or deploy: the ASG's next instance refresh boots the new image, which migrates before it starts serving.

## Rollback strategy

Migrations are **forward-only**. There are no down-migrations and `schema_migrations` records only the
file names that ran (no checksum), so a file that has run is immutable — correcting it means writing a
new migration.

- **A migration fails on boot:** each file runs in its own transaction, so it rolls back and is not
  recorded; the next instance boot retries it. Fix the file (it has not been applied anywhere yet) and
  redeploy, or write a follow-up migration if it already reached production.
- **A migration applied but must be undone:** write a new migration that reverses it (drop the index,
  restore the constraint, …). Never delete the old file.
- **Data damage:** restore the RDS instance from an automated snapshot or use point-in-time recovery,
  then re-apply anything the API wrote since. Snapshots are retained for 7 days (see the `database`
  Terraform module).

## Backups

RDS takes automated daily snapshots (7-day retention) and supports point-in-time recovery; the `database`
Terraform module configures this. To prove a dump restores, run the check against a dev database with a
`postgresql-client` at least the server's major version:

```bash
DATABASE_URL=postgres://user:pass@host:5432/agroconnect scripts/verify-backup-restore.sh
```

It dumps the database, restores the dump into a scratch database on the same server, and compares row
counts for the core tables (`farmers`, `users`, `payments`, `loan_requests`, `crop_checks`, `listings`,
`feedback`, `audit_log`).
