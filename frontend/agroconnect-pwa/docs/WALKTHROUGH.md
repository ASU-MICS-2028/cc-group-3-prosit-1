# Walkthrough: try everything, step by step

For the team: how to run the app, what to click, what you should see, and which screenshots to take for the report. It grows after every build batch. Newest batch is at the bottom of "Batches"; the update log at the end says what changed and when.

## 1. Run it

Two terminals, both in `frontend/agroconnect-pwa`:

```bash
npm install        # first time only
npm run mock       # terminal 1: stand-in backend on http://localhost:4000
npm run dev        # terminal 2: the app on http://localhost:5173
```

Open `http://localhost:5173` in Chrome. Press F12, then the phone icon (device toolbar) and pick a width of about 360px, the size of a low-end Android.

The mock **restarts itself whenever its code changes** and keeps your data (farmers, accounts, approvals, sign-ins), and the app reloads itself too. You should never need to stop either one for a code change. `npm run mock:reset` is only for wiping everything and starting empty, and it does **not** restart itself. If a new feature seems missing after an update, reload the browser tab.

**Demo accounts** (the mock always has them; the live site has them while `seed_demo_accounts` is on in Terraform):

| Who | Sign in with | Password |
|-----|--------------|----------|
| Admin | `ADM-001` | `admin-test-pass` |
| Coordinator | `CO-001` | `coord-test-pass` |
| Field agent (approved) | `AG-0001` | `agent-test-pass` |
| Field agent (waiting for approval) | `+233200000099` | `pending-test-pass` |
| Farmer (demo) | `0200000010` | PIN `1234`: sign in with the PIN straight away, no code needed |
| Farmer (new) | any other Ghana phone number, for example `0241234567` | none: the code appears on screen, then you choose a 4-digit PIN |

### Or use the live app

Open **https://app.agroconnect.space** on a phone (Chrome on Android) or in Chrome with the device toolbar. It talks to the real API (`api.agroconnect.space`): Postgres, S3 photos, real SMS. Everything below works the same, with three differences:

1. **Sign-in codes arrive by SMS** to the number you typed; nothing is shown on screen. Use a phone you can read texts on, or the demo farmer (`0200000010`, PIN `1234`), who needs no code.
2. **Paying (collect, in cedis) opens a checkout page.** After the payment is sent, the Wallet shows **Complete payment**. It opens the votex365 test checkout with two buttons: **Pay** marks it paid, **Fail** marks it failed. You come back to the app, and the Wallet updates within a few seconds. No real money moves. Receiving money (payout) and naira or shilling payments are still simulated as below.
3. **Data is shared.** Everyone on the team sees the same farmers and accounts, so use made-up names and numbers.

**About PINs.** A PIN is how the app opens when there is no signal, so every person has one.
- **Staff (admin, coordinator, agent):** you sign in with the ID and password above, and the **first time on each phone or browser** the app asks you to choose a 6-digit PIN. It is stored only on that phone, so it cannot be pre-set. For demos use **`123456`**, so everyone on the team knows it.
- **Farmers:** you choose a 4-digit PIN the first time (the demo farmer already has `1234`). For demos use **`1234`**.
- **Forgot it, or five wrong tries:** the app signs you out. Sign in again with the password (staff) or a new code (farmers, tap "Forgot PIN?") and choose a new PIN.
- **A new browser or a cleared browser** has no PIN yet, so it asks you to choose one.

On the first screen, farmers use **I'm a farmer**. Everyone else uses **I work with AgroConnect**; the account's role decides which app opens.

### Testing several roles on one device

Every signed-in screen has a bar at the top showing **who you are**: your initials in a role colour, your name, a coloured role chip (Farmer, Field agent, Coordinator, Administrator), and your ID or phone number. The browser tab title says the same, so tabs are easy to tell apart. Colours: farmer yellow, agent green, coordinator coral, admin brown.

To switch role, tap **Sign out** in that bar, confirm, and sign in as someone else. The confirmation exists because signing in again needs signal, so a field agent should not sign out by accident. Anything not yet sent stays on the phone.

