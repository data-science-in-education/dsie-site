// Populate the upcoming-talks list on upcoming.html from data/events.json.
// data/events.json is generated upstream (the dsie-ops repo) and committed
// here. When it's missing or empty, the static empty-state block already in
// the HTML stays put.

document.addEventListener('DOMContentLoaded', () => {
  const list  = document.getElementById('upcoming-list');
  const empty = document.getElementById('upcoming-empty');
  if (!list) return;

  fetchEvents()
    .then(events => {
      if (events.length === 0) return;            // keep the empty state
      if (empty) empty.style.display = 'none';
      list.innerHTML = events.map(renderRow).join('');
    })
    .catch(err => console.error('Upcoming load error:', err));
});

async function fetchEvents() {
  let res;
  try { res = await fetch('data/events.json'); }
  catch { return []; }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('Could not load events');
  const data = await res.json().catch(() => ({}));
  const now = new Date();
  return (data.events || []).filter(e => new Date(e.date) >= now);
}

function renderRow(e) {
  const title    = escapeHtml(e.title || '');
  const speaker  = escapeHtml(e.speaker || '');
  const location = escapeHtml(e.location || '');
  const time     = escapeHtml(e.time || '');
  const day      = escapeHtml(e.day || '');
  const month    = escapeHtml(e.month || '');
  const year     = escapeHtml(e.year || '');
  const rsvp     = e.registrationUrl || 'https://www.meetup.com/data-science-in-education/';

  const metaParts = [speaker, time, location].filter(Boolean).join(' · ');

  return `
    <article class="upcoming-row">
      <div class="upcoming-date">
        <div class="upcoming-day">${day}</div>
        <div class="upcoming-monthyear">${month} ${year}</div>
      </div>
      <div class="upcoming-body">
        <h3 class="upcoming-title">${title}</h3>
        ${metaParts ? `<p class="upcoming-meta">${metaParts}</p>` : ''}
      </div>
      <a class="dse-btn primary upcoming-rsvp" href="${escapeAttr(rsvp)}" target="_blank" rel="noreferrer">RSVP <span class="arr">→</span></a>
    </article>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }
