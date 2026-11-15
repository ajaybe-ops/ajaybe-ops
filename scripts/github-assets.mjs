#!/usr/bin/env node
/**
 * Build live GitHub assets for the profile README:
 *
 *   assets/metrics.svg        repositories, stars, followers, contributions
 *   assets/languages.svg      primary-language mix of public repositories
 *   assets/contributions.svg  the last year of contributions as a heat grid
 *
 * Data comes from the public REST API plus, when a token with `read:user` is
 * available, the GraphQL contribution calendar. Nothing is invented: when the
 * API cannot be reached the renderers produce an honest "no signal" card.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_LOGIN=you node scripts/github-assets.mjs
 *   node scripts/github-assets.mjs --login you --fixture tests/fixtures/github.json
 *   node scripts/github-assets.mjs --out assets --strict
 *
 * Renderers are exported so tests can exercise them without a network.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLORS,
  cardHeader,
  emptyCard,
  escapeXml,
  formatNumber,
  svgDocument,
  truncateText,
} from './lib/svg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'matrix-profile-assets (+https://github.com)';
const MAX_REPO_PAGES = 3;

const LANGUAGE_PALETTE = ['#26ff9c', '#16c87a', '#0fa968', '#7fdc9a', '#2dd4bf', '#0d6b45'];
const LEVELS = ['#0a1c13', '#0d3a22', '#126b38', '#18a858', '#26ff9c'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* -------------------------------------------------------------- contributions */

/** Flatten `{date,count}` days into aligned weeks (Sunday-first columns). */
export function toWeeks(days) {
  if (!Array.isArray(days) || days.length === 0) return [];
  const sorted = [...days]
    .filter((day) => day && typeof day.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const weeks = [];
  let current = [];
  const leading = new Date(`${sorted[0].date}T00:00:00Z`).getUTCDay();
  for (let pad = 0; pad < leading; pad += 1) current.push(null);

  for (const day of sorted) {
    current.push({ date: day.date, count: clamp(number(day.count, 0), 0, 100_000) });
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }
  return weeks;
}

export function renderContributions(contributions, { generatedAt = todayIso() } = {}) {
  const width = 880;
  const height = 250;

  const days = contributions?.days || [];
  const weeks = contributions?.weeks?.length ? contributions.weeks : toWeeks(days);
  if (weeks.length === 0) {
    return emptyCard({
      width,
      height: 200,
      label: '$ contributions --last-year',
      message: 'NO CONTRIBUTION FEED',
      hint: 'Add a PROFILE_TOKEN with read:user so the GraphQL calendar can be read.',
    });
  }

  const flat = weeks.flat().filter(Boolean);
  const total = Number.isFinite(Number(contributions?.total))
    ? Number(contributions.total)
    : flat.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...flat.map((day) => day.count));
  const level = (count) => {
    if (!count) return 0;
    if (count >= max * 0.66) return 4;
    if (count >= max * 0.33) return 3;
    if (count >= max * 0.12) return 2;
    return 1;
  };

  const cell = 11;
  const step = 14;
  const left = 70;
  const top = 76;

  const monthLabels = [];
  let lastMonth = -1;
  let lastLabelWeek = -10;
  weeks.forEach((week, index) => {
    const first = week.find(Boolean);
    if (!first) return;
    const date = new Date(`${first.date}T00:00:00Z`);
    const month = date.getUTCMonth();
    if (month !== lastMonth && index - lastLabelWeek >= 3) {
      monthLabels.push(
        `<text x="${left + index * step}" y="${top - 12}" class="mono" font-size="9" letter-spacing="1.2" fill="${COLORS.textDim}">${MONTHS[month]}</text>`,
      );
      lastMonth = month;
      lastLabelWeek = index;
    }
  });

  const columns = weeks
    .map((week, weekIndex) => {
      const cells = week
        .map((day, dayIndex) => {
          const count = day?.count || 0;
          const fill = day ? LEVELS[level(count)] : 'transparent';
          return `<rect x="${left + weekIndex * step}" y="${top + dayIndex * step}" width="${cell}" height="${cell}" rx="2" fill="${fill}" />`;
        })
        .join('');
      return `<g class="wk" style="animation-delay:${(weekIndex * 12).toFixed(0)}ms">${cells}</g>`;
    })
    .join('\n    ');

  const dayLabels = [
    [1, 'MON'],
    [3, 'WED'],
    [5, 'FRI'],
  ]
    .map(
      ([row, label]) =>
        `<text x="${left - 8}" y="${top + row * step + 9}" class="mono" font-size="9" fill="${COLORS.textDim}" text-anchor="end">${label}</text>`,
    )
    .join('');

  const legendX = width - 28 - 5 * (cell + 3) - 38;
  const legend = `
    <text x="${legendX - 8}" y="${height - 34}" class="mono" font-size="9" fill="${COLORS.textDim}" text-anchor="end">LESS</text>
    ${LEVELS.map(
      (fill, index) =>
        `<rect x="${legendX + index * (cell + 3)}" y="${height - 43}" width="${cell}" height="${cell}" rx="2" fill="${fill}" />`,
    ).join('')}
    <text x="${legendX + 5 * (cell + 3) + 4}" y="${height - 34}" class="mono" font-size="9" fill="${COLORS.textDim}">MORE</text>`;

  const body = `
  ${cardHeader({
    width,
    label: '$ contributions --last-year',
    right: `${formatNumber(total)} CONTRIBUTIONS`,
  })}
  ${monthLabels.join('')}
  ${dayLabels}
  <g>
    ${columns}
  </g>
  <text x="28" y="${height - 34}" class="mono" font-size="9" letter-spacing="1.4" fill="${COLORS.textDim}">SOURCE: GITHUB CONTRIBUTION CALENDAR · UPDATED ${escapeXml(generatedAt)}</text>
  ${legend}`;

  return svgDocument({
    width,
    height,
    title: 'Contribution activity, last year',
    desc: `${formatNumber(total)} contributions in the last year, rendered as a green heat grid.`,
    extraStyles: `
      .wk { animation: fade .45s ease-out; }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { .wk { animation: none; } }`,
    body,
  });
}

