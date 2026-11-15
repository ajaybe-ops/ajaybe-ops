/** Terminal Adventure — typed commands plus clickable actions. */

import { Adventure } from '../games/adventure.js';
import { el, announce } from '../ui.js';

const KIND_CLASS = {
  command: 'cmd',
  system: 'sys',
  error: 'err',
  narration: 'narr',
};

export function mountTerminal(panel) {
  const adventure = new Adventure();
  const history = [];
  let historyIndex = -1;

  const logEl = el('div', {
    class: 'term-log',
    role: 'log',
    'aria-live': 'polite',
    'aria-relevant': 'additions',
    'aria-label': 'Terminal transcript',
  });
  const input = el('input', {
    type: 'text',
    id: 'term-input',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-label': 'Terminal command',
    placeholder: 'look',
  });
  const form = el('form', { class: 'term-form' },
    el('label', { for: 'term-input', 'aria-hidden': 'true', text: '>_' }),
    input,
    el('button', { class: 'btn', type: 'submit', text: 'run' }));
  const actionsEl = el('div', { class: 'term-actions', 'aria-label': 'Available actions' });

  const term = el('div', { class: 'term' },
    el('div', { class: 'term-bar' },
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { text: 'operator@construct:~' })),
    logEl,
    actionsEl,
    form);

  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'terminal adventure' }),
      el('p', { class: 'panel-note', text: 'COLD BOOT — a parsed text adventure. Six rooms, three items, one way out.' })),
    el('div', { class: 'split' },
      el('div', { class: 'stack' }, term),
      el('div', { class: 'stack' },
        el('p', { class: 'status-line', text: 'Type commands, or tap the action buttons.' }),
        el('div', { class: 'card' },
          el('h3', { text: 'verbs' }),
          el('p', {}, 'look · go <dir> · take <item> · drop <item> · use <item> · examine <item> · inventory · hint · restart'),
          el('p', { style: 'margin-top:.4rem' }, 'Directions accept n/s/e/w and full words. Command history: ↑ / ↓.')),
        el('div', { class: 'card' },
          el('h3', { text: 'controls' }),
          el('ul', {},
            el('li', {}, 'Enter runs the command'),
            el('li', {}, 'Escape clears the input'),
            el('li', {}, 'Action buttons mirror the parser'))))));

  function entryNode(entry) {
    const node = el('div', { class: KIND_CLASS[entry.kind] || 'narr', text: entry.kind === 'command' ? `> ${entry.text}` : entry.text });
    return node;
  }

  function appendEntries(entries) {
    const fragment = document.createDocumentFragment();
    for (const entry of entries) fragment.append(entryNode(entry));
    logEl.append(fragment);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function buildActions() {
    actionsEl.replaceChildren(...adventure.actions().map((action) => el('button', {
      class: 'btn ghost',
      type: 'button',
      text: action.label,
      onclick: () => runCommand(action.command),
    })));
  }

  function runCommand(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    history.push(text);
    historyIndex = history.length;
    const entries = adventure.execute(text);
    appendEntries(entries);
    buildActions();

    if (entries.some((entry) => entry.kind === 'error')) {
      const lastError = [...entries].reverse().find((entry) => entry.kind === 'error');
      announce(lastError.text);
    } else {
      const last = [...entries].reverse().find((entry) => entry.kind !== 'command');
      if (last) announce(last.text);
    }

    if (adventure.over) {
      actionsEl.replaceChildren(el('button', {
        class: 'btn primary', type: 'button', text: 'run it again',
        onclick: () => { adventure.reset(); logEl.replaceChildren(); appendEntries(adventure.state.log); buildActions(); announce('Adventure restarted.'); },
      }));
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runCommand(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || '';
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || '';
      return;
    }
    if (event.key === 'Escape') {
      input.value = '';
      historyIndex = history.length;
    }
  });

  appendEntries(adventure.state.log);
  buildActions();

  return {
    hint: 'type commands • ↑ history • tap actions',
    show() {
      // Only take focus when the user brought the panel into view.
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
      logEl.scrollTop = logEl.scrollHeight;
    },
    hide() {},
  };
}
