#!/usr/bin/env node
/**
 * Build the static, hand-tuned SVG assets used by the profile README:
 *
 *   assets/banner.svg         hero terminal banner
 *   assets/matrix-rain.svg    animated digital rain strip
 *   assets/terminal-card.svg  short "cat about.md" panel
 *
 * The output is deterministic. Animations are CSS keyframes, which work inside
 * an <img> (the only way GitHub renders README SVG), and they are disabled for
 * readers who ask for reduced motion.
 *
 * Usage:
 *   node scripts/generate-assets.mjs [--username NAME] [--tagline TEXT] [--out DIR]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, cardHeader, escapeXml, mulberry32, svgDocument, truncateText } from './lib/svg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ｦｧｨｩｪｫｬｭｮｯｰ';

const DEFAULT_USERNAME = 'ajaybe-ops';
export const DEFAULT_TAGLINE = 'developer // building small, sharp tools in public';

/* ------------------------------------------------------------------- banner */

export function buildBanner({ username = DEFAULT_USERNAME, tagline = DEFAULT_TAGLINE } = {}) {
  const width = 1200;
  const height = 320;
  const name = truncateName(username, 22);
  const nameSize = name.length <= 12 ? 60 : name.length <= 18 ? 48 : 38;
  const nameWidth = Math.min(660, Math.max(180, Math.round(name.length * nameSize * 0.6)));
  const scene = rainColumns({ width: 380, height, x: 784, columns: 16, seed: 0x5eed, animated: false });

  const body = `
  <!-- terminal chrome -->
  <g>
    <circle cx="36" cy="34" r="4" fill="${COLORS.dim}" />
    <circle cx="50" cy="34" r="4" fill="${COLORS.dim}" opacity="0.65" />
    <circle cx="64" cy="34" r="4" fill="${COLORS.dim}" opacity="0.35" />
    <text x="88" y="38" class="mono" font-size="10" letter-spacing="3" fill="${COLORS.textDim}">MATRIX//PROFILE</text>
    <text x="${width - 36}" y="38" class="mono" font-size="10" letter-spacing="2" fill="${COLORS.textDim}" text-anchor="end">SIGNAL: STABLE</text>
    <line x1="36" y1="56" x2="${width - 36}" y2="56" stroke="${COLORS.lineSoft}" />
  </g>

  <!-- decorative rain, kept faint so it never fights the text -->
  <g opacity="0.5">${scene}</g>
  <line x1="760" y1="80" x2="760" y2="270" stroke="${COLORS.line}" />

  <!-- hero copy -->
  <text x="64" y="118" class="mono" font-size="13" letter-spacing="2.5" fill="${COLORS.textDim}">$ whoami</text>
  <text x="62" y="188" class="mono" font-size="${nameSize}" font-weight="700" fill="${COLORS.bright}" letter-spacing="1" filter="url(#glow)">${escapeXml(name)}</text>
  <rect x="62" y="200" width="${nameWidth}" height="2" fill="${COLORS.dim}" opacity="0.6" />
  <text x="64" y="234" class="mono" font-size="16" fill="${COLORS.textDim}">${escapeXml(truncateText(tagline, 62))}</text>

  <!-- prompt with a blinking block cursor -->
  <text x="64" y="282" class="mono" font-size="15" fill="${COLORS.green}">&gt; jack in</text>
  <rect class="cursor" x="158" y="267" width="9" height="17" fill="${COLORS.green}" opacity="0.8" />
  <text x="${width - 36}" y="282" class="mono" font-size="10" letter-spacing="2" fill="${COLORS.dim}" text-anchor="end">PRESS ANY KEY</text>

  <!-- corner brackets -->
  ${cornerBrackets(width, height)}
  <rect class="sweep" x="36" y="0" width="${width - 72}" height="2" fill="${COLORS.green}" opacity="0.12" />`;

  return svgDocument({
    width,
    height,
    title: `${username} — Matrix profile`,
    desc: 'Animated terminal banner: a glowing green handle over falling digital rain.',
    extraStyles: `
      .cursor { animation: blink 1.15s steps(1) infinite; }
      .sweep { animation: sweep 9s linear infinite; }
      @keyframes blink { 0%, 55% { opacity: .85 } 56%, 100% { opacity: .08 } }
      @keyframes sweep { 0% { transform: translateY(20px) } 100% { transform: translateY(280px) } }
      @media (prefers-reduced-motion: reduce) {
        .cursor, .sweep { animation: none; }
      }`,
    body,
  });
}

/* --------------------------------------------------------------- rain strip */

export function buildRain({ seed = 0x1234, width = 1200, height = 160 } = {}) {
  const copyHeight = (Math.ceil(height / 26) + 2) * 26;
  const body = `
  <rect x="0" y="0" width="${width}" height="${height}" fill="${COLORS.bg}" opacity="0.35" />
  ${rainColumns({ width, height, x: 0, columns: Math.round(width / 28), seed, animated: true })}
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${COLORS.lineSoft}" />`;

  return svgDocument({
    width,
    height,
    title: 'Digital rain',
    desc: 'Falling green katakana and digits on black.',
    extraStyles: `
      .col { animation: fall linear infinite; opacity: .9; }
      @keyframes fall { from { transform: translateY(-${copyHeight}px) } to { transform: translateY(0) } }
      @media (prefers-reduced-motion: reduce) {
        .col { animation: none; }
      }`,
    body,
  });
}

/* ------------------------------------------------------------- terminal card */

