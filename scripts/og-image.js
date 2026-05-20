/**
 * OG image generator
 *
 * Produces two families of branded PNGs:
 *
 *   - OG cards (1200x630) under images/og/ — used as social link
 *     previews on LinkedIn / Twitter / Slack. One default + one per
 *     site page + one per past talk.
 *   - Video cards (1920x1080) under images/video-cards/ — used as
 *     the title still in assembled YouTube videos AND as the YouTube
 *     thumbnail. One per past talk. If images/speakers/<slug>.png
 *     exists, it's composited in as a circular headshot.
 *
 * Run:  npm run og   (or:  node scripts/og-image.js)
 *
 * Re-run whenever you add a new talk to data/talks.json. Idempotent.
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const ROOT          = path.resolve(__dirname, '..');
const OG_DIR        = path.join(ROOT, 'images', 'og');
const CARD_DIR      = path.join(ROOT, 'images', 'video-cards');
const SPEAKERS_DIR  = path.join(ROOT, 'images', 'speakers');
fs.mkdirSync(OG_DIR,   { recursive: true });
fs.mkdirSync(CARD_DIR, { recursive: true });

// ---- shared SVG template ----
// 1200x630 with the DSE blue gradient + pattern marks. Text is wrapped by
// a small layout routine so long titles don't blow out the canvas.
function svg({ eyebrow, title, footer }) {
  const titleLines = wrap(title, 28);                        // ~28 chars/line at 64px
  const lineHeight = 76;
  const titleHeight = titleLines.length * lineHeight;
  const titleTop = Math.round((630 - titleHeight) / 2) + 20; // visually centred

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="#3514FF"/>
      <stop offset="100%" stop-color="#2A0FCC"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- decorative pattern -->
  <ellipse cx="1300" cy="600" rx="540" ry="540" fill="#fff" opacity="0.07"/>
  <ellipse cx="-200" cy="220" rx="540" ry="540" fill="#fff" opacity="0.07"/>
  <circle  cx="1100" cy="100" r="240"        fill="none" stroke="#89C5FD" stroke-width="14" opacity="0.6"/>
  <circle  cx="300"  cy="380" r="200"        fill="#4328EE"/>
  <circle  cx="1050" cy="540" r="14"         fill="#F9ABB9"/>

  <!-- eyebrow -->
  <text x="80" y="120"
        font-family="Space Grotesk, sans-serif" font-weight="500"
        font-size="22" letter-spacing="3.6" fill="#fff" opacity="0.85">
    ${esc(eyebrow.toUpperCase())}
  </text>

  <!-- title -->
  <g font-family="Space Grotesk, sans-serif" font-weight="700"
     font-size="64" fill="#fff" letter-spacing="-1.6">
    ${titleLines.map((line, i) =>
      `<text x="80" y="${titleTop + i * lineHeight}">${esc(line)}</text>`
    ).join('\n    ')}
  </g>

  <!-- footer chip -->
  <g transform="translate(80,540)">
    <rect x="0" y="0" width="${footer.length * 14 + 60}" height="56" rx="28"
          fill="#fff" opacity="0.12"/>
    <text x="30" y="36" font-family="Space Grotesk, sans-serif" font-weight="600"
          font-size="22" fill="#fff">${esc(footer)}</text>
  </g>
</svg>`.trim();
}

// Word-wrap helper. Greedy fill at the given approx character width.
function wrap(text, maxChars) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5); // cap at 5 lines
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function render(filename, fields) {
  const svgBuf = Buffer.from(svg(fields));
  const out = path.join(OG_DIR, filename);
  await sharp(svgBuf).png({ quality: 95 }).toFile(out);
  console.log(`  ${path.relative(ROOT, out)}`);
}

// ---- video card (1920x1080) ----
// Used for the 3 s title still in assembled YouTube videos and as the
// YouTube thumbnail. Layout: title (large) + description (smaller) at
// left, optional circular headshot at right, DSE wordmark bottom-left.
//
// Background and logo come from real brand SVGs (images/meetup-image-plain.svg
// and images/logos/DSE-logo-white.svg) rather than being hand-drawn here,
// so the design tracks any future brand updates.

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

// Find a headshot file for a speaker. Returns null if absent.
function findHeadshot(speaker) {
  if (!speaker) return null;
  const slug = slugify(speaker);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(SPEAKERS_DIR, `${slug}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Read an SVG file and return its inner content (everything between the
// root <svg> tags), so it can be wrapped inside a positioned <svg> in
// the composing template. Strips comments to keep output tidy.
function readSvgInner(filename) {
  const raw = fs.readFileSync(path.join(ROOT, 'images', filename), 'utf8');
  const m = raw.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!m) throw new Error(`Could not parse ${filename}`);
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

function videoCardSvg({ title, speaker, hasHeadshot, headshotDataUri }) {
  // When a headshot is present, constrain text to the left half so it
  // doesn't run into the circle. Without one, text gets a wider column.
  const titleLines  = wrap(title, hasHeadshot ? 18 : 26);
  const titleSize   = titleLines.length >= 4 ? 80 : titleLines.length >= 3 ? 92 : 108;
  const titleLH     = Math.round(titleSize * 1.05);
  const titleTop    = 220;
  const titleHeight = titleLines.length * titleLH;

  const speakerSize = 44;
  const speakerTop  = titleTop + titleHeight + 56;

  // Brand assets, inlined (vector preserved, single sharp render pass).
  const bgInner   = readSvgInner('meetup-image-plain.svg');
  const logoInner = readSvgInner('logos/DSE-logo-white.svg');

  return `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <clipPath id="head-clip">
      <circle cx="1560" cy="540" r="240"/>
    </clipPath>
  </defs>

  <!-- 1. Background pattern (meetup-image-plain.svg, sliced to fill 16:9) -->
  <svg x="0" y="0" width="1920" height="1080" viewBox="0 0 1001 564"
       preserveAspectRatio="xMidYMid slice">
    ${bgInner}
  </svg>

  <!-- 2. Title -->
  <g font-family="Space Grotesk, sans-serif" font-weight="700"
     font-size="${titleSize}" fill="#fff" letter-spacing="-2.4">
    ${titleLines.map((line, i) =>
      `<text x="120" y="${titleTop + i * titleLH}">${esc(line)}</text>`
    ).join('\n    ')}
  </g>

  <!-- 3. Speaker -->
  ${speaker ? `
  <text x="120" y="${speakerTop}"
        font-family="Hanken Grotesk, sans-serif" font-weight="500"
        font-size="${speakerSize}" fill="#fff" opacity="0.92">${esc(speaker)}</text>` : ''}

  <!-- 4. DSE wordmark, bottom-left (DSE-logo-white.svg @ 479x123) -->
  <svg x="120" y="920" width="360" height="92" viewBox="0 0 479 123"
       preserveAspectRatio="xMinYMid meet">
    ${logoInner}
  </svg>

  ${hasHeadshot ? `
  <!-- 5. Headshot -->
  <image x="1320" y="300" width="480" height="480"
         xlink:href="${headshotDataUri}"
         clip-path="url(#head-clip)"
         preserveAspectRatio="xMidYMid slice"/>
  ` : ''}
</svg>`.trim();
}

async function renderVideoCard(filename, fields) {
  let headshotDataUri = null;
  let hasHeadshot = false;
  if (fields.headshotPath) {
    // Pre-resize via sharp to keep the embedded data URI small.
    const buf = await sharp(fields.headshotPath)
      .resize(480, 480, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
    headshotDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    hasHeadshot = true;
  }

  const svgBuf = Buffer.from(videoCardSvg({
    title:   fields.title,
    speaker: fields.speaker,
    hasHeadshot,
    headshotDataUri,
  }));
  const out = path.join(CARD_DIR, filename);
  await sharp(svgBuf).png({ quality: 95 }).toFile(out);
  console.log(`  ${path.relative(ROOT, out)}`);
}

async function main() {
  console.log('Generating OG images...');

  // 1. Site-wide default
  await render('default.png', {
    eyebrow: 'Data Science in Education',
    title:   'A monthly meetup at the intersection of data and education.',
    footer:  'datascienceineducation.events',
  });

  // 2. Page-specific defaults
  await render('upcoming.png', {
    eyebrow: 'Upcoming',
    title:   'Talks, roughly once a month.',
    footer:  'datascienceineducation.events',
  });
  await render('past.png', {
    eyebrow: 'Past talks',
    title:   'Recordings and write-ups from past meetups.',
    footer:  'datascienceineducation.events',
  });
  await render('about.png', {
    eyebrow: 'About',
    title:   'Why we set up the meetup — what we talk about and who attends.',
    footer:  'datascienceineducation.events',
  });

  // 3. Per-talk cards (if data/events.json exists)
  const talksPath = path.join(ROOT, 'data', 'events.json');
  if (fs.existsSync(talksPath)) {
    const data = JSON.parse(fs.readFileSync(talksPath, 'utf8'));
    const now = new Date();
    for (const t of (data.events || []).filter(e => new Date(e.date) < now)) {
      const ogFile   = `talk-${t.slug}.png`;
      const footer   = [t.day, t.month, t.year].filter(Boolean).join(' ') || 'Data Science in Education';
      await render(ogFile, {
        eyebrow: t.speaker || 'Data Science in Education',
        title:   t.title,
        footer,
      });

      // 4. Video card (1920x1080) — used as the title still in the
      //    assembled YouTube video and as the YouTube thumbnail.
      const headshotPath = findHeadshot(t.speaker);
      await renderVideoCard(`talk-${t.slug}.png`, {
        title:   t.title,
        speaker: t.speaker,
        headshotPath,
      });
    }
  } else {
    console.log('  (no data/events.json yet - skipping per-talk OG images)');
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
