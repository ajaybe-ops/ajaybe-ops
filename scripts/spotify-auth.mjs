#!/usr/bin/env node
/**
 * One-time Spotify authorization helper.
 *
 *   1. Create an app at https://developer.spotify.com/dashboard
 *   2. Add this exact redirect URI to the app:  http://127.0.0.1:8888/callback
 *   3. Run:  SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-auth.mjs
 *   4. Approve access in the browser, then copy the refresh token into Vercel.
 *
 * No dependencies: a throwaway HTTP server receives the callback. The client
 * secret is read from the environment so it never appears in shell history if
 * you use a .env file or your shell's own secret handling.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.SPOTIFY_AUTH_PORT || 8888);
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  fail(
    'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set.\n' +
      '  PowerShell:  $env:SPOTIFY_CLIENT_ID="..."; $env:SPOTIFY_CLIENT_SECRET="..."\n' +
      '  bash:        export SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...',
  );
}

const state = randomState();
const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
authorizeUrl.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  scope: SCOPES.join(' '),
  state,
  show_dialog: 'true',
}).toString();

console.log('\nSpotify authorization helper\n');
console.log(`Redirect URI (must be registered in the Spotify dashboard):\n  ${REDIRECT_URI}\n`);
console.log('Open this URL, approve access, and wait for the local callback:\n');
console.log(`  ${authorizeUrl}\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', REDIRECT_URI);
  if (url.pathname !== '/callback') {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    reply(res, 400, `Spotify returned an error: ${error}`);
    fail(`Spotify returned: ${error}`);
    return;
  }

  if (url.searchParams.get('state') !== state) {
    reply(res, 400, 'State mismatch. Nothing was stored.');
    fail('State mismatch — the callback did not come from this helper.');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    reply(res, 400, 'No authorization code in the callback.');
    fail('No authorization code in the callback.');
    return;
  }

  try {
    const tokens = await exchangeCode(code);
    reply(
      res,
      200,
      'Authorization complete. Return to the terminal and copy the refresh token into Vercel.',
    );
    server.close();

    if (!tokens.refresh_token) {
      fail(
        'Spotify did not return a refresh token. Remove the app from\n' +
          'https://www.spotify.com/account/apps/ and run this helper again.',
      );
    }

    console.log('\nSuccess. Add these to the Vercel project (Settings → Environment Variables):\n');
    console.log(`SPOTIFY_CLIENT_ID=${clientId}`);
    console.log('SPOTIFY_CLIENT_SECRET=<the secret you already have>');
    console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('Then deploy and open /api/now-playing?format=json to verify.\n');
    process.exit(0);
  } catch (cause) {
    reply(res, 500, 'Token exchange failed. Check the terminal.');
    fail(cause instanceof Error ? cause.message : String(cause));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Waiting for the callback on ${REDIRECT_URI} …`);
});

server.on('error', (cause) => {
  fail(`Could not listen on port ${PORT}: ${cause.message}`);
});

async function exchangeCode(code) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Token exchange failed (HTTP ${response.status}): ${body.error_description || body.error || 'unknown error'}`);
  }
  return body;
}

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reply(res, status, message) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>Matrix profile · Spotify</title>` +
      `<body style="font:16px/1.6 ui-monospace,Consolas,monospace;background:#040804;color:#d8ffe0;padding:3rem;max-width:44rem;margin:auto">` +
      `<p>${message.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)}</p></body>`,
  );
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
