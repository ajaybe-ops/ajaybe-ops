#!/usr/bin/env node
/**
 * GitHub Issues chess bot.
 *
 * Runs from .github/workflows/chess-bot.yml on `issues` and `issue_comment`
 * events. A game is a JSON file committed to the repository, so the bot itself
 * is stateless and every move is visible in git history.
 *
 * Environment:
 *   GITHUB_TOKEN          actions token (contents: write, issues: write)
 *   GITHUB_REPOSITORY     owner/name (provided by Actions)
 *   GITHUB_EVENT_NAME     issues | issue_comment
 *   GITHUB_EVENT_PATH     path to the event payload
 *   CHESS_ENGINE_DEPTH    optional, default 3
 *   CHESS_BOT_COLOR       optional, 'b' (default) or 'w'
 *   DRY_RUN               optional, "1" to log instead of writing
 */

import { readFileSync } from 'node:fs';
import { createGitHubClient, GitHubError } from './lib/github.mjs';
import {
  BOT_MARKER,
  boardReply,
  gamePath,
  helpReply,
  initialState,
  isBotComment,
  respond,
} from './lib/chess-issue.mjs';

const MAX_COMMENT_BODY = 400;

export async function handleEvent({ payload, eventName, github, depth = 3, botColor = 'b', logger = console, dryRun = false }) {
  const issue = payload.issue;
  if (!issue) return { skipped: 'no-issue' };

  const issueNumber = issue.number;
  const path = gamePath(issueNumber);
  const existing = await github.getFile(path);
  let state = existing ? safeParse(existing.content) : null;

  if (eventName === 'issues') {
    if (payload.action !== 'opened') return { skipped: 'issue-not-opened' };
    if (state) return { skipped: 'already-started' };

    const title = String(issue.title || '');
    const body = String(issue.body || '');
    if (!/chess/i.test(title) && !/\/new\b/.test(body)) return { skipped: 'not-a-chess-issue' };

    state = initialState({ issue: issueNumber, playerColor: botColor === 'w' ? 'b' : 'w', engineColor: botColor === 'w' ? 'w' : 'b' });
    const created = await persist(state, null, { github, path, dryRun, message: `chess: start game for issue #${issueNumber}` });
    if (!created) return { skipped: 'write-conflict' };

    const reply = boardReply(state, 'Challenge accepted. **You are White.** Post your first move as a comment, for example `e4`.');
    await comment(github, issueNumber, reply, { logger, dryRun });
    return { started: true, issue: issueNumber };
  }

  if (eventName !== 'issue_comment') return { skipped: 'event-not-handled' };
  if (payload.action !== 'created') return { skipped: 'comment-not-created' };

  const payloadComment = payload.comment;
  if (!payloadComment) return { skipped: 'no-comment' };
  if (isBotComment(payloadComment)) return { skipped: 'bot-comment' };
  if (String(payloadComment.body || '').length > MAX_COMMENT_BODY) return { skipped: 'comment-too-long' };

  if (!state) {
    // A visitor may open a plain issue and post `/new` (or a move) in it.
    const text = String(payloadComment.body || '');
    if (/\/new\b/i.test(text)) {
      state = initialState({ issue: issueNumber, playerColor: botColor === 'w' ? 'b' : 'w', engineColor: botColor === 'w' ? 'w' : 'b' });
      const created = await persist(state, null, { github, path, dryRun, message: `chess: start game for issue #${issueNumber}` });
      if (!created) return { skipped: 'write-conflict' };
      await comment(github, issueNumber, boardReply(state, 'New game. **You are White.** Post a move such as `e4`.'), { logger, dryRun });
      return { started: true, issue: issueNumber };
    }

    await comment(github, issueNumber, helpReply('There is no active game in this issue yet. Post `/new` to start one.'), { logger, dryRun });
    return { skipped: 'no-game' };
  }

  const { state: next, reply, changed } = respond(state, payloadComment.body, { depth });

  if (changed) {
    const ok = await persist(next, existing?.sha || null, {
      github,
      path,
      dryRun,
      message: `chess: ${next.moves.length ? `move ${next.moves.length}` : 'reset'} on issue #${issueNumber}`,
      allowRecreate: true,
    });
    if (!ok) {
      await comment(github, issueNumber, boardReply(state, 'Two moves landed at once. This comment was not applied — post it again.'), { logger, dryRun });
      return { skipped: 'write-conflict' };
    }
  }

  await comment(github, issueNumber, reply, { logger, dryRun });
  return { changed, issue: issueNumber, status: next.status };
}

async function persist(state, sha, { github, path, dryRun, message, allowRecreate = false }) {
  const content = `${JSON.stringify(state, null, 2)}\n`;
  if (dryRun) return true;
  try {
    await github.putFile(path, content, { message, sha: sha || undefined });
    return true;
  } catch (error) {
    if (allowRecreate && error instanceof GitHubError && error.status === 409) return false;
    if (error instanceof GitHubError && error.status === 422) return false;
    throw error;
  }
}

async function comment(github, issueNumber, body, { logger, dryRun }) {
  if (dryRun) {
    logger.log(`--- dry run reply to #${issueNumber} ---\n${body}`);
    return;
  }
  await github.createComment(issueNumber, body);
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME || 'issue_comment';
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const dryRun = process.env.DRY_RUN === '1';

  if (!eventPath || !repo) {
    console.error('GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required.');
    process.exit(1);
  }
  if (!dryRun && !token) {
    console.error('GITHUB_TOKEN is required unless DRY_RUN=1.');
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  const github = createGitHubClient({ token, repo });
  const depth = Number(process.env.CHESS_ENGINE_DEPTH || 3);
  const botColor = process.env.CHESS_BOT_COLOR === 'w' ? 'w' : 'b';

  const result = await handleEvent({ payload, eventName, github, depth, botColor, dryRun });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { BOT_MARKER };
