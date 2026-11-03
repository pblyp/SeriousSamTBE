// Reading the group files (.gro) from the browser's storage as the game needs them (The Both
// Encounters, see web/shell/archives.js and SamTBE's Engine/Base/Emscripten/WebArchive.cpp):
// the demo's group files are stored in pieces in IndexedDB, then a small program built from
// SamTBE's engine (SamTBE/Sources/Tests/ArchiveReaderTest.cpp) reads every file in them
// through the engine's archive reader, in several ways, and checks it against the CRC in the
// archive. The cache is kept small, so pieces are read again and again. The demo's
// SE1_10b.gro is in /data, the others in /tfe, the CD path (as The First Encounter's files).
//
// Needs the web build (web/build.sh) and The First Encounter's demo in dist/demo/tfe.
//
//   node archive-reader.mjs [--browser chromium|webkit|firefox] [--build jspi|asyncify]

import { chromium, webkit, firefox } from 'playwright';
import { serve } from './server.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../build');
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv.splice(i, 2)[1] : fallback;
};
const browserName = option('--browser', null);
const onlyBuild = option('--build', null);
// (WebKit has no JSPI)
const runs = [['chromium', 'jspi'], ['chromium', 'asyncify'], ['webkit', 'asyncify']]
  .filter(([b, v]) => (!browserName || b === browserName) && (!onlyBuild || v === onlyBuild));

// the test program, built next to the engine (it is left out of the usual build)
for (const variant of new Set(runs.map(([, v]) => v))) {
  const out = path.join(buildDir, `wasm-tbo-${variant}`);
  try {
    execFileSync('cmake', ['--build', out, '--target', 'ArchiveReaderTest'], { stdio: 'pipe' });
  } catch (e) {
    console.log(`Cannot build the test program in ${out} (build TBO for the web first, with emsdk activated):`);
    console.log(String(e.stdout || e.message).slice(-2000));
    process.exit(1);
  }
}

const groups = fs.readdirSync(path.join(buildDir, 'dist/demo/tfe')).filter((name) => name.endsWith('.gro')).sort();
const server = await serve();
const results = {};
const errors = [];

for (const [name, variant] of runs) {
  const browser = await { chromium, webkit, firefox }[name].launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${name} ${variant}: ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  console: ${m.text()}`); });
  // the test page, archives.js as it is in the repository, and the test program
  await page.route('**/archive-test/**', (route) => {
    const file = new URL(route.request().url()).pathname.replace(/^\/archive-test\//, '');
    if (file === 'index.html') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script src="archives.js"></script>' });
    }
    const source = file === 'archives.js' ? path.resolve(here, '../shell/archives.js')
      : path.join(buildDir, `wasm-tbo-${variant}`, path.basename(file));
    return route.fulfill({ path: source,
      contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
  });
  await page.goto(`${server.url}/archive-test/index.html`);

  const outcome = await page.evaluate(async ({ groups, variant }) => {
    GameArchives.setCacheLimit(16 << 20);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('archive-test', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('chunks');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // the group files, in pieces
    const args = ['--cd', '/tfe/'];
    let bytes = 0;
    for (const name of groups) {
      const response = await fetch(`/demo/tfe/${name}`);
      const { size } = await GameArchives.store(db, name, response.body);
      const where = name === 'SE1_10b.gro' ? `/data/${name}` : `/tfe/${name}`;
      GameArchives.register(where, 'archive-test', name, size);
      args.push(where);
      bytes += size;
    }
    const out = [];
    await new Promise((resolve, reject) => {
      window.Module = {
        webArchives: GameArchives,
        print: (text) => out.push(text),
        printErr: (text) => out.push(text),
        onRuntimeInitialized: resolve,
        onAbort: (what) => reject(new Error(String(what))),
      };
      const script = document.createElement('script');
      script.src = `${variant}/archivereadertest.js`;
      script.onerror = () => reject(new Error('Cannot load the test program'));
      document.body.append(script);
    });
    const started = performance.now();
    try {
      await Module.callMain(args);
    } catch (e) {
      // (exiting at the end of main is reported as an exception)
      if (!(e instanceof Module.ExitStatus) && e !== 'unwind') out.push(`exception: ${e}`);
    }
    // (with JSPI, main returns before it has finished)
    for (let i = 0; i < 600 && !out.some((l) => l.startsWith('checked')); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    return { out, bytes, seconds: (performance.now() - started) / 1000, stats: { ...GameArchives.stats },
      cached: GameArchives.cachedBytes() };
  }, { groups, variant });

  const summary = outcome.out.find((l) => l.startsWith('checked')) || '(no result)';
  for (const l of outcome.out.filter((l) => /^(BAD|ERROR|exception)/.test(l)).slice(0, 10)) console.log(`  ${l}`);
  const m = summary.match(/checked (\d+) files: (\d+) ok, (\d+) bad, (\d+) from the CD path/);
  results[`${name} ${variant}: ${summary} (${Math.round(outcome.bytes / 1048576)} MB of group files, `
    + `${outcome.stats.misses} reads from storage, ${outcome.stats.piecesRead} pieces, ${outcome.seconds.toFixed(1)} s)`] =
    !!m && Number(m[1]) > 1000 && m[3] === '0' && Number(m[4]) > 0
    && outcome.stats.misses > 0 && outcome.cached <= (16 << 20);
  await browser.close();
}
await server.close();

let ok = true;
for (const [what, passed] of Object.entries(results)) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= passed;
}
for (const e of errors) console.log(`page error: ${e}`);
ok &&= errors.length === 0 && runs.length > 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
