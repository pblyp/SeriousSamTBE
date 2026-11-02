'use strict';

// Network games between browsers. The engine keeps its own architecture: the player
// who starts a network game runs the server, the others connect to it as clients,
// and the engine's UDP packets (with its own acks and resends) travel through the page
// server's packet hub (a WebSocket that passes them on to the room's other players:
// web/test/server.mjs has one, the site on GitHub Pages doesn't).
//
// Players meet in a "room" named by a short code, which the host gets and shares
// (or a link with it).
//
// The engine sees the other players as made up IPv4 addresses (Engine/Base/Emscripten/
// WebNet.cpp calls open(), join(), send(), receive() and close()).

(() => {
  // (each version of the game its own, see config.js: their players don't meet)
  const roomName = (code) => (self.GameConfig ? GameConfig.netRoomPrefix : '') + code;
  // room codes: no 0/O or 1/I, which are easily mixed up
  const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const CODE_LENGTH = 6;
  // the server, as clients see it, and the clients, as the server sees them
  const HOST_IP = ip(10, 83, 0, 1);
  const FIRST_CLIENT_IP = ip(10, 83, 0, 2);
  const PORT = 25600;
  // how long joining waits for the host
  const JOIN_TIMEOUT_MS = 20000;
  // a congested connection drops packets, like a full UDP buffer (the engine resends)
  const MAX_BUFFERED = 256 * 1024;
  // how long a player whose connection closed may take to come back on a new one before they
  // count as gone
  const LINK_GRACE_MS = 10000;
  const NO_HUB = 'This site can\'t pass network games on: open the game from a server that does '
    + '(see the web version\'s README).';
  const randomId = () => Math.random().toString(36).slice(2);

  function ip(a, b, c, d) {
    return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  }

  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  }

  // "k7q 2mx", "K7Q-2MX" -> "K7Q2MX" (or null if it can't be a code)
  function normalizeCode(text) {
    const code = String(text).toUpperCase().replace(/[\s-]/g, '');
    return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
  }

  const showCode = (code) => `${code.slice(0, 3)}-${code.slice(3)}`;

  // ------------------------------------------------------------------ transports

  // A transport joins a room and reports connections to other players ("links") as
  // they open and close, each with a channel to send bytes on; and messages saying who
  // is the host. A link may be replaced by a new one under the same name.
  //   on('link', (link, peerId, { channel, sendRole }) => ...)
  //   on('unlink', (link, peerId, { left }) => ...)    (left: the player said goodbye)
  //   on('role', (peerId, role) => ...)
  //   leave()
  //   selfId: this player's id (the same in all transports of a game)

  // a transport's events, kept until something listens
  function transportEvents() {
    const handlers = {};
    const pending = [];
    return {
      emit(event, ...args) {
        if (handlers[event]) handlers[event](...args);
        else pending.push([event, args]);
      },
      on(event, fn) {
        handlers[event] = fn;
        for (let i = 0; i < pending.length;) {
          if (pending[i][0] === event) fn(...pending.splice(i, 1)[0][1]);
          else i++;
        }
      },
    };
  }

  // a WebSocket hub that passes every message on to the room's others (the page server's
  // /hub, see web/test/server.mjs), looking like a BroadcastChannel
  function hubBus(url, code) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const bus = { onmessage: null, postMessage: (m) => socket.send(JSON.stringify({ ...m, data: encode(m.data) })), close: () => socket.close() };
      socket.onopen = () => { socket.send(JSON.stringify({ room: roomName(code) })); resolve(bus); };
      socket.onerror = () => reject(new Error(`Cannot reach ${url}`));
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (bus.onmessage) bus.onmessage({ data: { ...m, data: decode(m.data) } });
      };
    });
    function encode(data) {
      return data instanceof Uint8Array ? { bytes: btoa(String.fromCharCode(...data)) } : data;
    }
    function decode(data) {
      return data && data.bytes !== undefined ? Uint8Array.from(atob(data.bytes), (c) => c.charCodeAt(0)).buffer : data;
    }
  }

  // browsers connected to a WebSocket hub (the page's server), or tabs of the same browser
  // (?net=local, a BroadcastChannel per room, for tests)
  async function localTransport(code, hubUrl, selfId = randomId()) {
    const bus = hubUrl ? await hubBus(hubUrl, code) : new BroadcastChannel(`sam-net-${roomName(code)}`);
    const linkName = (peerId) => `${hubUrl ? 'hub' : 'local'}:${peerId}`;
    const events = transportEvents();
    const peers = new Map();
    const post = (to, type, data) => bus.postMessage({ from: selfId, to, type, data });
    function addPeer(peerId) {
      if (peers.has(peerId)) return;
      const channel = { readyState: 'open', bufferedAmount: 0, onmessage: null, onopen: null, onclose: null,
        send: (bytes) => post(peerId, 'data', bytes), close() {} };
      peers.set(peerId, channel);
      events.emit('link', linkName(peerId), peerId, { channel, sendRole: (role) => post(peerId, 'role', role) });
      setTimeout(() => channel.onopen && channel.onopen());
    }
    bus.onmessage = ({ data: m }) => {
      if (m.from === selfId || (m.to && m.to !== selfId)) return;
      // (the reply first: the peer must know us before anything else arrives)
      if (m.type === 'hello') { post(m.from, 'hello-back'); addPeer(m.from); }
      if (m.type === 'hello-back') addPeer(m.from);
      if (m.type === 'role') events.emit('role', m.from, m.data);
      if (m.type === 'data') { const channel = peers.get(m.from); if (channel && channel.onmessage) channel.onmessage({ data: m.data }); }
      if (m.type === 'bye') { peers.delete(m.from); events.emit('unlink', linkName(m.from), m.from, { left: true }); }
    };
    setTimeout(() => post(null, 'hello'));
    return {
      on: events.on,
      leave() { post(null, 'bye'); bus.close(); },
      selfId,
    };
  }

  // ------------------------------------------------------------------ netplay

  //   services(): -> Promise<{ hub }>: what the page's server offers (its packet hub's URL),
  //     if anything
  //   hub: instead of the page server's
  //   transport: 'local' for tests (a BroadcastChannel, or the hub), or a function
  //     (code, options) -> Promise<transport>
  //   linkGraceMs: see LINK_GRACE_MS
  //   log(text), onChange(netplay): to tell the player what is going on
  function create({ services = async () => ({}), hub = null, transport = null, linkGraceMs = LINK_GRACE_MS,
    log = () => {}, onChange = () => {} } = {}) {
    let room = null;
    let roomStarting = null;
    let isHost = false;
    let nextClientIp = FIRST_CLIENT_IP;
    // the other players: peerId -> { peerId, ip, isHost, links: Map(link -> { channel, sendRole }), graceTimer }
    const peers = new Map();
    const byIp = new Map();     // ip -> player
    const inbox = [];
    const departed = [];        // addresses of players whose connection is gone

    const netplay = {
      active: false,   // a network game is on (hosted or joined)
      code: null,      // the room's code
      role: null,      // 'host' or 'client'
      state: '',       // what is going on, for the page: 'hosting', 'joining', 'joined', 'host-left',
                       // 'failed' (joining didn't work, see error), ''
      error: '',
      players: 0,      // other players connected
      joinStarted: 0,  // when joining started (Date.now())
      via: '',         // how a joined player reaches the host: 'through this page's server'

      // the engine opens its "socket": the server starts a room, a client waits for join()
      open(server) {
        this.close();
        this.state = '';
        this.error = '';
        isHost = !!server;
        this.role = isHost ? 'host' : 'client';
        if (isHost) {
          this.code = newCode();
          this.active = true;
          this.state = 'hosting';
          log(`Hosting a network game, room code ${showCode(this.code)}`);
          startRoom(this.code).catch((e) => {
            // (the game goes on, but nobody can join: say why)
            this.state = 'failed';
            this.error = e.message || String(e);
            log(`Network game: ${this.error}`);
            onChange(this);
          });
          onChange(this);
        }
        return true;
      },

      // join the game hosted with that code: resolves to the host's address
      async join(text) {
        const code = normalizeCode(text);
        if (!code) {
          throw new Error(`"${text}" is not a room code. Room codes look like K7Q-2MX: ask the player who started the game.`);
        }
        this.code = code;
        this.active = true;
        this.state = 'joining';
        this.error = '';
        this.joinStarted = Date.now();
        onChange(this);
        log(`Looking for the game in room ${showCode(code)}`);
        try {
          await startRoom(code);
          await new Promise((resolve, reject) => {
            const started = Date.now();
            let shownSeconds = 0;
            const check = setInterval(() => {
              const host = [...peers.values()].find((peer) => peer.isHost && openChannel(peer));
              // (the page shows how long it has been looking)
              const seconds = Math.floor((Date.now() - started) / 1000);
              if (seconds !== shownSeconds) {
                shownSeconds = seconds;
                onChange(netplay);
              }
              if (host) {
                clearInterval(check);
                resolve();
              } else if (Date.now() - started > JOIN_TIMEOUT_MS) {
                clearInterval(check);
                reject(new Error(`No game was found in room ${showCode(code)}. Check the code, and that the game is still running.`));
              }
            }, 100);
          });
        } catch (e) {
          this.close();
          // (shown until the next game, though the engine closes its side now)
          this.state = 'failed';
          this.error = e.message || String(e);
          onChange(this);
          throw e;
        }
        this.state = 'joined';
        onChange(this);
        log(`Connected to the game in room ${showCode(code)}`);
        return HOST_IP;
      },

      send(toIp, port, bytes) {
        const peer = byIp.get(toIp);
        const channel = peer && openChannel(peer);
        if (!channel || channel.bufferedAmount > MAX_BUFFERED) return;
        try {
          channel.send(bytes);
        } catch (e) {
          // closing: lost, like a UDP packet
        }
      },

      receive() {
        return inbox.shift() || null;
      },

      // the address of a player who left (their connection closed), or 0
      takeDeparted() {
        return departed.shift() || 0;
      },

      close() {
        if (room) room.leave();
        room = null;
        roomStarting = null;
        for (const peer of peers.values()) clearTimeout(peer.graceTimer);
        peers.clear();
        byIp.clear();
        inbox.length = 0;
        departed.length = 0;
        nextClientIp = FIRST_CLIENT_IP;
        const wasActive = this.active;
        this.active = false;
        this.code = null;
        if (this.state !== 'failed') this.state = '';
        this.players = 0;
        this.via = '';
        if (wasActive) onChange(this);
      },

      showCode,
      normalizeCode,
    };

    // a channel that can carry the player's packets now, if any (it says when that changes)
    function openChannel(peer) {
      let route = null;
      for (const [link, { channel }] of peer.links) {
        if (channel.readyState === 'open') {
          route = [link, channel];
          break;
        }
      }
      const via = route ? (route[0].startsWith('hub:') ? 'through this page\'s server' : 'in this browser') : null;
      if (via && via !== peer.via) {
        peer.via = via;
        log(`Network game: connected to ${peer.isHost ? 'the host' : 'a player'} ${via}`);
        if (peer.isHost) {
          netplay.via = via;
          onChange(netplay);
        }
      }
      return route ? route[1] : null;
    }

    function countPlayers() {
      netplay.players = [...peers.values()]
        .filter((peer) => (isHost ? peer.ip : peer.isHost) && (openChannel(peer) || peer.graceTimer))
        .length;
      onChange(netplay);
    }

    function startRoom(code) {
      if (!roomStarting) {
        const starting = typeof transport === 'function' ? transport(code, { log })
          : transport === 'local' ? localTransport(code, hub) : hubTransport(code);
        roomStarting = starting.then((r) => {
          room = r;
          r.on('link', onLink);
          r.on('unlink', (link, peerId, { left }) => {
            const peer = peers.get(peerId);
            if (peer) linkGone(peer, link, peer.links.get(link), left);
          });
          r.on('role', (peerId, role) => {
            const peer = getPeer(peerId);
            if (role === 'host' && !isHost && !peer.isHost) {
              peer.isHost = true;
              peer.ip = HOST_IP;
              byIp.set(HOST_IP, peer);
              countPlayers();
            }
          });
        });
      }
      return roomStarting;
    }

    // through the page server's hub
    async function hubTransport(code) {
      const found = (await services().catch(() => null)) || {};
      const hubUrl = hub || found.hub || null;
      if (!hubUrl) throw new Error(NO_HUB);
      const part = await localTransport(code, hubUrl);
      log(`Network game: through this page's server (${hubUrl})`);
      return part;
    }

    function getPeer(peerId) {
      let peer = peers.get(peerId);
      if (!peer) {
        peer = { peerId, ip: 0, isHost: false, links: new Map(), graceTimer: 0, via: null };
        peers.set(peerId, peer);
        // (the server knows each player by an address of their own)
        if (isHost) {
          peer.ip = nextClientIp++;
          byIp.set(peer.ip, peer);
        }
      }
      return peer;
    }

    // a connection to a player opened: the first, or one replacing a connection that is going away
    function onLink(link, peerId, conn) {
      const peer = getPeer(peerId);
      const old = peer.links.get(link);
      if (old && old.channel !== conn.channel) {
        old.channel.onclose = null;
        try { old.channel.close(); } catch (e) { /* gone already */ }
      }
      peer.links.set(link, conn);
      const { channel, sendRole } = conn;
      channel.onmessage = (e) => {
        // the host takes packets from everyone, clients only from the host
        if (!peer.ip || (!isHost && !peer.isHost)) return;
        inbox.push({ ip: peer.ip, port: PORT, bytes: new Uint8Array(e.data) });
        if (inbox.length > 4096) inbox.shift();
      };
      const opened = () => {
        if (peer.graceTimer) log('Network game: the connection to a player is back');
        clearTimeout(peer.graceTimer);
        peer.graceTimer = 0;
        if (isHost) sendRole('host');
        countPlayers();
      };
      if (channel.readyState === 'open') opened();
      else channel.onopen = opened;
      channel.onclose = () => linkGone(peer, link, conn, false);
    }

    // a connection to a player closed: they are gone when none comes back soon (or right
    // away if they said goodbye)
    function linkGone(peer, link, conn, left) {
      if (!conn || peer.links.get(link) !== conn) return;
      peer.links.delete(link);
      if (openChannel(peer)) return;
      clearTimeout(peer.graceTimer);
      if (left) {
        playerGone(peer);
        return;
      }
      log(`Network game: lost the connection to a player (${link}), waiting ${linkGraceMs / 1000} s for it to come back`);
      peer.graceTimer = setTimeout(() => {
        peer.graceTimer = 0;
        if (!openChannel(peer)) playerGone(peer);
      }, linkGraceMs);
      countPlayers();
    }

    function playerGone(peer) {
      if (peers.get(peer.peerId) !== peer) return;
      peers.delete(peer.peerId);
      for (const { channel } of peer.links.values()) {
        channel.onclose = null;
        try { channel.close(); } catch (e) { /* gone already */ }
      }
      if (byIp.get(peer.ip) === peer) {
        byIp.delete(peer.ip);
        departed.push(peer.ip);
      }
      if (peer.isHost && netplay.state === 'joined') {
        netplay.state = 'host-left';
        log('The host has left the game');
      }
      countPlayers();
    }

    return netplay;
  }

  window.NetPlay = { create, normalizeCode, showCode };
})();
