// Lists a demo's files (its folder in the site's demo/, e.g. demo/tfe) for the page
// (shell/demo-download.js), which downloads them from mirrors and from the web site itself, and
// keeps them in IndexedDB.
//
//   [DEMO_MIRRORS=url,...] node make_demo_list.mjs <demo dir> [<pack list>]
//
// <pack list>: what pack_demo.py wrote: the files as the page keeps them (their sizes), and those
// served xz-compressed (<path>.xz) in segments (their sizes); without it, the folder's files as
// they are.
//
// DEMO_MIRRORS: other web sites with a copy of the site's demo/ folder (each URL is the address of
// that copy), which the page downloads from before it asks the site (see web/README.md)
//
// Writes <demo dir>/demo-files.json: the files (without hidden and empty ones), the version of
// the data (from what is served: the page downloads a new version again), the mirrors (where their
// copy of this demo's folder is) and the size of the xz segments.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [demoDir, packList] = process.argv.slice(2);
if (!demoDir) {
  console.error('usage: node make_demo_list.mjs <demo dir> [<pack list>]');
  process.exit(1);
}
const LIST = 'demo-files.json';
const slash = (url) => url.replace(/\/?$/, '/');
const sites = (process.env.DEMO_MIRRORS || '').split(/[\s,]+/).filter((url) => url).map(slash);
for (const url of sites) {
  if (!/^https?:\/\//.test(url)) {
    console.error(`DEMO_MIRRORS: not a web address: ${url}`);
    process.exit(1);
  }
}
const mirrors = sites.map((url) => `${url}${path.basename(path.resolve(demoDir))}/`);

let files = [];
const hash = crypto.createHash('sha256');
const pack = packList ? JSON.parse(fs.readFileSync(packList, 'utf8')) : null;
function walk(dir, prefix) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, rel);
    } else if (!name.startsWith('.') && stat.size > 0 && rel !== LIST) {
      files.push({ path: rel, size: stat.size });
      hash.update(`${rel}\0${stat.size}\0`);
      hash.update(fs.readFileSync(full));
    }
  }
}
walk(demoDir, '');
if (pack) {
  // (what is served must be what the pack list says)
  const served = new Map(files.map((f) => [f.path, f.size]));
  for (const f of pack.files) {
    const size = f.xz ? f.xz.reduce((a, b) => a + b, 0) : f.size;
    if (served.get(f.xz ? `${f.path}.xz` : f.path) !== size) {
      console.error(`${packList}: ${f.path} isn't served as it says`);
      process.exit(1);
    }
  }
  if (served.size !== pack.files.length) {
    console.error(`${demoDir}: other files than ${packList} lists`);
    process.exit(1);
  }
  files = pack.files;
}
const version = hash.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(demoDir, LIST), JSON.stringify({ version, mirrors, ...(pack ? { segment: pack.segment } : {}), files },
  null, 1) + '\n');

const total = files.reduce((sum, f) => sum + f.size, 0);
const download = files.reduce((sum, f) => sum + (f.xz ? f.xz.reduce((a, b) => a + b, 0) : f.size), 0);
console.log(`${path.join(demoDir, LIST)}: ${files.length} files, ${(total / 1048576).toFixed(1)} MB `
  + `(${(download / 1048576).toFixed(1)} MB to download), version ${version}${mirrors.length ? `, mirrors ${mirrors.join(' ')}` : ''}`);
