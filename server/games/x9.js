// X9 — todo mundo responde a mesma pergunta… menos um, que recebeu outra sem saber.
// Depois a sala debate e vota em quem destoou.

import { Game } from '../game.js';
import { pick, shuffle } from '../util.js';
import content from '../../content/x9.js';

const ANSWER_MS = 40_000;
const DRAW_MS = 50_000;
const DISCUSS_MS = 50_000;
const VOTE_MS = 25_000;

export default class X9 extends Game {
  static meta = {
    id: 'x9',
    name: 'X9',
    tag: 'Tem um infiltrado entre nós',
    emoji: '🕵️',
    desc: 'Todo mundo responde a mesma pergunta — menos o X9, que recebeu outra sem saber. Debatam, acusem e descubram quem destoou.',
    min: 4,
    max: 10,
    mins: 15,
    color: '#3ddc84',
    color2: '#2ec4ff',
    kind: 'Dedução',
    rules: [
      'Todo mundo recebe a MESMA pergunta no celular. Menos um: o X9, que recebe uma pergunta parecida… mas diferente.',
      'Ninguém sabe quem é o X9. Nem o próprio X9! Respondam com sinceridade.',
      'As respostas aparecem na TV junto com a pergunta verdadeira. Debatam em voz alta: quem destoou?',
      'Votem no suspeito. Pegou o X9? Pontos pra quem acertou. O X9 escapou? Ele leva tudo.',
    ],
    rulesLine: 'Confiem em ninguém. Principalmente em quem diz confiar em todo mundo.',
    introLines: ['X9! O jogo que vai destruir a confiança desse grupo de amigos.', 'Tem um X9 entre nós. E pode ser você.', 'Bem-vindos ao X9. Aqui todo mundo é suspeito até que se prove o contrário.'],
  };

  async run() {
    await this.intro();
    const rounds = Math.min(5, Math.max(3, this.ids.length - 1));
    const deck = this.room.deck('x9', content.items);
    let last = null;
    for (let r = 1; r <= rounds; r++) {
      const pool = this.ids.filter((id) => id !== last);
      const x9 = pick(pool);
      last = x9;
      await this.playRound(r, rounds, deck.draw(), x9);
    }
  }

  reqFor(item, q, id) {
    const base = { title: 'Responda com sinceridade', prompt: q };
    switch (item.type) {
      case 'number':
        return { ...base, kind: 'number', min: item.min, max: item.max, slider: item.max - item.min > 10 };
      case 'player':
        return { ...base, kind: 'players', options: this.players.map((p) => ({ id: p.id, pid: p.id, label: p.name })) };
      case 'text':
        return { ...base, kind: 'text', max: 40, placeholder: 'Resposta curtinha…' };
      case 'choice':
        return { ...base, kind: 'choice', options: item.options.map((o, i) => ({ id: String(i), label: o })) };
      case 'draw':
        return { ...base, kind: 'draw', title: 'Desenhe rapidinho', palette: ['#1b1033', '#ff3d7f', '#2ec4ff', '#ffd23f', '#3ddc84', '#ffffff'] };
      default:
        return { ...base, kind: 'text', max: 40 };
    }
  }

  async playRound(r, rounds, item, x9) {
    this.roundNo = r;
    this.rounds = rounds;
    this.before = Object.fromEntries(this.scores);
    const cur = (this.cur = { item, x9, answers: new Map(), votes: new Map(), step: -1, caught: null });

    // 1) responder
    this.setPhase('answer');
    this.say(r === 1 ? 'Olhem o celular e respondam com sinceridade. Um de vocês recebeu uma pergunta diferente!' : pick(['Nova pergunta! E um novo X9 entre vocês.', 'Rodada nova. O X9 pode ser qualquer um. Até você.', 'Respondam! E prestem atenção em quem parece suspeito.']));
    for (const id of this.ids) {
      const q = id === x9 ? item.b : item.a;
      this.ask(id, {
        ...this.reqFor(item, q, id),
        on: (p, v) => {
          cur.answers.set(p.id, v);
        },
      });
    }
    await this.waitAnswers(item.type === 'draw' ? DRAW_MS : ANSWER_MS);
    this.reqs.clear();
    if (item.type === 'draw') for (const [id, d] of cur.answers) this.addToGallery(id, d, id === x9 ? item.b : item.a);
    this.sfx('gong');

    // 2) revelar respostas uma a uma, junto com a pergunta VERDADEIRA
    this.order = shuffle(this.ids.filter((id) => cur.answers.has(id)));
    this.setPhase('reveal');
    this.say(`A pergunta era: ${item.a}`);
    await this.sleep(3800);
    for (let i = 0; i < this.order.length; i++) {
      cur.step = i;
      this.sfx('pop');
      this.room.changed();
      await this.sleep(item.type === 'draw' ? 1300 : 1000);
    }
    cur.step = 99;
    this.room.changed();
    await this.sleep(1500);

    // 3) debate
    this.setPhase('discuss');
    this.say(pick(['Debatam! Quem destoou? Acusem sem medo.', 'Agora é hora do barraco. Quem é o X9?', 'Discutam. Alguém aqui está mentindo pra vocês.']), 'hype');
    await this.waitFor(DISCUSS_MS, null, { input: true });

    // 4) votação
    this.setPhase('vote');
    this.say('Votem! Quem é o X9?');
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'players',
        title: 'Quem é o X9?',
        prompt: `A pergunta era: ${item.a}`,
        options: this.players.filter((p) => p.id !== id).map((p) => ({ id: p.id, pid: p.id, label: p.name })),
        on: (p, v) => {
          cur.votes.set(p.id, v);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'players', title: 'Plateia: quem é o X9?', options: this.players.map((p) => ({ id: p.id, pid: p.id, label: p.name })) });
    await this.waitAnswers(VOTE_MS);
    this.reqs.clear();

