// QUIZ MACABRO — trivia num hotel assombrado. Errou? Sala de tortura.
// Morreu? Vira fantasma e continua jogando. No fim, a grande fuga.

import { Game } from '../game.js';
import { pick, rand, rankEntries, sample, shuffle } from '../util.js';
import content from '../../content/quiz.js';

const Q_MS = 16_000;
const GOAL = 10;
const TORTURES = ['cups', 'math', 'taps', 'memory', 'truefalse'];
const TORTURE_NAMES = {
  cups: 'Cálices Envenenados',
  math: 'Conta ou Morte',
  taps: 'Dedo Nervoso',
  memory: 'Memória Assombrada',
  truefalse: 'Verdade ou Caixão',
};
const TORTURE_RULES = {
  cups: 'Quem errou escolhe um cálice pra beber. Quem acertou escolhe qual cálice envenenar.',
  math: 'Resolva contas de cabeça. Errou duas? Já era.',
  taps: 'Toque na tela o mais rápido que puder. Menos de 40 toques em 7 segundos e é o fim.',
  memory: 'Decore a sequência de símbolos na TV e repita no celular.',
  truefalse: 'Três afirmações. Verdade ou mentira? Erre duas e vire fantasma.',
};

export default class Quiz extends Game {
  static meta = {
    id: 'quiz',
    name: 'Quiz Macabro',
    tag: 'Erre e enfrente a morte',
    emoji: '💀',
    desc: 'Trivia num hotel assombrado. Errou a pergunta? Sala de tortura. Morreu? Vira fantasma. No fim, todos correm pra saída.',
    min: 1,
    max: 8,
    mins: 20,
    color: '#b6ff3d',
    color2: '#8f5bff',
    kind: 'Trivia',
    font: 'creepster',
    rules: [
      'Bem-vindos ao Hotel Bobo. Responda as perguntas no celular: cada acerto vale dinheiro.',
      'Errou? Você vai pra SALA DE TORTURA e enfrenta um desafio mortal. Sobreviva!',
      'Morreu? Vira fantasma. Fantasmas continuam respondendo e juntam ectoplasma pra fuga.',
      'No final, todos correm pra saída do hotel. O primeiro VIVO a escapar vence.',
    ],
    rulesLine: 'Regra número um do Hotel Bobo: ninguém faz check-out.',
    introLines: ['Bem-vindos ao Hotel Bobo. O check-in é grátis. O check-out… custa a vida.', 'Boa noite, hóspedes. Hoje teremos trivia. E morte. Principalmente morte.', 'Quiz Macabro! Respondam certo, ou passem a eternidade aqui comigo.'],
  };

  constructor(room) {
    super(room);
    this.dead = new Set();
    this.ecto = new Map();
    this.money = new Map();
    this.lastTorture = null;
    this.qn = 0;
  }

  get alive() {
    return this.ids.filter((id) => !this.dead.has(id));
  }

  async run() {
    await this.intro();
    const total = this.ids.length <= 2 ? 7 : 8;
    this.totalQ = total;
    const deck = this.room.deck('quiz:q', content.questions);
    for (let i = 0; i < total; i++) {
      this.qn = i + 1;
      await this.question(deck.draw());
      if (!this.alive.length) {
        this.say('Todo mundo morreu. Que hotel eficiente! Mas ainda tem uma chance…', 'spooky');
        await this.sleep(3500);
        break;
      }
    }
    await this.finale();
  }

  // ───────────────────────── perguntas ─────────────────────────

