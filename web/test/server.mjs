// Minimal static file server for web/build/dist.
//
// It also runs network games, for players who open the page from it (announced in
// net-hub.json, in every folder: a page in a folder asks there):
//   /hub     passes the game's packets on between the players of a room (see shell/netplay.js)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/dist');
const HUB_PATH = '/hub';

// (only if it is installed: npm install in web/test)
const wsModule = await import('ws').catch(() => null);

// the hub: in each room (a socket's first message: { room }), every message goes to
// the room's other sockets; when a socket closes, they get { from, type: 'bye' }
// (see hubBus() in shell/netplay.js)
function createHub() {
  const wss = new wsModule.WebSocketServer({ noServer: true });
  const members = new Map();  // socket -> { room, id }
  wss.on('connection', (socket) => {
    const member = { room: null, id: null };
    members.set(socket, member);
    socket.on('message', (message) => {
      let m;
      try {
        m = JSON.parse(message);
      } catch (e) {
        return;
      }
      if (member.room === null) {
        member.room = typeof m.room === 'string' ? m.room : null;
        return;
      }
      member.id = member.id || m.from;
      for (const [other, them] of members) {
        if (other !== socket && them.room === member.room && other.readyState === 1) other.send(String(message));
      }
    });
    socket.on('close', () => {
      members.delete(socket);
      if (!member.id) return;
      const bye = JSON.stringify({ from: member.id, type: 'bye' });
      for (const [other, them] of members) {
        if (them.room === member.room && other.readyState === 1) other.send(bye);
      }
    });
  });
  return wss;
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// cors: let pages of other origins read the files (as a demo mirror must);
// served.demo counts the bytes of the demos' files sent (demo/..., not their lists),
// served.notFound the files missing
export function serve(port = 0, root = DIST, host = '127.0.0.1', { cors = false } = {}) {
  const served = { demo: 0, notFound: 0 };
  const corsHeaders = cors ? {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  } : {};
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method === 'OPTIONS' && cors) {
      res.writeHead(204, corsHeaders).end();
      return;
    }
    if (urlPath.endsWith('/net-hub.json') && hub) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
        .end(JSON.stringify({ hub: HUB_PATH }));
      return;
    }
    // (a folder's page is its index.html, as on GitHub Pages)
    const file = path.join(root, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    // (and a folder without its slash goes there, so the page's relative URLs work)
    if (!urlPath.endsWith('/') && fs.existsSync(path.join(file, 'index.html'))) {
      res.writeHead(301, { ...corsHeaders, Location: `${urlPath}/` }).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        served.notFound++;
        res.writeHead(404, corsHeaders).end('not found');
        return;
      }
      const isDemo = urlPath.startsWith('/demo/') && !urlPath.endsWith('/demo-files.json');
      const headers = {
        ...corsHeaders,
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
      };
      // parts of files, as the page asks for to go on with a download that stopped (like
      // GitHub Pages does, which refuses ranges of empty files)
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (req.headers.range && st.size === 0) {
        res.writeHead(416, { 'Content-Range': 'bytes */0' }).end();
        return;
      }
      if (range) {
        let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
        let end = range[1] === '' || range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
        start = Math.max(start, 0);
        if (start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
          return;
        }
        if (isDemo) served.demo += end - start + 1;
        res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      if (isDemo) served.demo += st.size;
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    });
  });
  const hub = wsModule ? createHub() : null;
  server.on('upgrade', (req, socket, head) => {
    const upgradePath = new URL(req.url, 'http://x').pathname;
    const wss = upgradePath === HUB_PATH && hub ? hub : null;
    if (!wss) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}`,
        served,
        close: () => {
          if (hub) {
            for (const socket of hub.clients) socket.terminate();
            hub.close();
          }
          server.close();
        },
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // node server.mjs [port] [host]; use host 0.0.0.0 to serve other devices on the network
  const port = Number(process.argv[2] || 8080);
  const host = process.argv[3] || '127.0.0.1';
  const { url } = await serve(port, DIST, host);
  console.log(`Serving ${DIST} at ${url}${host === '0.0.0.0' ? ' (and on all network interfaces)' : ''}`);
  console.log(wsModule ? `Network games play through this server (${HUB_PATH})`
    : 'No packet hub (npm install in web/test): no network games');
}
