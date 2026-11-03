// The page (web/build/dist, see web/shell), with small made-up installations of both games (no
// real game data is needed): checks its names and that it offers the two demos, takes the two
// installations as two .zip files picked one after the other or as one .zip with both folders,
// says what is missing or wrong, puts each installation's files where the engine looks for them
// (/data, The First Encounter's in /tfe, passed as +cdpath), keeps the group files in pieces in
// the browser's storage, from where the engine reads them (also on the next visit), keeps its
// files and options under its own names, and that it deletes what earlier versions kept.
//
//   node tbe-page.mjs [--browser chromium|webkit|firefox]

import { chromium, webkit, firefox } from 'playwright';
import { serve } from './server.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const browserIndex = argv.indexOf('--browser');
const browserName = browserIndex >= 0 ? argv.splice(browserIndex, 2)[1] : 'chromium';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-tbe-'));

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
  // (TBE's own scripts are used, and mods aren't offered)
  'Scripts/Game_startup.ini': 'sam_strFirstLevel = "Levels\\\\LevelsMP\\\\1_0_InTheLastEpisode.wld";', 'Mods/Warped/Warped3.gro': 'a mod',
  // (what the game doesn't read: recorded demos, translations, the editor's data, the store's files)
  'Demos/auto-demo0001.dem': 'not read', 'Locales/eng/Mods/SecondEncounter.des': 'not read',
  'SE1_00_ExtraTools.gro': 'the editor\'s', '1_07_tools.gro': 'the editor\'s', 'VirtualTrees/Basic.vrt': 'the editor\'s',
  'Worlds/TemplatesSE/Statues.wld': 'the editor\'s', 'goggame-1207658877.info': 'the store\'s', 'ReadMe.htm': 'the store\'s',
  'license.txt': 'the store\'s',
});
const tfeDir = install('Serious Sam Classic The First Encounter', {
  '1_00c.gro': 'the first encounter', '1_00_music.gro': 'its music', 'Levels/01_Hatshepsut.wld': 'a loose level',
  // (only its game data is read)
  'Scripts/Menu/Options.cfg': 'not read', 'Controls/00-Default.ctl': 'not read', 'Demos/auto-demo0001.dem': 'not read',
  // (its 1.10 engine data, which The Second Encounter's has, its intro flyover, the editor's data, the store's files)
  'SE1_10.gro': 'never wins', 'Levels/Intro.wld': 'not played', '1_00_ExtraTools.gro': 'the editor\'s',
  'VirtualTrees/Basic.vrt': 'the editor\'s', 'installscript.vdf': 'the store\'s',
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

const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.stack || e.message));
await page.goto(`${server.url}/index.html`);
results['the page\'s names, the two demos, several .zip files can be picked'] =
  await page.title() === 'Serious Sam: The Both Encounters'
  && (await page.textContent('#panel .subtitle')) === 'The Both Encounters'
  && (await page.textContent('#play-demo')) === 'Play the demos'
  && (await page.textContent('#about-demo summary')) === 'About the demos'
  && await page.evaluate(() => document.getElementById('game-zip').multiple)
  && (await note(page)).includes('The Second Encounter') && (await note(page)).includes('The First Encounter');

// exports are for personal use, and where to buy the games: each game on both stores, in a new tab
const STORES = [
  'https://store.steampowered.com/app/41050/Serious_Sam_Classic_The_First_Encounter/',
  'https://store.steampowered.com/app/41060/Serious_Sam_Classic_The_Second_Encounter/',
  'https://www.gog.com/en/game/serious_sam_the_first_encounter',
  'https://www.gog.com/en/game/serious_sam_the_second_encounter',
];
const buyNote = await page.evaluate(() => {
  const el = document.getElementById('buy-note');
  return { text: el.textContent.replace(/\s+/g, ' '), visible: !!el.offsetParent,
    links: [...el.querySelectorAll('a')].map((a) => ({ href: a.href, newTab: a.target === '_blank' && a.rel === 'noopener' })) };
});
results['the page says exports are for personal use, and links to both games on both stores'] = buyNote.visible
  && buyNote.text.includes('personal use') && buyNote.text.includes('DRM-free')
  && buyNote.links.length === STORES.length && buyNote.links.every(({ href, newTab }, i) => href === STORES[i] && newTab);

