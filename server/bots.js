// Os "Bobôs": jogadores-robô que respondem qualquer pedido.
// Servem pra testar, pra demonstrar e pra completar mesa quando falta gente.

import botContent from '../content/bots.js';
import { pick, rand, randomScribble, sample } from './util.js';

export class Bots {
  constructor(room) {
    this.room = room;
    this.pending = new Map(); // botId -> { rid, timer }
  }

  /** De vez em quando os Bobôs reagem com emoji (deixa a TV viva no modo demo). */
  startReactions() {
    if (this.reactTimer) return;
    const EMOJIS = ['😂', '🔥', '😱', '👏', '💀', '🤡', '😍', '🍅'];
    this.reactTimer = setInterval(() => {
      const g = this.room.game;
      if (!g || g.paused || g.reqs.size) return;
      for (const p of this.room.players.values()) {
        if (p.bot && Math.random() < 0.1) this.room.react(p, EMOJIS[rand(EMOJIS.length)]);
      }
    }, 2600);
    this.reactTimer.unref?.();
  }

  add(n) {
    this.startReactions();
    const room = this.room;
    let added = 0;
    for (let i = 0; i < n; i++) {
      if (room.players.size >= room.settings.maxPlayers) break;
      if (room.scene === 'game') break;
      const free = botContent.names.filter((x) => !room.nameTaken(x));
      const name = free.length ? pick(free) : `Bobô ${rand(900) + 100}`;
      room.addPlayer({ name, bot: true });
      added++;
    }
    if (!added) return { error: room.scene === 'game' ? 'Espera a partida acabar' : 'Sala cheia' };
    return { ok: true, added };
  }

  clear() {
    for (const p of [...this.room.players.values()]) if (p.bot) this.room.removePlayer(p.id);
    for (const x of this.pending.values()) clearTimeout(x.timer);
    this.pending.clear();
    clearInterval(this.reactTimer);
    this.reactTimer = null;
    return { ok: true };
  }

  /** Chamado a cada broadcast: agenda respostas pros pedidos novos. */
  tick() {
    const g = this.room.game;
    if (!g) return;
    for (const [id, req] of g.reqs) {
      const p = this.room.players.get(id);
      if (!p?.bot) continue;
      const cur = this.pending.get(id);
      if (cur && cur.rid === req.id) continue;
      if (cur) clearTimeout(cur.timer);
      const base = req.botDelay ?? (req.kind === 'draw' ? 7000 : req.kind === 'text' ? 3500 : 1500);
      const delay = base + rand(req.kind === 'draw' ? 9000 : 5000);
      const timer = setTimeout(() => this.answer(p, req, 0), delay * this.room.timeScale);
      this.pending.set(id, { rid: req.id, timer });
    }
  }

  answer(p, req, tries) {
    const g = this.room.game;
    if (!g || g.reqs.get(p.id) !== req) return;
    if (g.paused) {
      const timer = setTimeout(() => this.answer(p, req, tries), 1000);
      this.pending.set(p.id, { rid: req.id, timer });
      return;
    }
    let v;
    try {
      v = req.bot ? req.bot(p) : this.generic(req);
    } catch (e) {
      v = this.generic(req);
    }
    if (v === undefined) return;
    g.input(p, { t: 'submit', rid: req.id, v });
    // Se foi recusado (ex.: escreveu a verdade no Lorota), tenta de novo com outra coisa
    if (g.reqs.get(p.id) === req && tries < 4) {
      if (req.safety && tries >= 2) return g.input(p, { t: 'safety', rid: req.id });
      const timer = setTimeout(() => this.answer(p, req, tries + 1), 400 * this.room.timeScale);
      this.pending.set(p.id, { rid: req.id, timer });
    }
  }

  generic(req) {
    switch (req.kind) {
      case 'text':
        return pick(req.botPool ?? botContent.answers);
      case 'choice':
      case 'players': {
        const opts = (req.options ?? []).filter((o) => !o.disabled);
        return pick(opts)?.id;
      }
      case 'multi': {
        const opts = (req.options ?? []).filter((o) => !o.disabled);
        const min = req.min ?? 1;
        const max = Math.min(req.max ?? opts.length, opts.length);
        const k = Math.max(min, Math.min(max, 1 + rand(max)));
        return sample(opts, k).map((o) => o.id);
      }
      case 'number': {
        const min = req.min ?? 0;
        const max = req.max ?? 10;
        return min + rand(max - min + 1);
      }
      case 'draw':
        return randomScribble();
      case 'taps':
        return 25 + rand(45);
      case 'sequence':
        return Array.from({ length: req.length ?? 4 }, () => rand(req.symbols ?? 4));
      case 'confirm':
        return true;
      default:
        return undefined;
    }
  }
}
