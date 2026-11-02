'use strict';

// The game's group files (.gro, zip archives) kept in the browser's storage in pieces, and
// read from there while the game runs (see Engine/Base/Emscripten/WebArchive.cpp in SamTBO),
// so they needn't be in memory: The Both Encounters' (config.js: lazyArchives) two
// installations are more than some phones let a page have.
//
// An archive's pieces (CHUNK_SIZE bytes; ArrayBuffers, as WebKit doesn't store Blobs in some
// contexts) are in the 'chunks' store of the game files' database, keyed [name, index]. The
// pieces read last stay in memory (up to CACHE_BYTES); the engine asks for the others, and
// waits for them. Nothing here rejects: the engine gets -1 for what can't be read.

(() => {
  const CHUNK_SIZE = 1 << 20;
  const CACHE_BYTES = 96 << 20;
  // pieces read along with a missing one (the engine mostly reads on)
  const READ_AHEAD = 3;

  // store a stream in pieces under name, in db's 'chunks' store; resolves with its size and its
  // last tailLength bytes (to check it). onProgress(bytes) is called as it goes
  async function store(db, name, stream, tailLength = 0, onProgress = null) {
    const put = (index, buffer) => new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(buffer, [name, index]);
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
    const reader = stream.getReader();
    let piece = new Uint8Array(CHUNK_SIZE);
    let filled = 0;
    let index = 0;
    let size = 0;
    let tail = new Uint8Array(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length;) {
        const n = Math.min(CHUNK_SIZE - filled, value.length - offset);
        piece.set(value.subarray(offset, offset + n), filled);
        filled += n;
        offset += n;
        if (filled === CHUNK_SIZE) {
          await put(index++, piece.buffer);
          piece = new Uint8Array(CHUNK_SIZE);
          filled = 0;
          if (onProgress) onProgress(index * CHUNK_SIZE);
        }
      }
      size += value.length;
      if (tailLength > 0) {
        const joined = new Uint8Array(tail.length + value.length);
        joined.set(tail);
        joined.set(value, tail.length);
        tail = joined.slice(Math.max(0, joined.length - tailLength));
      }
    }
    if (filled > 0) {
      await put(index, piece.slice(0, filled).buffer);
    }
    return { size, tail };
  }

  // the archives the engine reads from storage: { path (in its file system), dbName, name, size }
  const archives = [];
  const databases = new Map();  // dbName -> Promise<IDBDatabase>
  const cache = new Map();      // `${id}/${index}` -> Uint8Array, least recently used first
  let cacheBytes = 0;
  // (smaller in tests; the engine asks for at most 8 MB at once, so not below 16 MB)
  let cacheLimit = CACHE_BYTES;
  const stats = { misses: 0, piecesRead: 0 };

  function database(dbName) {
    if (!databases.has(dbName)) {
      databases.set(dbName, new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          // (let it be deleted, e.g. when the assets are cleared: open it again if needed)
          db.onversionchange = () => { db.close(); databases.delete(dbName); };
          resolve(db);
        };
        request.onerror = () => { databases.delete(dbName); reject(request.error); };
      }));
    }
    return databases.get(dbName);
  }

  // an archive whose pieces are in the database dbName under name
  function register(path, dbName, name, size) {
    archives.push({ path, dbName, name, size });
  }
  function unregister(path) {
    const id = archives.findIndex((a) => a && a.path === path);
    if (id >= 0) archives[id] = null;
  }

  // (called by the engine) the archive at that path, or -1
  function open(path) {
    const normalized = path.replace(/\/+/g, '/');
    return archives.findIndex((a) => a && a.path === normalized);
  }
  function size(id) {
    return archives[id].size;
  }

  const keyOf = (id, index) => `${id}/${index}`;
  function take(id, index) {
    const key = keyOf(id, index);
    const piece = cache.get(key);
    if (piece) {
      cache.delete(key);
      cache.set(key, piece);
    }
    return piece;
  }
  function keep(id, index, piece) {
    const key = keyOf(id, index);
    if (cache.has(key)) return;
    cache.set(key, piece);
    cacheBytes += piece.length;
    for (const [oldKey, old] of cache) {
      if (cacheBytes <= cacheLimit) break;
      cache.delete(oldKey);
      cacheBytes -= old.length;
    }
  }

  // (called by the engine) copy length bytes at offset into heap at ptr: how many, or -1 if
  // a piece they are in isn't in memory (then the engine calls fetch() and tries again)
  function readSync(id, offset, length, heap, ptr) {
    const archive = archives[id];
    length = Math.min(length, archive.size - offset);
    if (length <= 0) return 0;
    const first = Math.floor(offset / CHUNK_SIZE);
    const last = Math.floor((offset + length - 1) / CHUNK_SIZE);
    const pieces = [];
    for (let i = first; i <= last; i++) {
      const piece = take(id, i);
      if (!piece) return -1;
      pieces.push(piece);
    }
    let done = 0;
    for (let i = first; i <= last; i++) {
      const piece = pieces[i - first];
      const start = i === first ? offset - first * CHUNK_SIZE : 0;
      const end = Math.min(piece.length, offset + length - i * CHUNK_SIZE);
      heap.set(piece.subarray(start, end), ptr + done);
      done += end - start;
    }
    return done;
  }

  // (called by the engine) get the pieces of length bytes at offset (and a few after) into
  // memory: 0, or -1 if they can't be read
  async function fetch(id, offset, length) {
    try {
      const archive = archives[id];
      const first = Math.floor(offset / CHUNK_SIZE);
      const last = Math.floor((offset + Math.max(length, 1) - 1) / CHUNK_SIZE);
      const lastPiece = Math.floor((archive.size - 1) / CHUNK_SIZE);
      const wanted = [];
      for (let i = first; i <= Math.min(last + READ_AHEAD, lastPiece); i++) {
        if (!cache.has(keyOf(id, i))) wanted.push(i);
      }
      if (wanted.length > 0) {
        stats.misses++;
        const db = await database(archive.dbName);
        const pieces = await new Promise((resolve, reject) => {
          const tx = db.transaction('chunks', 'readonly');
          const chunks = tx.objectStore('chunks');
          const got = new Map();
          for (const i of wanted) {
            const request = chunks.get([archive.name, i]);
            request.onsuccess = () => { if (request.result) got.set(i, new Uint8Array(request.result)); };
          }
          tx.oncomplete = () => resolve(got);
          tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        });
        stats.piecesRead += pieces.size;
        // (the ones read ahead first: the ones asked for stay longer)
        for (const i of [...wanted].reverse()) {
          if (pieces.has(i)) keep(id, i, pieces.get(i));
        }
      }
      for (let i = first; i <= last; i++) {
        if (!cache.has(keyOf(id, i))) {
          console.error(`${archive.path}: piece ${i} is missing from the browser's storage`);
          return -1;
        }
      }
      return 0;
    } catch (e) {
      console.error(`Cannot read a game archive: ${e && e.message}`);
      return -1;
    }
  }

  // an archive as a Blob would be (size, slice(start, end).arrayBuffer()), to list it with
  // ZipReader (for tests)
  function asBlob(id) {
    const archive = archives[id];
    return {
      size: archive.size,
      slice: (start, end) => ({
        async arrayBuffer() {
          const bytes = new Uint8Array(Math.max(0, Math.min(end, archive.size) - start));
          for (let done = 0; done < bytes.length;) {
            const n = Math.min(bytes.length - done, 8 << 20);
            if (await fetch(id, start + done, n) !== 0) throw new Error(`Cannot read ${archive.path}`);
            done += readSync(id, start + done, n, bytes, done);
          }
          return bytes.buffer;
        },
      }),
    };
  }

  window.GameArchives = { CHUNK_SIZE, store, register, unregister, open, size, readSync, fetch, stats, asBlob,
    cachedBytes: () => cacheBytes, setCacheLimit: (bytes) => { cacheLimit = Math.max(bytes, 16 << 20); } };
})();