// its options, under its own names
results['the options are kept under the page\'s names (tbe.)'] =
  await page.evaluate(() => document.getElementById('touch-mode').value) === 'auto';
await page.selectOption('#touch-mode', 'off');
results['the options are kept under the page\'s names (tbe.)'] &&=
  await page.evaluate(() => localStorage.getItem('tbe.touchControls') === 'off');

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
      || exists('/tfe/Scripts/Menu/Options.cfg') || exists('/tfe/Controls/00-Default.ctl') || exists('/tfe/Demos/auto-demo0001.dem')
      || ['/data/Demos/auto-demo0001.dem', '/data/Locales/eng/Mods/SecondEncounter.des', '/data/SE1_00_ExtraTools.gro',
        '/data/1_07_tools.gro', '/data/VirtualTrees/Basic.vrt', '/data/Worlds/TemplatesSE/Statues.wld',
        '/data/goggame-1207658877.info', '/data/ReadMe.htm', '/data/license.txt', '/tfe/SE1_10.gro', '/tfe/Levels/Intro.wld',
        '/tfe/1_00_ExtraTools.gro', '/tfe/VirtualTrees/Basic.vrt', '/tfe/installscript.vdf'].some(exists),
    // (TBE's own startup script, not the installation's, which would start The Second Encounter)
    ownScripts: !new TextDecoder().decode(Module.FS.readFile('/data/Scripts/Game_startup.ini')).includes('1_0_InTheLastEpisode'),
    tfeNotInData: exists('/data/1_00c.gro'),
  };
});
results[`each installation's files are where the engine looks for them (${JSON.stringify(files)})`] =
  files.tse && files.tfe && files.base && !files.notNeeded && !files.tfeNotInData && files.inStorage && files.ownScripts;

