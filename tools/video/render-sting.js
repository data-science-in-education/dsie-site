#!/usr/bin/env node
/**
 * Render a CSS-animated HTML sting to a YouTube-ready MP4 with audio.
 *
 * Used to regenerate tools/video/defaults/{intro,outro}.mp4 from the
 * source HTML exported by Claude Design. We do this locally (rather
 * than letting the design tool export the MP4) so that real web
 * fonts — Space Grotesk in particular — get rendered correctly.
 *
 * How it works
 * ------------
 *   1. Headless Chromium loads the HTML at the target viewport.
 *   2. We wait for document.fonts.ready so webfonts are present
 *      before any frame is captured.
 *   3. All CSS animations are paused via the Web Animations API.
 *   4. For each frame, we set currentTime on every paused animation,
 *      let layout settle, screenshot, write a PNG.
 *   5. ffmpeg compiles the PNG sequence into a silent MP4, then
 *      muxes the audio with a short fade-out.
 *
 * Prerequisites (local machine, one time)
 * ---------------------------------------
 *   npm install                 # picks up playwright from devDependencies
 *   npx playwright install chromium
 *   sudo apt install ffmpeg     # or brew install ffmpeg / winget Gyan.FFmpeg
 *
 * Usage
 * -----
 *   node tools/video/render-sting.js \
 *     --html  tools/video/sting-src/intro.html \
 *     --audio tools/video/sting-src/synth-swell-jingle.wav \
 *     --out   tools/video/defaults/intro.mp4
 *
 *   # Optional flags:
 *   #   --duration <seconds>   default 5
 *   #   --fps      <int>       default 30
 *   #   --width    <px>        default 1920
 *   #   --height   <px>        default 1080
 *   #   --fade-out <seconds>   audio fade-out length, default 0.8
 */

const fs           = require('fs');
const os           = require('os');
const path         = require('path');
const { spawnSync } = require('child_process');

function parseArgs() {
  const out = { duration: 5, fps: 30, width: 1920, height: 1080, fadeOut: 0.8 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case '--html':     out.html     = v; i++; break;
      case '--audio':    out.audio    = v; i++; break;
      case '--out':      out.out      = v; i++; break;
      case '--duration': out.duration = parseFloat(v); i++; break;
      case '--fps':      out.fps      = parseInt(v, 10); i++; break;
      case '--width':    out.width    = parseInt(v, 10); i++; break;
      case '--height':   out.height   = parseInt(v, 10); i++; break;
      case '--fade-out': out.fadeOut  = parseFloat(v); i++; break;
      case '-h': case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 42).map(l => l.replace(/^ \*\/?/, '')).join('\n'));
        process.exit(0);
      default:
        console.error(`Unknown flag: ${k}`);
        process.exit(2);
    }
  }
  for (const required of ['html', 'audio', 'out']) {
    if (!out[required]) {
      console.error(`Missing --${required}. Run with --help for usage.`);
      process.exit(2);
    }
  }
  return out;
}

function requireFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version']);
  if (r.status !== 0) {
    console.error('ffmpeg not found on PATH. Install it first (apt / brew / winget).');
    process.exit(1);
  }
}

async function renderFrames(args, framesDir) {
  // Lazy require so a missing playwright fails with a friendly message
  // instead of crashing on the require line.
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('playwright not installed. Run: npm install && npx playwright install chromium');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  const fileUrl = 'file://' + path.resolve(args.html);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Real webfonts must be present before the first frame.
  await page.evaluate(() => document.fonts.ready);

  // Pause every CSS animation on the page so we can scrub.
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.pause();
  });

  const total = Math.round(args.fps * args.duration);
  console.log(`Rendering ${total} frame(s) at ${args.width}x${args.height}@${args.fps}fps...`);

  for (let i = 0; i < total; i++) {
    const tMs = (i / args.fps) * 1000;
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) a.currentTime = t;
    }, tMs);
    // Give layout one tick to settle before screenshotting.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

    const file = path.join(framesDir, `f${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: file, type: 'png', omitBackground: false });

    if (i % args.fps === 0) process.stdout.write(`  ${(i / args.fps).toFixed(1)}s\n`);
  }

  await browser.close();
}

function compileSilentMp4(framesDir, args, silentMp4) {
  console.log('Encoding silent MP4 ...');
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
    '-framerate', String(args.fps),
    '-i', path.join(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-r', String(args.fps), '-movflags', '+faststart',
    silentMp4,
  ], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg encode failed'); process.exit(1); }
}

function muxAudio(silentMp4, args) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  console.log(`Muxing audio ${path.relative(process.cwd(), args.audio)} -> ${path.relative(process.cwd(), args.out)} ...`);
  const fadeStart = (args.duration - args.fadeOut).toFixed(3);
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-stats', '-y',
    '-i', silentMp4,
    '-i', args.audio,
    '-filter_complex',
      `[1:a]atrim=0:${args.duration},afade=t=out:st=${fadeStart}:d=${args.fadeOut}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    args.out,
  ], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg mux failed'); process.exit(1); }
}

async function main() {
  const args = parseArgs();
  if (!fs.existsSync(args.html))  { console.error(`html not found: ${args.html}`);   process.exit(1); }
  if (!fs.existsSync(args.audio)) { console.error(`audio not found: ${args.audio}`); process.exit(1); }
  requireFfmpeg();

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sting-frames-'));
  const silentMp4 = path.join(framesDir, 'silent.mp4');
  try {
    await renderFrames(args, framesDir);
    compileSilentMp4(framesDir, args, silentMp4);
    muxAudio(silentMp4, args);
    console.log(`\nDone: ${args.out}`);
  } finally {
    // Keep frames around if RENDER_STING_KEEP_FRAMES is set, useful when
    // diagnosing visual glitches.
    if (!process.env.RENDER_STING_KEEP_FRAMES) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    } else {
      console.log(`Frames kept at: ${framesDir}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
