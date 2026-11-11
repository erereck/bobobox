// Gerenciador de salas + roteamento de eventos do Socket.IO.

import { Room } from './room.js';
import { catalog } from './games/index.js';

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

export class RoomManager {
  constructor(io, { timeScale = 1, allowCodeChoice = false } = {}) {
    this.io = io;
    this.timeScale = timeScale;
    this.allowCodeChoice = allowCodeChoice; // modo online: a TV escolhe o código (é o id dela na rede P2P)
    this.rooms = new Map();
    setInterval(() => this.sweep(), 15_000).unref?.();
  }

  newCode() {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('sem códigos livres');
  }

  /** Cria uma sala. No modo online a TV já reservou o código na rede P2P e passa ele aqui. */
  create(code) {
    const wanted = typeof code === 'string' && /^[A-Z]{4}$/.test(code) && !this.rooms.has(code) ? code : null;
    const room = new Room(this, wanted ?? this.newCode());
    this.rooms.set(room.code, room);
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      room.sweep();
      if (room.isAbandoned()) {
        room.toMenu();
        room.bots.clear();
        this.rooms.delete(code);
      }
    }
  }

  attachHost(room, socket) {
    if (room.hostSocket && room.hostSocket !== socket) room.hostSocket.emit('kicked', { reason: 'A TV foi aberta em outra aba.' });
    room.hostSocket = socket;
    socket.data.room = room;
    socket.data.host = true;
    socket.emit('avatars', room.avatarMap());
    if (room.autoPaused) {
      room.autoPaused = false;
      room.game?.resume();
    }
    room.changed();
  }

  handle(socket) {
    socket.on('time', (ack) => typeof ack === 'function' && ack(Date.now()));

    // No modo online os celulares chegam por WebRTC até a TV: só a própria TV (loopback) é anfitriã.
    const canHost = !socket.remote;

    socket.on('host:create', (data, ack) => {
      if (!canHost) return ack?.({ error: 'Só a TV pode criar sala' });
      const room = this.create(this.allowCodeChoice ? data?.code : undefined);
      this.attachHost(room, socket);
      ack?.({ ok: true, code: room.code, token: room.hostToken, catalog });
    });

    socket.on('host:resume', (data = {}, ack) => {
      if (!canHost) return ack?.({ error: 'Sala não encontrada' });
      const room = this.rooms.get(String(data.code ?? '').toUpperCase());
      if (!room || room.hostToken !== data.token) return ack?.({ error: 'Sala não encontrada' });
      this.attachHost(room, socket);
      ack?.({ ok: true, code: room.code, token: room.hostToken, catalog });
    });

    socket.on('host:cmd', (data = {}, ack) => {
      if (!canHost) return ack?.({ error: 'Você não é a TV dessa sala' });
      const room = socket.data.room;
      if (!socket.data.host || !room || room.hostSocket !== socket) return ack?.({ error: 'Você não é a TV dessa sala' });
      const { cmd, ...rest } = data;
      let res;
      try {
        res = room.hostCommand(cmd, rest);
      } catch (e) {
        console.error(e);
        res = { error: 'Erro interno' };
      }
      ack?.(res ?? { ok: true });
    });

    socket.on('join', (data = {}, ack) => {
      const code = String(data.code ?? '').toUpperCase().trim();
      const room = this.rooms.get(code);
      if (!room) return ack?.({ error: 'Sala não encontrada. Confere o código na TV!' });
      const prev = socket.data.room;
      if (prev && prev !== room) prev.disconnect(socket);
      const res = room.join(socket, data);
      ack?.(res);
    });

    socket.on('act', (msg) => {
      const room = socket.data.room;
      if (!room) return;
      try {
        if (socket.data.player) room.playerAct(socket.data.player, msg);
        else if (socket.data.audience) room.audienceAct(socket.data.audience, msg);
      } catch (e) {
        console.error('act', e);
      }
    });

    // Entrada em tempo real (joystick) vai direto pra TV, sem passar pela lógica do jogo.
    socket.on('in', (msg) => {
      const room = socket.data.room;
      const p = socket.data.player;
      if (!room || !p || !room.hostSocket || !msg) return;
      room.hostSocket.volatile.emit('in', { id: p.id, x: +msg.x || 0, y: +msg.y || 0, b: msg.b ? 1 : 0 });
    });

    socket.on('disconnect', () => socket.data.room?.disconnect(socket));
  }
}
