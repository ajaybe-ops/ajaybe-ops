import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

const ENV_KEYS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'];
const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let importCounter = 0;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function configure() {
  process.env.SPOTIFY_CLIENT_ID = 'client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'client-secret';
  process.env.SPOTIFY_REFRESH_TOKEN = 'refresh-token';
}

async function loadHandler() {
  // Query strings bypass the ES module cache so token state never leaks
  // between tests.
  return (await import(`../api/now-playing.js?case=${++importCounter}`)).default;
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function call(handler, query = {}) {
  const res = fakeRes();
  await handler({ query }, res);
  return res;
}

/** A fetch stub that routes by URL and records every call. */
function stubSpotify({ token = 1, api = 1, artwork = true } = {}) {
  const calls = { token: 0, api: 0, artwork: 0 };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('accounts.spotify.com')) {
      calls.token += 1;
      if (calls.token <= token.block) {
        return new Response('{"error":"invalid_grant"}', { status: 400 });
      }
      return new Response(JSON.stringify({ access_token: `token-${calls.token}`, expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('api.spotify.com')) {
      calls.api += 1;
      if (calls.api <= api.block) return new Response(null, { status: 401 });
      if (api.rateLimit) return new Response('', { status: 429 });
      if (api.empty) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(api.body ?? playingBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('i.scdn.co')) {
      calls.artwork += 1;
      if (!artwork) return new Response('', { status: 404 });
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  return calls;
}

function playingBody(overrides = {}) {
  return {
    is_playing: true,
    progress_ms: 84_000,
    item: {
      type: 'track',
      name: 'Clubbed to Death (Kurayamino Mix)',
      duration_ms: 431_000,
      external_urls: { spotify: 'https://open.spotify.com/track/2cM5rPF4DO8K06C9PR0Gtq' },
      artists: [{ name: 'Rob Dougan' }],
      album: {
        name: 'The Matrix: Music from the Motion Picture',
        images: [{ url: 'https://i.scdn.co/image/abc123', width: 300, height: 300 }],
      },
    },
    ...overrides,
  };
}

test('without credentials the badge is still a valid, honest SVG', async () => {
  stubSpotify();
  const res = await call(await loadHandler());

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /image\/svg\+xml/);
  assert.match(res.body, /SIGNAL LOST/);
  assert.match(res.body, /Spotify is not configured on this deployment/);
  assert.match(res.body, /SPOTIFY \/\/ IDLE/);
  assert.match(res.headers['cache-control'], /s-maxage=30/);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('a playing track is rendered with inlined artwork and a live cache', async () => {
  configure();
  const calls = stubSpotify();
  const res = await call(await loadHandler());

  assert.equal(calls.token, 1);
  assert.equal(calls.api, 1);
  assert.equal(calls.artwork, 1);
  assert.match(res.body, /NOW PLAYING/);
  assert.match(res.body, /Clubbed to Death/);
  assert.match(res.body, /Rob Dougan/);
  assert.match(res.body, /data:image\/png;base64,/);
  assert.doesNotMatch(res.body, /href="https:\/\/i\.scdn\.co/);
  assert.match(res.body, /LISTEN &#8599;/);
  assert.match(res.headers['cache-control'], /s-maxage=60/);
});

test('track text is XML-escaped', async () => {
  configure();
  stubSpotify({
    api: {
      body: playingBody({
        item: {
          ...playingBody().item,
          name: '<script>alert("pwn")</script>',
          artists: [{ name: 'A & B' }],
        },
      }),
      block: 0,
    },
  });
  const res = await call(await loadHandler());

  assert.doesNotMatch(res.body, /<script>/);
  assert.match(res.body, /&lt;script&gt;/);
  assert.match(res.body, /A &amp; B/);
});

test('?format=json returns data, never credentials or the raw token', async () => {
  configure();
  const calls = stubSpotify();
  const handler = await loadHandler();
  const res = await call(handler, { format: 'json' });

  assert.equal(calls.api, 1);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.playing, true);
  assert.equal(payload.track.title, 'Clubbed to Death (Kurayamino Mix)');
  assert.equal(payload.track.artwork, 'inlined');
  assert.doesNotMatch(res.body, /client-secret|refresh-token|token-1/);
});

test('a 401 triggers exactly one refresh and one retry', async () => {
  configure();
  const calls = stubSpotify({ api: { block: 1 } });
  const res = await call(await loadHandler());

  assert.equal(calls.token, 2);
  assert.equal(calls.api, 2);
  assert.match(res.body, /NOW PLAYING/);
});

test('an expired account (204) is an idle card, not an error', async () => {
  configure();
  stubSpotify({ api: { empty: true } });
  const res = await call(await loadHandler());

  assert.match(res.body, /NO SIGNAL/);
  assert.match(res.body, /nothing is playing/i);
  assert.doesNotMatch(res.body, /SIGNAL LOST/);
});

test('rate limiting degrades to the honest error card with HTTP 200', async () => {
  configure();
  stubSpotify({ api: { rateLimit: true } });
  const res = await call(await loadHandler());

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /SIGNAL LOST/);
  assert.match(res.body, /unreachable/);
});

test('artwork failure leaves a placeholder rather than a broken image', async () => {
  configure();
  stubSpotify({ artwork: false });
  const res = await call(await loadHandler());

  assert.match(res.body, /NO\/\/ART/);
  assert.doesNotMatch(res.body, /<image /);
});
