// The Both Encounters' page (web/build/dist/tbo, see web/shell-tbo), with small made-up
// installations of both games (no real game data is needed): checks that the page is the
// version's (names, the two demos offered), takes the two installations as two .zip files picked one
// after the other or as one .zip with both folders, says what is missing or wrong, puts each
// installation's files where the engine looks for them (/data, The First Encounter's in
// /tfe, passed as +cdpath), keeps the group files in pieces in the browser's storage, from
// where the engine reads them (also on the next visit), keeps them and the options apart
// from The First Encounter's page, and that The First Encounter's service worker leaves
// /tbo/ alone.
//
//   node tbo-page.mjs [--browser chromium|webkit|firefox]

import { chromium, webkit, firefox } from 'playwright';
import { serve } from './server.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const browserIndex = argv.indexOf('--browser');
const browserName = browserIndex >= 0 ? argv.splice(browserIndex, 2)[1] : 'chromium';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-tbo-'));

// a made-up installation: group files (real zip archives) and some loose files
function install(folder, files) {
  const dir = path.join(tmp, 'installs', folder);
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (name.endsWith('.gro')) {
      const inside = path.join(tmp, 'gro', name);
      fs.mkdirSync(inside, { recursive: true });
      fs.writeFileSync(path.join(inside, 'Readme.txt'), contents);
      execFileSync('zip', ['-q', '-r', full, '.'], { cwd: inside });
    } else {
      fs.writeFileSync(full, contents);
    }
  }
  return dir;
}
const tseDir = install('Serious Sam Classic The Second Encounter', {
  'SE1_00.gro': 'the second encounter', 'SE1_00_Levels.gro': 'its levels',
  'Bin/SeriousSam.exe': 'not needed', 'Help/Readme.txt': 'not needed either',
  // (TBO's own scripts are used, and mods aren't offered)
  'Scripts/Game_startup.ini': 'sam_strFirstLevel = "Levels\\\\LevelsMP\\\\1_0_InTheLastEpisode.wld";', 'Mods/Warped/Warped3.gro': 'a mod',
});
const tfeDir = install('Serious Sam Classic The First Encounter', {
  '1_00c.gro': 'the first encounter', '1_00_music.gro': 'its music', 'Levels/01_Hatshepsut.wld': 'a loose level',
  // (only its game data is read)
  'Scripts/Menu/Options.cfg': 'not read', 'Controls/00-Default.ctl': 'not read', 'Demos/auto-demo0001.dem': 'not read',
});
const zip = (name, cwd, ...what) => {
  const out = path.join(tmp, name);
  execFileSync('zip', ['-q', '-r', out, ...what], { cwd });
  return out;
};
const tseZip = zip('tse.zip', path.dirname(tseDir), path.basename(tseDir));
const tfeZip = zip('tfe.zip', path.dirname(tfeDir), path.basename(tfeDir));
const bothZip = zip('both.zip', path.dirname(tseDir), path.basename(tseDir), path.basename(tfeDir));
fs.writeFileSync(path.join(tmp, 'notes.txt'), 'not a game');
const otherZip = zip('other.zip', tmp, 'notes.txt');

const server = await serve();
const browser = await { chromium, webkit, firefox }[browserName].launch({ headless: true,
  args: browserName === 'chromium' ? ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] : [] });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const errors = [];
const results = {};
const note = (page) => page.textContent('#own-files-note');
const databases = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());

// The First Encounter's page first, so its service worker is there when /tbo/ is visited
const tfePage = await context.newPage();
tfePage.on('pageerror', (e) => errors.push(e.stack || e.message));
await tfePage.goto(`${server.url}/index.html`);
await tfePage.evaluate(() => navigator.serviceWorker.ready);
await tfePage.reload();
await tfePage.evaluate(() => localStorage.setItem('touchControls', 'on'));

const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.stack || e.message));
await page.goto(`${server.url}/tbo/index.html`);
results['the page is The Both Encounters\' (names, the two demos, several .zip files can be picked)'] =
  await page.title() === 'Serious Sam: The Both Encounters'
  && (await page.textContent('#panel .subtitle')) === 'The Both Encounters'
  && (await page.textContent('#play-demo')) === 'Play the demos'
  && (await page.textContent('#about-demo summary')) === 'About the demos'
  && await page.evaluate(() => document.getElementById('game-zip').multiple)
  && (await note(page)).includes('The Second Encounter') && (await note(page)).includes('The First Encounter');

// its options are its own
results['the options are kept apart from The First Encounter\'s page'] =
  await page.evaluate(() => document.getElementById('touch-mode').value) === 'auto';
