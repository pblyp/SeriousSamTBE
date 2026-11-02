// Checks how the demo is downloaded (shell/demo-download.js):
//  1. from the site, then from IndexedDB on the next visit (nothing downloaded)
//  2. a download that stopped (a file cut short) goes on from where it was on the next visit,
//     and the file is whole
//  3. from a mirror (another site with the demo files, ?mirror=), not from the site
//  4. from the site, when the mirror doesn't have the files
//  5. from an http address that isn't localhost (like a computer on the local network)
//
//   node demo-download.mjs

import { chromium } from 'playwright';
import { serve } from './server.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIST = new URL('../build/dist/', import.meta.url).pathname;
const server = await serve();
// mirrors: another origin with the files, and one without them
const mirror = await serve(0, undefined, '127.0.0.1', { cors: true });
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-mirror-'));
const brokenMirror = await serve(0, emptyDir, '127.0.0.1', { cors: true });

// (sam.test: an address that isn't localhost, so not a secure context)
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--host-resolver-rules=MAP sam.test 127.0.0.1'] });
const results = {};
const errors = [];

const list = JSON.parse(fs.readFileSync(path.join(DIST, 'demo-files.json')));
const DEMO_BYTES = list.files.reduce((sum, file) => sum + file.size, 0);
// (the biggest file: the one cut short; the files after it aren't downloaded then)
const biggest = list.files.reduce((a, b) => (b.size > a.size ? b : a));
const fromBiggestOn = list.files.slice(list.files.indexOf(biggest)).reduce((sum, file) => sum + file.size, 0);
// a checksum of the bytes (FNV-1a), the same in the page's stand-in engine
function checksum(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193) >>> 0;
  return h;
}
const biggestSum = checksum(fs.readFileSync(path.join(DIST, 'demo', biggest.path)));

