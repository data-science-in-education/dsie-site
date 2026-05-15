document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('blog-grid')) {
    loadBlogListing();
  } else if (document.getElementById('blog-post-content')) {
    loadBlogPost();
  }
});

async function fetchBlogs() {
  const res = await fetch('data/blogs.json');
  if (!res.ok) throw new Error('Could not load blog data');
  return res.json();
}

async function loadBlogListing() {
  const grid = document.getElementById('blog-grid');
  const emptyState = document.getElementById('blog-empty');

  try {
    const data = await fetchBlogs();
    const posts = data.posts || [];

    if (posts.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    grid.innerHTML = posts.map(post => `
      <article class="blog-card fade-in">
        <div class="blog-card-body">
          <div class="blog-meta">
            <span class="blog-date">${post.day} ${post.month} ${post.year}</span>
            ${post.speaker ? `<span class="blog-speaker">${escapeHtml(post.speaker)}</span>` : ''}
          </div>
          <h3>${escapeHtml(post.title)}</h3>
          ${post.description ? `<p>${escapeHtml(post.description)}</p>` : ''}
        </div>
        <div class="blog-card-footer">
          <a href="blog-post.html?id=${encodeURIComponent(post.slug)}" class="btn btn-outline blog-read-more">Read post &rarr;</a>
        </div>
      </article>
    `).join('');

    // Trigger fade-in animations
    requestAnimationFrame(() => {
      document.querySelectorAll('.blog-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 80);
      });
    });
  } catch (err) {
    console.error('Blog load error:', err);
    grid.innerHTML = '<p class="blog-error">Could not load blog posts. Please try again later.</p>';
  }
}

async function loadBlogPost() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('id');

  if (!slug) {
    showPostError('No post specified.');
    return;
  }

  try {
    const data = await fetchBlogs();
    const post = (data.posts || []).find(p => p.slug === slug);

    if (!post) {
      showPostError('Post not found.');
      return;
    }

    // Update page title
    document.title = `${post.title} — Data Science in Education`;

    // Fill header fields
    const titleEl = document.getElementById('post-title');
    const metaEl = document.getElementById('post-meta');
    if (titleEl) titleEl.textContent = post.title;
    if (metaEl) {
      const parts = [`${post.day} ${post.month} ${post.year}`];
      if (post.speaker) parts.push(escapeHtml(post.speaker));
      metaEl.innerHTML = parts.join(' &bull; ');
    }

    const content = document.getElementById('blog-post-content');

    // YouTube embed
    let videoHtml = '';
    if (post.youtubeId) {
      videoHtml = `
        <div class="video-embed-wrapper">
          <div class="video-embed">
            <iframe
              src="https://www.youtube.com/embed/${escapeHtml(post.youtubeId)}"
              title="${escapeHtml(post.title)}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        </div>`;
    }

    // Blog content paragraphs
    let blogHtml = '';
    if (post.blogContent) {
      blogHtml = `<div class="blog-content">${post.blogContent
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${escapeHtml(p.trim())}</p>`)
        .join('')}</div>`;
    }

    // Highlights
    let highlightsHtml = '';
    if (post.highlights && post.highlights.length > 0) {
      highlightsHtml = `
        <div class="event-highlights">
          <h4>Key Takeaways</h4>
          <ul>${post.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
        </div>`;
    }

    content.innerHTML = videoHtml + blogHtml + highlightsHtml;
  } catch (err) {
    console.error('Blog post load error:', err);
    showPostError('Could not load this post.');
  }
}

function showPostError(message) {
  const content = document.getElementById('blog-post-content');
  if (content) content.innerHTML = `<p class="blog-error">${escapeHtml(message)}</p>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
