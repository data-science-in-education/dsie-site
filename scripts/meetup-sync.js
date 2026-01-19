/**
 * Meetup to Notion Sync
 *
 * Fetches events from Meetup.com via GraphQL API and syncs them to Notion database
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');
const fetch = require('node-fetch');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * Fetch events from Meetup using GraphQL API
 */
async function fetchMeetupEvents() {
  console.log('Fetching events from Meetup.com...');

  const query = `
    query ($urlname: String!) {
      groupByUrlname(urlname: $urlname) {
        name
        upcomingEvents(input: {first: 20}) {
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
                address
                city
                state
                postalCode
              }
              going {
                totalCount
              }
            }
          }
        }
        pastEvents(input: {first: 20}) {
          edges {
            node {
              id
              title
              description
              dateTime
              duration
              eventUrl
              going {
                totalCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.meetup.com/gql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MEETUP_OAUTH_TOKEN}`
      },
      body: JSON.stringify({
        query: query,
        variables: {
          urlname: process.env.MEETUP_GROUP_URLNAME
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Meetup API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const group = data.data.groupByUrlname;
    const upcomingEvents = group.upcomingEvents.edges.map(e => e.node);
    const pastEvents = group.pastEvents.edges.map(e => e.node);

    console.log(`✓ Found ${upcomingEvents.length} upcoming and ${pastEvents.length} past events`);

    return {
      upcoming: upcomingEvents,
      past: pastEvents
    };
  } catch (error) {
    console.error('Error fetching from Meetup:', error.message);
    throw error;
  }
}

/**
 * Check if event already exists in Notion by Meetup ID
 */
async function findNotionEventByMeetupId(meetupId) {
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_EVENTS_DB_ID,
      filter: {
        property: 'Meetup ID',
        rich_text: {
          equals: meetupId
        }
      }
    });

    return response.results.length > 0 ? response.results[0] : null;
  } catch (error) {
    console.error('Error searching Notion:', error.message);
    return null;
  }
}

/**
 * Format location string
 */
function formatLocation(venue) {
  if (!venue) {
    return 'Online';
  }

  if (venue.name && venue.name.toLowerCase().includes('online')) {
    return 'Online';
  }

  return venue.name || `${venue.city}, ${venue.state}`;
}

/**
 * Format time string
 */
function formatTime(dateTime, duration) {
  const start = new Date(dateTime);
  const end = new Date(start.getTime() + (duration || 60) * 60 * 1000);

  const timeOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };

  return `${start.toLocaleTimeString('en-US', timeOptions)} - ${end.toLocaleTimeString('en-US', timeOptions)}`;
}

/**
 * Extract highlights from description (looks for bullet points or numbered lists)
 */
function extractHighlights(description) {
  if (!description) return '';

  // Look for bullet points or numbered items
  const lines = description.split('\n');
  const highlights = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines starting with -, *, •, or numbers
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      highlights.push(trimmed.replace(/^[-*•\d.]\s+/, ''));
    }
  }

  // If we found highlights, return them joined
  if (highlights.length > 0) {
    return highlights.slice(0, 5).join('\n'); // Max 5 highlights
  }

  // Otherwise, return empty (user can fill in manually)
  return '';
}

/**
 * Create or update event in Notion
 */
async function syncEventToNotion(meetupEvent, status) {
  const meetupId = meetupEvent.id;
  const existingPage = await findNotionEventByMeetupId(meetupId);

  const location = formatLocation(meetupEvent.venue);
  const timeString = formatTime(meetupEvent.dateTime, meetupEvent.duration);
  const highlights = extractHighlights(meetupEvent.description);

  const properties = {
    'Title': {
      title: [{ text: { content: meetupEvent.title } }]
    },
    'Description': {
      rich_text: [{ text: { content: (meetupEvent.description || '').substring(0, 2000) } }]
    },
    'Date': {
      date: { start: meetupEvent.dateTime }
    },
    'Duration': {
      number: meetupEvent.duration || 60
    },
    'Location': {
      rich_text: [{ text: { content: location } }]
    },
    'Time': {
      rich_text: [{ text: { content: timeString } }]
    },
    'Highlights': {
      rich_text: [{ text: { content: highlights } }]
    },
    'Registration Link': {
      url: meetupEvent.eventUrl
    },
    'Status': {
      select: { name: status }
    },
    'Meetup ID': {
      rich_text: [{ text: { content: meetupId } }]
    },
    'Published': {
      checkbox: true
    }
  };

  try {
    if (existingPage) {
      // Update existing page
      await notion.pages.update({
        page_id: existingPage.id,
        properties: properties
      });
      console.log(`  ↻ Updated: ${meetupEvent.title}`);
    } else {
      // Create new page
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_EVENTS_DB_ID },
        properties: properties
      });
      console.log(`  + Created: ${meetupEvent.title}`);
    }
  } catch (error) {
    console.error(`  ✗ Error syncing "${meetupEvent.title}":`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Validate environment variables
    if (!process.env.NOTION_API_KEY) {
      throw new Error('NOTION_API_KEY is not set');
    }
    if (!process.env.NOTION_EVENTS_DB_ID) {
      throw new Error('NOTION_EVENTS_DB_ID is not set');
    }
    if (!process.env.MEETUP_OAUTH_TOKEN) {
      throw new Error('MEETUP_OAUTH_TOKEN is not set');
    }
    if (!process.env.MEETUP_GROUP_URLNAME) {
      throw new Error('MEETUP_GROUP_URLNAME is not set');
    }

    console.log('\n=== Syncing Meetup events to Notion ===\n');

    // Fetch events from Meetup
    const meetupEvents = await fetchMeetupEvents();

    console.log('\nSyncing upcoming events...');
    for (const event of meetupEvents.upcoming) {
      await syncEventToNotion(event, 'upcoming');
    }

    console.log('\nSyncing past events...');
    for (const event of meetupEvents.past) {
      await syncEventToNotion(event, 'past');
    }

    console.log('\n✓ Sync complete!\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure you have a Meetup Pro subscription');
    console.error('2. Create an OAuth consumer at https://secure.meetup.com/meetup_api/oauth_consumers/');
    console.error('3. Get your OAuth token and add it to .env');
    console.error('4. Make sure your group URL name is correct\n');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { fetchMeetupEvents, syncEventToNotion };