/* -------------------------------------------------------------------- metrics */

export function renderMetrics(report, { generatedAt = todayIso() } = {}) {
  const width = 880;
  const height = 230;
  const user = report?.user;

  if (!user) {
    return emptyCard({
      width,
      height: 180,
      label: '$ stats --live',
      message: 'GITHUB API UNAVAILABLE',
      hint: 'The scheduled workflow retries every six hours; last good data is kept until then.',
    });
  }

  const repos = Array.isArray(report.repos) ? report.repos.filter((repo) => !repo.fork) : [];
  const stars = repos.reduce((sum, repo) => sum + number(repo.stars, 0), 0);
  const publicRepos = number(user.publicRepos, repos.length);
  const followers = number(user.followers, 0);
  const contributions = report.contributions?.total;

  const tiles = [
    { label: 'REPOSITORIES', value: formatNumber(publicRepos), note: 'public repositories' },
    { label: 'STARS EARNED', value: formatNumber(stars), note: 'across public repos' },
    { label: 'FOLLOWERS', value: formatNumber(followers), note: 'watching the signal' },
    {
      label: 'CONTRIBUTIONS',
      value: Number.isFinite(Number(contributions)) ? formatNumber(contributions) : 'N/A',
      note: Number.isFinite(Number(contributions)) ? 'last 365 days' : 'needs PROFILE_TOKEN',
    },
  ];

  const pad = 28;
  const gap = 16;
  const tileWidth = (width - pad * 2 - gap * 3) / 4;
  const tileTop = 74;
  const tileHeight = 118;

  const tileMarkup = tiles
    .map((tile, index) => {
      const x = pad + index * (tileWidth + gap);
      return `<g>
    <rect x="${x.toFixed(1)}" y="${tileTop}" width="${tileWidth.toFixed(1)}" height="${tileHeight}" rx="4" fill="${COLORS.panel}" stroke="${COLORS.lineSoft}" />
    <rect x="${x.toFixed(1)}" y="${tileTop}" width="2" height="${tileHeight}" fill="${COLORS.dim}" />
    <text x="${(x + 16).toFixed(1)}" y="${tileTop + 26}" class="mono label">${tile.label}</text>
    <text x="${(x + 16).toFixed(1)}" y="${tileTop + 74}" class="mono big" filter="url(#glow)">${tile.value}</text>
    <text x="${(x + 16).toFixed(1)}" y="${tileTop + 100}" class="mono" font-size="9" letter-spacing="1" fill="${COLORS.textDim}">${escapeXml(tile.note)}</text>
  </g>`;
    })
    .join('\n  ');

  const memberSince = user.createdAt ? `MEMBER SINCE ${String(user.createdAt).slice(0, 4)}` : 'PUBLIC PROFILE';

  const body = `
  ${cardHeader({ width, label: '$ stats --live', right: `UPDATED ${generatedAt}` })}
  ${tileMarkup}
  <text x="${pad}" y="${height - 20}" class="mono" font-size="9" letter-spacing="1.4" fill="${COLORS.textDim}">${escapeXml(memberSince)} · SOURCE: GITHUB REST API</text>
  <text x="${width - pad}" y="${height - 20}" class="mono" font-size="9" letter-spacing="1.4" fill="${COLORS.dim}" text-anchor="end">${escapeXml(`@${report.login || 'unknown'}`)}</text>`;

  return svgDocument({
    width,
    height,
    title: 'GitHub statistics',
    desc: `${publicRepos} public repositories, ${stars} stars, ${followers} followers.`,
    body,
  });
}

