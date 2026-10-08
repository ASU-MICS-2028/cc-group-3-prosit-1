# Recorded audio for low-literacy users

Phones ship no Twi or Ewe text-to-speech voice, so the Listen buttons in those languages play recordings from here.

1. Record the sentence in a quiet room with a phone voice memo. Speak slowly. Keep it under 30 seconds.
2. Convert it to MP3, mono, about 64 kbps (for example `ffmpeg -i memo.m4a -ac 1 -b:a 64k reg.consent.mp3`), so it stays small on farmers' data.
3. Save it as `public/audio/<lang>/<translation key>.mp3`, e.g. `public/audio/tw/reg.consent.mp3`.
4. Add the key to `RECORDED_CLIPS` in `src/audio/speak.ts`.

Most useful first, because they are read to farmers who may not read: `reg.consent` (the data-consent statement), then `check.hint`, `farmer.welcome.body` and `auth.choose.farmerHint`. Recordings are cached by the service worker, so they play offline after the first visit.
