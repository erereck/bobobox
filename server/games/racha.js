// RACHA A SALA — complete um dilema de um jeito que divida a galera exatamente ao meio.

import { Game } from '../game.js';
import { pick, shuffle } from '../util.js';
import content from '../../content/racha.js';
import botContent from '../../content/bots.js';

const WRITE_MS = 70_000;
const VOTE_MS = 15_000;

export default class Racha extends Game {
  static meta = {
    id: 'racha',
    name: 'Racha a Sala',
    tag: 'Divida a galera ao meio',
    emoji: '⚖️',
    desc: 'Complete dilemas absurdos pra que METADE da sala diga sim e metade diga não. Quanto mais dividido, mais pontos.',
    min: 3,
    max: 12,
    mins: 15,
    color: '#ffd23f',
    color2: '#ff3d7f',
    kind: 'Escrever',
    warmup: true,
    rules: [
      'Você recebe um dilema incompleto, tipo "Você ganha um milhão, mas ___".',
      'Complete de um jeito que deixe a galera DIVIDIDA.',
      'Todo mundo vota SIM ou NÃO. Se a sala rachar ao meio, você ganha o máximo de pontos.',
      'Unanimidade é fracasso. Rachar é arte.',
    ],
    rulesLine: 'Aqui o objetivo é causar a maior treta possível. Com classe.',
    introLines: ['Racha a Sala! O jogo que testa amizades e decisões questionáveis.', 'Bem-vindos ao Racha a Sala, onde a meta é discordar.', 'Racha a Sala! Preparem-se pra descobrir quem vocês realmente são.'],
  };

  async run() {
    await this.intro();
    for (let r = 1; r <= 2; r++) await this.round(r);
  }

  async round(r) {
    this.roundNo = r;
    this.before = Object.fromEntries(this.scores);
    const deck = this.room.deck(`racha:${this.room.settings.family}`, this.room.familyFilter(content.scenarios));
    this.items = [];
    this.setPhase('write', { round: r });
    this.say(r === 1 ? 'Completem o dilema no celular. Lembrem: o objetivo é rachar a sala no meio!' : 'Rodada dois, pontos em dobro! Rachem sem dó.');
    for (const id of this.ids) {
      const sc = deck.draw();
      const item = { id, t: sc.t, q: sc.q, fill: null, yes: [], no: [] };
      this.items.push(item);
      this.ask(id, {
        kind: 'text',
        title: 'Complete pra rachar a sala',
        prompt: sc.t,
        sub: sc.q,
        max: 70,
        safety: true,
        safetyPool: botContent.splits,
        botPool: botContent.splits,
        placeholder: 'Complete a lacuna…',
        on: (p, v) => {
          item.fill = v;
        },
      });
    }
    await this.waitAnswers(WRITE_MS);
    this.reqs.clear();
    this.sfx('gong');

    const list = shuffle(this.items.filter((x) => x.fill));
    for (let i = 0; i < list.length; i++) await this.playItem(list[i], i + 1, list.length, r);

    this.setPhase('scores', { before: this.before, round: r });
    this.say(pick(['Vamos ao placar dos causadores de treta.', 'Placar! Quem dividiu mais a galera?']));
    await this.sleep(7000);
  }

  async playItem(item, idx, total, r) {
    this.cur = { ...item, idx, total, res: null };
    const text = item.t.replace(/_{3,}/, item.fill);
    this.setPhase('show');
    this.say(`${text} ${item.q}`);
    await this.sleep(Math.min(7000, 2600 + text.length * 45));

    const voters = this.ids.filter((id) => id !== item.id);
    this.setPhase('vote');
    const options = [
      { id: 'yes', label: 'SIM', emoji: '👍', color: '#3ddc84' },
      { id: 'no', label: 'NÃO', emoji: '👎', color: '#ff5c5c' },
    ];
    for (const id of voters) {
      this.ask(id, {
        kind: 'choice',
        title: item.q,
        prompt: text,
        options,
        big: true,
        on: (p, v) => {
          item[v].push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: item.q, prompt: text, options, big: true });
    await this.waitAnswers(VOTE_MS);
    this.reqs.clear();

    const Y = item.yes.length;
    const N = item.no.length;
    const V = Y + N;
    const half = Math.floor(V / 2);
    const split = V >= 2 && half > 0 ? Math.min(Y, N) / half : 0;
    const pts = Math.round(1000 * r * split);
    const perfect = V >= 2 && split === 1;
    this.score(item.id, pts);
    if (perfect) this.stat(item.id, 'perfect');
    if (V >= 2 && (Y === 0 || N === 0)) this.stat(item.id, 'unanimous');
    this.stat(item.id, 'splitSum', Math.round(split * 100));
    const aud = this.audienceTally();
    this.cur.res = { yes: item.yes, no: item.no, pts, perfect, aud: { yes: aud.yes ?? 0, no: aud.no ?? 0 } };
    this.setPhase('result');
    this.sfx('drumroll');
    await this.sleep(1700);
    this.cur.res.shown = true;
    this.room.changed();
    if (perfect) {
      this.sfx('lavada');
      this.fx('shake', {});
      this.say(pick([`RACHOU! ${this.name(item.id)} dividiu a sala no meio!`, `Sala rachada com sucesso por ${this.name(item.id)}!`]), 'hype');
    } else if (V >= 2 && (Y === 0 || N === 0)) {
      this.sfx('fail');
      this.say(pick([`Unanimidade! Todo mundo concordou. ${this.name(item.id)} fracassou lindamente.`, `Zero treta. Que decepção, ${this.name(item.id)}.`]));
    } else {
      this.sfx('coin');
      this.say(`${Y} sim, ${N} não. ${this.name(item.id)} leva ${pts} pontos.`);
    }
    await this.sleep(5600);
  }

  hostView() {
    const c = this.cur;
    switch (this.phase) {
      case 'write':
        return { round: this.roundNo };
      case 'show':
      case 'vote':
      case 'result':
        return {
          round: this.roundNo,
          idx: c.idx,
          total: c.total,
          t: c.t,
          fill: c.fill,
          q: c.q,
          author: this.phase === 'result' && c.res?.shown ? c.id : null,
          res: this.phase === 'result' ? { ...c.res, yes: c.res.shown ? c.res.yes : [], no: c.res.shown ? c.res.no : [] } : null,
          pending: this.phase === 'vote' ? (this.pendingIds().length ? [...this.pendingIds(), c.id] : []) : null,
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
    if (this.cur && this.cur.id === p.id && (this.phase === 'show' || this.phase === 'vote')) return { wait: { emoji: '🤞', title: 'É o SEU dilema!', msg: 'Torce pra rachar no meio.' } };
    if (this.phase === 'result' && this.cur?.id === p.id && this.cur.res?.shown) return { wait: { emoji: this.cur.res.perfect ? '🪓' : '📊', title: `+${this.cur.res.pts} pontos`, msg: `${this.cur.res.yes.length} sim × ${this.cur.res.no.length} não` } };
    if (this.phase === 'write') return { wait: { emoji: '✍️', title: 'Enviado!', msg: 'Esperando o resto da galera.' } };
    return { wait: { emoji: '👀', title: 'Olha a TV!', msg: '' } };
  }

  awards() {
    return [
      this.topStat('perfect', 'Machado de Ouro', 'Rachou a sala no meio {n} vez(es).'),
      this.topStat('unanimous', 'Paz Mundial', 'Conseguiu {n} unanimidade(s). Isso é ruim aqui.'),
    ];
  }
}