    // 5) resultado
    const tally = new Map();
    for (const v of cur.votes.values()) tally.set(v, (tally.get(v) ?? 0) + 1);
    const max = Math.max(0, ...tally.values());
    const top = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);
    const caught = max > 0 && top.length === 1 && top[0] === x9;
    cur.caught = caught;
    cur.tally = Object.fromEntries(tally);
    cur.aud = this.audienceTally();
    cur.accused = top;
    for (const [voter, target] of cur.votes) {
      if (voter === x9) continue;
      if (target === x9) {
        this.score(voter, caught ? 600 : 250);
        this.stat(voter, 'detective');
      }
    }
    if (caught) this.stat(x9, 'caught');
    else {
      const wrongVotes = [...cur.votes.entries()].filter(([v, t]) => v !== x9 && t !== x9).length;
      this.score(x9, 1200 + 150 * wrongVotes);
      this.stat(x9, 'escaped');
    }
    for (const [id, n] of tally) if (id !== x9) this.stat(id, 'suspected', n);

    this.setPhase('result');
    cur.revealed = false;
    this.sfx('drumroll');
    this.say(top.length === 1 ? `A sala acusou ${this.name(top[0])}. E o X9 era...` : 'A sala ficou dividida. E o X9 era...');
    await this.sleep(3200);
    cur.revealed = true;
    this.room.changed();
    if (caught) {
      this.sfx('correct');
      this.fx('confetti', {});
      this.say(pick([`${this.name(x9)}! Pegaram o X9 no flagra!`, `Era ${this.name(x9)} mesmo! Não tem como esconder essa cara.`]), 'hype');
    } else {
      this.sfx('fail');
      this.say(pick([`Era ${this.name(x9)}! E escapou lindamente.`, `${this.name(x9)} era o X9 e vocês nem desconfiaram. Vergonha.`, `O X9 era ${this.name(x9)}! Que atuação.`]), 'hype');
    }
    await this.sleep(7500);

    this.setPhase('scores', { before: this.before });
    await this.sleep(r === rounds ? 7000 : 5500);
  }

  formatAnswer(item, v) {
    if (v == null) return null;
    switch (item.type) {
      case 'number':
        return { n: v };
      case 'player':
        return { pid: v };
      case 'choice':
        return { text: item.options[Number(v)] ?? '?' };
      case 'draw':
        return { d: v };
      default:
        return { text: v };
    }
  }

  hostView() {
    const c = this.cur;
    const base = { round: this.roundNo, rounds: this.rounds };
    if (!c) return base;
    const item = c.item;
    switch (this.phase) {
      case 'answer':
        return { ...base, type: item.type };
      case 'reveal':
      case 'discuss':
      case 'vote':
      case 'result': {
        const shown = this.phase === 'reveal' ? c.step : 99;
        const answers = (this.order ?? []).slice(0, shown + 1).map((id) => ({ id, ...this.formatAnswer(item, c.answers.get(id)) }));
        return {
          ...base,
          type: item.type,
          q: item.a,
          min: item.min,
          max: item.max,
          options: item.options,
          answers,
          total: this.order?.length ?? 0,
          tally: this.phase === 'result' ? c.tally : null,
          aud: this.phase === 'result' ? c.aud : null,
          accused: this.phase === 'result' ? c.accused : null,
          x9: this.phase === 'result' && c.revealed ? c.x9 : null,
          qb: this.phase === 'result' && c.revealed ? item.b : null,
          caught: this.phase === 'result' && c.revealed ? c.caught : null,
        };
      }
      case 'scores':
        return { ...base, before: this.pd.before };
      default:
        return base;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const c = this.cur;
    if (!c) return { wait: { emoji: '🕵️', title: 'Olha a TV!', msg: '' } };
    const isX9 = c.x9 === p.id;
    switch (this.phase) {
      case 'answer':
        return { wait: { emoji: '🤐', title: 'Resposta enviada!', msg: 'Agora faz cara de inocente.' } };
      case 'reveal':
      case 'discuss':
        return isX9
          ? { wait: { emoji: '🫣', title: 'VOCÊ É O X9!', msg: `Sua pergunta era outra: "${c.item.b}". Disfarça e convence a galera!` } }
          : { wait: { emoji: '🧐', title: 'Você NÃO é o X9', msg: 'Quem destoou? Debata, acuse, investigue.' } };
      case 'result':
        if (!c.revealed) return { wait: { emoji: '🥁', title: 'Suspense…', msg: '' } };
        return isX9
          ? { wait: { emoji: c.caught ? '🚔' : '😎', title: c.caught ? 'Te pegaram!' : 'Você escapou!', msg: c.caught ? 'Fica pra próxima, X9.' : 'Atuação digna de novela.' } }
          : { wait: { emoji: c.votes.get(p.id) === c.x9 ? '🎯' : '🤦', title: c.votes.get(p.id) === c.x9 ? 'Acertou!' : 'Errou feio', msg: `O X9 era ${this.name(c.x9)}.` } };
      default:
        return { wait: { emoji: '👀', title: 'Olha a TV!', msg: '' } };
    }
  }

  awards() {
    return [
      this.topStat('detective', 'Sherlock da Quebrada', 'Apontou o X9 certo {n} vez(es).'),
      this.topStat('escaped', 'Ator de Novela', 'Escapou como X9 {n} vez(es).'),
      this.topStat('suspected', 'Cara de Culpado', 'Levou {n} voto(s) sem ser o X9.'),
    ];
  }
}
