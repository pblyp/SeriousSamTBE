// Checks how the demos are downloaded (shell/demo-download.js), The First Encounter's then The
// Second Encounter's:
//  1. from the site, then from IndexedDB on the next visit (nothing downloaded)
//  2. a download that stopped (an xz segment cut short) goes on from that segment on the next
//     visit, and the file is whole
//  3. from a mirror (another site with a copy of demo/, ?mirror=), not from the site
//  4. from the site, when the mirror doesn't have the files
//  5. from an http address that isn't localhost (like a computer on the local network)
//  6. a mirror whose connection stalls (sends a little, then nothing): given up, from the site
// what the loading view's details say as it downloads (how much, and what happened when a request
// failed), and that the kept demos can be exported as a .zip ("Export the demos…"), all of their files as
// the site has them, but not before they are all downloaded
//
//   node demo-download.mjs

import { chromium } from 'playwright';
import { serve } from './server.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const DIST = new URL('../build/dist/', import.meta.url).pathname;
const server = await serve();
// mirrors: another origin with the files, and one without them
const mirror = await serve(0, undefined, '127.0.0.1', { cors: true });
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-mirror-'));
const brokenMirror = await serve(0, emptyDir, '127.0.0.1', { cors: true });
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-export-'));

// (sam.test: an address that isn't localhost, so not a secure context)
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--host-resolver-rules=MAP sam.test 127.0.0.1'] });
const results = {};
const errors = [];

// the demos, as config.js has them
const demos = [['tfe', 'tbe-demo-tfe-'], ['tse', 'tbe-demo-tse-']].map(([folder, prefix]) => ({ folder, prefix,
  ...JSON.parse(fs.readFileSync(path.join(DIST, 'demo', folder, 'demo-files.json'))) }));
// (what a file's download is: its xz segments, or the file)
const downloadSize = (file) => (file.xz ? file.xz.reduce((a, b) => a + b, 0) : file.size);
const DEMO_BYTES = demos.reduce((sum, demo) => sum + demo.files.reduce((n, file) => n + downloadSize(file), 0), 0);
// the biggest file (The Second Encounter's): its second xz segment is cut short; that segment and
// the files after it aren't downloaded then
const cut = demos[1];
const biggest = cut.files.reduce((a, b) => (b.size > a.size ? b : a));
const SECOND = [biggest.xz[0], biggest.xz[0] + biggest.xz[1] - 1];
const fromSecondOn = biggest.xz.slice(1).reduce((a, b) => a + b, 0)
  + cut.files.slice(cut.files.indexOf(biggest) + 1).reduce((sum, file) => sum + downloadSize(file), 0);
// a checksum of the bytes (FNV-1a), the same in the page
function checksum(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193) >>> 0;
  return h;
}
// (the file unpacked, as the page keeps it)
const unpacked = (file) => execFileSync('python3', ['-I', '-c', 'import lzma, sys; sys.stdout.buffer.write(lzma.decompress(open(sys.argv[1], "rb").read()))',
  file], { maxBuffer: 1 << 30 });
const biggestSum = checksum(unpacked(path.join(DIST, 'demo', cut.folder, `${biggest.path}.xz`)));

