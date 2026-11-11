// GARRANCHO — desenhe um tema secreto; a galera inventa títulos falsos; quem acha o verdadeiro?

import { Game } from '../game.js';
import { pick, sample, shuffle, similar } from '../util.js';
import content from '../../content/garrancho.js';
import botContent from '../../content/bots.js';

const DRAW_MS = 80_000;
const TITLE_MS = 45_000;
const GUESS_MS = 25_000;
const ACCENTS = ['#ff3d7f', '#2ec4ff', '#ffd23f', '#3ddc84', '#ff8a3d', '#a77bff', '#ff5c5c', '#1fe0c8'];

export default class Garrancho extends Game {
  static meta = {
    id: 'garrancho',
    name: 'Garrancho',
    tag: 'Desenhe, blefe e adivinhe',
    emoji: '🖍️',
    desc: 'Cada um desenha um tema secreto e bizarro. Os outros inventam títulos falsos. Ache o verdadeiro no meio das mentiras!',
    min: 3,
    max: 8,
    mins: 20,
    color: '#2ec4ff',
    color2: '#ffd23f',
    kind: 'Desenhar',
    font: 'marker',
    rules: [
      'Você recebe um tema SECRETO e desenha no celular. Talento não é necessário. Sério.',
      'Cada desenho aparece na TV. Todo mundo inventa um título FALSO pra ele.',
      'Depois, todos tentam achar o título verdadeiro no meio das mentiras.',
      'Achou a verdade? Pontos. Enganou alguém com sua mentira? Mais pontos. E quem desenhou ganha quando acertam.',
    ],
    rulesLine: 'Desenhem como se ninguém estivesse olhando. Porque todo mundo vai estar.',
    introLines: ['Garrancho! O jogo onde artistas incompreendidos finalmente são... incompreendidos.', 'Peguem seus pincéis digitais. É hora do Garrancho!', 'Garrancho: porque todo mundo tem um Picasso dentro de si. Um Picasso bem ruim.'],
  };

  async run() {
    await this.intro();
    const rounds = this.ids.length <= 4 ? 2 : 1;
    for (let r = 1; r <= rounds; r++) {
      this.round = r;
      await this.drawPhase(r, rounds);
      const order = shuffle(this.drawings.filter((x) => x.d));
      for (let i = 0; i < order.length; i++) await this.playDrawing(order[i], i + 1, order.length);
      this.setPhase('scores', { before: this.before });
      this.say(pick(['Placar! Vamos ver quem é o melhor mentiroso.', 'Hora do placar. Artistas, segurem as lágrimas.']));
      await this.sleep(7000);
    }
  }

  async drawPhase(r, rounds) {
    const pool = [...(this.room.settings.family ? [] : content.adultPrompts ?? []).map((t) => ({ t, adult: true })), ...content.prompts.map((t) => ({ t }))];
    const deck = this.room.deck(`gar:${this.room.settings.family}`, pool);
    this.before = Object.fromEntries(this.scores);
    this.drawings = [];
    this.setPhase('draw', { round: r, rounds });
    this.say(r === 1 ? 'Olhem o celular: cada um tem um tema secreto. Desenhem!' : 'Segunda rodada de desenho! Agora vai, Picasso.');
    const custom = this.room.customDeck('garrancho');
    for (const id of this.ids) {
      const prompt = custom && Math.random() < 0.5 ? custom.draw() : deck.draw().t;
      const accents = sample(ACCENTS, 2);
      const entry = { id, prompt, d: null };
      this.drawings.push(entry);
      this.ask(id, {
        kind: 'draw',
        title: 'Desenhe:',
        prompt,
        palette: ['#1b1033', ...accents, '#ffffff'],
        sub: 'Nada de escrever palavras, hein!',
        on: (p, d) => {
          entry.d = d;
        },
      });
    }
    await this.waitAnswers(DRAW_MS);
    this.reqs.clear();
    for (const e of this.drawings) this.addToGallery(e.id, e.d, e.prompt);
    this.sfx('gong');
    await this.sleep(800);
  }

