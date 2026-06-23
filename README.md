# Data Science in Education

The website for the **Data Science in Education** meetup — a monthly meetup at
the intersection of data and education. Mostly online, occasionally in London.

This is a **pure static site**: plain HTML/CSS/JS with no build step. Every
page is served as-is. The event data (`data/events.json`), social/OG images
(`images/og/`), speaker photos (`images/speakers/`), and `sitemap.xml` are
**generated upstream** and committed here as plain files — see
[Updating content](#updating-content).

## Pages

| URL                 | What                                                    |
| ------------------- | ------------------------------------------------------- |
| `/`                 | Home — partners, upcoming/past previews                 |
| `/upcoming.html`    | Upcoming talks (from `data/events.json`)                |
| `/past.html`        | Past talks listing (from `data/events.json`)            |
| `/past-talk.html`   | Single past-talk page — video + write-up (`?id=<slug>`) |
| `/about.html`       | About + organisers                                      |

## Project layout

```
.
├── index.html
├── upcoming.html        # populated by js/upcoming-loader.js
├── past.html            # populated by js/past-loader.js
├── past-talk.html       # populated by js/past-loader.js (?id=<slug>)
├── about.html
├── 404.html
├── css/styles.css
├── js/
│   ├── main.js              # nav + interactions
│   ├── home-loader.js       # home-page upcoming/past previews
│   ├── upcoming-loader.js   # renders upcoming list from data/events.json
│   └── past-loader.js       # renders past-talks listing + single-talk pages
├── data/events.json     # all events (generated upstream, committed here)
├── images/
│   ├── logos/               # DSE-badge.svg, DSE-logo-*.svg
│   ├── organisers/          # organiser photos
│   ├── speakers/            # speaker photos (generated upstream)
│   └── og/                  # 1200x630 social preview cards (generated upstream)
├── vercel.json              # security headers + redirects from old URLs
├── sitemap.xml              # generated upstream
├── robots.txt
└── site.webmanifest         # PWA manifest (icons, theme color)
```

## Local preview

No install, no dependencies — just serve the folder:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(Any static file server works.)

## Updating content

Event data and generated images are **not** edited here by hand. Notion is the
source of truth, and the [`dsie-ops`](https://github.com/data-science-in-education/dsie-ops)
repo (private) regenerates the artifacts and commits them into this repo:

1. Add/edit the talk in the Notion Events database.
2. In a local `dsie-ops` checkout, run `npm run publish` (review the diff),
   then `npm run publish -- --push` to commit + push here.
3. Vercel auto-deploys on push.

That refresh updates `data/events.json`, `images/og/`, `images/speakers/`, and
`sitemap.xml`. Everything else on the site is hand-written HTML you edit here
directly.

## Deploying

The site is static files plus `vercel.json`, so any static host works. On
Vercel it's imported with **no build command** (Framework Preset "Other",
Output Directory = repo root) — Vercel just serves the files and auto-deploys
every push: `main` to production, every branch to a preview URL.

## Customising

- **Colours & typography**: `css/styles.css` — see the `:root` block at the top.
- **Page copy**: each HTML file is hand-written, no templating engine. Keep the
  nav + footer in sync across all pages (they're duplicated intentionally — no
  build step).
- **OG image / data generation**: lives in `dsie-ops`, not here.

## License

MIT. Use whatever's helpful.
