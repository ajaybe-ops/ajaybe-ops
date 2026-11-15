/** 2048 — DOM renderer around the pure Game2048 logic. */

import { Game2048 } from '../games/twenty48.js';
import { el, announce, readStore, writeStore } from '../ui.js';

export function mount2048(panel) {
  const game = new Game2048();
  let best = readStore('2048:best', 0);
  let visible = false;
  let undoSnapshot = null;
  let animToken = 0;

  const gridEl = el('div', {
    class: 'grid-2048',
    tabindex: '0',
    role: 'group',
    'aria-label': '2048 board. Use arrow keys or WASD to slide tiles.',
    'aria-describedby': 'g2048-status',
  });

  const tiles = Array.from({ length: 16 }, () => el('div', { class: 'tile', 'aria-hidden': 'true' }));
  gridEl.append(...tiles);

  const scoreEl = el('b', { text: '0' });
  const bestEl = el('b', { text: String(best) });
  const maxEl = el('b', { text: '2' });
  const statusEl = el('p', { class: 'status-line', id: 'g2048-status', 'data-tone': 'muted', text: 'slide the grid' });

  const overlay = el('div', { class: 'overlay', hidden: true },
    el('h3', { text: 'NO MOVES' }),
    el('p', { text: 'The grid is full and nothing can merge.' }),
    el('button', { class: 'btn primary', type: 'button', text: 'new run', onclick: () => newRun() }));

  const stage = el('div', { class: 'snake-stage', style: 'display:grid;place-items:center' }, gridEl, overlay);

  const undoBtn = el('button', { class: 'btn', type: 'button', text: 'undo', onclick: () => undo() });

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: '2048' }),
      el('p', { class: 'panel-note', text: 'Merge equal tiles. Reach 2048 to win — then keep going if you want.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' }, stage),
      el('div', { class: 'stack' },
        el('div', { class: 'readout' },
          el('span', {}, 'score ', scoreEl),
          el('span', {}, 'best ', bestEl),
          el('span', {}, 'max ', maxEl)),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', text: 'new run', onclick: () => newRun() }),
          undoBtn),
        statusEl,
        el('p', { class: 'panel-note' }, 'Keyboard: arrow keys or WASD. Touch: swipe the grid.'))));

  function describeGrid() {
    const rows = [];
    for (let y = 0; y < 4; y++) {
      rows.push(`row ${y + 1}: ${game.grid.slice(y * 4, y * 4 + 4).map((v) => v || 'empty').join(', ')}`);
    }
    return rows.join('. ');
  }

  function render(animation = {}) {
    const token = ++animToken;
    game.grid.forEach((value, index) => {
      const tile = tiles[index];
      tile.textContent = value ? String(value) : '';
      if (value) tile.dataset.value = String(value);
      else delete tile.dataset.value;
      tile.className = 'tile';
      if (animation.merges?.includes(index)) tile.classList.add('merged');
      if (animation.spawned === index) tile.classList.add('spawned');
    });

    scoreEl.textContent = String(game.score);
    maxEl.textContent = String(game.maxTile());
    if (game.score > best) {
      best = game.score;
      writeStore('2048:best', best);
    }
    bestEl.textContent = String(best);
    gridEl.setAttribute('aria-label', `2048 board. Score ${game.score}. ${describeGrid()}`);
    undoBtn.disabled = !undoSnapshot;

    if (token === animToken) {
      setTimeout(() => {
        for (const tile of tiles) tile.classList.remove('merged', 'spawned');
      }, 200);
    }
  }

  function newRun() {
    game.reset();
    undoSnapshot = null;
    overlay.hidden = true;
    statusEl.textContent = 'slide the grid';
    statusEl.dataset.tone = 'muted';
    render();
    announce('New 2048 run. Use the arrow keys to slide tiles.');
  }

  function undo() {
    if (!undoSnapshot) return;
    game.grid = undoSnapshot.grid.slice();
    game.score = undoSnapshot.score;
    game.status = 'playing';
    undoSnapshot = null;
    overlay.hidden = true;
    statusEl.textContent = 'move undone';
    statusEl.dataset.tone = 'muted';
    render();
    announce('Move undone.');
  }

  function slide(direction) {
    if (game.status === 'over') {
      announce('No moves left. Start a new run.');
      return;
    }
    const snapshot = { grid: game.grid.slice(), score: game.score };
    const result = game.move(direction);
    if (!result.moved) {
      statusEl.textContent = `cannot slide ${direction}`;
      statusEl.dataset.tone = 'muted';
      render();
      return;
    }

    undoSnapshot = snapshot;
    const mergedIndices = result.merges.map((entry) => entry.index);
    render({ merges: mergedIndices, spawned: result.spawned?.index });

    if (result.won) {
      overlay.hidden = false;
      overlay.replaceChildren(
        el('h3', { text: '2048 REACHED' }),
        el('p', { text: `Score ${game.score}. The grid is yours — or keep stacking.` }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'keep going',
          onclick: () => { game.continuePlaying(); overlay.hidden = true; announce('Continuing past 2048.'); },
        }),
        el('button', { class: 'btn ghost', type: 'button', text: 'new run', onclick: () => newRun() }));
      announce(`2048 reached. Score ${game.score}.`);
      return;
    }

    if (game.status === 'over') {
      overlay.hidden = false;
      announce(`No moves left. Final score ${game.score}.`);
      statusEl.textContent = 'no moves left';
      statusEl.dataset.tone = 'bad';
      return;
    }

    statusEl.textContent = result.gained > 0 ? `+${result.gained} points` : `slid ${direction}`;
    statusEl.dataset.tone = 'muted';
    announce(`Slid ${direction}. Score ${game.score}.`);
  }

  function onKey(event) {
    if (!visible) return;
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down',
      h: 'left', l: 'right', k: 'up', j: 'down',
    };
    if (!map[event.key]) return;

    // Do not steal arrows from form controls; anywhere else on this panel is fair game.
    const active = document.activeElement;
    const tag = active?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (active !== document.body && !panel.contains(active)) return;

    event.preventDefault();
    slide(map[event.key]);
  }

  let touchStart = null;
  gridEl.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  gridEl.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  gridEl.addEventListener('touchmove', (event) => {
    if (touchStart) event.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', onKey);

  render();

  return {
    hint: 'arrows / WASD to slide • swipe on mobile',
    show() { visible = true; render(); },
    hide() { visible = false; },
    destroy() { window.removeEventListener('keydown', onKey); },
  };
}
