// Classe base de todos os minigames.
//
// Cada jogo é um roteiro assíncrono (`async run()`) que vai trocando de fase,
// pedindo coisas pros celulares e esperando. Toda espera passa por `waitFor`,
// o que dá de graça: pular (host/VIP), pausar, tempo estendido e aborto limpo.

import { clean, clamp, pick, rankEntries, sanitizeDrawing, drawingIsEmpty } from './util.js';
import botContent from '../content/bots.js';

export const ABORT = Symbol('abort');

export class Game {
  static meta = { id: 'base', name: 'Base', min: 1, max: 99 };

  constructor(room, opts = {}) {
    this.room = room;
    this.opts = opts;
    this.ids = room.activePlayers().map((p) => p.id);
    this.phase = 'intro';
    this.phaseId = 0;
    this.pd = {};
    this.timer = null; // { end, total } só quando é tempo de responder
    this.paused = false;
    this.aborted = false;
    this.scores = new Map(this.ids.map((id) => [id, 0]));
    this.stats = new Map(this.ids.map((id) => [id, {}]));
    this.reqs = new Map(); // playerId -> request pendente
    this.areq = null; // request da plateia
    this.avotes = new Map(); // audienceId -> valor
    this._wait = null;
    this._rid = 0;
    this.gallery = []; // desenhos da partida: { by, d, title }
  }

  get meta() {
    return this.constructor.meta;
  }
  get players() {
    return this.ids.map((id) => this.room.players.get(id)).filter(Boolean);
  }
  player(id) {
    return this.room.players.get(id);
  }
  name(id) {
    return this.room.players.get(id)?.name ?? '???';
  }

  // ───────────────────────── tempo ─────────────────────────

  /** Espera genérica. `check` encerra mais cedo; `input` mostra cronômetro e respeita tempo extra. */
  waitFor(base, check = null, { input = false } = {}) {
    const scale = this.room.timeScale * (input && this.room.settings.extraTime ? 1.6 : 1);
    const total = Math.max(50, base * scale);
    return new Promise((resolve, reject) => {
      if (this.aborted) return reject(ABORT);
      const w = {
        check,
        input,
        total,
        end: Date.now() + total,
        remaining: total,
        timer: null,
        reject,
        resolve: (v) => {
          clearTimeout(w.timer);
          if (this._wait === w) this._wait = null;
          if (w.input) this.timer = null;
          this.room.changed();
          resolve(v);
        },
      };
      this._wait = w;
      if (input) this.timer = { end: w.end, total };
      if (this.paused) {
        this.timer = input ? { end: w.end, total, paused: true, remaining: total } : null;
      } else {
        w.timer = setTimeout(() => w.resolve(false), total);
      }
      this.room.changed();
      if (check && check()) w.resolve(true);
    });
  }

  sleep(base) {
    return this.waitFor(base);
  }

  /** Espera respostas: termina quando todo mundo (conectado) respondeu ou o tempo acaba. */
  waitAnswers(base, extraCheck) {
    const p = this.waitFor(base, () => this.allAnswered() && (!extraCheck || extraCheck()), { input: true });
    // O apresentador cobra quem está enrolando (só em esperas longas)
    if (base >= 20_000 && !this.quietNag) {
      const total = base * this.room.timeScale * (this.room.settings.extraTime ? 1.6 : 1);
      const t = setTimeout(() => this.nag(), total * 0.64);
      p.then(
        () => clearTimeout(t),
        () => clearTimeout(t),
      );
    }
    return p;
  }

  nag() {
    if (this.paused || this.aborted) return;
    const pend = this.pendingIds().filter((id) => this.room.players.get(id)?.connected);
    if (!pend.length) return;
    if (pend.length <= 2 && pend.length < this.ids.length) {
      const names = pend.map((id) => this.name(id)).join(' e ');
      this.say(pick(['Só falta {n}! Tá todo mundo olhando pra você.', 'Falta só {n}. Sem pressão. Muita pressão.', '{n}, a galera tá te esperando!', 'Alguém acorda {n}, por favor.']).replace('{n}', names));
    } else {
      this.say(pick(['Bora, gente! O tempo tá passando.', 'Tô vendo vocês pensando. Dá pra ouvir as engrenagens.', 'Rapidinho aí, que eu sou uma caixa ocupada.', 'Quem ainda não respondeu: o mundo inteiro está esperando.']));
    }
  }

