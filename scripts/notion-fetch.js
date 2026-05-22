/**
 * Notion Data Fetcher — primary data pipeline
 *
 * Notion is the source of truth for all events (past and upcoming).
 * Run this to regenerate data/events.json:
 *   npm run fetch-notion
 *
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * Format a Notion page property value
 */
function getPropertyValue(property) {
  switch (property.type) {
    case 'title':
      return property.title[0]?.plain_text || '';
    case 'rich_text':
      return property.rich_text[0]?.plain_text || '';
    case 'select':
      return property.select?.name || '';
    case 'multi_select':
      return property.multi_select.map(s => s.name);
    case 'date':
      return property.date?.start || '';
    case 'number':
      return property.number || 0;
    case 'checkbox':
      return property.checkbox;
    case 'url':
      return property.url || '';
    default:
      return '';
  }
}

/**
 * Get full rich text content, joining all segments
 */
function getRichTextContent(property) {
  if (!property || property.type !== 'rich_text') return '';
  return property.rich_text.map(t => t.plain_text).join('');
}

/**
 * Convert a Notion rich text array to an HTML string, preserving inline formatting
 */
function richTextToHtml(richTextArr) {
  return (richTextArr || []).map(t => {
    let text = t.plain_text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (t.href) text = `<a href="${t.href}" target="_blank" rel="noopener">${text}</a>`;
    if (t.annotations) {
      if (t.annotations.code)          text = `<code>${text}</code>`;
      if (t.annotations.bold)          text = `<strong>${text}</strong>`;
      if (t.annotations.italic)        text = `<em>${text}</em>`;
      if (t.annotations.strikethrough) text = `<s>${text}</s>`;
    }
    return text;
  }).join('');
}

/**
 * Fetch all blocks from a Notion page and convert to an HTML string
 */
async function fetchPageContentHtml(pageId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const html = [];
  let listType = null; // track open list

  for (const block of blocks) {
    const type = block.type;
    const rt = block[type]?.rich_text;
    const text = rt ? richTextToHtml(rt) : '';

    // Close any open list if this block isn't a list item
    if (listType && type !== 'bulleted_list_item' && type !== 'numbered_list_item') {
      html.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }

    switch (type) {
      case 'paragraph':
        html.push(text ? `<p>${text}</p>` : '<br>');
        break;
      case 'heading_1':
        html.push(`<h2>${text}</h2>`);
        break;
      case 'heading_2':
        html.push(`<h3>${text}</h3>`);
        break;
      case 'heading_3':
        html.push(`<h4>${text}</h4>`);
        break;
      case 'bulleted_list_item':
        if (listType !== 'ul') { html.push('<ul>'); listType = 'ul'; }
        html.push(`<li>${text}</li>`);
        break;
      case 'numbered_list_item':
        if (listType !== 'ol') { html.push('<ol>'); listType = 'ol'; }
        html.push(`<li>${text}</li>`);
        break;
      case 'quote':
        html.push(`<blockquote>${text}</blockquote>`);
        break;
      case 'code':
        html.push(`<pre><code>${text}</code></pre>`);
        break;
      case 'divider':
        html.push('<hr>');
        break;
      default:
        if (text) html.push(`<p>${text}</p>`);
    }
  }

  // Close any trailing list
  if (listType) html.push(listType === 'ul' ? '</ul>' : '</ol>');

  return html.join('\n');
}

/**
 * Convert a string to a URL-friendly slug
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Download a Notion-hosted speaker photo and save under images/speakers/.
// Returns the local path (e.g. /images/speakers/jane-smith.jpg) so it never
// goes stale — Notion S3 URLs are signed and expire after roughly one hour.
async function downloadSpeakerPhoto(url, speakerName) {
  if (!speakerName) return '';
  const slug = slugify(speakerName);
  const speakersDir = path.join(__dirname, '../images/speakers');
  fs.mkdirSync(speakersDir, { recursive: true });

  const pathname = new URL(url).pathname;
  const rawExt   = pathname.split('.').pop().toLowerCase();
  const ext      = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(rawExt)
    ? (rawExt === 'jpeg' ? 'jpg' : rawExt)
    : 'jpg';
  const filename  = `${slug}.${ext}`;
  const localPath = path.join(speakersDir, filename);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
    console.log(`  Saved images/speakers/${filename}`);
  } catch (err) {
    console.warn(`  Could not download speaker photo for ${speakerName}: ${err.message}`);
    return '';
  }
  return `/images/speakers/${filename}`;
}

// Resolve speaker photo: check Notion "Speaker Photo" (Files & media) first,
// then fall back to the plain "Speaker Photo URL" text field.
// All photos are downloaded to images/speakers/ at build time so no runtime
// dependency on external CDNs or expiring Notion S3 URLs.
async function getSpeakerPhotoUrl(props, speakerName) {
  const filesProp = props['Speaker Photo'];
  if (filesProp?.type === 'files' && filesProp.files?.length > 0) {
    const file = filesProp.files[0];
    const url = file.type === 'file' ? file.file.url : file.external?.url;
    if (url) return downloadSpeakerPhoto(url, speakerName);
  }
  const urlField = getPropertyValue(props['Speaker Photo URL']);
  if (urlField) return downloadSpeakerPhoto(urlField, speakerName);
  return '';
}

/**
 * Fetch events from Notion
 */
