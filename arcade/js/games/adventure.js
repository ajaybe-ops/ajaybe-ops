/**
 * Terminal Adventure — "COLD BOOT".
 *
 * A genuinely parsed text adventure (not a scripted slideshow): the interpreter
 * understands movement, item verbs, inventory and scene-specific uses, and the
 * whole game state machine is driven from this module so it can be tested in
 * Node and rendered either as typed text or as clickable actions.
 *
 * All prose and puzzle design are original to this project.
 */

const LOG_LIMIT = 200;

export class Adventure {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      scene: 'boot',
      inventory: [],
      flags: new Set(),
      moves: 0,
      status: 'playing', // playing | won
      log: [],
    };
    this._log({
      kind: 'system',
      text: 'COLD BOOT // 03:14:07 // signal acquired',
    });
    this.look();
    return this;
  }

  _log(entry) {
    this.state.log.push(entry);
    if (this.state.log.length > LOG_LIMIT) this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
  }

  _say(text) {
    this._log({ kind: 'narration', text });
  }

  _note(text) {
    this._log({ kind: 'system', text });
  }

  _error(text) {
    this._log({ kind: 'error', text });
  }

  get scene() {
    return SCENES[this.state.scene];
  }

  get over() {
    return this.state.status === 'won';
  }

  /** Execute one command line. Returns the log entries produced. */
  execute(raw) {
    const input = String(raw || '').trim();
    if (!input) return [];
    const start = this.state.log.length;
    this.state.moves += 1;
    this._log({ kind: 'command', text: input });

    const normalized = input.toLowerCase().replace(/\s+/g, ' ');
    const words = normalized.split(' ');
    const verb = ALIASES[words[0]] || words[0];
    const rest = words.slice(1);
    const target = rest.join(' ');

    switch (verb) {
      case 'look':
        this.look();
        break;
      case 'help':
        this._help();
        break;
      case 'go':
        if (!target) this._error('Go where? Try: go north.');
        else this.go(target);
        break;
      case 'n': case 's': case 'e': case 'w': case 'u': case 'd':
      case 'north': case 'south': case 'east': case 'west': case 'up': case 'down':
        this.go(verb);
        break;
      case 'take':
        this.take(target);
        break;
      case 'drop':
        this.drop(target);
        break;
      case 'inventory':
        this.inventory();
        break;
      case 'use':
        this.use(target);
        break;
      case 'examine':
        this.examine(target);
        break;
      case 'hint':
        this.hint();
        break;
      case 'restart':
        this.reset();
        break;
      case 'clear':
        this.state.log = [];
        break;
      case 'whoami':
        this._note('guest // unverified // session expires at wake-up');
        break;
      case 'redpill':
        this._note('Too late for that. You are already in the construct.');
        break;
      case 'wakeup':
        this._note('Not until the kernel is root again.');
        break;
      default:
        this._error(`Unknown command "${words[0]}". Type "help" for the verb list.`);
    }

    return this.state.log.slice(start);
  }

  look() {
    const scene = this.scene;
    this._say(`[ ${scene.title} ]`);
    for (const line of scene.text(this.state)) this._say(line);

    const items = this._visibleItems();
    if (items.length) this._note(`You can see: ${items.join(', ')}.`);

    const exits = this._openExits();
    if (exits.length) this._note(`Exits: ${exits.map((exit) => exit.label.toLowerCase()).join(', ')}.`);
    else this._note('There is no obvious way out of this room.');
  }

  _visibleItems() {
    return (this.scene.items || [])
      .filter((item) => !this.state.inventory.includes(item.id))
      .map((item) => item.name);
  }

  _openExits() {
    return (this.scene.exits || []).filter((exit) => {
      if (!exit.requires) return true;
      return this.state.flags.has(exit.requires);
    });
  }

  go(direction) {
    const directionMap = { north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down', n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down' };
    const dir = directionMap[direction];
    if (!dir) {
      this._error(`I don't know the direction "${direction}".`);
      return;
    }
    const exits = this.scene.exits || [];
    const exit = exits.find((candidate) => candidate.dir === dir);
    if (!exit) {
      this._error(`You can't go ${dir} from here.`);
      return;
    }
    if (exit.requires && !this.state.flags.has(exit.requires)) {
      this._error(exit.blocked || 'That way is locked.');
      return;
    }
    this.state.scene = exit.to;
    if (exit.onUse) exit.onUse(this.state);
    this.look();
  }

  take(name) {
    if (!name) {
      this._error('Take what?');
      return;
    }
    const items = this.scene.items || [];
    const item = items.find((candidate) => matches(candidate, name));
    if (!item) {
      this._error(`There is no "${name}" here.`);
      return;
    }
    if (this.state.inventory.includes(item.id)) {
      this._note('You already have that.');
      return;
    }
    if (item.takeable === false) {
      this._error(`The ${item.name} will not move.`);
      return;
    }
    this.state.inventory.push(item.id);
    this._note(`Taken: ${item.name}.`);
    if (item.onTake) item.onTake(this.state, this);
  }

  drop(name) {
    const id = this._resolveInventory(name);
    if (!id) return;
    this.state.inventory = this.state.inventory.filter((entry) => entry !== id);
    this._note(`Dropped: ${ITEM_NAMES[id] || id}.`);
  }

  inventory() {
    if (!this.state.inventory.length) {
      this._note('Inventory is empty.');
      return;
    }
    const names = this.state.inventory.map((id) => ITEM_NAMES[id] || id);
    this._note(`Carrying: ${names.join(', ')}.`);
  }

  _resolveInventory(name) {
    if (!name) {
      this._error('Which item?');
      return null;
    }
    const id = this.state.inventory.find((entry) => matches({ id: entry, name: ITEM_NAMES[entry], aliases: ITEM_ALIASES[entry] }, name));
    if (!id) this._error(`You are not carrying a "${name}".`);
    return id || null;
  }

  use(text) {
    if (!text) {
      this._error('Use what? Try: use keycard.');
      return;
    }
    const [itemName, ...rest] = text.split(' on ');
    const query = itemName.trim();

    // Targets can be carried items or fixtures in the room (e.g. the terminal).
    const carried = this.state.inventory.find((entry) => matches({ id: entry, name: ITEM_NAMES[entry], aliases: ITEM_ALIASES[entry] }, query));
    const fixture = (this.scene.items || []).find((entry) => matches(entry, query));
    const id = carried || (fixture ? fixture.id : null);

    if (!id) {
      this._error(`You need to be carrying "${query}" to use it.`);
      return;
    }
    const onTarget = rest.join(' on ').trim() || null;
    const handler = USE_HANDLERS[`${this.state.scene}:${id}`] || USE_HANDLERS[`*:${id}`];
    if (!handler) {
      this._error(`Using the ${ITEM_NAMES[id] || id} here does nothing.`);
      return;
    }
    handler(this.state, this, onTarget);
  }

  examine(name) {
    if (!name) {
      this._error('Examine what?');
      return;
    }
    const sceneItems = this.scene.items || [];
    const found = sceneItems.find((candidate) => matches(candidate, name));
    const carried = this.state.inventory.find((entry) => matches({ id: entry, name: ITEM_NAMES[entry], aliases: ITEM_ALIASES[entry] }, name));
    const subject = found || (carried ? { id: carried, name: ITEM_NAMES[carried], description: ITEM_DESCRIPTIONS[carried] } : null);
    if (!subject) {
      this._error(`Nothing called "${name}" here.`);
      return;
    }
    this._say(subject.description || 'Nothing remarkable.');
  }

  hint() {
    const { flags } = this.state;
    if (this.state.scene === 'boot') this._note('Hint: the crawlspace runs north. Movement is free.');
    else if (!this.state.inventory.includes('keycard')) this._note('Hint: the data cache to the east of the corridor still has its access keycard.');
    else if (!flags.has('junction_open')) this._note('Hint: the junction door reads credentials. Try: use keycard.');
    else if (!flags.has('power')) this._note('Hint: the terminal in the core is dead. Find a power coil (the cache) and use it.');
    else if (!flags.has('root')) this._note('Hint: the terminal is live now. Try: use terminal.');
    else if (!flags.has('kernel_open')) this._note('Hint: the hatch behind the terminal is open. Go down.');
    else this._note('Hint: the kernel wants proof of authority. Try: use token.');
  }

  _help() {
    this._note('VERBS: look, go <dir>, take <item>, drop <item>, use <item>, examine <item>, inventory, hint, restart.');
    this._note('Shortcuts: n s e w u d. Directions are also exits listed in each room.');
  }

  /** Clickable actions for the current room, so the game is playable by tap. */
  actions() {
    const actions = [];
    for (const exit of this._openExits()) actions.push({ label: exit.label, command: `go ${exit.dir}` });
    for (const item of this.scene.items || []) {
      if (item.takeable === false) {
        if (USE_HANDLERS[`${this.state.scene}:${item.id}`]) {
          actions.push({ label: `Use ${item.name}`, command: `use ${item.name}` });
        }
        continue;
      }
      if (this.state.inventory.includes(item.id)) continue;
      actions.push({ label: `Take ${item.name}`, command: `take ${item.name}` });
    }
    for (const id of this.state.inventory) {
      const handler = USE_HANDLERS[`${this.state.scene}:${id}`] || USE_HANDLERS[`*:${id}`];
      if (handler) actions.push({ label: `Use ${ITEM_NAMES[id]}`, command: `use ${ITEM_NAMES[id]}` });
    }
    actions.push({ label: 'Look', command: 'look' });
    actions.push({ label: 'Hint', command: 'hint' });
    return actions;
  }

  /** Plain-text transcript, used by the terminal view and tests. */
  transcript() {
    return this.state.log.map((entry) => (entry.kind === 'command' ? `> ${entry.text}` : entry.text)).join('\n');
  }
}

