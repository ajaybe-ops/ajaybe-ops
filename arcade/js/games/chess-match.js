/**
 * Chess match controller — bridges the rules engine (lib/chess.js) to the
 * browser board. Keeps UI concerns out: the view asks for a board snapshot and
 * schedules `playEngine()` after a short "thinking" delay.
 */

import { Chess, findBestMove, indexToSquare, squareToIndex } from '../../../lib/chess.js';

export const DIFFICULTY = {
  casual: { depth: 2, label: 'casual', blurb: 'sees one move ahead' },
  normal: { depth: 3, label: 'normal', blurb: 'sees two moves ahead' },
  sharp: { depth: 4, label: 'sharp', blurb: 'sees three moves ahead' },
};

export class ChessMatch {
  constructor({ difficulty = 'normal', playerColor = 'w', rng = Math.random, fen } = {}) {
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.playerColor = playerColor === 'b' ? 'b' : 'w';
    this.rng = rng;
    this.startFen = fen;
    this.reset();
  }

  reset({ difficulty = this.difficulty, playerColor = this.playerColor } = {}) {
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : this.difficulty;
    this.playerColor = playerColor === 'b' ? 'b' : 'w';
    this.chess = this.startFen ? new Chess(this.startFen) : new Chess();
    this.thinking = false;
    this.lastMove = null;
    this.hintMove = null;
    this.resigned = false;
    return this;
  }

  get depth() {
    return DIFFICULTY[this.difficulty].depth;
  }

  get playerTurn() {
    return this.chess.turn() === this.playerColor && !this.chess.isGameOver() && !this.resigned;
  }

  get gameOver() {
    return this.chess.isGameOver() || this.resigned;
  }

  statusLine() {
    if (this.resigned) return { text: 'You resigned. The machine logs it and forgets.', tone: 'warn' };
    const status = this.chess.status();
    if (status.over) {
      if (status.reason === 'checkmate') {
        const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
        const youWon = (winner === 'White') === (this.playerColor === 'w');
        return { text: `Checkmate — ${winner} wins. ${youWon ? 'You beat the machine.' : 'The machine wins. Try again.'}`, tone: youWon ? 'good' : 'bad' };
      }
      return { text: `Draw — ${status.reason}.`, tone: 'warn' };
    }
    if (this.chess.isCheck()) return { text: `${this.chess.turn() === 'w' ? 'White' : 'Black'} is in check.`, tone: 'warn' };
    return { text: this.playerTurn ? 'Your move.' : 'Machine thinking…', tone: 'muted' };
  }

  playPlayer(input) {
    if (this.gameOver) return { ok: false, error: 'The game is over. Start a new one.' };
    if (!this.playerTurn) return { ok: false, error: 'Not your turn.' };

    const move = this.chess.move(input);
    if (!move) return { ok: false, error: this._hintForIllegal(input) };

    this.lastMove = move;
    this.hintMove = null;
    return { ok: true, move, over: this.chess.isGameOver(), status: this.statusLine() };
  }

  _hintForIllegal(input) {
    const text = typeof input === 'string' ? input.trim() : 'that move';
    return `Illegal move: ${text}. Select a highlighted square to see legal moves.`;
  }

  /** Play the engine's reply for the current side to move. */
  playEngine() {
    if (this.gameOver || this.chess.turn() === this.playerColor) return null;
    const best = findBestMove(this.chess, { depth: this.depth, random: this.rng });
    if (!best) return null;
    const move = this.chess.move({
      from: indexToSquare(best.from),
      to: indexToSquare(best.to),
      promotion: best.promotion ? best.promotion.toLowerCase() : undefined,
    });
    if (!move) return null;
    this.lastMove = move;
    return move;
  }

  hint() {
    if (this.gameOver || !this.playerTurn) return null;
    const best = findBestMove(this.chess, { depth: this.depth });
    if (!best) return null;
    const probe = new Chess(this.chess.fen());
    const played = probe.move({ from: indexToSquare(best.from), to: indexToSquare(best.to), promotion: best.promotion });
    this.hintMove = {
      from: indexToSquare(best.from),
      to: indexToSquare(best.to),
      san: played ? played.san : null,
    };
    return this.hintMove;
  }

  /** Undo the engine reply and your move, keeping the position consistent. */
  undo() {
    if (this.resigned) {
      this.resigned = false;
      return true;
    }
    if (!this.chess.history().length) return false;
    let undone = 0;
    while (undone < 2 && this.chess.history().length) {
      this.chess.undo();
      undone++;
      if (this.chess.turn() === this.playerColor) break;
    }
    this.lastMove = null;
    this.hintMove = null;
    return undone > 0;
  }

  resign() {
    this.resigned = true;
  }

  /** Immutable snapshot for rendering. */
  view() {
    const board = this.chess.rawBoard();
    const squares = [];
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const index = rank * 16 + file;
        const piece = board[index];
        squares.push({
          square: indexToSquare(index),
          piece,
          color: piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null,
          dark: (rank + file) % 2 === 0,
        });
      }
    }

    const legalTargets = {};
    if (this.playerTurn) {
      for (const move of this.chess.moves({ verbose: true })) {
        const from = indexToSquare(move.from);
        const to = indexToSquare(move.to);
        (legalTargets[from] ||= []).push({ to, promotion: move.promotion ? move.promotion.toLowerCase() : null });
      }
    }

    return {
      squares,
      turn: this.chess.turn(),
      playerColor: this.playerColor,
      playerTurn: this.playerTurn,
      legalTargets,
      lastMove: this.lastMove ? { from: this.lastMove.fromSquare, to: this.lastMove.toSquare } : null,
      hint: this.hintMove,
      checkSquare: this.chess.isCheck() ? indexToSquare(this.chess.kingSquare()) : null,
      status: this.statusLine(),
      moves: this.chess.pgnMoves(),
      over: this.gameOver,
      fen: this.chess.fen(),
      checkmate: this.chess.isCheckmate(),
      difficulty: this.difficulty,
      depth: this.depth,
    };
  }
}

export { Chess, findBestMove, indexToSquare, squareToIndex };
