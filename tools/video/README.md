# DSE video pipeline

Three scripts:

- `render-sting.js` — renders the intro/outro **stings** from `sting-src/*.html` + `sting-src/*.wav` to MP4. Run via `npm run render-stings`. Headless Chromium drives the CSS animation so real web fonts (Space Grotesk) render correctly.
- `assemble.sh` — stitches **intro + speaker recording + outro** into one YouTube-ready MP4.
- `upload.py` — uploads that MP4 to the DSE YouTube channel via the YouTube Data API.

The speaker recording is assumed to already contain the slides (i.e. a screen recording of the talk), so slide timing comes for free.

## Sting sources

Source files live under `tools/video/sting-src/`:

| File                            | What                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| `intro.html` / `outro.html`     | Self-contained HTML pages with a CSS-animated SVG. Exported from Claude Design. Load Space Grotesk from jsDelivr. |
| `synth-swell-jingle.wav`        | Shared 5 s jingle. Same audio under both stings.                          |

The rendered outputs (`tools/video/defaults/intro.mp4`, `outro.mp4`) are committed so anyone can build a talk video without re-rendering. If the HTML or audio changes, run `npm run render-stings` and commit the updated MP4s.

## One-time setup

```bash
# 1. System tools
#    WSL / Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg python3-venv

#    macOS         : brew install ffmpeg
#    Windows (PS)  : winget install Gyan.FFmpeg   (or: choco install ffmpeg)

# 2. Node deps (Playwright for the sting renderer)
npm install
npx playwright install chromium

# 3. Python deps (for upload.py)
python3 -m venv .venv && source .venv/bin/activate
pip install -r tools/video/requirements.txt

# 4. (No step 4 — the rendered intro/outro stings ship with the repo
#     at tools/video/defaults/{intro,outro}.mp4. To re-render them
#     from sting-src/, run: `npm run render-stings`.)

# 5. YouTube OAuth (once)
#    - https://console.cloud.google.com/ -> create a project
#    - Enable "YouTube Data API v3"
#    - Create OAuth client ID -> "Desktop app"
#    - Download client_secrets.json -> tools/video/client_secrets.json
#    - Sign in with the Google account that owns/manages the YT channel
```

On WSL, the OAuth consent step opens a browser via `xdg-open`. If that
doesn't pop a browser on the Windows host, copy the URL the script
prints and open it manually in your normal browser; the consent
redirect comes back to `http://localhost:<port>` which WSL forwards
automatically.

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

**"ffmpeg not found"** — install ffmpeg: `sudo apt install ffmpeg` on WSL/Ubuntu, `brew install ffmpeg` on macOS, or `winget install Gyan.FFmpeg` on Windows.

**"client_secrets.json not found"** — finish the Google Cloud Console step in setup above.

**Upload fails with `quotaExceeded`** — YouTube Data API has a daily quota; an upload costs about 1600 units of the default 10k/day. Wait until tomorrow or request a quota increase.

**Audio out of sync after concat** — your inputs probably have variable framerate. Re-encode the source with `ffmpeg -i in.mp4 -r 30 -c:v libx264 -crf 18 -c:a aac normalised.mp4` and feed that to `assemble.sh`.

**Want a different output spec** — edit the `TARGET_W` / `TARGET_H` / `TARGET_FPS` constants at the top of `assemble.sh`.
