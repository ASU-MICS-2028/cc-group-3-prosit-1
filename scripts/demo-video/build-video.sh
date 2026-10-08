#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUT="agroconnect-demo.mp4"
WORK="build"
TITLES="assets/titles"
rm -rf "$WORK"
mkdir -p "$WORK"

# 1. Produce title cards + record every role flow in ONE playwright run so
#    the test-results dir keeps every video (each top-level `playwright test`
#    call wipes it). `|| true` so a single failed role still ships the rest.
rm -rf test-results playwright-report
npx playwright test tests/00-titles.spec.ts
npx playwright test \
  tests/01-farmer.spec.ts \
  tests/02-agent.spec.ts \
  tests/03-admin.spec.ts \
  tests/04-coordinator.spec.ts || echo "WARN: at least one role spec failed; continuing"

# 2. Locate the recorded webm per role.
#    Playwright writes test-results/<spec>-<testname>-<project>/video.webm
find_video () {
  find test-results -type d -name "*${1}*" | head -1 | xargs -I{} find {} -name "video.webm" | head -1
}
V_FARMER=$(find_video "01-farmer" || true)
V_AGENT=$(find_video "02-agent" || true)
V_ADMIN=$(find_video "03-admin" || true)
V_COORD=$(find_video "04-coordinator" || true)

echo "Farmer:      ${V_FARMER:-MISSING}"
echo "Agent:       ${V_AGENT:-MISSING}"
echo "Admin:       ${V_ADMIN:-MISSING}"
echo "Coordinator: ${V_COORD:-MISSING}"

# 3. Convert every clip to a uniform 1280x720 MP4, letterboxed (portrait recordings fit vertically).
#    `pad` fills the remaining area black so concat has matching streams.
TARGET_W=1280
TARGET_H=720
VF="scale='min(${TARGET_W},iw*${TARGET_H}/ih)':'min(${TARGET_H},ih*${TARGET_W}/iw)':force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30"
ENC="-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart"

normalize_video () {
  local in="$1" out="$2"
  if [ -z "$in" ] || [ ! -f "$in" ]; then
    echo "SKIP: $out (source missing)"
    return 1
  fi
  ffmpeg -y -i "$in" -vf "$VF" $ENC -an "$out" 2>&1 | tail -3
}

normalize_card () {
  local in="$1" out="$2" dur="$3"
  ffmpeg -y -loop 1 -t "$dur" -i "$in" -vf "$VF" $ENC -an "$out" 2>&1 | tail -3
}

mkdir -p "$WORK"

# Title clips (5s intro/outro, 3s role headings).
normalize_card "$TITLES/intro.png"  "$WORK/01-intro.mp4"  5
normalize_card "$TITLES/farmer.png" "$WORK/02-farmer-card.mp4" 3
[ -n "$V_FARMER" ] && normalize_video "$V_FARMER" "$WORK/03-farmer.mp4" || true
normalize_card "$TITLES/agent.png"  "$WORK/04-agent-card.mp4" 3
[ -n "$V_AGENT" ]  && normalize_video "$V_AGENT"  "$WORK/05-agent.mp4"  || true
normalize_card "$TITLES/admin.png"  "$WORK/06-admin-card.mp4" 3
[ -n "$V_ADMIN" ]  && normalize_video "$V_ADMIN"  "$WORK/07-admin.mp4"  || true
normalize_card "$TITLES/coord.png"  "$WORK/08-coord-card.mp4" 3
[ -n "$V_COORD" ]  && normalize_video "$V_COORD"  "$WORK/09-coord.mp4"  || true
normalize_card "$TITLES/outro.png"  "$WORK/10-outro.mp4"  5

# 4. Concat whatever we have, in order.
: > "$WORK/concat.txt"
for f in \
  "$WORK/01-intro.mp4" \
  "$WORK/02-farmer-card.mp4" "$WORK/03-farmer.mp4" \
  "$WORK/04-agent-card.mp4"  "$WORK/05-agent.mp4" \
  "$WORK/06-admin-card.mp4"  "$WORK/07-admin.mp4" \
  "$WORK/08-coord-card.mp4"  "$WORK/09-coord.mp4" \
  "$WORK/10-outro.mp4"
do
  [ -f "$f" ] && echo "file '$(pwd)/$f'" >> "$WORK/concat.txt"
done

echo "=== concat list ==="
cat "$WORK/concat.txt"
echo "==================="

ffmpeg -y -f concat -safe 0 -i "$WORK/concat.txt" -c copy "$OUT" 2>&1 | tail -4

echo
echo "=== Final video ==="
ls -la "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name "$OUT"
