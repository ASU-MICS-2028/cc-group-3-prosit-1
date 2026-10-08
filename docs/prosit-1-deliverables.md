# Prosit 1 Deliverables: What Was Built, and Where

A trace from each requirement in the Prosit brief ("The AgroConnect Ghana Challenge", Week 1: Foundation MVP, plus the PWA Functionality Guide) to the code, documents and evidence that meet it. **Status:** ✅ done and live · 🧑‍🤝‍🧑 needs people, not code · ⏭ later week of the brief.

## Week 1 technical requirements

| Requirement | Status | Where |
|---|---|---|
| PWA that functions offline | ✅ | Service worker precache, IndexedDB outbox, PIN unlock offline: [client-tier.md](./client-tier.md), ADR-002 |
| Multi-language (English, Twi, Ewe, Dagbani) | ✅ en/tw/ee · Dagbani recorded per farmer | All screens in en/tw/ee; Dagbani not an app language until a speaker translates it ([ADR-010](./architecture-decisions.md#adr-010-app-languages-limited-to-english-twi-and-ewe)) |
| Audio features for low-literacy users | ✅ English · 🧑‍🤝‍🧑 Twi/Ewe recordings | Listen buttons (consent in the farmer's language, advice, prices); recordings for Twi/Ewe in `public/audio/` |
| SMS/USSD for feature phones | ✅ built, off until Arkesel assigns a USSD code · ✅ SMS sign-in | USSD menu: prices, advice, registration, ask for a visit, weather ([USSD-CONTRACT](../frontend/agroconnect-pwa/docs/USSD-CONTRACT.md)); SMS codes via Arkesel |
| Photo and GPS capture | ✅ | Registration step "Proof": photo compressed to ~100 KB, GPS with accuracy; photos to S3 |
| Local data synchronisation | ✅ | Outbox + Background Sync + Web Locks ([ADR-012](./architecture-decisions.md#adr-012-service-worker-background-sync-with-web-locks-concurrency)); idempotent server ([ADR-013](./architecture-decisions.md#adr-013-one-backend-service-for-every-contract-on-postgres)) |

## Week 1 real data requirements

| Data | Status | Where |
|---|---|---|
| Personal information (name, location, contact, languages) | ✅ | Registration steps 1–2, GPS |
| Farm details (size, crops, **seasonal patterns, soil type**) | ✅ | Farm step |
| Technology access (phone type, data plan, preferred channel) | ✅ | Registration step "About" |
| Financial profile (income sources, banking, mobile money) | ✅ | Registration step "About"; dashboard breakdowns |
| Extension service history and needs assessment | ✅ | Needs and last visit in the profile; agents log every visit (topics, notes, next visit), offline |

## Technical architecture decisions ("choose and justify")

| Decision | Record |
|---|---|
| Cloud platform: AWS/Azure/GCP vs African providers | [ADR-001](./architecture-decisions.md#adr-001-cloud-provider--target-region-selection) (measured latency; MainOne/Rack Centre considered) |
| Database: SQL vs NoSQL | [ADR-014](./architecture-decisions.md#adr-014-relational-database-postgresql-over-nosql) |
| Authentication: phone vs national ID | [ADR-015](./architecture-decisions.md#adr-015-phone-number-verification-over-national-id-ghana-card) |
| Offline strategy and sync protocol | [ADR-002](./architecture-decisions.md#adr-002-offline-first-client-architecture-with-client-generated-identity), [ADR-012](./architecture-decisions.md#adr-012-service-worker-background-sync-with-web-locks-concurrency) |
| Security: encryption and privacy for rural data | [ADR-016](./architecture-decisions.md#adr-016-data-protection-and-privacy-for-rural-user-data) (Ghana Data Protection Act 843; known gaps listed) |

## PWA Functionality Guide checklist

| Check | Status | Where |
|---|---|---|
| Service worker registers | ✅ | `src/sw.ts` (injectManifest) |
| Web app manifest present and valid | ✅ | `vite.config.js` |
| Works offline with cached content | ✅ | Precache + cached data (prices, weather, wallet, profile) |
| "Add to Home Screen" prompt | ✅ | Install button on sign-in and Settings; iPhone instructions |
| Push notifications | ✅ built, off until the VAPID keys are set | Crop-check answers, payments, new advice, agent approval |
| Background sync | ✅ | ADR-012 |
| Responsive on all devices | ✅ | Phone-first layout; admin dashboard on desktop |
| Fast loading on slow networks | ✅ measured | Lighthouse: 95 performance on slow 4G; first 2G visit 8.1 s, then cached ([client-tier.md §10](./client-tier.md)) |

## Week 1 community integration

| Item | Status |
|---|---|
| User testing with Ashaiman Urban Farmers Association | 🧑‍🤝‍🧑 The association is seeded (`ashaiman-ufa`); testing sessions are for the team to run |
| Real farmer registration drive | 🧑‍🤝‍🧑 The live app is ready (agents sign up, are approved, register offline) |
| Cultural protocol for data collection | ✅ consent recorded per farmer and readable aloud · 🧑‍🤝‍🧑 community entry protocol |
| Chief and community leader engagement | 🧑‍🤝‍🧑 |

## Also built (beyond Week 1)

Market prices and advice entered by admins (Week 2's market information, without live exchange feeds); Open-Meteo weather; currencies for Ghana, Nigeria and Kenya; mobile money through a votex365 test checkout (Week 3, test mode); admin dashboard and CSV exports; audit log; CloudWatch dashboard and alarms; CI/CD with tests on every PR. Not attempted, being later weeks: country-level data sovereignty and sharding, Yoruba and Swahili, credit scoring, insurance pricing, crop-disease ML, blockchain, IoT, revenue model and SDG dashboard.

## Evidence

* **Live:** app https://app.agroconnect.space, API https://api.agroconnect.space (`/health`, `/ready`).
* **Tests:** frontend (Vitest, including the mock server's contract tests) and backend (the same contract tests against the real API, on PGlite and Postgres 16) run on every PR. A 26-check end-to-end run against the live API passed on 8 Oct 2026.
* **Switches waiting on people:** USSD needs a code from Arkesel (`ussd_user_id`, [USSD-CONTRACT](../frontend/agroconnect-pwa/docs/USSD-CONTRACT.md)); push needs the VAPID keys stored (`agroconnect-dev-vapid`, [infra/README](../infra/README.md)); Twi and Ewe audio needs recordings ([public/audio](../frontend/agroconnect-pwa/public/audio/README.md)).
* **Decisions:** [architecture-decisions.md](./architecture-decisions.md). **Ops:** [ci-cd-and-operations.md](./ci-cd-and-operations.md), [cloud-infrastructure.md](./cloud-infrastructure.md).
