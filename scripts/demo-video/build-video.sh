#!/usr/bin/env bash
# Records each role against the live app, then builds agroconnect-demo.mp4:
# intro card, then per role the phone recording beside its captions, then the outro card.
set -euo pipefail
cd "$(dirname "$0")"

OUT="agroconnect-demo.mp4"
WORK="build"
BG="0x1F3D2B"
ENC="-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 -movflags +faststart -an"
CLIPS="agent coordinator admin farmer"

rm -rf "$WORK" test-results playwright-report
node setup-demo-data.mjs
# One playwright run, so test-results keeps every video. A failed role still ships the rest.
npx playwright test || echo "WARN: at least one role spec failed; continuing"
node render-cards.mjs

card () { ffmpeg -v error -y -loop 1 -t "$2" -i "$WORK/cards/$1.png" -vf "fps=30,format=yuv420p" $ENC "$WORK/$1.mp4"; }

# Phone (412x820) scaled to 680 high with a thin border, in a 400px column; captions panel (880px) beside it.
role_clip () {
  local clip="$1" video
  video=$(find test-results -path "*${clip}*" -name video.webm | head -1)
  [ -n "$video" ] && [ -f "$WORK/captions/$clip.json" ] || { echo "SKIP $clip: missing video or captions"; return; }
  local duration
  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
  # Concat list: each caption panel holds until the next caption, the last until the clip ends.
  node -e '
    const [file, clip, end] = process.argv.slice(1)
    const caps = require(file)
    const lines = caps.map((c, i) => {
      const from = i === 0 ? 0 : c.t
      const to = i + 1 < caps.length ? caps[i + 1].t : Number(end)
      return `file cards/${clip}-${i}.png\nduration ${Math.max(0.1, to - from).toFixed(3)}`
    })
    console.log(lines.join("\n") + `\nfile cards/${clip}-${caps.length - 1}.png`)
  ' "$PWD/$WORK/captions/$clip.json" "$clip" "$duration" > "$WORK/$clip-panels.txt"
  ffmpeg -v error -y -i "$video" -f concat -safe 0 -i "$WORK/$clip-panels.txt" -filter_complex \
    "[0:v]fps=30,scale=-2:680,pad=iw+4:ih+4:2:2:color=0x3C6B4E,pad=400:720:(ow-iw)/2:(oh-ih)/2:color=$BG,setsar=1[phone];
     [1:v]fps=30,scale=880:720,setsar=1[panel];
     [phone][panel]hstack=inputs=2,format=yuv420p[v]" \
    -map "[v]" -t "$duration" $ENC "$WORK/$clip.mp4"
}

card intro 5
for clip in $CLIPS; do role_clip "$clip"; done
card outro 6

: > "$WORK/concat.txt"
for part in intro $CLIPS outro; do
  [ -f "$WORK/$part.mp4" ] && echo "file '$part.mp4'" >> "$WORK/concat.txt"
done
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/concat.txt" -c copy "$OUT"

ls -la "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name "$OUT"
