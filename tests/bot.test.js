import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOT_MARKER,
  boardReply,
  extractCommand,
  gamePath,
  initialState,
  isBotComment,
  respond,
} from '../scripts/lib/chess-issue.mjs';
import { Chess } from '../lib/chess.js';
import { handleEvent } from '../scripts/chess-bot.mjs';

test('extractCommand finds moves through markdown noise', () => {
  assert.equal(extractCommand('e4'), 'e4');
  assert.equal(extractCommand('  `Nf3`  '), 'Nf3');
  assert.equal(extractCommand('- **e2e4**'), 'e2e4');
  assert.equal(extractCommand('I play **exd5** today'), 'exd5');
  assert.equal(extractCommand('/new'), '/new');
  assert.equal(extractCommand('/board'), '/board');
  assert.equal(extractCommand('hello there'), null);
  assert.equal(extractCommand(''), null);
  assert.equal(extractCommand('x'.repeat(500)), null);
});

test('bot comments are ignored (no feedback loops)', () => {
  assert.equal(isBotComment({ user: { login: 'github-actions[bot]', type: 'Bot' }, body: 'e4' }), true);
  assert.equal(isBotComment({ user: { login: 'someone', type: 'User' }, body: `${BOT_MARKER} board` }), true);
  assert.equal(isBotComment({ user: { login: 'someone', type: 'User' }, body: 'e4' }), false);
});

