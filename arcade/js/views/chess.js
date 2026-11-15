/** Chess — playable board against the built-in engine. */

import { ChessMatch, DIFFICULTY } from '../games/chess-match.js';
import { el, announce, rovingGrid, readStore, writeStore } from '../ui.js';

const GLYPHS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const PIECE_NAMES = {
  K: 'white king', Q: 'white queen', R: 'white rook', B: 'white bishop', N: 'white knight', P: 'white pawn',
  k: 'black king', q: 'black queen', r: 'black rook', b: 'black bishop', n: 'black knight', p: 'black pawn',
};

const PROMO_GLYPHS = { q: '♕', r: '♖', b: '♗', n: '♘' };

export function mountChess(panel) {
  const savedDifficulty = readStore('chess:difficulty', 'normal');
  const savedSide = readStore('chess:side', 'w');
  const match = new ChessMatch({
    difficulty: DIFFICULTY[savedDifficulty] ? savedDifficulty : 'normal',
    playerColor: savedSide === 'b' ? 'b' : 'w',
  });

  let selected = null;
  let thinking = false;
  let engineTimer = null;
  let pendingPromotion = null;
  let resignArmed = false;

  /* --------------------------------------------------------------- markup */

  const boardEl = el('div', { class: 'chess-board', role: 'group', 'aria-label': 'Chess board', 'aria-describedby': 'chess-status' });
  const statusEl = el('p', { class: 'status-line', id: 'chess-status', 'data-tone': 'muted' });
  const readoutEl = el('div', { class: 'readout' });
  const movesEl = el('div', { class: 'moves', role: 'log', 'aria-label': 'Move list' });
  const promoEl = el('div', { class: 'promo', hidden: true, role: 'group', 'aria-label': 'Choose promotion piece' });

  const difficultyEl = el('select', { id: 'chess-difficulty', 'aria-label': 'Engine strength' },
    Object.entries(DIFFICULTY).map(([key, config]) => {
      const option = el('option', { value: key, text: `${config.label} — ${config.blurb}` });
      if (key === match.difficulty) option.selected = true;
      return option;
    }));

  const sideEl = el('select', { id: 'chess-side', 'aria-label': 'Play as' },
    el('option', { value: 'w', text: 'white (you move first)' }),
    el('option', { value: 'b', text: 'black (machine opens)' }));
  sideEl.value = match.playerColor;

  const newGameBtn = el('button', { class: 'btn primary', type: 'button' }, 'new game');
  const undoBtn = el('button', { class: 'btn', type: 'button' }, 'undo');
  const hintBtn = el('button', { class: 'btn', type: 'button' }, 'hint');
  const resignBtn = el('button', { class: 'btn danger', type: 'button' }, 'resign');
  const flipBtn = el('button', { class: 'btn ghost', type: 'button' }, 'flip board');
  const fenBtn = el('button', { class: 'btn ghost', type: 'button' }, 'copy FEN');

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'chess' }),
      el('p', { class: 'panel-note', text: 'You vs. a local alpha-beta engine. No server, no waiting.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' },
        readoutEl,
        boardEl,
        promoEl),
      el('div', { class: 'stack' },
        statusEl,
        el('div', { class: 'row' },
          el('label', { class: 'field', for: 'chess-difficulty' }, 'engine', difficultyEl),
          el('label', { class: 'field', for: 'chess-side' }, 'side', sideEl)),
        el('div', { class: 'row' }, newGameBtn, undoBtn, hintBtn),
        el('div', { class: 'row' }, resignBtn, flipBtn, fenBtn),
        movesEl,
        el('p', { class: 'panel-note' },
          'Want an asynchronous game? Open a ',
          el('a', { href: 'https://github.com/ajaybe-ops/ajaybe-ops/issues/new?template=chess.yml', target: '_blank', rel: 'noopener' }, 'chess challenge issue'),
          ' — the bot replies with the board in the thread.'))),
  );

  /* --------------------------------------------------------------- board */

  /** 64 persistent buttons, keyed by algebraic square. */
  const squareEls = new Map();
  for (const file of 'abcdefgh') {
    for (const rank of '12345678') {
      const square = file + rank;
      const button = el('button', {
        class: 'sq',
        type: 'button',
        'data-square': square,
        'aria-label': square,
        onclick: () => onSquare(square),
      });
      squareEls.set(square, button);
      boardEl.append(button);
    }
  }

  let visualOrder = [];
  let flipped = false;

  const roving = rovingGrid(boardEl, { columns: 8, order: () => visualOrder });

  function pieceAt(square, view) {
    return view.squares.find((entry) => entry.square === square) || null;
  }

  function onSquare(square) {
    if (pendingPromotion) return;
    if (thinking) { announce('The machine is still thinking.'); return; }
    const view = match.view();
    if (view.over) { announce('Game over. Start a new game.'); return; }

    const target = pieceAt(square, view);
    const legal = selected ? (view.legalTargets[selected] || []) : [];
    const move = legal.find((entry) => entry.to === square);

    if (move) {
      if (move.promotion) {
        askPromotion(selected, square);
        return;
      }
      applyMove(selected, square, null);
      return;
    }

    if (target?.piece && target.color === match.playerColor) {
      selected = square;
      render();
      const count = (match.view().legalTargets[square] || []).length;
      announce(`${PIECE_NAMES[target.piece]} on ${square} selected. ${count} legal move${count === 1 ? '' : 's'}.`);
      return;
    }

    if (selected) {
      selected = null;
      render();
      announce(`${square} is not a legal destination.`);
      return;
    }

    announce(`${square} is empty. Select one of your pieces.`);
  }

  function askPromotion(from, to) {
    pendingPromotion = { from, to };
    promoEl.hidden = false;
    promoEl.replaceChildren(
      el('span', { text: 'promote to:' }),
      ...['q', 'r', 'b', 'n'].map((piece) => el('button', {
        type: 'button',
        'aria-label': `Promote to ${piece === 'q' ? 'queen' : piece === 'r' ? 'rook' : piece === 'b' ? 'bishop' : 'knight'}`,
        onclick: () => {
          promoEl.hidden = true;
          const pending = pendingPromotion;
          pendingPromotion = null;
          if (pending) applyMove(pending.from, pending.to, piece);
        },
      }, PROMO_GLYPHS[piece])),
      el('button', {
        class: 'btn ghost', type: 'button', text: 'cancel',
        onclick: () => { pendingPromotion = null; promoEl.hidden = true; render(); },
      }));
    promoEl.querySelector('button')?.focus();
    announce('Choose a promotion piece.');
  }

  function applyMove(from, to, promotion) {
    const result = match.playPlayer({ from, to, promotion });
    if (!result.ok) {
      announce(result.error);
      return;
    }
    selected = null;
    render();
    announce(`You played ${result.move.san}.${match.gameOver ? '' : ''}`);
    if (!match.gameOver) scheduleEngine();
  }

  function scheduleEngine() {
    thinking = true;
    render();
    clearTimeout(engineTimer);
    engineTimer = setTimeout(() => {
      const move = match.playEngine();
      thinking = false;
      render();
      if (move) {
        announce(`Machine played ${move.san}. ${match.statusLine().text}`);
      }
    }, 280);
  }

  function render() {
    const view = match.view();
    const targets = selected ? (view.legalTargets[selected] || []) : [];
    const targetMap = new Map(targets.map((entry) => [entry.to, entry]));

    const order = view.squares.map((entry) => entry.square);
    if (flipped) order.reverse();
    visualOrder = order.map((square) => squareEls.get(square));
    for (const button of visualOrder) boardEl.append(button);
    roving.sync();

    for (const entry of view.squares) {
      const button = squareEls.get(entry.square);
      const isTarget = targetMap.has(entry.square);
      const classes = ['sq', entry.dark ? 'dark' : 'light'];
      if (selected === entry.square) classes.push('sel');
      if (isTarget) classes.push('target', entry.piece ? 'capture' : 'empty-target');
      if (view.lastMove && (view.lastMove.from === entry.square || view.lastMove.to === entry.square)) classes.push('last');
      if (view.checkSquare === entry.square) classes.push('check');
      if (view.hint && (view.hint.from === entry.square || view.hint.to === entry.square)) classes.push('hint');
      button.className = classes.join(' ');

      const label = entry.piece ? `${entry.square} ${PIECE_NAMES[entry.piece]}` : `${entry.square} empty`;
      button.setAttribute('aria-label', `${label}${isTarget ? ', legal destination' : ''}`);

      const glyph = entry.piece ? el('span', { class: `piece ${entry.color}`, 'aria-hidden': 'true', text: GLYPHS[entry.piece] }) : null;
      const showRank = flipped ? (entry.square[0] === 'h') : (entry.square[0] === 'a');
      const showFile = flipped ? (entry.square[1] === '8') : (entry.square[1] === '1');
      const coord = (showRank || showFile)
        ? el('span', { class: 'coord', 'aria-hidden': 'true', text: `${showRank ? entry.square[1] : ''}${showFile ? entry.square[0] : ''}` })
        : null;
      button.replaceChildren(...[glyph, coord].filter(Boolean));
    }

    statusEl.textContent = view.status.text;
    statusEl.dataset.tone = view.status.tone;
    boardEl.setAttribute('aria-busy', String(thinking));
    undoBtn.disabled = match.chess.history().length === 0;
    resignBtn.disabled = view.over;

    const turnName = view.turn === 'w' ? 'white' : 'black';
    readoutEl.replaceChildren(
      el('span', {}, 'turn ', el('b', { text: turnName })),
      el('span', {}, 'you ', el('b', { text: match.playerColor === 'w' ? 'white' : 'black' })),
      el('span', {}, 'engine ', el('b', { text: DIFFICULTY[match.difficulty].label })),
      el('span', {}, 'ply ', el('b', { text: String(match.chess.history().length) })),
      el('span', {}, 'fen ', el('b', { text: view.fen.split(' ')[0].slice(0, 18) + '…' })),
    );

    const pgn = view.moves;
    movesEl.replaceChildren(...(pgn.length
      ? pgn.map((line) => {
        const [number, ...rest] = line.split(' ');
        return el('div', {}, el('b', { text: number }), rest.join(' '));
      })
      : [el('span', { text: 'no moves yet' })]));
    movesEl.scrollTop = movesEl.scrollHeight;

    if (view.over) thinking = false;
  }

  /* -------------------------------------------------------------- controls */

  newGameBtn.addEventListener('click', () => {
    clearTimeout(engineTimer);
    thinking = false;
    selected = null;
    pendingPromotion = null;
    promoEl.hidden = true;
    resignArmed = false;
    resignBtn.textContent = 'resign';
    match.reset({ difficulty: difficultyEl.value, playerColor: sideEl.value });
    writeStore('chess:difficulty', difficultyEl.value);
    writeStore('chess:side', sideEl.value);
    render();
    announce('New game. You are ' + (sideEl.value === 'w' ? 'white.' : 'black.'));
    if (sideEl.value === 'b') scheduleEngine();
  });

  undoBtn.addEventListener('click', () => {
    clearTimeout(engineTimer);
    thinking = false;
    if (!match.undo()) { announce('Nothing to undo.'); return; }
    selected = null;
    render();
    announce('Move taken back.');
  });

  hintBtn.addEventListener('click', () => {
    if (thinking) { announce('Wait for the machine to move first.'); return; }
    const hint = match.hint();
    if (!hint) { announce('No hint available.'); return; }
    render();
    announce(`Hint: try ${hint.san}.`);
  });

  resignBtn.addEventListener('click', () => {
    if (!resignArmed) {
      resignArmed = true;
      resignBtn.textContent = 'confirm resign';
      announce('Press resign again to confirm.');
      setTimeout(() => { resignArmed = false; resignBtn.textContent = 'resign'; }, 4000);
      return;
    }
    clearTimeout(engineTimer);
    thinking = false;
    match.resign();
    resignBtn.textContent = 'resign';
    resignArmed = false;
    render();
    announce('You resigned. New game when you are ready.');
  });

  flipBtn.addEventListener('click', () => {
    flipped = !flipped;
    render();
    announce(flipped ? 'Board flipped: black at the bottom.' : 'Board flipped: white at the bottom.');
  });

  fenBtn.addEventListener('click', async () => {
    const fen = match.chess.fen();
    try {
      await navigator.clipboard.writeText(fen);
      announce('FEN copied to the clipboard.');
    } catch {
      announce(`FEN: ${fen}`);
    }
  });

  difficultyEl.addEventListener('change', () => {
    match.difficulty = difficultyEl.value;
    writeStore('chess:difficulty', difficultyEl.value);
    announce(`Engine set to ${DIFFICULTY[difficultyEl.value].label}.`);
  });

  sideEl.addEventListener('change', () => newGameBtn.click());

  render();
  if (match.playerColor === 'b') scheduleEngine();

  return {
    hint: 'click a piece, then a dot • arrows move focus • Enter selects',
    show() { render(); },
    hide() {
      clearTimeout(engineTimer);
      thinking = false;
    },
  };
}
