document.addEventListener('DOMContentLoaded', function () {

  // ---- Mobile nav toggle ----
  const hamburger = document.querySelector('.dse-nav-hamburger');
  const navLinks  = document.querySelector('.dse-nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      const open = navLinks.classList.toggle('open');
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
    });
    // Close when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- Newsletter forms ----
  document.querySelectorAll('.dse-newsletter-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const emailInput = form.querySelector('.dse-input');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email || !email.includes('@')) return;

      const onBlue = form.classList.contains('on-blue');
      const div = document.createElement('div');
      div.className = 'dse-success' + (onBlue ? ' on-blue' : '');

      const check = document.createTextNode('✓ You’re in. Check ');
      const bold  = document.createElement('b');
      bold.textContent = email;
      const rest  = document.createTextNode(' for confirmation.');
      div.appendChild(check);
      div.appendChild(bold);
      div.appendChild(rest);

      form.replaceWith(div);
    });
  });

  // ---- Events filter pills ----
  const filterPills = document.querySelectorAll('.events-filter-pill');
  const eventCards  = document.querySelectorAll('.events-grid [data-tags]');
  const countEl     = document.getElementById('events-count');
  const emptyEl     = document.getElementById('events-empty');
  const totalEl     = document.getElementById('events-total');

  if (totalEl) totalEl.textContent = eventCards.length;

  filterPills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filter = pill.dataset.filter;
      let visible = 0;

      eventCards.forEach(function (card) {
        const tags = card.dataset.tags ? card.dataset.tags.split(',') : [];
        const show = filter === 'all' || tags.includes(filter);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      if (countEl) countEl.textContent = visible;
      if (emptyEl)  emptyEl.style.display = visible === 0 ? '' : 'none';
    });
  });

  // ---- Blog tag filter pills ----
  // Query cards at click time (not DOMContentLoaded) since they're loaded async
  const blogTagPills = document.querySelectorAll('.blog-tag-pill');

  blogTagPills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      blogTagPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const tag = pill.dataset.tag;
      document.querySelectorAll('#blog-grid .dse-blog-card').forEach(function (card) {
        const cat = card.dataset.category || '';
        card.style.display = (tag === 'All' || cat === tag) ? '' : 'none';
      });
    });
  });

});
