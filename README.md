# Data Science in Education Website

A modern, responsive website for the Data Science in Education community, powered by Notion as a CMS with optional Meetup.com integration.

## Features

- 🎨 **Modern Design**: Clean, professional design inspired by eedi.com with Inter font typography
- 📝 **Notion CMS**: Manage all events in a single Notion database (upcoming & past events with optional videos)
- 🔄 **Meetup Sync**: Automatically sync events from Meetup.com to Notion
- 📱 **Responsive**: Mobile-friendly design that works on all devices
- ⚡ **Static Site**: Fast loading, can be hosted anywhere (GitHub Pages, Netlify, etc.)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Notion (Required)

Follow the detailed guide in [NOTION_SETUP.md](./NOTION_SETUP.md) to:
- Create your Notion Events database (handles both upcoming and past events)
- Get your Notion API key
- Configure your `.env` file

### 3. Set Up Meetup Sync (Optional)

If you want to automatically sync events from Meetup.com:

1. You need a **Meetup Pro subscription**
2. Create an OAuth consumer at https://secure.meetup.com/meetup_api/oauth_consumers/
3. Add your credentials to `.env`:
   ```
   MEETUP_OAUTH_TOKEN=your_token_here
   MEETUP_GROUP_URLNAME=your_group_name
   ```

### 4. Fetch Data from Notion

```bash
npm run fetch-notion
```

This will:
- Fetch all published events from your Notion database
- Generate `data/events.json` (upcoming and past events)
- Generate `data/videos.json` (from past events with YouTube URLs)
- These files are used by the website to display content

### 5. Sync Meetup Events (Optional)

```bash
npm run sync-meetup
```

This will:
- Fetch events from your Meetup group
- Create/update them in your Notion database
- You can then run `npm run fetch-notion` to update the website

### 6. View the Website

```bash
npm run serve
```

Then open http://localhost:8000 in your browser.

## Project Structure

```
dsie-site/
├── index.html              # Homepage
├── events.html             # Events listing page
├── videos.html             # Videos listing page
├── css/
│   └── styles.css          # All styles
├── js/
│   ├── main.js             # UI interactions
│   └── data-loader.js      # Loads and renders data from JSON files
├── scripts/
│   ├── notion-fetch.js     # Fetches data from Notion
│   └── meetup-sync.js      # Syncs Meetup events to Notion
├── data/
│   ├── events.json         # Generated events data
│   └── videos.json         # Generated videos data
├── .env                    # Your environment variables (not in git)
└── .env.example            # Example environment variables

```

## Workflow

### Regular Content Updates

1. **Add/Edit content in Notion** (add events, update past events with video URLs, etc.)
2. **Fetch from Notion**: `npm run fetch-notion`
3. **Deploy**: Push changes to your hosting platform

### Meetup Integration Workflow

1. **Events are created on Meetup.com** (or already exist)
2. **Sync to Notion**: `npm run sync-meetup`
3. **Review/edit in Notion** (add highlights, adjust descriptions, etc.)
4. **Fetch to website**: `npm run fetch-notion`
5. **Deploy**: Push changes to your hosting platform

You can automate steps 2-4 with GitHub Actions or similar CI/CD tools.

## Development

### Local Development

```bash
# Install dependencies
npm install

# Fetch latest data from Notion
npm run fetch-notion

# Start local server
npm run serve
```

### Available Scripts

- `npm run fetch-notion` - Fetch events from Notion and generate videos from past events
- `npm run sync-meetup` - Sync Meetup events to Notion
- `npm run build-data` - Alias for fetch-notion
- `npm run serve` - Start local HTTP server
- `npm run dev` - Fetch data and start server

## Deployment

### GitHub Pages

1. Push your code to GitHub
2. Go to Settings → Pages
3. Set source to your branch (e.g., `gh-pages` or `main`)
4. Your site will be live at `https://yourusername.github.io/repo-name`

**Important**: Remember to run `npm run fetch-notion` before deploying to update your data files.

### Netlify / Vercel

1. Connect your Git repository
2. Set build command: `npm run fetch-notion` (optional, if you want to fetch on deploy)
3. Set publish directory: `./` (root)
4. Add environment variables in the platform settings

### Automation with GitHub Actions

Create `.github/workflows/update-data.yml`:

```yaml
name: Update Data from Notion

on:
  schedule:
    - cron: '0 0 * * *'  # Run daily at midnight
  workflow_dispatch:  # Allow manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run fetch-notion
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_EVENTS_DB_ID: ${{ secrets.NOTION_EVENTS_DB_ID }}
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add data/
          git commit -m "Update data from Notion" || exit 0
          git push
```

Add your Notion credentials as GitHub secrets.

## Customization

### Colors and Styling

Edit `css/styles.css` - look for the `:root` section at the top to change colors:

```css
:root {
    --primary-color: #0066cc;
    --secondary-color: #00b8a9;
    /* ... other colors ... */
}
```

### Content Sections

The homepage has these main sections:
- Hero banner
- Mission statement
- Featured videos
- Upcoming events

Edit `index.html` to modify these sections.

## Troubleshooting

### "No events/videos showing"

1. Check that you've run `npm run fetch-notion`
2. Verify that `data/events.json` and `data/videos.json` exist
3. Check that your Notion databases have items with "Published" checked
4. Open browser console for JavaScript errors

### "Error fetching from Notion"

1. Verify your `.env` file has correct credentials
2. Check that your Notion integration has access to the databases
3. Verify database IDs are correct (32 character strings from the URL)

### "Meetup sync not working"

1. Requires Meetup Pro subscription
2. Check OAuth token is valid
3. Verify group URL name is correct
4. See Meetup API documentation: https://www.meetup.com/api/

## Support

For issues and questions:
- Check [NOTION_SETUP.md](./NOTION_SETUP.md) for Notion setup
- Review the code comments in `scripts/` folder
- Check browser console for errors

## License

MIT License - feel free to use and modify for your own projects!
