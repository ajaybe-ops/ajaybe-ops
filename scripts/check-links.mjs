#!/usr/bin/env node
/**
 * Link checker for the README and docs.
 *
 *   node scripts/check-links.mjs            # local files and anchors only
 *   node scripts/check-links.mjs --external # also fetch http(s) URLs
 *
 * External checks are opt-in because CI should not fail when GitHub or Spotify
 * rate-limits a runner. 403/429 responses are reported as warnings, not errors:
 * bot protection is not a broken link.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const checkExternal = args.has('--external');
const TIMEOUT_MS = 8_000;

const MARKDOWN_FILES = collectMarkdown(ROOT);
const failures = [];
const warnings = [];
let checkedLocal = 0;
let checkedExternal = 0;

for (const file of MARKDOWN_FILES) {
  const text = readFileSync(file, 'utf8');
  const links = extractLinks(text);
  for (const link of links) {
    await checkLink(file, link);
  }
}

if (failures.length > 0) {
  console.error('\nBroken links:\n');
  for (const failure of failures) console.error(`  ✖ ${failure}`);
  console.error(`\n${failures.length} failure(s), ${warnings.length} warning(s)`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`  ! ${warning}`);
console.log(`\n✔ ${checkedLocal} local link(s) checked${checkExternal ? `, ${checkedExternal} external URL(s)` : ''}`);
if (!checkExternal) console.log('  (pass --external to fetch http(s) links)');

/* ------------------------------------------------------------------ walking */

function collectMarkdown(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (['.git', 'node_modules', 'tmp', 'tmp-assets', '.vercel', '_site'].includes(entry)) continue;
    const path = join(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) collectMarkdown(path, files);
    else if (extname(entry) === '.md') files.push(path);
  }
  return files;
}

function extractLinks(text) {
  const links = [];
  const markdown = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const html = /(?:href|src)="([^"]+)"/g;

  for (const match of text.matchAll(markdown)) links.push(match[1]);
  for (const match of text.matchAll(html)) links.push(match[1]);

  return [...new Set(links)];
}

/* ------------------------------------------------------------------ checking */

async function checkLink(file, rawTarget) {
  const target = rawTarget.replaceAll('&amp;', '&').trim();
  if (!target) return;
  if (/^(#|mailto:|tel:|javascript:|data:)/i.test(target)) return;
  if (target.includes('__USERNAME__') || target.includes('__SPOTIFY_BADGE__')) {
    warnings.push(`${rel(file)}: unconfigured placeholder ${target}`);
    return;
  }

  if (/^(https?:)?\/\//i.test(target)) {
    if (!checkExternal) return;
    checkedExternal += 1;
    await checkUrl(file, target);
    return;
  }

  const withoutFragment = target.replace(/[?#].*$/, '');
  if (!withoutFragment) return;

  checkedLocal += 1;
  const decoded = safeDecode(withoutFragment);
  const path = decoded.startsWith('/')
    ? resolve(ROOT, decoded.slice(1))
    : resolve(dirname(file), decoded);

  if (!existsSync(path)) {
    failures.push(`${rel(file)}: missing local target ${target}`);
    return;
  }

  const info = statSync(path);
  if (info.isDirectory() && !existsSync(join(path, 'README.md')) && !existsSync(join(path, 'index.html'))) {
    warnings.push(`${rel(file)}: directory link ${target} has no README.md or index.html`);
  }
}

async function checkUrl(file, rawUrl) {
  const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    failures.push(`${rel(file)}: invalid URL ${rawUrl}`);
    return;
  }

  const attempt = async (method) => {
    const response = await fetch(parsed, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': 'matrix-profile-link-check (+https://github.com)',
        accept: 'text/html,application/xhtml+xml,image/svg+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response;
  };

  try {
    let response = await attempt('HEAD');
    if ([403, 405, 429].includes(response.status)) {
      response = await attempt('GET');
    }

    if (response.status >= 400) {
      if ([403, 429].includes(response.status)) {
        warnings.push(`${rel(file)}: ${url} returned ${response.status} (bot protection?)`);
      } else {
        failures.push(`${rel(file)}: ${url} returned HTTP ${response.status}`);
      }
    }
  } catch (error) {
    warnings.push(`${rel(file)}: ${url} could not be reached (${error.name})`);
  }
}

/* -------------------------------------------------------------------- helpers */

function rel(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
