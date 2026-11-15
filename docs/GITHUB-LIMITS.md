# GitHub limits (and how this project respects them)

A profile that looks magical usually depends on a platform behaving in a way it
does not. This file records the constraints that shaped the build, so future
edits do not accidentally promise something GitHub cannot deliver.

- [README rendering](#readme-rendering)
- [Images, SVG and caching](#images-svg-and-caching)
- [GitHub Pages](#github-pages)
- [GitHub Actions](#github-actions)
- [Issues as a game protocol](#issues-as-a-game-protocol)
- [Spotify Web API](#spotify-web-api)
- [Vercel free tier](#vercel-free-tier)
- [Deliberate non-features](#deliberate-non-features)

---

## README rendering

| constraint | consequence | what this repo does |
| :--- | :--- | :--- |
| No JavaScript executes in a README | no playable game, no live clock, no fetch | games live on Pages; the README links to them and says so |
| HTML is sanitised | `<script>`, inline event handlers and most styling are removed | only `<div align="center">`, `<img>`, `<a>`, `<sub>`, `<br>` and Markdown |
| No `<style>`/external CSS | animation must live inside the image | CSS keyframes inside the SVG document |
| No iframes/embeds | Spotify cannot be embedded as a player widget | a server-rendered now-playing image; the link opens Spotify |
| No forms or inputs | no in-README interaction | the Issue comment is the input surface |
| Markdown is rendered once per page load | state cannot persist in the README | state lives in Pages `localStorage` or in committed JSON |

Practical rule: if a feature needs JavaScript, it cannot be a README feature.
Everything interactive is behind an explicit link.

---

## Images, SVG and caching

GitHub renders README images through its Camo proxy and caches them.

- **SVG is treated as an image.** Scripts are disabled, and external resources
  (fonts, images, stylesheets) are not fetched by the browser in that context.
  This is why the Spotify function inlines album art as a data URI instead of
  linking `i.scdn.co`.
- **CSS animations generally work** inside `<img>` SVG in current browsers.
  SMIL also works but is deprecated in some engines; this project uses CSS only.
  Readers with reduced-motion settings may see a static frame — every animation
  has a readable base state.
- **Caching is real.** A freshly committed `assets/metrics.svg` can show the old
  numbers for minutes. Cache-busting query strings work but cause a permanent
  cache miss for every refresh; the six-hour schedule is chosen to make that
  unnecessary.
- **Relative paths** resolve against the repository's default branch. If Pages
  serves an old build, the README image can be newer than the arcade; they are
  deployed by different workflows.
- **Image size matters.** The rain strip is deliberately capped; the
  contribution grid avoids per-cell `<title>` elements for the same reason.
  `check-assets.mjs` fails anything over 400 KB.

The generated cards are self-contained SVG with no external fonts, so they look
the same on Windows, macOS, Linux, iOS and Android.

---

## GitHub Pages

| constraint | consequence | handling |
| :--- | :--- | :--- |
| Static only | no server-side chess bot, no database | bot runs in Actions; Pages is pure files |
| Public repo on the free plan | Pages is not available for private repos on Free | documented in Setup |
| One deployed directory | the arcade's `../../../lib/chess.js` import must keep its depth | `pages.yml` stages `arcade/` and `lib/chess.js` together |
| Source must be "GitHub Actions" | a branch-based Pages setup will not see the artifact | documented, and the workflow uses the official actions |
| No custom response headers | cannot set CSP/HSTS at the host level | the arcade uses no third-party resources; the SVG function sets its own headers |
| No server redirects | `/` cannot redirect at the edge | `site/index.html` uses a meta refresh plus a real link |
| Case-sensitive paths on Linux | `Chess.js` ≠ `chess.js` | all imports are lowercase and verified by CI |
| Soft limits | ~1 GB site, ~100 GB/month bandwidth, limited builds/hour | the whole arcade is well under 1 MB |

The arcade has no build step. If you change a file, Pages deploys the file. There
is no generated bundle to drift from the source.

---

## GitHub Actions

| constraint | consequence | handling |
| :--- | :--- | :--- |
| Scheduled workflows are disabled after ~60 days without repository activity | stats can silently stop refreshing | documented; a manual run or any push re-enables the schedule |
| `GITHUB_TOKEN` pushes do not trigger other workflows | the stats commit will not recursively deploy Pages | intentional; no loop |
| Default token permissions may be read-only | the chess bot cannot commit or comment | workflow declares `contents: write` and `issues: write`; org policy must allow it |
| Secrets are unavailable to fork PRs | a forked PR cannot run the Spotify badge | expected; the badge is deployed separately |
| Six-hour maximum job, limited concurrency | long searches or floods can queue | timeouts are 5–10 minutes; per-issue concurrency |
| Actions minutes are metered on private repos | spam comments cost minutes | comment cap, loop guard, documented mitigation |
| Event payloads can be re-delivered | duplicate replies | per-issue concurrency plus SHA conflict detection |

The chess bot does not depend on a checked-out working tree for state; it reads
and writes through the REST contents API. The checkout exists only to run the
script.

---

## Issues as a game protocol

- **Comments are public and permanent-ish.** Every move is visible. Editing or
  deleting a comment does not undo a committed move; the JSON is the source of
  truth. Use `/new` to restart.
- **Only `created` comments are handled.** Editing a typo will not re-trigger the
  bot; post the corrected move.
- **Closing an issue does not stop the bot.** `issue_comment` can fire on a
  closed issue. If you want a hard stop, add a `state == open` check in the
  workflow or the handler.
- **Transfers and renames** can break links but not the game file; the file is
  keyed by issue number inside the repository.
- **Comment size** is capped at 400 characters by the bot, independently of
  GitHub's much larger limit. This keeps parsing and abuse bounded.
- **Latency is normal.** A comment is not a websocket message. Cold runners can
  take a minute; the README sets that expectation.
- **No clocks.** Chess clocks need a scheduler and a notion of whose time is
  running; this protocol deliberately has none.

These are protocol choices, not platform bugs. The alternative — a hosted server
with websockets — would contradict the "no server to operate" design.

---

## Spotify Web API

- **OAuth is required.** There is no anonymous "now playing" endpoint. The
  project uses the authorization-code flow once, then refresh tokens.
- **Scopes are read-only.** `user-read-currently-playing` and
  `user-read-playback-state`. Controlling playback would need additional scopes
  and a Premium account; the badge does not do that.
- **204 means nothing is playing.** That is a normal state, not an error.
- **Development mode** allows a small number of users; your own account is
  enough. A public multi-user app would need Spotify's review process.
- **Rate limits** exist and are not a guarantee. The function caches tokens and
  artwork, serves cached responses, and treats 429 as an honest error rather
  than retrying in a loop.
- **Artwork URLs** are remote and can change. They are downloaded and inlined per
  request/instance; nothing is stored permanently in the repository.
- **Track metadata is untrusted.** It is escaped before entering the SVG.
- **Terms** — if you fork this, follow Spotify's developer terms for branding,
  caching and user data. This project reads only the owner's own playback.

The badge is "recently playing", not a real-time event stream. A 60-second edge
cache is a deliberate trade-off.

---

## Vercel free tier

The Hobby plan is enough for one low-traffic function. Limits change; check the
current plan before relying on a number.

- Serverless functions have a maximum duration; this one declares 10 seconds and
  normally finishes in well under one.
- Environment variables are encrypted at rest but readable by project admins.
- A cold start adds latency to the first request after idle.
- Free-tier bandwidth and invocation quotas are suitable for a README badge, not
  for a public API. The function is stateless and cache-friendly for that reason.
- The deployment is separate from Pages. A Vercel outage does not take down the
  arcade, and a Pages outage does not take down the badge.

The function is portable: any Node host with `(req, res)` and `fetch` works.

---

## Deliberate non-features

These are often requested in profile projects. They are omitted on purpose:

| idea | why not |
| :--- | :--- |
| Playable games inside the README | GitHub does not execute JavaScript there; any "playable" GIF is a lie |
| A fake terminal that types but does nothing | dishonest and quickly boring; The Terminal is a real game with state |
| Scraping the GitHub contributions HTML | brittle, rate-limited and unnecessary; GraphQL gives structured data with a token |
| A third-party stats image service | adds an external dependency and a privacy leak; this repo renders its own SVG |
| A websocket chess server | operational cost and a database, for a game that fits in a JSON file |
| Auto-playing music | browsers block it and Spotify's API needs user authorization; the badge is read-only |
| Client-side Spotify tokens | a refresh token in a README or browser is a credential leak |
| Real-time stats | GitHub's API and image caches make "real-time" a fiction; six hours is honest |

If a future feature needs one of these, it needs a new document explaining the
trade-off — not a quiet exception.
