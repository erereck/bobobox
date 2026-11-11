// Sala: jogadores, plateia, TV (host), maratona e o jogo atual.

import { ABORT, publicReq } from './game.js';
import { GAMES, gameById, catalog } from './games/index.js';
import { Bots } from './bots.js';
import { Deck, clean, pick, rand, rankEntries, sample, sanitizeDrawing, uid } from './util.js';

export const COLORS = [
  '#ff3d7f', '#2ec4ff', '#ffd23f', '#3ddc84', '#ff8a3d', '#a77bff',
  '#ff5c5c', '#1fe0c8', '#ff7ce5', '#b8f33d', '#5c7cff', '#ffb36b',
];
const PARTY_POINTS = [1000, 750, 560, 420, 320, 240, 180, 130, 90, 60, 40, 20];
const REACTIONS = ['😂', '🔥', '😱', '👏', '💀', '🤡', '😍', '🤔', '🍅', '💩'];

export class Room {
  constructor(mgr, code) {
    this.mgr = mgr;
    this.code = code;
    this.hostToken = uid(16);
    this.hostSocket = null;
    this.lastSeen = Date.now();
    this.players = new Map();
    this.audience = new Map();
    this.settings = {
      family: false, // esconde conteúdo apimentado
      extraTime: false, // cronômetros 60% mais longos
      audience: true, // permite plateia
      hideCode: false, // modo streamer
      maxPlayers: 12,
    };
    this.scene = 'lobby';
    this.game = null;
    this.lastGameId = null;
    this.result = null;
    this.party = null;
    this.timeScale = mgr.timeScale;
    this.decks = new Map();
    this.sayState = null;
    this._sayId = 0;
    this._fxId = 0;
    this._dirty = null;
    this._flow = null;
    this._reactAt = new Map();
    this.bots = new Bots(this);
    this.gameSeq = 0;
    this.custom = { bateboca: [], garrancho: [] }; // piadas internas cadastradas na TV
  }

  // ───────────────────────── baralhos de conteúdo ─────────────────────────

  /** Baralho persistente por sala (não repete prompt entre partidas). */
  deck(key, items) {
    let d = this.decks.get(key);
    if (!d) this.decks.set(key, (d = new Deck(items)));
    return d;
  }

  /** Baralho das piadas internas de um jogo (ou null se não houver). */
  customDeck(game) {
    const list = this.custom[game] ?? [];
    return list.length ? this.deck(`custom:${game}`, list) : null;
  }

  /** Filtra itens marcados como adultos quando o Modo Família tá ligado. */
  familyFilter(items) {
    return this.settings.family ? items.filter((x) => !x?.adult) : items;
  }

  // ───────────────────────── jogadores ─────────────────────────

