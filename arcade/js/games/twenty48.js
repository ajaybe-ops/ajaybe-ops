/**
 * 2048 — pure game logic.
 *
 * Grid is a flat array (0 = empty). `move()` returns the resulting board plus
 * animation metadata: which destination indices were created by a merge, which
 * tile spawned, and how many points were scored. Tile rows/columns are read
 * from the edge being moved towards, so packing needs no offset correction.
 */

const VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class Game2048 {
  constructor({ size = 4, rng = Math.random, target = 2048 } = {}) {
    this.size = size;
    this.rng = rng;
    this.target = target;
    this.reset();
  }

  reset() {
    this.grid = new Array(this.size * this.size).fill(0);
    this.score = 0;
    this.moves = 0;
    this.status = 'playing'; // playing | won | over
    this.keepPlaying = false;
    this.spawn();
    this.spawn();
    return this;
  }

  emptyCells() {
    const cells = [];
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0) cells.push(i);
    return cells;
  }

  spawn() {
    const cells = this.emptyCells();
    if (!cells.length) return null;
    const index = cells[Math.floor(this.rng() * cells.length)];
    this.grid[index] = this.rng() < 0.9 ? 2 : 4;
    return { index, value: this.grid[index] };
  }

  /** @returns {{moved:boolean, gained:number, merges:Array<{index:number,value:number}>, spawned:object|null, won:boolean}} */
  move(direction) {
    const vector = VECTORS[direction];
    const noop = { moved: false, gained: 0, merges: [], spawned: null, won: false };
    if (!vector || this.status === 'over') return noop;

    const { size } = this;
    const before = this.grid.slice();
    const grid = new Array(size * size).fill(0);
    const merges = [];
    let gained = 0;

    for (let line = 0; line < size; line++) {
      // Indices ordered from the edge we are moving towards, inwards.
      const indices = [];
      for (let step = 0; step < size; step++) {
        let x;
        let y;
        if (vector.x !== 0) {
          y = line;
          x = vector.x > 0 ? size - 1 - step : step;
        } else {
          x = line;
          y = vector.y > 0 ? size - 1 - step : step;
        }
        indices.push(y * size + x);
      }

      const values = indices.map((index) => before[index]).filter((value) => value !== 0);
      const result = [];
      for (let i = 0; i < values.length; i++) {
        if (i + 1 < values.length && values[i] === values[i + 1]) {
          const merged = values[i] * 2;
          result.push(merged);
          merges.push({ index: indices[result.length - 1], value: merged });
          gained += merged;
          i++;
        } else {
          result.push(values[i]);
        }
      }

      result.forEach((value, position) => {
        grid[indices[position]] = value;
      });
    }

    if (grid.every((value, index) => value === before[index])) return noop;

    this.grid = grid;
    this.score += gained;
    this.moves += 1;
    const spawned = this.spawn();

    let won = false;
    if (!this.keepPlaying && this.grid.some((value) => value >= this.target)) {
      won = true;
      this.status = 'won';
    } else if (!this.canMove()) {
      this.status = 'over';
    }

    return { moved: true, gained, merges, spawned, won };
  }

  canMove() {
    if (this.emptyCells().length) return true;
    const { size } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = this.grid[y * size + x];
        if (x + 1 < size && this.grid[y * size + x + 1] === value) return true;
        if (y + 1 < size && this.grid[(y + 1) * size + x] === value) return true;
      }
    }
    return false;
  }

  continuePlaying() {
    this.keepPlaying = true;
    this.status = this.canMove() ? 'playing' : 'over';
    return this;
  }

  maxTile() {
    return this.grid.reduce((max, value) => Math.max(max, value), 0);
  }
}