  poke() {
    const w = this._wait;
    if (w && w.check && !this.paused && w.check()) w.resolve(true);
  }

  skip() {
    if (this._wait && !this.paused) this._wait.resolve('skip');
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    const w = this._wait;
    if (w) {
      clearTimeout(w.timer);
      w.remaining = Math.max(0, w.end - Date.now());
      if (w.input) this.timer = { end: w.end, total: w.total, paused: true, remaining: w.remaining };
    }
    this.room.changed();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const w = this._wait;
    if (w) {
      w.end = Date.now() + w.remaining;
      if (w.input) this.timer = { end: w.end, total: w.total };
      w.timer = setTimeout(() => w.resolve(false), w.remaining);
    }
    this.room.changed();
    this.poke();
  }

  abort() {
    this.aborted = true;
    const w = this._wait;
    if (w) {
      clearTimeout(w.timer);
      this._wait = null;
      w.reject(ABORT);
    }
  }

  // ───────────────────────── fases, narração, efeitos ─────────────────────────

  setPhase(phase, data = {}) {
    this.phase = phase;
    this.phaseId++;
    this.pd = data;
    this.reqs.clear();
    this.areq = null;
    this.avotes.clear();
    this.room.changed();
  }

  say(text, mood) {
    this.room.say(text, mood);
  }
  fx(type, data) {
    this.room.fx(type, data);
  }
  sfx(name) {
    this.room.fx('sfx', name);
  }

  /** Intro padrão: splash do jogo + regras em slides (pular pula tudo). */
  async intro() {
    const m = this.meta;
    this.setPhase('intro');
    this.say(pick(m.introLines ?? [`Bem-vindos ao ${m.name}!`]));
    if ((await this.sleep(5200)) === 'skip') return;
    const rules = m.rules ?? [];
    for (let i = 0; i < rules.length; i++) {
      this.setPhase('rules', { i, total: rules.length });
      if (i === 0 && m.rulesLine) this.say(m.rulesLine);
      if ((await this.sleep(5600)) === 'skip') return;
    }
  }

  /** Guarda um desenho pra galeria de fim de jogo (TV mostra, celular deixa salvar). */
  addToGallery(by, d, title) {
    if (d?.s?.length) this.gallery.push({ by, d, title: String(title ?? '').slice(0, 80) });
  }

  // ───────────────────────── pontuação ─────────────────────────

  score(id, pts) {
    if (!this.scores.has(id) || !pts) return;
    this.scores.set(id, Math.round(this.scores.get(id) + pts));
  }
  stat(id, key, n = 1) {
    const s = this.stats.get(id);
    if (s) s[key] = (s[key] ?? 0) + n;
  }
  ranking() {
    return rankEntries(this.ids.map((id) => ({ id, score: this.scores.get(id) ?? 0 })));
  }
  scoreboard() {
    return this.ranking().map((e) => ({ ...e }));
  }
  /** Prêmios de fim de jogo: [{ id, title, desc }]. Jogos sobrescrevem. */
  awards() {
    return [];
  }
  /** Prêmio pro maior valor de uma estatística (ignora zeros e empates no topo ficam com o primeiro). */
  topStat(key, title, desc) {
    let best = null;
    for (const id of this.ids) {
      const v = this.stats.get(id)?.[key] ?? 0;
      if (v > 0 && (!best || v > best.v)) best = { id, v };
    }
    return best ? { id: best.id, title, desc: desc.replace('{n}', best.v) } : null;
  }

  // ───────────────────────── pedidos pros celulares ─────────────────────────

  rid(tag = '') {
    return `${this.phaseId}.${++this._rid}${tag ? '.' + tag : ''}`;
  }

  /** Registra um pedido pra um jogador. `on(p, valor, meta)` → true/undefined aceita, string = erro. */
  ask(id, req) {
    if (!req.id) req.id = this.rid(req.kind);
    this.reqs.set(id, req);
    this.room.changed();
    return req;
  }

  askAudience(req) {
    if (!req.id) req.id = this.rid('aud');
    this.areq = req;
    this.avotes.clear();
    this.room.changed();
    return req;
  }

  pendingIds() {
    return [...this.reqs.keys()];
  }

  allAnswered() {
    for (const id of this.reqs.keys()) {
      const p = this.room.players.get(id);
      if (p && (p.connected || p.bot)) return false;
    }
    return true;
  }

