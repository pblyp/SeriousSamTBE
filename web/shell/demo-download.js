'use strict';

// Downloads a demo's game files, from mirrors (other web sites with a copy of its folder) and
// else from this site, and keeps them in IndexedDB: the next visit downloads nothing, and a
// download that stopped goes on from where it was. Each file is kept in 1 MB pieces (keyed
// [path, index] in the 'chunks' store, as the player's own group files are, see archives.js),
// so a page that reads group files as they are needed reads them from there.
//
// The demo's folder has its files and demo-files.json (web/tools/make_demo_list.mjs), which lists
// them, the version of the demo data (one IndexedDB database per version: other versions are
// deleted) and the mirrors (each the address of a copy of the folder).
//
// Where IndexedDB can't be used, the files are downloaded into memory, each visit.

(() => {
  // the start of the databases' names (another demo's, e.g. The Second Encounter's on The Both
  // Encounters' page, have their own)
  const DB_PREFIX = 'sam-demo-';
  const CHUNK_SIZE = 1 << 20;
  // how often a source may fail without anything arriving before the next one is asked
  const TRIES = 2;

  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function openDatabase(name) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('chunks');
        // path -> how many of its bytes are kept (whole pieces, until all of it is)
        open.result.createObjectStore('files');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error || new Error('Cannot open IndexedDB'));
      open.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  }

  // a piece of a file, and how much of the file is kept with it (in one transaction)
  function putPiece(db, path, index, data, kept) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['chunks', 'files'], 'readwrite');
      tx.objectStore('chunks').put(data, [path, index]);
      tx.objectStore('files').put(kept, path);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => { e.preventDefault(); reject(tx.error); };
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
  }

  async function keptBytes(db, path) {
    return (await request(db.transaction('files').objectStore('files').get(path))) || 0;
  }

  // a kept file, all of it
  async function readFile(dbName, path, size) {
    const db = await openDatabase(dbName);
    try {
      const range = IDBKeyRange.bound([path, 0], [path, Infinity]);
      const pieces = await request(db.transaction('chunks').objectStore('chunks').getAll(range));
      const data = new Uint8Array(size);
      let offset = 0;
      for (const piece of pieces) {
        data.set(new Uint8Array(piece), offset);
        offset += piece.byteLength;
      }
      if (offset !== size) throw new Error(`${path} is incomplete in this browser's storage: clear the assets and download it again.`);
      return data.buffer;
    } finally {
      db.close();
    }
  }

  // other versions of the demo data are not needed any more
  async function deleteOtherVersions(prefix, version) {
    if (!indexedDB.databases) return;
    for (const { name } of await indexedDB.databases()) {
      if (name.startsWith(prefix) && name !== prefix + version) {
        indexedDB.deleteDatabase(name);
      }
    }
  }

  async function fetchOk(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    return response;
  }

  // where a source's copy of the demo's folder is, ending in a slash
  const folderUrl = (url) => new URL(url.replace(/\/?$/, '/'), location.href).href;
  const fileUrl = (base, path) => new URL(path.split('/').map(encodeURIComponent).join('/'), base).href;

  // the rest of a file (from byte `from`, a piece's start) from one source, into its pieces:
  // how many bytes are kept then. onBytes(n, at) is called as they arrive (at: how much of the
  // file is there with them)
  async function fetchInto(db, file, base, from, onBytes) {
    const response = await fetchOk(fileUrl(base, file.path), from > 0 ? { headers: { Range: `bytes=${from}-` } } : {});
    // (a source that sends all of it: from the start)
    let kept = response.status === 206 ? from : 0;
    let at = kept;
    const reader = response.body.getReader();
    let piece = new Uint8Array(CHUNK_SIZE);
    let filled = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // (not another file)
      if (at + value.length > file.size) {
        throw new Error(`${fileUrl(base, file.path)}: more than ${file.size} bytes`);
      }
      for (let offset = 0; offset < value.length;) {
        const n = Math.min(CHUNK_SIZE - filled, value.length - offset);
        piece.set(value.subarray(offset, offset + n), filled);
        filled += n;
        offset += n;
        if (filled === CHUNK_SIZE) {
          await putPiece(db, file.path, kept / CHUNK_SIZE, piece.buffer, kept + CHUNK_SIZE);
          kept += CHUNK_SIZE;
          piece = new Uint8Array(CHUNK_SIZE);
          filled = 0;
        }
      }
      at += value.length;
      onBytes(value.length, at);
    }
    if (filled > 0) {
      await putPiece(db, file.path, kept / CHUNK_SIZE, piece.slice(0, filled).buffer, kept + filled);
      kept += filled;
    }
    if (kept !== file.size) {
      throw new Error(`${fileUrl(base, file.path)}: ${kept} bytes instead of ${file.size}`);
    }
    return kept;
  }

  // without IndexedDB: the files into memory, one by one, from the first source that has them
  async function downloadToMemory(info, sources, site, onProgress, log) {
    const total = info.files.reduce((sum, file) => sum + file.size, 0);
    let done = 0;
    let fromSite = 0;
    const files = [];
    for (const file of info.files) {
      let error = null;
      for (const base of sources) {
        try {
          const response = await fetchOk(fileUrl(base, file.path));
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            chunks.push(value);
            size += value.length;
            onProgress(Math.min((done + size) / total, 1));
          }
          if (size !== file.size) throw new Error(`${fileUrl(base, file.path)}: ${size} bytes instead of ${file.size}`);
          done += size;
          if (base === site) fromSite += size;
          const data = new Blob(chunks);
          files.push({ path: file.path, size, read: () => data.arrayBuffer() });
          error = null;
          break;
        } catch (e) {
          error = e;
        }
      }
      if (error) throw error;
    }
    const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
    log(`Demo data ready (${mb(done)} downloaded, ${mb(done - fromSite)} of it from mirrors, ${mb(fromSite)} from the site)`);
    return files;
  }

  // the demo's files as [{ path, size, read() -> Promise<ArrayBuffer>, pieces: { db, name } }]
  //   base:       the demo's folder (its files and demo-files.json), relative to the page
  //   prefix:     the start of its IndexedDB databases' names (one demo's own)
  //   mirrors:    more web sites with the files, besides the ones the build lists
  //   onProgress: called with the fraction done
  async function download({ base, prefix = DB_PREFIX, mirrors = [], onProgress = () => {}, log = () => {} } = {}) {
    const info = await (await fetchOk(`${base}demo-files.json`)).json();
    const site = folderUrl(base);
    mirrors = [...new Set([...(info.mirrors || []), ...mirrors].map(folderUrl))].filter((url) => url !== site);
    const sources = [...mirrors, site];
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    const dbName = prefix + info.version;
    let db;
    try {
      db = await openDatabase(dbName);
    } catch (e) {
      log(`Demo download: this browser can't keep it (${e.message || e}), into memory`);
      return downloadToMemory(info, sources, site, onProgress, log);
    }
    const total = info.files.reduce((sum, file) => sum + file.size, 0);
    // bytes downloaded now, all and from the site (the rest from mirrors)
    let fromSources = 0;
    let fromSite = 0;
    try {
      // (what is kept of each file)
      const kept = new Map();
      for (const file of info.files) kept.set(file.path, await keptBytes(db, file.path));
      const progress = () => onProgress(total ? Math.min([...kept.values()].reduce((a, b) => a + b, 0) / total, 1) : 1);
      progress();
      // the first source that works, the next one when it fails (on from where it stopped)
      let source = 0;
      for (const file of info.files) {
        let failures = 0;
        while (kept.get(file.path) < file.size) {
          const base = sources[source];
          const before = kept.get(file.path);
          try {
            kept.set(file.path, await fetchInto(db, file, base, before, (n, at) => {
              fromSources += n;
              if (base === site) fromSite += n;
              kept.set(file.path, at);
              progress();
            }));
          } catch (e) {
            const now = await keptBytes(db, file.path);
            kept.set(file.path, now);
            progress();
            if (now > before) failures = 0;
            if (++failures >= TRIES) {
              failures = 0;
              if (++source >= sources.length) throw e;
              log(`Demo download: ${e.message || e}; from ${sources[source] === site ? 'the site' : `the mirror ${sources[source]}`}`);
            }
          }
        }
      }
    } finally {
      db.close();
    }
    onProgress(1);
    const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
    log(`Demo data ready (${mb(fromSources)} downloaded, ${mb(fromSources - fromSite)} of it from mirrors, ${mb(fromSite)} from the site)`);
    deleteOtherVersions(prefix, info.version).catch(() => {});
    return info.files.map((file) => ({
      path: file.path,
      size: file.size,
      read: () => readFile(dbName, file.path, file.size),
      // (where its pieces are kept, to read them from there)
      pieces: { db: dbName, name: file.path },
    }));
  }

  // the demo as it is kept in this browser, if all of it is (the site's version of it):
  // { db, files: [{ path, size }] } (its pieces are in db's 'chunks' store), else null
  async function kept({ base, prefix = DB_PREFIX }) {
    const info = await (await fetchOk(`${base}demo-files.json`)).json();
    const dbName = prefix + info.version;
    // (without creating the database just to look)
    if (!indexedDB.databases || !(await indexedDB.databases()).some(({ name }) => name === dbName)) {
      return null;
    }
    const db = await openDatabase(dbName);
    try {
      for (const file of info.files) {
        if (await keptBytes(db, file.path) < file.size) return null;
      }
    } finally {
      db.close();
    }
    return { db: dbName, files: info.files.map(({ path, size }) => ({ path, size })) };
  }

  window.DemoDownload = { download, kept };
})();
