/** Small DOM helpers shared by the arcade views. No framework, no build. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** el('button', {class:'btn', onclick}, 'label') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'disabled' || key === 'hidden' || key === 'required') node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function readStore(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`arcade:${key}`);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(`arcade:${key}`, JSON.stringify(value));
  } catch {
    /* storage can be blocked; the game must still work */
  }
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Announce text through the shared polite status region. */
export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  // Re-setting identical text is ignored by some screen readers; nudge it.
  live.textContent = '';
  window.setTimeout(() => { live.textContent = text; }, 30);
}

/**
 * Roving-tabindex keyboard navigation for a grid of buttons.
 * `order` maps visual position -> element, so flipped boards still navigate
 * the way the player sees them.
 */
export function rovingGrid(container, { columns, rows, order, onMove } = {}) {
  let focusIndex = 0;

  const buttons = () => (typeof order === 'function' ? order() : (order || [...container.children]));

  const focusAt = (index) => {
    const list = buttons();
    if (!list.length) return;
    focusIndex = Math.max(0, Math.min(list.length - 1, index));
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node && node.setAttribute) node.tabIndex = i === focusIndex ? 0 : -1;
    }
    onMove?.(list[focusIndex], focusIndex);
  };

  container.addEventListener('keydown', (event) => {
    const list = buttons();
    if (!list.length) return;
    const current = list.indexOf(document.activeElement);
    if (current >= 0) focusIndex = current;
    let next = null;
    switch (event.key) {
      case 'ArrowLeft': next = focusIndex - 1; break;
      case 'ArrowRight': next = focusIndex + 1; break;
      case 'ArrowUp': next = focusIndex - columns; break;
      case 'ArrowDown': next = focusIndex + columns; break;
      case 'Home': next = event.ctrlKey ? 0 : focusIndex - (focusIndex % columns); break;
      case 'End': next = event.ctrlKey ? list.length - 1 : focusIndex + (columns - 1 - (focusIndex % columns)); break;
      default: return;
    }
    event.preventDefault();
    next = Math.max(0, Math.min(list.length - 1, next));
    focusAt(next);
    list[focusIndex]?.focus?.();
  });

  return {
    init() { focusAt(0); },
    focusAt,
    /** Re-apply after re-rendering a grid (keeps one tab stop). */
    sync() { focusAt(Math.min(focusIndex, buttons().length - 1)); },
    get index() { return focusIndex; },
  };
}