await page.selectOption('#touch-mode', 'off');
results['the options are kept apart from The First Encounter\'s page'] &&=
  await page.evaluate(() => localStorage.getItem('tbo.touchControls') === 'off' && localStorage.getItem('touchControls') === 'on');

// what isn't the games
await page.setInputFiles('#game-zip', otherZip);
await page.waitForFunction(() => /No game files/.test(document.getElementById('own-files-note').textContent));
results['a .zip without the games is refused'] = true;

// one installation, then the other
await page.setInputFiles('#game-zip', tseZip);
await page.waitForFunction(() => /still missing/.test(document.getElementById('own-files-note').textContent));
results[`one installation: the other is asked for ("${(await note(page)).trim()}")`] =
  (await note(page)).includes('The First Encounter is still missing');
await page.setInputFiles('#game-zip', tfeZip);
await page.waitForSelector('#start:not([hidden])', { timeout: 120000 });
const files = await page.evaluate(() => {
  const exists = (p) => { try { Module.FS.stat(p); return true; } catch (e) { return false; } };
  // (the group files are only names: the engine reads them from the browser's storage)
  const groups = ['/data/SE1_00.gro', '/data/SE1_00_Levels.gro', '/tfe/1_00c.gro', '/tfe/1_00_music.gro'];
  return {
    inStorage: groups.every((p) => Module.FS.stat(p).size === 0 && GameArchives.open(p) >= 0),
    tse: exists('/data/SE1_00.gro') && exists('/data/SE1_00_Levels.gro'),
    tfe: exists('/tfe/1_00c.gro') && exists('/tfe/1_00_music.gro') && exists('/tfe/Levels/01_Hatshepsut.wld'),
    // (and the repository's files, from the base package)
    base: exists('/data/SE1_10b.gro') && exists('/data/ModEXT.txt'),
    notNeeded: exists('/data/Bin/SeriousSam.exe') || exists('/data/Help/Readme.txt') || exists('/data/Mods/Warped/Warped3.gro')
      || exists('/tfe/Scripts/Menu/Options.cfg') || exists('/tfe/Controls/00-Default.ctl') || exists('/tfe/Demos/auto-demo0001.dem'),
    // (TBO's own startup script, not the installation's, which would start The Second Encounter)
    ownScripts: !new TextDecoder().decode(Module.FS.readFile('/data/Scripts/Game_startup.ini')).includes('1_0_InTheLastEpisode'),
    tfeNotInData: exists('/data/1_00c.gro'),
  };
});
results[`each installation's files are where the engine looks for them (${JSON.stringify(files)})`] =
  files.tse && files.tfe && files.base && !files.notNeeded && !files.tfeNotInData && files.inStorage && files.ownScripts;

// kept in the version's own store, The First Encounter's under tfe/: the group files in
// pieces, the others whole
const storedKeys = (p, store) => p.evaluate(async (store) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('tbo-own-files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const keys = await new Promise((resolve) => {
    const r = db.transaction(store).objectStore(store).getAllKeys();
    r.onsuccess = () => resolve(r.result.map((k) => (Array.isArray(k) ? k.join('#') : k)).sort());
  });
  db.close();
  return keys;
}, store);
const kept = await storedKeys(page, 'files');
const pieces = await storedKeys(page, 'chunks');
results[`the files are kept in the version's own store (${kept.join(', ')}; in pieces: ${pieces.join(', ')})`] =
  kept.includes('tfe/Levels/01_Hatshepsut.wld') && !kept.some((k) => k.endsWith('.gro'))
  && pieces.includes('SE1_00.gro#0') && pieces.includes('tfe/1_00c.gro#0')
  && !(await databases(page)).includes('sam-own-files');

// the engine gets The First Encounter's folder, and reads both games' group files (it can't
// get further than that with these made-up ones)
await page.click('#start');
await page.waitForFunction(() => window.engineLog.some((l) => /Loading group files/.test(l)), null, { timeout: 60000 });
await page.waitForTimeout(3000);
const log = await page.evaluate(() => window.engineLog);
for (const l of log.filter((l) => /arguments|\.gro:/.test(l))) console.log(l);
results['the engine is started with +cdpath /tfe/ and reads both installations\' group files'] =
  log.some((l) => l.includes('Starting with arguments: +cdpath /tfe/'))
  && log.some((l) => /\/data\/SE1_00\.gro: \d+ files/.test(l)) && log.some((l) => /\/tfe\/1_00c\.gro: \d+ files/.test(l));