async function openPage(query, { context = null, cutShort = false, origin = server.url } = {}) {
  // (no service worker: requests through it would get past the routes below)
  context = context || await browser.newContext({ viewport: { width: 640, height: 400 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.demoRequests = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/demo/')) page.demoRequests.push({ url: r.url(), range: r.headers().range || '' });
  });
  // the biggest file cut short after 5 MB
  if (cutShort) {
    const bytes = fs.readFileSync(path.join(DIST, 'demo', biggest.path)).subarray(0, 5 << 20);
    await page.route((url) => url.pathname === `/demo/${biggest.path}`, (route) => route.fulfill({ status: 200, body: bytes }));
  }
  // a stand-in for the engine, which only takes the files
  await page.route(/serioussam\.js$/, (route) => route.fulfill({ contentType: 'text/javascript', body: `
    window.written = 0;
    window.sums = {};
    const checksum = ${checksum.toString()};
    Module.FS = { mkdirTree() {}, writeFile(path, data) { written += data.length; sums[path] = checksum(data); } };
    Module.callMain = () => {};
    Module.ExitStatus = class {};
    Module.onRuntimeInitialized();` }));
  await page.goto(`${origin}/index.html?autostart=1&${query}`);
  return page;
}

const engineLog = (page) => page.evaluate(() => window.engineLog);
const waitForLog = (page, text, timeout = 120000) =>
  page.waitForFunction((t) => window.engineLog.some((l) => l.includes(t)), text, { timeout });
const written = (page) => page.waitForFunction(() => window.engineLog.some((l) => l.startsWith('Copied ')), null, { timeout: 120000 })
  .then(() => page.evaluate(() => window.written));
// "Demo data ready (X MB downloaded, Y MB of it from mirrors, Z MB from the site)" -> [X, Z, Y] (or null)
function downloaded(line) {
  const m = /\((\d+\.\d) MB downloaded, (\d+\.\d) MB of it from mirrors, (\d+\.\d) MB from the site\)/.exec(line);
  return m ? [Number(m[1]), Number(m[3]), Number(m[2])] : null;
}
const mb = (bytes) => Number((bytes / 1048576).toFixed(1));
// (all of the demo: at least its size, rounded as the page logs it)
const isWholeDemo = (n) => n >= mb(DEMO_BYTES);
const readyLine = async (page) => (await engineLog(page)).find((l) => l.startsWith('Demo data ready')) || '';

// 1. from the site, then from IndexedDB
{
  const page = await openPage('');
  await waitForLog(page, 'Demo data ready');
  const first = await readyLine(page);
  const firstRequests = page.demoRequests.length;
  const bytes = await written(page);
  page.demoRequests = [];
  await page.reload();
  await waitForLog(page, 'Demo data ready');
  const second = await readyLine(page);
  const [firstTotal, firstFromSite] = downloaded(first) || [];
  results[`first visit downloads from the site (${first})`] = isWholeDemo(firstTotal) && firstFromSite === firstTotal
    && firstRequests > 0 && bytes === DEMO_BYTES;
  results[`next visit downloads nothing (${second}, ${page.demoRequests.length} requests)`] = second.includes('(0.0 MB downloaded')
    && page.demoRequests.length === 0 && await written(page) === DEMO_BYTES;
  await page.context().close();
}

// 2. cut short, then on from where it was
{
  const first = await openPage('', { cutShort: true });
  await first.waitForSelector('#error:not([hidden])', { timeout: 120000 }).catch(() => {});
  const failed = await first.isVisible('#error');
  const context = first.context();
  await first.close();
  const page = await openPage('', { context });
  await waitForLog(page, 'Demo data ready');
  const line = await readyLine(page);
  const [total] = downloaded(line) || [];
  const resumed = page.demoRequests.find((r) => r.url.endsWith(`/demo/${biggest.path}`));
  const bytes = await written(page);
  const sum = await page.evaluate((p) => window.sums[`/data/${p}`], biggest.path);
  results[`a download that stopped goes on (${line}; ${biggest.path} asked for ${resumed ? resumed.range || 'all' : 'nothing'})`] =
    failed && resumed && resumed.range === `bytes=${5 << 20}-` && total === mb(fromBiggestOn - (5 << 20))
    && bytes === DEMO_BYTES && sum === biggestSum;
  await context.close();
}

// 3. from a mirror
{
  const siteBefore = server.served.demo;
  const page = await openPage(`mirror=${encodeURIComponent(mirror.url)}`);
  await waitForLog(page, 'Demo data ready');
  const line = await readyLine(page);
  const [total, fromSite, fromMirrors] = downloaded(line) || [];
  results[`from a mirror, not the site (${line}, site sent ${server.served.demo - siteBefore} bytes)`] = isWholeDemo(total)
    && fromMirrors === total && fromSite === 0 && server.served.demo === siteBefore && await written(page) === DEMO_BYTES;
  await page.context().close();
}

// 4. a mirror without the files: the site
{
  const page = await openPage(`mirror=${encodeURIComponent(brokenMirror.url)}`);
  await waitForLog(page, 'Demo data ready');
  const line = await readyLine(page);
  const log = await engineLog(page);
  const asked = log.find((l) => l.startsWith('Demo download:')) || '';
  const [total, fromSite] = downloaded(line) || [];
  results[`a broken mirror: from the site (${asked}; ${line})`] = brokenMirror.served.notFound > 0
    && isWholeDemo(total) && fromSite === total && await written(page) === DEMO_BYTES;
  await page.context().close();
}

// 5. from an address on the local network
{
  const page = await openPage('', { origin: server.url.replace('127.0.0.1', 'sam.test') });
  const bytes = await written(page);
  const line = await readyLine(page);
  const insecure = await page.evaluate(() => !isSecureContext);
  results[`plain http (${line})`] = insecure && isWholeDemo((downloaded(line) || [])[0]) && bytes === DEMO_BYTES;
  await page.context().close();
}

await browser.close();
server.close();
mirror.close();
brokenMirror.close();
fs.rmSync(emptyDir, { recursive: true, force: true });

results['no page errors'] = errors.length === 0;
let failed = false;
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  failed ||= !ok;
}
for (const e of errors) console.log(e);
process.exit(failed ? 1 : 0);
