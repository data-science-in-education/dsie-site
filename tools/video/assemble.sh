#!/usr/bin/env bash
# ============================================================
# DSE — video assembly pipeline
#
# Concatenates intro + (optional title card) + speaker recording
# + outro into a single YouTube-ready MP4 (1080p, H.264, AAC).
#
# All inputs are normalised to the same resolution / framerate /
# codec before concat, so they don't have to match upfront.
#
# Usage:
#   ./assemble.sh --speaker path/to/speaker.mp4 \
#                 [--intro path/to/intro.mp4] \
#                 [--outro path/to/outro.mp4] \
#                 [--title-card path/to/card.png] \
#                 [--title-card-duration 3] \
#                 [--audio path/to/audio.wav] \
#                 [--out final.mp4]
#
# Defaults:
#   --intro                 defaults/intro.mp4   (if it exists)
#   --outro                 defaults/outro.mp4   (if it exists)
#   --title-card-duration   3 seconds
#   --out                   out/final.mp4
#
# --title-card is optional. When provided, a still of the PNG
# is rendered as a silent video segment of TITLE_CARD_DURATION
# seconds and inserted between intro and speaker. Use the cards
# emitted by `npm run og` — they live under images/video-cards/.
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
TITLE_CARD=""
TITLE_CARD_DURATION="3"
OUT="out/final.mp4"

# Output spec — change here if you ever want to bump.
TARGET_W=1920
TARGET_H=1080
TARGET_FPS=30
TARGET_SAR=48000

# ---- parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --intro)                INTRO="$2";                 shift 2 ;;
    --outro)                OUTRO="$2";                 shift 2 ;;
    --speaker)              SPEAKER="$2";               shift 2 ;;
    --audio)                AUDIO="$2";                 shift 2 ;;
    --title-card)           TITLE_CARD="$2";            shift 2 ;;
    --title-card-duration)  TITLE_CARD_DURATION="$2";   shift 2 ;;
    --out)                  OUT="$2";                   shift 2 ;;
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
if [[ -n "$TITLE_CARD" && ! -f "$TITLE_CARD" ]]; then
  echo "ERROR: --title-card file not found: $TITLE_CARD" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

echo "Inputs:"
echo "  intro       : $INTRO"
[[ -n "$TITLE_CARD" ]] && echo "  title card  : $TITLE_CARD (${TITLE_CARD_DURATION}s)"
echo "  speaker     : $SPEAKER"
echo "  outro       : $OUTRO"
[[ -n "$AUDIO" ]]      && echo "  audio       : $AUDIO (replaces speaker audio)"
echo "  output      : $OUT"
echo

# ---- cleanup ----
TMP_FILES=()
cleanup() { for f in "${TMP_FILES[@]:-}"; do if [[ -n "$f" ]]; then rm -f "$f"; fi; done; }
trap cleanup EXIT

# ---- if a separate audio file is provided, premux it onto the speaker recording ----
if [[ -n "$AUDIO" ]]; then
  TMP_SPEAKER="$(mktemp -t dse-speaker.XXXXXX.mp4)"
  TMP_FILES+=("$TMP_SPEAKER")
  echo "==> Replacing speaker audio with $AUDIO ..."
  ffmpeg -hide_banner -loglevel warning -y \
    -i "$SPEAKER" -i "$AUDIO" \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$TMP_SPEAKER"
  SPEAKER="$TMP_SPEAKER"
fi

# ---- if a title card is provided, pre-render it to a normalised silent MP4 ----
if [[ -n "$TITLE_CARD" ]]; then
  TMP_TITLE="$(mktemp -t dse-title.XXXXXX.mp4)"
  TMP_FILES+=("$TMP_TITLE")
  echo "==> Rendering title card ($TITLE_CARD, ${TITLE_CARD_DURATION}s) ..."
  ffmpeg -hide_banner -loglevel warning -y \
    -loop 1 -framerate ${TARGET_FPS} -t "$TITLE_CARD_DURATION" -i "$TITLE_CARD" \
    -f lavfi -t "$TITLE_CARD_DURATION" -i "anullsrc=channel_layout=stereo:sample_rate=${TARGET_SAR}" \
    -vf "scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${TARGET_FPS}" \
    -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ar ${TARGET_SAR} \
    -shortest -movflags +faststart \
    "$TMP_TITLE"
fi

# ---- concat via filter_complex (normalises each input first) ----
echo "==> Assembling ${TARGET_W}x${TARGET_H}@${TARGET_FPS} ..."

# Build the input list and the per-input normalisation/concat filter
# dynamically — three segments by default (intro, speaker, outro),
# four when a title card is present (intro, title, speaker, outro).
if [[ -n "$TITLE_CARD" ]]; then
  INPUTS=("$INTRO" "$TMP_TITLE" "$SPEAKER" "$OUTRO")
