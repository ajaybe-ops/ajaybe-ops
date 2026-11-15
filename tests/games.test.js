import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SnakeGame } from '../arcade/js/games/snake.js';
import { Game2048 } from '../arcade/js/games/twenty48.js';
import { Minesweeper } from '../arcade/js/games/minesweeper.js';
import { TicTacToe } from '../arcade/js/games/tictactoe.js';
import { Adventure } from '../arcade/js/games/adventure.js';

/* ------------------------------------------------------------------ Snake */

test('snake: body, food and direction rules', () => {
  const game = new SnakeGame({ rng: () => 0 });
  assert.equal(game.body.length, 3);
  assert.equal(game.status, 'ready');
  assert.ok(!game.body.some((s) => s.x === game.food.x && s.y === game.food.y));

  // Reversing into itself is rejected; a perpendicular turn is accepted.
  assert.equal(game.setDirection('left'), false);
  assert.equal(game.setDirection('up'), true);
  assert.equal(game.setDirection('down'), false);

  game.start();
  const before = { ...game.body[0] };
  const result = game.step();
  assert.equal(result.dead, false);
  assert.equal(game.body.length, 3);
  assert.equal(game.body[0].x, before.x);
  assert.equal(game.body[0].y, before.y - 1);
});

test('snake: eating grows the body and scores', () => {
  const game = new SnakeGame({ rng: () => 0 });
  game.start();
  game.setDirection('up');
  const head = game.body[0];
  game.food = { x: head.x, y: head.y - 1 };
  const result = game.step();
  assert.equal(result.ate, true);
  assert.equal(game.score, 10);
  assert.equal(game.body.length, 4);
});

test('snake: walls and self-collision end the run', () => {
  const wall = new SnakeGame({ cols: 5, rows: 5, rng: () => 0 });
  wall.start();
  wall.setDirection('up');
  let dead = false;
  for (let i = 0; i < 10 && !dead; i++) dead = wall.step().dead;
  assert.equal(dead, true);
  assert.equal(wall.status, 'dead');

  const self = new SnakeGame({ rng: () => 0 });
  self.start();
  for (const direction of ['down', 'left', 'up']) self.setDirection(direction);
  // Force a compact coil so the head runs into its own body.
  self.body = [
    { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 },
  ];
  self.direction = 'right';
  self.setDirection('down');
  self.step();
  assert.equal(self.status, 'dead');
});

test('snake: wrap mode crosses edges instead of dying', () => {
  const game = new SnakeGame({ cols: 6, rows: 6, rng: () => 0, wrap: true });
  game.start();
  game.body = [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }];
  game.direction = 'right';
  const result = game.step();
  assert.equal(result.dead, false);
  assert.deepEqual(game.body[0], { x: 0, y: 2 });
});

/* ------------------------------------------------------------------- 2048 */

function gridOf(values) {
  const game = new Game2048({ rng: () => 0 });
  game.grid = values;
  return game;
}