  async playDrawing(dr, idx, total) {
    const artist = dr.id;
    const others = this.ids.filter((id) => id !== artist);
    const cur = (this.cur = { artist, prompt: dr.prompt, d: dr.d, idx, total, lies: [], truth: { key: 'T', text: dr.prompt, pickers: [], likes: 0, truth: true }, revealIdx: -1 });

    // 1) títulos falsos
    this.setPhase('title');
    this.say(pick(['Que diabos é isso?', 'O que vocês acham que é isso aqui?', 'Inventem um título pra essa obra-prima.', 'Isso aqui é arte. Só não sei de quê.']));
    for (const id of others) {
      this.ask(id, {
        kind: 'text',
        title: 'Invente um título FALSO',
        prompt: 'O que é esse desenho? Escreva algo que pareça verdade.',
        drawing: dr.d,
        max: 50,
        safety: true,
        safetyPool: botContent.titles,
        botPool: botContent.titles,
        on: (p, v) => {
          if (similar(v, dr.prompt)) return 'Você acertou o tema! Mas a ideia é escrever uma MENTIRA. Tenta outra.';
          const dup = cur.lies.find((l) => similar(l.text, v));
          if (dup) {
            if (!dup.authors.includes(p.id)) dup.authors.push(p.id);
          } else cur.lies.push({ key: `L${cur.lies.length}`, text: v, authors: [p.id], pickers: [], likes: 0 });
        },
      });
    }
    await this.waitAnswers(TITLE_MS);
    this.reqs.clear();
    // completa com mentiras da casa se faltar opção
    while (cur.lies.length < 2) {
      const t = pick(botContent.titles);
      if (cur.lies.some((l) => similar(l.text, t)) || similar(t, dr.prompt)) continue;
      cur.lies.push({ key: `H${cur.lies.length}`, text: t, authors: [], pickers: [], likes: 0, house: true });
    }

    // 2) adivinhação
    const options = shuffle([cur.truth, ...cur.lies]);
    cur.options = options;
    this.setPhase('guess');
    this.say('Agora achem o título VERDADEIRO!');
    for (const id of others) {
      this.ask(id, {
        kind: 'choice',
        title: 'Qual é o título verdadeiro?',
        drawing: dr.d,
        likeable: true,
        options: options.map((o) => ({ id: o.key, label: o.text, disabled: o.authors?.includes(id) })),
        on: (p, key) => {
          options.find((o) => o.key === key)?.pickers.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia: qual é o verdadeiro?', drawing: dr.d, options: options.map((o) => ({ id: o.key, label: o.text })) });
    await this.waitAnswers(GUESS_MS);
    this.reqs.clear();
    cur.aud = this.audienceTally();

    // 3) revelação: mentiras escolhidas, uma por uma, e por fim a verdade
    const picked = cur.lies.filter((l) => l.pickers.length > 0).sort((a, b) => a.pickers.length - b.pickers.length);
    cur.reveals = [...picked.map((l) => l.key), 'T'];
    this.setPhase('reveal');
    for (let i = 0; i < cur.reveals.length; i++) {
      cur.revealIdx = i;
      const key = cur.reveals[i];
      const o = options.find((x) => x.key === key);
      cur.step = 0;
      this.sfx('reveal');
      this.room.changed();
      if (o.truth) {
        this.say(`A verdade era... ${o.text}!`, 'hype');
      } else {
        this.say(`${o.pickers.map((id) => this.name(id)).join(', ')} ${o.pickers.length > 1 ? 'caíram' : 'caiu'} em: ${o.text}`);
      }
      await this.sleep(2600);
      cur.step = 1;
      if (o.truth) {
        for (const id of o.pickers) {
          this.score(id, 1000);
          this.stat(id, 'found');
        }
        this.score(artist, 500 * o.pickers.length);
        this.stat(artist, 'finders', o.pickers.length);
        o.pts = { finder: 1000, artist: 500 * o.pickers.length };
        this.sfx(o.pickers.length ? 'correct' : 'fail');
        if (!o.pickers.length) this.say(`Ninguém acertou! ${this.name(artist)}, talvez desenho não seja sua praia.`);
      } else {
        const pts = 500 * o.pickers.length;
        for (const id of o.authors) {
          this.score(id, pts);
          this.stat(id, 'fooled', o.pickers.length);
        }
        o.pts = pts;
        this.sfx(o.house ? 'boing' : 'coin');
        if (o.house) this.say('Essa foi mentira MINHA! Hahaha. Zero pontos pra vocês.');
        else this.say(`Mentira de ${o.authors.map((id) => this.name(id)).join(' e ')}!`);
      }
      this.room.changed();
      await this.sleep(o.truth ? 5200 : 3400);
    }
  }

  onLike(p, msg) {
    const o = this.cur?.options?.find((x) => x.key === msg.o);
    if (!o || o.authors?.includes(p.id)) return;
    o.likes++;
    if (o.truth) this.stat(this.cur.artist, 'likes');
    else for (const id of o.authors) this.stat(id, 'likes');
  }

  /** Esconde quem é o artista: ele aparece como pendente enquanto alguém ainda responde. */
  maskedPending() {
    const pend = this.pendingIds();
    return pend.length && this.cur ? [...pend, this.cur.artist] : pend;
  }

  hostView() {
    const c = this.cur;
    switch (this.phase) {
      case 'draw':
        return { round: this.round, rounds: this.pd.rounds };
      case 'title':
        return { round: this.round, d: c.d, idx: c.idx, total: c.total, pending: this.maskedPending() };
      case 'guess':
        return { round: this.round, d: c.d, idx: c.idx, total: c.total, pending: this.maskedPending(), options: c.options.map((o) => ({ key: o.key, text: o.text })) };
      case 'reveal': {
        const key = c.reveals[c.revealIdx];
        const o = c.options.find((x) => x.key === key);
        return {
          round: this.round,
          d: c.d,
          idx: c.idx,
          total: c.total,
          artist: c.artist,
          options: c.options.map((x) => ({ key: x.key, text: x.text, done: c.reveals.indexOf(x.key) >= 0 && c.reveals.indexOf(x.key) < c.revealIdx, pickers: x.pickers.length })),
          cur: { key: o.key, text: o.text, truth: !!o.truth, house: !!o.house, pickers: o.pickers, authors: c.step ? o.authors ?? [c.artist] : null, pts: c.step ? o.pts : null, likes: o.likes, aud: c.aud?.[o.key] ?? 0 },
          step: c.step,
        };
      }
      case 'scores':
        return { round: this.round, before: this.pd.before };
      default:
        return { round: this.round };
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    if (this.phase === 'draw') return { wait: { emoji: '🎨', title: 'Desenho enviado!', msg: 'Esperando os outros artistas.' } };
    if (this.cur && this.cur.artist === p.id && (this.phase === 'title' || this.phase === 'guess')) {
      return { wait: { emoji: '🤫', title: 'Esse desenho é SEU!', msg: `O tema era "${this.cur.prompt}". Faz cara de paisagem.`, drawing: this.cur.d } };
    }
    if (this.phase === 'reveal') return { wait: { emoji: '🫣', title: 'Olha a TV!', msg: 'Hora da verdade.' } };
    return { wait: { emoji: '👀', title: 'Olha pra TV!', msg: '' } };
  }

  awards() {
    return [
      this.topStat('fooled', 'Mentiroso Profissional', 'Enganou a galera {n} vez(es).'),
      this.topStat('finders', 'Picasso da Quebrada', '{n} pessoa(s) entenderam os desenhos.'),
      this.topStat('likes', 'Queridinho da Galera', 'Recebeu {n} curtida(s).'),
    ];
  }
}
