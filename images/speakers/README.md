# Speaker headshots

Drop a square or portrait image here named after the speaker's slugified
name — lowercase, spaces replaced with dashes, punctuation stripped.

Examples:
- "Danielle R. Thomas" → `danielle-r-thomas.png`
- "Lena Park"          → `lena-park.png`
- "Pat O'Reilly"       → `pat-oreilly.png`

Accepted extensions: `.png`, `.jpg`, `.jpeg`, `.webp`. PNG with a
transparent or filled background is fine — sharp crops to square and
applies a circular mask via the SVG `<clipPath>` in `scripts/og-image.js`.

These files drive the headshot on per-talk video cards (the 1920×1080
title still used in YouTube videos and as the thumbnail). Without one
the card lays out wider; the rest of the layout still works.

Headshots are *not* shown anywhere on the website itself yet.