/* ------------------------------------------------------------------ languages */

export function renderLanguages(report, { generatedAt = todayIso() } = {}) {
  const width = 880;
  const height = 240;

  const repos = Array.isArray(report?.repos) ? report.repos.filter((repo) => !repo.fork) : [];
  const counts = new Map();
  for (const repo of repos) {
    const language = String(repo.language || '').trim();
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }

  if (counts.size === 0) {
    return emptyCard({
      width,
      height: 180,
      label: '$ languages --by-primary-repo',
      message: 'NO LANGUAGE DATA',
      hint: 'Language mix appears after the first public repository is indexed.',
    });
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const slices = [
    ...top.map(([name, count], index) => ({ name, count, fill: LANGUAGE_PALETTE[index] })),
    ...(rest.length
      ? [{ name: `Other (${rest.length})`, count: rest.reduce((sum, [, count]) => sum + count, 0), fill: '#113a2a' }]
      : []),
  ];
  const totalCount = slices.reduce((sum, slice) => sum + slice.count, 0);

  const barLeft = 28;
  const barWidth = width - 56;
  let cursor = barLeft;
  const segments = slices
    .map((slice) => {
      const widthPx = (slice.count / totalCount) * barWidth;
      const segment =
        widthPx > 0.5
          ? `<rect x="${cursor.toFixed(2)}" y="78" width="${Math.max(1, widthPx - 2).toFixed(2)}" height="16" rx="3" fill="${slice.fill}" />`
          : '';
      cursor += widthPx;
      return segment;
    })
    .join('');

  const legend = slices
    .map((slice, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 28 + column * 424;
      const y = 134 + row * 28;
      const percent = ((slice.count / totalCount) * 100).toFixed(1).replace('.0', '');
      return `<g>
      <rect x="${x}" y="${y - 9}" width="9" height="9" rx="2" fill="${slice.fill}" />
      <text x="${x + 18}" y="${y}" class="mono" font-size="12" fill="${COLORS.text}">${escapeXml(truncateText(slice.name, 22))}</text>
      <text x="${x + 386}" y="${y}" class="mono" font-size="11" fill="${COLORS.textDim}" text-anchor="end">${slice.count} · ${percent}%</text>
    </g>`;
    })
    .join('\n  ');

  const body = `
  ${cardHeader({ width, label: '$ languages --by-primary-repo', right: `UPDATED ${generatedAt}` })}
  <rect x="${barLeft}" y="78" width="${barWidth}" height="16" rx="3" fill="${COLORS.panel2}" />
  ${segments}
  ${legend}
  <text x="28" y="${height - 18}" class="mono" font-size="9" letter-spacing="1.4" fill="${COLORS.textDim}">PRIMARY LANGUAGE OF PUBLIC REPOSITORIES · FORKS EXCLUDED</text>
  <text x="${width - 28}" y="${height - 18}" class="mono" font-size="9" letter-spacing="1.4" fill="${COLORS.dim}" text-anchor="end">${repos.length} REPOS</text>`;

  return svgDocument({
    width,
    height,
    title: 'Language mix',
    desc: `Primary languages across ${repos.length} public repositories.`,
    body,
  });
}

/* ----------------------------------------------------------------------- data */

export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const user = raw.user || null;
  const repos = (Array.isArray(raw.repos) ? raw.repos : []).map((repo) => ({
    name: String(repo.name || ''),
    stars: number(repo.stars ?? repo.stargazers_count, 0),
    language: repo.language ? String(repo.language) : null,
    fork: Boolean(repo.fork),
  }));

  let contributions = null;
  const source = raw.contributions;
  if (source && (Array.isArray(source.days) || Array.isArray(source.weeks))) {
    const days = source.days
      ? source.days.map((day) => ({ date: String(day.date), count: number(day.count, 0) }))
      : [];
    const weeks = source.weeks
      ? source.weeks.map((week) =>
          week.map((day) => (day ? { date: String(day.date), count: number(day.count, 0) } : null)),
        )
      : [];
    contributions = {
      total: Number.isFinite(Number(source.total)) ? Number(source.total) : days.reduce((sum, day) => sum + day.count, 0),
      days,
      weeks,
    };
  }

  return {
    login: String(raw.login || user?.login || ''),
    user: user
      ? {
          publicRepos: number(user.publicRepos ?? user.public_repos, repos.filter((repo) => !repo.fork).length),
          followers: number(user.followers, 0),
          createdAt: user.createdAt || user.created_at || null,
        }
      : null,
    repos,
    contributions,
    generatedAt: raw.generatedAt ? String(raw.generatedAt) : todayIso(),
  };
}

