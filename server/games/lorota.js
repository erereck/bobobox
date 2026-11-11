// LOROTA — um fato real e bizarro com uma lacuna. Todo mundo inventa uma mentira;
// depois cada um tenta achar a verdade no meio das lorotas.

import { Game } from '../game.js';
import { pick, shuffle, similar } from '../util.js';
import content from '../../content/lorota.js';
import botContent from '../../content/bots.js';

const CAT_MS = 15_000;
const LIE_MS = 50_000;
const PICK_MS = 22_000;

export default class Lorota extends Game {
  static meta = {
    id: 'lorota',
    name: 'Lorota',
    tag: 'Minta bem, ache a verdade',
    emoji: '🤥',
    desc: 'Fatos reais e absurdos com uma lacuna. Invente a mentira mais convincente e ache a verdade no meio das lorotas dos amigos.',
    min: 2,
    max: 8,
    mins: 15,
    color: '#ff8a3d',
    color2: '#ffd23f',
    kind: 'Blefe',
    warmup: true,
    rules: [
      'Na TV aparece um fato REAL e bizarro, com uma lacuna.',
      'Escreva uma mentira convincente pra lacuna. Se escrever a verdade sem querer, a gente avisa.',
      'Depois, todas as mentiras aparecem junto com a verdade. Ache a verdadeira!',
      'Achou a verdade: pontos. Alguém caiu na sua lorota: pontos pra você também.',
    ],
    rulesLine: 'Mintam com convicção. É o que os políticos fazem.',
    introLines: ['Lorota! Onde a verdade é mais estranha que a mentira.', 'Bem-vindos ao Lorota. Aqui mentir não é feio, é estratégia.', 'Lorota! Preparem suas melhores mentiras.'],
  };

  async run() {
    await this.intro();
    this.chooserIdx = 0;
    this.chooserOrder = shuffle(this.ids);
    const plan = [
      [1, 2],
      [2, 2],
    ];
    for (const [mult, count] of plan) {
      this.roundNo = mult;
      this.before = Object.fromEntries(this.scores);
      for (let i = 0; i < count; i++) await this.question(mult, i + 1, count);
      this.setPhase('scores', { before: this.before });
      this.say(pick(['Placar dos mentirosos!', 'Vamos ver quem tá mentindo melhor.']));
      await this.sleep(6500);
    }
    this.roundNo = 3;
    this.before = Object.fromEntries(this.scores);
    this.setPhase('finalIntro');
    this.say('A LOROTA FINAL! Pontos em triplo. Mintam como nunca!', 'hype');
    await this.sleep(4500);
    await this.question(3, 1, 1, true);
    this.setPhase('scores', { before: this.before, final: true });
    await this.sleep(6500);
  }

