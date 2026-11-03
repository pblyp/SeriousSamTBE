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
// The files are served xz-compressed (<path>.xz, see web/tools/pack_demo.py) in segments, each
// one xz stream of `segment` bytes of the file (demo-files.json's), which are asked for one by one
// (range requests) and unpacked as they arrive (xz.js): a download that stopped goes on from the
// segment it was in. A file that xz doesn't make smaller is served as it is.
//
// A request that gets no data for a while (STALL_MS) is given up and asked again (or the next
// source is): a connection that stalled would otherwise wait for ever.
//
// Where IndexedDB can't be used, the files are downloaded into memory, each visit.

(() => {
  // the start of the databases' names (another demo's, e.g. The Second Encounter's on The Both
  // Encounters' page, have their own)
  const DB_PREFIX = 'sam-demo-';
  const CHUNK_SIZE = 1 << 20;
  // how often a source may fail without anything arriving before the next one is asked
  const TRIES = 2;
  // how long a request may go without data before it is given up
  const STALL_MS = 20000;

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

  const sum = (numbers) => numbers.reduce((a, b) => a + b, 0);
  // how many bytes a file's download is: its xz segments', or its own
  const downloadSize = (file) => (file.xz ? sum(file.xz) : file.size);
  // how much of a file's download is done when `kept` bytes of it are kept: of an xz file, the
  // segments that are kept whole
  function downloadedFor(info, file, kept) {
    if (kept >= file.size) return downloadSize(file);
    return file.xz ? sum(file.xz.slice(0, Math.floor(kept / info.segment))) : kept;
  }

  // a request whose data is watched: when none comes for stallMs (before the response, or between
  // the parts of its body), it is given up. { response, parts (an async iterable of its body's
  // Uint8Arrays), cancel() }
  async function fetchWatched(url, options, stallMs) {
    const controller = new AbortController();
    const stalled = new Error(`No data for ${Math.round(stallMs / 1000)} s from ${url}`);
    stalled.stalled = true;
    let timer = null;
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), stallMs);
    };
    const cancel = () => {
      clearTimeout(timer);
      controller.abort();
    };
    const failed = (e) => (controller.signal.aborted ? stalled : e);
    watch();
    let response;
    try {
      response = await fetchOk(url, { ...options, signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      throw failed(e);
    }
    const reader = response.body.getReader();
    async function* parts() {
      let finished = false;
      try {
        for (;;) {
          watch();
          let result;
          try {
            result = await reader.read();
          } catch (e) {
            throw failed(e);
          }
          if (result.done) {
            finished = true;
            return;
          }
          yield result.value;
        }
      } finally {
        clearTimeout(timer);
        // (given up before its end: the rest isn't wanted)
        if (!finished) controller.abort();
      }
    }
    return { response, parts: parts(), cancel };
  }

  // the parts, onBytes(n) called for each
  async function* counted(parts, onBytes) {
    for await (const part of parts) {
      onBytes(part.length);
      yield part;
    }
  }

  // a file's data (an async iterable of Uint8Arrays) from byte `start` (a piece's start) on, into
  // its pieces, up to `limit` at most: where it ends
  async function writePieces(db, file, start, data, limit) {
    let kept = start;
    let piece = new Uint8Array(CHUNK_SIZE);
    let filled = 0;
    for await (const value of data) {
      if (kept + filled + value.length > limit) {
        throw new Error(`${file.path}: more than ${limit - start} bytes from byte ${start}`);
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
    }
    if (filled > 0) {
      await putPiece(db, file.path, kept / CHUNK_SIZE, piece.slice(0, filled).buffer, kept + filled);
      kept += filled;
    }
    return kept;
  }

  // the rest of a file served as it is (from byte `from`, a piece's start) from one source, into
  // its pieces: how many bytes are kept then. onBytes(n) is called as they arrive
  async function fetchPlainInto(db, file, base, from, onBytes, stallMs) {
    const url = fileUrl(base, file.path);
    const { response, parts } = await fetchWatched(url, from > 0 ? { headers: { Range: `bytes=${from}-` } } : {}, stallMs);
    // (a source that sends all of it: from the start)
    const start = response.status === 206 ? from : 0;
    const kept = await writePieces(db, file, start, counted(parts, onBytes), file.size);
    if (kept !== file.size) {
      throw new Error(`${url}: ${kept} bytes instead of ${file.size}`);
    }
    return kept;
  }

  // the parts (xz streams) of an xz-compressed file, from the one with byte `from` (a piece's start)
  // on: { url, segment, range: [start, end) of the compressed file, at: where its output starts,
  // limit: where its output ends }
  function* segmentsOf(info, file, base, from) {
    const url = fileUrl(base, `${file.path}.xz`);
    let at = 0;
    for (let segment = 0; segment < file.xz.length; segment++) {
      const output = segment * info.segment;
      if (output + info.segment > from) {
        yield { url, segment, range: [at, at + file.xz[segment]], at: output, limit: Math.min(file.size, output + info.segment) };
      }
      at += file.xz[segment];
    }
  }

  // one segment's compressed data: an async iterable of Uint8Arrays, onBytes(n) called as they arrive
  async function fetchSegment(file, part, onBytes, stallMs) {
    const [start, end] = part.range;
    const { response, parts, cancel } = await fetchWatched(part.url, { headers: { Range: `bytes=${start}-${end - 1}` } }, stallMs);
    // (all of it instead of the part: right only if the part is all of it)
    if (response.status !== 206 && !(start === 0 && end === downloadSize(file))) {
      cancel();
      throw new Error(`${part.url}: the server sends whole files only (status ${response.status})`);
    }
    return counted(parts, onBytes);
  }

  // the rest of an xz-compressed file (from the segment with byte `from`, a piece's start) from
  // one source, unpacked into its pieces: how many bytes are kept then (a segment's pieces before
  // `from` are written again)
  async function fetchXzInto(db, info, file, base, from, onBytes, stallMs) {
    let kept = Math.floor(from / info.segment) * info.segment;
    for (const part of segmentsOf(info, file, base, from)) {
      kept = await writePieces(db, file, part.at, Xz.decode(await fetchSegment(file, part, onBytes, stallMs)), part.limit);
      if (kept !== part.limit) {
        throw new Error(`${part.url}: ${kept - part.at} bytes in segment ${part.segment} instead of ${part.limit - part.at}`);
      }
    }
    return kept;
  }

  // without IndexedDB: the files into memory, one by one, from the first source that has them
  async function downloadToMemory(info, sources, site, stallMs, onProgress, log) {
    const total = sum(info.files.map(downloadSize));
    let done = 0;
    let fromSite = 0;
    const files = [];
    for (const file of info.files) {
      let error = null;
      for (const base of sources) {
        try {
          const chunks = [];
          let size = 0;
          let got = 0;
          const onBytes = (n) => {
            got += n;
            onProgress(Math.min((done + got) / total, 1), { done: done + got, total });
          };
          // (the segments one after the other, each asked for when the one before is there)
          const parts = file.xz ? (async function* () {
            for (const part of segmentsOf(info, file, base, 0)) yield* Xz.decode(await fetchSegment(file, part, onBytes, stallMs));
          })() : counted((await fetchWatched(fileUrl(base, file.path), {}, stallMs)).parts, onBytes);
          for await (const value of parts) {
            chunks.push(value);
            size += value.length;
          }
          if (size !== file.size) throw new Error(`${fileUrl(base, file.path)}: ${size} bytes instead of ${file.size}`);
          done += got;
          if (base === site) fromSite += got;
          const data = new Blob(chunks);
          files.push({ path: file.path, size, read: () => data.arrayBuffer() });
          error = null;
          break;
        } catch (e) {
          error = e;
          log(`Demo download: ${e.message || e}`);
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
  //   stallMs:    how long a request may go without data
  //   onProgress: called with the fraction done, and { done, total } (bytes to download)
  //   onNote:     called with what happened when a request failed (and what is done now)
  async function download({ base, prefix = DB_PREFIX, mirrors = [], stallMs = STALL_MS, onProgress = () => {},
    onNote = () => {}, log = () => {} } = {}) {
    const info = await (await fetchOk(`${base}demo-files.json`)).json();
    const site = folderUrl(base);
    mirrors = [...new Set([...(info.mirrors || []), ...mirrors].map(folderUrl))].filter((url) => url !== site);
    const sources = [...mirrors, site];
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    // (other versions can't be used for this one: not kept next to it)
    await deleteOtherVersions(prefix, info.version).catch(() => {});
    const dbName = prefix + info.version;
    let db;
    try {
      db = await openDatabase(dbName);
    } catch (e) {
      log(`Demo download: this browser can't keep it (${e.message || e}), into memory`);
      return downloadToMemory(info, sources, site, stallMs, onProgress, log);
    }
    const total = sum(info.files.map(downloadSize));
    // bytes downloaded now, all and from the site (the rest from mirrors)
    let fromSources = 0;
    let fromSite = 0;
    try {
      // (what is kept of each file, and how much of its download that is)
      const kept = new Map();
      for (const file of info.files) kept.set(file.path, await keptBytes(db, file.path));
      const done = new Map(info.files.map((file) => [file.path, downloadedFor(info, file, kept.get(file.path))]));
      const progress = () => {
        const bytes = Math.min(sum([...done.values()]), total);
        onProgress(total ? bytes / total : 1, { done: bytes, total });
      };
      progress();
      // the first source that works, the next one when it fails (on from where it stopped)
      let source = 0;
      for (const file of info.files) {
        let failures = 0;
        while (kept.get(file.path) < file.size) {
          const from = sources[source];
          const before = kept.get(file.path);
          done.set(file.path, downloadedFor(info, file, before));
          const onBytes = (n) => {
            fromSources += n;
            if (from === site) fromSite += n;
            done.set(file.path, done.get(file.path) + n);
            progress();
          };
          try {
            kept.set(file.path, file.xz ? await fetchXzInto(db, info, file, from, before, onBytes, stallMs)
              : await fetchPlainInto(db, file, from, before, onBytes, stallMs));
          } catch (e) {
            const now = await keptBytes(db, file.path);
            kept.set(file.path, now);
            done.set(file.path, downloadedFor(info, file, now));
            progress();
            // (it got further: the same source again)
            if (downloadedFor(info, file, now) > downloadedFor(info, file, before)) failures = 0;
            const why = e.stalled ? `No data for ${Math.round(stallMs / 1000)} s` : 'The download failed';
            if (++failures >= TRIES) {
              failures = 0;
              if (++source >= sources.length) throw e;
              log(`Demo download: ${e.message || e}; from ${sources[source] === site ? 'the site' : `the mirror ${sources[source]}`}`);
              onNote(`${why}: downloading from ${sources[source] === site ? 'this site' : 'another mirror'}`);
            } else {
              log(`Demo download: ${e.message || e}; again`);
              onNote(`${why}: trying again`);
            }
          }
        }
        done.set(file.path, downloadSize(file));
        progress();
      }
    } finally {
      db.close();
    }
    onProgress(1, { done: total, total });
    const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
    log(`Demo data ready (${mb(fromSources)} downloaded, ${mb(fromSources - fromSite)} of it from mirrors, ${mb(fromSite)} from the site)`);
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
