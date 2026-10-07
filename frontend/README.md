# AgroConnect Frontend — Progressive Web App (PWA)

**Lead:** Perfect Avugla ([@PeaElorm](https://github.com/PeaElorm))  
**Live Application:** [`https://app.agroconnect.space`](https://app.agroconnect.space)  
**Hosting Provider:** AWS Amplify Hosting (`eu-west-1` / CloudFront Global Edge)  
**Architectural Decisions:** [ADR-002](../docs/architecture-decisions.md#adr-002-offline-first-client-architecture-with-client-generated-identity), [ADR-009](../docs/architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)

---

## Overview

The AgroConnect client is an offline-first Progressive Web App (PWA) built with **React 19**, **TypeScript**, and **Vite**, located in [`agroconnect-pwa/`](./agroconnect-pwa). It is purpose-built for agricultural extension agents conducting farmer registrations in rural Ghanaian communities where cellular network connectivity is intermittent or absent.

### Key Architectural Pillars
1. **The App Never Waits for the Network:** All user interactions, form entries, and photo captures persist immediately to client-side storage. The interface is 100% functional in airplane mode.
2. **Client-Generated Identity (`clientId`):** Every profile receives an immutable cryptographically secure UUID on the client device. Sync retries against the backend are completely idempotent.
3. **Local Storage Engine:** Powered by **IndexedDB** using **Dexie** across isolated tables (`drafts`, `farmers`, `photos`), with a 300 ms debounced autosave mechanism.
4. **Hardware Resilience:**
   * **Photo Compression:** On-device canvas compression downsamples raw camera captures to `<100 KB` JPEGs before queueing.
   * **Direct GPS Polling:** Uses browser geolocation with direct satellite fallback, operating independently of cellular tower triangulation.
5. **Ghanaian Localization:** Custom typography supporting local orthographies (Ewe `Ɛɛ`, `Ɔɔ`, `Ŋŋ`, `Đɖ`, `Ƒƒ`, `Ɣɣ`, `Ʋʋ`, `Ʒʒ`, Dagbani, Twi) and Ghana Cedi formatting (`₵`).

---

## Directory Structure

```
frontend/
├── README.md                     # Frontend tier overview (this file)
└── agroconnect-pwa/              # Production Vite + React 19 application
    ├── public/                   # Static assets, manifests, icons & local fonts
    ├── docs/                     # Client-backend interface specifications
    │   ├── API-CONTRACT.md       # PWA ↔ farmer-profile-service contract
    │   ├── AUTH-CONTRACT.md      # JWT authentication & session refresh spec
    │   └── ADMIN-CONTRACT.md     # Coordinator & administrative endpoints
    ├── mock-server/              # Mock API server for local end-to-end testing
    ├── src/
    │   ├── apps/                 # Top-level screen workflows & navigation
    │   ├── auth/                 # Authentication state & token management
    │   ├── components/           # Reusable UI widgets & design system
    │   ├── config.ts             # Environment-aware endpoints & runtime flags
    │   ├── data/                 # Static lookup tables (regions, crops)
    │   ├── db/                   # Dexie IndexedDB schemas & table hooks
    │   ├── domain/               # Core business models & validation logic
    │   ├── hooks/                # Custom React hooks (GPS, online status, autosave)
    │   ├── i18n/                 # Localization & Ghanaian language translations
    │   ├── lib/                  # Canvas image compression & utilities
    │   ├── screens/              # Farmer registration, list, sync status views
    │   ├── styles/               # Styling & Tailwind design system
    │   └── sync/                 # Background queue & retry orchestrator
    ├── package.json              # Dependencies & npm scripts
    ├── vite.config.js            # Vite configuration with PWA service worker
    └── tsconfig.json             # TypeScript configuration
```

---

## API & Backend Integration

The client syncs with the containerized backend over HTTPS:
* **Production API:** `https://api.agroconnect.space`
* **Local Dev API:** `http://localhost:8000` (see [`../backend/README.md`](../backend/README.md))

### Endpoint Contracts
* `GET /` — API metadata & health
* `GET /health` — Liveness check
* `POST /farmers` — Idempotent farmer registration (accepts client-generated `clientId`)
* `GET /farmers/{id}` — Retrieve registered profile
* `POST /farmers/{id}/photo` — Upload compressed JPEG photo payload

*Full contract specifications:* See [`agroconnect-pwa/docs/API-CONTRACT.md`](./agroconnect-pwa/docs/API-CONTRACT.md).

---

## Local Development & Testing

Navigate into the application directory:

```bash
cd frontend/agroconnect-pwa
```

### Install Dependencies
```bash
npm install
```

### Run Local Development Server
```bash
npm run dev
# Starts local Vite development server at http://localhost:5173
```

### Run Mock API Server
```bash
npm run mock
# Runs standalone mock server passing all API-CONTRACT test suites
```

### Run Tests & Typechecks
```bash
npm run typecheck    # Validate TypeScript types
npm run test         # Execute Vitest test suites
npm run lint         # Lint using oxlint
```

### Production Build
```bash
npm run build
# Outputs optimized production build to dist/
```

---

## Deployment & Hosting

The frontend is deployed automatically via **AWS Amplify Hosting**:
* **Build Spec:** [`../amplify.yml`](../amplify.yml) at the repository root.
* **Continuous Deployment:** Every merge to `main` triggers an automated build and edge cache invalidation.
* **Environment Variable:** `VITE_API_URL=https://api.agroconnect.space` defined in `.env.production`.
* **Deep-Dive Documentation:** See [`../docs/client-tier.md`](../docs/client-tier.md) and [`../docs/architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1`](../docs/architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1).
