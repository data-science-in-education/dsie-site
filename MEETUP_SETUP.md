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

### 4a. Generate an RSA keypair

```bash
openssl genrsa -out meetup-private.pem 2048
openssl rsa -in meetup-private.pem -pubout -out meetup-public.pem
```

Keep `meetup-private.pem` out of git — it should never be committed.

### 4b. Register the public key with Meetup

In the OAuth client's Settings page there's a **Signing keys** section.
Paste the contents of `meetup-public.pem` and save. Meetup gives back a
**Signing Key ID** (a short alphanumeric string).

### 4c. Exchange a signed JWT for a bearer token

POST a JWT (signed with the private key, `kid` header = Signing Key ID)
to `https://secure.meetup.com/oauth2/access` with these claims:

```
iss: <Client Key>
sub: <Meetup member ID of the organiser account>
aud: api.meetup.com
exp: <now + 120 seconds>
```

Meetup returns an `access_token` (good for ~1 hour) and a
`refresh_token`. The `access_token` is what goes into
`MEETUP_OAUTH_TOKEN`.

> **Note**: `scripts/meetup-fetch.js` currently expects a ready-made
> bearer token in `MEETUP_OAUTH_TOKEN`. For continuous deploys we'll
> want the script itself to mint a fresh token on each run from the
> Client Key + Signing Key ID + private key — that's a follow-up task
> tracked in the repo TODOs.

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