else
  INPUTS=("$INTRO" "$SPEAKER" "$OUTRO")
fi

# Per-input scale+pad+fps for video, aresample+stereo for audio.
# Audio is clamped to the video-stream duration of each input to prevent
# audio tails (common in screen recordings) from producing frozen frames.
NORM=""
CONCAT=""
TOTAL_DUR=0
N=${#INPUTS[@]}
echo "Input durations (frame-count / audio streams):"
for ((i=0; i<N; i++)); do
  f="${INPUTS[$i]}"

  # Compute duration from nb_frames × frame_rate — this is immune to bad container
  # timestamps (stray frames with huge PTS) that inflate the declared stream duration.
  nb_frames=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  r_frame_rate=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  vdur=""
  if [[ -n "$nb_frames" && "$nb_frames" != "N/A" && -n "$r_frame_rate" && "$r_frame_rate" != "N/A" ]]; then
    vdur=$(awk "BEGIN{
      n=split(\"$r_frame_rate\",a,\"/\");
      num=a[1]+0; den=(n>=2 && a[2]+0>0) ? a[2]+0 : 1;
      if(num>0) printf \"%.6f\", $nb_frames / (num/den);
    }")
  fi
  # Fall back to declared stream duration, then container duration
  if [[ -z "$vdur" ]]; then
    vdur=$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  fi
  if [[ -z "$vdur" || "$vdur" == "N/A" ]]; then
    vdur=$(ffprobe -v error -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  fi

  adur=$(ffprobe -v error -select_streams a:0 \
    -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  printf "  [%d] frames=%-6s fps=%-10s vdur=%-12s audio=%-12s  %s\n" \
    "$i" "${nb_frames:-N/A}" "${r_frame_rate:-N/A}" "${vdur:-N/A}" "${adur:-N/A}" "$(basename "$f")"

  TOTAL_DUR=$(awk "BEGIN{printf \"%.6f\", $TOTAL_DUR + ${vdur:-0}}")

  # trim=end=vdur removes any stray high-PTS frames before fps sees them,
  # preventing the fps filter from gap-filling beyond actual content.
  NORM+="[${i}:v]trim=end=${vdur},setpts=PTS-STARTPTS,scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${TARGET_FPS}[v${i}];
"
  if [[ -n "$vdur" && "$vdur" != "N/A" ]]; then
    NORM+="[${i}:a]atrim=end=${vdur},asetpts=PTS-STARTPTS,aresample=${TARGET_SAR},aformat=channel_layouts=stereo[a${i}];
"
  else
    NORM+="[${i}:a]aresample=${TARGET_SAR},aformat=channel_layouts=stereo[a${i}];
"
  fi
  CONCAT+="[v${i}][a${i}]"
done

echo "Expected output duration: ${TOTAL_DUR}s"
FILTER="${NORM}${CONCAT}concat=n=${N}:v=1:a=1[v][a]"

# Compose the -i flags from the INPUTS array
INPUT_ARGS=()
for f in "${INPUTS[@]}"; do INPUT_ARGS+=(-i "$f"); done

ffmpeg -hide_banner -loglevel warning -stats -y \
  "${INPUT_ARGS[@]}" \
  -filter_complex "$FILTER" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar ${TARGET_SAR} \
  -movflags +faststart \
  "$OUT"

# ---- fix audio tail ---------------------------------------------------------
# Some recordings have audio that outlasts the video track. After encoding,
# probe both streams; if audio is more than 0.5 s longer, stream-copy trim it.
V_DUR=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" 2>/dev/null)
A_DUR=$(ffprobe -v error -select_streams a:0 \
  -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" 2>/dev/null)
if [[ -n "$V_DUR" && -n "$A_DUR" ]]; then
  TAIL=$(awk "BEGIN{d=$A_DUR-$V_DUR; printf \"%.3f\", (d>0.5)?d:0}")
  if [[ "$TAIL" != "0.000" ]]; then
    echo "==> Audio tail detected (${TAIL}s) — trimming to video duration..."
    TMP_FIXED=$(mktemp -t dse-fixed.XXXXXX.mp4)
    ffmpeg -hide_banner -loglevel warning -y \
      -i "$OUT" -c copy -t "$V_DUR" -movflags +faststart "$TMP_FIXED" \
      && mv "$TMP_FIXED" "$OUT" || rm -f "$TMP_FIXED"
    echo "Fixed."
  fi
fi

echo
echo "Done: $OUT"
echo "Size: $(du -h "$OUT" | cut -f1)"
ffprobe -hide_banner -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,duration \
  -of default=noprint_wrappers=1 "$OUT"
