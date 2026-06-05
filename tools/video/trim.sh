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
python3 - "$CUTS" "$INPUT" "$OUT" <<'PYEOF'
import json, sys, subprocess, os

cuts_file, input_file, out_file = sys.argv[1], sys.argv[2], sys.argv[3]

with open(cuts_file) as f:
    data = json.load(f)

keeps = data.get('keep', [])
if not keeps:
    print("ERROR: no keep segments found in cuts.json", file=sys.stderr)
    sys.exit(1)

keeps = sorted(keeps, key=lambda k: k['start'])
for i, k in enumerate(keeps):
    if k['end'] <= k['start']:
        print(f"ERROR: segment {i+1} has end <= start ({k['start']}s → {k['end']}s)", file=sys.stderr)
        sys.exit(1)
    if i > 0 and k['start'] < keeps[i-1]['end']:
        print(f"ERROR: segment {i+1} overlaps segment {i} ({keeps[i-1]['end']}s vs {k['start']}s)", file=sys.stderr)
        sys.exit(1)

os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)

total_kept = sum(k['end'] - k['start'] for k in keeps)
print(f"trim: {len(keeps)} segment(s) from {input_file}  (keeping {total_kept:.1f}s)")
for i, k in enumerate(keeps):
    dur = k['end'] - k['start']
    print(f"  [{i+1}] {k['start']:.1f}s → {k['end']:.1f}s  ({dur:.1f}s)")
print()

if len(keeps) == 1:
    k = keeps[0]
    result = subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
        '-ss', str(k['start']),
        '-i', input_file,
        '-t', str(k['end'] - k['start']),  # output duration, not input -to, avoids moov duration bug
        '-c', 'copy', '-avoid_negative_ts', 'make_zero',
        out_file,
    ])
    if result.returncode != 0:
        sys.exit(result.returncode)
else:
    # Extract each segment with stream copy, then concat — no re-encode.
    # assemble.sh normalises (scale, fps, codec) anyway.
    segs, ok = [], True
    for i, k in enumerate(keeps):
        seg = f'/tmp/dse-trim-seg-{i}.mp4'
        segs.append(seg)
        print(f"extract [{i+1}/{len(keeps)}] {k['start']:.1f}s → {k['end']:.1f}s")
        r = subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y',
            '-ss', str(k['start']),
            '-i', input_file,
            '-t', str(k['end'] - k['start']),  # output duration, not input -to, avoids moov duration bug
            '-c', 'copy', '-avoid_negative_ts', 'make_zero', seg,
        ])
        if r.returncode != 0:
            ok = False; break

    if ok:
        concat_list = '/tmp/dse-trim-concat.txt'
        with open(concat_list, 'w') as fh:
            fh.writelines(f"file '{s}'\n" for s in segs)
        print()
        result = subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
            '-f', 'concat', '-safe', '0', '-i', concat_list,
            '-c', 'copy',
            out_file,
        ])
        ok = result.returncode == 0
        try: os.unlink(concat_list)
        except: pass

    for s in segs:
        try: os.unlink(s)
        except: pass
    if not ok:
        sys.exit(1)

size_mb = os.path.getsize(out_file) / (1024 * 1024)
probe = subprocess.run(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
     '-of', 'default=noprint_wrappers=1:nokey=1', out_file],
    capture_output=True, text=True
)
out_dur = float(probe.stdout.strip()) if probe.returncode == 0 and probe.stdout.strip() else total_kept
print(f"\nDone: {out_file}  ({size_mb:.0f} MB, {out_dur:.1f}s kept of {total_kept:.1f}s planned)")
PYEOF
