'use strict';

// What differs between the versions of the game that share this page (web/build.sh puts each
// version's config.js next to its copy of the page): The First Encounter (this one), and The
// Both Encounters (web/shell-tbo/config.js), which plays both games' levels. Also read by sw.js.
self.GameConfig = {
  // the page's names
  title: 'Serious Sam: The First Encounter',
  subtitle: 'The First Encounter',
  // the engine: <jspi|asyncify>/<engine>.js and .wasm
  engine: 'serioussam',
  // the demo can be played (see demo-download.js)
  demo: true,
  // the player's group files are kept in pieces and read as the game needs them (archives.js),
  // instead of being in memory
  lazyArchives: false,
  // the installations the player's game files come from: where the page puts each one's files,
  // and the prefix of their names among the game files kept in this browser
  installs: [{ id: 'tfe', name: 'The First Encounter', root: '/data/', storePrefix: '' }],
  // engine arguments for them
  args: [],
  // what the page keeps in this browser
  ownFilesDb: 'sam-own-files',
  userDir: '/user',
  optionPrefix: '',
  cache: 'sam-app',
  // the other versions, in folders of this site (not this page's to cache)
  otherVersions: ['tbo/'],
  // network games: the prefix of room names (so the players of the versions don't meet)
  netRoomPrefix: '',
};
