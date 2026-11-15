/**
 * Shared SVG helpers for the generated profile assets.
 *
 * Everything here is deliberately dependency-free and deterministic: the same
 * input must produce byte-identical SVG so the scheduled workflow only commits
 * when real data changes.
 */

export const COLORS = {
  bg: '#030705',
  panel: '#071410',
  panel2: '#0a1d16',
  line: '#113a2a',
  lineSoft: '#0c271d',
  green: '#26ff9c',
  bright: '#8dffc6',
  mid: '#16c87a',
  dim: '#0d6b45',
  text: '#c8ffe3',
  textDim: '#6fbf97',
  warn: '#ffd166',
};

export const MONO_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace';

/** Escape text before it enters XML. Track names, logins and languages are untrusted. */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function truncateText(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return Math.round(number).toLocaleString('en-US');
}

/** Deterministic PRNG so the rain asset does not churn on every build. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wrap body content in a complete, self-contained SVG document.
 * The common defs cover the scanline texture and the neon glow filter, both of
 * which are reused by every card.
 */
export function svgDocument({ width, height, title, desc, body, extraDefs = '', extraStyles = '' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">
  <title id="t">${escapeXml(title)}</title>
  <desc id="d">${escapeXml(desc)}</desc>
  <defs>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="${COLORS.green}" opacity="0.05" />
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#0a2417" />
      <stop offset="70%" stop-color="${COLORS.bg}" />
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <style>
      .mono { font-family: ${MONO_STACK}; }
      .hdr { font-size: 12px; letter-spacing: 2.6px; fill: ${COLORS.green}; }
      .sub { font-size: 10px; letter-spacing: 1.5px; fill: ${COLORS.textDim}; }
      .big { font-size: 40px; font-weight: 700; fill: ${COLORS.bright}; font-variant-numeric: tabular-nums; }
      .label { font-size: 10px; letter-spacing: 2px; fill: ${COLORS.textDim}; }
      .value { font-size: 13px; fill: ${COLORS.text}; }
      .muted { fill: ${COLORS.textDim}; }
      ${extraStyles}
    </style>
    ${extraDefs}
  </defs>
  <rect width="${width}" height="${height}" rx="6" fill="url(#vignette)" />
  <rect width="${width}" height="${height}" rx="6" fill="url(#scan)" />
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="none" stroke="${COLORS.line}" />
  ${body}
</svg>
`;
}

/** The small "MATRIX//…" chrome strip used at the top of every card. */
export function cardHeader({ width, label, right = '', y = 30, pad = 28 }) {
  return [
    `<circle cx="${pad + 3}" cy="${y - 4}" r="3" fill="${COLORS.dim}" />`,
    `<circle cx="${pad + 14}" cy="${y - 4}" r="3" fill="${COLORS.dim}" opacity="0.7" />`,
    `<circle cx="${pad + 25}" cy="${y - 4}" r="3" fill="${COLORS.dim}" opacity="0.4" />`,
    `<text x="${pad + 42}" y="${y}" class="mono hdr">${escapeXml(label)}</text>`,
    right ? `<text x="${width - pad}" y="${y}" class="mono sub" text-anchor="end">${escapeXml(right)}</text>` : '',
    `<line x1="${pad}" y1="${y + 10}" x2="${width - pad}" y2="${y + 10}" stroke="${COLORS.lineSoft}" />`,
  ]
    .filter(Boolean)
    .join('\n  ');
}

export function emptyCard({ width, height, label, message, hint }) {
  return svgDocument({
    width,
    height,
    title: `Matrix profile · ${label}`,
    desc: message,
    body: `
  ${cardHeader({ width, label, right: 'NO SIGNAL' })}
  <text x="${width / 2}" y="${height / 2 - 6}" text-anchor="middle" class="mono" font-size="18" fill="${COLORS.textDim}" letter-spacing="2">${escapeXml(message)}</text>
  <text x="${width / 2}" y="${height / 2 + 22}" text-anchor="middle" class="mono sub">${escapeXml(hint || '')}</text>`,
  });
}