results['its settings and saved games are in its own storage (/tbo-user)'] =
  (await databases(page)).includes('/tbo-user') && !(await databases(page)).includes('/user');

// the next visit (the files count as kept once the game has run with them; these made-up
// ones can't, so that is done here): the group files are read from their pieces again
await page.evaluate(async () => {
  const db = await new Promise((resolve) => { const r = indexedDB.open('tbo-own-files'); r.onsuccess = () => resolve(r.result); });
  const files = ['SE1_00.gro', 'SE1_00_Levels.gro', 'tfe/1_00c.gro', 'tfe/1_00_music.gro']
    .map((path) => ({ path, size: GameArchives.size(GameArchives.open(`/${path.startsWith('tfe/') ? '' : 'data/'}${path}`)), chunked: true }))
    .concat([{ path: 'tfe/Levels/01_Hatshepsut.wld', size: 13 }]);
  await new Promise((resolve) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ files, bytes: files.reduce((n, f) => n + f.size, 0), savedAt: Date.now() }, 'meta');
    tx.oncomplete = resolve;
  });
  db.close();
});
const again = await context.newPage();
again.on('pageerror', (e) => errors.push(e.stack || e.message));
await again.goto(`${server.url}/tbo/index.html`);
await again.waitForSelector('#play-own:not([hidden])', { timeout: 10000 });
await again.click('#play-own');
await again.waitForSelector('#start:not([hidden])', { timeout: 120000 });
await again.click('#start');
await again.waitForFunction(() => window.engineLog.some((l) => /\/tfe\/1_00c\.gro: \d+ files/.test(l)), null, { timeout: 60000 })
  .catch(() => {});
const againLog = await again.evaluate(() => window.engineLog);
results['the next visit plays the kept files, the group files from their pieces'] =
  againLog.some((l) => /\/data\/SE1_00\.gro: \d+ files/.test(l)) && againLog.some((l) => /\/tfe\/1_00c\.gro: \d+ files/.test(l))
  && await again.evaluate(() => Module.FS.stat('/data/SE1_00.gro').size === 0 && Module.FS.stat('/tfe/Levels/01_Hatshepsut.wld').size === 13);
await again.close();

// files kept by a visit where the game never started with them are deleted the next time
const unfinished = await context.newPage();
await unfinished.goto(`${server.url}/tbo/index.html`);
const removedUnfinished = await unfinished.evaluate(async () => {
  // (a set started over an hour ago, never finished: no list of files)
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('tbo-own-files', 2);
    r.onupgradeneeded = () => ['files', 'meta', 'chunks'].forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, n === 'files' ? { keyPath: 'path' } : undefined); });
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise((resolve) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ startedAt: Date.now() - 2 * 60 * 60 * 1000 }, 'meta');
    tx.oncomplete = resolve;
  });
  db.close();
  return true;
});
await unfinished.reload();
await unfinished.waitForFunction(() => window.engineLog.some((l) => /never started with were deleted/.test(l)), null, { timeout: 10000 })
  .catch(() => {});
results['files the game never started with are deleted on the next visit'] = removedUnfinished
  && !(await databases(unfinished)).includes('tbo-own-files') && !await unfinished.isVisible('#play-own');
await unfinished.close();

// one .zip with both folders
const page2 = await context.newPage();
page2.on('pageerror', (e) => errors.push(e.stack || e.message));
await page2.goto(`${server.url}/tbo/index.html`);
await page2.setInputFiles('#game-zip', bothZip);
await page2.waitForSelector('#start:not([hidden])', { timeout: 120000 });
results['one .zip with both folders is taken'] = await page2.evaluate(() => {
  const exists = (p) => { try { Module.FS.stat(p); return true; } catch (e) { return false; } };
  return exists('/data/SE1_00.gro') && exists('/tfe/1_00c.gro');
});

// The First Encounter's service worker doesn't keep The Both Encounters' files
const tfeCached = await tfePage.evaluate(async () => {
  const cache = await caches.open('sam-app');
  return (await cache.keys()).map((r) => new URL(r.url).pathname);
});
results[`The First Encounter's worker leaves /tbo/ alone (${tfeCached.filter((p) => p.includes('/tbo/')).length} of its files cached)`] =
  tfeCached.length > 0 && !tfeCached.some((p) => p.includes('/tbo/'));

await browser.close();
await server.close();
fs.rmSync(tmp, { recursive: true, force: true });

let ok = true;
for (const [what, passed] of Object.entries(results)) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= passed;
}
for (const e of errors) console.log(`page error: ${e}`);
ok &&= errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
