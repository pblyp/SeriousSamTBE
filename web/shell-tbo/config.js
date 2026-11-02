'use strict';

// The Both Encounters (see web/shell/config.js): The Second Encounter's code, which also plays
// The First Encounter's levels, from both games' installations (The First Encounter's is the
// engine's second data folder, +cdpath)
self.GameConfig = {
  title: 'Serious Sam: The Both Encounters',
  subtitle: 'The Both Encounters',
  engine: 'serioussamtbo',
  demo: false,
  // (told apart by their group files)
  installs: [
    { id: 'tse', name: 'The Second Encounter', root: '/data/', storePrefix: '', groups: /^se1_00/ },
    { id: 'tfe', name: 'The First Encounter', root: '/tfe/', storePrefix: 'tfe/', groups: /^1_00c/ },
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