  async question(q) {
    const opts = q.o.map((t, i) => ({ id: String(i), label: t, color: ['#ff5c5c', '#2ec4ff', '#ffd23f', '#3ddc84'][i] }));
    const picks = new Map();
    this.cur = { q, picks, revealed: false };
    this.setPhase('question');
    this.say(q.q, 'spooky');
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'choice',
        title: this.dead.has(id) ? '👻 Pergunta (fantasma)' : `Pergunta ${this.qn} · vale R$ 1.000`,
        prompt: q.q,
        options: opts,
        bot: () => (Math.random() < 0.45 ? String(q.a) : String(rand(4))),
        on: (p, v) => {
          picks.set(p.id, Number(v));
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia: qual é?', prompt: q.q, options: opts });
    await this.waitAnswers(Q_MS);
    this.reqs.clear();

    this.cur.revealed = true;
    this.cur.aud = this.audienceTally();
    const wrong = [];
    for (const id of this.ids) {
      const ok = picks.get(id) === q.a;
      if (this.dead.has(id)) {
        if (ok) this.ecto.set(id, (this.ecto.get(id) ?? 0) + 1);
        continue;
      }
      if (ok) {
        this.score(id, 1000);
        this.stat(id, 'correct');
      } else wrong.push(id);
    }
    this.setPhase('answer');
    this.sfx('reveal');
    const nAlive = this.alive.length;
    if (!wrong.length) this.say(pick(['Todos acertaram. Que sem graça. Próxima.', 'Ninguém morre dessa vez. Decepcionante.']), 'spooky');
    else if (wrong.length === nAlive && nAlive > 1) this.say('TODO MUNDO ERROU! Todos pra sala de tortura!', 'spooky');
    else this.say(`${wrong.map((id) => this.name(id)).join(', ')}… vocês vêm comigo.`, 'spooky');
    await this.sleep(5200);

    if (wrong.length) await this.torture(wrong);
  }

  // ───────────────────────── tortura ─────────────────────────

  async torture(victims) {
    const opts = TORTURES.filter((t) => t !== this.lastTorture);
    const type = pick(opts);
    this.lastTorture = type;
    this.tort = { type, victims, dies: new Set(), detail: {} };
    this.setPhase('tortureIntro');
    this.sfx('death');
    this.say(`Sala de tortura: ${TORTURE_NAMES[type]}! ${TORTURE_RULES[type]}`, 'spooky');
    await this.sleep(6500);
    await this[`t_${type}`](victims);

    this.setPhase('tortureResult');
    const died = victims.filter((id) => this.tort.dies.has(id));
    for (const id of died) {
      this.dead.add(id);
      this.stat(id, 'deaths');
    }
    for (const id of victims) if (!this.tort.dies.has(id)) this.stat(id, 'survived');
    this.sfx(died.length ? 'death' : 'tada');
    if (died.length) this.fx('shake', {});
    this.say(
      died.length === 0
        ? pick(['Sobreviveram! Por enquanto.', 'Ninguém morreu. Vou ter que caprichar mais.'])
        : died.length === victims.length
          ? pick(['Ninguém sobreviveu. Bem-vindos ao além!', 'Morreram todos! Mais fantasmas pro meu hotel.'])
          : `${died.map((id) => this.name(id)).join(' e ')} ${died.length > 1 ? 'viraram fantasmas' : 'virou fantasma'}!`,
      'spooky',
    );
    await this.sleep(6000);
    this.tort = null;
  }

  async t_cups(victims) {
    const K = victims.length + 1;
    const cups = Array.from({ length: K }, (_, i) => ({ id: String(i), label: `Cálice ${i + 1}`, emoji: '🍷' }));
    const picks = new Map();
    const votes = new Map();
    this.setPhase('cups');
    const survivors = this.alive.filter((id) => !victims.includes(id));
    for (const id of victims) {
      this.ask(id, { kind: 'choice', title: 'Escolha um cálice pra BEBER', prompt: 'Um deles está envenenado…', options: cups, on: (p, v) => picks.set(p.id, v) });
    }
    for (const id of survivors) {
      this.ask(id, { kind: 'choice', title: 'Envenene um cálice! 🧪', prompt: 'Qual cálice você acha que eles vão escolher?', options: cups, on: (p, v) => votes.set(p.id, v) });
    }
    await this.waitAnswers(20_000);
    this.reqs.clear();
    const tally = {};
    for (const v of votes.values()) tally[v] = (tally[v] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((k) => tally[k] === max);
    const poison = top.length ? pick(top) : String(rand(K));
    for (const id of victims) {
      if (!picks.has(id)) picks.set(id, String(rand(K)));
      if (picks.get(id) === poison) this.tort.dies.add(id);
    }
    for (const [id, v] of votes) if (v === poison && [...picks.values()].includes(poison)) this.stat(id, 'poisoner');
    this.tort.detail = { K, poison, picks: Object.fromEntries(picks) };
  }

  async t_math(victims) {
    const probs = new Map();
    const right = new Map();
    const make = () => {
      const op = pick(['+', '−', '×']);
      let a;
      let b;
      if (op === '×') {
        a = 2 + rand(9);
        b = 2 + rand(9);
      } else {
        a = 10 + rand(80);
        b = 5 + rand(40);
      }
      if (op === '−' && b > a) [a, b] = [b, a];
      const ans = op === '+' ? a + b : op === '−' ? a - b : a * b;
      return { a, b, op, ans };
    };
    const askMath = (id, k) => {
      if (k >= 3) return;
      const pb = probs.get(id)[k];
      this.ask(id, {
        kind: 'number',
        keypad: true,
        autoSubmit: false,
        title: `Conta ${k + 1} de 3`,
        prompt: `${pb.a} ${pb.op} ${pb.b} = ?`,
        min: -9999,
        max: 99999,
        bot: () => (Math.random() < 0.7 ? pb.ans : pb.ans + 1 + rand(5)),
        on: (p, v) => {
          if (v === pb.ans) right.set(id, (right.get(id) ?? 0) + 1);
          askMath(id, k + 1);
        },
      });
    };
    this.setPhase('math');
    for (const id of victims) {
      probs.set(id, [make(), make(), make()]);
      askMath(id, 0);
    }
    await this.waitAnswers(30_000);
    this.reqs.clear();
    for (const id of victims) if ((right.get(id) ?? 0) < 2) this.tort.dies.add(id);
    this.tort.detail = { right: Object.fromEntries(victims.map((id) => [id, right.get(id) ?? 0])) };
  }

  async t_taps(victims) {
    const taps = new Map();
    const target = 40;
    this.setPhase('taps');
    for (const id of victims) {
      this.ask(id, {
        kind: 'taps',
        duration: 7000,
        target,
        title: 'TOQUE PRA SOBREVIVER',
        prompt: `Toque o mais rápido que puder! Menos de ${target} = morte.`,
        botDelay: 8500,
        bot: () => 28 + rand(26),
        on: (p, v) => taps.set(p.id, v),
      });
    }
    await this.waitAnswers(16_000);
    this.reqs.clear();
    for (const id of victims) if ((taps.get(id) ?? 0) < target) this.tort.dies.add(id);
    this.tort.detail = { taps: Object.fromEntries(victims.map((id) => [id, taps.get(id) ?? 0])), target };
  }

  async t_memory(victims) {
    const len = 5;
    const seq = Array.from({ length: len }, () => rand(4));
    this.tort.seq = seq;
    this.tort.show = -1;
    this.setPhase('memoryShow');
    await this.sleep(1500);
    for (let i = 0; i < len; i++) {
      this.tort.show = i;
      this.sfx('pop');
      this.room.changed();
      await this.sleep(900);
      this.tort.show = -1;
      this.room.changed();
      await this.sleep(250);
    }
    const answers = new Map();
    this.setPhase('memoryInput');
    for (const id of victims) {
      this.ask(id, {
        kind: 'sequence',
        length: len,
        symbols: 4,
        title: 'Repita a sequência!',
        prompt: 'Toque os símbolos na ordem que apareceram na TV',
        bot: () => (Math.random() < 0.6 ? seq : seq.map((x, i) => (i === len - 1 ? (x + 1) % 4 : x))),
        on: (p, v) => answers.set(p.id, v),
      });
    }
    await this.waitAnswers(20_000);
    this.reqs.clear();
    for (const id of victims) {
      const a = answers.get(id) ?? [];
      if (a.length !== len || a.some((x, i) => x !== seq[i])) this.tort.dies.add(id);
    }
    this.tort.detail = { seq, answers: Object.fromEntries(answers) };
  }

  async t_truefalse(victims) {
    const items = sample(content.truefalse, 3);
    const right = new Map();
    const askTF = (id, k) => {
      if (k >= items.length) return;
      const it = items[k];
      this.ask(id, {
        kind: 'choice',
        title: `Verdade ou mentira? (${k + 1}/3)`,
        prompt: it.s,
        big: true,
        options: [
          { id: 'v', label: 'VERDADE', color: '#3ddc84', emoji: '✅' },
          { id: 'f', label: 'MENTIRA', color: '#ff5c5c', emoji: '❌' },
        ],
        bot: () => (Math.random() < 0.65 ? (it.v ? 'v' : 'f') : it.v ? 'f' : 'v'),
        on: (p, v) => {
          if ((v === 'v') === !!it.v) right.set(id, (right.get(id) ?? 0) + 1);
          askTF(id, k + 1);
        },
      });
    };
    this.setPhase('truefalse');
    for (const id of victims) askTF(id, 0);
    await this.waitAnswers(26_000);
    this.reqs.clear();
    for (const id of victims) if ((right.get(id) ?? 0) < 2) this.tort.dies.add(id);
    this.tort.detail = { right: Object.fromEntries(victims.map((id) => [id, right.get(id) ?? 0])), items: items.map((i) => ({ s: i.s, v: i.v })) };
  }

  // ───────────────────────── a fuga ─────────────────────────

  async finale() {
    this.pos = new Map(this.ids.map((id) => [id, this.dead.has(id) ? Math.min(2, Math.floor((this.ecto.get(id) ?? 0) / 2)) : 3]));
    this.setPhase('finalIntro');
    this.say('A GRANDE FUGA! A saída está ali. Respondam certo pra correr. Fantasmas que alcançarem um vivo… roubam o corpo dele!', 'spooky');
    await this.sleep(8000);
    const deck = this.room.deck('quiz:f', content.final);
    let winner = null;
    for (let k = 0; k < 10 && !winner; k++) {
      const cat = deck.draw();
      const nYes = 1 + rand(2);
      const items = shuffle([...sample(cat.yes, nYes).map((t) => ({ t, ok: true })), ...sample(cat.no, 3 - nYes).map((t) => ({ t, ok: false }))]);
      const picks = new Map();
      this.fin = { cat: cat.cat, items, picks, moves: {}, swaps: [], k: k + 1, show: false };
      this.setPhase('finalQ');
      this.say(cat.cat, 'spooky');
      for (const id of this.ids) {
        this.ask(id, {
          kind: 'multi',
          title: `${cat.cat}`,
          prompt: 'Marque TODOS que se encaixam (errar te segura)',
          options: items.map((it, i) => ({ id: String(i), label: it.t })),
          min: 1,
          max: 3,
          bot: () => {
            const sel = items.map((it, i) => ((it.ok ? Math.random() < 0.7 : Math.random() < 0.25) ? String(i) : null)).filter(Boolean);
            return sel.length ? sel : [String(rand(items.length))];
          },
          on: (p, v) => picks.set(p.id, v),
        });
      }
      await this.waitAnswers(15_000);
      this.reqs.clear();
      // movimento
      for (const id of this.ids) {
        const sel = picks.get(id) ?? [];
        const good = sel.filter((i) => items[Number(i)]?.ok).length;
        const bad = sel.length - good;
        const gain = Math.max(0, good - bad);
        this.fin.moves[id] = gain;
        this.pos.set(id, Math.min(GOAL, this.pos.get(id) + gain));
      }
      // possessão: o fantasma mais adiantado que alcançar o último vivo troca de lugar com ele
      const alive = this.alive.sort((a, b) => this.pos.get(a) - this.pos.get(b));
      const ghosts = [...this.dead].sort((a, b) => this.pos.get(b) - this.pos.get(a));
      if (alive.length && ghosts.length && this.pos.get(ghosts[0]) >= this.pos.get(alive[0])) {
        const g = ghosts[0];
        const v = alive[0];
        this.dead.delete(g);
        this.dead.add(v);
        this.fin.swaps.push({ ghost: g, victim: v });
        this.stat(g, 'possessions');
      }
      this.fin.show = true;
      this.setPhase('finalMove');
      this.sfx('whoosh');
      const sw = this.fin.swaps[0];
      if (sw) {
        this.fx('shake', {});
        this.say(`${this.name(sw.ghost)} possuiu o corpo de ${this.name(sw.victim)}! Voltou dos mortos!`, 'spooky');
      } else this.say(pick(['Correeee!', 'A saída tá chegando…', 'Mais rápido! Eu sinto o cheiro de vocês.', 'Quem vai escapar?']), 'spooky');
      await this.sleep(5800);
      const escaped = this.alive.filter((id) => this.pos.get(id) >= GOAL);
      if (escaped.length) winner = escaped.sort((a, b) => (this.scores.get(b) ?? 0) - (this.scores.get(a) ?? 0))[0];
    }
    if (!winner) {
      const pool = this.alive.length ? this.alive : this.ids;
      winner = pool.sort((a, b) => this.pos.get(b) - this.pos.get(a) || (this.scores.get(b) ?? 0) - (this.scores.get(a) ?? 0))[0];
    }
    this.winner = winner;
    this.score(winner, 3000);
    for (const id of this.alive) if (id !== winner) this.score(id, 500);
    this.setPhase('finalWin');
    this.sfx('tada');
    this.fx('confetti', {});
    this.say(`${this.name(winner)} escapou do Hotel Bobo! O resto de vocês… fica pra sempre.`, 'spooky');
    await this.sleep(8000);
  }

  /** Quem escapou é o campeão, independente do dinheiro. */
  ranking() {
    const rest = rankEntries(this.ids.filter((id) => id !== this.winner).map((id) => ({ id, score: this.scores.get(id) ?? 0 })));
    if (!this.winner) return rankEntries(this.ids.map((id) => ({ id, score: this.scores.get(id) ?? 0 })));
    return [{ id: this.winner, score: this.scores.get(this.winner) ?? 0, rank: 1 }, ...rest.map((e) => ({ ...e, rank: e.rank + 1 }))];
  }

  // ───────────────────────── views ─────────────────────────

  hostView() {
    const base = { qn: this.qn, total: this.totalQ, dead: [...this.dead], ecto: Object.fromEntries(this.ecto) };
    const c = this.cur;
    const t = this.tort;
    const torturePhases = ['tortureIntro', 'cups', 'math', 'taps', 'truefalse', 'memoryInput', 'memoryShow', 'tortureResult'];
    if (!t && torturePhases.includes(this.phase)) return base; // tortura acabou de ser limpa
    switch (this.phase) {
      case 'question':
        return { ...base, cat: c.q.cat, q: c.q.q, options: c.q.o };
      case 'answer': {
        const by = [[], [], [], []];
        for (const [id, v] of c.picks) by[v]?.push(id);
        return { ...base, cat: c.q.cat, q: c.q.q, options: c.q.o, correct: c.q.a, by, aud: c.aud };
      }
      case 'tortureIntro':
        return { ...base, type: t.type, name: TORTURE_NAMES[t.type], rule: TORTURE_RULES[t.type], victims: t.victims };
      case 'cups':
      case 'math':
      case 'taps':
      case 'truefalse':
      case 'memoryInput':
        return { ...base, type: t.type, name: TORTURE_NAMES[t.type], victims: t.victims, k: t.victims.length + 1 };
      case 'memoryShow':
        return { ...base, type: t.type, name: TORTURE_NAMES[t.type], victims: t.victims, show: t.show, seq: t.show >= 0 ? t.seq[t.show] : null, idx: t.show };
      case 'tortureResult':
        return { ...base, type: t.type, name: TORTURE_NAMES[t.type], victims: t.victims, dies: [...t.dies], detail: t.detail };
      case 'finalIntro':
      case 'finalQ':
      case 'finalMove':
      case 'finalWin':
        return {
          ...base,
          goal: GOAL,
          pos: Object.fromEntries(this.pos ?? []),
          cat: this.fin?.cat,
          items: this.fin ? this.fin.items.map((it) => ({ t: it.t, ok: this.fin.show ? it.ok : null })) : null,
          moves: this.phase === 'finalMove' ? this.fin.moves : null,
          swaps: this.phase === 'finalMove' ? this.fin.swaps : null,
          k: this.fin?.k,
          winner: this.phase === 'finalWin' ? this.winner : null,
        };
      default:
        return base;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const ghost = this.dead.has(p.id);
    const t = this.tort;
    if (this.phase === 'answer' && this.cur?.revealed) {
      const ok = this.cur.picks.get(p.id) === this.cur.q.a;
      return { wait: { emoji: ok ? (ghost ? '👻' : '💰') : ghost ? '👻' : '😱', title: ok ? (ghost ? '+1 ectoplasma' : '+R$ 1.000') : ghost ? 'Errou, fantasminha' : 'ERROU!', msg: ok ? '' : ghost ? 'Fantasma não morre duas vezes.' : 'Prepare-se pra sala de tortura…' } };
    }
    if (t && t.victims.includes(p.id) && this.phase !== 'tortureResult') return { wait: { emoji: '⛓️', title: TORTURE_NAMES[t.type], msg: this.phase === 'memoryShow' ? 'OLHA PRA TV E DECORA!' : 'Aguarde sua sentença…' } };
    if (this.phase === 'tortureResult' && t?.victims.includes(p.id)) {
      const d = t.dies.has(p.id);
      return { wait: { emoji: d ? '💀' : '😮‍💨', title: d ? 'VOCÊ MORREU' : 'SOBREVIVEU!', msg: d ? 'Mas fantasmas continuam jogando. Junte ectoplasma pra fuga!' : 'Por pouco.' } };
    }
    if (this.phase === 'finalMove' && this.fin) return { wait: { emoji: ghost ? '👻' : '🏃', title: `+${this.fin.moves[p.id] ?? 0} passo(s)`, msg: `Posição ${this.pos.get(p.id)}/${GOAL}` } };
    if (this.phase === 'finalWin') return { wait: { emoji: this.winner === p.id ? '🚪' : '⚰️', title: this.winner === p.id ? 'VOCÊ ESCAPOU!' : 'Preso no hotel pra sempre', msg: '' } };
    return { wait: { emoji: ghost ? '👻' : '🕯️', title: ghost ? 'Você é um fantasma' : 'Olha a TV…', msg: ghost ? 'Continue respondendo pra juntar ectoplasma.' : '' } };
  }

  awards() {
    return [
      this.topStat('correct', 'Enciclopédia Viva', 'Acertou {n} pergunta(s) vivo.'),
      this.topStat('survived', 'Gato de Sete Vidas', 'Sobreviveu a {n} tortura(s).'),
      this.topStat('possessions', 'Exorcista ao Contrário', 'Roubou {n} corpo(s) na fuga.'),
      this.topStat('poisoner', 'Envenenador', 'Acertou o cálice da vítima {n} vez(es).'),
    ];
  }
}
