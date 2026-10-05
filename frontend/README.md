# AgroConnect Frontend

Owner: Perfect Avugla (frontend lead).

This folder is a placeholder so the frontend can land here without restructuring
the repo. No framework has been chosen yet — pick one, scaffold it here (with its
own `.gitignore`), and open a PR. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## API it talks to

The backend is served over HTTPS at **`https://api.agroconnect.space`**:

- `GET  /` — service metadata
- `GET  /health` — liveness probe
- `POST /farmers` — create a farmer profile
- `GET  /farmers/{id}` — fetch a farmer profile
- Interactive docs: `https://api.agroconnect.space/docs`

For local development, run the backend on `http://localhost:8000` (see
[`../backend/README.md`](../backend/README.md)) and point the dev server there.

## Conventions

- `node_modules/` is already ignored at the repo root.
- Keep build output (`dist/`, `.next/`, …) out of git — add a `.gitignore` here.
- Hosting/deploy is not wired up yet; talk to Eugene (infra) before adding a
  pipeline or a bucket.
