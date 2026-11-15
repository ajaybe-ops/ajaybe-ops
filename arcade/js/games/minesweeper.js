/**
 * Minesweeper — pure game logic with a guaranteed-safe first click and
 * flood-fill reveal. Coordinates use x (column) / y (row), both 0-based.
 */

export class Minesweeper {
  constructor({ cols = 9, rows = 9, mines = 10, rng = Math.random } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.mines = Math.min(mines, cols * rows - 9);
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.cells = Array.from({ length: this.cols * this.rows }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }));
    this.armed = false;
    this.status = 'ready'; // ready | playing | won | lost
    this.revealedCount = 0;
    this.flagCount = 0;
    this.exploded = null;
    this.startedAt = null;
    return this;
  }

  index(x, y) {
    return y * this.cols + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  neighbors(x, y) {
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (this.inBounds(x + dx, y + dy)) list.push({ x: x + dx, y: y + dy, index: this.index(x + dx, y + dy) });
      }
    }
    return list;
  }

  /** Place mines after the first click, excluding the clicked cell and its ring. */
  _arm(safeX, safeY) {
    const excluded = new Set([this.index(safeX, safeY), ...this.neighbors(safeX, safeY).map((n) => n.index)]);
    const candidates = [];
    for (let i = 0; i < this.cells.length; i++) if (!excluded.has(i)) candidates.push(i);

    let remaining = this.mines;
    while (remaining > 0 && candidates.length) {
      const pick = Math.floor(this.rng() * candidates.length);
      const index = candidates.splice(pick, 1)[0];
      this.cells[index].mine = true;
      remaining--;
    }

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.cells[this.index(x, y)];
        cell.adjacent = this.neighbors(x, y).filter((n) => this.cells[n.index].mine).length;
      }
    }
    this.armed = true;
    this.startedAt = Date.now();
  }

  reveal(x, y) {
    if (!this.inBounds(x, y) || this.status === 'won' || this.status === 'lost') return { changed: false };
    const cell = this.cells[this.index(x, y)];
    if (cell.flagged) return { changed: false };
    if (!this.armed) {
      this._arm(x, y);
      this.status = 'playing';
    }
    if (cell.revealed) {
      // Reveal-neighbours (chord) when the flag count already matches.
      return this._chord(x, y);
    }

    if (cell.mine) {
      cell.revealed = true;
      this.exploded = { x, y };
      this.status = 'lost';
      return { changed: true, lost: true };
    }

    const changed = [];
    const stack = [{ x, y }];
    const seen = new Set();
    while (stack.length) {
      const current = stack.pop();
      const index = this.index(current.x, current.y);
      if (seen.has(index)) continue;
      seen.add(index);
      const target = this.cells[index];
      if (target.revealed || target.flagged || target.mine) continue;
      target.revealed = true;
      this.revealedCount += 1;
      changed.push({ x: current.x, y: current.y, index });
      if (target.adjacent === 0) {
        for (const neighbor of this.neighbors(current.x, current.y)) {
          if (!this.cells[neighbor.index].revealed && !this.cells[neighbor.index].mine) stack.push(neighbor);
        }
      }
    }

    if (this.revealedCount === this.cells.length - this.mines) this.status = 'won';
    return { changed: true, cells: changed, won: this.status === 'won' };
  }

  toggleFlag(x, y) {
    if (!this.inBounds(x, y) || this.status === 'won' || this.status === 'lost') return { changed: false };
    const cell = this.cells[this.index(x, y)];
    if (cell.revealed) return { changed: false };
    cell.flagged = !cell.flagged;
    this.flagCount += cell.flagged ? 1 : -1;
    if (this.status === 'ready') this.status = 'playing';
    return { changed: true, flagged: cell.flagged };
  }

  _chord(x, y) {
    const cell = this.cells[this.index(x, y)];
    if (!cell.revealed || cell.adjacent === 0) return { changed: false };
    const ring = this.neighbors(x, y);
    const flags = ring.filter((n) => this.cells[n.index].flagged).length;
    if (flags !== cell.adjacent) return { changed: false };

    const changed = [];
    for (const neighbor of ring) {
      const target = this.cells[neighbor.index];
      if (target.revealed || target.flagged) continue;
      const result = this.reveal(neighbor.x, neighbor.y);
      if (result.changed && result.cells) changed.push(...result.cells);
      if (result.lost) return { changed: true, cells: changed, lost: true };
    }
    return { changed: changed.length > 0, cells: changed, won: this.status === 'won' };
  }

  remainingMines() {
    return Math.max(0, this.mines - this.flagCount);
  }

  /** Snapshot for the "you lost" reveal. */
  revealAllMines() {
    for (const cell of this.cells) if (cell.mine) cell.revealed = true;
  }
}
