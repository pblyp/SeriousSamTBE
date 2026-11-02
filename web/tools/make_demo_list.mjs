// Lists a demo's files (its folder in the site's demo/, e.g. demo/tfe) for the page
// (shell/demo-download.js), which downloads them from mirrors and from the web site itself, and
// keeps them in IndexedDB.
//
//   [DEMO_MIRRORS=url,...] node make_demo_list.mjs <demo dir>
//
// DEMO_MIRRORS: other web sites with a copy of the site's demo/ folder (each URL is the address of
// that copy), which the page downloads from before it asks the site (see web/README.md)
//
// Writes <demo dir>/demo-files.json: the files (without hidden and empty ones), the version of
// the data (from the files' contents: the page downloads a new version again) and the mirrors
// (where their copy of this demo's folder is).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [demoDir] = process.argv.slice(2);
if (!demoDir) {
  console.error('usage: node make_demo_list.mjs <demo dir>');
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

const files = [];
const hash = crypto.createHash('sha256');
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
const version = hash.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(demoDir, LIST), JSON.stringify({ version, mirrors, files }, null, 1) + '\n');

const total = files.reduce((sum, f) => sum + f.size, 0);
console.log(`${path.join(demoDir, LIST)}: ${files.length} files, ${(total / 1048576).toFixed(1)} MB, version ${version}`
  + `${mirrors.length ? `, mirrors ${mirrors.join(' ')}` : ''}`);
