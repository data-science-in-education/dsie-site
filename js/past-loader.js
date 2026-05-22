document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('blog-grid')) {
    loadBlogListing();
  } else if (document.getElementById('blog-post-content')) {
    loadBlogPost();
  }
});

const TONES = ['blue', 'pink', 'sky', 'navy'];

async function fetchTalks() {
  let res;
  try {
    res = await fetch('data/events.json');
  } catch {
    return { posts: [] };
  }
  if (res.status === 404) return { posts: [] };
  if (!res.ok) throw new Error('Could not load talks data');
  try {
    const data = await res.json();
    const now = new Date();
    const past = (data.events || [])
      .filter(e => new Date(e.date) < now)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return { posts: past };
  } catch {
    return { posts: [] };
  }
}

// Returns an <img> or initials <div> for a speaker. size defaults to 32.
function speakerAvatar(speaker, photoUrl, size) {
  const sz       = size || 32;
  const initials = (speaker || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
  const fs       = Math.round(sz * 0.35);
  if (photoUrl) {
    return `<img src="${escapeAttr(photoUrl)}" alt="${escapeHtml(speaker || '')}" class="talk-avatar" style="--sz:${sz}px">`;
  }
  if (initials) {
    return `<div class="talk-avatar talk-avatar-initials" style="--sz:${sz}px;font-size:${fs}px">${initials}</div>`;
  }
  return '';
}

// ----------------------------------------------------------------
// Past-talks listing page
// ----------------------------------------------------------------
async function loadBlogListing() {
  const grid       = document.getElementById('blog-grid');
  const emptyEl    = document.getElementById('blog-empty');
  const featuredEl = document.getElementById('blog-featured');
  const filterEl   = document.getElementById('year-filter');

  try {
    const data  = await fetchTalks();
    const posts = data.posts || [];

    if (posts.length === 0) {
      if (grid)    grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      if (featuredEl) featuredEl.style.display = 'none';
      const section = document.getElementById('featured-section');
      if (section) section.style.display = 'none';
      return;
    }

    // Featured post (most recent)
    if (featuredEl) {
      const f    = posts[0];
      const date = [f.day, f.month, f.year].filter(Boolean).join(' ');
      featuredEl.innerHTML = buildFeaturedCard(f, date);
    }

    // Remaining posts → grid
    const rest = posts.slice(1);
    if (rest.length === 0) {
      if (grid)    grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
    } else {
      grid.innerHTML = rest.map((post, i) => buildBlogCard(post, i + 1)).join('');

      // Search + year filter
      if (filterEl) {
        const years = [...new Set(rest.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
        filterEl.innerHTML = buildFilter(years);

        let activeYear = '';
        let searchQuery = '';

        function applyFilter() {
          grid.querySelectorAll('.dse-blog-card').forEach(card => {
            const yearOk   = !activeYear || card.dataset.year === activeYear;
            const searchOk = !searchQuery || card.dataset.search.includes(searchQuery);
            card.style.display = (yearOk && searchOk) ? '' : 'none';
          });
        }

        filterEl.addEventListener('click', e => {
          const pill = e.target.closest('.year-pill');
          if (!pill) return;
          filterEl.querySelectorAll('.year-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          activeYear = pill.dataset.year;
          applyFilter();
        });

        const searchInput = filterEl.querySelector('.past-search');
        if (searchInput) {
          searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.toLowerCase().trim();
            applyFilter();
          });
        }
      }
    }

  } catch (err) {
    console.error('Talks load error:', err);
    if (grid) grid.innerHTML = '<p class="blog-error">Could not load past talks. Please try again later.</p>';
  }
}

function buildFilter(years) {
  const pills = years.length > 1 ? [
    '<button class="year-pill active" data-year="">All</button>',
    ...years.map(y => `<button class="year-pill" data-year="${y}">${y}</button>`),
  ].join('') : '';
  const yearRow = pills ? `<div class="year-filter-inner">${pills}</div>` : '';
  return `<div class="past-filter-row">
    <input class="past-search" type="search" placeholder="Search talks…" aria-label="Search talks">
    ${yearRow}
  </div>`;
}

function buildFeaturedCard(post, date) {
  const href   = 'past-talk.html?id=' + encodeURIComponent(post.slug);
  const title  = escapeHtml(post.title);
  const author = escapeHtml(post.speaker || '');
  const avatar = speakerAvatar(post.speaker, post.speakerPhotoUrl, 40);

  return `
    <a href="${href}" class="dse-blog-featured">
      <div class="blog-featured-panel">
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.5;pointer-events:none" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="340" cy="80"  r="160" fill="none" stroke="#89C5FD" stroke-width="4" opacity="0.7"/>
          <circle cx="120" cy="240" r="90"  fill="#4328EE"/>
          <circle cx="200" cy="40"  r="8"   fill="#F9ABB9"/>
        </svg>
        <div style="position:relative;z-index:2">
          <h2 class="blog-featured-title">${title}</h2>
        </div>
      </div>
      <div class="blog-featured-body">
        <div style="display:flex;align-items:center;gap:12px;margin-top:auto">
          ${avatar}
          <div class="meta"><b style="color:var(--dse-ink)">${author}</b>${date ? ' · ' + date : ''}</div>
        </div>
        <span class="dse-btn primary" style="align-self:flex-start;margin-top:16px;display:inline-flex">Watch the talk <span class="arr">→</span></span>
      </div>
    </a>`;
}

function buildBlogCard(post, index) {
  const href       = 'past-talk.html?id=' + encodeURIComponent(post.slug);
  const tone       = TONES[index % TONES.length];
  const title      = escapeHtml(post.title);
  const author     = escapeHtml(post.speaker || '');
  const date       = [post.day, post.month, post.year].filter(Boolean).join(' ');
  const avatar     = speakerAvatar(post.speaker, post.speakerPhotoUrl, 32);
  const searchText = escapeHtml([post.title, post.speaker].filter(Boolean).join(' ').toLowerCase());

  return `
    <a href="${href}" class="dse-blog-card" data-year="${post.year || ''}" data-search="${searchText}">
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

// ----------------------------------------------------------------
// Single past-talk page
// ----------------------------------------------------------------
async function loadBlogPost() {
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('id');

  if (!slug) { showPostError('No post specified.'); return; }

  try {
    const data = await fetchTalks();
    const post = (data.posts || []).find(p => p.slug === slug);

    if (!post) { showPostError('Post not found.'); return; }

    document.title = post.title + ' — Data Science in Education';

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', location.href);
    document.querySelectorAll('meta[property="og:url"]').forEach(el => el.setAttribute('content', location.href));
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(el => el.setAttribute('content', post.title + ' — Data Science in Education'));
    document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]').forEach(el => {
      if (post.description) el.setAttribute('content', post.description.slice(0, 200));
    });

    const ogPath = `/images/og/talk-${post.slug}.png`;
    const ogAbs  = window.location.origin + ogPath;
    document.querySelectorAll(
      'meta[property="og:image"], meta[name="twitter:image"]'
    ).forEach(el => el.setAttribute('content', ogAbs));

    const titleEl = document.getElementById('post-title');
    const metaEl  = document.getElementById('post-meta');
    if (titleEl) titleEl.textContent = post.title;
    if (metaEl) {
      const parts = [];
      if (post.day || post.month || post.year)
        parts.push([post.day, post.month, post.year].filter(Boolean).join(' '));
      if (post.speaker) parts.push(escapeHtml(post.speaker));
      metaEl.innerHTML = parts.join(' · ');
    }

    const content = document.getElementById('blog-post-content');
    const chunks  = [];

    if (post.youtubeId) {
      chunks.push(`
        <div class="video-embed-wrapper">
          <div class="video-embed">
            <iframe
              src="https://www.youtube.com/embed/${escapeHtml(post.youtubeId)}"
              title="${escapeHtml(post.title)}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        </div>`);
    }

    if (post.description) {
      chunks.push(`
        <figure class="talk-quote-standalone">
          <blockquote>${escapeHtml(post.description)}</blockquote>
        </figure>`);
    }

    if (post.speaker || post.speakerBio) {
      const avatar   = speakerAvatar(post.speaker, post.speakerPhotoUrl, 40);
      const nameHtml = post.speaker
        ? `<span class="talk-quote-name">${escapeHtml(post.speaker)}</span>` : '';
      const attrHtml = (avatar || nameHtml)
        ? `<div class="talk-quote-attr">${avatar}${nameHtml}</div>` : '';
      const bioHtml  = post.speakerBio
        ? `<p class="talk-speaker-bio">${escapeHtml(post.speakerBio)}</p>` : '';
      chunks.push(`<div class="talk-speaker-card">${attrHtml}${bioHtml}</div>`);
    }

    if (post.contentHtml) {
      chunks.push(`<div class="blog-content">${post.contentHtml}</div>`);
    }

    if (content) content.innerHTML = chunks.join('');

    // Structured data
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: post.title,
      startDate: post.date,
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      organizer: { '@type': 'Organization', name: 'Data Science in Education', url: 'https://datascienceineducation.events' },
    };
    if (post.description) schema.description = post.description.slice(0, 500);
    if (post.speaker)     schema.performer    = { '@type': 'Person', name: post.speaker };
    if (post.youtubeUrl)  schema.recordedIn   = { '@type': 'VideoObject', url: post.youtubeUrl, name: post.title };
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify(schema);
    document.head.appendChild(ld);

    // Next / prev navigation
    const allPosts = data.posts;
    const idx    = allPosts.findIndex(p => p.slug === slug);
    const newer  = allPosts[idx - 1];
    const older  = allPosts[idx + 1];
    const navEl  = document.getElementById('post-nav');
    if (navEl && (newer || older)) navEl.innerHTML = buildPostNav(newer, older);

    // Share button
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.style.display = '';
      shareBtn.addEventListener('click', async () => {
        const url   = location.href;
        const title = post.title;
        if (navigator.share) {
          try { await navigator.share({ title, url }); } catch { /* user cancelled */ }
        } else {
          await navigator.clipboard.writeText(url);
          const orig = shareBtn.textContent;
          shareBtn.textContent = 'Link copied!';
          setTimeout(() => { shareBtn.innerHTML = 'Share <span class="arr">↗</span>'; }, 2000);
        }
      });
    }

  } catch (err) {
    console.error('Blog post load error:', err);
    showPostError('Could not load this post.');
  }
}

function buildPostNav(newer, older) {
  const link = (post, cls, dir) => post ? `
    <a href="past-talk.html?id=${encodeURIComponent(post.slug)}" class="post-nav-link ${cls}">
      <span class="post-nav-dir">${dir}</span>
      <span class="post-nav-title">${escapeHtml(post.title)}</span>
    </a>` : '<div></div>';
  return `<nav class="post-nav" aria-label="Talk navigation">
    ${link(newer, 'post-nav-newer', '← Newer')}
    ${link(older, 'post-nav-older', 'Older →')}
  </nav>`;
}

function showPostError(message) {
  const content = document.getElementById('blog-post-content');
  if (content) {
    const p = document.createElement('p');
    p.className = 'blog-error';
    p.textContent = message;
    content.appendChild(p);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str) { return escapeHtml(str); }
