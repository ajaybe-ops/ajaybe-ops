import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Chess, START_FEN, findBestMove, indexToSquare, squareToIndex } from '../lib/chess.js';
import { ChessMatch } from '../arcade/js/games/chess-match.js';

function perft(chess, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of chess._legalMoves()) {
    const undo = chess._apply(move);
    nodes += perft(chess, depth - 1);
    chess._revert(undo);
  }
  return nodes;
}

test('perft matches published node counts on four standard positions', () => {
  const cases = [
    ['start position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
    ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ];

  for (const [name, fen, expected] of cases) {
    const chess = new Chess(fen);
    for (let depth = 1; depth <= expected.length; depth += 1) {
      assert.equal(perft(chess, depth), expected[depth - 1], `${name}, depth ${depth}`);
    }
  }
});

test('SAN, captures and check suffix are generated correctly', () => {
  const chess = new Chess();
  assert.equal(chess.move('e4').san, 'e4');
  assert.equal(chess.move('e5').san, 'e5');
  assert.equal(chess.move('Bc4').san, 'Bc4');
  assert.equal(chess.move('Nc6').san, 'Nc6');
  assert.equal(chess.move('Qh5').san, 'Qh5');
  assert.equal(chess.move('Nf6').san, 'Nf6');
  assert.equal(chess.move('Qxf7').san, 'Qxf7#');
  assert.equal(chess.status().reason, 'checkmate');
  assert.equal(chess.status().result, '1-0');
});

test('Scholar-style mate is detected and further moves are illegal', () => {
  const chess = new Chess();
  for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) chess.move(san);
  assert.equal(chess.isGameOver(), true);
  assert.equal(chess.move('Ke7'), null);
  assert.equal(chess.fen(), 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4');
});

test('castling moves the rook and is legal only when the path is clear', () => {
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(chess.move('O-O').san, 'O-O');
  assert.equal(chess.fen(), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');

  // Bishop on f1 blocks kingside; queen on d1 blocks queenside.
  const blocked = new Chess('r3k2r/8/8/8/8/8/8/R2QKB1R w KQkq - 0 1');
  assert.equal(blocked.move('O-O'), null);
  assert.equal(blocked.move('O-O-O'), null);
});

test('castling through check is rejected', () => {
  // Rook f8 covers f1: kingside castling is illegal, queenside remains legal.
  const chess = new Chess('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(chess.isCheck(), false);
  assert.equal(chess.move('O-O'), null);
  assert.equal(chess.move('O-O-O')?.san, 'O-O-O');

  // In check, neither side may castle.
  const checked = new Chess('4k3/8/8/8/8/8/5q2/R3K2R w KQ - 0 1');
  assert.equal(checked.isCheck(), true);
  assert.equal(checked.move('O-O'), null);
  assert.equal(checked.move('O-O-O'), null);
});

test('en passant capture removes the passed pawn', () => {
  const chess = new Chess();
  for (const san of ['e4', 'a6', 'e5', 'd5']) chess.move(san);
  assert.ok(chess.moves().includes('exd6'));
  const move = chess.move('exd6');
  assert.equal(move.ep, true);
  assert.equal(chess.fen(), 'rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
});

test('promotion offers all four pieces and applies the requested one', () => {
  const chess = new Chess('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
  const moves = chess.moves().filter((san) => san.includes('='));
  assert.deepEqual([...moves].sort(), ['e8=B', 'e8=N', 'e8=Q', 'e8=R']);
  const played = chess.move('e8=N');
  assert.equal(played.promotion, 'N');
  assert.equal(chess.fen(), '4N3/8/8/8/8/8/8/4K2k b - - 0 1');
});

test('stalemate, insufficient material and repetition are reported as draws', () => {
  const stalemate = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(stalemate.isStalemate(), true);
  assert.equal(stalemate.status().result, '1/2-1/2');

  assert.equal(new Chess('8/8/8/4k3/8/8/8/4K3 w - - 0 1').isInsufficientMaterial(), true);
  assert.equal(new Chess('8/8/8/4k3/8/8/8/4KB2 w - - 0 1').isInsufficientMaterial(), true);
  assert.equal(new Chess('8/8/8/4k3/8/8/8/4KQ2 w - - 0 1').isInsufficientMaterial(), false);

  const cheap = new Chess();
  for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) cheap.move(san);
  assert.equal(cheap.isThreefoldRepetition(), true);
});

test('FEN round-trips and rejects malformed input', () => {
  const chess = new Chess();
  assert.equal(chess.fen(), START_FEN);
  chess.move('e4');
  const rehydrated = new Chess(chess.fen());
  assert.equal(rehydrated.fen(), chess.fen());
  assert.throws(() => new Chess('not a fen'));
  assert.throws(() => new Chess('8/8/8/8/8/8/8/8 w - - 0 1'));
});

test('illegal input never mutates the position', () => {
  const chess = new Chess();
  const before = chess.fen();
  assert.equal(chess.move('e5'), null);
  assert.equal(chess.move('e2e5'), null);
  assert.equal(chess.move({ from: 'a1', to: 'a5' }), null);
  assert.equal(chess.fen(), before);
});

test('coordinates and SAN refer to the same move', () => {
  assert.equal(squareToIndex('a1'), 0);
  assert.equal(squareToIndex('h8'), 119);
  assert.equal(indexToSquare(0), 'a1');
  const chess = new Chess();
  assert.equal(chess.move('g1f3').san, 'Nf3');
  assert.equal(chess.undo().san, 'Nf3');
  assert.equal(chess.move('Ng1'), null);
});

test('undo restores the exact previous position', () => {
  const chess = new Chess();
  const start = chess.fen();
  chess.move('e4');
  const after = chess.fen();
  const move = chess.move('e5');
  assert.equal(move.san, 'e5');
  chess.undo();
  assert.equal(chess.fen(), after);
  chess.undo();
  assert.equal(chess.fen(), start);
  assert.equal(chess.history().length, 0);
});

test('engine finds mate in one and picks a legal winning move', () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const best = findBestMove(chess, { depth: 3 });
  const played = chess.move({ from: indexToSquare(best.from), to: indexToSquare(best.to) });
  assert.equal(played.san, 'Ra8#');
});

test('engine prefers capturing a free queen', () => {
  const chess = new Chess('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const best = findBestMove(chess, { depth: 3 });
  assert.equal(indexToSquare(best.to), 'd5');
});

test('ChessMatch: player move, engine reply, hint and undo stay consistent', () => {
  const match = new ChessMatch({ difficulty: 'casual', playerColor: 'w', rng: () => 0.5 });
  const first = match.playPlayer('e4');
  assert.equal(first.ok, true);

  const reply = match.playEngine();
  assert.ok(reply.san.length >= 2);
  assert.equal(match.chess.history().length, 2);
  assert.equal(match.chess.turn(), 'w');

  const hint = match.hint();
  assert.ok(hint.from && hint.to);

  assert.equal(match.undo(), true);
  assert.equal(match.chess.turn(), 'w');

  const view = match.view();
  assert.equal(view.squares.length, 64);
  assert.equal(view.playerColor, 'w');
  assert.ok(Object.keys(view.legalTargets).length > 0);
});

test('ChessMatch: illegal and out-of-turn moves are refused without mutating state', () => {
  const match = new ChessMatch({ difficulty: 'casual' });
  const before = match.chess.fen();
  assert.equal(match.playPlayer('e5').ok, false);
  assert.equal(match.chess.fen(), before);

  match.playPlayer('e4');
  assert.equal(match.playPlayer('d4').ok, false); // still white's turn only after engine replies
  assert.equal(match.playEngine().san.length >= 2, true);
});

test('ChessMatch: playing as black lets the engine open and then hands over control', () => {
  const match = new ChessMatch({ difficulty: 'casual', playerColor: 'b', rng: () => 0.5 });
  assert.equal(match.playerTurn, false);
  const opening = match.playEngine();
  assert.ok(opening && opening.san.length >= 2); // engine plays White
  assert.equal(match.playerTurn, true);
  assert.equal(match.playPlayer('e5').ok, true);
  assert.equal(match.view().playerColor, 'b');
});

test('view exposes legal targets for the player only', () => {
  const match = new ChessMatch({ difficulty: 'casual', playerColor: 'w' });
  const targets = match.view().legalTargets['e2'];
  assert.ok(targets.some((entry) => entry.to === 'e4'));
  assert.ok(targets.some((entry) => entry.to === 'e3'));
});
