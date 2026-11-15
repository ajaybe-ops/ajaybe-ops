#!/usr/bin/env node
/**
 * Local chess REPL using exactly the same protocol as the Issues bot.
 *   node scripts/chess-cli.mjs [--depth 3] [--seed 7]
 *
 * Useful for checking the bot without pushing to GitHub.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Chess } from '../lib/chess.js';
import { initialState, respond } from './lib/chess-issue.mjs';

const args = process.argv.slice(2);
const depthFlag = args.indexOf('--depth');
const depth = depthFlag >= 0 ? Number(args[depthFlag + 1]) : 3;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const seedFlag = args.indexOf('--seed');
const random = makeRandom(seedFlag >= 0 ? Number(args[seedFlag + 1]) : 12345);

let state = initialState({ issue: 0, playerColor: 'w', engineColor: 'b' });

console.log('MATRIX ARCADE // chess bot (local)');
console.log('You are White. Type a move (e4, Nf3, O-O), /board, /hint, /fen, /new, /resign, or quit.\n');
console.log(new Chess().ascii());
console.log(`\n${state.fen}\n`);

const rl = createInterface({ input: stdin, output: stdout });

while (true) {
  const line = (await rl.question('> ')).trim();
  if (!line) continue;
  if (['quit', 'exit', '/quit'].includes(line.toLowerCase())) break;

  if (line === '/hint') {
    const chess = new Chess(state.fen);
    const legal = chess.moves();
    console.log(`Legal moves: ${legal.join(' ')}`);
    continue;
  }

  const result = respond(state, line, { depth, random });
  state = result.state;
  if (result.changed) {
    console.log(`\n${new Chess(state.fen).ascii()}`);
    console.log(`moves: ${state.moves.join(' ')}\n`);
  } else {
    console.log(`\n${stripMarkdown(result.reply)}\n`);
  }
}

rl.close();

function stripMarkdown(text) {
  return text
    .replace(/<!--.*?-->/gs, '')
    .replace(/^```[\s\S]*?```/gm, (block) => block.replace(/```/g, ''))
    .replace(/\*\*/g, '')
    .trim();
}
