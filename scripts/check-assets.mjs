#!/usr/bin/env node
/**
 * Structural checks for generated SVG assets. No XML parser, no dependencies:
 * enough to catch truncated files, unescaped markup and placeholder leakage in
 * CI.
 *
 *   node scripts/check-assets.mjs [dir]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || 'assets');
const files = readdirSync(dir).filter((file) => file.endsWith('.svg'));
let failures = 0;

if (files.length === 0) {
  console.error(`no SVG files in ${dir}`);
  process.exit(1);
}

for (const file of files) {
  const path = `${dir}/${file}`;
  const svg = readFileSync(path, 'utf8');
  const problems = [];

  if (!svg.startsWith('<?xml')) problems.push('missing XML declaration');
  if (!svg.trimEnd().endsWith('</svg>')) problems.push('missing closing </svg>');
  if ((svg.match(/<svg\b/g) || []).length !== 1) problems.push('expected exactly one <svg> root');
  if (/__USERNAME__|__TAGLINE__/.test(svg)) problems.push('unreplaced placeholder');
  if (/\b(undefined|NaN)\b/.test(svg)) problems.push('rendered undefined/NaN');
  if (/<script\b/i.test(svg)) problems.push('contains a script element');
  if (/ on[a-z]+=/i.test(svg)) problems.push('contains an inline event handler');
  if (svg.length > 400_000) problems.push(`unexpectedly large (${svg.length} bytes)`);

  if (problems.length > 0) {
    failures += 1;
    console.error(`✖ ${file}: ${problems.join('; ')}`);
  } else {
    console.log(`✔ ${file} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

if (failures > 0) {
  console.error(`${failures} asset(s) failed`);
  process.exit(1);
}
console.log(`${files.length} asset(s) passed`);
