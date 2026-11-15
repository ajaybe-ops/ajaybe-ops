/** Minesweeper — accessible grid with first-click safety, flags and chording. */

import { Minesweeper } from '../games/minesweeper.js';
import { el, announce, formatClock, rovingGrid, readStore, writeStore } from '../ui.js';

const LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10, label: 'easy — 9×9, 10 mines' },
  medium: { cols: 12, rows: 12, mines: 22, label: 'medium — 12×12, 22 mines' },
  hard: { cols: 16, rows: 16, mines: 45, label: 'hard — 16×16, 45 mines' },
};

export function mountMines(panel) {
  const savedLevel = readStore('mines:level', 'easy');
  let level = LEVELS[savedLevel] ? savedLevel : 'easy';
  let game = new Minesweeper(LEVELS[level]);
  let visible = false;
  let timerId = 0;
  let suppressClick = false;
  let pressTimer = 0;

  const gridEl = el('div', { class: 'mine-grid', role: 'group', 'aria-label': 'Minesweeper grid' });
  const flagEl = el('b', { text: String(game.mines) });
  const timeEl = el('b', { text: '00:00' });
  const stateEl = el('b', { text: 'ready' });
  const statusEl = el('p', { class: 'status-line', 'data-tone': 'muted', text: 'First click is always safe.' });

  const overlay = el('div', { class: 'overlay', hidden: true });

  const levelEl = el('select', { 'aria-label': 'Difficulty' },
    Object.entries(LEVELS).map(([value, config]) => {
      const option = el('option', { value, text: config.label });
      if (value === level) option.selected = true;
      return option;
    }));

  const stage = el('div', { style: 'position:relative;display:grid;place-items:center;width:100%' }, gridEl, overlay);

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'minesweeper' }),
      el('p', { class: 'panel-note', text: 'Left click reveals. Right click or long-press flags. Chording works on opened numbers.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' }, stage),
      el('div', { class: 'stack' },
        el('div', { class: 'readout' },
          el('span', {}, 'flags left ', flagEl),
          el('span', {}, 'time ', timeEl),
          el('span', {}, 'state ', stateEl)),
        el('div', { class: 'row' },
          el('label', { class: 'field' }, 'level', levelEl),
          el('button', { class: 'btn primary', type: 'button', text: 'new grid', onclick: () => newGrid() })),
        statusEl,
        el('p', { class: 'panel-note' }, 'Keyboard: arrows move, Enter reveals, F flags.'))));

  let roving = null;
  let cells = [];

  function newGrid() {
    clearInterval(timerId);
    timerId = 0;
    game = new Minesweeper(LEVELS[level]);
    buildGrid();
    overlay.hidden = true;
    timeEl.textContent = '00:00';
    stateEl.textContent = 'ready';
    statusEl.textContent = 'First click is always safe.';
    statusEl.dataset.tone = 'muted';
    announce(`New ${level} grid.`);
  }

  function startTimer() {
    clearInterval(timerId);
    timerId = window.setInterval(() => {
      if (!visible) return;
      const elapsed = game.startedAt ? (Date.now() - game.startedAt) / 1000 : 0;
      timeEl.textContent = formatClock(elapsed);
    }, 500);
  }

  function buildGrid() {
    gridEl.style.gridTemplateColumns = `repeat(${game.cols}, 1fr)`;
    gridEl.replaceChildren();
    cells = [];
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        const index = game.index(x, y);
        const button = el('button', {
          class: 'cell',
          type: 'button',
          'data-index': String(index),
          'data-state': 'hidden',
          'aria-label': `row ${y + 1} column ${x + 1}, unrevealed`,
          onclick: () => handleReveal(x, y),
          oncontextmenu: (event) => { event.preventDefault(); handleFlag(x, y); },
        });

        button.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse') return;
          clearTimeout(pressTimer);
          suppressClick = false;
          pressTimer = window.setTimeout(() => {
            suppressClick = true;
            handleFlag(x, y);
          }, 420);
        });
        const cancelPress = () => clearTimeout(pressTimer);
        button.addEventListener('pointerup', cancelPress);
        button.addEventListener('pointerleave', cancelPress);
        button.addEventListener('pointercancel', cancelPress);

        cells.push(button);
        gridEl.append(button);
      }
    }

    roving = rovingGrid(gridEl, { columns: game.cols });
    roving.init();
    render();
  }

  function handleReveal(x, y) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (game.status === 'won' || game.status === 'lost') return;
    const result = game.reveal(x, y);
    if (!result.changed) return;
    if (!timerId && game.status === 'playing') startTimer();
    if (game.status === 'lost') finishLoss();
    else if (result.won || game.status === 'won') finishWin();
    render();
  }

  function handleFlag(x, y) {
    if (game.status === 'won' || game.status === 'lost') return;
    const result = game.toggleFlag(x, y);
    if (!result.changed) return;
    if (!timerId && game.status === 'playing') startTimer();
    render();
    announce(result.flagged ? 'Flag placed.' : 'Flag removed.');
  }

  function finishLoss() {
    clearInterval(timerId);
    timerId = 0;
    game.revealAllMines();
    stateEl.textContent = 'lost';
    statusEl.textContent = 'Mine triggered. The grid is revealed — try again.';
    statusEl.dataset.tone = 'bad';
    overlay.hidden = false;
    overlay.replaceChildren(
      el('h3', { text: 'SIGNAL LOST' }),
      el('p', { text: `You hit a mine after ${timeEl.textContent}.` }),
      el('button', { class: 'btn primary', type: 'button', text: 'new grid', onclick: () => newGrid() }));
    announce('You hit a mine. Game over.');
  }

  function finishWin() {
    clearInterval(timerId);
    timerId = 0;
    stateEl.textContent = 'cleared';
    statusEl.textContent = `Grid cleared in ${timeEl.textContent}.`;
    statusEl.dataset.tone = 'good';
    overlay.hidden = false;
    overlay.replaceChildren(
      el('h3', { text: 'GRID CLEARED' }),
      el('p', { text: `All safe cells revealed in ${timeEl.textContent}.` }),
      el('button', { class: 'btn primary', type: 'button', text: 'new grid', onclick: () => newGrid() }));
    announce('Grid cleared. You win.');
  }

  function render() {
    stateEl.textContent = game.status;
    flagEl.textContent = String(game.remainingMines());

    const revealMines = game.status === 'lost';
    game.cells.forEach((cell, index) => {
      const button = cells[index];
      if (!button) return;
      const x = index % game.cols;
      const y = Math.floor(index / game.cols);
      let state = 'hidden';
      let text = '';
      if (cell.revealed && cell.mine) {
        state = game.exploded && game.exploded.x === x && game.exploded.y === y ? 'exploded' : 'mine';
        text = '✳';
      } else if (cell.revealed) {
        state = 'revealed';
        text = cell.adjacent ? String(cell.adjacent) : '';
      } else if (cell.flagged) {
        state = 'flagged';
        text = '⚑';
      }
      if (!cell.revealed && revealMines && cell.mine) {
        state = 'mine';
        text = '✳';
      }

      button.dataset.state = state;
      button.textContent = text;
      if (cell.adjacent) button.dataset.n = String(cell.adjacent);
      else delete button.dataset.n;
      button.disabled = game.status === 'won' || game.status === 'lost';

      const status = cell.flagged ? 'flagged' : cell.revealed
        ? (cell.mine ? 'mine' : cell.adjacent ? `${cell.adjacent} adjacent mines` : 'clear')
        : 'unrevealed';
      button.setAttribute('aria-label', `row ${y + 1} column ${x + 1}, ${status}`);
    });

    flagEl.textContent = String(game.remainingMines());
  }

  levelEl.addEventListener('change', () => {
    level = levelEl.value;
    writeStore('mines:level', level);
    newGrid();
  });

  gridEl.addEventListener('keydown', (event) => {
    if (event.key !== 'f' && event.key !== 'F') return;
    const index = Number(document.activeElement?.dataset?.index);
    if (Number.isNaN(index) || document.activeElement?.dataset?.index == null) return;
    event.preventDefault();
    handleFlag(index % game.cols, Math.floor(index / game.cols));
  });

  buildGrid();

  return {
    hint: 'click reveal • right-click / F flag • arrows move',
    show() {
      visible = true;
      if (game.status === 'playing' && !timerId) startTimer();
      roving?.sync();
    },
    hide() {
      visible = false;
    },
    destroy() {
      clearInterval(timerId);
      clearTimeout(pressTimer);
    },
  };
}
