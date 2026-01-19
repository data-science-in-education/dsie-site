# Meetup.com Integration Guide

This guide explains how to set up the Meetup.com to Notion sync feature.

## Prerequisites

- **Meetup Pro subscription** (required for API access)
- A Meetup group with events
- Notion database already set up (see NOTION_SETUP.md)

## Step 1: Create OAuth Consumer

1. Go to https://secure.meetup.com/meetup_api/oauth_consumers/
2. Click "Create New Consumer"
3. Fill in the form:
   - **Consumer name**: "DSIE Website Sync" (or your preferred name)
   - **Application Website**: Your website URL
   - **Redirect URI**: `http://localhost` (for server-side apps)
4. Click "Submit"
5. You'll receive:
   - **Key** (Client ID)
   - **Secret** (Client Secret)

## Step 2: Get OAuth Access Token

### Option A: Use Meetup's OAuth Playground

1. Go to https://secure.meetup.com/meetup_api/oauth_consumers/
2. Click on your consumer
3. Click "Get Access Token"
4. Authorize the application
5. Copy the access token

### Option B: Manual OAuth Flow

If you're comfortable with OAuth, you can implement the full flow:

1. Direct users to:
   ```
   https://secure.meetup.com/oauth2/authorize?client_id=YOUR_KEY&response_type=code&redirect_uri=YOUR_REDIRECT_URI
   ```

2. Exchange the code for a token:
   ```bash
   curl -X POST https://secure.meetup.com/oauth2/access \
     -d "client_id=YOUR_KEY" \
     -d "client_secret=YOUR_SECRET" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=YOUR_REDIRECT_URI" \
     -d "code=CODE_FROM_STEP_1"
   ```

## Step 3: Find Your Group URL Name

Your group URL name is the part after `meetup.com/` in your group URL.

Example:
- URL: `https://www.meetup.com/data-science-education/`
- URL name: `data-science-education`

## Step 4: Configure Environment Variables

Add to your `.env` file:

```bash
# Meetup.com API Configuration
MEETUP_OAUTH_TOKEN=your_access_token_here
MEETUP_GROUP_URLNAME=your-group-url-name
```

## Step 5: Test the Sync

Run the sync script:

```bash
npm run sync-meetup
```

You should see output like:

```
=== Syncing Meetup events to Notion ===

Fetching events from Meetup.com...
✓ Found 5 upcoming and 12 past events

Syncing upcoming events...
  + Created: Workshop: Python for Educational Data
  + Created: Webinar: Ethics in Educational Data Science
  ...

Syncing past events...
  + Created: Introduction to Learning Analytics
  ...

✓ Sync complete!
```

## Step 6: Review in Notion

1. Open your Events database in Notion
2. You should see new events from Meetup
3. Review and edit:
   - **Highlights**: The script tries to extract bullet points, but you may want to add more
   - **YouTube URL**: After the event, add the recording URL if available
   - **Published**: Set to true by default, uncheck if you don't want it on the website

## Step 7: Update Website

After syncing and reviewing in Notion:

```bash
npm run fetch-notion
```

This pulls the data from Notion to your website's JSON files.

## How It Works

### Highlights Extraction

The script looks for bullet points in the event description:
- Lines starting with `-`, `*`, `•`, or numbered lists
- Extracts up to 5 highlights
- You can manually edit in Notion after sync

### Duplicate Prevention

- Events are matched by Meetup ID
- Re-running the sync updates existing events instead of creating duplicates
- Safe to run multiple times

## Automation

### Option 1: Cron Job (Linux/Mac)

Add to crontab:

```bash
# Sync Meetup events to Notion daily at 3 AM
0 3 * * * cd /path/to/dsie-site && npm run sync-meetup >> sync.log 2>&1
```

### Option 2: GitHub Actions

Create `.github/workflows/sync-meetup.yml`:

```yaml
name: Sync Meetup to Notion

on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run sync-meetup
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_EVENTS_DB_ID: ${{ secrets.NOTION_EVENTS_DB_ID }}
          MEETUP_OAUTH_TOKEN: ${{ secrets.MEETUP_OAUTH_TOKEN }}
          MEETUP_GROUP_URLNAME: ${{ secrets.MEETUP_GROUP_URLNAME }}
      - run: npm run fetch-notion
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_EVENTS_DB_ID: ${{ secrets.NOTION_EVENTS_DB_ID }}
          NOTION_VIDEOS_DB_ID: ${{ secrets.NOTION_VIDEOS_DB_ID }}
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add data/
          git commit -m "Sync from Meetup and update data" || exit 0
          git push
```

Add secrets in GitHub repository settings.

## Troubleshooting

### "Meetup API error: 401"

- Your OAuth token is invalid or expired
- Get a new token from Meetup OAuth consumers page

### "Group not found"

- Check your `MEETUP_GROUP_URLNAME` is correct
- Try visiting `https://www.meetup.com/YOUR_GROUP_URLNAME/` to verify

### "Error: MEETUP_OAUTH_TOKEN is not set"

- Make sure your `.env` file exists in the project root
- Check there are no typos in the variable names
- The `.env` file should not have quotes around values

### No events synced

- Check that your group actually has events on Meetup.com
- Verify your OAuth token has access to the group
- Check the console output for specific error messages

## API Rate Limits

- Meetup API has rate limits (typically 200 requests per hour)
- The sync script uses 1-2 requests per run
- Safe to run hourly or more frequently
- If you hit rate limits, wait an hour and try again

## Security Notes

- Never commit `.env` file to git (it's in `.gitignore`)
- Keep your OAuth token secret
- Rotate tokens periodically for security
- Use environment variables in CI/CD (don't hardcode)

## GraphQL API Reference

The sync uses Meetup's GraphQL API. For more details:
- Documentation: https://www.meetup.com/api/
- Schema: https://www.meetup.com/graphql/schema/
- Playground: https://www.meetup.com/graphql (requires login)

## Alternative: Manual Event Management

If you don't have Meetup Pro or prefer not to use the API:

1. Simply add events manually to your Notion database
2. Use the same database structure
3. Leave "Meetup ID" field empty
4. Run `npm run fetch-notion` to update the website

This gives you full control without any API dependencies!
