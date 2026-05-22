# Meetup setup

Events are managed in Notion and the site reads from there. Meetup.com is used
as the RSVP platform — attendees sign up there and get reminders from Meetup.

A future script (`scripts/meetup-publish.js`, not yet built) will push events
from Notion to Meetup so you only have to create them in one place.

## OAuth credentials

Meetup requires a Pro subscription and an approved OAuth consumer to write events
via the API.

### 1. Create an OAuth consumer

1. Go to https://www.meetup.com/api/oauth/list/ → **Create new client**.
2. Set Application Website to the site URL and Redirect URI to site URL + `/oauth/callback`.
3. Submit. The client enters **Pending** — approval takes 1–3 business days.
   Email `api-support@meetup.com` after 5+ days if still pending.

### 2. Get credentials and mint a token

Once approved:

1. In the client's Settings, note the **Client Key**.
2. Under **Signing keys**, click **Create signing key**. Save the private key as
   `meetup-private.pem` (keep out of git). Note the **Signing Key ID**.
3. Add to `.env`:
   ```
   MEETUP_CLIENT_KEY=...
   MEETUP_SIGNING_KEY_ID=...
   MEETUP_MEMBER_ID=...    # number from meetup.com/members/<id>
   ```
4. Run `npm run mint-meetup-token`. Copy the printed `MEETUP_OAUTH_TOKEN=...`
   line into `.env`. Tokens expire in ~1 hour; re-run when needed.
