/**
 * Mint a Meetup OAuth bearer token via the JWT self-signed flow.
 *
 * Run once to get an access_token, then put it in MEETUP_OAUTH_TOKEN.
 *
 * Required env (or .env):
 *   MEETUP_CLIENT_KEY      — Client Key / UID from the OAuth consumer
 *   MEETUP_SIGNING_KEY_ID  — Key ID shown in the Signing keys list
 *   MEETUP_MEMBER_ID       — Your numeric Meetup member ID
 *
 * Required file:
 *   meetup-private.pem     — Private key downloaded from Meetup (project root)
 */

require('dotenv').config();
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const fetch  = require('node-fetch');

function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(header, payload, privateKey) {
  const h = base64url(Buffer.from(JSON.stringify(header)));
  const p = base64url(Buffer.from(JSON.stringify(payload)));
  const unsigned = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  return `${unsigned}.${base64url(signer.sign(privateKey))}`;
}

async function main() {
  const clientKey    = process.env.MEETUP_CLIENT_KEY;
  const signingKeyId = process.env.MEETUP_SIGNING_KEY_ID;
  const memberId     = process.env.MEETUP_MEMBER_ID;

  if (!clientKey)    { console.error('meetup-mint-token: MEETUP_CLIENT_KEY not set');    process.exit(1); }
  if (!signingKeyId) { console.error('meetup-mint-token: MEETUP_SIGNING_KEY_ID not set'); process.exit(1); }
  if (!memberId)     { console.error('meetup-mint-token: MEETUP_MEMBER_ID not set');      process.exit(1); }

  const keyPath = path.join(__dirname, '..', 'meetup-private.pem');
  if (!fs.existsSync(keyPath)) {
    console.error('meetup-mint-token: meetup-private.pem not found in project root');
    process.exit(1);
  }
  const pem = fs.readFileSync(keyPath, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  const privateKey = crypto.createPrivateKey({ key: pem, format: 'pem', type: 'pkcs1' });

  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', kid: signingKeyId, typ: 'JWT' };
  const payload = { iss: clientKey, sub: memberId, aud: 'api.meetup.com', exp: now + 120 };
  console.log('JWT header: ', JSON.stringify(header));
  console.log('JWT payload:', JSON.stringify(payload));

  const jwt = signJwt(header, payload, privateKey);
  console.log('JWT (first 60 chars):', jwt.slice(0, 60) + '...');

  console.log('\nPOSTing to https://secure.meetup.com/oauth2/access ...');
  const res = await fetch('https://secure.meetup.com/oauth2/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  console.log('HTTP status:', res.status, res.statusText);
  const body = await res.json();
  console.log('Response:', JSON.stringify(body, null, 2));
  if (!res.ok || body.error) {
    process.exit(1);
  }

  console.log('\nAdd to .env (and Vercel env vars):');
  console.log(`MEETUP_OAUTH_TOKEN=${body.access_token}`);
  if (body.refresh_token) {
    console.log(`\nRefresh token (for future automation):\n${body.refresh_token}`);
  }
}

main().catch(err => { console.error('meetup-mint-token:', err.message); process.exit(1); });
