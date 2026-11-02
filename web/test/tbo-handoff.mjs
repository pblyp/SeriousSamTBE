// The Both Encounters with real installations (not part of npm test): New Game starts The
// First Encounter's first level, and at The First Encounter's end its credits roll (Fire skips
// them), then The Second Encounter's first level follows, with the weapons the player has.
// The ending is started with dbg_bFirstEncounterEnd (the last level's own markers, from where its
// credits start), as playing there takes too long. Screenshots in web/build/tbo-handoff-*.png.
//
//   TBO_TSE_ZIP=<.zip of The Second Encounter's folder> TBO_TFE_ZIP=<.zip of The First
//   Encounter's folder> node tbo-handoff.mjs [--browser chromium|webkit]

import { chromium, webkit } from 'playwright';
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
const shot = (page, name) => page.screenshot({ path: new URL(`../build/tbo-handoff-${name}.png`, import.meta.url).pathname });
const engineLog = (page) => page.evaluate(() => window.engineLog);
const waitLog = (page, re, timeout = 120000) => page.waitForFunction((source) => window.engineLog.some((l) => new RegExp(source).test(l)),
  re.source, { timeout }).then(() => true, () => false);
const command = (page, text) => page.evaluate((text) => { (Module.webCommands = Module.webCommands || []).push(text); }, text);

const server = await serve();
const browser = await { chromium, webkit }[browserName].launch({ headless: true,
  args: browserName === 'chromium' ? ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] : [] });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const results = {};

// New Game, from the menu: Single Player, New Game, the difficulty
const page = await context.newPage();
await page.goto(`${server.url}/tbo/index.html`);
await page.setInputFiles('#game-zip', zips);
await page.waitForSelector('#start:not([hidden])', { timeout: 30 * 60000 });
await page.click('#start');
await page.waitForFunction(() => window.Module && Module.webGameInput !== undefined, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await shot(page, 'menu');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
const newGame = await waitLog(page, /Adding player/);
await page.waitForTimeout(4000);
await shot(page, 'new-game');
const log1 = await engineLog(page);
results[`New Game starts The First Encounter's first level (${log1.filter((l) => /Starting session/.test(l)).join(' / ')})`] =
  newGame && log1.some((l) => /Starting session: 'Levels\\01_Hatshepsut\.wld'/.test(l));
await page.close();

// The First Encounter's end, then The Second Encounter (the files are kept from the first visit)
const end = await context.newPage();
await end.goto(`${server.url}/tbo/index.html?args=${encodeURIComponent('+level Levels/15_TheGreatPyramid.wld')}`);
await end.waitForSelector('#play-own:not([hidden])', { timeout: 20000 });
await end.click('#play-own');
await end.waitForSelector('#start:not([hidden])', { timeout: 120000 });
await end.click('#start');
await waitLog(end, /Adding player/);
await end.waitForTimeout(4000);
// (out of NETRICSA, which the level starts in)
await end.mouse.click(512, 384);
await end.keyboard.press('Escape');
await end.waitForTimeout(2000);
await command(end, 'cht_bGod=1; cht_bGiveAll=1;');
await end.waitForTimeout(3000);
await shot(end, 'last-level');
await command(end, 'dbg_bFirstEncounterEnd=1;');
const ending = await waitLog(end, /dbg_bFirstEncounterEnd: /, 30000);
await end.waitForTimeout(8000);
await shot(end, 'credits');
// Fire skips the rest of the credits
await end.mouse.down();
await end.waitForTimeout(300);
await end.mouse.up();
const followed = await waitLog(end, /The Second Encounter follows/, 300000);
await end.waitForTimeout(20000);
await shot(end, 'second-encounter');
const log2 = await engineLog(end);
for (const l of log2.filter((l) => /dbg_bFirstEncounterEnd|Second Encounter follows|FatalError|Cannot open|Error/.test(l))) console.log(`  ${l}`);
results['the last level\'s ending is found'] = ending && log2.some((l) => /dbg_bFirstEncounterEnd: the ending from/.test(l));
results['after the credits (Fire skips them), The Second Encounter\'s first level follows'] = followed
  && !log2.some((l) => l.includes('FatalError')) && !await end.isVisible('#error');

await browser.close();
await server.close();
let ok = true;
for (const [what, passed] of Object.entries(results)) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= passed;
}
console.log(ok ? 'PASS' : 'FAIL');
console.log('Screenshots: web/build/tbo-handoff-*.png');
process.exit(ok ? 0 : 1);
