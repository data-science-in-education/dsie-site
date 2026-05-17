# DSE video pipeline

Two scripts:

- `assemble.sh` — stitches **intro + speaker recording + outro** into one YouTube-ready MP4.
- `upload.py` — uploads that MP4 to the DSE YouTube channel via the YouTube Data API.

The speaker recording is assumed to already contain the slides (i.e. a screen recording of the talk), so slide timing comes for free.

## Sting sources

The intro/outro stings live as a single React-based HTML player exported from Claude Design. Files in `tools/video/sting-src/`:

| File                          | What                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `dse-sting-player.html`       | Self-contained HTML page with both intro and outro animations + an in-browser MP4 export button. Loads Space Grotesk / Hanken Grotesk webfonts inline. |
| `synth-swell-jingle.mp3`      | The 5 s jingle, baked. The player can also synthesise it live, but having a static copy means we can mux it onto custom video later if we ever want to. |

The rendered outputs (`tools/video/defaults/intro.mp4`, `outro.mp4`) are committed so anyone can build a talk video without re-rendering. Re-render them by following the steps in [Re-rendering the stings](#re-rendering-the-stings) below.

## Re-rendering the stings

You only need to do this if the source HTML or audio changes. Otherwise the existing `defaults/intro.mp4` and `defaults/outro.mp4` are already correct.

1. Open `tools/video/sting-src/dse-sting-player.html` in **Chrome or Edge** (other browsers don't have the WebCodecs API the player needs). Wait for the "Unpacking…" pill to disappear.
2. Open DevTools (F12) → **Console**. Paste this snippet and hit Enter:
   ```js
   // Patch AVC level so the player's WebCodecs encoder accepts 1080p.
   // Without this you get: "coded area exceeds maximum for AVC level 3.1".
   const _origConfigure = VideoEncoder.prototype.configure;
   VideoEncoder.prototype.configure = function (cfg) {
     if (cfg.codec && cfg.codec.startsWith('avc1.')) {
       cfg.codec = cfg.codec.slice(0, -2) + '28'; // → Level 4.0
     }
     return _origConfigure.call(this, cfg);
   };
   console.log('VideoEncoder.configure patched: AVC level → 4.0');
   ```
3. Click **Download MP4 · Intro**. The browser will download `dse-sting-intro.mp4`.
4. Click **Download MP4 · Outro**. Same: `dse-sting-outro.mp4`.
5. Move the downloads into place:
   ```bash
   mv ~/Downloads/dse-sting-intro.mp4 tools/video/defaults/intro.mp4
   mv ~/Downloads/dse-sting-outro.mp4 tools/video/defaults/outro.mp4
   ```
6. Eyeball the result — "Data Science in Education" should be rendered in Space Grotesk (single-storey `a`, distinctive geometric `S`). Commit if it looks right.

### Why the DevTools patch?

The player's in-browser MP4 export uses the WebCodecs `VideoEncoder` API. It defaults to AVC Level 3.1, which caps the coded area at 1280×720 (~921K pixels). At 1920×1088 (1080p rounded up to the macroblock grid) that's ~2.1M pixels — over the limit. Level 4.0 raises the cap to ~8.4M pixels, comfortably enough for 1080p. The snippet monkey-patches `VideoEncoder.prototype.configure` to rewrite the level byte before any encoder is created.

We don't bake the patch into the HTML because the HTML is meant to round-trip back to Claude Design — if they re-export, you should be able to drop the new file in and re-run the same workflow.

## One-time setup

```bash
# 1. System tools
#    WSL / Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg python3-venv

#    macOS         : brew install ffmpeg
#    Windows (PS)  : winget install Gyan.FFmpeg   (or: choco install ffmpeg)

# 2. Python deps (for upload.py)
python3 -m venv .venv && source .venv/bin/activate
pip install -r tools/video/requirements.txt

# 3. (No step 3 — the rendered intro/outro stings ship with the repo
#     at tools/video/defaults/{intro,outro}.mp4. If you need to
#     re-render them, see "Re-rendering the stings" above.)

# 4. YouTube OAuth (once)
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
