/**
 * Chess-issue protocol: the pure half of the GitHub Issues chess bot.
 *
 * A game is a JSON document in the repository (chess/games/issue-<n>.json) so
 * the bot is stateless and every move is auditable in git history. This module
 * has no network code: it takes a state plus a comment body and returns the new
 * state and the Markdown reply, which makes it directly testable.
 */

import { Chess, findBestMove, indexToSquare } from '../../lib/chess.js';

export const BOT_MARKER = '<!-- matrix-arcade-chess-bot -->';

const MAX_COMMAND_LENGTH = 40;

export function initialState({ issue, playerColor = 'w', engineColor = 'b' }) {
  return {
    version: 1,
    issue,
    playerColor,
    engineColor,
    fen: new Chess().fen(),
    moves: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Reduce a comment to the single command token we are willing to parse. */
export function extractCommand(body) {
  const text = String(body || '');
  const withoutMarker = text.replaceAll(BOT_MARKER, '');
  const lines = withoutMarker
    .split(/\r?\n/)
    .map((line) => line.replace(/[`*_]/g, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    // Strip list markers (`- `, `1. `, `> `) and surrounding punctuation so a
    // move survives being written inside a sentence, a quote or a list item.
    const cleaned = line.replace(/^\s*(?:[-+>]|\d+[.)])\s+/, '');
    for (const raw of cleaned.split(/\s+/)) {
      const token = raw.replace(/^[("'[\u201c\u2018]+|[)"'\]\u201d\u2019.,!?;:]+$/g, '');
      if (!token) continue;
      if (token.startsWith('/')) return token.toLowerCase();
      if (looksLikeMove(token)) return token;
    }
  }
  return null;
}

function looksLikeMove(token) {
  if (token.length > MAX_COMMAND_LENGTH) return false;
  if (/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(token)) return true;
  return /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)[+#]?$/.test(token);
}

export function isBotComment(comment) {
  const login = comment?.user?.login || '';
  const type = comment?.user?.type || '';
  return type === 'Bot' || /\[bot\]$/i.test(login) || String(comment?.body || '').includes(BOT_MARKER);
}

/**
 * Apply one visitor comment to a game state.
 * @returns {{state, reply, changed:boolean}} reply is Markdown for the issue thread.
 */
export function respond(state, body, { depth = 3, random = null, now = () => new Date().toISOString() } = {}) {
  const command = extractCommand(body);

  if (!command) {
    return {
      state,
      changed: false,
      reply: helpReply('I could not find a move in that comment.'),
    };
  }

  if (command === '/new' || command === '/reset') {
    const fresh = initialState({ issue: state.issue, playerColor: state.playerColor, engineColor: state.engineColor });
    fresh.createdAt = state.createdAt || fresh.createdAt;
    return {
      state: fresh,
      changed: true,
      reply: boardReply(fresh, 'New game. You are White; the machine is Black. Post a move such as `e4`.'),
    };
  }

  if (command === '/board') {
    return { state, changed: false, reply: boardReply(state, 'Current position.') };
  }

  if (command === '/fen') {
    return { state, changed: false, reply: `${BOT_MARKER}\n\`\`\`\n${state.fen}\n\`\`\`\n` };
  }

  if (command === '/help') {
    return { state, changed: false, reply: helpReply('Commands and move formats.') };
  }

  if (command === '/resign') {
    if (state.status !== 'active') {
      return { state, changed: false, reply: boardReply(state, 'This game is already over.') };
    }
    const next = { ...state, status: 'resigned', updatedAt: now() };
    return {
      state: next,
      changed: true,
      reply: boardReply(next, `You resigned. The machine accepts, smugly. Open a new challenge when you want a rematch.`),
    };
  }

  const chess = new Chess(state.fen);

  if (state.status !== 'active') {
    return { state, changed: false, reply: boardReply(state, 'This game is over. Post `/new` for a rematch.') };
  }

  if (chess.turn() !== state.playerColor) {
    return { state, changed: false, reply: boardReply(state, 'It is not your turn. The machine is waiting on its own move — this should not happen; post `/board` to resync.') };
  }

  const played = chess.move(command);
  if (!played) {
    const sample = chess.moves().slice(0, 6).join(', ');
    return {
      state,
      changed: false,
      reply: boardReply(state, `\`${command}\` is not a legal move in this position. That is not a judgement on you. Legal examples: ${sample}.`),
    };
  }

  const status = chess.status();
  let replyNote = `You played **${played.san}**.`;

  let engineMove = null;
  if (!status.over) {
    engineMove = findBestMove(chess, { depth, random });
    if (engineMove) {
      const applied = chess.move({
        from: indexToSquare(engineMove.from),
        to: indexToSquare(engineMove.to),
        promotion: engineMove.promotion ? engineMove.promotion.toLowerCase() : undefined,
      });
      if (applied) replyNote += ` The machine answered **${applied.san}**.`;
    }
  }

  const nextStatus = chess.status();
  const next = {
    ...state,
    fen: chess.fen(),
    // history() contains only the plies played by this handler (state.fen is loaded, not replayed)
    moves: [...state.moves, ...chess.history()],
    status: nextStatus.over ? (nextStatus.reason === 'checkmate' ? 'checkmate' : 'draw') : 'active',
    updatedAt: now(),
  };

  if (nextStatus.over) {
    if (nextStatus.reason === 'checkmate') {
      const winner = chess.turn() === 'w' ? 'Black' : 'White';
      replyNote += `\n\n**Checkmate — ${winner} wins.** Post \`/new\` for a rematch.`;
    } else {
      replyNote += `\n\n**Draw — ${nextStatus.reason}.** Post \`/new\` for a rematch.`;
    }
  }

  return { state: next, changed: true, reply: boardReply(next, replyNote) };
}

export function boardReply(state, note) {
  const chess = new Chess(state.fen);
  const history = state.moves.length ? state.moves.join(' ') : 'no moves yet';
  const turn = chess.turn() === state.playerColor ? 'you' : 'machine';
  const status = chess.status();

  return [
    BOT_MARKER,
    note,
    '',
    '```',
    chess.ascii(),
    '```',
    '',
    `- **Moves:** ${history}`,
    `- **To move:** ${turn}`,
    `- **Status:** ${status.over ? `${status.reason} (${status.result})` : (chess.isCheck() ? 'check' : 'in progress')}`,
    `- **FEN:** \`${state.fen}\``,
    '',
    helpFooter(),
  ].join('\n');
}

export function helpReply(prefix) {
  return [BOT_MARKER, prefix, '', helpFooter()].join('\n');
}

function helpFooter() {
  return [
    '<sub>Reply with a move in SAN (`Nf3`, `exd5`, `O-O`, `e8=Q`) or coordinates (`g1f3`).',
    'Commands: `/board`, `/fen`, `/resign`, `/new`, `/help`.',
    'Prefer a visual board? Play the engine instantly in the [arcade](https://ajaybe-ops.github.io/ajaybe-ops/#chess).</sub>',
  ].join(' ');
}

/** Game file path for an issue number. */
export function gamePath(issueNumber) {
  return `chess/games/issue-${issueNumber}.json`;
}
