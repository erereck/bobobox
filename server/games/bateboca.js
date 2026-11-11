// BATE-BOCA — duelo de respostas engraçadas.
// Cada prompt vai pra dois jogadores; a sala vota na melhor resposta.

import { Game } from '../game.js';
import { pick, shuffle } from '../util.js';
import content from '../../content/bateboca.js';

const WRITE_MS = 90_000;
const VOTE_MS = 20_000;
const FINAL_WRITE_MS = 75_000;
const FINAL_VOTE_MS = 30_000;

export default class BateBoca extends Game {
  static meta = {
    id: 'bateboca',
    name: 'Bate-Boca',
    tag: 'Duelo de respostas',
    emoji: '🥊',
    desc: 'Responda prompts absurdos e enfrente outro jogador cara a cara. A sala vota na melhor resposta.',
    min: 3,
    max: 10,
    mins: 15,
    color: '#ff3d7f',
    color2: '#ffd23f',
    kind: 'Escrever',
    warmup: true,
    rules: [
      'Você recebe DOIS prompts no celular. Escreva a resposta mais engraçada que conseguir.',
      'Cada prompt também foi pra OUTRO jogador. Na TV, as duas respostas saem na porrada.',
      'A galera vota na melhor. Levou TODOS os votos? É LAVADA — bônus de pontos!',
      'Na Rodada Final todo mundo responde o mesmo prompt e distribui 3 votos.',
    ],
    rulesLine: 'As regras são simples: seja engraçado. Ou pelo menos tente.',
    introLines: [
      'Bem-vindos ao Bate-Boca! Onde amizades são testadas e piadas são julgadas sem dó.',
      'Bate-Boca! O único lugar onde xingar a resposta do amigo é obrigatório.',
      'Senhoras e senhores, peguem seus celulares. Começa agora o Bate-Boca!',
    ],
  };

  deckPrompts() {
    return this.room.deck(`bb:p:${this.room.settings.family}`, this.room.familyFilter(content.prompts));
  }

  async run() {
    await this.intro();
    for (let round = 1; round <= 2; round++) await this.duelRound(round);
    await this.finalRound();
  }

  // ───────────────────────── rodadas de duelo ─────────────────────────

  async duelRound(round) {
    const ids = shuffle(this.ids);
    const n = ids.length;
    const prompts = this.deckPrompts().drawMany(n);
    // Piadas internas da turma entram misturadas (metade dos prompts, quando houver)
    const custom = this.room.customDeck('bateboca');
    if (custom) for (let k = 0; k < n; k += 2) prompts[k] = { t: custom.draw() };
    this.matchups = prompts.map((pr, k) => ({
      prompt: pr.t,
      a: { id: ids[k], text: null, safety: false },
      b: { id: ids[(k + 1) % n], text: null, safety: false },
    }));
    this.round = round;
    this.before = Object.fromEntries(this.scores);

    this.setPhase('write', { round });
    this.say(round === 1 ? 'Rodada um! Olhem pro celular e escrevam a resposta mais engraçada da vida de vocês.' : 'Rodada dois! Agora os pontos valem o DOBRO. Capricha!');
    for (const id of ids) this.askNext(id);
    await this.waitAnswers(WRITE_MS);
    this.reqs.clear();
    this.sfx('gong');
    await this.sleep(900);

    let i = 0;
    for (const m of this.matchups) {
      i++;
      if (!m.a.text && !m.b.text) continue;
      await this.playDuel(m, i, round);
    }

    this.setPhase('scores', { round, before: this.before });
    this.say(pick(['Vamos ver como tá o placar.', 'Placar! Alguém aí tá passando vergonha.', 'Hora da verdade: o placar.']));
    await this.sleep(7500);
  }

