// The Both Encounters with real installations (not part of npm test: it needs both games'
// files, which aren't in the repository). Picks the two installations' .zip files on the
// TBO page, then starts each level of both games in turn and reports what the engine said
// about it: missing entity classes, missing files, errors, and whether a player was added.
// It also lists the files that both installations have with different contents (The Second
// Encounter's are the ones used).
//
//   TBO_TSE_ZIP=<.zip of The Second Encounter's folder> TBO_TFE_ZIP=<.zip of The First
//   Encounter's folder> node tbo-levels.mjs [--browser chromium|webkit] [level ...]
//
// (or TBO_ZIP=<one .zip with both folders>). Levels are given as in the game, e.g.
// Levels/01_Hatshepsut.wld; without any, all of both games' levels are started.

import { chromium, webkit, firefox } from 'playwright';
import { serve } from './server.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const browserIndex = argv.indexOf('--browser');
const browserName = browserIndex >= 0 ? argv.splice(browserIndex, 2)[1] : 'chromium';
const zips = process.env.TBO_ZIP ? [process.env.TBO_ZIP] : [process.env.TBO_TSE_ZIP, process.env.TBO_TFE_ZIP];
if (zips.some((z) => !z || !fs.existsSync(z))) {
  console.log('Give the installations\' .zip files: TBO_TSE_ZIP and TBO_TFE_ZIP (or TBO_ZIP with both folders).');
  process.exit(2);
}

const server = await serve();
const browser = await { chromium, webkit, firefox }[browserName].launch({ headless: true,
  args: browserName === 'chromium' ? ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] : [] });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });

// the files once: picked, kept in the browser (the game counts them as kept once it has run)
const first = await context.newPage();
await first.goto(`${server.url}/tbo/index.html`);
await first.setInputFiles('#game-zip', zips);
await first.waitForSelector('#start:not([hidden]), #error:not([hidden])', { timeout: 30 * 60000 });
if (await first.isVisible('#error')) {
  console.log(`The files can't be used: ${await first.textContent('#status')}`);
  process.exit(1);
}

// both games' levels (loose, and in the group files), and the files they both have
const found = await first.evaluate(async () => {
  const levels = [];
  const contents = { '/data/': new Map(), '/tfe/': new Map() };
  const walk = (dir, root) => {
    for (const name of Module.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      const full = `${dir}/${name}`;
      if (Module.FS.isDir(Module.FS.stat(full).mode)) walk(full, root);
      else if (/\.wld$/i.test(name)) levels.push({ path: full.slice(root.length), root });
    }
  };
  for (const root of Object.keys(contents)) {
    try { walk(`${root}Levels`, root); } catch (e) { /* none loose */ }
    for (const name of Module.FS.readdir(root).filter((n) => /\.gro$/i.test(n))) {
      const id = GameArchives.open(`${root}${name}`);
      if (id < 0) continue;
      for (const entry of await ZipReader.list(GameArchives.asBlob(id))) {
        contents[root].set(entry.path.toLowerCase(), entry.crc);
        if (/^levels\/.*\.wld$/i.test(entry.path)) levels.push({ path: entry.path, root });
      }
    }
  }
  const different = [...contents['/data/']].filter(([p, crc]) => contents['/tfe/'].has(p) && contents['/tfe/'].get(p) !== crc)
    .map(([p]) => p);
  return { levels, different };
});
console.log(`Files both installations have, with different contents (The Second Encounter's are used): ${found.different.length}`);
for (const p of found.different) console.log(`  ${p}`);

// the game must run once for the files to be kept
await first.click('#start');
await first.waitForFunction(() => window.engineLog.some((l) => /are kept in this browser|FatalError/.test(l)), null, { timeout: 120000 })
  .catch(() => {});
await first.close();

const wanted = argv.length ? argv : [...new Set(found.levels.map(({ path }) => path))].sort();
const report = [];
for (const level of wanted) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/tbo/index.html?args=${encodeURIComponent(`+level ${level}`)}`);
  await page.waitForSelector('#play-own:not([hidden])', { timeout: 20000 });
  await page.click('#play-own');
  await page.waitForSelector('#start:not([hidden])', { timeout: 120000 });
  await page.click('#start');
  await page.waitForFunction(() => window.engineLog.some((l) => /Adding player|FatalError|Cannot start/.test(l))
    || !document.getElementById('error').hidden, null, { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const log = await page.evaluate(() => window.engineLog);
  const started = log.some((l) => l.includes('Adding player'));
  const problems = log.filter((l) => /cannot|can't|error|not found|unknown|missing|warning/i.test(l)
    && !/Cannot load variable from 'ModExt|ModExt\.txt|DefaultMod\.txt/.test(l));
  const tfe = found.levels.some(({ path, root }) => path === level && root === '/tfe/');
  report.push({ level, game: tfe ? 'TFE' : 'TSE', started, problems: [...new Set([...problems, ...errors])] });
  console.log(`${started && problems.length === 0 ? 'ok  ' : started ? 'warn' : 'FAIL'} ${tfe ? 'TFE' : 'TSE'} ${level}`);
  for (const p of report.at(-1).problems.slice(0, 8)) console.log(`       ${p}`);
  await page.close();
}

await browser.close();
await server.close();
const failed = report.filter((r) => !r.started).length;
console.log(`${report.length} levels: ${report.length - failed} started, ${failed} didn't; `
  + `${report.filter((r) => r.problems.length).length} with messages to look at`);
fs.writeFileSync(new URL('../build/tbo-levels.json', import.meta.url), JSON.stringify({ ...found, report }, null, 2));
console.log('Details in web/build/tbo-levels.json');
process.exit(failed ? 1 : 0);
