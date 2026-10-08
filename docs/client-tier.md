# Client Tier — Offline-First Progressive Web App (PWA)

**Lead:** Perfect Avugla ([@PeaElorm](https://github.com/PeaElorm))  
**Production Domain:** [`https://app.agroconnect.space`](https://app.agroconnect.space)  
**Hosting Infrastructure:** AWS Amplify Hosting (`eu-west-1` / CloudFront Global Edge)  
**Associated Architectural Records:** [ADR-002 (Offline-First Client)](./architecture-decisions.md#adr-002-offline-first-client-architecture-with-client-generated-identity), [ADR-009 (Amplify Hosting)](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1), [L-001 & L-002](./learnings.md)

---

## 1. Problem Statement & Field Environment

In rural Ghana—particularly across the Northern, Upper East, Upper West, and Savannah regions—agricultural extension agents operate under severe technical constraints:
* **Cellular Blackspots:** Farming settlements frequently lack reliable 2G/3G/4G cellular coverage.
* **Transient Connectivity:** Agents commute between disconnected field plots and market towns where signal is intermittently available.
* **Low-Tier Hardware:** Agents rely on entry-level Android devices with constrained RAM and limited battery endurance.
* **Data Cost Sensitivity:** Cellular data is metered and costly; transmitting bloated payloads or re-downloading static web assets over cellular radios is unsustainable.

A conventional single-page application relying on synchronous REST requests fails in this operational setting. If a network call drops during registration, field work halts, data is lost, or duplicate records are created. AgroConnect solves this by adopting a strict **offline-first** client architecture.

---

## 2. Core Architectural Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Field Agent Device (Offline)                      │
│                                                                        │
│   Keystrokes / Forms ──> 300ms Debounce ──> Dexie IndexedDB (Local)    │
│   Camera Capture     ──> Canvas Downscale ─> Compressed JPEG (<100KB)  │
│   GPS Satellite Fix  ──> Geolocation Hook ─> Lat / Lng / Accuracy      │
│   Identity Creation  ──> Crypto UUID       ─> Immutable `clientId`     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Network Available? (Online Event)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Background Sync Engine                          │
│                                                                        │
│   1. Read Unsynced Queue from IndexedDB                                │
│   2. POST https://api.agroconnect.space/farmers (Idempotent clientId)  │
│   3. POST https://api.agroconnect.space/farmers/{id}/photo (JPEG)      │
│   4. Handle Responses:                                                 │
│      ├── 201 Created / 200 OK  ──> Mark "Sent" in IndexedDB            │
│      ├── 409 Conflict          ──> Mark "Needs Attention" (Duplicate) │
│      └── 5xx / Network Timeout ──> Exponential Backoff Retry           │
└────────────────────────────────────────────────────────────────────────┘
```

### Principle 1: The App Never Waits for the Network
Every user action, form step, and image capture is written synchronously to local browser storage (**IndexedDB**) before any network communication is attempted. The interface delivers instant feedback with zero spinners or blocking loaders.

### Principle 2: Client-Generated Permanent Identity (`clientId`)
Entities generate a cryptographically random UUID (`clientId`) directly on the client device upon record instantiation. When synchronizing with the backend:
* The backend respects the `clientId` as an idempotency key.
* Duplicate HTTP submissions (caused by connection drops or retried POST requests) return `200 OK` with the existing server ID rather than generating duplicate profiles.

### Principle 3: Edge-Optimized Payloads
The client does not offload raw binary camera captures to the cloud. Instead, device hardware (HTML5 Canvas) compresses images client-side to `<100 KB` JPEGs before queueing, reducing radio transmission power and upload latency by over 95%.

---

## 3. Technology Stack & Key Libraries

| Component | Technology | Rationale |
|---|---|---|
| **Framework** | **React 19** & **TypeScript** | Strict typing across domain models, modern hook paradigms, and high rendering performance on budget mobile devices. |
| **Build Tooling** | **Vite 8** | Rapid build times, optimal tree-shaking, and lightweight static output bundles (`dist/`). |
| **Offline Persistence** | **Dexie.js (`^4.4.6`)** | High-performance IndexedDB wrapper providing declarative schema definitions, transactional guarantees, and live reactive queries via `dexie-react-hooks`. |
| **PWA Service Worker** | **`vite-plugin-pwa` (`^2.0.0`)** | Auto-generates standard Service Worker caching strategies (`precacheAndRoute`), web app manifest, and offline shell caching. |
| **Mock Engine** | **Node.js Mock Server** | Standalone mock server (`mock-server/server.mjs`) executing identical contract tests to guarantee API compatibility before backend merges. |

---

## 4. Local Storage Engine & Schema

AgroConnect utilizes **IndexedDB** as its single source of truth during field operations. The database is partitioned into three specialized object stores:

```typescript
// Schema Definition (src/db/index.ts)
db.version(1).stores({
  drafts: 'id, updatedAt',
  farmers: 'clientId, phone, syncStatus, registeredAt',
  photos: 'clientId, capturedAt'
});
```

### Table Breakdown
1. **`drafts`:**
   * Houses in-progress registration forms.
   * Auto-saved automatically on every keystroke via a **300 ms debounce hook** (`useAutosave`).
   * Eliminates data loss if the device battery dies or the browser tab is accidentally terminated.
2. **`farmers`:**
   * Stores completed farmer profiles awaiting cloud dispatch or archived locally.
   * Keyed on `clientId` (UUIDv4).
   * Tracks `syncStatus`: `'draft' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'error'`.
3. **`photos`:**
   * Stores compressed Base64/Blob image data associated with a farmer's `clientId`.
   * Partitioned from the main profile table to ensure high-speed querying and minimal memory overhead during list rendering.

---

## 5. Hardware Resilience & Edge Processing

### On-Device Canvas Photo Compression
Field devices frequently capture photos at high resolutions ($12\text{--}48\text{ MP}$), yielding $3\text{--}12\text{ MB}$ files. Uploading these over rural 2G/3G connections incurs massive battery drain and frequent timeouts.

The client pipeline downsamples images via an off-screen HTML5 `<canvas>` element:
```typescript
// Image Compression Flow
export async function compressPhoto(file: File, maxDim = 1200, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
  const canvas = new OffscreenCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await canvas.convertToBlob({ type: 'image/jpeg', quality });
}
```
* **Result:** Typical photo payload is reduced from $\sim 4.2\text{ MB}$ to under $85\text{ KB}$ with negligible perceptual loss for farmer identification cards.

### Direct Satellite GPS Polling
* Uses the HTML5 Geolocation API (`navigator.geolocation.getCurrentPosition`) configured with `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }`.
* Bypasses cellular triangulation when towers are unreachable by forcing direct GPS satellite polling.
* Captures latitude, longitude, elevation, and accuracy rating in meters.

---

## 6. Background Synchronization Engine

The sync orchestrator (`src/sync/`) manages the lifecycle of local records and reconciles them with the backend runtime:

```
[Local Record in IndexedDB]
        │
        ├── Network offline? ──> Keep in 'pending' queue
        └── Network online?  ──> Transition to 'syncing'
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        POST /farmers (JSON)                  POST /farmers/{id}/photo
                    │                                     │
    ┌───────────────┼───────────────┐                     │
    ▼               ▼               ▼                     ▼
 HTTP 201        HTTP 200        HTTP 409              HTTP 200
(Created)      (Idempotent)    (Phone Clash)          (Uploaded)
    │               │               │                     │
    └───────┬───────┘               ▼                     │
            ▼               Status: 'conflict'            │
    Status: 'synced'       (Requires Agent Fix)           │
            │                                             │
            └──────────────────────┬──────────────────────┘
                                   ▼
                       Record Complete & Verified
```

### Conflict Resolution Strategy
* **Idempotent Retry:** If the server returns `200 OK` for an existing `clientId`, the client accepts the returned server ID and transitions the status to `'synced'`.
* **Phone Collision (`HTTP 409`):** If a farmer's phone number already exists under a *different* `clientId` (e.g., registered by another agent in a neighboring village), the record transitions to `'conflict'`. The agent is prompted with an inline alert to review the contact details.
* **Transient Network Failure:** Network timeouts, HTTP 408, 429, or 5xx responses stop the run and keep the record in `'pending'` for the next one.

### When Sync Runs
* **While the app is open:** on launch, right after anything is saved, when the phone comes back online, when the app returns to the foreground, and every 30 seconds.
* **After the app is closed:** whenever a run ends with items still waiting, the app registers a Background Sync (`agroconnect-sync`). The browser wakes the service worker (`src/sw.ts`) once there is signal, and it sends the queue with the session token saved on the phone. If items are still waiting after that, the event fails and the browser retries later with its own back-off. Signed-out phones send nothing.
* **One sender at a time:** the app and the service worker share the IndexedDB queue, so each run holds a Web Lock (`agroconnect-sync`).
* **Browser support:** Background Sync works in Chrome and other Chromium browsers on Android, which is what field agents use. On iOS Safari and Firefox the queue waits until the app is opened again.

---

---

## 7. Application Modules & Field Workflows

The PWA integrates five core workflows tailored for rural smallholders and field extension agents:

1. **Farmer Registration & Profiles:**
   * Rapid digital intake capturing personal demographics, contact info, land size, and GPS coordinates.
   * Direct camera capture with client-side canvas compression for identification photos.
2. **Produce Marketplace & Trading (`src/screens/farmer/`):**
   * **Browse Produce:** Real-time visibility into local market prices and active crop listings across communities.
   * **Sell Produce:** Direct listing workflow enabling farmers to advertise harvested yields (maize, cassava, tomato, cocoa) with pricing in Ghana Cedis (`₵`).
3. **Mobile Money Wallet & Payments (`src/payments/`):**
   * Integrated wallet interface supporting local Mobile Money (MTN MoMo, Telecel Cash, AT Money) transactions.
   * Active payment status polling with automatic cache reconciliation.
4. **Agrarian Weather & Advisory (`src/weather/`, `src/advice/`):**
   * Dynamic weather forecasts powered by Open-Meteo caching regional temperature, rainfall probability, and wind metrics.
   * Localized agronomic advisory cards delivering actionable recommendations tailored to regional soil and seasonal planting patterns.
5. **Crop Health Verification & Field Checks (`src/screens/staff/`):**
   * Extension agents conduct on-site parcel inspections, logging crop health observations, pest pressures, and plot status updates.
6. **Administrative & Agent Hierarchy (`src/screens/admin/`):**
   * Regional coordinators manage field agents, review registration queues, and track village profiling progress.

---

## 8. Ghanaian Localization & Linguistic Resilience

AgroConnect is tailored to Ghanaian operational realities:
* **Special Orthography Support:** Embedded web fonts (**Onest** and **Unbounded**) include custom subsets supporting Ghanaian national language alphabets (Ewe, Twi, Dagbani):
  * Characters: `Ɛ / ɛ` (open E), `Ɔ / ɔ` (open O), `Ŋ / ŋ` (eng), `Đ / ɖ` (African D), `Ƒ / ƒ` (F with hook), `Ɣ / ɣ` (gamma), `Ʋ / ʋ` (V with hook), `Ʒ / ʒ` (ezh).
* **Currency Formatting:** Native Ghana Cedi symbol (`₵`) formatting for financial profiling, produce listings, and loan estimations.
* **App Language Translations (ADR-010):**
  * Complete translation dictionaries for **Twi (`tw.json`)** and **Ewe (`ee.json`)** covering all 424 application strings without falling back to English.
  * Human-curated drafts ensure culturally accurate agricultural terminology (e.g., distinguishing "signal strength" from "symbol/sign", and "sign out" from "signing a contract").
  * **Automated Translation Testing:** A dedicated Vitest suite ([`src/i18n/translate.test.ts`](../frontend/agroconnect-pwa/src/i18n/translate.test.ts)) automatically verifies that every translated key matches `en.json` and preserves all dynamic `{placeholder}` tokens (e.g. `{name}`, `{price}`, `{date}`).
* **Demographic Language Choice:** Dagbani (`dag`) remains a valid *preferred language* recorded on farmer profiles, even though it is excluded from the app interface picker until native translations are finalized (see [ADR-010](./architecture-decisions.md#adr-010-app-languages-limited-to-english-twi-and-ewe)).

---

## 9. AWS Amplify Hosting Architecture & Edge Performance

The PWA is hosted via **AWS Amplify Hosting** in `eu-west-1` and fronted by Amazon CloudFront:
* **Live Origin:** `eu-west-1` (Ireland) — selected as the closest Amplify-supported region to West Africa (see [ADR-009](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)).
* **Custom Domain:** `app.agroconnect.space` with automated ACM TLS termination.
* **Farmer Latency Impact:** Zero penalty on field operations:
  * Static web assets (HTML, JS, CSS, service worker) are cached at CloudFront Points of Presence in **Lagos, Cape Town, and Johannesburg**.
  * Repeat visits load directly from the on-device Service Worker cache (**0 ms** network latency).
  * Sync API requests bypass Europe entirely, communicating directly with the ALB in **`af-south-1` (Cape Town)** over HTTPS at the empirically measured **74 ms median RTT**.

