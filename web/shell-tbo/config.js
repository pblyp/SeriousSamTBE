'use strict';

// The Both Encounters (see web/shell/config.js): The Second Encounter's code, which also plays
// The First Encounter's levels, from both games' installations (The First Encounter's is the
// engine's second data folder, +cdpath)
self.GameConfig = {
  title: 'Serious Sam: The Both Encounters',
  subtitle: 'The Both Encounters',
  engine: 'serioussamtbo',
  demo: false,
  // (both installations are more than some phones let a page have in memory)
  lazyArchives: true,
  // (told apart by their group files). skip: what isn't taken from an installation: TBO's own
  // scripts are used (The Second Encounter's would start its campaign), mods aren't offered, and
  // of The First Encounter's (the engine's second data folder) only its game data is read
  installs: [
    { id: 'tse', name: 'The Second Encounter', root: '/data/', storePrefix: '', groups: /^se1_00/,
      skip: /^(scripts|mods)\//i },
    { id: 'tfe', name: 'The First Encounter', root: '/tfe/', storePrefix: 'tfe/', groups: /^1_00c/,
      skip: /^(scripts|controls|data|demos|mods|postinstall)\//i },
  ],
  args: ['+cdpath', '/tfe/'],
  ownFilesDb: 'tbo-own-files',
  userDir: '/tbo-user',
  optionPrefix: 'tbo.',
  cache: 'tbo-app',
  otherVersions: [],
  netAppId: 'serioussam-tbo-web',
  netRoomPrefix: 'tbo-',
};
