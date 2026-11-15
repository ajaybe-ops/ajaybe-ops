/** About — states plainly what is real, what runs where, and what GitHub cannot do. */

import { el } from '../ui.js';

const REPO = 'https://github.com/ajaybe-ops/ajaybe-ops';

export function mountAbout(panel) {
  panel.append(
    el('div', { class: 'panel-head' },
      el('h2', { text: 'about this arcade' }),
      el('p', { class: 'panel-note', text: 'No tracking. No accounts. No fake screenshots.' })),

    el('p', { class: 'about-lead' },
      'Every game here is real code running in your browser: the chess rules engine passes published perft node counts, ',
      'the 2048 and minesweeper logic are unit-tested, and the text adventure is a parser — not a slideshow. ',
      'This page is served by GitHub Pages because GitHub profile READMEs render Markdown only and cannot execute JavaScript.'),

    el('div', { class: 'about-grid' },
      el('div', { class: 'card' },
        el('h3', { text: 'what runs where' }),
        el('ul', {},
          el('li', {}, el('b', { text: 'README: ' }), 'Markdown, images and animated SVG. Links out to this arcade.'),
          el('li', {}, el('b', { text: 'This arcade: ' }), 'vanilla ES modules, zero dependencies, no build step.'),
          el('li', {}, el('b', { text: 'Chess bot: ' }), 'GitHub Actions + Issues, replies with the board in the thread.'),
          el('li', {}, el('b', { text: 'Now playing: ' }), 'a serverless function renders Spotify status as SVG.'))),

      el('div', { class: 'card' },
        el('h3', { text: 'no dark patterns' }),
        el('ul', {},
          el('li', {}, 'No cookies, analytics or third-party scripts.'),
          el('li', {}, 'Scores and preferences stay in your localStorage.'),
          el('li', {}, 'The chess engine runs locally; your moves never leave the page.'),
          el('li', {}, 'Reduced-motion is respected; the rain stops when the tab is hidden.'))),

      el('div', { class: 'card' },
        el('h3', { text: 'the engine' }),
        el('p', {},
          'A 0x88 board with full legal move generation, castling, en passant, promotion, repetition and ',
          'insufficient-material detection. The opponent is a negamax search with alpha-beta pruning, ',
          'piece-square tables and a quiescence search for captures.'),
        el('p', { style: 'margin-top:.5rem' },
          'Strength is exposed as casual / normal / sharp. Sharp thinks four plies deep and will punish loose pieces.')),

      el('div', { class: 'card' },
        el('h3', { text: 'source' }),
        el('p', {},
          'The whole thing is open source, including the Actions workflows: ',
          el('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'repository'),
          '.'),
        el('p', { style: 'margin-top:.5rem' },
          el('a', { href: `${REPO}/issues/new?template=chess.yml`, target: '_blank', rel: 'noopener' }, 'Challenge me to async chess'),
          ' — the bot answers with ASCII boards in the issue thread.')),

      el('div', { class: 'card' },
        el('h3', { text: 'keyboard map' }),
        el('ul', {},
          el('li', {}, 'Chess: arrows move focus, Enter selects, Esc cancels promotion'),
          el('li', {}, 'Snake: arrows / WASD, space pause'),
          el('li', {}, '2048: arrows / WASD, swipe on touch'),
          el('li', {}, 'Minesweeper: arrows, Enter reveal, F flag'),
          el('li', {}, 'Tic-tac-toe: arrows, Enter places a mark'))),

      el('div', { class: 'card' },
        el('h3', { text: 'honest limits' }),
        el('ul', {},
          el('li', {}, 'Nothing here is playable inside a GitHub README. That is a platform rule, not a design choice.'),
          el('li', {}, 'The browser chess game is local; the issue game is asynchronous and moves one turn at a time.'),
          el('li', {}, 'Spotify art and progress depend on the token owner having an active session.')))));

  return { hint: 'everything above is real code', show() {}, hide() {} };
}
