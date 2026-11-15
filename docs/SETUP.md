# Setup

Everything here is free and open source. The only accounts you need are GitHub
and (optionally) Spotify + Vercel. No paid tier is required for any feature.

- [0. What you need](#0-what-you-need)
- [1. Personalise the repository](#1-personalise-the-repository)
- [2. GitHub Pages](#2-github-pages)
- [3. Spotify now-playing badge](#3-spotify-now-playing-badge)
- [4. Async chess in Issues](#4-async-chess-in-issues)
- [5. Profile stats](#5-profile-stats)
- [6. Verify everything](#6-verify-everything)
- [Troubleshooting](#troubleshooting)

---

## 0. What you need

| tool | version | why |
| :--- | :--- | :--- |
| Node.js | 20 or newer | scripts, tests, local server. No npm packages are installed. |
| git | any | normal repository work |
| GitHub account | free | Pages, Actions, Issues |
| Spotify account | free | optional, the now-playing badge |
| Vercel account | Hobby/free | optional, hosts one serverless function |

The profile repository must be named exactly like your account
(`USERNAME/USERNAME`) for GitHub to render its `README.md` on your profile page.
You can still use the arcade and the rest from a normal repository.

---

## 1. Personalise the repository

```bash
npm run configure -- --username your-handle
```

That replaces three documented placeholders across the repository:

| placeholder | becomes |
| :--- | :--- |
| `ajaybe-ops` | your GitHub handle, in links, badges and the chess footer |
| `AI engineer // building small, sharp tools in public` | the default tagline, or `--tagline "what you build"` |

It then regenerates `assets/banner.svg` and `assets/terminal-card.svg` with your
handle, so the hero image is real typography rather than a placeholder. If you
pass `--now-playing-url`, both Spotify badge sources are rewritten in place
(matched by their alt text), so the command also works after you deploy Vercel.
`--dry-run` prints the files it would touch.

```bash
npm run configure -- --username your-handle --tagline "systems tinkerer"
```

Windows PowerShell users: the `npm run` form above works unchanged.

**Do not use your GitHub password anywhere in this project.** No script asks for
one; if something does, it is not part of this repository.

---

## 2. GitHub Pages

The arcade is plain static files. Pages serves them; no build step is needed at
runtime, but the workflow stages `arcade/` and `lib/chess.js` together so the
relative import used by the chess engine keeps working.

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open the **Actions** tab and run **Deploy arcade** (or push a change to
   `arcade/`).
5. Visit `https://YOUR_HANDLE.github.io/YOUR_HANDLE/arcade/`.

`https://YOUR_HANDLE.github.io/YOUR_HANDLE/` redirects to the arcade. The direct
`/arcade/` URL is what the README links to.

Notes:

- Pages on a free plan requires a **public** repository.
- The workflow needs `pages: write` and `id-token: write`; both are declared in
  `.github/workflows/pages.yml`.
- If the deploy step says *Get Pages site failed*, Pages has not been switched to
  the GitHub Actions source yet.
- A custom domain works; update the links with `--username` as usual, then point
  the domain at Pages in **Settings → Pages → Custom domain**.

---

## 3. Spotify now-playing badge

This is the only part that needs a host other than GitHub. The function is one
file, `api/now-playing.js`, and works on any Node host that supports the
`(req, res)` handler shape. Vercel's free Hobby tier is the reference target.

### 3.1 Create a Spotify app

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard)
   and create an app. Development mode is fine for your own account.
2. Add this exact redirect URI:

   ```text
   http://127.0.0.1:8888/callback
   ```

3. Copy the **Client ID** and **Client secret**.
4. No additional scopes need to be enabled in the dashboard; the helper requests
   them at consent time.

### 3.2 Get a refresh token (once, locally)

PowerShell:

```powershell
$env:SPOTIFY_CLIENT_ID="..."
$env:SPOTIFY_CLIENT_SECRET="..."
node scripts/spotify-auth.mjs
```

bash/zsh:

```bash
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
node scripts/spotify-auth.mjs
```

Open the printed URL, approve access, and wait for the local callback. The helper
prints a `SPOTIFY_REFRESH_TOKEN`. It listens only on `127.0.0.1`; if port 8888 is
busy, set `SPOTIFY_AUTH_PORT` and register the matching redirect URI in Spotify.

Requested scopes: `user-read-currently-playing` and `user-read-playback-state`.
The badge only **reads** playback; it never controls your account and never
needs your password.

### 3.3 Deploy the function

Using the Vercel dashboard:

1. **Add New → Project**, import this repository.
2. Framework preset: **Other**. Build command: empty. Output directory: empty.
   Vercel detects `api/now-playing.js` automatically.
3. Add three **Environment Variables** for Production (and Preview if you want):

   ```text
   SPOTIFY_CLIENT_ID
   SPOTIFY_CLIENT_SECRET
   SPOTIFY_REFRESH_TOKEN
   ```

4. Deploy.

Using the CLI instead:

```bash
npx vercel --prod
```

Set the same three variables in the project settings. The repository's
`vercel.json` only declares the function timeout, no build.

### 3.4 Point the README at the live badge

```bash
npm run configure -- --username your-handle --now-playing-url https://your-app.vercel.app
```

This rewrites the two Spotify `<img>` sources in the README. It is the only
change needed to go from the committed idle badge to the live endpoint.

Verify:

```text
https://your-app.vercel.app/api/now-playing?format=json
```

A healthy response contains `"ok": true` and either a track or
`"playing": false`. The SVG itself is at `/api/now-playing`.

### 3.5 What "live" means

- The function caches the access token in memory until shortly before expiry and
  the artwork for ten minutes.
- Responses are cached for 60 seconds while a track is playing, 30 seconds when
  idle. Refreshing more often does not make the API faster.
- If nothing is playing, the badge says so. It does not invent a track, and it
  does not show the last song forever.
- If the refresh token is revoked, the card shows `SIGNAL LOST` and the function
  logs a reason. It never prints the secret or the token.

See [SECURITY.md](SECURITY.md#spotify) for the threat model and rotation steps.

---

## 4. Async chess in Issues

The bot lives in `scripts/chess-bot.mjs` and is triggered by
`.github/workflows/chess-bot.yml`. It needs no server: the game is a JSON file in
the repository.

1. Ensure the workflow file is on the **default branch** (issue templates are
   only offered from there).
2. Open **Settings → Actions → General → Workflow permissions** and allow
   **Read and write permissions** if your organization has narrowed the default.
   The workflow itself requests only:
   - `contents: write` — commit `chess/games/issue-<n>.json`
   - `issues: write` — post the board reply
3. Open a new issue with the **Chess challenge** template, or use the README
   link. Submit it. The bot replies with the starting board and says you are
   White.
4. Comment a move: `e4`, `Nf3`, `exd5`, `O-O`, `e8=Q`, or `e2e4`.
5. Wait for the Actions run. On a warm runner this is seconds; on a cold queue it
   can be a minute.

Commands: `/board`, `/fen`, `/resign`, `/new`, `/help`. Comments longer than 400
characters are ignored; bot comments are ignored to prevent loops.

Tuning:

| variable | default | meaning |
| :--- | :--- | :--- |
| `CHESS_ENGINE_DEPTH` | `3` | 2 casual, 3 normal, 4 sharp (slower) |
| `CHESS_BOT_COLOR` | `b` | `w` makes the bot play White and the visitor Black |

Set these in the workflow's `env:` block, not as repository secrets.

If two comments land at once, the per-issue concurrency group serialises the
workflow and the optimistic SHA check refuses the second write with a clear
message instead of merging blindly.

To inspect the protocol locally, run `node scripts/chess-cli.mjs`; it plays the
same engine in a terminal without touching GitHub.

---

## 5. Profile stats

`assets/metrics.svg`, `assets/languages.svg` and `assets/contributions.svg` are
generated by `.github/workflows/profile-assets.yml` every six hours and
committed back to the repository.

1. Create a **classic personal access token** with the `read:user` scope. A
   fine-grained token can work for REST but the GraphQL contribution calendar is
   most predictable with `read:user`.
2. Add it as a repository secret named **`PROFILE_TOKEN`**.
3. Run **Actions → Refresh profile assets → Run workflow**.

Without `PROFILE_TOKEN` the workflow falls back to the Actions token, updates the
REST cards (repos, stars, followers) and **keeps the last good contribution
calendar** rather than replacing it with invented data. If no calendar has ever
been generated, the card explains what token is missing.

The scripts can be run locally too:

```bash
GITHUB_TOKEN=... GITHUB_LOGIN=your-handle node scripts/github-assets.mjs
node scripts/github-assets.mjs --fixture tests/fixtures/github.json --out /tmp/assets
```

Notes:

- Scheduled workflows are disabled by GitHub after ~60 days without repository
  activity. A manual run or any push re-enables the schedule.
- GitHub proxies README images through its own cache. A newly committed SVG can
  take a few minutes to appear even after the workflow succeeds.
- The scripts are deterministic: the workflow only commits when the data
  actually changed.

The committed cards start as honest "NO SIGNAL" placeholders. They become real
numbers on the first successful run.

---

## 6. Verify everything

Run these in order. Each one catches a different class of mistake.

```bash
# 1. Unit and workflow-level tests (chess rules, games, bot, Spotify, SVG)
npm test

# 2. Generated assets are structurally sound and placeholder-free
node scripts/check-assets.mjs assets

# 3. Local links and images resolve
node scripts/check-links.mjs
```

Then in a browser:

- [ ] `https://YOUR_HANDLE.github.io/YOUR_HANDLE/arcade/` loads with no console
      errors.
- [ ] Chess: select a piece, move it, engine replies.
- [ ] Snake, 2048, Minesweeper, Tic-tac-toe and The Terminal all start.
- [ ] `#chess`, `#snake`, `#2048`, `#mines`, `#tictactoe`, `#terminal` deep links
      work.
- [ ] Keyboard: Tab reaches the board once, arrows move the selection.
- [ ] Mobile width (~390 px): no horizontal scrolling, controls remain reachable.
- [ ] Open a chess issue, submit, receive the board, comment `e4`, receive the
      engine reply.
- [ ] `/api/now-playing?format=json` returns `ok: true` (or an honest idle state).
- [ ] The README images render on GitHub after the workflows finish.

The repository's CI runs step 1 on every push and pull request.

---

## Troubleshooting

| symptom | likely cause | fix |
| :--- | :--- | :--- |
| Pages URL is 404 | Pages source still set to a branch, or the workflow has not run | **Settings → Pages → Source: GitHub Actions**, run *Deploy arcade* |
| Arcade loads but chess is blank | `lib/chess.js` was not staged | use the provided `pages.yml`; do not upload `arcade/` alone |
| Chess bot never replies | Actions disabled, workflow permissions read-only, or no `contents: write` | check the Actions log; allow read/write workflow permissions |
| Bot says "not a legal move" for a valid move | ambiguous SAN or wrong side to move | try coordinates (`e2e4`), post `/board` |
| Bot says "not your turn" | `CHESS_BOT_COLOR` changed mid-game, or a double comment | post `/board`, then the move again |
| Spotify card says `SIGNAL LOST` | missing env vars, revoked refresh token, or Spotify outage | test `?format=json`, re-run the auth helper, update Vercel |
| Spotify card says `NO SIGNAL` | nothing is playing | start playback on any Spotify client |
| Stats show "NO SIGNAL" | workflow has not run, or the API was unreachable | run *Refresh profile assets*; check the log |
| Contribution card still says "needs PROFILE_TOKEN" | secret missing or token lacks `read:user` | add the secret, re-run the workflow |
| Stats look stale | six-hour schedule or GitHub image cache | manual run; hard-refresh; wait for cache |
| `configure` leaves placeholders | a file outside the text extensions | grep for `ajaybe-ops`; open an issue with the file name |

## How to remove things

- **Remove Spotify:** delete `api/`, `vercel.json`, `scripts/spotify-auth.mjs`
  and the two badge `<img>` tags in the README. Nothing else imports them.
- **Remove Issue chess:** delete `.github/workflows/chess-bot.yml`,
  `.github/ISSUE_TEMPLATE/chess.yml` and `chess/`. The browser chess game still
  works because it imports the shared engine directly.
- **Remove stats:** delete the three SVG references from the README and the
  `profile-assets.yml` workflow. The files are generated artifacts, so nothing
  breaks if you stop refreshing them.