  askNext(id) {
    const mine = this.matchups.filter((m) => m.a.id === id || m.b.id === id);
    const idx = mine.findIndex((m) => (m.a.id === id ? m.a : m.b).text === null);
    if (idx < 0) return;
    const m = mine[idx];
    const slot = m.a.id === id ? m.a : m.b;
    this.ask(id, {
      kind: 'text',
      title: `Prompt ${idx + 1} de ${mine.length}`,
      prompt: m.prompt,
      max: 70,
      placeholder: 'Sua resposta genial…',
      safety: true,
      safetyPool: content.safety,
      on: (p, v, { safety }) => {
        const other = m.a.id === id ? m.b : m.a;
        if (other.text && other.text.toLowerCase() === v.toLowerCase()) return 'Seu adversário escreveu exatamente isso! Tenta outra.';
        slot.text = v;
        slot.safety = safety;
        if (safety) this.stat(id, 'safety');
        this.askNext(id);
      },
    });
  }

  async playDuel(m, idx, round) {
    this.cur = { ...m, idx, total: this.matchups.length, step: 0 };
    this.setPhase('duel', { round });
    this.say(m.prompt);
    await this.sleep(3800);
    this.cur.step = 1;
    this.sfx('pop');
    this.say(m.a.text ?? 'Sem resposta. Que vergonha.');
    this.room.changed();
    await this.sleep(2900);
    this.cur.step = 2;
    this.sfx('pop');
    this.say(m.b.text ?? 'Sem resposta. Que vergonha.');
    this.room.changed();
    await this.sleep(2600);

    const pool = 1000 * round;
    const res = { a: { votes: [], pts: 0 }, b: { votes: [], pts: 0 }, aud: { a: 0, b: 0 }, lavada: null, forfeit: null };

    if (!m.a.text || !m.b.text) {
      // W.O.
      const win = m.a.text ? 'a' : 'b';
      res.forfeit = win;
      res[win].pts = Math.round(pool / 2);
      this.score(m[win].id, res[win].pts);
      this.cur.res = res;
      this.setPhase('result', { round });
      this.say(`${this.name(m[win === 'a' ? 'b' : 'a'].id)} não respondeu, então ${this.name(m[win].id)} leva por W.O.`);
      await this.sleep(5500);
      return;
    }

    const voters = this.ids.filter((id) => id !== m.a.id && id !== m.b.id);
    this.setPhase('vote', { round });
    this.sfx('whoosh');
    const options = [
      { id: 'a', label: m.a.text },
      { id: 'b', label: m.b.text },
    ];
    for (const id of voters) {
      this.ask(id, {
        kind: 'choice',
        title: 'Vote na melhor!',
        prompt: m.prompt,
        options,
        big: true,
        on: (p, v) => {
          res[v].votes.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia, vote!', prompt: m.prompt, options, big: true });
    await this.waitAnswers(VOTE_MS);
    this.reqs.clear();

    const aud = this.audienceTally();
    res.aud = { a: aud.a ?? 0, b: aud.b ?? 0 };
    const audTotal = res.aud.a + res.aud.b;
    // A plateia inteira vale como um voto extra, dividido proporcionalmente
    const wa = res.a.votes.length + (audTotal ? res.aud.a / audTotal : 0);
    const wb = res.b.votes.length + (audTotal ? res.aud.b / audTotal : 0);
    const total = wa + wb;
    if (total > 0) {
      res.a.pts = Math.round((pool * wa) / total);
      res.b.pts = Math.round((pool * wb) / total);
    }
    const nv = res.a.votes.length + res.b.votes.length;
    if (voters.length >= 2 && nv >= 2) {
      if (res.a.votes.length === nv) res.lavada = 'a';
      if (res.b.votes.length === nv) res.lavada = 'b';
    }
    if (res.lavada) {
      res[res.lavada].pts += 250 * round;
      this.stat(m[res.lavada].id, 'lavadas');
    }
    for (const k of ['a', 'b']) {
      if (m[k].safety) res[k].pts = Math.round(res[k].pts / 2);
      this.score(m[k].id, res[k].pts);
      this.stat(m[k].id, 'votes', res[k].votes.length);
    }
    this.cur.res = res;
    this.setPhase('result', { round });
    if (res.lavada) {
      this.sfx('lavada');
      this.fx('shake', {});
      this.say(pick([`LAVADA! ${this.name(m[res.lavada].id)} humilhou!`, `É LAVADA! Ninguém votou em ${this.name(m[res.lavada === 'a' ? 'b' : 'a'].id)}. Nem a mãe.`, `LAVADA HISTÓRICA de ${this.name(m[res.lavada].id)}!`]), 'hype');
    } else if (res.a.votes.length === res.b.votes.length) {
      this.say(pick(['Empate! Ninguém sai feliz.', 'Empatou. Que coisa sem graça.', 'Deu empate. A sala tá dividida.']));
    } else {
      const w = res.a.votes.length > res.b.votes.length ? 'a' : 'b';
      this.say(pick([`Ponto pra ${this.name(m[w].id)}!`, `${this.name(m[w].id)} levou essa.`, `A galera preferiu ${this.name(m[w].id)}.`]));
    }
    await this.sleep(res.lavada ? 7200 : 6200);
  }

  // ───────────────────────── rodada final ─────────────────────────

  async finalRound() {
    const pr = this.room.deck('bb:f', this.room.familyFilter(content.finals)).draw();
    this.final = { prompt: pr.t, answers: new Map(), step: -1 };
    this.before = Object.fromEntries(this.scores);
    this.round = 3;
    this.setPhase('finalIntro');
    this.say('Rodada Final! Todo mundo responde o MESMO prompt. Depois cada um distribui três votos.', 'hype');
    await this.sleep(5500);

    this.setPhase('finalWrite');
    this.say(pr.t);
    for (const id of this.ids) {
      this.ask(id, {
        kind: 'text',
        title: 'RODADA FINAL',
        prompt: pr.t,
        max: 70,
        safety: true,
        safetyPool: content.safety,
        on: (p, v, { safety }) => {
          for (const [oid, a] of this.final.answers) if (oid !== p.id && a.text.toLowerCase() === v.toLowerCase()) return 'Alguém já escreveu isso! Inventa outra.';
          this.final.answers.set(p.id, { text: v, safety, votes: [], aud: 0 });
          if (safety) this.stat(p.id, 'safety');
        },
      });
    }
    await this.waitAnswers(FINAL_WRITE_MS);
    this.reqs.clear();
    this.sfx('gong');
    const list = shuffle([...this.final.answers.entries()]).map(([id, a], i) => ({ key: `r${i}`, id, ...a }));
    this.final.list = list;
    if (!list.length) return;

    this.setPhase('finalShow');
    await this.sleep(1200);
    for (let i = 0; i < list.length; i++) {
      this.final.step = i;
      this.sfx('pop');
      this.say(list[i].text);
      this.room.changed();
      await this.sleep(2300);
    }

    this.setPhase('finalVote');
    this.say('Distribuam seus três votos! Pode votar mais de uma vez na mesma? Não. Pode votar em você? Também não.');
    for (const id of this.ids) {
      const options = list.filter((x) => x.id !== id).map((x) => ({ id: x.key, label: x.text }));
      if (!options.length) continue;
      this.ask(id, {
        kind: 'multi',
        title: 'Escolha até 3 favoritas',
        prompt: pr.t,
        options,
        min: 1,
        max: Math.min(3, options.length),
        on: (p, keys) => {
          for (const k of keys) list.find((x) => x.key === k)?.votes.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'multi', title: 'Plateia: até 3 favoritas', prompt: pr.t, options: list.map((x) => ({ id: x.key, label: x.text })), min: 1, max: 3 });
    await this.waitAnswers(FINAL_VOTE_MS);
    this.reqs.clear();

    const aud = this.audienceTally();
    const audTotal = Object.values(aud).reduce((a, b) => a + b, 0);
    for (const x of list) {
      x.aud = aud[x.key] ?? 0;
      const w = x.votes.length + (audTotal ? (x.aud / audTotal) * 2 : 0);
      x.pts = Math.round(w * 400);
      if (x.safety) x.pts = Math.round(x.pts / 2);
      this.score(x.id, x.pts);
      this.stat(x.id, 'votes', x.votes.length);
    }
    list.sort((a, b) => b.pts - a.pts);
    this.setPhase('finalResult');
    this.sfx('drumroll');
    const top = list[0];
    this.say(top && top.votes.length ? `A resposta mais votada da final foi de ${this.name(top.id)}: ${top.text}` : 'Ninguém votou em nada. Que plateia difícil.', 'hype');
    await this.sleep(Math.min(14_000, 7000 + list.length * 700));

    this.setPhase('scores', { round: 3, before: this.before, final: true });
    await this.sleep(6500);
  }

  // ───────────────────────── views ─────────────────────────

  hostView() {
    const v = { round: this.round };
    switch (this.phase) {
      case 'write':
        return { ...v };
      case 'duel':
      case 'vote':
      case 'result': {
        const c = this.cur;
        const show = this.phase !== 'duel' ? 2 : c.step;
        const reveal = this.phase === 'result';
        return {
          ...v,
          idx: c.idx,
          total: c.total,
          prompt: c.prompt,
          step: show,
          a: { text: show >= 1 ? c.a.text : null, id: reveal ? c.a.id : null, safety: reveal && c.a.safety },
          b: { text: show >= 2 ? c.b.text : null, id: reveal ? c.b.id : null, safety: reveal && c.b.safety },
          res: reveal ? c.res : null,
          pending: this.phase === 'vote' ? (this.pendingIds().length ? [...this.pendingIds(), c.a.id, c.b.id] : []) : null,
        };
      }
      case 'scores':
        return { ...v, before: this.pd.before, final: !!this.pd.final };
      case 'finalWrite':
      case 'finalIntro':
        return { ...v, prompt: this.final?.prompt };
      case 'finalShow':
      case 'finalVote':
        return { ...v, prompt: this.final.prompt, step: this.phase === 'finalVote' ? 99 : this.final.step, answers: this.final.list.map((x) => ({ key: x.key, text: x.text })) };
      case 'finalResult':
        return { ...v, prompt: this.final.prompt, answers: this.final.list.map((x) => ({ key: x.key, id: x.id, text: x.text, votes: x.votes, aud: x.aud, pts: x.pts, safety: x.safety })) };
      default:
        return v;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    if (this.phase === 'write' || this.phase === 'finalWrite') return { wait: { emoji: '✍️', title: 'Respostas enviadas!', msg: 'Agora é esperar os lerdos.' } };
    if ((this.phase === 'vote' || this.phase === 'duel') && this.cur && (this.cur.a.id === p.id || this.cur.b.id === p.id)) {
      return { wait: { emoji: '🥊', title: 'É o SEU duelo!', msg: 'Faz cara de paisagem. Ninguém pode saber que é você.' } };
    }
    if (this.phase === 'result' && this.cur?.res) {
      const side = this.cur.a.id === p.id ? 'a' : this.cur.b.id === p.id ? 'b' : null;
      if (side) {
        const r = this.cur.res[side];
        const lav = this.cur.res.lavada;
        return { wait: { emoji: lav === side ? '🧼' : lav ? '😭' : r.pts ? '🎉' : '🫠', title: lav === side ? 'LAVADA!' : `+${r.pts} pontos`, msg: `${r.votes.length} voto(s) na sua resposta.` } };
      }
    }
    return { wait: { emoji: '👀', title: 'Olha pra TV!', msg: 'O show tá lá.' } };
  }

  audienceView() {
    return { req: this.areq };
  }

  awards() {
    return [
      this.topStat('lavadas', 'Máquina de Lavar', '{n} lavada(s) aplicada(s). Sem dó.'),
      this.topStat('votes', 'Língua Afiada', 'Arrancou {n} votos da galera.'),
      this.topStat('safety', 'Me Salva!', 'Apertou o botão do desespero {n} vez(es).'),
    ];
  }
}
