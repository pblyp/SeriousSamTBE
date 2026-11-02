// Checks how the demos are downloaded (shell/demo-download.js), The First Encounter's then The
// Second Encounter's:
//  1. from the site, then from IndexedDB on the next visit (nothing downloaded)
//  2. a download that stopped (a file cut short) goes on from where it was on the next visit,
//     and the file is whole
//  3. from a mirror (another site with a copy of demo/, ?mirror=), not from the site
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

// the demos, as config.js has them
const demos = [['tfe', 'sam-demo-'], ['tse', 'tbo-demo-']].map(([folder, prefix]) => ({ folder, prefix,
  ...JSON.parse(fs.readFileSync(path.join(DIST, 'demo', folder, 'demo-files.json'))) }));
const DEMO_BYTES = demos.reduce((sum, demo) => sum + demo.files.reduce((n, file) => n + file.size, 0), 0);
// the biggest file (The Second Encounter's): the one cut short; the files after it aren't
// downloaded then
const cut = demos[1];
const biggest = cut.files.reduce((a, b) => (b.size > a.size ? b : a));
const fromBiggestOn = cut.files.slice(cut.files.indexOf(biggest)).reduce((sum, file) => sum + file.size, 0);
const CUT_AT = 5 << 20;
// a checksum of the bytes (FNV-1a), the same in the page
function checksum(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193) >>> 0;
  return h;
}
const biggestSum = checksum(fs.readFileSync(path.join(DIST, 'demo', cut.folder, biggest.path)));

