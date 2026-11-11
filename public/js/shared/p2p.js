// Modo online (site estático, ex.: Vercel): não existe servidor de jogo.
//
//  • A TV roda o motor do jogo inteiro no navegador (o mesmo código de server/) e
//    abre um "peer" WebRTC com o id `bobobox-<CÓDIGO>`.
//  • Cada celular conecta direto na TV por WebRTC (PeerJS), usando o servidor público
//    e gratuito do PeerJS só pra se encontrarem (sinalização + STUN/TURN).
//
// Por fora, tudo continua parecendo um socket do Socket.IO, então TV e celular não mudam.

import { EndpointSocket, LinkClient, createLoopback } from '/server/transport.js';

const PREFIX = 'bobobox-';
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

let peerLib = null;
function loadPeerJS() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.peerjs?.Peer) return resolve(window.peerjs.Peer);
    const s = document.createElement('script');
    s.src = '/vendor/peerjs.min.js';
    s.async = true;
    s.onload = () => (window.peerjs?.Peer ? resolve(window.peerjs.Peer) : reject(new Error('PeerJS não carregou')));
    s.onerror = () => reject(new Error('PeerJS não carregou'));
    document.head.append(s);
  });
  return peerLib;
}

function peerOptions() {
  const opts = { debug: 1 };
  const cfg = window.BOBO ?? {};
  if (cfg.peerHost) Object.assign(opts, { host: cfg.peerHost, port: cfg.peerPort ?? 443, path: cfg.peerPath ?? '/', secure: cfg.peerSecure ?? true });
  // Sem iceServers próprios, o PeerJS usa os padrões dele (STUN do Google + TURN do PeerJS).
  if (Array.isArray(cfg.iceServers) && cfg.iceServers.length) opts.config = { iceServers: cfg.iceServers };
  return opts;
}

/** Abre um peer e espera ele registrar no servidor de sinalização. */
async function openPeer(id) {
  const Peer = await loadPeerJS();
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => {
      peer.destroy();
      reject(Object.assign(new Error('Sem resposta do servidor de conexão'), { type: 'timeout' }));
    }, 15_000);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (e) => {
      if (peer.open) return;
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    });
  });
}

/** Mantém o peer registrado na sinalização (pra novos celulares conseguirem achar a TV). */
function keepAlive(peer) {
  let timer = null;
  const retry = () => {
    if (peer.destroyed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (peer.destroyed || !peer.disconnected) return;
      try {
        peer.reconnect();
      } catch {}
      retry();
    }, 2500);
  };
  peer.on('disconnected', retry);
  peer.on('error', (e) => {
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) retry();
  });
  addEventListener('online', retry);
}

/** Embrulha uma DataConnection do PeerJS no formato de "link" do transporte. */
function peerLink(conn) {
  const closeFns = [];
  let closed = false;
  const fireClose = () => {
    if (closed) return;
    closed = true;
    for (const fn of closeFns) fn();
  };
  conn.on('close', fireClose);
  conn.on('error', fireClose);
  // o ICE às vezes demora a avisar que caiu; o estado do RTCPeerConnection avisa antes
  conn.peerConnection?.addEventListener?.('connectionstatechange', () => {
    const st = conn.peerConnection.connectionState;
    if (st === 'failed' || st === 'closed') fireClose();
  });
  return {
    send(m) {
      if (closed || !conn.open) return;
      try {
        conn.send(m);
      } catch (e) {
        console.warn('[p2p] envio falhou', e);
      }
    },
    onMessage(fn) {
      conn.on('data', fn);
    },
    onClose(fn) {
      closeFns.push(fn);
    },
    close() {
      try {
        conn.close();
      } catch {}
      fireClose();
    },
  };
}

// ───────────────────────── TV (anfitriã) ─────────────────────────

