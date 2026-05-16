# DSE video pipeline

Two scripts:

- `assemble.sh` — stitches **intro + speaker recording + outro** into one YouTube-ready MP4.
- `upload.py` — uploads that MP4 to the DSE YouTube channel via the YouTube Data API.

The speaker recording is assumed to already contain the slides (i.e. a screen recording of the talk), so slide timing comes for free.

## One-time setup

```bash
# 1. Tools
brew install ffmpeg                       # or apt install ffmpeg
python3 -m venv .venv && source .venv/bin/activate
pip install -r tools/video/requirements.txt

# 2. Drop your standard intro/outro into defaults/
mkdir -p tools/video/defaults
cp /path/to/intro.mp4 tools/video/defaults/intro.mp4
cp /path/to/outro.mp4 tools/video/defaults/outro.mp4

# 3. YouTube OAuth (once)
#    - https://console.cloud.google.com/ -> create a project
#    - Enable "YouTube Data API v3"
#    - Create OAuth client ID -> "Desktop app"
#    - Download client_secrets.json -> tools/video/client_secrets.json
#    - Sign in with the Google account that owns/manages the YT channel
```

`client_secrets.json` and `token.json` are gitignored — they never leave your machine.

## Per-talk workflow

```bash
# 1. Assemble
tools/video/assemble.sh \
  --speaker /path/to/speaker-recording.mp4 \
  --out out/lena-park-causal.mp4

# Options:
#   --intro / --outro    override the defaults
#   --audio audio.wav    replace the speaker-recording audio with a
#                        higher-quality separate track
#   --out path           default is out/final.mp4

# 2. Fill in the metadata
cp tools/video/metadata.example.yaml tools/video/talks/lena-park.yaml
# ... edit title, description, tags ...

# 3. Upload
python tools/video/upload.py \
  --video out/lena-park-causal.mp4 \
  --metadata tools/video/talks/lena-park.yaml

# Prints the video URL when done.
```

You can skip the metadata file and pass flags inline instead:

```bash
python tools/video/upload.py \
  --video out/talk.mp4 \
  --title "Talk title" \
  --description "Talk description ..." \
  --tags "data science,education,causal inference" \
  --privacy unlisted
```

## What it produces

All videos are normalised to a single spec so they play back consistently and concat cleanly:

- 1920×1080, 30 fps, letterboxed if the source aspect doesn't match
- H.264 (libx264, CRF 18, preset slow) — high quality, ~5–8 Mbps
- AAC stereo, 192 kbps, 48 kHz
- `+faststart` for instant playback on YouTube

## Troubleshooting

**"ffmpeg not found"** — install ffmpeg (`brew install ffmpeg` on macOS).

**"client_secrets.json not found"** — finish the Google Cloud Console step in setup above.

**Upload fails with `quotaExceeded`** — YouTube Data API has a daily quota; an upload costs about 1600 units of the default 10k/day. Wait until tomorrow or request a quota increase.

**Audio out of sync after concat** — your inputs probably have variable framerate. Re-encode the source with `ffmpeg -i in.mp4 -r 30 -c:v libx264 -crf 18 -c:a aac normalised.mp4` and feed that to `assemble.sh`.

**Want a different output spec** — edit the `TARGET_W` / `TARGET_H` / `TARGET_FPS` constants at the top of `assemble.sh`.