  async question(mult, n, count, final = false) {
    const deck = this.room.deck('lorota', content.questions);
    // escolha de categoria: o "escolhedor" da vez pega entre 4
    const cands = [];
    const cats = new Set();
    for (let tries = 0; cands.length < 4 && tries < 40; tries++) {
      const q = deck.draw((x) => !cats.has(x.cat) && !cands.includes(x));
      if (!q) break;
      cats.add(q.cat);
      cands.push(q);
    }
    const chooser = this.chooserOrder[this.chooserIdx++ % this.chooserOrder.length];
    let chosen = cands[0];
    this.cur = { mult, n, count, final, chooser, cats: cands.map((q) => q.cat) };
    this.setPhase('category');
    this.say(`${this.name(chooser)}, escolha uma categoria.`);
    this.ask(chooser, {
      kind: 'choice',
      title: 'Escolha a categoria',
      options: cands.map((q, i) => ({ id: String(i), label: q.cat })),
      big: false,
      on: (p, v) => {
        chosen = cands[Number(v)] ?? chosen;
        this.cur.picked = Number(v);
      },
    });
    await this.waitAnswers(CAT_MS);
    this.reqs.clear();
    // os outros candidatos voltam pro baralho mais tarde (o Deck já embaralha de novo quando esvazia)
    const q = chosen;
    const c = (this.cur = { ...this.cur, q, lies: [], truth: { key: 'T', text: q.a, pickers: [], likes: 0, truth: true }, revealIdx: -1, picked: cands.indexOf(q) });

    // mentiras
    this.setPhase('lie');
    this.say(q.q.replace(/_{3,}/, 'tracinho'));
    const isTruth = (v) => similar(v, q.a) || (q.alt ?? []).some((a) => similar(v, a));
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'text',
        title: `${q.cat} · invente uma MENTIRA`,
        prompt: q.q,
        max: 40,
        safety: true,
        safetyPool: q.lies,
        botPool: botContent.lies,
        placeholder: 'Sua lorota…',
        on: (p, v, { safety }) => {
          if (isTruth(v)) {
            if (safety) return 'Tenta de novo!';
            this.stat(p.id, 'truthTyped');
            return 'Isso é a VERDADE! 😱 Escreve uma mentira, espertinho.';
          }
          const dup = c.lies.find((l) => similar(l.text, v));
          if (dup) {
            if (!dup.authors.includes(p.id)) dup.authors.push(p.id);
          } else c.lies.push({ key: `L${c.lies.length}`, text: v, authors: [p.id], pickers: [], likes: 0 });
          if (safety) this.stat(p.id, 'safety');
        },
      });
    }
    await this.waitAnswers(LIE_MS);
    this.reqs.clear();
    // mentiras da casa pra completar
    const house = shuffle(q.lies ?? []).filter((t) => !isTruth(t) && !c.lies.some((l) => similar(l.text, t)));
    const want = c.lies.length < 3 ? 3 - c.lies.length : 1;
    for (const t of house.slice(0, want)) c.lies.push({ key: `H${c.lies.length}`, text: t, authors: [], pickers: [], likes: 0, house: true });

    // escolha da verdade
    const options = shuffle([c.truth, ...c.lies]);
    c.options = options;
    this.setPhase('pick');
    this.say('Agora achem a VERDADE!');
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'choice',
        title: 'Qual é a verdade?',
        prompt: q.q,
        likeable: true,
        options: options.map((o) => ({ id: o.key, label: o.text, disabled: o.authors?.includes(id) })),
        on: (p, key) => {
          options.find((o) => o.key === key)?.pickers.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia: qual é a verdade?', prompt: q.q, options: options.map((o) => ({ id: o.key, label: o.text })) });
    await this.waitAnswers(PICK_MS);
    this.reqs.clear();
    c.aud = this.audienceTally();

    // revelação
    const picked = c.lies.filter((l) => l.pickers.length).sort((a, b) => a.pickers.length - b.pickers.length);
    c.reveals = [...picked.map((l) => l.key), 'T'];
    this.setPhase('reveal');
    for (let i = 0; i < c.reveals.length; i++) {
      c.revealIdx = i;
      c.step = 0;
      const o = options.find((x) => x.key === c.reveals[i]);
      this.sfx('reveal');
      this.room.changed();
      this.say(o.truth ? `E a verdade é... ${o.text}!` : `${o.pickers.map((id) => this.name(id)).join(', ')} ${o.pickers.length > 1 ? 'escolheram' : 'escolheu'}: ${o.text}`, o.truth ? 'hype' : undefined);
      await this.sleep(2600);
      c.step = 1;
      if (o.truth) {
        o.pts = 1000 * mult;
        for (const id of o.pickers) {
          this.score(id, o.pts);
          this.stat(id, 'found');
        }
        this.sfx(o.pickers.length ? 'correct' : 'fail');
        if (!o.pickers.length) this.say('Ninguém acertou! Vocês são muito crédulos.');
      } else {
        o.pts = 500 * mult * o.pickers.length;
        for (const id of o.authors) {
          this.score(id, o.pts);
          this.stat(id, 'fooled', o.pickers.length);
        }
        this.sfx(o.house ? 'boing' : 'coin');
        this.say(o.house ? 'Essa lorota era MINHA! Hehehe.' : `Lorota de ${o.authors.map((id) => this.name(id)).join(' e ')}!`);
        if (o.house) for (const id of o.pickers) this.stat(id, 'houseFooled');
      }
      this.room.changed();
      await this.sleep(o.truth ? 5000 : 3300);
    }
  }

  onLike(p, msg) {
    const o = this.cur?.options?.find((x) => x.key === msg.o);
    if (!o || o.truth || o.house || o.authors.includes(p.id)) return;
    o.likes++;
    for (const id of o.authors) this.stat(id, 'likes');
  }

  hostView() {
    const c = this.cur;
    const base = { round: this.roundNo };
    if (!c) return base;
    switch (this.phase) {
      case 'category':
        return { ...base, chooser: c.chooser, cats: c.cats, picked: c.picked ?? null, n: c.n, count: c.count, final: c.final };
      case 'lie':
        return { ...base, cat: c.q.cat, q: c.q.q, n: c.n, count: c.count, final: c.final };
      case 'pick':
        return { ...base, cat: c.q.cat, q: c.q.q, final: c.final, options: c.options.map((o) => ({ key: o.key, text: o.text })) };
      case 'reveal': {
        const key = c.reveals[c.revealIdx];
        const o = c.options.find((x) => x.key === key);
        return {
          ...base,
          cat: c.q.cat,
          q: c.q.q,
          final: c.final,
          answer: o.truth && c.step ? c.q.a : null,
          options: c.options.map((x) => ({ key: x.key, text: x.text, done: c.reveals.indexOf(x.key) >= 0 && c.reveals.indexOf(x.key) < c.revealIdx, pickers: x.pickers.length })),
          cur: { key: o.key, text: o.text, truth: !!o.truth, house: !!o.house, pickers: o.pickers, authors: c.step && !o.truth ? o.authors : null, pts: c.step ? o.pts : null, likes: o.likes, aud: c.aud?.[o.key] ?? 0 },
          step: c.step,
        };
      }
      case 'scores':
        return { ...base, before: this.pd.before, final: !!this.pd.final };
      default:
        return base;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const c = this.cur;
    if (this.phase === 'category') return { wait: { emoji: '🗂️', title: `${this.name(c?.chooser)} está escolhendo…`, msg: 'Prepara a cara de pau.' } };
    if (this.phase === 'lie') return { wait: { emoji: '🤥', title: 'Lorota enviada!', msg: 'Torce pra galera cair.' } };
    if (this.phase === 'pick') return { wait: { emoji: '🔎', title: 'Escolha feita!', msg: '' } };
    return { wait: { emoji: '👀', title: 'Olha a TV!', msg: '' } };
  }

  awards() {
    return [
      this.topStat('fooled', 'Pinóquio de Ouro', 'Enganou a galera {n} vez(es).'),
      this.topStat('found', 'Detetive da Verdade', 'Achou a verdade {n} vez(es).'),
      this.topStat('houseFooled', 'Crédulo', 'Caiu {n} vez(es) na lorota do Bobo.'),
      this.topStat('truthTyped', 'Sabe Demais', 'Escreveu a verdade sem querer {n} vez(es).'),
    ];
  }
}
