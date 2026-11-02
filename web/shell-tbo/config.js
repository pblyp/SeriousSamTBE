'use strict';

// The Both Encounters (see web/shell/config.js): The Second Encounter's code, which also plays
// The First Encounter's levels, from both games' installations (The First Encounter's is the
// engine's second data folder, +cdpath)
self.GameConfig = {
  title: 'Serious Sam: The Both Encounters',
  subtitle: 'The Both Encounters',
  engine: 'serioussamtbo',
  demo: true,
  // the two games' demos, played one after the other as the campaign is (Karnak, then Palenque):
  // where each one is (relative to the page; The First Encounter's is the site's, shared with its
  // page), where its files go, the start of its IndexedDB databases' names, and what isn't taken
  demos: [
    { name: 'The First Encounter\'s demo', base: '../', root: '/tfe/', prefix: 'sam-demo-',
      skip: /^(scripts|controls|data|demos|mods|postinstall)\//i },
    { name: 'The Second Encounter\'s demo', base: '', root: '/data/', prefix: 'tbo-demo-',
      skip: /^(scripts|mods)\//i },
  ],
  demosNote: 'Karnak and Palenque, one after the other · about 200\u00a0MB, downloaded once',
  demosAbout: 'The game files downloaded here are only those of the official <em>Serious Sam: The First '
    + 'Encounter</em> demo (2001) and <em>Serious Sam: The Second Encounter</em> demo (2001), which, to our '
    + 'knowledge, are freely redistributable. They are the same demos that were given away on magazine discs '
    + 'and download sites and that the Internet Archive hosts today. Game files from your own installations, '
    + 'your settings and your saved games stay on your device: they are never shared.',
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
  netRoomPrefix: 'tbo-',
};
