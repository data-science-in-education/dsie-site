# Notion Setup Guide

This guide will help you set up Notion as your CMS for the Data Science in Education website.

## Step 1: Create Notion Database

### Events Database

Create a new database in Notion with the following properties:

| Property Name | Type | Description |
|--------------|------|-------------|
| **Title** | Title | Event name |
| **Description** | Text | Event description |
| **Date** | Date | Event date and time |
| **Duration** | Number | Duration in minutes |
| **Location** | Text | Online (Zoom), etc. |
| **Time** | Text | Time display (e.g., "2:00 PM - 5:00 PM EST") |
| **Highlights** | Text | Bulleted list of key points |
| **Registration Link** | URL | Link to registration page (for upcoming events) |
| **YouTube URL** | URL | Video recording link (for past events) |
| **Status** | Select | upcoming, past, cancelled |
| **Meetup ID** | Text | ID from Meetup.com (for sync) |
| **Published** | Checkbox | Show on website? |

**Note:** Events can be either upcoming (with registration links) or past (with video recordings). The same database handles both!

## Step 2: Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "+ New integration"
3. Name it "DSIE Website"
4. Select the workspace where your databases are
5. Click "Submit"
6. Copy the "Internal Integration Token" - you'll need this!

## Step 3: Share Database with Integration

1. Open your Events database in Notion
2. Click the "..." menu (top right)
3. Scroll to "Connections" or "Add connections"
4. Select your "DSIE Website" integration

## Step 4: Get Database ID

1. Open your Events database as a full page
2. Look at the URL: `https://www.notion.so/xxxxx?v=yyyyy`
3. The `xxxxx` part (32 characters) is your database ID
4. Copy this for your Events database

## Step 5: Configure Environment Variables

Create a `.env` file in the project root with:

```
NOTION_API_KEY=your_integration_token_here
NOTION_EVENTS_DB_ID=your_events_database_id

# For Meetup sync (optional)
MEETUP_OAUTH_TOKEN=your_meetup_oauth_token
MEETUP_GROUP_URLNAME=your_group_urlname
```

## Step 6: Install Dependencies

```bash
npm install @notionhq/client dotenv node-fetch
```

## Next Steps

- Run `node scripts/notion-fetch.js` to test fetching from Notion
- Set up Meetup sync (see MEETUP_SYNC.md)
- Deploy your website!
