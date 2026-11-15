/** Snake — canvas renderer around the pure SnakeGame logic. */

import { SnakeGame } from '../games/snake.js';
import { el, announce, prefersReducedMotion, readStore, writeStore } from '../ui.js';

const COLS = 20;
const ROWS = 20;

export function mountSnake(panel) {
  const game = new SnakeGame({ cols: COLS, rows: ROWS });
  const speed = readStore('snake:speed', 'normal');
  let best = readStore('snake:best', 0);
  let visible = false;
  let running = false;
  let rafId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let paused = false;

  const canvas = el('canvas', { role: 'img', 'aria-label': 'Snake board, 20 by 20 cells' });
  const stage = el('div', { class: 'snake-stage' }, canvas);
  const scoreEl = el('b', { text: '0' });
  const bestEl = el('b', { text: String(best) });
  const lengthEl = el('b', { text: '3' });

  const overlayTitle = el('h3', { text: 'READY' });
  const overlayText = el('p', { text: 'Arrow keys or WASD to steer. Space starts and pauses.' });
  const overlayBtn = el('button', { class: 'btn primary', type: 'button', text: 'start run' });
  const overlay = el('div', { class: 'overlay' }, overlayTitle, overlayText, overlayBtn);
  stage.append(overlay);

  const speedEl = el('select', { 'aria-label': 'Speed' },
    [['easy', 'easy — 190ms'], ['normal', 'normal — 130ms'], ['hard', 'hard — 80ms']]
      .map(([value, label]) => {
        const option = el('option', { value, text: label });
        if (value === speed) option.selected = true;
        return option;
      }));

  const dpad = el('div', { class: 'dpad', 'aria-label': 'Directional controls' },
    el('button', { class: 'btn up', type: 'button', 'aria-label': 'Up', onclick: () => turn('up') }, '↑'),
    el('button', { class: 'btn left', type: 'button', 'aria-label': 'Left', onclick: () => turn('left') }, '←'),
    el('button', { class: 'btn down', type: 'button', 'aria-label': 'Down', onclick: () => turn('down') }, '↓'),
    el('button', { class: 'btn right', type: 'button', 'aria-label': 'Right', onclick: () => turn('right') }, '→'));

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'snake' }),
      el('p', { class: 'panel-note', text: 'Classic rules. Walls kill. Every 10 points the grid speeds up.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' }, stage),
      el('div', { class: 'stack' },
        el('div', { class: 'readout' },
          el('span', {}, 'score ', scoreEl),
          el('span', {}, 'best ', bestEl),
          el('span', {}, 'length ', lengthEl)),
        el('div', { class: 'row' },
          el('label', { class: 'field' }, 'speed', speedEl),
          el('button', { class: 'btn', type: 'button', text: 'restart', onclick: () => startRun() })),
        el('div', { class: 'row' }, el('button', { class: 'btn ghost', type: 'button', text: 'pause', onclick: () => togglePause() })),
        dpad,
        el('p', { class: 'panel-note' }, 'On touch screens: use the pad or swipe on the board.'))) );

  const ctx = canvas.getContext('2d');
  let cell = 20;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = stage.clientWidth || 320;
    cell = width / COLS;
    const size = Math.round(width * dpr);
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const width = cell * COLS;
    ctx.clearRect(0, 0, width, width);

    // Faint grid so the playfield reads as a terminal matrix.
    ctx.strokeStyle = 'rgba(38, 255, 156, 0.055)';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.round(i * cell) + 0.5, 0);
      ctx.lineTo(Math.round(i * cell) + 0.5, width);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, Math.round(i * cell) + 0.5);
      ctx.lineTo(width, Math.round(i * cell) + 0.5);
      ctx.stroke();
    }

    if (game.food) {
      const x = game.food.x * cell;
      const y = game.food.y * cell;
      const pad = cell * 0.18;
      ctx.save();
      ctx.shadowColor = 'rgba(38, 255, 156, 0.9)';
      ctx.shadowBlur = cell * 0.6;
      ctx.fillStyle = '#8dffc6';
      ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      ctx.restore();
    }

    game.body.forEach((segment, index) => {
      const pad = cell * (index === 0 ? 0.06 : 0.12);
      const ratio = 1 - index / Math.max(game.body.length, 1);
      const g = Math.round(80 + ratio * 120);
      ctx.fillStyle = index === 0 ? '#d8ffe9' : `rgb(${Math.round(16 + ratio * 40)}, ${g + 40}, ${Math.round(90 + ratio * 90)})`;
      ctx.fillRect(segment.x * cell + pad, segment.y * cell + pad, cell - pad * 2, cell - pad * 2);
    });

    if (paused && game.status === 'playing') {
      ctx.fillStyle = 'rgba(3, 10, 7, 0.6)';
      ctx.fillRect(0, 0, width, width);
      ctx.fillStyle = '#26ff9c';
      ctx.font = `${Math.max(12, cell * 0.8)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', width / 2, width / 2);
    }

    canvas.setAttribute('aria-label', `Snake board. Score ${game.score}, length ${game.body.length}${game.status === 'dead' ? ', game over' : ''}.`);
  }

  function syncReadouts() {
    scoreEl.textContent = String(game.score);
    lengthEl.textContent = String(game.body.length);
    bestEl.textContent = String(best);
  }

  function showOverlay(title, text, buttonLabel) {
    overlay.hidden = false;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = buttonLabel;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  overlayBtn.addEventListener('click', () => {
    if (game.status === 'dead' || game.status === 'won') startRun();
    else if (paused) togglePause();
    else { game.start(); hideOverlay(); }
    canvas.focus?.();
    overlayBtn.blur();
  });

  function startRun() {
    game.reset();
    game.start();
    paused = false;
    accumulator = 0;
    lastFrame = 0;
    hideOverlay();
    syncReadouts();
    draw();
    announce('Snake started. Use arrow keys or the directional pad.');
    running = true;
  }

  function togglePause() {
    if (game.status !== 'playing') return;
    paused = !paused;
    announce(paused ? 'Paused.' : 'Resumed.');
    draw();
  }

  function turn(direction) {
    if (game.status === 'ready') startRun();
    if (game.status === 'dead' || game.status === 'won') return;
    if (paused) paused = false;
    game.setDirection(direction);
    if (!running) running = true;
  }

  function onKey(event) {
    if (!visible) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right',
    };
    if (map[event.key]) {
      event.preventDefault();
      turn(map[event.key]);
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      if (document.activeElement?.classList.contains('btn')) return;
      event.preventDefault();
      if (game.status === 'ready' || game.status === 'dead' || game.status === 'won') startRun();
      else togglePause();
    }
  }

  function loop(time) {
    if (!visible) return;
    rafId = requestAnimationFrame(loop);
    if (!running || paused || game.status !== 'playing') { lastFrame = time; return; }
    if (!lastFrame) lastFrame = time;
    const delta = Math.min(time - lastFrame, 250);
    lastFrame = time;
    accumulator += delta;
    const interval = game.tickInterval(speedEl.value);
    while (accumulator >= interval) {
      accumulator -= interval;
      const result = game.step();
      syncReadouts();
      if (result.dead) {
        running = false;
        if (game.score > best) {
          best = game.score;
          writeStore('snake:best', best);
          bestEl.textContent = String(best);
        }
        draw();
        showOverlay('SIGNAL LOST', `Score ${game.score}. Length ${game.body.length}. The grid resets.`, 'run again');
        announce(`Game over. Score ${game.score}.`);
        return;
      }
      if (result.won) {
        running = false;
        draw();
        showOverlay('GRID CLEARED', `Perfect run: ${game.score} points.`, 'run again');
        announce('You filled the grid.');
        return;
      }
      if (result.ate) announce(`Score ${game.score}.`);
    }
    draw();
  }

  // Swipe support for touch screens.
  let touchStart = null;
  stage.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  speedEl.addEventListener('change', () => {
    writeStore('snake:speed', speedEl.value);
    announce(`Speed set to ${speedEl.value}.`);
  });

  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);

  showOverlay('READY', prefersReducedMotion()
    ? 'Arrow keys or WASD. Space starts the run.'
    : 'Arrow keys or WASD to steer. Space starts and pauses.', 'start run');

  const observer = new ResizeObserver(() => { if (visible) resize(); });
  observer.observe(stage);

  return {
    hint: 'arrow keys / WASD • space pause • swipe on mobile',
    show() {
      visible = true;
      resize();
      if (!rafId) rafId = requestAnimationFrame(loop);
      if (game.status === 'ready') showOverlay('READY', 'Arrow keys or WASD to steer. Space starts and pauses.', 'start run');
    },
    hide() {
      visible = false;
      paused = true;
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastFrame = 0;
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    },
  };
}
