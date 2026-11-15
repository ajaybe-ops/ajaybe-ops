#!/usr/bin/env node
/**
 * One-time (and safely repeatable) personalisation.
 *
 *   npm run configure -- --username your-handle
 *   npm run configure -- --username your-handle --tagline "what you build"
 *   npm run configure -- --username your-handle --now-playing-url https://app.vercel.app
 *
 * Replaces the documented placeholders in text files, then regenerates the
 * banner/terminal SVG so the name is never baked in as a placeholder. Existing
 * Spotify badge URLs are replaced too, which makes the command safe to run
 * again after deploying Vercel.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_TAGLINE } from './generate-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXTENSIONS = new Set(['.md', '.html', '.json', '.yml', '.yaml', '.mjs', '.js', '.svg', '.example', '']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', '.vercel', 'tmp-assets']);
const SKIP_FILES = new Set([
  'configure.mjs',
  // These scripts intentionally contain the placeholder strings they look for.
  'check-assets.mjs',
  'check-links.mjs',
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--username') options.username = argv[++index];
    else if (arg === '--tagline') options.tagline = argv[++index];
    else if (arg === '--now-playing-url') options.nowPlayingUrl = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

function usage() {
  console.log(`Configure the profile placeholders.

Usage:
  node scripts/configure.mjs --username YOUR_HANDLE [--tagline TEXT]
                             [--now-playing-url https://your-app.vercel.app]
                             [--dry-run]

Placeholders:
  __USERNAME__       every link, badge and terminal prompt
  __TAGLINE__        the line under the hero name
  __SPOTIFY_BADGE__  static idle badge, or the live Vercel endpoint
`);
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(path, files);
      continue;
    }
    if (SKIP_FILES.has(entry)) continue;
    if (TEXT_EXTENSIONS.has(extname(entry))) files.push(path);
  }
  return files;
}

function normalizeUrl(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The now-playing URL must be http(s).');
  }
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/api\/now-playing$/, '');
  return `${url.origin}${path}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const root = resolve(options.root || ROOT);
  const username = String(options.username || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) {
    console.error('Pass a valid GitHub handle: --username your-handle');
    usage();
    process.exit(1);
  }

  const tagline = String(options.tagline || DEFAULT_TAGLINE).trim();
  if (tagline.length > 62) {
    console.error('Keep the tagline under 62 characters so the banner does not truncate it.');
    process.exit(1);
  }

  let badge = 'assets/spotify-badge.svg';
  if (options.nowPlayingUrl) {
    try {
      badge = `${normalizeUrl(options.nowPlayingUrl)}/api/now-playing`;
    } catch (error) {
      console.error(`Invalid --now-playing-url: ${error.message}`);
      process.exit(1);
    }
  }

  const files = walk(root, []);
  let changed = 0;
  const summary = [];

  for (const path of files) {
    const before = readFileSync(path, 'utf8');
    let after = before;

    after = replaceAll(after, '__USERNAME__', username);
    after = replaceAll(after, '__TAGLINE__', tagline);
    after = replaceAll(after, '__SPOTIFY_BADGE__', badge);

    if (options.nowPlayingUrl) {
      // Second-run support: the placeholder is gone, but the badge is still
      // identifiable by its alt text. Never touch any other image.
      after = after.replace(/(<img src=")[^"]+(" alt="Spotify[^"]*")/g, `$1${badge}$2`);
    }

    if (after !== before) {
      changed += 1;
      summary.push(path.replace(`${root}\\`, '').replace(`${root}/`, ''));
      if (!options.dryRun) writeFileSync(path, after);
    }
  }

  if (!options.dryRun) {
    execFileSync(process.execPath, [join(root, 'scripts', 'generate-assets.mjs'), '--username', username, '--tagline', tagline], {
      stdio: 'inherit',
      cwd: root,
    });
  }

  console.log(`\n${options.dryRun ? 'would update' : 'updated'} ${changed} file(s) for @${username}`);
  if (summary.length > 0) {
    for (const file of summary) console.log(`  · ${file}`);
  } else {
    console.log('  (no placeholders left — files were already configured)');
  }
  console.log(`Spotify badge: ${badge}`);

  if (!options.dryRun) {
    console.log(`
Next:
  1. Enable Settings → Pages → Source: GitHub Actions, then run "Deploy arcade".
  2. Add PROFILE_TOKEN (PAT with read:user) and run "Refresh profile assets".
  3. Deploy api/ to Vercel and re-run with --now-playing-url to go live.
  4. Read docs/SETUP.md for the full checklist.
`);
  }
}

function replaceAll(text, token, value) {
  return text.split(token).join(value);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
