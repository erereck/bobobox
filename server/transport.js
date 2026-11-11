// Sockets "no estilo Socket.IO" sobre qualquer canal de mensagens.
//
// No modo online (Vercel) não existe servidor: a TV roda o motor do jogo no navegador
// e cada celular conversa com ela por WebRTC. Pra reaproveitar o motor sem mudar nada,
// estes adaptadores imitam a API do Socket.IO que o servidor e os clientes já usam:
//   - EndpointSocket: o lado "servidor" (o que RoomManager.handle recebe)
//   - LinkClient:     o lado "cliente" (o que a TV/celular usam em core.js)
//
// Um "link" é qualquer coisa com { send(msg), onMessage(fn), onClose(fn), close() }.
// Protocolo:  { t: 'e', ev, args, ack? }  evento (com id de ack opcional)
//             { t: 'a', id, args }        resposta de ack

function fire(handlers, ev, args) {
  for (const fn of [...(handlers.get(ev) ?? [])]) {
    try {
      fn(...args);
    } catch (e) {
      console.error(`[transport] erro no handler de "${ev}":`, e);
    }
  }
}

function addHandler(handlers, ev, fn) {
  if (!handlers.has(ev)) handlers.set(ev, []);
  handlers.get(ev).push(fn);
}

/** Lado servidor de uma conexão: o motor (RoomManager/Room) fala com isto como se fosse um socket do Socket.IO. */
export class EndpointSocket {
  /** `remote: true` = conexão vinda da rede (celular): não pode usar comandos de TV. */
  constructor(link, { remote = false } = {}) {
    this.link = link;
    this.remote = remote;
    this.data = {};
    this.rooms = new Set();
    this.connected = true;
    this.handlers = new Map();
    link.onMessage((msg) => this._recv(msg));
    link.onClose(() => this._closed());
  }

  /** No Socket.IO, `volatile` descarta a mensagem se não der pra entregar — aqui é o mesmo emit. */
  get volatile() {
    return this;
  }

  on(ev, fn) {
    addHandler(this.handlers, ev, fn);
    return this;
  }

  emit(ev, ...args) {
    if (!this.connected) return false;
    this.link.send({ t: 'e', ev, args });
    return true;
  }

  join(room) {
    this.rooms.add(room);
  }

  leave(room) {
    this.rooms.delete(room);
  }

  disconnect() {
    this.link.close?.();
    this._closed();
  }

  _recv(msg) {
    if (!this.connected || !msg || msg.t !== 'e' || typeof msg.ev !== 'string') return;
    const args = Array.isArray(msg.args) ? [...msg.args] : [];
    if (msg.ack != null) {
      let done = false;
      args.push((...res) => {
        if (done || !this.connected) return;
        done = true;
        this.link.send({ t: 'a', id: msg.ack, args: res });
      });
    }
    fire(this.handlers, msg.ev, args);
  }

  _closed() {
    if (!this.connected) return;
    this.connected = false;
    fire(this.handlers, 'disconnect', ['transport close']);
  }
}

/** Lado cliente: imita o socket do socket.io-client (on/once/off/emit com ack/timeout/volatile/connected). */
export class LinkClient {
  constructor() {
    this.handlers = new Map();
    this.connected = false;
    this.link = null;
    this.acks = new Map();
    this.nextAck = 1;
    this.queue = [];
    this.volatile = {
      emit: (ev, ...args) => {
        if (this.connected) this.emit(ev, ...args);
        return this;
      },
    };
  }

  on(ev, fn) {
    addHandler(this.handlers, ev, fn);
    return this;
  }

  once(ev, fn) {
    const wrap = (...a) => {
      this.off(ev, wrap);
      fn(...a);
    };
    return this.on(ev, wrap);
  }

  off(ev, fn) {
    const list = this.handlers.get(ev);
    if (!list) return this;
    if (!fn) this.handlers.delete(ev);
    else {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    return this;
  }

  emit(ev, ...args) {
    const msg = { t: 'e', ev, args };
    if (typeof args[args.length - 1] === 'function') {
      const cb = args.pop();
      msg.ack = this.nextAck++;
      this.acks.set(msg.ack, cb);
    }
    if (this.connected && this.link) this.link.send(msg);
    else {
      // como o socket.io, guarda o que foi emitido offline e manda quando reconectar
      this.queue.push(msg);
      if (this.queue.length > 60) this.queue.shift();
    }
    return this;
  }

  /** `socket.timeout(ms).emit(ev, ..., cb)` → cb(err, ...resposta) */
  timeout(ms) {
    return {
      emit: (ev, ...args) => {
        const cb = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cb(new Error('timeout'));
        }, ms);
        this.emit(ev, ...args, (...res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          cb(null, ...res);
        });
        return this;
      },
    };
  }

  /** Liga este cliente a um link aberto (primeira conexão ou reconexão). */
  attach(link) {
    if (this.link && this.link !== link) this.link.close?.();
    this.link = link;
    link.onMessage((msg) => this.link === link && this._recv(msg));
    link.onClose(() => this._down(link));
    this.connected = true;
    const pending = this.queue;
    this.queue = [];
    for (const m of pending) link.send(m);
    fire(this.handlers, 'connect', []);
  }

  _down(link) {
    if (this.link !== link) return;
    this.link = null;
    if (!this.connected) return;
    this.connected = false;
    fire(this.handlers, 'disconnect', ['transport close']);
  }

  _recv(msg) {
    if (!msg) return;
    if (msg.t === 'a') {
      const cb = this.acks.get(msg.id);
      if (!cb) return;
      this.acks.delete(msg.id);
      try {
        cb(...(msg.args ?? []));
      } catch (e) {
        console.error('[transport] erro no ack:', e);
      }
    } else if (msg.t === 'e' && typeof msg.ev === 'string') {
      fire(this.handlers, msg.ev, msg.args ?? []);
    }
  }
}

/**
 * Par de links em memória (a TV conversando com o motor que roda na própria página).
 * Clona via JSON e entrega de forma assíncrona, igual a uma rede de verdade.
 */
export function createLoopback() {
  const make = () => ({
    open: true,
    other: null,
    msgFn: null,
    closeFns: [],
    send(m) {
      if (!this.open) return;
      const copy = JSON.parse(JSON.stringify(m));
      const to = this.other;
      queueMicrotask(() => to.open && to.msgFn?.(copy));
    },
    onMessage(fn) {
      this.msgFn = fn;
    },
    onClose(fn) {
      this.closeFns.push(fn);
    },
    close() {
      for (const side of [this, this.other]) {
        if (!side.open) continue;
        side.open = false;
        for (const fn of side.closeFns) fn();
      }
    },
  });
  const a = make();
  const b = make();
  a.other = b;
  b.other = a;
  return [a, b];
}
