import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeReport,
  renderContributions,
  renderLanguages,
  renderMetrics,
  toWeeks,
} from '../scripts/github-assets.mjs';
import { buildBanner, buildRain, buildTerminalCard } from '../scripts/generate-assets.mjs';
import { escapeXml, mulberry32 } from '../scripts/lib/svg.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/github.json', import.meta.url), 'utf8'));
const generatedAt = '2026-11-14';

/* ------------------------------------------------------------------ helpers */

test('escapeXml neutralises markup from the API', () => {
  assert.equal(escapeXml('<script>&"\''), '&lt;script&gt;&amp;&quot;&apos;');
  assert.equal(escapeXml(null), '');
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  const first = [a(), a()];
  assert.equal(b(), first[0]);
  assert.equal(b(), first[1]);
});

/* -------------------------------------------------------------- normalization */

test('normalizeReport accepts API-shaped and fixture-shaped input', () => {
  const report = normalizeReport(fixture);
  assert.equal(report.login, 'octocat');
  assert.equal(report.user.publicRepos, 10);
  assert.equal(report.user.followers, 1432);
  assert.equal(report.repos.length, 10);
  assert.equal(report.contributions.days.length, 365);
  assert.ok(report.contributions.total > 0);

  const apiShaped = normalizeReport({
    user: { public_repos: 2, followers: 3, created_at: '2020-02-02T00:00:00Z' },
    repos: [{ name: 'a', stargazers_count: 4, language: 'Go', fork: false }],
    contributions: { total: 9, weeks: [[{ date: '2026-01-01', count: 9 }]] },
  });
  assert.equal(apiShaped.user.publicRepos, 2);
  assert.equal(apiShaped.repos[0].stars, 4);
  assert.equal(apiShaped.contributions.total, 9);
  assert.equal(apiShaped.contributions.weeks.length, 1);
});

test('normalizeReport rejects nothing but tolerates missing pieces', () => {
  assert.equal(normalizeReport(null), null);
  const bare = normalizeReport({ login: 'solo' });
  assert.equal(bare.user, null);
  assert.deepEqual(bare.repos, []);
  assert.equal(bare.contributions, null);
});

/* ------------------------------------------------------------- contributions */

test('toWeeks aligns the first day to its weekday and pads the tail', () => {
  // 2026-11-08 is a Sunday.
  const days = [];
  for (let index = 0; index < 10; index += 1) {
    const date = new Date(Date.UTC(2026, 10, 8 + index));
    days.push({ date: date.toISOString().slice(0, 10), count: index });
  }
  const weeks = toWeeks(days.reverse());
  assert.equal(weeks[0].length, 7);
  assert.equal(weeks[0][0].date, '2026-11-08');
  assert.equal(weeks[1][2].date, '2026-11-17');
  assert.equal(weeks[1][6], null);
  assert.deepEqual(toWeeks([]), []);
});

test('contribution card renders one group per week and an honest total', () => {
  const report = normalizeReport(fixture);
  const svg = renderContributions(report.contributions, { generatedAt });

  const weeks = (svg.match(/class="wk"/g) || []).length;
  assert.equal(weeks, toWeeks(report.contributions.days).length);
  assert.equal(weeks, 53);
  assert.match(svg, /1,760 CONTRIBUTIONS/);
  assert.match(svg, /UPDATED 2026-11-14/);
  assert.match(svg, /SOURCE: GITHUB CONTRIBUTION CALENDAR/);
  assert.match(svg, /<rect[^>]+fill="#0a1c13"/); // zero-day level
  assert.match(svg, /<rect[^>]+fill="#26ff9c"/); // peak level
  assert.doesNotMatch(svg, /undefined|NaN/);
  assert.equal(renderContributions(report.contributions, { generatedAt }), svg, 'deterministic output');
});

test('a missing contribution feed does not pretend to have data', () => {
  const svg = renderContributions(null, { generatedAt });
  assert.match(svg, /NO CONTRIBUTION FEED/);
  assert.match(svg, /PROFILE_TOKEN/);
});

/* ------------------------------------------------------------------ metrics */

test('metrics exclude forks from stars and label missing contributions', () => {
  const report = normalizeReport(fixture);
  const svg = renderMetrics(report, { generatedAt });

  assert.match(svg, />877</); // 9000-star fork is excluded
  assert.doesNotMatch(svg, />9,877</);
  assert.match(svg, />10</);
  assert.match(svg, />1,432</);
  assert.match(svg, />1,760</);
  assert.match(svg, /@octocat/);
  assert.match(svg, /MEMBER SINCE 2011/);

  const withoutToken = renderMetrics(
    normalizeReport({ ...fixture, contributions: null }),
    { generatedAt },
  );
  assert.match(withoutToken, />N\/A</);
  assert.match(withoutToken, /needs PROFILE_TOKEN/);
});

test('metrics without a user fail loudly but stay valid SVG', () => {
  const svg = renderMetrics(null, { generatedAt });
  assert.match(svg, /GITHUB API UNAVAILABLE/);
  assert.match(svg, /<svg[^>]+width="880"/);
});

/* ---------------------------------------------------------------- languages */

test('language mix counts repositories, ignores forks and rounds honestly', () => {
  const report = normalizeReport(fixture);
  const svg = renderLanguages(report, { generatedAt });

  assert.match(svg, /JavaScript/);
  assert.match(svg, /TypeScript/);
  assert.match(svg, /Rust/);
  assert.doesNotMatch(svg, />Go</); // only appears in a fork
  assert.match(svg, /9 REPOS/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('languages collapse the long tail into Other', () => {
  const repos = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((language, index) => ({
    name: `repo-${index}`,
    stars: 0,
    language,
    fork: false,
  }));
  const svg = renderLanguages(normalizeReport({ login: 'x', user: { public_repos: 7 }, repos }));
  assert.match(svg, /Other \(2\)/);
});

test('hostile language names are escaped', () => {
  const svg = renderLanguages(
    normalizeReport({
      login: '<img>',
      user: { public_repos: 1 },
      repos: [{ name: 'x', stars: 0, language: '<script>', fork: false }],
    }),
  );
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

/* ----------------------------------------------------------- static assets */

test('banner includes the handle, escapes it, and stays 1200×320', () => {
  const svg = buildBanner({ username: 'neo', tagline: 'the one' });
  assert.match(svg, /neo/);
  assert.match(svg, /the one/);
  assert.match(svg, /width="1200" height="320"/);
  assert.match(svg, /@keyframes blink/);
  assert.match(svg, /prefers-reduced-motion/);

  const hostile = buildBanner({ username: '<x>' });
  assert.doesNotMatch(hostile, /<x>/);
  assert.match(hostile, /&lt;x&gt;/);
});

test('rain strip is deterministic and bounded for long handles', () => {
  const first = buildRain({ seed: 42 });
  const second = buildRain({ seed: 42 });
  assert.equal(first, second);
  assert.match(first, /width="1200" height="160"/);
  assert.match(first, /@keyframes fall/);
  assert.ok(first.length < 120_000, `rain asset is ${first.length} bytes`);

  const longName = buildBanner({ username: 'a'.repeat(40) });
  assert.match(longName, /a{21}…/); // truncated, not overflowing
});

test('terminal card prints every line and has a no-motion fallback', () => {
  const svg = buildTerminalCard({ username: 'neo' });
  assert.match(svg, /\$ cat about\.md/);
  assert.match(svg, /\$ ls now/);
  assert.match(svg, /shipping in public/);
  assert.match(svg, /MATRIX\/\/ABOUT/);
  assert.match(svg, /prefers-reduced-motion/);
});