  activePlayers() {
    return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  get humanCount() {
    return [...this.players.values()].filter((p) => !p.bot).length;
  }

  nextColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) ?? pick(COLORS);
  }

  addPlayer({ name, bot = false, socket = null }) {
    const p = {
      id: uid(8),
      token: uid(20),
      name,
      color: this.nextColor(),
      face: rand(1_000_000),
      avatar: null,
      av: 0,
      bot,
      socket,
      connected: !!socket || bot,
      joinedAt: Date.now() + this.players.size,
      leftAt: 0,
    };
    this.players.set(p.id, p);
    this.updateVip();
    this.changed();
    this.fx('join', { id: p.id });
    return p;
  }

  removePlayer(id, reason) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.socket) {
      p.socket.emit('kicked', { reason });
      p.socket.data.player = null;
    }
    this.updateVip();
    this.changed();
  }

  updateVip() {
    const humans = this.activePlayers().filter((p) => !p.bot);
    const cur = this.players.get(this.vipId);
    if (cur && cur.connected && !cur.bot) return;
    const next = humans.find((p) => p.connected) ?? humans[0];
    this.vipId = next?.id ?? null;
  }

  nameTaken(name, exceptId) {
    const n = name.toLowerCase();
    return [...this.players.values()].some((p) => p.id !== exceptId && p.name.toLowerCase() === n);
  }

  canJoinAsPlayer() {
    return this.scene !== 'game' && this.players.size < this.settings.maxPlayers;
  }

  /** Entrada de um celular. Retorna o payload do ack. */
  join(socket, { name, token, asAudience }) {
    // Reconexão por token
    if (token) {
      const p = [...this.players.values()].find((x) => x.token === token);
      if (p) return this.attach(p, socket);
    }
    name = clean(name, 14);
    if (!name) return { error: 'Coloca um nome!' };
    // Mesmo nome de alguém desconectado: assume o lugar (trocou de celular / limpou o navegador)
    const ghost = [...this.players.values()].find((x) => !x.bot && !x.connected && x.name.toLowerCase() === name.toLowerCase());
    if (ghost) return this.attach(ghost, socket);

    if (!asAudience && this.canJoinAsPlayer()) {
      if (this.nameTaken(name)) return { error: 'Esse nome já tá em uso nessa sala' };
      const p = this.addPlayer({ name, socket });
      return this.attach(p, socket);
    }
    if (!this.settings.audience) {
      return { error: this.scene === 'game' ? 'Partida em andamento — espera acabar!' : 'Sala lotada!' };
    }
    const aud = { id: uid(8), name, socket };
    this.audience.set(aud.id, aud);
    socket.data.room = this;
    socket.data.audience = aud;
    socket.join(`aud:${this.code}`);
    socket.join(`room:${this.code}`);
    socket.emit('avatars', this.avatarMap());
    this.changed();
    return { ok: true, audience: true, id: aud.id, code: this.code, catalog };
  }

  attach(p, socket) {
    if (p.socket && p.socket !== socket) {
      p.socket.emit('kicked', { reason: 'Você entrou em outro aparelho.' });
      p.socket.data.player = null;
    }
    p.socket = socket;
    p.connected = true;
    p.leftAt = 0;
    socket.data.room = this;
    socket.data.player = p;
    socket.join(`room:${this.code}`);
    this.updateVip();
    this.changed();
    socket.emit('avatars', this.avatarMap());
    return { ok: true, id: p.id, token: p.token, code: this.code, catalog };
  }

  /** Plateia que quer virar jogador quando volta pro lobby. */
  promoteAudience(aud) {
    if (!this.canJoinAsPlayer()) return { error: 'Sem vaga ou partida rolando' };
    let name = aud.name;
    if (this.nameTaken(name)) name = `${name.slice(0, 11)}${rand(90) + 10}`;
    this.audience.delete(aud.id);
    aud.socket.leave(`aud:${this.code}`);
    aud.socket.data.audience = null;
    const p = this.addPlayer({ name, socket: aud.socket });
    return this.attach(p, aud.socket);
  }

  disconnect(socket) {
    const p = socket.data.player;
    if (p && p.socket === socket) {
      p.connected = false;
      p.socket = null;
      p.leftAt = Date.now();
      this.updateVip();
      this.changed();
    }
    const aud = socket.data.audience;
    if (aud) {
      this.audience.delete(aud.id);
      this.changed();
    }
    if (this.hostSocket === socket) {
      this.hostSocket = null;
      this.lastSeen = Date.now();
      if (this.game && !this.game.paused) {
        this.game.pause();
        this.autoPaused = true;
      }
    }
  }

  /** Limpeza periódica (chamada pelo gerenciador). */
  sweep() {
    const now = Date.now();
    if (this.scene === 'lobby') {
      for (const p of this.players.values()) {
        if (!p.bot && !p.connected && now - p.leftAt > 120_000) this.removePlayer(p.id);
      }
    }
  }

  isAbandoned() {
    const anyone = this.hostSocket || [...this.players.values()].some((p) => p.connected && !p.bot);
    if (anyone) {
      this.lastSeen = Date.now();
      return false;
    }
    return Date.now() - this.lastSeen > 20 * 60_000;
  }

  avatarMap() {
    const out = {};
    for (const p of this.players.values()) if (p.avatar) out[p.id] = { av: p.av, d: p.avatar };
    return out;
  }

  setAvatar(p, drawing) {
    const d = sanitizeDrawing(drawing);
    p.avatar = d.s.length ? d : null;
    p.av++;
    const payload = { [p.id]: { av: p.av, d: p.avatar } };
    for (const x of this.players.values()) x.socket?.emit('avatars', payload);
    for (const x of this.audience.values()) x.socket?.emit('avatars', payload);
    this.hostSocket?.emit('avatars', payload);
    this.changed();
  }

  // ───────────────────────── narração, efeitos, avisos ─────────────────────────

  say(text, mood = 'normal') {
    this.sayState = { id: ++this._sayId, text, mood };
    this.changed();
  }

  fx(type, data) {
    this.flush();
    this.hostSocket?.emit('fx', { id: ++this._fxId, type, data });
  }

  toast(p, msg) {
    p?.socket?.emit('toast', { msg });
  }

  react(p, e) {
    if (!REACTIONS.includes(e)) return;
    const now = Date.now();
    if (now - (this._reactAt.get(p.id) ?? 0) < 600) return;
    this._reactAt.set(p.id, now);
    this.fx('react', { id: p.id, e, color: p.color });
  }

  // ───────────────────────── fluxo da sala ─────────────────────────

  /** Agenda algo da sala (resultado → próximo jogo). Pular executa na hora. */
  after(ms, fn) {
    this.cancelFlow();
    const f = { fn, timer: setTimeout(() => this.runFlow(f), ms * this.timeScale), end: Date.now() + ms * this.timeScale };
    this._flow = f;
  }
  runFlow(f) {
    if (this._flow !== f) return;
    clearTimeout(f.timer);
    this._flow = null;
    f.fn();
  }
  cancelFlow() {
    if (this._flow) clearTimeout(this._flow.timer);
    this._flow = null;
  }

  eligibleGames() {
    const n = this.players.size;
    return GAMES.filter((G) => n >= G.meta.min && n <= G.meta.max);
  }

  startGame(gameId) {
    const G = gameById[gameId];
    if (!G) return { error: 'Jogo desconhecido' };
    const n = this.players.size;
    if (n < G.meta.min) return { error: `${G.meta.name} precisa de pelo menos ${G.meta.min} jogadores` };
    if (n > G.meta.max) return { error: `${G.meta.name} aceita no máximo ${G.meta.max} jogadores` };
    this.cancelFlow();
    this.stopGame();
    const game = new G(this);
    this.game = game;
    this.lastGameId = gameId;
    this.scene = 'game';
    this.result = null;
    this.gameSeq++;
    this.sayState = null;
    this.changed();
    this.runGame(game);
    return { ok: true };
  }

  async runGame(game) {
    try {
      await game.run();
    } catch (e) {
      if (e === ABORT) return;
      console.error(`[${this.code}] erro no jogo ${game.meta.id}:`, e);
      if (this.game === game) {
        this.game = null;
        this.scene = 'lobby';
        this.say('Opa, deu um tilt aqui nos meus circuitos. Voltando pro menu!');
        this.changed();
      }
      return;
    }
    if (this.game !== game) return;
    this.finishGame(game);
  }

  finishGame(game) {
    const ranking = game.ranking();
    let awards = [];
    try {
      awards = (game.awards() ?? []).filter(Boolean);
    } catch (e) {
      console.error(e);
    }
    this.result = { gameId: game.meta.id, ranking, awards, seq: this.gameSeq, gallery: (game.gallery ?? []).slice(0, 24) };
    this.game = null;
    this.scene = 'results';
    const winner = ranking[0];
    if (winner) this.say(`${this.players.get(winner.id)?.name ?? 'Alguém'} venceu o ${game.meta.name}!`, 'party');
    this.fx('confetti', {});

    if (this.party) {
      const P = this.party;
      for (const e of ranking) {
        const pts = PARTY_POINTS[e.rank - 1] ?? 10;
        P.totals.set(e.id, (P.totals.get(e.id) ?? 0) + pts);
      }
      P.played.push({ gameId: game.meta.id, winner: winner?.id, awards });
      P.index++;
      this.result.party = this.partyStandings();
      this.result.partyNext = P.queue[P.index] ?? null;
      this.result.partyEnd = Date.now() + 22_000 * this.timeScale;
      this.after(22_000, () => this.advanceParty());
    }
    this.changed();
  }

  partyStandings() {
    if (!this.party) return null;
    return rankEntries([...this.players.keys()].map((id) => ({ id, score: this.party.totals.get(id) ?? 0 })));
  }

  startParty(count = 4) {
    const eligible = this.eligibleGames().map((G) => G.meta.id);
    if (eligible.length < 2) return { error: 'Precisa de mais gente pra maratona!' };
    // Evita dois jogos de desenho seguidos e começa com algo leve
    let queue = sample(eligible, Math.min(count, eligible.length));
    const light = queue.findIndex((id) => gameById[id].meta.warmup);
    if (light > 0) [queue[0], queue[light]] = [queue[light], queue[0]];
    this.party = { queue, index: 0, totals: new Map(), played: [] };
    this.say('MARATONA BOBOBOX! Vários jogos seguidos, um campeão no final. Que comecem os jogos!', 'party');
    return this.startGame(queue[0]);
  }

  advanceParty() {
    const P = this.party;
    if (!P) return;
    if (P.index < P.queue.length) {
      const id = P.queue[P.index];
      const res = this.startGame(id);
      if (res?.error) {
        P.index++;
        return this.advanceParty();
      }
      return;
    }
    // Grande final
    const standings = this.partyStandings();
    const awards = P.played.flatMap((x) => x.awards).filter(Boolean);
    this.result = { party: standings, final: true, awards: sample(awards, Math.min(6, awards.length)), played: P.played.map((x) => x.gameId) };
    this.scene = 'partyFinal';
    const champ = standings[0];
    this.say(`E o grande campeão da Maratona Bobobox é... ${this.players.get(champ?.id)?.name ?? 'ninguém'}!`, 'party');
    this.fx('confetti', { big: true });
    this.party = null;
    this.changed();
  }

  stopGame() {
    if (this.game) {
      this.game.abort();
      this.game = null;
    }
  }

  toMenu() {
    this.cancelFlow();
    this.stopGame();
    this.party = null;
    this.scene = 'lobby';
    this.result = null;
    this.changed();
  }

  skip() {
    if (this.scene === 'game') this.game?.skip();
    else if (this._flow) this.runFlow(this._flow);
  }

  // ───────────────────────── comandos ─────────────────────────

  hostCommand(cmd, data = {}) {
    switch (cmd) {
      case 'start':
        return this.startGame(data.gameId);
      case 'party':
        return this.startParty(Number(data.count) || 4);
      case 'again':
        return this.lastGameId ? this.startGame(this.lastGameId) : { error: 'Nenhum jogo anterior' };
      case 'menu':
        return this.toMenu();
      case 'skip':
        return this.skip();
      case 'pause':
        return this.game?.pause();
      case 'resume':
        return this.game?.resume();
      case 'kick':
        return this.removePlayer(data.id, 'Você foi removido da sala.');
      case 'settings': {
        for (const k of ['family', 'extraTime', 'audience', 'hideCode']) if (k in data) this.settings[k] = !!data[k];
        if ('maxPlayers' in data) this.settings.maxPlayers = Math.max(2, Math.min(16, Number(data.maxPlayers) || 12));
        return this.changed();
      }
      case 'custom': {
        if (!(data.game in this.custom)) return { error: 'Jogo inválido' };
        const list = (Array.isArray(data.list) ? data.list : []).map((t) => clean(t, 110)).filter((t) => t.length >= 3);
        this.custom[data.game] = [...new Set(list)].slice(0, 150);
        this.decks.delete(`custom:${data.game}`);
        return { ok: true, count: this.custom[data.game].length };
      }
      case 'bots':
        return this.bots.add(Math.max(1, Math.min(10, Number(data.n) || 1)));
      case 'demo': {
        // Modo demo: completa a mesa com Bobôs e solta uma maratona pra assistir
        const need = Math.max(0, 6 - this.players.size);
        if (need) this.bots.add(need);
        this.say('Modo demonstração! Os Bobôs vão jogar pra vocês verem como funciona. Podem entrar pelo celular quando quiserem.', 'party');
        return this.startParty(Number(data.count) || 3);
      }
      case 'clearBots':
        return this.bots.clear();
      case 'game':
        return this.game?.hostInput?.(data);
      default:
        return { error: 'Comando desconhecido' };
    }
  }

  playerAct(p, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'react':
        return this.react(p, msg.e);
      case 'avatar':
        if (this.scene !== 'game') this.setAvatar(p, msg.d);
        return;
      case 'vip': {
        if (p.id !== this.vipId) return;
        const allowed = ['start', 'party', 'again', 'menu', 'skip', 'pause', 'resume', 'settings'];
        if (!allowed.includes(msg.cmd)) return;
        const res = this.hostCommand(msg.cmd, msg);
        if (res?.error) this.toast(p, res.error);
        return;
      }
      default:
        if (this.game && this.game.ids.includes(p.id)) this.game.input(p, msg);
    }
  }

  audienceAct(aud, msg) {
    if (msg?.t === 'promote') {
      const res = this.promoteAudience(aud);
      aud.socket.emit('promoted', res);
      return;
    }
    if (msg?.t === 'react') return;
    this.game?.audienceInput(aud, msg);
  }

  // ───────────────────────── sincronização ─────────────────────────

  changed() {
    if (this._dirty) return;
    this._dirty = setTimeout(() => {
      this._dirty = null;
      this.broadcast();
    }, 20);
  }

  flush() {
    if (!this._dirty) return;
    clearTimeout(this._dirty);
    this._dirty = null;
    this.broadcast();
  }

  publicPlayers() {
    return this.activePlayers().map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      face: p.face,
      av: p.av,
      bot: p.bot,
      on: p.connected,
      vip: p.id === this.vipId,
    }));
  }

  gameHeader(g) {
    return {
      id: g.meta.id,
      phase: g.phase,
      phaseId: g.phaseId,
      rule: g.phase === 'rules' ? g.pd.i : undefined,
      timer: g.timer,
      paused: g.paused,
      pending: g.pendingIds(),
      scores: Object.fromEntries(g.scores),
    };
  }

  broadcast() {
    const now = Date.now();
    const players = this.publicPlayers();
    const roomInfo = {
      code: this.code,
      scene: this.scene,
      players,
      vipId: this.vipId,
      settings: this.settings,
      audienceCount: this.audience.size,
      party: this.party ? { queue: this.party.queue, index: this.party.index, totals: Object.fromEntries(this.party.totals) } : null,
      lastGameId: this.lastGameId,
      flowEnd: this._flow?.end ?? null,
    };
    const g = this.game;
    const header = g ? this.gameHeader(g) : null;

    if (this.hostSocket) {
      let view = null;
      try {
        view = g ? g.hostView() : null;
      } catch (e) {
        console.error('hostView', e);
      }
      this.hostSocket.emit('state', {
        now,
        room: roomInfo,
        game: g ? { ...header, view } : null,
        result: this.result,
        say: this.sayState,
      });
    }

    for (const p of this.players.values()) {
      if (!p.socket) continue;
      let view = null;
      if (g && g.ids.includes(p.id)) {
        try {
          view = g.playerView(p) ?? {};
          if (view.req) view.req = publicReq(view.req);
        } catch (e) {
          console.error('playerView', e);
          view = {};
        }
      }
      p.socket.emit('state', {
        now,
        me: { id: p.id, name: p.name, color: p.color, face: p.face, av: p.av, vip: p.id === this.vipId },
        room: roomInfo,
        game: g ? { ...header, inGame: g.ids.includes(p.id), view } : null,
        result: this.result,
      });
    }

    if (this.audience.size) {
      let view = null;
      if (g) {
        try {
          view = g.audienceView() ?? {};
          if (view.req) view.req = publicReq(view.req);
        } catch (e) {
          console.error('audienceView', e);
        }
      }
      for (const aud of this.audience.values()) {
        aud.socket.emit('state', {
          now,
          me: { id: aud.id, name: aud.name, audience: true, voted: g?.avotes.has(aud.id) ?? false },
          room: roomInfo,
          game: g ? { ...header, view } : null,
          result: this.result,
        });
      }
    }
    this.bots.tick();
  }
}
