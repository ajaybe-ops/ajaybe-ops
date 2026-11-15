/** Arcade shell: tab routing, boot sequence and the Matrix rain backdrop. */

import { mountChess } from './views/chess.js';
import { mountSnake } from './views/snake.js';
import { mount2048 } from './views/twenty48.js';
import { mountMines } from './views/minesweeper.js';
import { mountTicTacToe } from './views/tictactoe.js';
import { mountTerminal } from './views/terminal.js';
import { mountAbout } from './views/about.js';
import { prefersReducedMotion } from './ui.js';

const VIEWS = {
  chess: mountChess,
  snake: mountSnake,
  '2048': mount2048,
  mines: mountMines,
  tictactoe: mountTicTacToe,
  terminal: mountTerminal,
  about: mountAbout,
};

const ALIASES = {
  minesweeper: 'mines',
  ttt: 'tictactoe',
  adventure: 'terminal',
  story: 'terminal',
  now: 'about',
};

const tabs = [...document.querySelectorAll('.tab')];
const panels = new Map([...document.querySelectorAll('[data-view]')].map((node) => [node.dataset.view, node]));
const hintEl = document.getElementById('status-hint');
const mounted = new Map();
let current = null;

function resolveTab(name) {
  const key = String(name || '').toLowerCase();
  return VIEWS[ALIASES[key] || key] ? (ALIASES[key] || key) : null;
}

function mountView(name) {
  if (!mounted.has(name)) {
    const factory = VIEWS[name];
    mounted.set(name, factory(panels.get(name)));
  }
  return mounted.get(name);
}

function activate(name, { focusTab = false, updateHash = true } = {}) {
  const tabName = resolveTab(name) || 'chess';
  if (current === tabName && !focusTab) return;

  for (const tab of tabs) {
    const selected = tab.dataset.panel === tabName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) tab.focus();
  }

  for (const [key, panel] of panels) {
    if (key === tabName) panel.hidden = false;
    else panel.hidden = true;
  }

  if (current && mounted.has(current)) mounted.get(current).hide?.();
  const view = mountView(tabName);
  current = tabName;
  view?.show?.();
  if (hintEl) hintEl.textContent = view?.hint || '';

  if (updateHash && window.location.hash.slice(1) !== tabName) {
    history.replaceState(null, '', `#${tabName}`);
  }

  const heading = panels.get(tabName)?.querySelector('h2');
  if (heading) heading.id = 'panel-title';
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(tab.dataset.panel, { focusTab: false }));

  tab.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next == null) return;
    event.preventDefault();
    activate(tabs[next].dataset.panel, { focusTab: true });
  });
});

window.addEventListener('hashchange', () => activate(window.location.hash.slice(1)));

activate(window.location.hash.slice(1) || 'chess', { updateHash: false });

/* ------------------------------------------------------------------- rain */

function startRain() {
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>[]{}/*+-=|';
  const fontSize = 16;
  let columns = 0;
  let drops = [];
  let frame = 0;
  let rafId = 0;
  let last = 0;
  let visible = !document.hidden;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(window.innerWidth / fontSize);
    drops = Array.from({ length: columns }, () => Math.random() * -60);
    ctx.fillStyle = '#030705';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.fillStyle = 'rgba(3, 7, 5, 0.09)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${fontSize}px ui-monospace, monospace`;
    for (let i = 0; i < columns; i++) {
      const char = glyphs[Math.floor(Math.random() * glyphs.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const bright = Math.random() > 0.965;
      ctx.fillStyle = bright ? 'rgba(216, 255, 233, 0.9)' : 'rgba(38, 255, 156, 0.55)';
      ctx.fillText(char, x, y);

      if (y > height && Math.random() > 0.975) drops[i] = Math.random() * -20;
      drops[i] += 1;
    }
  }

  function loop(time) {
    if (!visible) return;
    rafId = requestAnimationFrame(loop);
    if (time - last < 48) return;
    last = time;
    frame++;
    draw();
  }

  function start() {
    if (rafId) return;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  window.addEventListener('resize', () => {
    resize();
    if (prefersReducedMotion()) draw();
  });

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible && !prefersReducedMotion()) start();
    else stop();
  });

  resize();
  if (prefersReducedMotion()) {
    // One static frame: atmosphere without motion.
    for (let i = 0; i < 40; i++) {
      for (let c = 0; c < columns; c++) {
        drops[c] += 6;
      }
      draw();
    }
  } else {
    start();
  }
}

/* ------------------------------------------------------------------- boot */

function runBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const log = document.getElementById('boot-log');
  const skip = document.getElementById('boot-skip');
  const lines = [
    'matrix://arcade — cold start',
    'rules engine ............ perft verified',
    'arcade modules .......... 6 loaded',
    'chess bot ............... issues/actions',
    'spotify bridge .......... remote svg',
    'telemetry ............... disabled',
    '',
    '> welcome back, operator.',
  ];

  let index = 0;
  let timer = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    boot.hidden = true;
    try { sessionStorage.setItem('arcade:booted', '1'); } catch { /* ignore */ }
    document.getElementById('stage')?.focus?.();
  };

  const step = () => {
    if (index >= lines.length) {
      timer = window.setTimeout(finish, 320);
      return;
    }
    log.textContent += `${lines[index]}\n`;
    index += 1;
    timer = window.setTimeout(step, 150);
  };

  skip.addEventListener('click', finish);
  window.addEventListener('keydown', function onEsc(event) {
    if (event.key === 'Escape') {
      window.removeEventListener('keydown', onEsc);
      finish();
    }
  });

  boot.hidden = false;
  if (prefersReducedMotion()) {
    log.textContent = `${lines.join('\n')}\n`;
    finish();
    return;
  }
  step();
}

startRain();
runBoot();

// Expose the active view for manual testing in the console (not used by the app).
if (typeof window !== 'undefined') {
  window.arcade = { activate, get current() { return current; } };
}