test('first move produces an engine reply and records both plies', () => {
  const start = initialState({ issue: 1 });
  assert.equal(start.fen, new Chess().fen());

  const result = respond(start, 'e4', { depth: 2, random: () => 0.5 });
  assert.equal(result.changed, true);
  assert.equal(result.state.moves.length, 2);
  assert.equal(result.state.moves[0], 'e4');
  assert.ok(result.state.moves[1].length >= 2);
  assert.notEqual(result.state.fen, start.fen);
  assert.match(result.reply, /You played \*\*e4\*\*/);
  assert.match(result.reply, /The machine answered/);
  assert.match(result.reply, /```/);
});

test('illegal moves are rejected and never mutate the state', () => {
  const start = initialState({ issue: 2 });
  const result = respond(start, 'e5', { depth: 2 });
  assert.equal(result.changed, false);
  assert.equal(result.state.fen, start.fen);
  assert.equal(result.state.moves.length, 0);
  assert.match(result.reply, /not a legal move/);
});

test('a visitor cannot move for the engine twice', () => {
  const afterE4 = respond(initialState({ issue: 3 }), 'e4', { depth: 2, random: () => 0.5 }).state;
  const again = respond(afterE4, 'd4', { depth: 2 });
  // It is White's turn and the visitor *is* White, so a second move is legal;
  // the guard that matters is refusing a move for the engine's colour.
  const white = respond({ ...afterE4, playerColor: 'b', engineColor: 'w' }, 'Nf3', { depth: 2 });
  assert.equal(white.changed, false);
  assert.match(white.reply, /not your turn/i);
  assert.equal(again.changed, true);
});

test('checkmate ends the game and further moves are refused', () => {
  const state = {
    ...initialState({ issue: 4 }),
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
  };
  const mate = respond(state, 'Ra8#', { depth: 2 });
  assert.equal(mate.changed, true);
  assert.equal(mate.state.status, 'checkmate');
  assert.match(mate.reply, /Checkmate — White wins/);

  const after = respond(mate.state, 'Kh7', { depth: 2 });
  assert.equal(after.changed, false);
  assert.match(after.reply, /game is over/i);
});

test('/new and /resign behave predictably', () => {
  const played = respond(initialState({ issue: 5 }), 'd4', { depth: 2, random: () => 0.5 }).state;
  const fresh = respond(played, '/new', { depth: 2 });
  assert.equal(fresh.changed, true);
  assert.equal(fresh.state.moves.length, 0);
  assert.equal(fresh.state.fen, new Chess().fen());

  const resigned = respond(played, '/resign', { depth: 2 });
  assert.equal(resigned.changed, true);
  assert.equal(resigned.state.status, 'resigned');
  assert.match(resigned.reply, /resigned/i);
});

test('/board and /fen are read-only', () => {
  const start = initialState({ issue: 6 });
  const board = respond(start, '/board');
  assert.equal(board.changed, false);
  assert.match(board.reply, /no moves yet/);

  const fen = respond(start, '/fen');
  assert.equal(fen.changed, false);
  assert.match(fen.reply, new RegExp(start.fen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('boardReply renders an ASCII board and the FEN', () => {
  const reply = boardReply(initialState({ issue: 7 }), 'hello');
  assert.match(reply, /\+------------------------\+/);
  assert.match(reply, /a {2}b {2}c {2}d/);
  assert.match(reply, /FEN/);
});

test('gamePath is stable and issue-scoped', () => {
  assert.equal(gamePath(12), 'chess/games/issue-12.json');
});

/* --------------------------------------------------- workflow-level tests */

function fakeGitHub() {
  const files = new Map();
  const comments = [];
  let counter = 0;
  return {
    files,
    comments,
    async getFile(path) {
      return files.get(path) || null;
    },
    async putFile(path, content, { sha } = {}) {
      const current = files.get(path);
      if (sha && current && current.sha !== sha) {
        const error = new Error('conflict');
        error.status = 409;
        throw error;
      }
      files.set(path, { content, sha: `sha-${++counter}` });
    },
    async createComment(number, body) {
      comments.push({ number, body });
    },
  };
}

const quietLogger = { log() {} };

test('issue opened starts a game and posts the first board', async () => {
  const github = fakeGitHub();
  const payload = {
    action: 'opened',
    issue: { number: 42, title: 'Chess challenge', body: '/new', user: { login: 'visitor', type: 'User' } },
  };

  const result = await handleEvent({ payload, eventName: 'issues', github, depth: 2, logger: quietLogger });
  assert.equal(result.started, true);
  assert.ok(github.files.has('chess/games/issue-42.json'));
  assert.equal(github.comments.length, 1);
  assert.match(github.comments[0].body, /You are White/);

  const saved = JSON.parse(github.files.get('chess/games/issue-42.json').content);
  assert.equal(saved.issue, 42);
  assert.equal(saved.moves.length, 0);
});

test('a comment move updates the committed state and replies', async () => {
  const github = fakeGitHub();
  await handleEvent({
    payload: { action: 'opened', issue: { number: 43, title: 'Chess', body: '' } },
    eventName: 'issues',
    github,
    depth: 2,
    logger: quietLogger,
  });

  const result = await handleEvent({
    payload: {
      action: 'created',
      issue: { number: 43 },
      comment: { body: 'e4', user: { login: 'visitor', type: 'User' } },
    },
    eventName: 'issue_comment',
    github,
    depth: 2,
    logger: quietLogger,
  });

  assert.equal(result.changed, true);
  const saved = JSON.parse(github.files.get('chess/games/issue-43.json').content);
  assert.equal(saved.moves[0], 'e4');
  assert.equal(saved.moves.length, 2);
  assert.match(github.comments.at(-1).body, /You played/);
});

test('bot comments never trigger a reply (loop guard)', async () => {
  const github = fakeGitHub();
  const result = await handleEvent({
    payload: {
      action: 'created',
      issue: { number: 44 },
      comment: { body: 'e4', user: { login: 'github-actions[bot]', type: 'Bot' } },
    },
    eventName: 'issue_comment',
    github,
    depth: 2,
    logger: quietLogger,
  });
  assert.equal(result.skipped, 'bot-comment');
  assert.equal(github.comments.length, 0);
});

test('comments on non-chess issues without a game get a pointer, not a game', async () => {
  const github = fakeGitHub();
  const result = await handleEvent({
    payload: {
      action: 'created',
      issue: { number: 45 },
      comment: { body: 'e4', user: { login: 'visitor', type: 'User' } },
    },
    eventName: 'issue_comment',
    github,
    depth: 2,
    logger: quietLogger,
  });
  assert.equal(result.skipped, 'no-game');
  assert.match(github.comments[0].body, /no active game/);
});

test('over-long comments are ignored entirely', async () => {
  const github = fakeGitHub();
  const result = await handleEvent({
    payload: {
      action: 'created',
      issue: { number: 46 },
      comment: { body: 'e4 '.repeat(200), user: { login: 'visitor', type: 'User' } },
    },
    eventName: 'issue_comment',
    github,
    depth: 2,
    logger: quietLogger,
  });
  assert.equal(result.skipped, 'comment-too-long');
});
