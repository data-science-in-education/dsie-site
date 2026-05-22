# dsie-site — next steps

Items are roughly ordered by impact. Pick them off individually.

---

## High priority

### ~~1. Home page: load upcoming events dynamically~~ ✓ done
`index.html` has a hardcoded empty-state for the upcoming section.
`upcoming-loader.js` already does the right thing on `upcoming.html`, but
`index.html` doesn't include it. When there ARE upcoming events in
`data/events.json`, the home page will still show "Confirmed dates land on
Meetup first" to every visitor.
- Add `<script src="js/upcoming-loader.js"></script>` to `index.html`.
- Or extract the home-page variant (show 1–2 cards rather than the full row list)
  into a small inline script / separate loader.

### ~~2. Home page: load recent past talks dynamically~~ ✓ done
Same issue — the "Recordings and write-ups" section is a hardcoded empty state.
With 30+ talks in events.json this looks broken.
- Add `<script src="js/past-loader.js"></script>` to `index.html` and add a
  `#blog-grid`/`#blog-featured` hook, limited to the 3 most recent talks.
- Or extract a trimmed version of `loadBlogListing()` for home-page use.

### ~~3. Add a custom 404 page~~ ✓ done
No `404.html` exists. Vercel serves a generic page.
- Create `404.html` with the standard DSE nav, hero, and a friendly "page not
  found" message + link back to home.
- Add a `"handle": [{"src": "/(.*)", "status": 404, "dest": "/404.html"}]`
  catch-all in `vercel.json` (check the existing redirects first).

### ~~4. Fix canonical URL on past-talk.html~~ ✓ done
The `<link rel="canonical">` is hardcoded as `.../past-talk.html` — no query
string. Every talk page shares the same canonical, which is bad for SEO.
`past-loader.js` already updates og:image; extend it to also update:
```js
document.querySelector('link[rel="canonical"]')
  .setAttribute('href', location.href);
document.querySelector('meta[property="og:url"]')
  .setAttribute('content', location.href);
```

---

## Medium priority

### ~~5. Sitemap~~ ✓ done: add per-talk URLs
`sitemap.xml` only lists 4 static pages. Google can't index individual talk
pages. Add a step to `scripts/notion-fetch.js` (or a separate
`scripts/sitemap.js`) that rewrites `sitemap.xml` with one `<url>` per
published talk slug (`/past-talk.html?id=<slug>`).

### ~~6. Loading skeleton on past.html (and home)~~ ✓ done
Between page load and JS populating the grid, the page shows an empty section.
Add a simple CSS skeleton (3 placeholder cards) that's hidden once data loads.

### ~~7. Search / text filter on past.html~~ ✓ done
With 30+ talks, a simple `<input type="search">` that filters `.dse-blog-card`
by title/speaker text would be more useful than year pills alone.

### ~~8. Structured data (JSON-LD) on past-talk.html~~ ✓ done
Add a `<script type="application/ld+json">` block populated by `past-loader.js`
with `@type: "Event"` or `"VideoObject"` schema. Helps Google show rich
results.

### ~~9. next/prev navigation on past-talk.html~~ ✓ done
After reading a talk, show links to the chronologically adjacent ones.
`past-loader.js` already has the full sorted list; just pick `index ± 1`.

---

## Nice to have

### ~~10. Stats bar on home page~~ ✓ done
A small row showing community scale — "40+ talks · 5 years · XX members" —
between the hero and the upcoming section. Numbers can be derived from
`data/events.json` at render time.

### ~~11. Refresh the "Speakers come from" bar~~ ✓ done (added inline comment)
The organisations list on `index.html:104` is hardcoded and will go stale.
Either derive it from `data/events.json` (extract org from speaker bio?) or at
minimum add a comment flagging it as manual.

### ~~12. Share button on past-talk.html~~ ✓ done
A single "Copy link" or `navigator.share()` button below the talk title to
make it easy to share individual talks.

### ~~13. DRY note for nav/footer~~ ✓ done
Nav and footer HTML are duplicated across all 5 pages (intentional — no build
step). Add a short HTML comment on each page: `<!-- keep nav in sync across all
pages — see README#customising -->` so future editors know what to do.

---

## Data pipeline

### 14. Automate Vercel rebuild on new Notion data
Currently a new talk only appears after a manual `git push` (or scheduled
deploy). Consider a Vercel Deploy Hook triggered from Notion automations or a
nightly cron so the site stays fresh without manual intervention.
