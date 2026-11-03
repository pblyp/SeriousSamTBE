'use strict';

// What the page plays, The Both Encounters: The Second Encounter's code, which also plays The
// First Encounter's levels, from both games' installations (The First Encounter's is the engine's
// second data folder, +cdpath) or both games' demos. Also read by sw.js.
self.GameConfig = (() => {
// what the page doesn't take from each game's installation (or demo), as the game doesn't read it.
// Of The Second Encounter's: TBE's own scripts are used (its own would start its campaign), mods
// aren't offered, nor its recorded demos (the menu plays only the intro flyover when idle), its
// translations (the engine doesn't read Locales/) or the editor's data (ExtraTools, 1_07_tools,
// VirtualTrees, Worlds)
const TSE_SKIP = /^(scripts|mods|demos|locales|virtualtrees|worlds)\/|^[^/]*extratools[^/]*\.gro$|^1_07_tools\.gro$/i;
// Of The First Encounter's (the engine's second data folder, whose files rank below The Second
// Encounter's and the base package's): only its levels and the game data they need. Not TBE's own
// scripts, controls and settings, nor its 1.10 engine data (SE1_10*.gro: whatever of it anything
// refers to, The Second Encounter's group files and the base package have too), the intro flyover
// (TBE plays The Second Encounter's) or the editor's data
const TFE_SKIP = /^(scripts|controls|data|demos|mods|postinstall|virtualtrees|worlds)\/|^se1_10[^/]*\.gro$|^[^/]*extratools[^/]*\.gro$|^levels\/intro\.wld$/i;

return {
  // the engine: <jspi|asyncify>/<engine>.js and .wasm
  engine: 'serioussamtbe',
  // the two games' demos, played one after the other as the campaign is (Karnak, then Palenque):
  // the folder each one is in (demo/<folder>/, with its demo-files.json, see demo-download.js),
  // where its files go, the start of its IndexedDB databases' names, and what isn't taken
  demos: [
    { name: 'The First Encounter\'s demo', folder: 'tfe', root: '/tfe/', prefix: 'tbe-demo-tfe-', skip: TFE_SKIP },
    { name: 'The Second Encounter\'s demo', folder: 'tse', root: '/data/', prefix: 'tbe-demo-tse-', skip: TSE_SKIP },
  ],
  // the installations the player's game files come from, told apart by their group files (The
  // Second Encounter's demo counts as its installation): where the page puts each one's files,
  // the prefix of their names among the game files kept in this browser, and what isn't taken (see
  // above)
  installs: [
    { id: 'tse', name: 'The Second Encounter', root: '/data/', storePrefix: '', groups: /^(se1_00|sedemo1_00)/,
      skip: TSE_SKIP },
    { id: 'tfe', name: 'The First Encounter', root: '/tfe/', storePrefix: 'tfe/', groups: /^1_00c/,
      skip: TFE_SKIP },
  ],
  // engine arguments for them
  args: ['+cdpath', '/tfe/'],
  // what the page keeps in this browser
  ownFilesDb: 'tbe-own-files',
  userDir: '/tbe-user',
  optionPrefix: 'tbe.',
  cache: 'tbe-app',
  // what earlier versions of the page kept, deleted when it starts (the player's game files and the
  // demos, which take much room; their saved games stay): databases, and the starts of their names
  oldDatabases: ['tbo-own-files', 'sam-own-files'],
  oldDatabasePrefixes: ['sam-demo-', 'tbo-demo-'],
  oldCaches: ['tbo-app', 'sam-app'],
  // network games: the prefix of room names
  netRoomPrefix: 'tbe-',
};
})();