async function fetchReport({ login, token }) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const request = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub REST ${path} -> HTTP ${response.status}`);
    return response.json();
  };

  const user = await request(`/users/${encodeURIComponent(login)}`);
  const repos = [];
  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const batch = await request(`/users/${encodeURIComponent(login)}/repos?per_page=100&page=${page}&type=owner&sort=updated`);
    if (!Array.isArray(batch)) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  let contributions = null;
  if (token) {
    contributions = await fetchContributions(login, token).catch((error) => {
      console.warn(`[github-assets] contribution calendar unavailable: ${error.message}`);
      return null;
    });
  }

  return normalizeReport({
    login,
    user: {
      publicRepos: user.public_repos,
      followers: user.followers,
      createdAt: user.created_at,
    },
    repos: repos.map((repo) => ({
      name: repo.name,
      stars: repo.stargazers_count,
      language: repo.language,
      fork: repo.fork,
    })),
    contributions,
    generatedAt: todayIso(),
  });
}

async function fetchContributions(login, token) {
  const query = `query($login:String!) {
    user(login:$login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
  const body = await response.json();
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(body.errors[0]?.message || 'GraphQL error');
  }
  const calendar = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error('no contribution calendar in the response');

  return {
    total: number(calendar.totalContributions, 0),
    weeks: (calendar.weeks || []).map((week) =>
      (week.contributionDays || []).map((day) => ({ date: day.date, count: number(day.contributionCount, 0) })),
    ),
  };
}

/* ------------------------------------------------------------------------ cli */

function parseArgs(argv) {
  const options = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--login') options.login = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--fixture') options.fixture = argv[++index];
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--empty') options.empty = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const login = options.login || process.env.GITHUB_LOGIN || process.env.GITHUB_REPOSITORY_OWNER || (options.fixture ? 'fixture' : null);
  const out = resolve(options.out || join(ROOT, 'assets'));

  if (!login) {
    console.error('A GitHub login is required: pass --login NAME or set GITHUB_LOGIN.');
    process.exit(1);
  }

  let report = null;
  let failure = null;

  if (options.fixture) {
    report = normalizeReport(JSON.parse(readFileSync(resolve(options.fixture), 'utf8')));
  } else if (options.empty) {
    // Seeds the repository with honest "no signal" cards before the first
    // scheduled run. Never fabricates numbers.
    report = normalizeReport({ login, user: null, repos: [], contributions: null });
  } else {
    try {
      report = await fetchReport({ login, token: process.env.GITHUB_TOKEN || process.env.PROFILE_TOKEN });
      if (!report.user) throw new Error('the user endpoint returned no profile');
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      console.warn(`[github-assets] ${failure}`);
    }
  }

  const generatedAt = report?.generatedAt || todayIso();
  const loginForRender = report?.login || login;
  const assets = {
    'metrics.svg': renderMetrics(report, { generatedAt }),
    'languages.svg': renderLanguages(report, { generatedAt }),
    'contributions.svg': renderContributions(report?.contributions, { generatedAt }),
  };

  mkdirSync(out, { recursive: true });

  let wrote = 0;
  for (const [name, contents] of Object.entries(assets)) {
    const path = join(out, name);
    // Keep the last good numbers if the network failed and an asset exists.
    if (failure && existsSync(path)) {
      console.warn(`[github-assets] keeping existing ${name}`);
      continue;
    }
    // A missing token must not erase a previously generated calendar.
    if (name === 'contributions.svg' && report && !report.contributions && !options.fixture && existsSync(path)) {
      console.warn('[github-assets] no contribution token; keeping existing contributions.svg');
      continue;
    }
    const previous = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (previous === contents) {
      console.log(`unchanged ${name}`);
      continue;
    }
    writeFileSync(path, contents);
    wrote += 1;
    console.log(`wrote ${name} (${(contents.length / 1024).toFixed(1)} KB) for @${loginForRender}`);
  }

  console.log(`[github-assets] ${wrote} file(s) updated${failure ? ' (degraded: network failure)' : ''}`);
  if (failure && options.strict) process.exit(1);
}

/* ---------------------------------------------------------------------- utils */

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
