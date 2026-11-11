// BATALHA DE RIMA — MCs completam provocações rimadas; a TV "canta" tudo com voz sintetizada
// em cima do beat; a galera decide quem levou.

import { Game } from '../game.js';
import { pick, sample, shuffle } from '../util.js';
import content from '../../content/rima.js';

const WRITE_MS = 100_000;
const VOTE_MS = 18_000;
const BOBO = 'bobo';

export default class Rima extends Game {
  static meta = {
    id: 'rima',
    name: 'Batalha de Rima',
    tag: 'Rima, beat e humilhação',
    emoji: '🎤',
    desc: 'Duelos de MC: complete provocações rimadas contra seu adversário. A TV solta o beat e rima tudo em voz alta. A galera escolhe quem amassou.',
    min: 3,
    max: 8,
    mins: 20,
    color: '#a77bff',
    color2: '#ffd23f',
    kind: 'Escrever',
    font: 'bungee',
    rules: [
      'Você vira MC e enfrenta outro jogador numa batalha de rima.',
      'No celular aparece o começo de um verso contra o seu adversário. Complete com uma rima afiada — tem sugestões de palavras que rimam.',
      'Na TV, o beat rola e os versos são cantados em voz alta. Sem dó.',
      'A galera vota em quem amassou. Ganhou de todo mundo? É NOCAUTE.',
    ],
    rulesLine: 'Respeitem o beat. E zoem o adversário com carinho. Ou não.',
    introLines: ['Solta o beat! Começou a Batalha de Rima!', 'Bem-vindos à Batalha de Rima, onde a amizade termina e a rima começa!', 'Aqui é Batalha de Rima, rapaziada! Mão pro alto!'],
  };

  async run() {
    await this.intro();
    for (let r = 1; r <= 2; r++) await this.round(r);
  }

  mcName(id) {
    return id === BOBO ? 'MC Bobo' : `MC ${this.name(id)}`;
  }

