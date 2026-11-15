/**
 * Snake — pure game logic. No DOM, no timers, injectable RNG.
 * The renderer (arcade/js/views/snake.js) owns the animation clock.
 */

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export class SnakeGame {
  constructor({ cols = 20, rows = 20, rng = Math.random, wrap = false } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.rng = rng;
    this.wrap = wrap;
    this.reset();
  }

  reset() {
    const midX = Math.floor(this.cols / 2);
    const midY = Math.floor(this.rows / 2);
    this.body = [
      { x: midX, y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
    ];
    this.direction = 'right';
    this.queue = [];
    this.score = 0;
    this.ticks = 0;
    this.status = 'ready'; // ready | playing | dead | won
    this.food = this._spawnFood();
    return this;
  }

  start() {
    if (this.status === 'ready') this.status = 'playing';
    return this;
  }

  /** Queue a turn; reverses are dropped, and at most two turns can buffer per tick. */
  setDirection(direction) {
    if (!DIRECTIONS[direction]) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.direction;
    if (direction === last || direction === OPPOSITE[last]) return false;
    if (this.queue.length >= 2) return false;
    this.queue.push(direction);
    return true;
  }

  _spawnFood() {
    const taken = new Set(this.body.map((segment) => segment.y * this.cols + segment.x));
    const free = [];
    for (let i = 0; i < this.cols * this.rows; i++) if (!taken.has(i)) free.push(i);
    if (free.length === 0) return null;
    const index = free[Math.floor(this.rng() * free.length)];
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }

  /** Advance one tick. Returns a result object the renderer can animate. */
  step() {
    if (this.status === 'dead' || this.status === 'won') return { dead: true, ate: false, score: this.score };

    if (this.queue.length) this.direction = this.queue.shift();
    const delta = DIRECTIONS[this.direction];
    const head = this.body[0];
    let next = { x: head.x + delta.x, y: head.y + delta.y };

    if (this.wrap) {
      next = { x: (next.x + this.cols) % this.cols, y: (next.y + this.rows) % this.rows };
    } else if (next.x < 0 || next.y < 0 || next.x >= this.cols || next.y >= this.rows) {
      this.status = 'dead';
      return { dead: true, ate: false, score: this.score, reason: 'wall', head: next };
    }

    // The tail vacates this tick unless we are growing, so it is not a collision.
    const willEat = this.food && next.x === this.food.x && next.y === this.food.y;
    const body = willEat ? this.body : this.body.slice(0, -1);
    if (body.some((segment) => segment.x === next.x && segment.y === next.y)) {
      this.status = 'dead';
      return { dead: true, ate: false, score: this.score, reason: 'self', head: next };
    }

    this.body.unshift(next);
    if (willEat) {
      this.score += 10;
      this.food = this._spawnFood();
      if (!this.food) {
        this.status = 'won';
        return { dead: false, ate: true, won: true, score: this.score, head: next };
      }
    } else {
      this.body.pop();
    }

    this.ticks += 1;
    return { dead: false, ate: willEat, won: false, score: this.score, head: next };
  }

  /** "easy" | "normal" | "hard" — tick interval in ms, derived from score. */
  tickInterval(level = 'normal') {
    const base = level === 'easy' ? 190 : level === 'hard' ? 80 : 130;
    const floor = level === 'easy' ? 120 : level === 'hard' ? 55 : 80;
    return Math.max(floor, base - Math.floor(this.score / 10) * 6);
  }
}