const ITEM_NAMES = {
  keycard: 'keycard',
  coil: 'power coil',
  token: 'root token',
  chit: 'data chit',
};

const ITEM_ALIASES = {
  keycard: ['card', 'badge', 'pass'],
  coil: ['coil', 'power', 'battery'],
  token: ['token', 'root', 'key'],
  chit: ['chit', 'note', 'chip'],
};

const ITEM_DESCRIPTIONS = {
  keycard: 'A sliver of warm plastic. The reader strip is still alive.',
  coil: 'A palm-sized induction coil. Somebody pulled it from a UPS.',
  token: 'A root capability token. Whoever holds this owns the machine.',
  chit: 'A scrap of data: "KERNEL WILL NOT ACCEPT ARGUMENTS. IT ACCEPTS PROOF."',
};

function matches(item, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return false;
  if (item.id === q || item.name === q) return true;
  if ((item.aliases || []).includes(q)) return true;
  return item.name.startsWith(q) || item.id.startsWith(q);
}

const USE_HANDLERS = {
  'junction:keycard': (state, game, target) => {
    if (state.flags.has('junction_open')) {
      game._note('The junction door is already unlocked.');
      return;
    }
    if (target && !/reader|door|junction|lock/.test(target)) {
      game._error(`The keycard does not do anything to the ${target}.`);
      return;
    }
    state.flags.add('junction_open');
    game._note('The reader blinks green. The junction door unseals with a pressure hiss.');
  },
  'core:coil': (state, game) => {
    if (state.flags.has('power')) {
      game._note('The coil is already wired into the terminal.');
      return;
    }
    state.flags.add('power');
    state.inventory = state.inventory.filter((id) => id !== 'coil');
    game._note('You splice the coil into the terminal. Fans spin up. A cursor appears.');
  },
  'core:terminal': (state, game) => {
    if (!state.flags.has('power')) {
      game._error('The terminal is dead. It needs power first.');
      return;
    }
    if (state.flags.has('root')) {
      game._note('The terminal is already root. The hatch is open.');
      return;
    }
    state.flags.add('root');
    state.flags.add('kernel_open');
    state.inventory.push('token');
    game._note('You ask for a shell and receive a root token. A hatch grinds open in the floor.');
    game._note('Taken: root token.');
  },
  'kernel:token': (state, game) => {
    game._say('The kernel accepts the token. Every dead process in the machine turns to look at you.');
    game._say('You type the only instruction that matters: resume.');
    game._say('COLD BOOT COMPLETE // welcome back, operator.');
    state.status = 'won';
    game._note(`Solved in ${state.moves} commands. Type "restart" to run it again.`);
  },
};

