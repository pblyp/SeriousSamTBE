'use strict';

// Reads the files of a .zip the player picks (their game folder, zipped). Only the
// archive's directory is read up front; each file is read from the archive and
// inflated (with the browser's DecompressionStream) when it is needed, so a large
// archive never has to fit in memory at once. And writes a .zip of the files the page
// keeps (ZipWriter, below).

(() => {
  const EOCD_SIGNATURE = 0x06054b50;           // end of central directory
  const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
  const ZIP64_EOCD_SIGNATURE = 0x06064b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;
  const STORED = 0, DEFLATED = 8;

  async function bytesAt(file, start, length) {
    return new DataView(await file.slice(start, start + length).arrayBuffer());
  }

  const u64 = (view, offset) => view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 0x100000000;

  // where the central directory is, and how many entries it has
  async function findDirectory(file) {
    // the end record is at the end, after a comment of up to 64 KB
    const tailLength = Math.min(file.size, 22 + 65535);
    const tailStart = file.size - tailLength;
    const tail = await bytesAt(file, tailStart, tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error('That file is not a .zip archive.');
    }
    let count = tail.getUint16(eocd + 10, true);
    let size = tail.getUint32(eocd + 12, true);
    let offset = tail.getUint32(eocd + 16, true);
    // archives over 4 GB (or with many files) keep the real values in a ZIP64 record
    if (eocd >= 20 && tail.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) {
      const zip64 = await bytesAt(file, u64(tail, eocd - 20 + 8), 56);
      if (zip64.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
        throw new Error('The .zip archive is damaged.');
      }
      count = u64(zip64, 32);
      size = u64(zip64, 40);
      offset = u64(zip64, 48);
    }
    return { count, size, offset };
  }

  // the sizes and offset of an entry, from its ZIP64 extra field where they didn't fit
  function applyZip64(entry, view, extraStart, extraLength) {
    for (let p = extraStart; p + 4 <= extraStart + extraLength;) {
      const id = view.getUint16(p, true);
      const length = view.getUint16(p + 2, true);
      if (id === 0x0001) {
        let q = p + 4;
        if (entry.size === 0xffffffff) { entry.size = u64(view, q); q += 8; }
        if (entry.compressedSize === 0xffffffff) { entry.compressedSize = u64(view, q); q += 8; }
        if (entry.localOffset === 0xffffffff) { entry.localOffset = u64(view, q); }
        return;
      }
      p += 4 + length;
    }
  }

  // an entry's data, as it is in the archive
  async function entryData(file, entry) {
    // the file's data comes after its local header, whose name and extra field may
    // differ in length from the central directory's
    const header = await bytesAt(file, entry.localOffset, 30);
    if (header.getUint32(0, true) !== LOCAL_SIGNATURE) {
      throw new Error(`The .zip archive is damaged (at ${entry.path}).`);
    }
    const dataStart = entry.localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    return file.slice(dataStart, dataStart + entry.compressedSize);
  }

  // an entry's contents as a stream, for files too big to have in memory at once
  async function streamEntry(file, entry) {
    const data = await entryData(file, entry);
    return entry.method === STORED ? data.stream() : data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  }

  async function readEntry(file, entry) {
    const data = await entryData(file, entry);
    if (entry.method === STORED) {
      return data.arrayBuffer();
    }
    const inflated = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(inflated).arrayBuffer();
    if (buffer.byteLength !== entry.size) {
      throw new Error(`The .zip archive is damaged (at ${entry.path}).`);
    }
    return buffer;
  }

  // the files in a .zip: [{ path, size, crc, read() -> Promise<ArrayBuffer>, stream() -> Promise<ReadableStream> }]
  async function list(file) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser can\'t unpack .zip archives; please update it.');
    }
    const { count, size, offset } = await findDirectory(file);
    const directory = await bytesAt(file, offset, size);
    const utf8 = new TextDecoder('utf-8');
    const files = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > directory.byteLength || directory.getUint32(p, true) !== CENTRAL_SIGNATURE) {
        throw new Error('The .zip archive is damaged.');
      }
      const flags = directory.getUint16(p + 8, true);
      const nameLength = directory.getUint16(p + 28, true);
      const extraLength = directory.getUint16(p + 30, true);
      const commentLength = directory.getUint16(p + 32, true);
      // (names are UTF-8, or in old archives the DOS code page, which is the same for ASCII)
      const path = utf8.decode(new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength))
        .replace(/\\/g, '/');
      const entry = {
        path,
        method: directory.getUint16(p + 10, true),
        compressedSize: directory.getUint32(p + 20, true),
        size: directory.getUint32(p + 24, true),
        crc: directory.getUint32(p + 16, true),
        localOffset: directory.getUint32(p + 42, true),
      };
      applyZip64(entry, directory, p + 46 + nameLength, extraLength);
      p += 46 + nameLength + extraLength + commentLength;

      if (path.endsWith('/')) {
        continue;  // a folder
      }
      if (flags & 1) {
        throw new Error('The .zip archive is password protected.');
      }
      if (entry.method !== STORED && entry.method !== DEFLATED) {
        throw new Error('The .zip archive uses a compression the page can\'t unpack; zip it with the usual (deflate) compression.');
      }
      files.push({ path, size: entry.size, crc: entry.crc, read: () => readEntry(file, entry), stream: () => streamEntry(file, entry) });
    }
    return files;
  }

  window.ZipReader = { list };

  // ---------------------------------------------------------------- writing

  // Writes a .zip of the files the page keeps, for the player to keep (see exportFiles() in
  // main.js): the files stored as they are (the game's group files are zip archives already),
  // written front to back, so the archive never has to be in memory at once where the browser
  // can write it to a file as it goes. Each file is read twice, for its CRC first, so that its
  // header has everything in it (as every unzip tool expects).

  const CENTRAL_HEADER = 46, LOCAL_HEADER = 30, END_RECORD = 22;
  // (version 2.0, made on Unix: the files get the usual permissions when unpacked there)
  const VERSION = 20, MADE_BY = (3 << 8) | VERSION;
  const UTF8_NAMES = 0x0800;
  const FILE_MODE = 0o100644;
  // (a Blob is put together from what is written in steps of this many bytes)
  const BLOB_STEP = 64 << 20;

  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  function crc32(crc, bytes) {
    let c = ~crc;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  }

  // the date and time of now, as zip has them (DOS)
  function dosDateTime() {
    const now = new Date();
    return {
      time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
      date: ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
    };
  }

  // a file's pieces (entry.pieces(): an async iterable of Uint8Arrays), checked to be entry.size
  // bytes in all; each piece is passed to fn
  async function eachPiece(entry, fn) {
    let bytes = 0;
    for await (const piece of entry.pieces()) {
      bytes += piece.length;
      if (bytes > entry.size) break;
      await fn(piece);
    }
    if (bytes !== entry.size) {
      throw new Error(`${entry.path} is incomplete in this browser's storage.`);
    }
  }

  // where the archive goes: a file the player picks, written as it goes (where the browser can),
  // else a Blob, downloaded at the end. { write(bytes), close(), abort() }, or null if the player
  // didn't pick a file
  async function openSink(fileName) {
    if (typeof window.showSaveFilePicker === 'function') {
      let handle;
      try {
        handle = await window.showSaveFilePicker({ suggestedName: fileName,
          types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }] });
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
      }
      const writable = await handle.createWritable();
      return { write: (bytes) => writable.write(bytes), close: () => writable.close(), abort: () => writable.abort() };
    }
    let blob = new Blob([]);
    let parts = [];
    let partBytes = 0;
    const step = () => {
      blob = new Blob([blob, ...parts], { type: 'application/zip' });
      parts = [];
      partBytes = 0;
    };
    return {
      write(bytes) {
        parts.push(bytes);
        partBytes += bytes.length;
        if (partBytes >= BLOB_STEP) step();
      },
      close() {
        step();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // (once the browser has it: it may ask where to save it first)
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      },
      abort() {
        parts = [];
        blob = null;
      },
    };
  }

  // save files as a .zip called fileName: entries [{ path, size, pieces() }] (see eachPiece());
  // onProgress(fraction). Resolves with the archive's size, or 0 if the player didn't pick a file
  async function save(fileName, entries, onProgress = () => {}) {
    const encoder = new TextEncoder();
    const files = entries.map((entry) => ({ ...entry, name: encoder.encode(entry.path) }));
    const dataBytes = files.reduce((sum, { size }) => sum + size, 0);
    const archiveBytes = files.reduce((sum, { name }) => sum + LOCAL_HEADER + CENTRAL_HEADER + 2 * name.length, END_RECORD)
      + dataBytes;
    if (archiveBytes > 0xffffffff || files.length > 0xffff) {
      throw new Error('That is too much for a .zip archive (over 4 GB, or over 65,535 files).');
    }
    const sink = await openSink(fileName);
    if (!sink) return 0;
    const { time, date } = dosDateTime();
    const central = [];
    let offset = 0;
    let done = 0;
    const write = async (bytes) => {
      await sink.write(bytes);
      offset += bytes.length;
    };
    const progress = (n) => {
      done += n;
      onProgress(dataBytes ? done / (2 * dataBytes) : 1);
    };
    try {
      for (const file of files) {
        let crc = 0;
        await eachPiece(file, (piece) => {
          crc = crc32(crc, piece);
          progress(piece.length);
        });
        const localOffset = offset;
        const local = new DataView(new ArrayBuffer(LOCAL_HEADER + file.name.length));
        local.setUint32(0, LOCAL_SIGNATURE, true);
        local.setUint16(4, VERSION, true);
        local.setUint16(6, UTF8_NAMES, true);
        local.setUint16(8, STORED, true);
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, file.size, true);
        local.setUint32(22, file.size, true);
        local.setUint16(26, file.name.length, true);
        new Uint8Array(local.buffer).set(file.name, LOCAL_HEADER);
        await write(new Uint8Array(local.buffer));
        await eachPiece(file, async (piece) => {
          await write(piece);
          progress(piece.length);
        });
        central.push({ file, crc, localOffset });
      }
      const directoryOffset = offset;
      for (const { file, crc, localOffset } of central) {
        const entry = new DataView(new ArrayBuffer(CENTRAL_HEADER + file.name.length));
        entry.setUint32(0, CENTRAL_SIGNATURE, true);
        entry.setUint16(4, MADE_BY, true);
        entry.setUint16(6, VERSION, true);
        entry.setUint16(8, UTF8_NAMES, true);
        entry.setUint16(10, STORED, true);
        entry.setUint16(12, time, true);
        entry.setUint16(14, date, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, file.size, true);
        entry.setUint32(24, file.size, true);
        entry.setUint16(28, file.name.length, true);
        entry.setUint32(38, FILE_MODE * 0x10000, true);
        entry.setUint32(42, localOffset, true);
        new Uint8Array(entry.buffer).set(file.name, CENTRAL_HEADER);
        await write(new Uint8Array(entry.buffer));
      }
      const end = new DataView(new ArrayBuffer(END_RECORD));
      end.setUint32(0, EOCD_SIGNATURE, true);
      end.setUint16(8, central.length, true);
      end.setUint16(10, central.length, true);
      end.setUint32(12, offset - directoryOffset, true);
      end.setUint32(16, directoryOffset, true);
      await write(new Uint8Array(end.buffer));
      await sink.close();
    } catch (e) {
      await Promise.resolve(sink.abort()).catch(() => {});
      throw e;
    }
    onProgress(1);
    return offset;
  }

  window.ZipWriter = { save, crc32 };
})();
