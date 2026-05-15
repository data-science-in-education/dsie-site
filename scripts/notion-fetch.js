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
        blogContent: props['Blog Content'] ? getRichTextContent(props['Blog Content']) : '',
        blogPublished: props['Blog Published'] ? getPropertyValue(props['Blog Published']) : false
      };
    });

    // Separate upcoming and past events
    const now = new Date();
    const upcomingEvents = events.filter(e => new Date(e.date) >= now);
    const pastEvents = events.filter(e => new Date(e.date) < now);

    const data = {
      upcoming: upcomingEvents,
      past: pastEvents,
      lastUpdated: new Date().toISOString()
    };

    // Save to file
    const filePath = path.join(__dirname, '../data/events.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    console.log(`✓ Fetched ${events.length} events (${upcomingEvents.length} upcoming, ${pastEvents.length} past)`);
    return data;
  } catch (error) {
    console.error('Error fetching events:', error.message);
    throw error;
  }
}

/**
 * Generate videos data from past events with YouTube URLs
 */
function generateVideosFromEvents(events) {
  console.log('Generating videos from past events...');

  // Filter past events that have YouTube URLs
  const videos = events.past
    .filter(event => event.youtubeUrl)
    .map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      youtubeUrl: event.youtubeUrl,
      youtubeId: event.youtubeId,
      eventDate: event.date,
      duration: '', // Can be manually added to Notion if needed
      category: 'event-recording' // All videos from events are recordings
    }));

  const data = {
    videos: videos,
    lastUpdated: new Date().toISOString()
  };

  // Save to file
  const filePath = path.join(__dirname, '../data/videos.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`✓ Generated ${videos.length} videos from past events`);
  return data;
}

/**
 * Generate blog posts data from past events with Blog Published = true
 */
function generateBlogPosts(events) {
  console.log('Generating blog posts from events...');

  const allEvents = [...events.upcoming, ...events.past];
  const posts = allEvents
    .filter(event => event.blogPublished)
    .map(event => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      speaker: event.speaker,
      date: event.date,
      day: event.day,
      month: event.month,
      year: event.year,
      description: event.description,
      blogContent: event.blogContent,
      youtubeId: event.youtubeId,
      youtubeUrl: event.youtubeUrl,
      highlights: event.highlights
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const data = {
    posts: posts,
    lastUpdated: new Date().toISOString()
  };

  const filePath = path.join(__dirname, '../data/blogs.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`✓ Generated ${posts.length} blog posts`);
  return data;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Validate environment variables
    if (!process.env.NOTION_API_KEY) {
      throw new Error('NOTION_API_KEY is not set in .env file');
    }
    if (!process.env.NOTION_EVENTS_DB_ID) {
      throw new Error('NOTION_EVENTS_DB_ID is not set in .env file');
    }

    console.log('\n=== Fetching data from Notion ===\n');

    const eventsData = await fetchEvents();
    generateVideosFromEvents(eventsData);
    generateBlogPosts(eventsData);

    console.log('\n✓ All data fetched successfully!\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { fetchEvents, generateVideosFromEvents, generateBlogPosts };