  /** Valida o valor de acordo com o tipo do pedido. Retorna { v } ou { err }. */
  validate(req, v) {
    switch (req.kind) {
      case 'text': {
        const t = clean(v, req.max ?? 80);
        if (!t) return { err: 'Escreve alguma coisa aí!' };
        return { v: t };
      }
      case 'choice':
      case 'players': {
        const opt = (req.options ?? []).find((o) => o.id === v);
        if (!opt || opt.disabled) return { err: 'Opção inválida' };
        return { v };
      }
      case 'multi': {
        if (!Array.isArray(v)) return { err: 'Opção inválida' };
        const ids = [...new Set(v)].filter((x) => (req.options ?? []).some((o) => o.id === x && !o.disabled));
        const min = req.min ?? 1;
        const max = req.max ?? req.options.length;
        if (ids.length < min) return { err: min === 1 ? 'Escolhe pelo menos uma!' : `Escolhe pelo menos ${min}!` };
        return { v: ids.slice(0, max) };
      }
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) return { err: 'Número inválido' };
        const r = clamp(req.step && req.step < 1 ? n : Math.round(n), req.min ?? -1e9, req.max ?? 1e9);
        return { v: r };
      }
      case 'draw': {
        const d = sanitizeDrawing(v);
        if (drawingIsEmpty(d) && !req.allowEmpty) return { err: 'Desenha alguma coisa!' };
        return { v: d };
      }
      case 'taps':
        return { v: clamp(Math.round(Number(v) || 0), 0, 400) };
      case 'sequence':
        return { v: Array.isArray(v) ? v.slice(0, 20).map((x) => clamp(Math.round(Number(x) || 0), 0, 9)) : [] };
      case 'confirm':
        return { v: true };
      default:
        return { v };
    }
  }

  /** Resposta-curinga pro botão "me salva". Jogos podem sobrescrever via req.safetyPool. */
  safetyFor(p, req) {
    const pool = req.safetyPool ?? botContent.answers;
    return pick(pool);
  }

  input(p, msg) {
    if (this.paused || this.aborted || !msg) return;
    if (msg.t === 'submit' || msg.t === 'safety') {
      const req = this.reqs.get(p.id);
      if (!req || req.id !== msg.rid) return;
      let raw = msg.v;
      const safety = msg.t === 'safety';
      if (safety) {
        if (!req.safety) return;
        raw = this.safetyFor(p, req);
      }
      const { v, err } = this.validate(req, raw);
      if (err) return this.room.toast(p, err);
      const res = req.on ? req.on(p, v, { safety }) : undefined;
      if (typeof res === 'string') {
        this.room.toast(p, res);
        if (safety) this.room.changed();
        return;
      }
      if (res !== false && this.reqs.get(p.id) === req) this.reqs.delete(p.id);
      this.room.changed();
      this.poke();
    } else if (msg.t === 'like') {
      this.onLike?.(p, msg);
      this.room.changed();
    } else {
      this.onInput?.(p, msg);
    }
  }

  audienceInput(aud, msg) {
    if (this.paused || !this.areq || msg?.t !== 'submit' || msg.rid !== this.areq.id) return;
    const { v, err } = this.validate(this.areq, msg.v);
    if (err) return;
    this.avotes.set(aud.id, v);
    this.room.changed();
  }

  /** Contagem de votos da plateia por opção. */
  audienceTally() {
    const t = {};
    for (const v of this.avotes.values()) {
      for (const x of Array.isArray(v) ? v : [v]) t[x] = (t[x] ?? 0) + 1;
    }
    return t;
  }

  // ───────────────────────── views (sobrescrever) ─────────────────────────

  async run() {}
  hostView() {
    return {};
  }
  /** Visão do celular. Por padrão mostra o pedido pendente ou uma tela de espera. */
  playerView(p) {
    return { req: this.reqs.get(p.id) ?? null };
  }
  audienceView() {
    return { req: this.areq, voted: false };
  }
}

/** Remove funções e campos privados antes de mandar um pedido pela rede. */
export function publicReq(req) {
  if (!req) return null;
  const out = {};
  for (const [k, v] of Object.entries(req)) {
    if (typeof v === 'function' || k.startsWith('_') || k === 'safetyPool') continue;
    out[k] = v;
  }
  return out;
}
