#!/usr/bin/env bash
# 360 athlete video for the stage, on a Mac.
#   ./make_360_video.sh raw.mov marks.json out/
# One-time setup (Terminal):
#   brew install ffmpeg python@3.12
#   python3 -m venv ~/v360 && source ~/v360/bin/activate
#   pip install "rembg[cli]" pillow numpy scipy
#   RIFE (frame interpolation): rife-ncnn-vulkan, see README.md section 1
# Output in out/: athlete-vp9.webm (Chrome/Edge/Android), athlete-hevc.mov (Safari Mac/iPad/iPhone),
#   poster.webp, keyframes/000.webp..355.webp (72 frames), feet.json, contact.jpg, meta.json.
# Settings (TURN_SEC, FPS, RIFE_BIN, ...): see fit_frames.py and README.md.
set -euo pipefail
if [ $# -lt 2 ]; then echo "usage: $0 raw-video marks.json [out-dir]" >&2; exit 2; fi
RAW="$1"; MARKS="$2"; OUT="${3:-out}"
HERE="$(cd "$(dirname "$0")" && pwd)"
python3 "$HERE/fit_frames.py" "$RAW" "$MARKS" "$OUT"
FPS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['fps'])" "$OUT/meta.json")
DUR=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['duration'])" "$OUT/meta.json")
# HEVC bitrate: 2500 kb/s, but at most what keeps the file under ~18 MB (Storage limit 20 MB).
HEVC_KBPS=$(python3 -c "import sys; print(min(2500, int(18 * 8 * 1024 / float(sys.argv[1]) * 0.92)))" "$DUR")

# VP9 with alpha (WebM). -auto-alt-ref 0 is required for alpha; keyframe every second.
ffmpeg -y -loglevel error -framerate "$FPS" -i "$OUT/fit/%05d.png" -an \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -row-mt 1 -auto-alt-ref 0 -g "$FPS" \
  "$OUT/athlete-vp9.webm"

# HEVC with alpha: only Apple's VideoToolbox encoder can make it (macOS).
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q hevc_videotoolbox; then
  ffmpeg -y -loglevel error -framerate "$FPS" -i "$OUT/fit/%05d.png" -an \
    -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.75 -b:v ${HEVC_KBPS}k -pix_fmt bgra -tag:v hvc1 -g "$FPS" \
    "$OUT/athlete-hevc.mov"
else
  echo "hevc_videotoolbox not available (not a Mac?): athlete-hevc.mov skipped" >&2
fi

cp "$OUT/keyframes/000.webp" "$OUT/poster.webp"
ls -la "$OUT"/athlete-* "$OUT/poster.webp"
# (ffmpeg -i without an output exits 1: ignore that, only the text matters)
{ ffmpeg -hide_banner -i "$OUT/athlete-vp9.webm" 2>&1 || true; } | grep -qi "alpha_mode *: *1" \
  && echo "athlete-vp9.webm: alpha OK" || echo "WARNING: athlete-vp9.webm has no alpha" >&2
