/** Tic-Tac-Toe — hot-seat two player, or a perfect engine. */

import { TicTacToe } from '../games/tictactoe.js';
import { el, announce, rovingGrid, readStore, writeStore } from '../ui.js';

const GLYPHS = { X: '✕', O: '◯' };

export function mountTicTacToe(panel) {
  let mode = readStore('ttt:mode', 'ai') === 'human' ? 'human' : 'ai';
  let game = new TicTacToe({ ai: mode === 'ai' });
  let visible = false;
  let lock = false;
  const score = { X: 0, O: 0, D: 0 };

  const gridEl = el('div', { class: 'ttt-grid', role: 'group', 'aria-label': 'Tic-tac-toe board. Top row first.' });
  const statusEl = el('p', { class: 'status-line', 'data-tone': 'muted' });
  const scoreEl = el('div', { class: 'readout' });

  const cells = Array.from({ length: 9 }, (_, index) => {
    const button = el('button', {
      class: 'ttt-cell',
      type: 'button',
      'data-index': String(index),
      'aria-label': `cell ${index + 1}, empty`,
      onclick: () => handleCell(index),
    });
    return button;
  });
  gridEl.append(...cells);
  rovingGrid(gridEl, { columns: 3 });

  const modeEl = el('select', { 'aria-label': 'Opponent' },
    el('option', { value: 'ai', text: 'vs. machine (unbeatable)' }),
    el('option', { value: 'human', text: 'two players, one screen' }));
  modeEl.value = mode;

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'tic-tac-toe' }),
      el('p', { class: 'panel-note', text: 'The machine plays perfect tic-tac-toe. A draw is the best available result against it.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' }, gridEl),
      el('div', { class: 'stack' },
        statusEl,
        scoreEl,
        el('div', { class: 'row' },
          el('label', { class: 'field' }, 'mode', modeEl),
          el('button', { class: 'btn primary', type: 'button', text: 'new round', onclick: () => newRound() }),
          el('button', { class: 'btn', type: 'button', text: 'undo', onclick: () => undo() })),
        el('p', { class: 'panel-note' }, 'Keyboard: arrows move, Enter places a mark.'))));

  function newRound() {
    game = new TicTacToe({ ai: mode === 'ai' });
    lock = false;
    render();
    announce('New round. X starts.');
  }

  function handleCell(index) {
    if (lock) return;
    if (mode === 'ai' && game.turn !== game.human) return;
    const result = game.play(index);
    if (!result.ok) return;
    render();
    if (game.status !== 'playing') return finish();
    if (mode === 'ai') {
      lock = true;
      window.setTimeout(() => {
        const move = game.aiMove({ difficulty: 3 });
        if (move != null) game.play(move);
        lock = false;
        render();
        if (game.status !== 'playing') finish();
      }, 240);
    }
  }

  function finish() {
    if (game.status === 'draw') {
      score.D += 1;
      announce('Draw. Nobody wins this one.');
    } else {
      score[game.winner] += 1;
      if (mode === 'ai') {
        announce(game.winner === game.human ? 'You win. That should be impossible.' : 'The machine wins.');
      } else {
        announce(`${game.winner} wins.`);
      }
    }
    render();
  }

  function undo() {
    if (lock) return;
    if (!game.history.length) {
      announce('Nothing to undo.');
      return;
    }
    if (mode === 'ai') {
      game.undo();
      if (game.history.length && game.turn === game.human) game.undo();
    } else {
      game.undo();
    }
    lock = false;
    render();
    announce('Move undone.');
  }

  function render() {
    game.board.forEach((mark, index) => {
      const cell = cells[index];
      cell.textContent = mark ? GLYPHS[mark] : '';
      if (mark) cell.dataset.mark = mark;
      else delete cell.dataset.mark;
      const winning = game.winningLine?.includes(index);
      cell.dataset.win = winning ? 'true' : 'false';
      cell.disabled = Boolean(mark) || game.status !== 'playing';
      cell.setAttribute('aria-label', `cell ${index + 1}, ${mark ? (mark === 'X' ? 'X' : 'O') : 'empty'}${winning ? ', winning line' : ''}`);
    });

    if (game.status === 'won') {
      statusEl.textContent = `${game.winner} wins.`;
      statusEl.dataset.tone = 'good';
    } else if (game.status === 'draw') {
      statusEl.textContent = 'Draw.';
      statusEl.dataset.tone = 'warn';
    } else {
      statusEl.textContent = `turn: ${game.turn}${mode === 'ai' && game.turn !== game.human ? ' (machine)' : ''}`;
      statusEl.dataset.tone = 'muted';
    }

    scoreEl.replaceChildren(
      el('span', {}, 'X ', el('b', { text: String(score.X) })),
      el('span', {}, 'O ', el('b', { text: String(score.O) })),
      el('span', {}, 'draws ', el('b', { text: String(score.D) })));
  }

  modeEl.addEventListener('change', () => {
    mode = modeEl.value;
    writeStore('ttt:mode', mode);
    newRound();
  });

  render();

  return {
    hint: 'click a cell • arrows move • Enter places',
    show() { visible = true; render(); },
    hide() { visible = false; },
  };
}
