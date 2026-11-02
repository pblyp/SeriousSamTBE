'use strict';

// What the page plays, The Both Encounters: The Second Encounter's code, which also plays The
// First Encounter's levels, from both games' installations (The First Encounter's is the engine's
// second data folder, +cdpath) or both games' demos. Also read by sw.js.
self.GameConfig = {
  // the engine: <jspi|asyncify>/<engine>.js and .wasm
  engine: 'serioussamtbo',
  // the two games' demos, played one after the other as the campaign is (Karnak, then Palenque):
  // the folder each one is in (demo/<folder>/, with its demo-files.json, see demo-download.js),
  // where its files go, the start of its IndexedDB databases' names, and what isn't taken
  demos: [
    { name: 'The First Encounter\'s demo', folder: 'tfe', root: '/tfe/', prefix: 'sam-demo-',
      skip: /^(scripts|controls|data|demos|mods|postinstall)\//i },
    { name: 'The Second Encounter\'s demo', folder: 'tse', root: '/data/', prefix: 'tbo-demo-',
      skip: /^(scripts|mods)\//i },
  ],
  // the installations the player's game files come from, told apart by their group files (The
  // Second Encounter's demo counts as its installation): where the page puts each one's files,
  // the prefix of their names among the game files kept in this browser, and what isn't taken:
  // TBO's own scripts are used (The Second Encounter's would start its campaign), mods aren't
  // offered, and of The First Encounter's (the engine's second data folder) only its game data
  // is read
  installs: [
    { id: 'tse', name: 'The Second Encounter', root: '/data/', storePrefix: '', groups: /^(se1_00|sedemo1_00)/,
      skip: /^(scripts|mods)\//i },
    { id: 'tfe', name: 'The First Encounter', root: '/tfe/', storePrefix: 'tfe/', groups: /^1_00c/,
      skip: /^(scripts|controls|data|demos|mods|postinstall)\//i },
  ],
  // engine arguments for them
  args: ['+cdpath', '/tfe/'],
  // what the page keeps in this browser (the names it had at /tbo/, so what players kept there stays)
  ownFilesDb: 'tbo-own-files',
  userDir: '/tbo-user',
  optionPrefix: 'tbo.',
  cache: 'tbo-app',
  // network games: the prefix of room names
  netRoomPrefix: 'tbo-',
};
