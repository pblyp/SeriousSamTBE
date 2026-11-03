// The Both Encounters with real installations (not part of npm test): New Game starts The
// First Encounter's first level; The First Encounter's ending (its last level's outro, started
// with dbg_bFirstEncounterEnd=2 as the boss's death starts it, as playing there takes too long)
// can be skipped with Fire, and when it isn't, it hands over right after its credits; either
// way The Second Encounter's recap ("In the last episode") follows and plays (also with Fire
// still pressed from the ending), with the starting weapons only. In a cooperative game (hosted
// through the test server's hub), The Second Encounter's first level follows instead: the recap
// is a single player's cinematic. (There the ending is started from its end of the game, with
// dbg_bFirstEncounterEnd=1: the outro's beam sequence is for single player only.) Screenshots in
// web/build/tbe-handoff-*.png.
//
//   TBE_TSE_ZIP=<.zip of The Second Encounter's folder> TBE_TFE_ZIP=<.zip of The First
//   Encounter's folder> node tbe-handoff.mjs [--browser chromium|webkit] [--only skipped|played|cooperative]

import { chromium, webkit } from 'playwright';
import { serve } from './server.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const browserIndex = argv.indexOf('--browser');
const browserName = browserIndex >= 0 ? argv.splice(browserIndex, 2)[1] : 'chromium';
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex >= 0 ? argv.splice(onlyIndex, 2)[1] : null;
const zips = process.env.TBE_ZIP ? [process.env.TBE_ZIP] : [process.env.TBE_TSE_ZIP, process.env.TBE_TFE_ZIP];
if (zips.some((z) => !z || !fs.existsSync(z))) {
  console.log('Give the installations\' .zip files: TBE_TSE_ZIP and TBE_TFE_ZIP (or TBE_ZIP with both folders).');
  process.exit(2);
}
const shot = (page, name) => page.screenshot({ path: new URL(`../build/tbe-handoff-${name}.png`, import.meta.url).pathname });
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
await page.goto(`${server.url}/index.html`);
await page.setInputFiles('#game-zip', zips);
await page.waitForSelector('#start:not([hidden])', { timeout: 30 * 60000 });
await page.click('#start');
await page.waitForFunction(() => window.Module && Module.webGameInput !== undefined, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await shot(page, 'menu');
// (the pointer over Single Player: WebKit tells the game where it is, over the item under the
// Start button otherwise, which Enter would choose)
await page.mouse.move(512, 175);
await page.waitForTimeout(500);
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

// how much of the screen is black at the top and bottom (a cutscene's bars) and in the middle
async function letterbox(page) {
  const data = (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
  return page.evaluate(async (jpeg) => {
    const image = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const brightness = (y0, y1) => {
      const d = context.getImageData(0, y0, image.width, y1 - y0).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += d[k] + d[k + 1] + d[k + 2];
      return sum / (d.length / 4) / 3;
    };
    const h = image.height;
    return { top: brightness(0, Math.round(h * 0.08)), middle: brightness(Math.round(h * 0.35), Math.round(h * 0.65)),
      bottom: brightness(Math.round(h * 0.92), h) };
  }, data);
}

// The First Encounter's last level, its outro (with all weapons, in single player), and what
// follows; press: Fire a few times some seconds into the outro, and on until the hand-off has
// started; coop: as the host of a cooperative network game
async function ending(label, press, coop = false) {
  const page = await context.newPage();
  await page.goto(`${server.url}/index.html?args=${encodeURIComponent(`${coop ? '+server ' : ''}+level Levels/15_TheGreatPyramid.wld`)}`);
  await page.waitForSelector('#play-own:not([hidden])', { timeout: 20000 });
  await page.click('#play-own');
  await page.waitForSelector('#start:not([hidden])', { timeout: 120000 });
  await page.click('#start');
  await waitLog(page, /Adding player/);
  await page.waitForTimeout(4000);
  if (!coop) {
    // (out of NETRICSA, which the level starts in, in single player)
    await page.mouse.click(512, 384);
    await page.keyboard.press('Escape');
  } else {
    await page.mouse.move(512, 384);
  }
  await page.waitForTimeout(2000);
  await command(page, 'cht_bGod=1; cht_bGiveAll=1;');
  await page.waitForTimeout(3000);
  await command(page, `dbg_bFirstEncounterEnd=${coop ? 1 : 2};`);
  const outro = coop ? await waitLog(page, /The First Encounter's end: /, 30000)
    : await waitLog(page, /dbg_bFirstEncounterEnd: Trigger: Beam sequence/, 30000);
  const started = Date.now();
  await page.waitForTimeout(coop ? 4000 : 12000);
  await shot(page, `${label}-outro`);
  let followed;
  if (press) {
    const pressed = Date.now();
    for (let i = 0; i < 4; i++) {
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
    followed = await waitLog(page, /The Second Encounter follows/, 20000);
    // (and once more while the next level loads)
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    results[`${label}: Fire skips the ${coop ? 'credits' : 'outro and the credits'} (TSE follows ${((Date.now() - pressed) / 1000).toFixed(0)} s after the press)`] =
      outro && followed && Date.now() - pressed < 20000
      // (from the end of the game, Fire skips the credits there)
      && (coop || (await engineLog(page)).some((l) => l.includes("The First Encounter's end: skipped")));
  } else {
    followed = await waitLog(page, /The Second Encounter follows/, 8 * 60000);
    const log = await engineLog(page);
    const atEnd = log.findIndex((l) => l.startsWith("The First Encounter's end: "));
    results[`${label}: the whole ending plays, then TSE follows right away (${log[atEnd]}; ${((Date.now() - started) / 1000).toFixed(0)} s)`] =
      outro && followed && atEnd >= 0 && log[atEnd + 1].startsWith("The First Encounter's end: The Second Encounter follows");
  }
  await waitLog(page, /The Second Encounter: weapons /, 60000);
  await page.waitForTimeout(30000);
  const view = await letterbox(page);
  await shot(page, `${label}-${coop ? 'tse' : 'recap'}`);
  const log = await engineLog(page);
  const after = log.slice(log.findIndex((l) => /The Second Encounter follows/.test(l)));
  for (const l of after.filter((l) => /Second Encounter|Loading|world|FatalError|Error/i.test(l)).slice(0, 12)) console.log(`  ${l}`);
  const weapons = (log.find((l) => l.startsWith('The Second Encounter: weapons ')) || '').slice(-8);
  results[`${label}: TSE starts with the starting weapons only (${weapons || 'none'})`] = weapons === '00000003';
  const next = (after[0] || '').replace(/^.*follows /, '');
  if (coop) {
    results[`${label}: TSE's first level follows, without the recap (${next})`] =
      // (the weapons line is from the next level's start)
      next === '(Levels/LevelsMP/1_1_Palenque.wld)' && after.some((l) => l.startsWith('The Second Encounter: weapons '))
      && !after.some((l) => /InTheLastEpisode/.test(l))
      && !log.some((l) => l.includes('FatalError')) && !await page.isVisible('#error');
  } else {
    results[`${label}: the recap plays (30 s in: bars ${view.top.toFixed(0)}/${view.bottom.toFixed(0)}, picture ${view.middle.toFixed(0)})`] =
      next === '(Levels/LevelsMP/1_0_InTheLastEpisode.wld)'
      && view.top < 3 && view.bottom < 3 && view.middle > 8 && !after.some((l) => /1_1_Palenque/.test(l))
      && !log.some((l) => l.includes('FatalError')) && !await page.isVisible('#error');
  }
  await page.close();
}

for (const [label, press, coop] of [['skipped', true], ['played', false], ['cooperative', true, true]]) {
  if (!only || only === label) await ending(label, press, coop);
}

await browser.close();
await server.close();
let ok = true;
for (const [what, passed] of Object.entries(results)) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= passed;
}
console.log(ok ? 'PASS' : 'FAIL');
console.log('Screenshots: web/build/tbe-handoff-*.png');
process.exit(ok ? 0 : 1);
