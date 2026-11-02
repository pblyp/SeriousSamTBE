// The Both Encounters with the two games' demos (web/build.sh fetches them): "Play the demos"
// downloads The First Encounter's (the site's, shared with its page) and The Second Encounter's,
// both demo levels can be chosen in Custom Level, New Game starts the Karnak demo level, "please giveall" gives the weapons the demos have files
// for, and at Karnak's end (started with dbg_bFirstEncounterEnd) the Palenque demo level follows.
// Screenshots in web/build/tbo-demos-*.png.
//
//   node tbo-demos.mjs [--browser chromium|webkit]

import { chromium, webkit } from 'playwright';
import { serve } from './server.mjs';

const argv = process.argv.slice(2);
const browserIndex = argv.indexOf('--browser');
const browserName = browserIndex >= 0 ? argv.splice(browserIndex, 2)[1] : 'chromium';
const shot = (page, name) => page.screenshot({ path: new URL(`../build/tbo-demos-${name}.png`, import.meta.url).pathname });
const waitLog = (page, re, timeout = 120000) => page.waitForFunction((source) => window.engineLog.some((l) => new RegExp(source).test(l)),
  re.source, { timeout }).then(() => true, () => false);
const command = (page, text) => page.evaluate((text) => { (Module.webCommands = Module.webCommands || []).push(text); }, text);

const server = await serve();
const browser = await { chromium, webkit }[browserName].launch({ headless: true,
  args: browserName === 'chromium' ? ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] : [] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
const results = {};

await page.goto(`${server.url}/index.html`);
results['the page offers the demos'] = await page.isVisible('#play-demo')
  && (await page.textContent('#play-demo')) === 'Play the demos';
await page.click('#play-demo');
await page.waitForSelector('#start:not([hidden]), #error:not([hidden])', { timeout: 15 * 60000 });
const lazy = await page.evaluate(() => ['/tfe/1_00c_demo.gro', '/data/SEDemo1_00.gro']
  .every((p) => Module.FS.stat(p).size === 0 && GameArchives.open(p) >= 0));
results['both demos are downloaded, their group files read from the downloaded pieces'] = lazy;
await page.click('#start');
await page.waitForFunction(() => window.Module && Module.webGameInput !== undefined, null, { timeout: 120000 });
results['the game knows it has the demos'] = await waitLog(page, /Demo data detected/, 5000);
await page.waitForTimeout(2000);
await shot(page, 'menu');

// the levels to choose from: Single Player, Custom Level
// (the pointer over Single Player: WebKit tells the game where it is, over the item under the
// Start button otherwise, which Enter would choose)
await page.mouse.move(512, 175);
await page.waitForTimeout(500);
for (const key of ['Enter', 'ArrowDown', 'Enter']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(1500);
}
await shot(page, 'levels');
// (all single player levels are listed, also those not played yet: both demos')
const singlePlayer = (await page.evaluate(() => window.engineLog))
  .map((l) => /file '(.*)' : '.*' spawn=0x([0-9a-f]+)/.exec(l)).filter((m) => m && (parseInt(m[2], 16) & 0x10000))
  .map((m) => m[1]);
results[`both demos' levels can be chosen (${singlePlayer.join(', ')})`] = ['KarnakDemo.wld', 'Palenque_Demo.wld']
  .every((name) => singlePlayer.some((level) => level.endsWith(name)));

// New Game: back to Single Player (New Game chosen again), New Game, the difficulty
for (const key of ['Escape', 'Enter', 'Enter']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(1500);
}
results['New Game starts the Karnak demo'] = await waitLog(page, /Starting session: 'Levels\\KarnakDemo\.wld'/)
  && await waitLog(page, /Adding player/);
await page.waitForTimeout(4000);
// (out of NETRICSA, which the level starts in)
await page.mouse.click(512, 384);
await page.keyboard.press('Escape');
await page.waitForTimeout(2000);
await command(page, 'cht_bGod=1; cht_bGiveAll=1;');
await page.waitForTimeout(3000);
for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(800);
}
await shot(page, 'karnak');
results['"please giveall" gives the weapons the demos have'] = !(await page.evaluate(() => window.engineLog))
  .some((l) => l.includes('FatalError')) && !await page.isVisible('#error');

// Karnak's end, then Palenque
await command(page, 'dbg_bFirstEncounterEnd=1;');
const ending = await waitLog(page, /dbg_bFirstEncounterEnd: /, 30000);
await page.waitForTimeout(6000);
await shot(page, 'credits');
await page.mouse.down();
await page.waitForTimeout(300);
await page.mouse.up();
const followed = await waitLog(page, /The Second Encounter follows/, 300000);
await page.waitForTimeout(15000);
await page.mouse.click(512, 384);
await page.keyboard.press('Escape');
await page.waitForTimeout(2000);
await shot(page, 'palenque');
const log = await page.evaluate(() => window.engineLog);
for (const l of log.filter((l) => /dbg_bFirstEncounterEnd|Second Encounter follows|FatalError|Cannot open/.test(l)).slice(-10)) console.log(`  ${l}`);
results['at Karnak\'s end the Palenque demo follows'] = ending && followed
  && !log.some((l) => l.includes('FatalError')) && !await page.isVisible('#error');
// (the music, mp3 files in the group files, is copied out of them to play)
results['the music plays from the group files'] = !log.some((l) => /Cannot open (mpx|encoded audio) /.test(l));

await browser.close();
await server.close();
let ok = true;
for (const [what, passed] of Object.entries(results)) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= passed;
}
for (const e of errors) console.log(`page error: ${e}`);
ok &&= errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
