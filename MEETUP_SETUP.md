# Meetup setup

The site pulls upcoming events directly from the DSiE Meetup group via
the Meetup GraphQL API. `scripts/meetup-fetch.js` writes
`data/events.json`, which `upcoming.html` reads at runtime.

Past talks are sourced from Notion (see `NOTION_SETUP.md`). Meetup is
upcoming-only.

## Prerequisites

- An organiser account on the **data-science-in-education** Meetup
  group (or whatever group the site represents).
- A **Meetup Pro** subscription on that account. The GraphQL endpoints
  we use require it.

## 1. Create the OAuth consumer

1. Sign in to Meetup as the organiser account.
2. Go to https://www.meetup.com/api/oauth/list/ and click **Create new
   client** (or go straight to
   https://www.meetup.com/graphql/oauth/create/).
3. Fill in the form:

   | Field                 | Value                                                                     |
   | --------------------- | ------------------------------------------------------------------------- |
   | **Consumer Name**     | `DSiE Site Events Feed`                                                   |
   | **Application Website** | The production site URL, e.g. `https://datascienceineducation.org`      |
   | **Redirect URI**      | Required but unused for our build-time flow. Use the site URL + `/oauth/callback`. Must be HTTPS and on the same domain as Application Website. |
   | **Description**       | "Server-side script that fetches upcoming events from the Data Science in Education group at build time, for display on the group's website. No user logins." |

4. Submit. The client lands in **Pending** state.

## 2. Wait for approval

Meetup staff review every new OAuth consumer manually. Typical wait is
**1–3 business days**; it can be a few hours on a good run or up to a
week on a bad one. While Pending the client cannot mint tokens.

- Don't create a second client — it usually resets the queue.
- If it's still Pending after ~5 business days, email
  `api-support@meetup.com` with the consumer name and the account
  email.

Once approved you'll see the **Pending** chip switch to **Approved** on
https://www.meetup.com/api/oauth/list/.

## 3. Grab the credentials

Open the approved client's **Settings** page. Note:

- **Client Key** (a.k.a. UID / Client ID)
- **Client Secret** — shown once. Save it now.

## 4. Mint an access token

We use the **self-signed JWT** flow (no browser involved, suitable for
build-time scripts).

### 4a. Create a signing key on Meetup

In the OAuth client's **Settings** page, find the **Signing keys** section and
click **Create signing key**. Meetup generates the RSA keypair for you:

- It stores the public key.
- It offers the **private key** as a one-time download — save this file now as
  `meetup-private.pem` and keep it out of git.
- It shows a **Signing Key ID** in the Active keys list — note this value.

### 4b. Exchange a signed JWT for a bearer token

Add these three values to your `.env`:

```
MEETUP_CLIENT_KEY=<Client Key from step 3>
MEETUP_SIGNING_KEY_ID=<Signing Key ID from step 4a>
MEETUP_MEMBER_ID=<your numeric Meetup member ID>
```

Your member ID is the number in the URL when you view your Meetup profile
(`meetup.com/members/<this-number>`).

Then run:

```bash
npm run mint-meetup-token
```

The script (`scripts/meetup-mint-token.js`) builds and signs a JWT using
`meetup-private.pem` and exchanges it for a bearer token. Copy the printed
`MEETUP_OAUTH_TOKEN=...` line into your `.env`.

The token is valid for ~1 hour. Re-run the command whenever it expires.

## 5. Configure environment

Add to `.env` for local dev:

```
MEETUP_OAUTH_TOKEN=<access_token from step 4c>
MEETUP_GROUP_URLNAME=data-science-in-education
```

On Vercel, set the same two variables under **Project Settings → Environment Variables**.

## 6. First fetch

```bash
npm run fetch-meetup
```

You should see something like:

```
meetup-fetch: pulling upcoming events for "data-science-in-education"...
meetup-fetch: wrote 3 upcoming event(s) to data/events.json
```

Open `upcoming.html` in a browser (`npm run serve`) and confirm the
events render.

## Speaker convention

`scripts/meetup-fetch.js` looks for a line like

```
Speaker: Lena Park
```

(or `Speakers: A, B`) in each event's description and lifts that into
the `speaker` field shown on the site. If the line is absent, the
speaker slot stays empty and the row still renders cleanly. Adding the
line to the Meetup event description is the lightest way to keep the
upcoming list looking complete.

## Refreshing the data on a schedule

Vercel rebuilds on every push, so a `git push` will pick up the latest
Meetup events. To refresh on a schedule without pushing, options are:

1. **GitHub Actions cron** hitting a Vercel **Deploy Hook** URL. Both
   are free; cron can fire every few hours.
2. **Vercel Cron Jobs** — free on Hobby but capped at daily.

Neither is wired up yet.

## Troubleshooting

- **`401 Unauthorized`** — the access token has expired (lifetime
  ~1h). Mint a fresh one (step 4c) and update the env var.
- **`group not found`** — `MEETUP_GROUP_URLNAME` is wrong. It's the
  slug from the group's URL (`meetup.com/<this-bit>`), not the display
  name.
- **`GraphQL errors: ... not authorised ...`** — either the OAuth
  client isn't approved yet, the account doesn't organise the group,
  or Meetup Pro lapsed.
- **`upcoming` array is empty but the group has events** — the events
  may be drafts. Only published Meetup events come through.
- **Speaker is empty on the site** — no `Speaker: <name>` line in the
  Meetup event description (see "Speaker convention" above).