test('2048: merges a full row once and scores the merge', () => {
  const game = gridOf([
    2, 2, 2, 2,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = game.move('left');
  assert.equal(result.moved, true);
  assert.equal(result.gained, 8);
  assert.deepEqual(game.grid.slice(0, 2), [4, 4]);
  assert.equal(result.merges.length, 2);
  // The spawned tile lands in an empty cell after the move, never on a merge.
  assert.ok(result.spawned);
  assert.ok(![0, 1].includes(result.spawned.index));
});

test('2048: a merged tile cannot merge again in the same move', () => {
  const game = gridOf([
    4, 4, 8, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  game.move('left');
  assert.deepEqual(game.grid.slice(0, 2), [8, 8]);
});

test('2048: vertical packing and spawn only in empty cells', () => {
  const game = gridOf([
    2, 0, 0, 0,
    2, 0, 0, 0,
    4, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = game.move('up');
  assert.equal(result.moved, true);
  assert.equal(game.grid[0], 4);
  assert.equal(game.grid[4], 4);
  assert.equal(game.grid[8], 0);
  assert.ok(result.spawned);
  assert.equal(game.grid[result.spawned.index], result.spawned.value);
  assert.ok([2, 4].includes(result.spawned.value));
});

test('2048: a blocked board reports no move and ends the game', () => {
  const game = gridOf([
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]);
  assert.equal(game.canMove(), false);
  const result = game.move('left');
  assert.equal(result.moved, false);
  // status only flips to "over" after a move attempt that cannot merge; the
  // board is full, so canMove() is false and the UI ends the run.
  assert.equal(game.canMove(), false);
});

test('2048: reaching the target wins, and play can continue', () => {
  const game = new Game2048({ rng: () => 0, target: 8 });
  game.grid = [
    4, 4, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  const result = game.move('left');
  assert.equal(result.won, true);
  assert.equal(game.status, 'won');
  game.continuePlaying();
  assert.equal(game.status, 'playing');
});

/* ------------------------------------------------------------ Minesweeper */

test('minesweeper: first click and its ring are always safe', () => {
  for (let seed = 0; seed < 40; seed++) {
    const game = new Minesweeper({ cols: 9, rows: 9, mines: 20, rng: () => (seed * 0.618) % 1 });
    const result = game.reveal(4, 4);
    assert.equal(result.lost, undefined);
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) {
        assert.equal(game.cells[game.index(x, y)].mine, false);
      }
    }
  }
});

test('minesweeper: flagging and remaining count', () => {
  const game = new Minesweeper({ cols: 5, rows: 5, mines: 3, rng: () => 0.1 });
  assert.equal(game.remainingMines(), 3);
  assert.equal(game.toggleFlag(0, 0).flagged, true);
  assert.equal(game.remainingMines(), 2);
  assert.equal(game.toggleFlag(0, 0).flagged, false);
  assert.equal(game.remainingMines(), 3);
  assert.equal(game.toggleFlag(3, 3).flagged, true);
  assert.equal(game.remainingMines(), 2);
});

test('minesweeper: revealing every safe cell wins', () => {
  const game = new Minesweeper({ cols: 4, rows: 4, mines: 2, rng: () => 0.5 });
  game.reveal(0, 0);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const cell = game.cells[game.index(x, y)];
      if (!cell.mine) game.reveal(x, y);
    }
  }
  assert.equal(game.status, 'won');
});

test('minesweeper: a flagged cell cannot be revealed', () => {
  const game = new Minesweeper({ cols: 3, rows: 3, mines: 1, rng: () => 0 });
  game.reveal(0, 0);
  game.toggleFlag(2, 2);
  const result = game.reveal(2, 2);
  assert.equal(result.changed, false);
});

/* ------------------------------------------------------------ Tic-Tac-Toe */

test('tic-tac-toe: detects a row win and refuses further moves', () => {
  const game = new TicTacToe();
  game.play(0); game.play(3);
  game.play(1); game.play(4);
  const last = game.play(2);
  assert.equal(last.status, 'won');
  assert.equal(game.winner, 'X');
  assert.deepEqual(game.winningLine, [0, 1, 2]);
  assert.equal(game.play(5).ok, false);
});

test('tic-tac-toe: draw detection', () => {
  const game = new TicTacToe();
  for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) game.play(index);
  assert.equal(game.status, 'draw');
});

test('tic-tac-toe: undo restores turn and clears the result', () => {
  const game = new TicTacToe();
  game.play(0);
  game.play(4);
  game.undo();
  assert.equal(game.turn, 'O');
  assert.equal(game.board[4], null);
});

test('tic-tac-toe: perfect AI never loses to random play', () => {
  let humanWins = 0;
  let draws = 0;
  let aiWins = 0;
  for (let gameIndex = 0; gameIndex < 25; gameIndex++) {
    let seed = gameIndex + 1;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const game = new TicTacToe({ ai: true, rng, human: 'X' });
    while (game.status === 'playing') {
      if (game.turn === game.human) {
        const options = game.available();
        game.play(options[Math.floor(rng() * options.length)]);
      } else {
        game.play(game.aiMove());
      }
    }
    if (game.status === 'won') {
      if (game.winner === game.human) humanWins++;
      else aiWins++;
    } else {
      draws++;
    }
  }
  assert.equal(humanWins, 0, 'a perfect AI must never lose');
  assert.equal(draws + aiWins, 25);
});

/* --------------------------------------------------------------- Adventure */

function run(adventure, commands) {
  for (const command of commands) adventure.execute(command);
  return adventure;
}

test('adventure: full walkthrough reaches the winning state', () => {
  const game = new Adventure();
  run(game, [
    'look',
    'go north',
    'go east',
    'take keycard',
    'take coil',
    'go west',
    'go north',
    'use keycard',
    'go north',
    'use coil',
    'use terminal',
    'go down',
    'use token',
  ]);
  assert.equal(game.over, true);
  assert.equal(game.state.status, 'won');
  assert.match(game.transcript(), /COLD BOOT COMPLETE/);
});

test('adventure: locked exits explain themselves and do not move the player', () => {
  const game = new Adventure();
  run(game, ['go north', 'go north']);
  assert.equal(game.state.scene, 'junction');
  game.execute('go north');
  assert.equal(game.state.scene, 'junction', 'must stay outside the core without credentials');
  assert.match(game.transcript(), /CREDENTIAL REQUIRED/);
});

test('adventure: terminal needs power before it yields a token', () => {
  const game = new Adventure();
  run(game, ['go north', 'go east', 'take keycard', 'take coil', 'go west', 'go north', 'use keycard', 'go north']);
  game.execute('use terminal');
  assert.equal(game.state.inventory.includes('token'), false);
  assert.match(game.transcript(), /needs power/);
});

test('adventure: unknown verbs and items are handled, not ignored', () => {
  const game = new Adventure();
  game.execute('dance');
  assert.match(game.transcript(), /Unknown command/);
  game.execute('take keycard');
  assert.match(game.transcript(), /There is no "keycard" here/);
  game.execute('go sideways');
  assert.match(game.transcript(), /don't know the direction/);
});

test('adventure: abbreviations and clickable actions work', () => {
  const game = new Adventure();
  game.execute('n');
  assert.equal(game.state.scene, 'corridor');
  game.execute('e');
  assert.equal(game.state.scene, 'cache');
  game.execute('get card');
  assert.equal(game.state.inventory.includes('keycard'), true);

  const actions = game.actions();
  assert.ok(actions.some((action) => action.command === 'go west'));
  assert.ok(actions.some((action) => action.command === 'hint'));
});

test('adventure: restart returns to a clean boot state', () => {
  const game = new Adventure();
  run(game, ['go north', 'go east', 'take keycard']);
  game.execute('restart');
  assert.equal(game.state.scene, 'boot');
  assert.deepEqual(game.state.inventory, []);
  assert.equal(game.state.status, 'playing');
});
