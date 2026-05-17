# Data Science in Education

The website for the **Data Science in Education** meetup — a monthly meetup at
the intersection of data and education. Mostly online, occasionally in London.

Static HTML/CSS/JS, with a small Node build step that pulls upcoming &
past-talk data from Notion and renders OG images.

## Pages

| URL                 | What                                                    |
| ------------------- | ------------------------------------------------------- |
| `/`                 | Home — partners, upcoming/past previews                 |
| `/upcoming.html`    | Upcoming talks (from `data/events.json`)                |
| `/past.html`        | Past talks listing (from `data/talks.json`)             |
| `/past-talk.html`   | Single past-talk page — video + write-up                |
| `/about.html`       | About + organisers                                      |

## Project layout

```
.
├── index.html
├── upcoming.html        # populated by js/upcoming-loader.js
├── past.html            # populated by js/past-loader.js
├── past-talk.html       # populated by js/past-loader.js (?id=<slug>)
├── about.html
├── css/styles.css
├── js/
│   ├── main.js              # nav + interactions
│   ├── upcoming-loader.js   # renders upcoming list from data/events.json
│   └── past-loader.js       # renders past-talks listing + single-talk pages
├── scripts/
│   ├── notion-fetch.js      # pulls events from Notion -> data/*.json
│   ├── meetup-sync.js       # syncs Meetup.com events into Notion (Pro only)
│   └── og-image.js          # renders 1200x630 PNGs into images/og/
├── data/                    # generated; gitignored
│   ├── events.json          # upcoming + past
│   └── talks.json           # past-talk pages (Notion page bodies)
├── images/
│   ├── logos/               # DSE-badge.svg, DSE-logo-*.svg
│   ├── organisers/          # simon.png, digory.jpg
│   └── og/                  # generated 1200x630 social preview cards
├── vercel.json              # security headers + redirects from old URLs
├── sitemap.xml
├── robots.txt
└── site.webmanifest         # PWA manifest (icons, theme color)
```

## Quick start

```bash
git clone https://github.com/data-science-in-education/dsie-site.git
cd dsie-site
npm install

# Set up data sources:
#   - Meetup (upcoming events) → MEETUP_SETUP.md
#   - Notion (past-talk write-ups) → NOTION_SETUP.md
cp .env.example .env
# ... edit .env ...

# Pull data, render OG images, and serve
npm run dev          # = build-data + serve at http://localhost:8000
```

## Available scripts

| Script                  | What it does                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run fetch-meetup`  | Pull upcoming events from Meetup → `data/events.json` (the upcoming page)   |
| `npm run fetch-notion`  | Pull past-talk write-ups from Notion → `data/talks.json` (the past page)    |
| `npm run sync-meetup`   | One-way sync Meetup events into Notion (for adding speaker / write-up)      |
| `npm run og`            | Regenerate `images/og/*.png` (site default + per-page + per-talk)           |
| `npm run build-data`    | `fetch-meetup` + `fetch-notion` + `og` in one step                          |
| `npm run serve`         | Static file server on :8000                                                 |
| `npm run dev`           | `build-data` + `serve`                                                      |

### Data pipeline

```
Meetup ─ fetch-meetup ─▶ data/events.json  ─▶ upcoming.html
   │
   └─── sync-meetup ──▶ Notion (enrich: Speaker, Blog content, YouTube)
                          │
                          └─ fetch-notion ─▶ data/talks.json ─▶ past.html / past-talk.html
```

Meetup is the source of truth for upcoming events. Notion is the source
of truth for past-talk pages (the recording, the write-up, the speaker
bio). Both fetch scripts soft-exit if their credentials aren't set, so
Vercel builds without secrets still produce a usable empty-state site.

## Deploying

The site is a pile of static files plus `vercel.json`, so any static host
works. Vercel is the easiest path:

1. On vercel.com, **Import** `data-science-in-education/dsie-site`.
2. Build command: `npm run build-data` (or leave blank if you commit the
   `data/` files yourself).
3. Output directory: `./` (project root).
4. Add `NOTION_API_KEY` and `NOTION_EVENTS_DB_ID` as project env vars if
   you want the build to fetch fresh Notion data.

Vercel auto-deploys every push: `main` to your production domain, every
branch to a preview URL.

## Adding a talk

1. In Notion, add a row to the Events database — see
   [NOTION_SETUP.md](./NOTION_SETUP.md) for the schema.
2. For past talks: tick `Blog Published`, paste YouTube URL into
   `YouTube URL`, write up the talk in the Notion page body.
3. Run `npm run build-data` (or push and let Vercel run it). The talk
   shows up on `/past.html` and gets its own page at
   `/past-talk.html?id=<slug>` plus an OG image at
   `/images/og/talk-<slug>.png`.

## Customising

- **Colours & typography**: `css/styles.css` — see the `:root` block at
  the top for the palette.
- **OG image style**: edit the SVG template in `scripts/og-image.js` and
  re-run `npm run og`.
- **Page copy**: each HTML file is hand-written, no templating engine.
  Keep nav + footer changes in sync across all 5 pages.

## License

MIT. Use whatever's helpful.
