# Demo walkthrough video

An automated walkthrough of the live AgroConnect PWA at `https://app.agroconnect.space`.
Playwright records each role on an Android-sized phone; ffmpeg puts each recording beside
captions that explain what is happening, between an intro card and an outro card.
The output, `agroconnect-demo.mp4`, is the video embedded in the repository README.

No audio: the captions carry the explanation, and presenters can narrate over it.

## What the video shows (in order)

| Section | Account | What happens |
|---|---|---|
| Intro | | Project, roles, live URL |
| Field agent | `AG-0001` | Sign in and set an offline PIN → home session counts → register a farmer in four steps (who, farm, the optional "About" profile, then photo + GPS + consent) → **saves with no signal**, the record waits in the outbox, then sends itself when signal returns → farmer record |
| Coordinator | `CO-001` | Association stats → records today's maize price → advice publishing → requests from farmers (USSD) |
| Administrator | `ADM-001` | Programme dashboard → agent approval queue and approved agents → coordinators → all farmers → audit log |
| Farmer | `0200000010`, PIN `1234` | Home (weather, today's prices, Listen) → Market (prices with weekly change) → Wallet (test-mode mobile money payment) → Advice → Me (farm profile, consent) → switches the app to Twi |
| Outro | | Live URL and repository |

## Rebuild

```
cd scripts/demo-video
npm install
npx playwright install chromium
./build-video.sh      # about 5 minutes; overwrites agroconnect-demo.mp4
```

`build-video.sh` runs, in order:

1. `setup-demo-data.mjs`: gives the live demo accounts real content, so no screen falls back to
   sample data. It records today's market prices (and last week's, for the trend), publishes
   three advice cards if none exist, and creates Akosua's farm profile if she has none.
   Safe to re-run. The prices are illustrative demo values, not market data.
2. `npx playwright test`: one recording per role (`tests/01-agent` to `04-farmer`). Each spec
   calls `caption(...)` before each step; the captions and their timings go to `build/captions/`.
3. `render-cards.mjs`: renders the intro and outro cards and one caption panel per caption, with
   the app's own fonts.
4. ffmpeg: phone recording beside its caption panels, per role, then everything concatenated.

## Changes to live data on each run

The recordings use the live system, so each run:

- registers one farmer, "Kofi Mensah", with a random `024…` phone number, as `AG-0001`;
- saves today's maize price (an update when it is already set for today);
- queues one GHS 5 test-mode payment for Akosua (votex365 test mode, no real money).

Nothing is approved, suspended or created for staff accounts.

## Not shown, and why

- **Approving a new agent.** Signing up needs an SMS code sent to a real phone, so the video shows
  the approval queue but approves no one. The seeded pending agent (`+233200000099`) was approved by
  an earlier recording and is now `AG-0002`.
- **The votex365 checkout page.** It is outside the app; the video shows the payment being queued.
- **A crop check answered end to end.** It needs two signed-in roles at once.

## Credits

`assets/maize-farm.jpg`, the photo the agent attaches: "Maize Farm in Northern Ghana" by Ibn Shiraz,
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Maize_Farm_in_Northern_Ghana.jpg),
resized to 960 px wide.

## Not committed

`node_modules/`, `test-results/`, `build/`, `playwright-report/`.
