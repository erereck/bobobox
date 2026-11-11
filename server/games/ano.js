// QUE ANO FOI? — um acontecimento na tela; cada um chuta o ano. Quem chegar mais perto leva.

import { Game } from '../game.js';
import content from '../../content/quiz.js';

const GUESS_MS = 25_000;
const ROUNDS = 7;

export default class Ano extends Game {
  static meta = {
    id: 'ano',
    name: 'Que Ano Foi?',
    tag: 'Chute o ano, acerte na mosca',
    emoji: '📅',
    desc: 'Um acontecimento aparece na TV e todo mundo chuta o ano. Quanto mais perto, mais pontos. Acertou o ano exato? NA MOSCA!',
    min: 1,
    max: 12,
    mins: 8,
    color: '#1fe0c8',
    color2: '#ff7ce5',
    kind: 'Trivia',
    warmup: true,
    rules: [
      'Um acontecimento aparece na TV: algo da história, do Brasil, da cultura pop…',
      'Digite no celular o ano em que você acha que aconteceu.',
      'Quanto mais perto, mais pontos. Acertou o ano exato? É NA MOSCA, bônus!',
      'A última rodada vale o dobro. Sem consultar o Google, hein.',
    ],
    rulesLine: 'Viagem no tempo liberada. Celular com internet, não.',
    introLines: ['Que Ano Foi? O jogo que mostra quem prestou atenção nas aulas de história.', 'Liguem a máquina do tempo! É hora do Que Ano Foi?', 'Que Ano Foi? Prepare-se pra descobrir que você é mais velho do que imagina.'],
  };

  async run() {
    await this.intro();
    const deck = this.room.deck('ano', content.years ?? []);
    for (let r = 1; r <= ROUNDS; r++) await this.round(r, deck.draw(), r === ROUNDS ? 2 : 1);
    this.setPhase('scores', { before: this.before0 ?? {}, final: true });
    await this.sleep(6500);
  }

  async round(r, ev, mult) {
    if (r === 1) this.before0 = Object.fromEntries(this.scores);
    const guesses = new Map();
    this.cur = { r, ev, mult, guesses, revealed: false };
    this.setPhase('guess');
    this.say(r === ROUNDS ? `Última rodada, vale o dobro! ${ev.e}` : ev.e);
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'number',
        keypad: true,
        autoSubmit: false,
        title: `Que ano foi? · ${r}/${ROUNDS}`,
        prompt: ev.e,
        min: 1000,
        max: 2100,
        bot: () => ev.y + Math.round((Math.random() - 0.5) * (Math.random() < 0.3 ? 8 : 60)),
        on: (p, v) => guesses.set(p.id, v),
      });
    }
    this.askAudience({ kind: 'number', keypad: true, autoSubmit: false, title: 'Plateia: que ano foi?', prompt: ev.e, min: 1000, max: 2100 });
    await this.waitAnswers(GUESS_MS);
    this.reqs.clear();

    const aud = [...this.avotes.values()].filter((x) => typeof x === 'number');
    this.cur.audAvg = aud.length ? Math.round(aud.reduce((a, b) => a + b, 0) / aud.length) : null;
    let best = Infinity;
    for (const g of guesses.values()) best = Math.min(best, Math.abs(g - ev.y));
    const results = {};
    for (const [id, g] of guesses) {
      const diff = Math.abs(g - ev.y);
      let pts = Math.max(0, 1000 - diff * 25);
      if (diff === 0) {
        pts += 500;
        this.stat(id, 'bullseye');
      }
      if (diff === best) {
        pts += 250;
        this.stat(id, 'closest');
      }
      pts *= mult;
      this.stat(id, 'error', diff);
      this.score(id, pts);
      results[id] = { g, diff, pts, best: diff === best };
    }
    this.cur.results = results;
    this.setPhase('reveal');
    this.sfx('drumroll');
    await this.sleep(2200);
    this.cur.revealed = true;
    this.room.changed();
    this.sfx('reveal');
    const bulls = Object.entries(results).filter(([, x]) => x.diff === 0).map(([id]) => this.name(id));
    if (bulls.length) {
      this.sfx('lavada');
      this.fx('confetti', {});
      this.say(`${ev.y}! NA MOSCA, ${bulls.join(' e ')}!`, 'hype');
    } else {
      const closest = Object.entries(results).filter(([, x]) => x.best).map(([id]) => this.name(id));
      this.say(closest.length ? `Foi em ${ev.y}! ${closest.join(' e ')} chegou mais perto.` : `Foi em ${ev.y}. Ninguém chutou nada? Sério?`);
    }
    await this.sleep(6200);
  }

  hostView() {
    const c = this.cur;
    if (!c) return {};
    const base = { r: c.r, total: ROUNDS, mult: c.mult };
    switch (this.phase) {
      case 'guess':
        return { ...base, e: c.ev.e };
      case 'reveal':
        return { ...base, e: c.ev.e, y: c.revealed ? c.ev.y : null, results: c.results, audAvg: c.audAvg };
      case 'scores':
        return { before: this.pd.before, final: true };
      default:
        return base;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const c = this.cur;
    if (this.phase === 'reveal' && c?.revealed) {
      const x = c.results[p.id];
      if (!x) return { wait: { emoji: '🫥', title: 'Sem chute', msg: `Foi em ${c.ev.y}.` } };
      return { wait: { emoji: x.diff === 0 ? '🎯' : x.diff <= 5 ? '🔥' : x.diff <= 20 ? '🙂' : '🦕', title: x.diff === 0 ? 'NA MOSCA!' : `Errou por ${x.diff} ano${x.diff > 1 ? 's' : ''}`, msg: `+${x.pts} pontos · foi em ${c.ev.y}` } };
    }
    return { wait: { emoji: '⏳', title: 'Chute enviado!', msg: 'Torce aí.' } };
  }

  awards() {
    const err = this.ids.map((id) => ({ id, v: this.stats.get(id)?.error ?? 0 })).sort((a, b) => b.v - a.v)[0];
    return [
      this.topStat('bullseye', 'Máquina do Tempo', 'Acertou o ano exato {n} vez(es).'),
      this.topStat('closest', 'Historiador', 'Chegou mais perto {n} vez(es).'),
      err && err.v > 0 ? { id: err.id, title: 'Perdido no Tempo', desc: `Errou ${err.v} anos no total.` } : null,
    ];
  }
}