/** A TV vira o servidor: motor do jogo local + peer WebRTC esperando os celulares. */
export async function createHostSocket() {
  const { RoomManager } = await import('/server/rooms.js');
  // ?timescale=0.3 acelera tudo (testes automáticos)
  const timeScale = Number(new URLSearchParams(location.search).get('timescale')) || 1;
  const mgr = new RoomManager(null, { allowCodeChoice: true, timeScale });
  const [tvSide, engineSide] = createLoopback();
  mgr.handle(new EndpointSocket(engineSide));

  let peer = null;
  const reserveCode = async () => {
    if (peer && !peer.destroyed) peer.destroy();
    let lastErr = null;
    for (let i = 0; i < 8; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      try {
        peer = await openPeer(PREFIX + code);
      } catch (e) {
        lastErr = e;
        if (e.type === 'unavailable-id') continue; // código já em uso por outra TV no mundo
        throw e;
      }
      keepAlive(peer);
      peer.on('connection', (conn) => {
        conn.on('open', () => mgr.handle(new EndpointSocket(peerLink(conn), { remote: true })));
      });
      return code;
    }
    throw lastErr ?? new Error('Sem códigos livres');
  };

  const socket = new LinkClient();
  const emit = socket.emit.bind(socket);
  socket.emit = (ev, ...args) => {
    if (ev !== 'host:create') return emit(ev, ...args);
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    reserveCode().then(
      (code) => emit('host:create', { code }, ack),
      (e) => ack({ error: `Não deu pra abrir a sala online (${e.type ?? e.message}). Confere a internet e tenta de novo.` }),
    );
    return socket;
  };
  socket.attach(tvSide);
  socket.isHost = true;

  // Recarregar a TV derruba a sala (ela mora aqui). Avisa antes.
  addEventListener('beforeunload', (e) => {
    const busy = [...mgr.rooms.values()].some((r) => [...r.players.values()].some((p) => !p.bot));
    if (busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  return socket;
}

// ───────────────────────── celular ─────────────────────────

/** Celular: conecta direto na TV do código digitado e reconecta sozinho se cair. */
export function createPhoneSocket() {
  const socket = new LinkClient();
  let peer = null;
  let target = null;
  let connecting = null;
  let retryTimer = null;

  const ensurePeer = async () => {
    if (peer && !peer.destroyed && !peer.disconnected) return peer;
    if (peer && !peer.destroyed) peer.destroy();
    peer = await openPeer();
    keepAlive(peer);
    return peer;
  };

  const connectOnce = async () => {
    const p = await ensurePeer();
    return new Promise((resolve, reject) => {
      const conn = p.connect(PREFIX + target, { reliable: true });
      const cleanup = () => {
        clearTimeout(timer);
        p.off('error', onPeerError);
      };
      const fail = (msg) => {
        cleanup();
        try {
          conn.close();
        } catch {}
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('Não deu pra conectar na TV. Confere o código e se a TV está aberta.'), 15_000);
      const onPeerError = (e) => {
        if (e.type === 'peer-unavailable') fail('Sala não encontrada. Confere o código na TV!');
        else if (!p.open) fail('Sem conexão com a internet.');
      };
      p.on('error', onPeerError);
      conn.on('open', () => {
        cleanup();
        const link = peerLink(conn);
        link.onClose(() => scheduleRetry());
        socket.attach(link);
        resolve();
      });
    });
  };

  const connect = () => {
    if (socket.connected) return Promise.resolve();
    if (!connecting) connecting = connectOnce().finally(() => (connecting = null));
    return connecting;
  };

  const scheduleRetry = (delay = 1500) => {
    if (retryTimer || !target) return;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (socket.connected) return;
      try {
        await connect();
      } catch {
        scheduleRetry(Math.min(8000, delay * 1.6));
      }
    }, delay);
  };

  /** Chamado antes do `join`: aponta pra TV do código e conecta. */
  socket.connectTo = async (code) => {
    code = String(code ?? '').toUpperCase();
    if (target !== code && socket.connected) socket.link?.close();
    target = code;
    await connect();
  };

  // Celular dormiu e voltou: reconecta na hora
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && target && !socket.connected) connect().catch(() => scheduleRetry());
  });
  addEventListener('online', () => target && !socket.connected && connect().catch(() => scheduleRetry()));
  return socket;
}
