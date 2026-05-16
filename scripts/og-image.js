/**
 * OG image generator
 *
 * Produces 1200x630 PNGs that platforms (LinkedIn, Twitter/X, Slack, etc.)
 * use as link previews. Two outputs:
 *
 *   - images/og/default.png         site-wide fallback
 *   - images/og/talk-<slug>.png     one per past talk in data/talks.json
 *
 * The site-wide default is referenced via <meta property="og:image"> in
 * every HTML file. Per-talk pages override that at render time (handled
 * in past-loader.js).
 *
 * Run:  npm run og   (or:  node scripts/og-image.js)
 *
 * Re-run whenever you add a new talk to data/talks.json. Idempotent.
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OG_DIR = path.join(ROOT, 'images', 'og');
fs.mkdirSync(OG_DIR, { recursive: true });

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

  // 3. Per-talk cards (if data/talks.json exists)
  const talksPath = path.join(ROOT, 'data', 'talks.json');
  if (fs.existsSync(talksPath)) {
    const data = JSON.parse(fs.readFileSync(talksPath, 'utf8'));
    for (const t of (data.posts || [])) {
      const filename = `talk-${t.slug}.png`;
      const footer = [t.day, t.month, t.year].filter(Boolean).join(' ') || 'Data Science in Education';
      await render(filename, {
        eyebrow: t.speaker || 'Data Science in Education',
        title:   t.title,
        footer,
      });
    }
  } else {
    console.log('  (no data/talks.json yet - skipping per-talk OG images)');
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