async function fetchEvents() {
  console.log('Fetching events from Notion...');

  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_EVENTS_DB_ID,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true
        }
      },
      sorts: [
        {
          property: 'Date',
          direction: 'ascending'
        }
      ]
    });

    const events = await Promise.all(response.results.map(async page => {
      const props = page.properties;
      const eventDate = new Date(getPropertyValue(props.Date));

      // Extract YouTube video ID from URL
      const youtubeUrl = getPropertyValue(props['YouTube URL']);
      let youtubeId = '';
      if (youtubeUrl) {
        const match = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        youtubeId = match ? match[1] : '';
      }

      const title       = getPropertyValue(props.Title);
      const speakerName = props.Speaker ? getRichTextContent(props.Speaker) : '';
      return {
        id: page.id,
        slug: slugify(title),
        title: title,
        speaker:          speakerName,
        speakerBio:       props['Speaker Bio'] ? getRichTextContent(props['Speaker Bio']) : '',
        speakerPhotoUrl:  await getSpeakerPhotoUrl(props, speakerName),
        description:      getPropertyValue(props.Description),
        date:             getPropertyValue(props.Date),
        day:              eventDate.getDate().toString().padStart(2, '0'),
        month:            eventDate.toLocaleDateString('en-US', { month: 'short' }),
        year:             eventDate.getFullYear().toString(),
        registrationUrl:  getPropertyValue(props['Registration URL']),
        youtubeUrl:       youtubeUrl,
        youtubeId:        youtubeId,
        meetupId:         getPropertyValue(props['Meetup ID'])
      };
    }));

    const now = new Date();
    const upcomingEvents = events.filter(e => new Date(e.date) >= now);
    const pastEvents = events.filter(e => new Date(e.date) < now);

    const data = {
      upcoming: upcomingEvents,
      past: pastEvents,
      lastUpdated: new Date().toISOString()
    };

    console.log(`✓ Fetched ${events.length} events from Notion (${upcomingEvents.length} upcoming, ${pastEvents.length} past)`);
    return data;
  } catch (error) {
    console.error('Error fetching events:', error.message);
    throw error;
  }
}

/**
 * Fetch Notion page body for each past event and attach as contentHtml.
 * All past events appear on the site; content is shown when available.
 */
async function enrichPastEvents(pastEvents) {
  return Promise.all(pastEvents.map(async event => {
    const contentHtml = await fetchPageContentHtml(event.id);
    return { ...event, contentHtml };
  }));
}

/**
 * Rewrite sitemap.xml with static pages + one URL per published past talk.
 */
function writeSitemap(pastEvents) {
  const BASE = 'https://datascienceineducation.events';
  const statics = [
    { loc: `${BASE}/`,              changefreq: 'weekly',  priority: '1.0' },
    { loc: `${BASE}/upcoming`,      changefreq: 'weekly',  priority: '0.9' },
    { loc: `${BASE}/past`,          changefreq: 'weekly',  priority: '0.9' },
    { loc: `${BASE}/about`,         changefreq: 'monthly', priority: '0.6' },
  ];
  const talks = pastEvents.map(e => ({
    loc:        `${BASE}/past-talk?id=${encodeURIComponent(e.slug)}`,
    lastmod:    e.date ? e.date.split('T')[0] : undefined,
    changefreq: 'monthly',
    priority:   '0.7',
  }));
  const all = [...statics, ...talks];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  const sitemapPath = path.join(__dirname, '../sitemap.xml');
  fs.writeFileSync(sitemapPath, xml);
  console.log(`✓ Wrote ${all.length} URL(s) to sitemap.xml`);
}

/**
 * Main execution — Notion is the sole source for all event data.
 * Writes a single data/events.json with upcoming + past (past includes contentHtml).
 * Soft-exits if credentials are missing so a Vercel build without secrets still works.
 */
async function main() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_EVENTS_DB_ID) {
    console.warn('notion-fetch: NOTION_API_KEY or NOTION_EVENTS_DB_ID not set; skipping.');
    return;
  }

  try {
    console.log('\n=== Fetching data from Notion ===\n');
    const eventsData = await fetchEvents();

    console.log('Fetching past event content from Notion pages...');
    const enrichedPast = await enrichPastEvents(eventsData.past);

    const filePath = path.join(__dirname, '../data/events.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const allEvents = [...eventsData.upcoming, ...enrichedPast]
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    fs.writeFileSync(filePath, JSON.stringify({
      events:      allEvents,
      lastUpdated: new Date().toISOString(),
      source:      'notion',
    }, null, 2));

    console.log(`✓ Wrote ${allEvents.length} event(s) to data/events.json`);
    writeSitemap(enrichedPast);
    console.log('\n✓ Notion data updated\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchEvents, enrichPastEvents };
