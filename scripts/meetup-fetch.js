/**
 * Meetup fetch
 *
 * Pulls upcoming events directly from the Meetup GraphQL API and writes
 * data/events.json in the shape that js/upcoming-loader.js expects.
 *
 * Speaker / location time conventions:
 *   - The script looks for "Speaker: <name>" in the description and lifts
 *     it into the `speaker` field. If absent, speaker stays empty.
 *   - Online-only events come through as `location: "Online"`.
 *
 * Runs at deploy time (Vercel npm run build-data). When the Meetup creds
 * aren't set, the script logs a warning and exits 0 so a missing-env
 * build doesn't blow up the whole deploy.
 *
 * Required env:
 *   MEETUP_OAUTH_TOKEN
 *   MEETUP_GROUP_URLNAME     (e.g. "data-science-in-education")
 */

require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const fetch    = require('node-fetch');

const ENDPOINT = 'https://api.meetup.com/gql-ext';
const OUTPUT   = path.join(__dirname, '..', 'data', 'events.json');

const QUERY = `
  query ($urlname: String!) {
    groupByUrlname(urlname: $urlname) {
      name
      events(first: 20, status: ACTIVE) {
        edges {
          node {
            id
            title
            description
            dateTime
            duration
            eventUrl
            venue {
              name
              city
              state
            }
            rsvps { totalCount }
          }
        }
      }
    }
  }
`;

function softExit(msg) {
  console.warn(`meetup-fetch: ${msg}`);
  console.warn('meetup-fetch: skipping (set MEETUP_OAUTH_TOKEN / MEETUP_GROUP_URLNAME to enable).');
  process.exit(0);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function extractSpeaker(description) {
  if (!description) return '';
  // Matches "Speaker: Name" or "Speakers: A, B" on its own line.
  const m = description.match(/^\s*Speakers?\s*[:\-—]\s*(.+)$/im);
  return m ? m[1].trim().replace(/[.,;]+$/, '') : '';
}

function formatLocation(venue) {
  if (!venue) return 'Online';
  const name = (venue.name || '').toLowerCase();
  if (!venue.name || name.includes('online') || name.includes('zoom')) return 'Online';
  const parts = [venue.name, venue.city, venue.state].filter(Boolean);
  return parts.join(', ');
}

function formatTime(dateTime) {
  if (!dateTime) return '';
  // "18:30 BST" — short, human, and consistent with what the site already shows.
  return new Date(dateTime).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    timeZoneName: 'short',
  });
}

function transformEvent(node) {
  const date  = new Date(node.dateTime);
  const title = node.title || '';
  return {
    id:               node.id,
    slug:             slugify(title),
    title,
    speaker:          extractSpeaker(node.description),
    description:      (node.description || '').slice(0, 280).trim(),
    date:             node.dateTime,
    day:              String(date.getUTCDate()).padStart(2, '0'),
    month:            date.toLocaleDateString('en-US', { month: 'short' }),
    year:             String(date.getUTCFullYear()),
    location:         formatLocation(node.venue),
    time:             formatTime(node.dateTime),
    registrationLink: node.eventUrl,
    rsvpCount:        node.rsvps && node.rsvps.totalCount || 0,
    meetupId:         node.id,
  };
}

async function main() {
  const token   = process.env.MEETUP_OAUTH_TOKEN;
  const urlname = process.env.MEETUP_GROUP_URLNAME;

  if (!token)   softExit('MEETUP_OAUTH_TOKEN not set');
  if (!urlname) softExit('MEETUP_GROUP_URLNAME not set');

  console.log(`meetup-fetch: pulling upcoming events for "${urlname}"...`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: QUERY, variables: { urlname } }),
  });

  if (!res.ok) {
    throw new Error(`Meetup API ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  }

  const group = body.data && body.data.groupByUrlname;
  if (!group) softExit('group not found (check MEETUP_GROUP_URLNAME)');

  const upcoming = (group.events.edges || []).map(e => transformEvent(e.node));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    upcoming,
    lastUpdated: new Date().toISOString(),
    source: 'meetup',
  }, null, 2));

  console.log(`meetup-fetch: wrote ${upcoming.length} upcoming event(s) to ${path.relative(process.cwd(), OUTPUT)}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('meetup-fetch:', err.message);
    process.exit(1);
  });
}

module.exports = { transformEvent, extractSpeaker, formatLocation };
