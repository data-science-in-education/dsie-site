// Populates the home page upcoming and past-talks sections from data/events.json.
// Runs only on index.html — depends on #home-upcoming-list, #home-upcoming-empty,
// #home-past-grid, and #home-past-empty being present in the DOM.

document.addEventListener('DOMContentLoaded', () => {
  loadHomeUpcoming();
  loadHomePast();
  loadHomeStats();
});

async function fetchAllEvents() {
  try {
    const res = await fetch('data/events.json');
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return data.events || [];
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------
// Stats bar
// ----------------------------------------------------------------
async function loadHomeStats() {
  const section = document.getElementById('home-stats-section');
  const bar     = document.getElementById('home-stats-bar');
  if (!section || !bar) return;

  const events  = await fetchAllEvents();
  const now     = new Date();
  const past    = events.filter(e => new Date(e.date) < now);
  if (past.length === 0) return;

  const years = new Set(past.map(e => new Date(e.date).getFullYear()));
  const span  = Math.max(...years) - Math.min(...years) + 1;

  bar.innerHTML = [
    { n: past.length + '+', label: 'talks recorded' },
    { n: span + (span === 1 ? ' year' : ' years'), label: 'running' },
    { n: years.size, label: 'calendar years' },
  ].map(s => `<li><span class="home-stat-number">${esc(String(s.n))}</span><span class="home-stat-label">${esc(s.label)}</span></li>`).join('');

  section.style.display = '';
}

// ----------------------------------------------------------------
// Upcoming (up to 3, soonest first)
// ----------------------------------------------------------------
async function loadHomeUpcoming() {
  const list  = document.getElementById('home-upcoming-list');
  const empty = document.getElementById('home-upcoming-empty');
  if (!list) return;

  const events  = await fetchAllEvents();
  const now     = new Date();
  const upcoming = events
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);

  if (upcoming.length === 0) return;

  if (empty) empty.style.display = 'none';
  list.innerHTML = upcoming.map(renderUpcomingRow).join('');
}

function renderUpcomingRow(e) {
  const title    = esc(e.title    || '');
  const speaker  = esc(e.speaker  || '');
  const time     = esc(e.time     || '');
  const location = esc(e.location || '');
  const day      = esc(e.day      || '');
  const month    = esc(e.month    || '');
  const year     = esc(e.year     || '');
  const rsvp     = e.registrationUrl || 'https://www.meetup.com/data-science-in-education/';
  const meta     = [speaker, time, location].filter(Boolean).join(' · ');

  return `
    <article class="upcoming-row">
      <div class="upcoming-date">
        <div class="upcoming-day">${day}</div>
        <div class="upcoming-monthyear">${month} ${year}</div>
      </div>
      <div class="upcoming-body">
        <h3 class="upcoming-title">${title}</h3>
        ${meta ? `<p class="upcoming-meta">${meta}</p>` : ''}
      </div>
      <a class="dse-btn primary upcoming-rsvp" href="${esc(rsvp)}" target="_blank" rel="noreferrer">RSVP <span class="arr">→</span></a>
    </article>`;
}

// ----------------------------------------------------------------
// Past talks (up to 3, most recent first)
// ----------------------------------------------------------------
const TONES = ['blue', 'pink', 'sky', 'navy'];

async function loadHomePast() {
  const grid  = document.getElementById('home-past-grid');
  const empty = document.getElementById('home-past-empty');
  if (!grid) return;

  const events = await fetchAllEvents();
  const now    = new Date();
  const past   = events
    .filter(e => new Date(e.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  if (past.length === 0) return;

  if (empty) empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = past.map((post, i) => buildBlogCard(post, i)).join('');
}

function buildBlogCard(post, index) {
  const href   = 'past-talk.html?id=' + encodeURIComponent(post.slug);
  const tone   = TONES[index % TONES.length];
  const title  = esc(post.title);
  const author = esc(post.speaker || '');
  const date   = [post.day, post.month, post.year].filter(Boolean).join(' ');
  const sz     = 32;
  const fs     = Math.round(sz * 0.35);
  const initials = (post.speaker || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();

  let avatar = '';
  if (post.speakerPhotoUrl) {
    avatar = `<img src="${esc(post.speakerPhotoUrl)}" alt="${esc(post.speaker || '')}" class="talk-avatar" style="--sz:${sz}px">`;
  } else if (initials) {
    avatar = `<div class="talk-avatar talk-avatar-initials" style="--sz:${sz}px;font-size:${fs}px">${initials}</div>`;
  }

  return `
    <a href="${href}" class="dse-blog-card" data-year="${post.year || ''}">
      <div class="dse-blog-panel ${tone}">
        <svg class="blog-panel-decor" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="320" cy="60"  r="120" fill="none" stroke="currentColor" stroke-width="3" opacity="0.5"/>
          <circle cx="80"  cy="250" r="100" fill="currentColor" opacity="0.07"/>
          <circle cx="200" cy="40"  r="6"   fill="currentColor" opacity="0.5"/>
        </svg>
        <div class="blog-panel-content">
          <div class="blog-panel-title">${title}</div>
        </div>
      </div>
      <div class="blog-card-meta">
        ${author ? `<div style="display:flex;align-items:center;gap:8px">${avatar}<span>${author}</span></div>` : ''}
        ${date ? `<span style="margin-left:auto">${date}</span>` : ''}
      </div>
    </a>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