export function buildTerminalCard({ username = DEFAULT_USERNAME } = {}) {
  const width = 900;
  const height = 300;
  const lines = [
    { prompt: '$ cat about.md', tone: 'green', delay: 0 },
    { text: 'developer. builder. occasional reverse-engineer.', tone: 'text', delay: 120 },
    { text: 'small tools, fast pages, and games that live in a browser tab.', tone: 'text', delay: 240 },
    { prompt: '$ ls now', tone: 'green', delay: 360 },
    { text: 'arcade/   chess-issues/   spotify-badge/   actions/', tone: 'dim', delay: 480 },
    { prompt: '$ ./run --next', tone: 'green', delay: 600 },
    { text: '[ok] shipping in public, one small commit at a time', tone: 'bright', delay: 720 },
  ];

  const startY = 92;
  const step = 28;
  const rows = lines
    .map((line, index) => {
      const y = startY + index * step;
      const fill =
        line.tone === 'green'
          ? COLORS.green
          : line.tone === 'bright'
            ? COLORS.bright
            : line.tone === 'dim'
              ? COLORS.textDim
              : COLORS.text;
      const text = escapeXml(line.prompt || line.text);
      return `<text class="line" x="44" y="${y}" font-size="14" fill="${fill}" style="animation-delay:${line.delay}ms">${text}</text>`;
    })
    .join('\n  ');

  const cursorY = startY + lines.length * step;
  const body = `
  ${cardHeader({ width, label: `MATRIX//ABOUT — ${truncateName(username, 18)}`, right: 'READ-ONLY' })}
  ${rows}
  <rect class="cursor" x="44" y="${cursorY - 13}" width="8" height="15" fill="${COLORS.green}" opacity="0.8" />
  <text x="${width - 28}" y="${height - 26}" class="mono sub" text-anchor="end">HINT: THE ARCADE IS REAL</text>
  ${cornerBrackets(width, height)}`;

  return svgDocument({
    width,
    height,
    title: 'About this developer',
    desc: 'A terminal window printing a short about file.',
    extraStyles: `
      .line { opacity: 1; animation: type .4s ease-out; }
      .cursor { animation: blink 1.15s steps(1) infinite; }
      @keyframes type { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
      @keyframes blink { 0%, 55% { opacity: .85 } 56%, 100% { opacity: .08 } }
      @media (prefers-reduced-motion: reduce) {
        .line, .cursor { animation: none; }
      }`,
    body,
  });
}

/* -------------------------------------------------------------------- utils */

/**
 * A column of glyphs, duplicated so the CSS loop is seamless.
 * `animated` toggles the per-column animation class and negative delays.
 */
function rainColumns({ width, height, x, columns, seed, animated }) {
  const random = mulberry32(seed);
  const columnWidth = width / columns;
  const glyphsPerCopy = Math.ceil(height / 26) + 2;
  const copyHeight = glyphsPerCopy * 26;
  const out = [];

  for (let column = 0; column < columns; column += 1) {
    const duration = 5.5 + random() * 6;
    const delay = random() * duration;
    const fontSize = 12 + Math.round(random() * 3);
    const cx = x + column * columnWidth + columnWidth / 2;
    const glyphs = [];
    for (let row = 0; row < glyphsPerCopy; row += 1) {
      // Gaps and horizontal jitter are what make this read as rain instead of
      // a green spreadsheet. Both copies share the same pattern so the loop is
      // still seamless.
      if (random() < 0.42) {
        glyphs.push('');
        continue;
      }
      const glyph = GLYPHS[Math.floor(random() * GLYPHS.length)];
      const bright = row === 0 && random() > 0.4;
      const jitter = (random() - 0.5) * 6;
      glyphs.push(
        `<text x="${(cx + jitter).toFixed(1)}" y="${(row * 26 + 18).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" fill="${bright ? COLORS.bright : COLORS.mid}" opacity="${(0.16 + random() * 0.62).toFixed(2)}">${glyph}</text>`,
      );
    }
    // Second copy directly below makes translateY(-copyHeight) seamless.
    const copy = glyphs.join('');
    out.push(
      `<g${animated ? ` class="col" style="animation-duration:${duration.toFixed(2)}s;animation-delay:-${delay.toFixed(2)}s"` : ' opacity="0.55"'}>${copy}${
        animated ? `<g transform="translate(0 ${copyHeight})">${copy}</g>` : ''
      }</g>`,
    );
  }
  return out.join('\n    ');
}

function cornerBrackets(width, height) {
  const size = 14;
  const inset = 14;
  const stroke = COLORS.dim;
  return `<g stroke="${stroke}" fill="none" stroke-width="1">
    <path d="M${inset} ${inset + size} V${inset} H${inset + size}" />
    <path d="M${width - inset - size} ${inset} H${width - inset} V${inset + size}" />
    <path d="M${inset} ${height - inset - size} V${height - inset} H${inset + size}" />
    <path d="M${width - inset - size} ${height - inset} H${width - inset} V${height - inset - size}" />
  </g>`;
}

function truncateName(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ---------------------------------------------------------------------- cli */

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--username') options.username = argv[++index];
    else if (arg === '--tagline') options.tagline = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const username = options.username || process.env.GITHUB_LOGIN || DEFAULT_USERNAME;
  const tagline = options.tagline || process.env.PROFILE_TAGLINE || DEFAULT_TAGLINE;
  const out = resolve(options.out || join(ROOT, 'assets'));

  mkdirSync(out, { recursive: true });

  const files = {
    'banner.svg': buildBanner({ username, tagline }),
    'matrix-rain.svg': buildRain(),
    'terminal-card.svg': buildTerminalCard({ username }),
  };

  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(out, name), contents);
    console.log(`wrote ${join(out, name)} (${(contents.length / 1024).toFixed(1)} KB)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
