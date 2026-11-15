/**
 * Spotify "now playing" badge — a dependency-free Vercel function.
 *
 *   GET /api/now-playing            -> animated SVG (embed with <img>)
 *   GET /api/now-playing?format=json-> the same data as JSON (debugging)
 *
 * Environment (set these in Vercel, never in the repository):
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN
 *
 * The album art is fetched server-side and inlined as a data URI. That matters:
 * browsers refuse to load external images inside an SVG that is itself loaded
 * through <img> (which is how GitHub renders README images), so a linked
 * i.scdn.co URL would silently show a blank square.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const ARTWORK_CACHE_MS = 10 * 60 * 1000;

const WIDTH = 640;
const HEIGHT = 160;

/** @type {{ value: string, expiresAt: number } | null} */
let cachedToken = null;
/** @type {Map<string, { dataUri: string, at: number }>} */
const artworkCache = new Map();

export default async function handler(req, res) {
  const format = String(req.query?.format || '').toLowerCase();
  const wantsJson = format === 'json';

  let track = null;
  let error = null;

  try {
    track = await fetchNowPlaying();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'unknown-error';
    console.error('[now-playing]', error);
  }

  if (wantsJson) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=30');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(
      JSON.stringify(
        {
          ok: !error,
          playing: Boolean(track?.isPlaying),
          track: track
            ? {
                title: track.title,
                artist: track.artist,
                album: track.album,
                url: track.url,
                progressMs: track.progressMs,
                durationMs: track.durationMs,
                artwork: track.artwork ? 'inlined' : null,
              }
            : null,
          error,
        },
        null,
        2,
      ),
    );
    return;
  }

  const svg = renderSvg(track, error);
  res.statusCode = 200;
  res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
  res.setHeader(
    'cache-control',
    track?.isPlaying
      ? 'public, s-maxage=60, stale-while-revalidate=120'
      : 'public, s-maxage=30, stale-while-revalidate=60',
  );
  res.setHeader('x-content-type-options', 'nosniff');
  // The SVG is an image, never a document. This blocks script and network
  // access even if a future edit accidentally interpolates untrusted markup.
  res.setHeader(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
  );
  res.end(svg);
}

/* ------------------------------------------------------------------ spotify */

async function fetchNowPlaying() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REFRESH_TOKEN) {
    throw new Error('spotify-not-configured');
  }

  const token = await getAccessToken();
  let response = await spotifyGet(token);

  if (response.status === 401) {
    cachedToken = null;
    const fresh = await getAccessToken();
    response = await spotifyGet(fresh);
  }

  if (response.status === 204) return null;
  if (response.status === 429) throw new Error('spotify-rate-limited');
  if (!response.ok) throw new Error(`spotify-http-${response.status}`);

  const body = await response.json().catch(() => null);
  const item = body?.item;
  if (!item || item.type !== 'track') return null;

  const artworkUrl = pickImage(item.album?.images);
  const artwork = artworkUrl ? await inlineArtwork(artworkUrl) : null;

  return {
    isPlaying: Boolean(body.is_playing),
    title: String(item.name || 'Unknown track'),
    artist: (item.artists || []).map((artist) => artist?.name).filter(Boolean).join(', ') || 'Unknown artist',
    album: String(item.album?.name || ''),
    url: String(item.external_urls?.spotify || 'https://open.spotify.com/'),
    progressMs: clamp(numberOr(body.progress_ms, 0), 0, numberOr(item.duration_ms, 0)),
    durationMs: numberOr(item.duration_ms, 0),
    artwork,
  };
}

function spotifyGet(token) {
  return fetch(NOW_PLAYING_URL, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    // Vercel's fetch supports this; harmless on runtimes that ignore it.
    cache: 'no-store',
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    // Never echo the response body: it can contain token fragments.
    throw new Error(`spotify-token-${response.status}`);
  }

  const body = await response.json();
  if (!body?.access_token) throw new Error('spotify-token-missing');

  cachedToken = {
    value: body.access_token,
    expiresAt: now + numberOr(body.expires_in, 3600) * 1000,
  };
  return cachedToken.value;
}

function pickImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sorted = [...images].filter((image) => image?.url).sort((a, b) => numberOr(a.width, 0) - numberOr(b.width, 0));
  // 300px is plenty for a 112px square and keeps the SVG small.
  return sorted.find((image) => numberOr(image.width, 0) >= 300)?.url || sorted.at(-1)?.url || null;
}