const SCENES = {
  boot: {
    title: 'COLD BOOT',
    text: () => [
      'You wake inside a process that should have exited hours ago.',
      'The floor is a grid of unlit cells. Somewhere north, a crawlspace breathes.',
      'A prompt blinks in the dark, patient as a pulse.',
    ],
    exits: [{ dir: 'north', to: 'corridor', label: 'North' }],
    items: [],
  },
  corridor: {
    title: 'SERVICE CORRIDOR',
    text: (state) => [
      'Cable trays run overhead like veins. One fluorescent tube stutters in time with your heartbeat.',
      state.flags.has('junction_open')
        ? 'To the north, the junction door stands open.'
        : 'To the north, a junction door sits under a red reader light.',
      'East, a rack of dead storage still glows faintly.',
    ],
    exits: [
      { dir: 'south', to: 'boot', label: 'South' },
      { dir: 'east', to: 'cache', label: 'East' },
      { dir: 'north', to: 'junction', label: 'North' },
    ],
    items: [],
  },
  cache: {
    title: 'DATA CACHE',
    text: () => [
      'Shelves of drives, most of them cold. One drawer is still warm.',
      'A supply crate sits open on the floor where a technician left it mid-shift.',
    ],
    exits: [{ dir: 'west', to: 'corridor', label: 'West' }],
    items: [
      { id: 'keycard', name: 'keycard', description: ITEM_DESCRIPTIONS.keycard, aliases: ITEM_ALIASES.keycard },
      { id: 'coil', name: 'power coil', description: ITEM_DESCRIPTIONS.coil, aliases: ITEM_ALIASES.coil },
      { id: 'chit', name: 'data chit', description: ITEM_DESCRIPTIONS.chit, aliases: ITEM_ALIASES.chit },
    ],
  },
  junction: {
    title: 'JUNCTION',
    text: (state) => [
      'Three dead monitors stack against the wall, all showing the same frozen frame.',
      state.flags.has('junction_open')
        ? 'The security door to the core is unlocked.'
        : 'A security door blocks the core. A card reader pulses red beside it.',
    ],
    exits: [
      { dir: 'west', to: 'corridor', label: 'West' },
      {
        dir: 'north',
        to: 'core',
        label: 'North',
        requires: 'junction_open',
        blocked: 'The junction door will not budge. A reader blinks red: CREDENTIAL REQUIRED.',
      },
    ],
    items: [],
  },
  core: {
    title: 'THE CORE',
    text: (state) => [
      state.flags.has('power')
        ? 'The terminal is alive, cursor steady. Heat pours off the racks.'
        : 'A terminal squats in the middle of the room, dark and cold.',
      state.flags.has('kernel_open')
        ? 'A hatch in the floor stands open, breathing warm air up at you.'
        : 'The floor is solid. There is no way down yet.',
    ],
    exits: [
      { dir: 'south', to: 'junction', label: 'South' },
      {
        dir: 'down',
        to: 'kernel',
        label: 'Down',
        requires: 'kernel_open',
        blocked: 'The floor is sealed. The kernel is not listening yet.',
      },
    ],
    items: [{ id: 'terminal', name: 'terminal', description: 'A terminal with no power. Its drive bay is empty.', takeable: false }],
  },
  kernel: {
    title: 'KERNEL SPACE',
    text: () => [
      'No walls. Just addresses, endless and numbered, receding in every direction.',
      'At the centre: a prompt with no owner, waiting for a capability token.',
    ],
    exits: [],
    items: [{ id: 'prompt', name: 'prompt', description: 'It reads: INSERT TOKEN TO RESUME.', takeable: false }],
  },
};

const ALIASES = {
  l: 'look',
  i: 'inventory',
  inv: 'inventory',
  get: 'take',
  grab: 'take',
  x: 'examine',
  inspect: 'examine',
  help: 'help',
  '?': 'help',
  move: 'go',
  walk: 'go',
};
