#!/usr/bin/env bash
# ============================================================
# DSE — video trim
#
# Reads a cuts.json exported from trim.html and produces a
# trimmed MP4 at the same 1080p/H.264/AAC spec as assemble.sh.
# Feed the output into assemble.sh as --speaker.
#
# Usage:
#   ./trim.sh --cuts cuts.json [--input raw.mp4] [--out trimmed.mp4]
#
# --input    path to the raw video. If omitted, trim.sh tries to
#            infer it from the "source" field in cuts.json.
# --out      default: out/trimmed.mp4
# ============================================================

set -euo pipefail

CUTS=""
INPUT=""
OUT="out/trimmed.mp4"

TARGET_W=1920
TARGET_H=1080
TARGET_FPS=30
TARGET_SAR=48000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cuts)  CUTS="$2";  shift 2 ;;
    --input) INPUT="$2"; shift 2 ;;
    --out)   OUT="$2";   shift 2 ;;
    -h|--help)
      sed -n '/^# =====/,/^# =====$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "ERROR: unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$CUTS" ]]; then
  echo "ERROR: --cuts is required" >&2
  echo "Usage: $0 --cuts cuts.json [--input raw.mp4] [--out trimmed.mp4]" >&2
  exit 2
fi

if [[ ! -f "$CUTS" ]]; then
  echo "ERROR: cuts file not found: $CUTS" >&2; exit 1
fi

# Infer input from cuts.json if not given
if [[ -z "$INPUT" ]]; then
  INPUT=$(python3 -c "
import json, sys
try:
    d = json.load(open('$CUTS'))
    print(d.get('source', ''))
except Exception as e:
    print('', end='')
" 2>/dev/null)
  if [[ -z "$INPUT" ]]; then
    echo "ERROR: --input required (or set \"source\" in cuts.json)" >&2; exit 2
  fi
  echo "trim: using input inferred from cuts.json: $INPUT"
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: input file not found: $INPUT" >&2; exit 1
fi

if ! command -v ffmpeg  >/dev/null 2>&1; then echo "ERROR: ffmpeg not found" >&2; exit 1; fi
if ! command -v python3 >/dev/null 2>&1; then echo "ERROR: python3 not found" >&2; exit 1; fi

mkdir -p "$(dirname "$OUT")"

# Delegate to Python for JSON parsing + ffmpeg command building
python3 - \
  "$CUTS" "$INPUT" "$OUT" \
  "$TARGET_W" "$TARGET_H" "$TARGET_FPS" "$TARGET_SAR" \
  <<'PYEOF'
import json, sys, subprocess, os

cuts_file, input_file, out_file = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS, SAR = sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7]

with open(cuts_file) as f:
    data = json.load(f)

keeps = data.get('keep', [])
if not keeps:
    print("ERROR: no keep segments found in cuts.json", file=sys.stderr)
    sys.exit(1)

# Sort segments by start time and validate for overlaps / bad ranges
keeps = sorted(keeps, key=lambda k: k['start'])
for i, k in enumerate(keeps):
    if k['end'] <= k['start']:
        print(f"ERROR: segment {i+1} has end <= start ({k['start']}s → {k['end']}s)", file=sys.stderr)
        sys.exit(1)
    if i > 0 and k['start'] < keeps[i-1]['end']:
        print(f"ERROR: segment {i+1} overlaps segment {i} ({keeps[i-1]['end']}s vs {k['start']}s)", file=sys.stderr)
        sys.exit(1)

os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)

scale_filter = (
    f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
    f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
    f"setsar=1,fps={FPS}"
)

total_kept = sum(k['end'] - k['start'] for k in keeps)
print(f"trim: {len(keeps)} segment(s) from {input_file}  (keeping {total_kept:.1f}s)")
for i, k in enumerate(keeps):
    dur = k['end'] - k['start']
    print(f"  [{i+1}] {k['start']:.1f}s → {k['end']:.1f}s  ({dur:.1f}s)")

if len(keeps) == 1:
    # Single segment — stream copy (near-instant, cuts at nearest keyframe)
    k = keeps[0]
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
        '-ss', str(k['start']),
        '-to', str(k['end']),
        '-i', input_file,
        '-c:v', 'copy', '-c:a', 'copy',
        '-movflags', '+faststart',
        out_file,
    ]
else:
    # Multi-segment: filter_complex with trim / atrim / concat (re-encode required)
    norm_parts = []
    concat_refs = ''
    for i, k in enumerate(keeps):
        norm_parts.append(
            f"[0:v]trim=start={k['start']}:end={k['end']},setpts=PTS-STARTPTS,"
            f"{scale_filter}[v{i}]"
        )
        norm_parts.append(
            f"[0:a]atrim=start={k['start']}:end={k['end']},asetpts=PTS-STARTPTS,"
            f"aresample={SAR},aformat=channel_layouts=stereo[a{i}]"
        )
        concat_refs += f'[v{i}][a{i}]'

    filter_graph = ';\n'.join(norm_parts) + ';\n' + concat_refs + f'concat=n={len(keeps)}:v=1:a=1[v][a]'

    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
        '-i', input_file,
        '-filter_complex', filter_graph,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', SAR,
        '-movflags', '+faststart',
        out_file,
    ]

print()
result = subprocess.run(cmd)
if result.returncode != 0:
    sys.exit(result.returncode)

size_mb = os.path.getsize(out_file) / (1024 * 1024)
# Get output duration via ffprobe
probe = subprocess.run(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
     '-of', 'default=noprint_wrappers=1:nokey=1', out_file],
    capture_output=True, text=True
)
out_dur = float(probe.stdout.strip()) if probe.returncode == 0 and probe.stdout.strip() else total_kept
print(f"\nDone: {out_file}  ({size_mb:.0f} MB, {out_dur:.1f}s kept of {total_kept:.1f}s planned)")
PYEOF
