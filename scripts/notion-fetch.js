/**
 * Notion Data Fetcher
 *
 * Fetches events from Notion database and saves them as JSON files.
 * Also generates videos.json from past events that have YouTube URLs.
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

    const events = response.results.map(page => {
      const props = page.properties;
      const eventDate = new Date(getPropertyValue(props.Date));

      // Extract YouTube video ID from URL
      const youtubeUrl = getPropertyValue(props['YouTube URL']);
      let youtubeId = '';
      if (youtubeUrl) {
        const match = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        youtubeId = match ? match[1] : '';
      }

      const title = getPropertyValue(props.Title);
      return {
        id: page.id,
        slug: slugify(title),
        title: title,
        speaker: props.Speaker ? getRichTextContent(props.Speaker) : '',
        description: getPropertyValue(props.Description),
        date: getPropertyValue(props.Date),
        day: eventDate.getDate().toString().padStart(2, '0'),
        month: eventDate.toLocaleDateString('en-US', { month: 'short' }),
        year: eventDate.getFullYear().toString(),
        location: getPropertyValue(props.Location),
        time: getPropertyValue(props.Time),
        highlights: getPropertyValue(props.Highlights)
          .split('\n')
          .filter(h => h.trim().length > 0)
          .map(h => h.replace(/^[-•*]\s*/, '').trim()),
        registrationLink: getPropertyValue(props['Registration Link']),
        youtubeUrl: youtubeUrl,
        youtubeId: youtubeId,
        status: getPropertyValue(props.Status),
        meetupId: getPropertyValue(props['Meetup ID']),
        blogPublished: props['Blog Published'] ? getPropertyValue(props['Blog Published']) : false
      };
    });

    // Separate upcoming and past events (Meetup is the source of truth for
    // data/events.json; this in-memory split is only used to filter what we
    // pass to generateTalkPages).
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
 * Generate per-talk page data from events with Blog Published = true.
 * Fetches the Notion page body for each, converts blocks to HTML,
 * and writes everything to data/talks.json.
 */
async function generateTalkPages(events) {
  console.log('Generating past-talk pages from events...');

  const allEvents = [...events.upcoming, ...events.past];
  const publishedEvents = allEvents
    .filter(event => event.blogPublished)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const posts = await Promise.all(publishedEvents.map(async event => {
    const contentHtml = await fetchPageContentHtml(event.id);
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      speaker: event.speaker,
      date: event.date,
      day: event.day,
      month: event.month,
      year: event.year,
      description: event.description,
      contentHtml: contentHtml,
      youtubeId: event.youtubeId,
      youtubeUrl: event.youtubeUrl,
      highlights: event.highlights
    };
  }));

  const data = {
    posts: posts,
    lastUpdated: new Date().toISOString()
  };

  const filePath = path.join(__dirname, '../data/talks.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`✓ Generated ${posts.length} past-talk pages`);
  return data;
}

/**
 * Main execution
 *
 * Notion is the source for past-talk write-ups (data/talks.json). Meetup
 * is the source for upcoming events (data/events.json). If Notion creds
 * aren't set we soft-exit so a Vercel build without secrets still works.
 */
async function main() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_EVENTS_DB_ID) {
    console.warn('notion-fetch: NOTION_API_KEY or NOTION_EVENTS_DB_ID not set; skipping.');
    return;
  }

  try {
    console.log('\n=== Fetching data from Notion ===\n');
    const eventsData = await fetchEvents();
    await generateTalkPages(eventsData);
    console.log('\n✓ Notion talks data updated\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchEvents, generateTalkPages };