  async round(r) {
    this.roundNo = r;
    this.before = Object.fromEntries(this.scores);
    const ids = shuffle(this.ids);
    const pairs = [];
    for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1] ?? BOBO]);
    const deck = this.room.deck('rima', content.setups);
    this.battles = pairs.map(([a, b]) => ({
      a,
      b,
      verses: [],
    }));
    // cada MC recebe 2 setups contra o adversário; versos alternam A1 B1 A2 B2
    for (const bt of this.battles) {
      const sa = deck.drawMany(2);
      const sb = deck.drawMany(2);
      for (let k = 0; k < 2; k++) {
        bt.verses.push({ by: bt.a, vs: bt.b, setup: sa[k], l1: sa[k].l.replace('{alvo}', this.mcName(bt.b)), l2: null });
        bt.verses.push({ by: bt.b, vs: bt.a, setup: sb[k], l1: sb[k].l.replace('{alvo}', this.mcName(bt.a)), l2: null });
      }
      // MC Bobo rima sozinho
      for (const v of bt.verses) if (v.by === BOBO) v.l2 = pick(v.setup.fb);
    }

    this.setPhase('write', { round: r });
    this.say(r === 1 ? 'Olhem o celular, MCs! Completem os versos contra o adversário. Rimem!' : 'Segundo round! Novos adversários, pontos em dobro. Caprichem nessa rima!');
    for (const id of this.ids) this.askVerse(id);
    await this.waitAnswers(WRITE_MS);
    this.reqs.clear();
    for (const bt of this.battles) for (const v of bt.verses) if (!v.l2) v.l2 = null;
    this.sfx('scratch');

    let i = 0;
    for (const bt of this.battles) await this.playBattle(bt, ++i, r);

    this.setPhase('scores', { before: this.before, round: r });
    this.say(pick(['Placar da batalha!', 'Vamos ver quem tá dominando a roda.']));
    await this.sleep(7000);
  }

  askVerse(id) {
    const bt = this.battles.find((b) => b.a === id || b.b === id);
    if (!bt) return;
    const mine = bt.verses.filter((v) => v.by === id);
    const idx = mine.findIndex((v) => v.l2 === null);
    if (idx < 0) return;
    const v = mine[idx];
    this.ask(id, {
      kind: 'text',
      title: `Verso ${idx + 1} de 2 · contra ${this.mcName(v.vs)}`,
      prompt: v.l1,
      sub: 'Complete com o 2º verso — termina rimando!',
      hints: sample(v.setup.rhymes, 6),
      max: 70,
      safety: true,
      safetyPool: v.setup.fb,
      botPool: v.setup.fb,
      placeholder: '…e termina rimando',
      on: (p, text) => {
        v.l2 = text;
        this.askVerse(id);
      },
    });
  }

  verseMs(v) {
    const chars = (v.l1?.length ?? 0) + (v.l2?.length ?? 0);
    return Math.max(4200, Math.min(12_000, 2000 + chars * 75));
  }

  async playBattle(bt, idx, r) {
    this.cur = { ...bt, idx, total: this.battles.length, verse: -1, res: null };
    this.setPhase('faceoff');
    this.sfx('airhorn');
    this.say(`${this.mcName(bt.a)} contra ${this.mcName(bt.b)}! Solta o beat!`, 'hype');
    await this.sleep(4200);

    this.setPhase('battle');
    await this.sleep(1600);
    for (let k = 0; k < bt.verses.length; k++) {
      this.cur.verse = k;
      this.room.changed();
      const v = bt.verses[k];
      await this.sleep(v.l2 ? this.verseMs(v) : 3200);
    }
    this.cur.verse = 99;
    this.room.changed();
    this.sfx('airhorn');
    await this.sleep(1600);

    // votação
    const voters = this.ids.filter((id) => id !== bt.a && id !== bt.b);
    const options = [
      { id: 'a', label: this.mcName(bt.a), pid: bt.a === BOBO ? undefined : bt.a, emoji: '🎤' },
      { id: 'b', label: this.mcName(bt.b), pid: bt.b === BOBO ? undefined : bt.b, emoji: '🎤' },
    ];
    const res = { a: [], b: [], aud: {}, pts: { a: 0, b: 0 }, ko: null };
    this.cur.res = null;
    this.setPhase('vote');
    this.say('Quem ganhou essa? Votem!');
    for (const id of voters) {
      this.ask(id, {
        kind: 'choice',
        title: 'Quem amassou?',
        options,
        big: true,
        on: (p, v) => {
          res[v].push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia: quem amassou?', options, big: true });
    await this.waitAnswers(VOTE_MS);
    this.reqs.clear();

    const aud = this.audienceTally();
    res.aud = { a: aud.a ?? 0, b: aud.b ?? 0 };
    const at = res.aud.a + res.aud.b;
    const wa = res.a.length + (at ? res.aud.a / at : 0);
    const wb = res.b.length + (at ? res.aud.b / at : 0);
    const pool = 1000 * r;
    if (wa + wb > 0) {
      res.pts.a = Math.round((pool * wa) / (wa + wb));
      res.pts.b = Math.round((pool * wb) / (wa + wb));
    }
    const nv = res.a.length + res.b.length;
    if (voters.length >= 2 && nv >= 2 && (res.a.length === nv || res.b.length === nv)) {
      res.ko = res.a.length === nv ? 'a' : 'b';
      res.pts[res.ko] += 300 * r;
    }
    for (const k of ['a', 'b']) {
      const id = bt[k];
      if (id === BOBO) continue;
      this.score(id, res.pts[k]);
      this.stat(id, 'votes', res[k].length);
      if (res.ko === k) this.stat(id, 'ko');
    }
    // versos "me salva" perdem o brilho (mas não os pontos — rima é rima)
    this.cur.res = res;
    this.setPhase('result');
    const win = res.a.length > res.b.length ? 'a' : res.b.length > res.a.length ? 'b' : null;
    if (res.ko) {
      this.sfx('lavada');
      this.fx('shake', {});
      this.say(`NOCAUTE! ${this.mcName(bt[res.ko])} amassou sem dó!`, 'hype');
    } else if (win) {
      this.sfx('airhorn');
      this.say(`${this.mcName(bt[win])} leva essa batalha!`, 'hype');
    } else {
      this.sfx('boing');
      this.say('Empate! A roda ficou dividida.');
    }
    if (win && bt[win] === BOBO) this.say('O MC Bobo venceu! Eu sou uma caixa e rimei melhor que vocês. Pensem nisso.', 'hype');
    await this.sleep(6500);
  }

  hostView() {
    const c = this.cur;
    switch (this.phase) {
      case 'write':
        return { round: this.roundNo };
      case 'faceoff':
      case 'battle':
      case 'vote':
      case 'result':
        return {
          round: this.roundNo,
          idx: c.idx,
          total: c.total,
          a: c.a,
          b: c.b,
          names: { a: this.mcName(c.a), b: this.mcName(c.b) },
          verse: c.verse,
          verses: c.verses.map((v) => ({ by: v.by === c.a ? 'a' : 'b', l1: v.l1, l2: v.l2, ms: this.verseMs(v) * this.room.timeScale })),
          beat: this.roundNo === 1 ? 'boombap' : 'funk',
          res: this.phase === 'result' ? c.res : null,
        };
      case 'scores':
        return { round: this.roundNo, before: this.pd.before };
      default:
        return { round: this.roundNo };
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const c = this.cur;
    if (this.phase === 'write') return { wait: { emoji: '🎤', title: 'Rimas enviadas!', msg: 'Aquece a garganta (mesmo que seja a TV que vai cantar).' } };
    if (c && (c.a === p.id || c.b === p.id)) {
      if (this.phase === 'result' && c.res) {
        const k = c.a === p.id ? 'a' : 'b';
        return { wait: { emoji: c.res.ko === k ? '🥊' : c.res[k].length >= c.res[k === 'a' ? 'b' : 'a'].length ? '🔥' : '🥲', title: c.res.ko === k ? 'NOCAUTE!' : `+${c.res.pts[k]} pontos`, msg: `${c.res[k].length} voto(s) da roda` } };
      }
      return { wait: { emoji: '🎙️', title: 'É a SUA batalha!', msg: 'Faz pose de MC e encara o adversário.' } };
    }
    return { wait: { emoji: '🙌', title: 'Mão pro alto!', msg: 'Faz barulho pra roda!' } };
  }

  awards() {
    return [this.topStat('ko', 'Nocauteador', 'Aplicou {n} nocaute(s).'), this.topStat('votes', 'Rei da Roda', 'Levou {n} voto(s) nas batalhas.')];
  }
}