async function openPage(query, { context = null, cutShort = false, origin = server.url } = {}) {
  // (no service worker: requests through it would get past the routes below)
  context = context || await browser.newContext({ viewport: { width: 640, height: 400 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  // (the loading view's details, as they change)
  await page.addInitScript(() => {
    window.detailsSeen = [];
    document.addEventListener('DOMContentLoaded', () => {
      const detail = document.getElementById('status-detail');
      new MutationObserver(() => window.detailsSeen.push(detail.textContent))
        .observe(detail, { subtree: true, childList: true, characterData: true });
    });
  });
  page.demoRequests = [];
  page.on('request', (r) => {
    const { pathname } = new URL(r.url());
    // (the demos' files, not their lists)
    if (pathname.startsWith('/demo/') && !pathname.endsWith('/demo-files.json')) {
      page.demoRequests.push({ url: r.url(), range: r.headers().range || '' });
    }
  });
  // the biggest file's second segment cut short (the first one whole)
  if (cutShort) {
    const xz = fs.readFileSync(path.join(DIST, 'demo', cut.folder, `${biggest.path}.xz`));
    await page.route((url) => url.pathname === `/demo/${cut.folder}/${biggest.path}.xz`, (route) => {
      if (route.request().headers().range !== `bytes=${SECOND[0]}-${SECOND[1]}`) return route.continue();
      return route.fulfill({ status: 206, headers: { 'Content-Range': `bytes ${SECOND[0]}-${SECOND[1]}/${xz.length}` },
        body: xz.subarray(SECOND[0], SECOND[0] + ((SECOND[1] - SECOND[0]) >> 1)) });
    });
  }
  // a stand-in for the engine, which only takes the files
  await page.route(/serioussamtbe\.js$/, (route) => route.fulfill({ contentType: 'text/javascript', body: `
    Module.FS = { mkdirTree() {}, writeFile() {} };
    Module.callMain = () => {};
    Module.ExitStatus = class {};
    Module.onRuntimeInitialized();` }));
  await page.goto(`${origin}/index.html?autostart=1&${query}`);
  return page;
}

// "Export the demos…" on the start page of a context with the demos kept (downloaded, as a browser
// does that can't write a file as it goes): the .zip's file, or the page's status if there isn't one
async function exportDemos(context, file) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto(`${server.url}/index.html`);
  await page.waitForSelector('#export-demos:not([hidden])', { timeout: 10000 }).catch(() => {});
  if (!await page.isVisible('#export-demos')) {
    await page.close();
    return { status: 'not offered' };
  }
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const download = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await page.click('#export-demos');
  await page.waitForFunction(() => /^(Exported|Exporting .* failed|The demos aren't)/
    .test(document.getElementById('purge-status').textContent), null, { timeout: 120000 }).catch(() => {});
  const status = await page.textContent('#purge-status');
  if (status.startsWith('Exported')) await (await download).saveAs(file);
  await page.close();
  return { status, file: status.startsWith('Exported') ? file : null };
}

// the exported .zip: whole (its CRCs), with each demo's files in a folder of its name, exactly as
// the site has them (unpacked): what is wrong, or ''
function checkDemoExport(file) {
  try {
    execFileSync('unzip', ['-tq', file], { stdio: 'pipe' });
  } catch (e) {
    return `unzip -t: ${String(e.stdout || e.message).trim().split('\n').pop()}`;
  }
  const dir = path.join(exportDir, 'unpacked');
  fs.rmSync(dir, { recursive: true, force: true });
  execFileSync('unzip', ['-q', file, '-d', dir]);
  const names = { tfe: 'The First Encounter\'s demo', tse: 'The Second Encounter\'s demo' };
  let count = 0;
  for (const demo of demos) {
    for (const { path: p, xz } of demo.files) {
      const exported = path.join(dir, names[demo.folder], p);
      const served = path.join(DIST, 'demo', demo.folder, p);
      if (!fs.existsSync(exported) || !fs.readFileSync(exported).equals(xz ? unpacked(`${served}.xz`) : fs.readFileSync(served))) {
        return `${names[demo.folder]}/${p} differs`;
      }
      count++;
    }
  }
  const all = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  return all.length === count ? '' : `${all.length} files in it, ${count} expected`;
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
  const details = await page.evaluate(() => window.detailsSeen);
  const howMuch = details.find((d) => / of [\d.]+ MB/.test(d));
  results[`the loading view says how much is downloaded (${howMuch || details.slice(-3).join(' | ') || 'nothing'})`] = !!howMuch;
  const firstRequests = page.demoRequests.length;
  page.demoRequests = [];
  await page.reload();
  const second = await ready(page);
  const secondDownload = await downloaded(page);
  results[`first visit downloads both from the site (${show(firstDownload)})`] = first && firstDownload
    && isWholeDemo(firstDownload[0]) && firstDownload[1] === firstDownload[0] && firstRequests > 0;
  results[`next visit downloads nothing (${show(secondDownload)}, ${page.demoRequests.length} requests)`] = second
    && secondDownload && secondDownload[0] === 0 && page.demoRequests.length === 0;
  const { status, file } = await exportDemos(page.context(), path.join(exportDir, 'tbe-demos.zip'));
  const wrong = file ? checkDemoExport(file) : 'no .zip';
  results[`the demos can be exported, all of their files exactly (${status}${wrong ? `; ${wrong}` : ''})`] = !wrong;
  await page.context().close();
}

// 2. cut short, then on from where it was
{
  const first = await openPage('', { cutShort: true });
  await first.waitForSelector('#error:not([hidden])', { timeout: 180000 }).catch(() => {});
  const failed = await first.isVisible('#error');
  const context = first.context();
  await first.close();
  const { status } = await exportDemos(context, path.join(exportDir, 'cut-short.zip'));
  results[`the demos can't be exported before they are all downloaded (${status})`] = /aren't downloaded yet/.test(status);
  const page = await openPage('', { context });
  const whole = await ready(page);
  const download = await downloaded(page);
  const resumed = page.demoRequests.find((r) => r.url.endsWith(`/demo/${cut.folder}/${biggest.path}.xz`));
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
    failed && whole && resumed && resumed.range === `bytes=${SECOND[0]}-${SECOND[1]}` && download && download[0] === mb(fromSecondOn)
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

// 6. a mirror that stalls: it sends the start of what is asked for, then nothing (as a connection
// that stalled); the page gives it up after ?stallms and downloads from the site
{
  const sockets = new Set();
  const stalling = http.createServer((req, res) => {
    const file = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length' };
    if (req.method === 'OPTIONS') return res.writeHead(204, headers).end();
    if (!fs.existsSync(file)) return res.writeHead(404, headers).end();
    const data = fs.readFileSync(file);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : data.length - 1;
    res.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': end - start + 1,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {}) });
    res.write(data.subarray(start, Math.min(start + 4096, end + 1)));
  });
  stalling.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => stalling.listen(0, '127.0.0.1', resolve));
  const page = await openPage(`stallms=2000&mirror=${encodeURIComponent(`http://127.0.0.1:${stalling.address().port}/demo/`)}`);
  const whole = await ready(page);
  const download = await downloaded(page);
  const said = (await engineLog(page)).filter((l) => l.startsWith('Demo download:'));
  const shown = (await page.evaluate(() => window.detailsSeen)).find((d) => /No data for 2 s/.test(d));
  results[`the loading view says what happened (${shown || 'nothing'})`] = !!shown;
  results[`a mirror that stalls is given up, then from the site (${said.at(-1) || 'nothing said'}; ${show(download)})`] = whole
    && said.some((l) => /No data for 2 s/.test(l)) && said.some((l) => /; from the site$/.test(l))
    && download && isWholeDemo(download[1]);
  await page.context().close();
  for (const socket of sockets) socket.destroy();
  stalling.close();
}

await browser.close();
server.close();
mirror.close();
brokenMirror.close();
fs.rmSync(emptyDir, { recursive: true, force: true });
fs.rmSync(exportDir, { recursive: true, force: true });

results['no page errors'] = errors.length === 0;
let failed = false;
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  failed ||= !ok;
}
for (const e of errors) console.log(e);
process.exit(failed ? 1 : 0);
