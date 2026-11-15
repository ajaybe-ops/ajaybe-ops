# Architecture

The goal was a profile that is genuinely playable and genuinely informative
without pretending GitHub can do things it cannot. That constraint shapes every
decision below.

- [The split](#the-split)
- [Repository map](#repository-map)
- [The arcade](#the-arcade)
- [The chess engine](#the-chess-engine)
- [Async chess over Issues](#async-chess-over-issues)
- [The Spotify function](#the-spotify-function)
- [The asset pipeline](#the-asset-pipeline)
- [Testing](#testing)
- [Trade-offs](#trade-offs)

---

## The split

```text
GitHub README (static)                  GitHub Pages (runtime)
┌───────────────────────────┐           ┌───────────────────────────┐
│ Markdown + <img> SVG      │  links    │ vanilla ES modules        │
│ CSS keyframes             │ ────────► │ chess engine              │
│ no JavaScript, ever       │           │ canvas games               │
└───────────────────────────┘           └───────────────────────────┘

GitHub Issues (async)                   Vercel (one function)
┌───────────────────────────┐           ┌───────────────────────────┐
│ comment → Action → JSON   │           │ Spotify token refresh     │
│ commit → Markdown reply   │           │ SVG built per request     │
└───────────────────────────┘           └───────────────────────────┘
```

GitHub sanitises README content and does not run scripts there. Anything
interactive therefore lives on Pages, and the README is explicit about that.
The result is not a broken promise: the README is a poster with real links, and
the arcade is where the games actually execute.

---

## Repository map

```text
.
├─ README.md                     profile experience, honest limits
├─ api/
│  └─ now-playing.js             Spotify -> self-contained SVG
├─ arcade/
│  ├─ index.html                 the shell and all seven panels
│  ├─ css/arcade.css             design tokens and components
│  └─ js/
│     ├─ main.js                 boot, hash routing, rain backdrop
│     ├─ ui.js                   DOM helpers, roving focus, storage
│     ├─ games/                  pure game logic (no DOM)
│     │  ├─ chess-match.js       engine <-> view controller
│     │  ├─ snake.js
│     │  ├─ twenty48.js
│     │  ├─ minesweeper.js
│     │  ├─ tictactoe.js
│     │  └─ adventure.js
│     └─ views/                  mount functions, DOM + input
├─ assets/                       generated SVG, real screenshots
├─ chess/games/                  one JSON file per Issue game
├─ docs/                         setup, architecture, security, limits
├─ lib/chess.js                  0x88 rules + alpha-beta engine
├─ scripts/
│  ├─ chess-bot.mjs              Actions entry point
│  ├─ chess-cli.mjs              terminal opponent
│  ├─ lib/chess-issue.mjs        pure Issue protocol + replies
│  ├─ lib/github.mjs             dependency-free REST client
│  ├─ lib/svg.mjs                escaping, cards, PRNG
│  ├─ generate-assets.mjs        banner, rain, terminal card
│  ├─ github-assets.mjs          metrics, languages, contributions
│  ├─ spotify-auth.mjs           one-time OAuth helper
│  ├─ configure.mjs              placeholder replacement
│  ├─ check-assets.mjs           structural SVG checks
│  ├─ check-links.mjs            local (and optional external) links
│  └─ dev-server.mjs             zero-dependency static server
├─ site/index.html               root redirect to /arcade/
├─ tests/                        node:test suites
└─ .github/                      workflows + Issue template
```

No file under `arcade/` imports a package. The browser loads the same
`lib/chess.js` that the bot and the CLI load, so a rules change is tested once.

---

## The arcade

`arcade/index.html` contains every panel, each with a `data-view` attribute.
`main.js` owns:

- **Tab state** — ARIA tabs with a roving `tabindex`; arrow keys, Home and End
  move focus without triggering a navigation.
- **Hash routing** — `#chess`, `#snake`, `#2048`, `#mines`, `#tictactoe`,
  `#terminal`, `#about`, plus aliases (`#minesweeper`, `#ttt`, `#adventure`,
  `#now`). Unknown hashes fall back to chess.
- **Lazy mounting** — a view is created on first visit and then kept alive, so
  switching tabs does not lose a game in progress.
- **Lifecycle** — each view may return `{ show, hide, hint }`. `hide()` stops
  timers or animation loops; `show()` resumes them. This matters for Snake and
  the chess engine, which would otherwise keep burning frames off-screen.
- **Backdrop** — a canvas digital-rain effect, DPR-aware, paused when the page is
  hidden and skipped entirely under `prefers-reduced-motion`.

Game logic is separated from rendering:

| module | responsibility | DOM? |
| :--- | :--- | :--- |
| `games/snake.js` | grid, growth, wall collision, speed curve | no |
| `games/twenty48.js` | slide/merge, spawn, win/lose | no |
| `games/minesweeper.js` | mine placement after first click, flood reveal, flags, chording | no |
| `games/tictactoe.js` | minimax with alpha-beta and depth limiting | no |
| `games/adventure.js` | rooms, inventory, flags, endings | no |
| `games/chess-match.js` | turn flow, engine scheduling, promotion, status | no |
| `views/*.js` | DOM, keyboard, touch, announcements, persistence | yes |

This is why the test suite can play thousands of game moves without a browser.
The UI layer uses `aria-live` for moves and game over, `role="grid"` with roving
focus for boards, and real `<button>` elements for cells so keyboard users never
need a mouse. Scores are the only thing written to `localStorage`; there are no
cookies and no network calls from the arcade.

The build is the absence of a build: Pages serves the files as written. That is
a constraint turned into a feature — no bundler version drift, no source maps,
no minified supply chain.

---

## The chess engine

`lib/chess.js` is a single-file 0x88 engine shared by three callers.

**Board representation.** 128-entry array; valid squares satisfy
`(index & 0x88) === 0`. Off-board tests are one bitmask instead of bounds checks.

**Rules.** Pseudo-legal generation, then a legality filter that rejects moves
leaving the king attacked. Implemented: castling (including through-check and
rights loss), en passant, all four promotions, checkmate, stalemate, threefold
repetition, insufficient material, the 50-move rule, FEN import/export, SAN and
UCI parsing, move history and undo.

**Search.** Negamax with alpha-beta pruning, capture-first move ordering, a
quiescence search capped at four extra plies, material values and piece-square
tables, plus a small bishop-pair bonus. There is deliberately no transposition
table and no iterative deepening: those add code and memory for strength this
opponent does not need.

**Difficulty.** The view maps casual → depth 2, normal → 3, sharp → 4. Depth 4
is the slowest and still returns in well under a second on a laptop; the bot uses
depth 3.

**Correctness.** Perft counts are asserted in `tests/chess.test.js`, not eyeballed:

| position | depths | node counts |
| :--- | :--- | :--- |
| start | 1–4 | 20 / 400 / 8,902 / 197,281 |
| Kiwipete | 1–3 | 48 / 2,039 / 97,862 |
| position 3 | 1–4 | 14 / 191 / 2,812 / 43,238 |
| position 4 | 1–3 | 6 / 264 / 9,467 |

The suite also replays the Immortal Game to `Bxe7#`, which exercises castling,
sacrifices, promotion-free mating nets and SAN generation together.

Two honest limits: repetition history only exists inside one `Chess` instance,
and the engine is deterministic unless the caller injects tie-breaking noise.
The browser keeps the instance for the whole game; the Issue bot reloads a FEN
per reply and therefore cannot see repetition across comments.

---

## Async chess over Issues

```text
visitor opens issue / comments a move
              │
              ▼
GitHub Actions: issues(opened) | issue_comment(created)
              │
              ▼
      scripts/chess-bot.mjs
              │  GET chess/games/issue-<n>.json  (REST, contents API)
              ▼
   lib/chess-issue.mjs: parse → validate → apply → engine reply
              │
              ▼
   PUT the JSON with the file's current SHA  ──► commit
              │
              ▼
        POST an issue comment with the board
```

Why a committed JSON file instead of a database:

- The bot is **stateless**. A workflow run can die at any point; the next run
  reads the same file and continues.
- The game is **auditable**. `git log chess/games/issue-42.json` is the move list.
- There is **nothing to operate**. No server, no cron, no credentials beyond the
  ephemeral Actions token.
- The format is inspectable and easy to export.

The protocol module is pure. `handleEvent` adds GitHub I/O; `respond` takes a
state and a comment body and returns the next state plus Markdown. That is what
the 15 bot tests exercise, including a fake GitHub client that simulates the
contents API.

Safety properties:

- **Loop guard** — comments authored by a bot, containing the hidden marker, or
  longer than 400 characters are ignored. The bot cannot answer itself.
- **Concurrency** — `concurrency: chess-issue-<n>` serialises runs per issue.
  The write still sends the last known SHA; a 409 means someone else won, and
  the reply asks the visitor to post again instead of overwriting.
- **No command execution** — the only accepted inputs are a move token or one of
  six slash commands. Nothing is passed to a shell.
- **Colour guard** — the engine only moves for its own colour, and the visitor
  cannot move twice for the machine.
- **Bounded work** — depth is fixed by the workflow, comment size is capped, and
  the job has a five-minute timeout.

---

## The Spotify function

`api/now-playing.js` is a single default export with the `(req, res)` signature.

```text
request
  │
  ├─ refresh token ──► accounts.spotify.com (cached until ~60s before expiry)
  ├─ GET currently-playing ──► 204? idle card
  │                          401? refresh once, retry once
  │                          429? honest error card, HTTP 200
  ├─ download artwork ──► inline as data: URI (cached 10 min)
  └─ render SVG or JSON
```

Design notes:

- **Why inline the artwork?** An SVG loaded through `<img>` is treated as a
  static image and cannot fetch external resources in browsers. A linked
  `i.scdn.co` URL renders as an empty square in a README. The function downloads
  the image (bounded to 250 KB) and embeds it as base64. The result is
  self-contained and cacheable.
- **Why HTTP 200 for failures?** GitHub does not render an error body for a
  broken image. An honest "SIGNAL LOST" card, with a cache header, is better UX
  and still tells the truth. The JSON endpoint carries `ok: false` and a
  non-secret reason for operators.
- **Why `?format=json`?** Debugging an SVG in `curl` is miserable. JSON makes the
  contract visible without adding a dashboard.
- **Headers** — `content-type: image/svg+xml`, a short `s-maxage`, `nosniff`, and
  a CSP of `default-src 'none'; img-src data:` so the document could never run
  script or fetch anything even if a future edit interpolated markup.
- **Escaping** — every piece of track metadata passes through `escapeXml`.
  Titles are attacker-controlled in the sense that anyone can publish a track.
- **Secrets** — read from the environment per request; never logged, never
  embedded, never returned.

The function is intentionally portable. Anything that supports `(req, res)` and
`fetch` can host it; Vercel is simply the shortest free path.

---

## The asset pipeline

Two generators, one philosophy: deterministic output, honest data.

### Static assets — `scripts/generate-assets.mjs`

`banner.svg`, `matrix-rain.svg` and `terminal-card.svg` are authored in code so
they can be regenerated with your handle and tagline. A seeded `mulberry32` PRNG
chooses rain glyphs, gaps and timings; rerunning the script produces byte-identical
files. Animation is CSS keyframes because GitHub renders SVG as an image.

Animations always have a **usable base state**. For example, the terminal lines
start at `opacity: 1` and animate from 0, rather than starting at 0 and relying on
`forwards`; if a renderer freezes animation, the text is still readable. A
`prefers-reduced-motion` block disables motion inside the SVG.

### Live assets — `scripts/github-assets.mjs`

```text
workflow (6-hour cron, manual, or script change)
   │
   ├─ REST /users/:login            → public repos, followers, join date
   ├─ REST /users/:login/repos      → stars, primary language (max 3 pages)
   ├─ GraphQL contributionCalendar  → daily counts (needs read:user)
   └─ pure renderers                → metrics.svg, languages.svg,
                                       contributions.svg
   │
   ├─ no data change? exit without committing
   ├─ network failure? keep last good files
   └─ otherwise commit with [skip ci]
```

The renderers take a normalized report, not live API objects. That makes them
testable with a checked-in fixture and keeps the CLI thin. Forks are excluded
from stars and languages; the repository tile uses GitHub's own public count and
says so. Percentages are computed from primary repo language counts, not bytes,
and the card says "primary language" rather than implying a line count.

The contribution grid is 53 columns × 7 rows. Weeks align to Sunday using the
first day's weekday, out-of-range cells are transparent rather than painted as
zero, and levels are relative to the busiest day. Month labels are de-duplicated
and spaced so they cannot collide.

---

## Testing

```bash
node --test tests/
```

| suite | what it protects |
| :--- | :--- |
| `chess.test.js` | perft, FEN/SAN/UCI, castling, en passant, promotion, draws, immortal game |
| `games.test.js` | snake, 2048, minesweeper, tic-tac-toe and adventure logic |
| `bot.test.js` | command extraction, replies, loop guard, fake contents API, conflicts |
| `spotify.test.js` | idle/config/playing/error cards, token refresh, escaping, cache headers |
| `assets.test.js` | normalization, week alignment, fork exclusion, escaping, determinism |

The browser layer is verified separately with real pages: console errors, deep
links, keyboard focus, engine replies and a 390 px viewport. The screenshots in
`assets/` come from that verification, not from a design tool.

`scripts/check-assets.mjs` adds structural checks in CI: XML declaration, one
root, no placeholders, no `undefined`/`NaN`, no script tags, no inline event
handlers. `scripts/check-links.mjs` verifies every relative README/doc link and
image path, and can check external URLs on demand.

---

## Trade-offs

| decision | cost | benefit |
| :--- | :--- | :--- |
| Vanilla ES modules, no bundler | no tree-shaking, many small requests (HTTP/2 makes this cheap) | zero dependencies, readable source, Pages serves it directly |
| Committed JSON per game | git history grows with games | stateless bot, trivial audit trail, no database |
| Characterful SVG instead of a chart library | hand-written layout code | tiny files, full control, works through GitHub's image proxy |
| Depth 4 search, no transposition table | weaker than Stockfish | no native binary, instant deploy, deterministic tests |
| Static screenshots in the README | they can go stale after a UI change | honest previews that link to the real thing |
| Honest empty states | less impressive on day zero | never fabricates stats, music or games |
