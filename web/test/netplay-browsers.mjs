// Network games between different browsers (Safari's WebKit, Firefox, Chromium), through
// the page server's hub: one hosts Karnak, the other joins with the room code, and they keep
// playing.
//
//   node netplay-browsers.mjs [host:client ...]   (default: a mix of all three)

import { chromium, firefox, webkit } from 'playwright';
import { serve } from './server.mjs';

const BROWSERS = { chromium, firefox, webkit };
const pairArgs = process.argv.slice(2).filter((a) => a.includes(':'));
const pairs = pairArgs.length
  ? pairArgs.map((p) => p.split(':'))
  : [['webkit', 'firefox'], ['firefox', 'webkit'], ['chromium', 'firefox'], ['webkit', 'webkit']];

const server = await serve();

const results = {};
const errors = [];
const browsers = [];

async function openPlayer(name, type, extra) {
  const options = type === 'chromium' ? { args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] } : {};
  const browser = await BROWSERS[type].launch(options);
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.stack || e.message}`));
  await page.goto(`${server.url}/index.html?autostart=1&${extra}`);
  return page;
}

for (const [hostType, clientType] of pairs) {
  const label = `${hostType} hosts, ${clientType} joins`;
  const host = await openPlayer(`${label}: host`, hostType, `args=${encodeURIComponent('+level Levels/KarnakDemo.wld +server')}`);
  await host.waitForFunction(() => Module.netplay && Module.netplay.code && Module.webGameInput, null, { timeout: 180000 });
  const code = await host.evaluate(() => Module.netplay.code);
  const client = await openPlayer(`${label}: client`, clientType, `join=${code}&quickjoin`);
  await client.waitForFunction(() => Module.netplay && ['joined', 'failed'].includes(Module.netplay.state), null, { timeout: 180000 })
    .catch(() => {});
  const [state, error] = await client.evaluate(() => [Module.netplay.state, Module.netplay.error]);
  if (state === 'joined') {
    await client.waitForTimeout(20000);
  }
  const hostBadge = await host.textContent('#net-badge-text');
  results[`${label}: joined, still connected after 20 s (${state === 'joined' ? hostBadge : error})`] =
    state === 'joined' && hostBadge.endsWith('1 player joined')
    && await client.evaluate(() => Module.netplay.state === 'joined');
  for (const browser of browsers.splice(0)) await browser.close();
}

server.close();

results['no page errors'] = errors.length === 0;
let failed = false;
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  failed ||= !ok;
}
for (const e of errors) console.log(e);
process.exit(failed ? 1 : 0);