async function inlineArtwork(url) {
  const cached = artworkCache.get(url);
  if (cached && Date.now() - cached.at < ARTWORK_CACHE_MS) return cached.dataUri;

  try {
    // Spotify art hosts are the only URLs we ever follow.
    if (!/^https:\/\/i\.scdn\.co\//.test(url)) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 250_000) return null;
    const dataUri = `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`;
    artworkCache.set(url, { dataUri, at: Date.now() });
    return dataUri;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- svg */

function renderSvg(track, error) {
  const idle = !track || !track.isPlaying;
  const accent = idle ? '#1d6b35' : '#39ff14';
  const strong = idle ? '#7fdc9a' : '#d8ffe0';
  const dim = '#5f9c72';

  const title = track ? truncate(track.title, 28) : error ? 'SIGNAL LOST' : 'NO SIGNAL';
  const artistLine = track
    ? truncate(track.artist, 40)
    : error === 'spotify-not-configured'
      ? 'Spotify is not configured on this deployment.'
      : error
        ? 'Spotify is unreachable right now.'
        : 'Nothing is playing. The machine is listening to silence.';

  const subtitle = track?.album && !idle ? truncate(track.album, 30) : idle ? 'STATUS: IDLE' : 'STATUS: LIVE';

  const art = track?.artwork
    ? `<image href="${track.artwork}" x="16" y="24" width="112" height="112" preserveAspectRatio="xMidYMid slice" clip-path="url(#artClip)" />`
    : placeholderArt(idle ? 'IDLE' : 'NO//ART');

  const progress = track && track.durationMs > 0 ? Math.min(1, track.progressMs / track.durationMs) : 0;
  const barWidth = 400;
  const barEnd = 148 + barWidth;
  const elapsed = track ? formatTime(track.progressMs) : '--:--';
  const total = track?.durationMs ? formatTime(track.durationMs) : '--:--';
  const statusLabel = track?.isPlaying ? 'NOW PLAYING' : track ? 'LAST PLAYED' : 'SPOTIFY // IDLE';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="npTitle npDesc">
  <title id="npTitle">${escapeXml(track ? `${track.title} — ${track.artist}` : title)}</title>
  <desc id="npDesc">${escapeXml(
    track?.isPlaying
      ? 'Live Spotify now-playing card from the Matrix profile.'
      : error
        ? 'Spotify now-playing card: the feed is unavailable.'
        : 'Spotify now-playing card: nothing is playing.',
  )}</desc>

  <defs>
    <clipPath id="artClip"><rect x="16" y="24" width="112" height="112" rx="4" /></clipPath>
    <linearGradient id="barFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f8f3a" />
      <stop offset="60%" stop-color="${accent}" />
      <stop offset="100%" stop-color="#b6ffc4" />
    </linearGradient>
    <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#39ff14" opacity="0.045" />
    </pattern>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.4" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <style>
      .mono { font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace; }
      .label { font-size: 10px; letter-spacing: 2px; fill: ${accent}; }
      .title { font-size: 20px; font-weight: 700; fill: ${strong}; letter-spacing: 0.4px; }
      .sub { font-size: 12px; fill: ${dim}; }
      .time { font-size: 10px; fill: ${dim}; letter-spacing: 0.6px; }
      .pulse { animation: pulse 1.8s ease-in-out infinite; }
      @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
      .eq rect { animation: bounce 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
      .eq rect:nth-child(2) { animation-delay: .18s }
      .eq rect:nth-child(3) { animation-delay: .36s }
      .eq rect:nth-child(4) { animation-delay: .54s }
      .eq rect:nth-child(5) { animation-delay: .72s }
      @keyframes bounce { 0%,100% { transform: scaleY(.22) } 50% { transform: scaleY(1) } }
    </style>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" rx="6" fill="#040804" />
  <rect width="${WIDTH}" height="${HEIGHT}" rx="6" fill="url(#scanlines)" />
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="6" fill="none" stroke="#1f4d2c" stroke-width="1" />

  <!-- album art -->
  <rect x="16" y="24" width="112" height="112" rx="4" fill="#07120a" stroke="#1f4d2c" />
  ${art}

  <!-- text block -->
  <text x="148" y="40" class="mono label">${statusLabel}</text>
  <circle cx="612" cy="36" r="4" fill="${accent}" ${track?.isPlaying ? 'class="pulse"' : 'opacity="0.35"'} />
  <text x="148" y="72" class="mono title" filter="url(#glow)">${escapeXml(title)}</text>
  <text x="148" y="92" class="mono sub">${escapeXml(artistLine)}</text>
  <text x="148" y="108" class="mono sub" opacity="0.75">${escapeXml(subtitle)}</text>

  <!-- equalizer -->
  <g class="eq" transform="translate(578 58)">
    ${[0, 1, 2, 3, 4]
      .map(
        (index) =>
          `<rect x="${index * 9}" y="0" width="5" height="22" rx="1.5" fill="${accent}" opacity="${track?.isPlaying ? 0.9 : 0.25}" />`,
      )
      .join('')}
  </g>

  <!-- progress -->
  <rect x="148" y="124" width="${barWidth}" height="4" rx="2" fill="#102616" />
  <rect x="148" y="124" width="${Math.max(progress * barWidth, progress > 0 ? 2 : 0)}" height="4" rx="2" fill="url(#barFill)" />
  <text x="148" y="146" class="mono time">${elapsed}</text>
  <text x="${barEnd}" y="146" class="mono time" text-anchor="end">${total}</text>

  ${linkRow(track?.url)}
</svg>`;
}

function linkRow(url) {
  const href = url || 'https://open.spotify.com';
  const label = url ? 'LISTEN &#8599;' : 'SPOTIFY &#8599;';
  return `<a href="${escapeXml(href)}" target="_blank" rel="noopener noreferrer">
    <text x="624" y="146" class="mono time" text-anchor="end" fill="#39ff14">${label}</text>
  </a>`;
}

function placeholderArt(label) {
  return `<g>
    <rect x="16" y="24" width="112" height="112" rx="4" fill="#06100a" />
    <path d="M16 24 L128 136 M128 24 L16 136" stroke="#123a1f" stroke-width="1" />
    <text x="72" y="84" text-anchor="middle" class="mono" font-size="11" letter-spacing="2" fill="#2f7f49">${escapeXml(label)}</text>
    <text x="72" y="100" text-anchor="middle" class="mono" font-size="8" letter-spacing="1.5" fill="#1d5a33">NO DATA</text>
  </g>`;
}

/* -------------------------------------------------------------------- utils */

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncate(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatTime(ms) {
  const total = Math.max(0, Math.round(numberOr(ms, 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