async function openPage(query, { context = null, cutShort = false, origin = server.url } = {}) {
  // (no service worker: requests through it would get past the routes below)
  context = context || await browser.newContext({ viewport: { width: 640, height: 400 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.demoRequests = [];
  page.on('request', (r) => {
    const { pathname } = new URL(r.url());
    // (the demos' files, not their lists)
    if (pathname.startsWith('/demo/') && !pathname.endsWith('/demo-files.json')) {
      page.demoRequests.push({ url: r.url(), range: r.headers().range || '' });
    }
  });
  // the biggest file cut short
  if (cutShort) {
    const bytes = fs.readFileSync(path.join(DIST, 'demo', cut.folder, biggest.path)).subarray(0, CUT_AT);
    await page.route((url) => url.pathname === `/demo/${cut.folder}/${biggest.path}`, (route) => route.fulfill({ status: 200, body: bytes }));
  }
  // a stand-in for the engine, which only takes the files
  await page.route(/serioussamtbo\.js$/, (route) => route.fulfill({ contentType: 'text/javascript', body: `
    Module.FS = { mkdirTree() {}, writeFile() {} };
    Module.callMain = () => {};
    Module.ExitStatus = class {};
    Module.onRuntimeInitialized();` }));
  await page.goto(`${origin}/index.html?autostart=1&${query}`);
  return page;
}

const engineLog = (page) => page.evaluate(() => window.engineLog);
const waitForLog = (page, text, timeout = 180000) =>
  page.waitForFunction((t) => window.engineLog.some((l) => l.includes(t)), text, { timeout });
// both demos are there, and their group files are read from their pieces
const ready = (page) => waitForLog(page, 'Copied ').then(() => page.evaluate(() =>
  ['/tfe/1_00c_demo.gro', '/data/SEDemo1_00.gro'].every((p) => GameArchives.open(p) >= 0)));
// "Demo data ready (X MB downloaded, Y MB of it from mirrors, Z MB from the site)", for both
// demos -> [X, Z, Y]
async function downloaded(page) {
  const sums = [0, 0, 0];
  const lines = (await engineLog(page)).filter((l) => l.startsWith('Demo data ready'));
  for (const line of lines) {
    const m = /\((\d+\.\d) MB downloaded, (\d+\.\d) MB of it from mirrors, (\d+\.\d) MB from the site\)/.exec(line);
    if (m) [Number(m[1]), Number(m[3]), Number(m[2])].forEach((n, i) => { sums[i] += n; });
  }
  return lines.length === 2 ? sums.map((n) => Number(n.toFixed(1))) : null;
}
const mb = (bytes) => Number((bytes / 1048576).toFixed(1));
// (all of both demos, rounded as the page logs each one)
const isWholeDemo = (n) => Math.abs(n - mb(DEMO_BYTES)) <= 0.1;
const show = (d) => (d ? `${d[0]} MB, ${d[1]} MB from the site, ${d[2]} MB from mirrors` : 'not ready');

// 1. from the site, then from IndexedDB
{
  const page = await openPage('');
  const first = await ready(page);
  const firstDownload = await downloaded(page);
  const firstRequests = page.demoRequests.length;
  page.demoRequests = [];
  await page.reload();
  const second = await ready(page);
  const secondDownload = await downloaded(page);
  results[`first visit downloads both from the site (${show(firstDownload)})`] = first && firstDownload
    && isWholeDemo(firstDownload[0]) && firstDownload[1] === firstDownload[0] && firstRequests > 0;
  results[`next visit downloads nothing (${show(secondDownload)}, ${page.demoRequests.length} requests)`] = second
    && secondDownload && secondDownload[0] === 0 && page.demoRequests.length === 0;
  await page.context().close();
}

// 2. cut short, then on from where it was
{
  const first = await openPage('', { cutShort: true });
  await first.waitForSelector('#error:not([hidden])', { timeout: 180000 }).catch(() => {});
  const failed = await first.isVisible('#error');
  const context = first.context();
  await first.close();
  const page = await openPage('', { context });
  const whole = await ready(page);
  const download = await downloaded(page);
  const resumed = page.demoRequests.find((r) => r.url.endsWith(`/demo/${cut.folder}/${biggest.path}`));
  // (the file as it is kept)
  const sum = await page.evaluate(async ({ db: name, path, check }) => {
    const db = await new Promise((resolve) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); });
    const pieces = await new Promise((resolve) => {
      const r = db.transaction('chunks').objectStore('chunks').getAll(IDBKeyRange.bound([path, 0], [path, Infinity]));
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    const data = new Uint8Array(pieces.reduce((n, p) => n + p.byteLength, 0));
    let at = 0;
    for (const piece of pieces) { data.set(new Uint8Array(piece), at); at += piece.byteLength; }
    return (0, eval)(`(${check})`)(data);
  }, { db: cut.prefix + cut.version, path: biggest.path, check: checksum.toString() });
  results[`a download that stopped goes on (${show(download)}; ${biggest.path} asked for ${resumed ? resumed.range || 'all' : 'nothing'})`] =
    failed && whole && resumed && resumed.range === `bytes=${CUT_AT}-` && download && download[0] === mb(fromBiggestOn - CUT_AT)
    && sum === biggestSum;
  await context.close();
}

// 3. from a mirror (a copy of the site's demo/)
{
  const siteBefore = server.served.demo;
  const page = await openPage(`mirror=${encodeURIComponent(`${mirror.url}/demo/`)}`);
  const whole = await ready(page);
  const download = await downloaded(page);
  results[`from a mirror, not the site (${show(download)}, site sent ${server.served.demo - siteBefore} bytes)`] = whole && download
    && isWholeDemo(download[0]) && download[2] === download[0] && download[1] === 0 && server.served.demo === siteBefore;
  await page.context().close();
}

// 4. a mirror without the files: the site
{
  const page = await openPage(`mirror=${encodeURIComponent(`${brokenMirror.url}/demo/`)}`);
  const whole = await ready(page);
  const download = await downloaded(page);
  const asked = (await engineLog(page)).find((l) => l.startsWith('Demo download:')) || '';
  results[`a broken mirror: from the site (${asked}; ${show(download)})`] = whole && brokenMirror.served.notFound > 0
    && download && isWholeDemo(download[0]) && download[1] === download[0];
  await page.context().close();
}

// 5. from an address on the local network
{
  const page = await openPage('', { origin: server.url.replace('127.0.0.1', 'sam.test') });
  const whole = await ready(page);
  const download = await downloaded(page);
  const insecure = await page.evaluate(() => !isSecureContext);
  results[`plain http (${show(download)})`] = whole && insecure && download && isWholeDemo(download[0]);
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
