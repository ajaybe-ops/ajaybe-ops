/**
 * Tic-Tac-Toe — two-player hot-seat plus an optional perfect AI.
 * `ai = true` gives the visitor a game they can never beat (best case: draw),
 * with a little randomness among equally-good moves so it isn't repetitious.
 */

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export class TicTacToe {
  constructor({ ai = false, rng = Math.random, human = 'X' } = {}) {
    this.ai = ai;
    this.rng = rng;
    this.human = human;
    this.aiMark = human === 'X' ? 'O' : 'X';
    this.reset();
  }

  reset() {
    this.board = new Array(9).fill(null);
    this.turn = 'X';
    this.status = 'playing'; // playing | won | draw
    this.winner = null;
    this.winningLine = null;
    this.history = [];
    this.lastMove = null;
    return this;
  }

  play(index) {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    if (!Number.isInteger(index) || index < 0 || index > 8) return { ok: false, reason: 'out-of-range' };
    if (this.board[index]) return { ok: false, reason: 'occupied' };
    return this._apply(index);
  }

  _apply(index) {
    this.board[index] = this.turn;
    this.history.push(index);
    this.lastMove = index;
    const line = LINES.find((candidate) => candidate.every((slot) => this.board[slot] === this.turn));
    if (line) {
      this.status = 'won';
      this.winner = this.turn;
      this.winningLine = line;
    } else if (this.board.every(Boolean)) {
      this.status = 'draw';
    } else {
      this.turn = this.turn === 'X' ? 'O' : 'X';
    }
    return { ok: true, index, status: this.status, winner: this.winner, line: this.winningLine };
  }

  undo() {
    const index = this.history.pop();
    if (index === undefined) return false;
    this.board[index] = null;
    this.status = 'playing';
    this.winner = null;
    this.winningLine = null;
    this.turn = this.history.length % 2 === 0 ? 'X' : 'O';
    this.lastMove = this.history.length ? this.history[this.history.length - 1] : null;
    return true;
  }

  available() {
    return this.board.reduce((list, value, index) => {
      if (!value) list.push(index);
      return list;
    }, []);
  }

  /** Perfect play via minimax; `difficulty` below 3 adds occasional imperfection. */
  aiMove({ difficulty = 3 } = {}) {
    if (this.status !== 'playing' || !this.ai) return null;
    const options = this.available();
    if (!options.length) return null;

    if (difficulty < 3 && this.rng() < (difficulty === 1 ? 0.45 : 0.18)) {
      return options[Math.floor(this.rng() * options.length)];
    }

    const scored = options.map((index) => {
      this.board[index] = this.aiMark;
      const score = this._minimax(this.aiMark);
      this.board[index] = null;
      return { index, score };
    });

    const best = Math.max(...scored.map((entry) => entry.score));
    const top = scored.filter((entry) => entry.score === best);
    return top[Math.floor(this.rng() * top.length)].index;
  }

  _minimax(player) {
    const winner = this._winner();
    if (winner === this.aiMark) return 10;
    if (winner && winner !== this.aiMark) return -10;
    if (this.board.every(Boolean)) return 0;

    const next = player === this.aiMark ? this.human : this.aiMark;
    let best = next === this.aiMark ? -Infinity : Infinity;
    for (const index of this.available()) {
      this.board[index] = next;
      const score = this._minimax(next);
      this.board[index] = null;
      best = next === this.aiMark ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }

  _winner() {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) return this.board[a];
    }
    return null;
  }
}