// kept in the page's store, The First Encounter's under tfe/: the group
// files in pieces, the others whole
const storedKeys = (p, store) => p.evaluate(async (store) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('tbe-own-files');
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
results[`the files are kept in the page's store (${kept.join(', ')}; in pieces: ${pieces.join(', ')})`] =
  kept.includes('tfe/Levels/01_Hatshepsut.wld') && !kept.some((k) => k.endsWith('.gro'))
  && kept.length === 1 && pieces.length === 4
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
results['its settings and saved games are in its storage (/tbe-user)'] =
  (await databases(page)).includes('/tbe-user') && !(await databases(page)).includes('/user');

// the next visit (the files count as kept once the game has run with them; these made-up
// ones can't, so that is done here): the group files are read from their pieces again
await page.evaluate(async () => {
  const db = await new Promise((resolve) => { const r = indexedDB.open('tbe-own-files'); r.onsuccess = () => resolve(r.result); });
  const files = ['SE1_00.gro', 'SE1_00_Levels.gro', 'tfe/1_00c.gro', 'tfe/1_00_music.gro']
    .map((path) => ({ path, size: GameArchives.size(GameArchives.open(`/${path.startsWith('tfe/') ? '' : 'data/'}${path}`)), chunked: true }))
    .concat([{ path: 'tfe/Levels/01_Hatshepsut.wld', size: 13 }])
    // (and two files that earlier versions of the page kept, which it doesn't take any more)
    .concat([{ path: 'tfe/SE1_10.gro', size: 3, chunked: true }, { path: 'goggame-1207658877.info', size: 3 }]);
  await new Promise((resolve) => {
    const tx = db.transaction(['meta', 'chunks', 'files'], 'readwrite');
    tx.objectStore('chunks').put(new Uint8Array([1, 2, 3]).buffer, ['tfe/SE1_10.gro', 0]);
    tx.objectStore('files').put({ path: 'goggame-1207658877.info', data: new Uint8Array([1, 2, 3]).buffer });
    tx.objectStore('meta').put({ files, bytes: files.reduce((n, f) => n + f.size, 0), savedAt: Date.now() }, 'meta');
    tx.oncomplete = resolve;
  });
  db.close();
});
const again = await context.newPage();
again.on('pageerror', (e) => errors.push(e.stack || e.message));
await again.goto(`${server.url}/index.html`);
await again.waitForSelector('#play-own:not([hidden])', { timeout: 10000 });
// (what the page doesn't take any more is deleted from what it keeps)
const prunedLog = (await again.evaluate(() => window.engineLog)).find((l) => l.startsWith('Deleted ')) || 'nothing deleted';
const afterPrune = { files: await storedKeys(again, 'files'), pieces: await storedKeys(again, 'chunks') };
const afterMeta = await again.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('tbe-own-files');
  r.onsuccess = () => {
    const g = r.result.transaction('meta').objectStore('meta').get('meta');
    g.onsuccess = () => { r.result.close(); resolve(g.result.files.map(({ path }) => path)); };
  };
}));
results[`what the page doesn't take any more is deleted from what it kept (${prunedLog})`] =
  /^Deleted 2 game files/.test(prunedLog) && afterMeta.length === 5 && !afterMeta.some((p) => /SE1_10|goggame/.test(p))
  && !afterPrune.pieces.some((k) => k.startsWith('tfe/SE1_10.gro')) && !afterPrune.files.includes('goggame-1207658877.info');
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
await unfinished.goto(`${server.url}/index.html`);
const removedUnfinished = await unfinished.evaluate(async () => {
  // (a set started over an hour ago, never finished: no list of files)
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('tbe-own-files', 2);
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
  && !(await databases(unfinished)).includes('tbe-own-files') && !await unfinished.isVisible('#play-own');
await unfinished.close();

// one .zip with both folders
const page2 = await context.newPage();
page2.on('pageerror', (e) => errors.push(e.stack || e.message));
await page2.goto(`${server.url}/index.html`);
await page2.setInputFiles('#game-zip', bothZip);
await page2.waitForSelector('#start:not([hidden])', { timeout: 120000 });
results['one .zip with both folders is taken'] = await page2.evaluate(() => {
  const exists = (p) => { try { Module.FS.stat(p); return true; } catch (e) { return false; } };
  return exists('/data/SE1_00.gro') && exists('/tfe/1_00c.gro');
});

// network games: the page finds the hub of the server it comes from
results['network games go through the page\'s server'] = await page2.evaluate(() =>
  fetch('net-hub.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then(({ hub }) => hub === '/hub', () => false));

// what earlier versions of the page kept is deleted, apart from saved games
const old = await browser.newContext();
const before = await old.newPage();
await before.goto(`${server.url}/net-hub.json`);
await before.evaluate(() => Promise.all(['tbo-own-files', 'sam-demo-0123', 'tbo-demo-4567', '/tbo-user']
  .map((name) => new Promise((resolve) => { const r = indexedDB.open(name); r.onsuccess = () => { r.result.close(); resolve(); }; }))));
const later = await old.newPage();
await later.goto(`${server.url}/index.html`);
await later.waitForFunction(async () => !(await indexedDB.databases()).some((d) => d.name === 'tbo-own-files'), null, { timeout: 10000 })
  .catch(() => {});
const left = await databases(later);
results[`what earlier versions kept is deleted, saved games stay (${left.join(' ')})`] = !left.includes('tbo-own-files')
  && !left.some((name) => /^(sam|tbo)-demo-/.test(name)) && left.includes('/tbo-user');
await old.close();

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