### Three things that confuse people

1. **The mock now remembers.** It saves farmers, approvals, accounts, payments and its token-signing key in `mock-server/.mock-data/` (git-ignored), so you can restart it without losing anything, and phones stay signed in. Use `npm run mock:reset` to start empty, or `node mock-server/server.mjs --memory` to keep nothing. If you ever see the agent's Home showing more farmers **Sent** than the dashboard, the mock was started empty after those farmers were sent; the phone keeps its own copy, and the real backend's database will not lose them.
2. **After rebuilding, an old copy may show.** Service workers only run in a production build (`npm run build && npm run preview`). If you see old screens there, open DevTools, Application, Storage, Clear site data.
3. **A phone needs HTTPS.** The service worker, GPS, camera and PIN hashing only work on HTTPS or `localhost`. Until the app is hosted, plug the phone in and run `adb reverse tcp:5173 tcp:5173`.
4. **The browser shows an old copy.** If a feature in the walkthrough is missing, check the address bar says `http://localhost:5173`, then try the same page in a **Private window**. If it is there, your normal window is serving an old copy: open DevTools (Cmd+Option+I), **Application**, **Service Workers**, tap **Unregister**, then **Storage**, **Clear site data** (this also removes anything saved on that browser, such as unsent farmers and your PIN), and reload. An installed app window (from Chrome's install icon) keeps its own copy too: close it and use a normal tab.

## 2. Batches

### Core: registration and offline sync

Sign in as the agent `AG-0001`. The first time, the app asks you to choose a 6-digit PIN for opening the app offline.

1. Tap **Register**. **Step 1 (Who):** name and phone. Pick the farmer's language and, optionally, gender. Tap **Next**.
2. **Step 2 (Farm):** community, region, farm size, and tap crop pictures. Tap **Next**.
3. **Step 3 (Proof):** tap **Take photo** (it is shrunk to about 100 KB), tap **Get location** (it shows accuracy in metres), tick the consent box.
4. Tap **Save & register next**. A blank form opens with the community and region kept. Tap **Save** to go to the list.
5. **Go offline:** DevTools, Network, set "Offline". Register two more farmers. In **Farmers**, both show **Saved on phone**.
6. **Close the tab and reopen it.** Unlock with the PIN. All the farmers are still there.
7. **Go online again.** Within about 30 seconds the badges change to **Sending**, then **Sent**.
8. Register a farmer whose phone number already exists. The badge becomes **Needs attention**; tap the farmer to see the reason and **Send again**.

Take screenshots of: the three registration steps, GPS accuracy, the list with every badge, and Home with its gauge.

### Batch 1: signing in

1. Open the app signed out. You see two big buttons and a language picker. Screenshot.
2. **Agent:** tap **I work with AgroConnect**, sign in as `AG-0001`, set a 6-digit PIN. You land on Home.
3. **Offline unlock:** reload the page. You get the PIN screen. Set DevTools to Offline and unlock again. It works.
4. **Lockout:** enter five wrong PINs. The session is wiped and you must sign in again. (Forgot a PIN? On the PIN screen tap **Sign out**, sign in again with the password and choose a new PIN.)
5. **Waiting for approval:** sign in as `+233200000099`. You see "Waiting for approval". Tap **Check again**: it stays pending until an admin approves (Batch 2, step 2 below).
6. **Request a field agent account:** from the sign-in screen tap **Request a field agent account**, fill the form, enter the code shown on screen. The request is now pending. This form only ever creates **field agents**. Coordinators are added by an administrator (Batch 2, step 7).
7. **Farmer:** tap **I'm a farmer**. Either use the demo farmer `0200000010` and PIN `1234`, or enter any other phone number, type the code shown on screen ("Test mode: your code is …") and choose a 4-digit PIN. Sign out, then sign in again with the PIN alone.

### Batch 2: one app per role

1. **Farmer app:** tabs Home, Market, Wallet, Advice, Me. Open each. In **Market**, change the country in **Me** and see ₵, ₦ or KSh. **Sell produce** (under Market) and **Check a crop** (under Advice) save on the phone. Content marked "Sample data" is placeholder.
2. **Admin approves an agent:** sign in as `ADM-001`, open **Agents**. `Pending Pat` and any account you requested are under **Waiting**. Tap **Approve**; the agent gets an ID like `AG-0002`. Back on the waiting agent's screen, **Check again** now lets them in. Also try **Suspend** and **Reinstate** on an approved agent.
3. **Admin Activity:** the audit log lists every approval and suspension.
4. **Agent app:** Home, Register, Farmers, Checks, More. **More** holds Weather, Market prices, Feedback, Settings and Sign out.
5. **Coordinator app (`CO-001`):** Home, Register, Farmers, **Stats**, More. Crop checks are under More.
6. **Feedback:** the round button above the nav bar, on any screen. Send one; it shows "Saved on phone", and it is sent when there is signal. The admin sees it under **Activity** (Batch 4).
7. **Admin adds a coordinator:** as `ADM-001`, open **Agents** (the screen is titled **Team**) and tap **Coordinators**. Tap **Add a coordinator**, enter a name, a phone number, an association and a password of 8 or more characters. You see "Created. Their ID is CO-0002…". Give that ID and password to the person: they sign in with **I work with AgroConnect**, choose their own PIN, and land in the coordinator app. In the same list you can **Suspend** and **Reinstate** a coordinator. Every row has a coloured chip saying whether it is a field agent or a coordinator.

Screenshots: each role's home screen, the admin Agents queue, and the Feedback form.

### Batch A: phone numbers on the wire

1. Sign in as the agent and register a farmer with the phone typed as `024 123 4567`.
2. DevTools, Network, filter **Fetch/XHR**. There are two `farmers` rows; the second one (status 201) is the real `POST`. The first (204) is the browser's permission check.
3. Open the 201 row, **Payload**. You should see `countryCode: "+233"` and `phoneNational: "241234567"`, no `phone`, and (if you captured GPS) an ISO `capturedAt`.

### Batch 3: the dashboard

1. As the agent, register a few farmers with different crops, communities and genders. Leave them to sync.
2. Sign in as `ADM-001`. **Overview** shows totals, registrations by day, crop, community, language and gender, and registrations per agent with sync information. Screenshot.
3. Sign in as `CO-001`. **Stats** shows the same farmers, because the coordinator and agent are in the same association.
4. Tap **Export CSV** and open the file in Excel or Numbers. Check the phone is `+233…` and the crops are separated by semicolons.
5. **Offline copy:** with the dashboard loaded, set DevTools to Offline and reload. You see the saved figures and "No signal. Showing saved figures from …".

### Batch 4: Wallet, payments and loans

Everything here is **test mode, no real money**. On the live site a cedi payment goes through the votex365 test checkout (see "Or use the live app" above). The mock, and the live site for payouts and other currencies, pretend to be the mobile-money provider: a payment stays "waiting" for 4 seconds, then succeeds, except that a mobile money number ending in `0000` fails, so you can show both outcomes.

1. Sign in as the demo farmer (`0200000010`, PIN `1234`) and open **Wallet**. The balance is `₵ 0` and the header says "Test mode, no real money".
2. **Receive money:** tap it, enter `120`, keep MTN and the prefilled number, tap **Continue**. You see "Saved…". Go back: the history shows the payment as "Waiting: approve the prompt on your phone", and after about 4 seconds as "Successful". The balance becomes `₵ 120`.
3. **Pay with mobile money:** pay `50`. When it succeeds the balance becomes `₵ 70` (received minus paid).
4. **A failed payment:** pay with the number `0240000000`. It ends "Failed" and the balance does not change.
5. **Offline:** set DevTools to Offline and receive `30`. The history shows "Will send when signal returns" and the balance does not change. Go online: within about 30 seconds it is sent, waits, then succeeds. Screenshot the queued state.
6. **Loan:** tap **Request an input loan**, enter an amount and what it is for, send. It is listed as "Saved on phone", then "Sent" once there is signal.
7. **Other countries:** in **Me**, switch the country to Kenya or Nigeria. The currency symbol changes, and the networks change to M-Pesa or Bank transfer.
8. **Admin:** sign in as `ADM-001`, open **Overview**. The **Payments** card shows collected and paid out per currency, **Income per farmer** lists your farmer, and **Export payments CSV** downloads the file. Under **Activity**, the **Feedback inbox** shows any feedback sent from other screens.
9. **Agent view of a farmer's payments:** as the agent, register a farmer using the same phone number the farmer account signed in with. Once it shows **Sent**, open the farmer in **Farmers**: the **Payments** section lists that farmer's payments.

### Batch 5: real weather and market trends

Weather comes from Open-Meteo, a free service that needs no key. The app sends only the town's coordinates.

1. Sign in as the demo farmer. The **Home** weather card shows the real temperature and conditions for **Ashaiman**, today's chance of rain, and (when rain is 60% or more likely, or it is 34° or hotter) a one-line tip.
2. Tap **5-day forecast**. You see the current weather with humidity and wind, and five days with icons, temperature range and rain chance. Tap another place (Accra, Kumasi, Tamale) and the forecast changes.
3. **Offline:** with a forecast loaded, set DevTools to Offline and reload. The saved forecast shows with "No signal. Showing the forecast saved at …".
4. In **Me**, switch the country to Nigeria or Kenya. The places change (Lagos, Kano, Abuja; Nairobi, Kisumu, Mombasa).
5. As the agent, **More**, then **Weather** shows the same screen.
6. **Market:** each crop now shows an arrow with its change this week (▲ up, ▼ down, – no change) and the update date. The prices are still labelled **Sample prices** until a market-info service exists.

### Batch 6: crop checks and produce for sale

A crop check needs three people, so use three browser windows (or sign out and in).

1. *(Optional)* As the agent `AG-0001`, register a farmer with the phone `0200000010`. A crop check from a registered farmer goes to that farmer's association. A check from a farmer nobody has registered is shown to every agent and coordinator, so no question is left unanswered.
2. **Farmer asks:** sign in as the demo farmer, open **Advice**, then **Check a crop**. Choose the crop, describe the problem, add a photo, and tap **Send to extension officer**. Under **My crop checks** it shows "Sent. Waiting for an extension officer".
3. **Offline:** do the same with DevTools set to Offline. It shows "Will send when signal returns". Go online: it is sent (the text first, then the photo).
4. **Agent answers:** sign in as `AG-0001`. The **Checks** tab lists it under **Waiting**, with the photo. Write advice and tap **Send advice**. It moves to **Answered**. A check can be answered once.
5. **Farmer reads the answer:** as the farmer, open the crop check list again. It shows **Answered** with the advice (the list refreshes every 15 seconds).
6. **Coordinator and admin:** as `CO-001`, **More**, then **Crop checks**. As `ADM-001`, **Activity**, then **Crop checks** lists every check, read only.
7. **Sell produce:** as the farmer, **Market**, then **Sell produce**. List `150` kg of maize at `5.5`. The form reminds you that buyers will see your name and number. Once sent, it shows "Listed for sale".
8. **Buy:** as a different farmer (any other phone number), **Market**, then **Browse produce for sale**. The listing shows with **Call** and **Text** buttons (on a phone they open the dialler and messages). Filter by crop. As the seller, the same list shows "Your listing" with no buttons.
9. **Mark as sold:** as the seller, tap **Mark as sold** on the listing. It disappears from **Browse**.

Screenshots: the weather card and the 5-day forecast, a crop check with its photo on the agent's screen, the farmer seeing the advice, and the Browse produce list.

## 3. Screenshots for the report

- [ ] Role choice screen
- [ ] PIN unlock, and "Waiting for approval"
- [ ] Registration steps 1, 2 and 3, with GPS accuracy
- [ ] Farmers list showing **Saved on phone**, **Sent** and **Needs attention**
- [ ] App opened in airplane mode (installed on a real Android phone, once hosted)
- [ ] Each role's home screen, and the admin Agents queue
- [ ] The dashboard, and the exported CSV open in a spreadsheet
- [ ] Wallet with each payment state (queued, waiting, successful, failed), and the loan request
- [ ] Admin Payments card, Income per farmer, and the feedback inbox
- [ ] Weather card and the 5-day forecast, and the market with price trends
- [ ] A crop check with its photo on the agent's screen, and the farmer reading the advice
- [ ] Browse produce for sale, and Sell produce with its status

## 4. Update log

| Batch | Date | What was added | Automated tests |
|-------|------|----------------|-----------------|
| Core | earlier | Registration, GPS, photo, offline sync, farmers list and detail | 39 |
| 1 | 2026-10-05 | Sign-in, offline PIN, agent approval flow | 70 |
| 2 | 2026-10-05 | A separate app for each role, admin Agents screen, feedback, settings | 84 |
| A | 2026-10-07 | New phone and GPS formats, matching the reconciled contracts | 104 |
| 3 | 2026-10-07 | Live dashboard, CSV export, agent heartbeat, offline copy | 126 |
| 4 | 2026-10-07 | Wallet with test-mode payments, balance and history that work offline, loan requests, income and payments export, feedback now sent, mock keeps its data | 173 |
| 5 | 2026-10-07 | Real Open-Meteo weather (cached for offline, with a farming tip), place choice per country, market price trends | 199 |
| 6 | 2026-10-07 | Crop checks end to end (photo, agent's advice, farmer reads it), produce listings you can sell, browse and mark sold, admin crop-check list | 227 |
| UI | 2026-10-07 | A bar on every signed-in screen showing your name, role and ID; confirmed sign-out everywhere | 233 |
| Fix | 2026-10-07 | Admin can add, list, suspend and reinstate coordinators; role chips on team rows; sign-up form says it is for field agents | 247 |
| Push | 2026-10-08 | **Notifications** card on the farmer's Me screen and in staff Settings: alerts for crop-check answers, payment results, new advice and account approval, even with the app closed. Appears once the server's VAPID keys are set | 272 |
| Install | 2026-10-08 | **Install AgroConnect on this phone** on the sign-in screen and in Settings (iPhone: Share → Add to Home Screen). Each role's app now loads separately, so the first load is lighter | 271 |
| USSD | 2026-10-08 | Farmers on basic phones dial the USSD code: prices, advice, their registration, ask for an agent visit, today's weather. Visit requests appear under **More → Requests from farmers** for coordinators and admins. Live once Arkesel assigns the code | 271 (+160 backend) |
| Audio | 2026-10-08 | **Listen** buttons read aloud for low-literacy users: the consent statement in the farmer's own language, advice cards, crop-check answers and today's prices. English uses the phone's voice; Twi and Ewe play recordings from `public/audio/` once the team records them (README there) | 271 |
| Visits | 2026-10-08 | On a sent farmer's detail screen, **Log a visit**: topics, notes, next visit date. Works offline (saved on the phone, sent later); the history shows everyone's visits to that farmer | 269 (+135 backend) |
| Profile | 2026-10-08 | Registration has a new optional step 3, **About**: phone type, data plan, best contact channel, income sources, bank account, mobile money use, last extension visit and needs, plus soil type and growing seasons on the Farm step. Shown on the farmer's detail screen, broken down on the dashboard, and in the CSV | 271 (+137 backend) |
| Content | 2026-10-08 | Real market prices and advice: admins and coordinators enter them under **More → Prices & advice**; farmers see them on Home, Market and Advice (with the change against a week earlier). Until anything is entered, the labelled samples stay | 267 (+114 backend) |
| Live | 2026-10-08 | The real backend implements every contract on Postgres (codes by SMS, photos in S3, votex365 test checkout with a **Complete payment** button); the farmer's **Me** screen shows the profile an agent registered | 257 (+108 backend) |
| Fix | 2026-10-07 | The sync heartbeat is only sent by agents and coordinators (admins and farmers were being refused); the digit 0 is drawn from Onest so it cannot be read as the letter O; status badges and the ID in the top bar no longer stretch or get cut off | 250 |
