#!/usr/bin/env bash
# ============================================================
# DSE — video assembly pipeline
#
# Concatenates intro + speaker recording + outro into a single
# YouTube-ready MP4 (1080p, H.264, AAC).
#
# All inputs are normalised to the same resolution / framerate /
# codec before concat, so they don't have to match upfront.
#
# Usage:
#   ./assemble.sh --speaker path/to/speaker.mp4 \
#                 [--intro path/to/intro.mp4] \
#                 [--outro path/to/outro.mp4] \
#                 [--audio path/to/audio.wav] \
#                 [--out final.mp4]
#
# Defaults:
#   --intro  defaults/intro.mp4   (if it exists)
#   --outro  defaults/outro.mp4   (if it exists)
#   --out    out/final.mp4
#
# --audio is optional. When provided, it REPLACES the speaker
# recording's audio (useful if you recorded a higher-quality
# audio track separately).
# ============================================================

set -euo pipefail

# ---- defaults ----
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INTRO="${SCRIPT_DIR}/defaults/intro.mp4"
OUTRO="${SCRIPT_DIR}/defaults/outro.mp4"
SPEAKER=""
AUDIO=""
OUT="out/final.mp4"

# Output spec — change here if you ever want to bump.
TARGET_W=1920
TARGET_H=1080
TARGET_FPS=30
TARGET_SAR=48000

# ---- parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --intro)   INTRO="$2";   shift 2 ;;
    --outro)   OUTRO="$2";   shift 2 ;;
    --speaker) SPEAKER="$2"; shift 2 ;;
    --audio)   AUDIO="$2";   shift 2 ;;
    --out)     OUT="$2";     shift 2 ;;
    -h|--help)
      sed -n '/^# =====/,/^# =====$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2 ;;
  esac
done

# ---- validate ----
if [[ -z "$SPEAKER" ]]; then
  echo "ERROR: --speaker is required" >&2
  exit 2
fi
for f in "$SPEAKER" "$INTRO" "$OUTRO"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing file: $f" >&2
    exit 1
  fi
done
if [[ -n "$AUDIO" && ! -f "$AUDIO" ]]; then
  echo "ERROR: --audio file not found: $AUDIO" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

echo "Inputs:"
echo "  intro    : $INTRO"
echo "  speaker  : $SPEAKER"
echo "  outro    : $OUTRO"
[[ -n "$AUDIO" ]] && echo "  audio    : $AUDIO (replaces speaker audio)"
echo "  output   : $OUT"
echo

# ---- if a separate audio file is provided, premux it onto the speaker recording ----
if [[ -n "$AUDIO" ]]; then
  TMP_SPEAKER="$(mktemp -t dse-speaker.XXXXXX.mp4)"
  trap 'rm -f "$TMP_SPEAKER"' EXIT
  echo "==> Replacing speaker audio with $AUDIO ..."
  ffmpeg -hide_banner -loglevel warning -y \
    -i "$SPEAKER" -i "$AUDIO" \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$TMP_SPEAKER"
  SPEAKER="$TMP_SPEAKER"
fi

# ---- concat via filter_complex (normalises each input first) ----
echo "==> Assembling ${TARGET_W}x${TARGET_H}@${TARGET_FPS} ..."
ffmpeg -hide_banner -loglevel warning -stats -y \
  -i "$INTRO" -i "$SPEAKER" -i "$OUTRO" \
  -filter_complex "
    [0:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,
         pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,
         setsar=1,fps=${TARGET_FPS}[v0];
    [1:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,
         pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,
         setsar=1,fps=${TARGET_FPS}[v1];
    [2:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,
         pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,
         setsar=1,fps=${TARGET_FPS}[v2];
    [0:a]aresample=${TARGET_SAR},aformat=channel_layouts=stereo[a0];
    [1:a]aresample=${TARGET_SAR},aformat=channel_layouts=stereo[a1];
    [2:a]aresample=${TARGET_SAR},aformat=channel_layouts=stereo[a2];
    [v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar ${TARGET_SAR} \
  -movflags +faststart \
  "$OUT"

echo
echo "Done: $OUT"
echo "Size: $(du -h "$OUT" | cut -f1)"
ffprobe -hide_banner -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,duration \
  -of default=noprint_wrappers=1 "$OUT"
