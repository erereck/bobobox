// ARENA BOBO — sumô de caixinhas em tempo real.
//
// O celular vira controle (joystick + botão de TRANCO) e a TV roda a física.
// A TV é a autoridade: avisa cada queda (`type:'out'`) e o fim da luta
// (`type:'roundEnd'`) via `host:cmd { cmd:'game', ... }`. O servidor só valida,
// pontua e narra. Se a TV nunca responder (sumiu, travou, simulação headless),
// a luta acaba sozinha no tempo-limite com uma ordem sorteada.

import { Game } from '../game.js';
import { clamp, pick, shuffle } from '../util.js';

const COUNT_MS = 5600; // título da rodada + 3, 2, 1
const FIGHT_MS = 90_000; // tempo-limite de segurança (a TV normalmente acaba antes de ~65 s)
const RESULT_MS = 6800;
const SCORES_MS = 6500;
const KNOCK_PTS = 150;

const ROUNDS = [
  {
    id: 'classic',
    name: 'Aquecimento',
    emoji: '🥋',
    desc: 'A plataforma encolhe e brotam power-ups. Empurra com carinho. Ou não.',
    prompt: 'Empurra geral pra fora!',
    slices: false,
    chaos: false,
    mult: 1,
  },
  {
    id: 'slices',
    name: 'Chão Traiçoeiro',
    emoji: '🍕',
    desc: 'Fatias do chão piscam em vermelho e SOMEM. Quem tiver em cima, já era.',
    prompt: 'Foge do chão vermelho!',
    slices: true,
    chaos: false,
    mult: 1,
  },
  {
    id: 'chaos',
    name: 'Caos Total',
    emoji: '🌪️',
    desc: 'Encolhe mais rápido, fatias somem e chove power-up. Vale 1,5×!',
    prompt: 'CAOS! Empurra e reza!',
    slices: true,
    chaos: true,
    mult: 1.5,
  },
];

const COUNT_LINES = [
  ['Rodada um: aquecimento. Empurrem com carinho. Ou não.', 'Primeira rodada! Lembrando: a plataforma não tem grade de proteção. Nem seguro.', 'Rodada um! Quem cair primeiro paga o lanche.'],
  ['Rodada dois: Chão Traiçoeiro! Pedaço vermelho vai sumir. Quem pisar, voa.', 'Rodada dois! Agora o chão também quer te derrubar. Nada pessoal.'],
  ['Rodada final: Caos Total! Vale uma vez e meia. Que vença o mais sem noção.', 'Última rodada! Caos, power-up e zero dignidade. Valendo uma vez e meia!'],
];
const FIRST_PUSHED = [
  (n, by) => `${by} mandou ${n} pro espaço! Primeira vítima!`,
  (n, by) => `E ${n} já era! Cortesia de ${by}.`,
  (n, by) => `${n} saiu voando. Alguém anota a placa do ${by}!`,
];
const FIRST_SOLO = [
  (n) => `${n} caiu sozinho. Ninguém encostou. Ninguém.`,
  (n) => `${n} se jogou da plataforma! Kamikaze total.`,
  (n) => `E ${n} sai primeiro, sem ajuda de ninguém. Talento.`,
];
const PUSHED = [
  (n, by) => `Tchau, ${n}! Cortesia de ${by}.`,
  (n, by) => `${n} foi despachado por ${by}. Sem nota fiscal.`,
  (n, by) => `${by} tá com a mão pesada! Lá se vai ${n}.`,
];
const SOLO = [(n) => `${n} tropeçou no nada e caiu.`, (n) => `${n} achou que sabia voar.`];
const FINAL_TWO = [(a, b) => `Só sobraram ${a} e ${b}! Mano a mano!`, (a, b) => `${a} contra ${b}! Agora é pessoal.`];
const WIN_LINES = [
  (w) => `${w} é o último em pé! Sumô de respeito.`,
  (w) => `${w} venceu a rodada! Alguém chama a ambulância pros outros.`,
  (w) => `Vitória de ${w}! Empurrou, sobreviveu, lacrou.`,
];

export default class Arena extends Game {
  static meta = {
    id: 'arena',
    name: 'Arena Bobo',
    tag: 'Sumô de caixinhas',
    emoji: '🤼',
    desc: 'O celular vira controle: joystick pra andar e botão pra dar TRANCO. Empurre todo mundo pra fora da plataforma e seja a última caixinha em pé.',
    min: 2,
    max: 12,
    mins: 8,
    color: '#ff8a3d',
    color2: '#2ec4ff',
    kind: 'Ação',
    rules: [
      'Seu celular virou CONTROLE: o joystick move sua caixinha e o botão dá um TRANCO (tem recarga, não vicia).',
      'Empurre os outros pra fora da plataforma. Caiu, tá fora da rodada. A última caixinha em pé vence!',
      'A plataforma ENCOLHE, fatias do chão somem e brotam power-ups: 🧲 ímã, 📦 caixa gigante, 🧊 gelo e ⚡ turbo.',
      'Três rodadas. Pontos pela colocação e bônus pra cada caixinha que você derrubar.',
    ],
    rulesLine: 'Regra número um: não tem regra. Regra número dois: empurra.',
    introLines: [
      'Bem-vindos à Arena Bobo! Sumô de caixinhas, onde amizade não vale nada.',
      'Arena Bobo! Peguem o celular, que hoje alguém vai voar da plataforma.',
      'Senhoras e senhores, a Arena Bobo! Empurrar o amigo nunca foi tão incentivado.',
    ],
  };

  constructor(room, opts) {
    super(room, opts);
    this.round = 0;
    this.outs = []; // [{ id, by }] na ordem das quedas avisadas pela TV
    this.res = null;
    this.roundOver = false;
    this.goAt = 0;
    this.lastSayAt = 0;
    this.before = {};
  }

  get mode() {
    return ROUNDS[clamp(this.round - 1, 0, ROUNDS.length - 1)];
  }

  /** Lutadores ainda na sala (quem foi expulso some da arena). */
  fighters() {
    return this.ids.filter((id) => this.room.players.has(id));
  }

  async run() {
    await this.intro();
    for (let r = 1; r <= ROUNDS.length; r++) await this.playRound(r);
  }

  async playRound(r) {
    this.round = r;
    const mode = this.mode;
    this.before = Object.fromEntries(this.scores);
    this.outs = [];
    this.res = null;
    this.roundOver = false;

    // 1) Contagem regressiva (a TV mostra o título e depois 3, 2, 1 até goAt)
    this.goAt = Date.now() + COUNT_MS * this.room.timeScale;
    this.setPhase('countdown', { round: r });
    this.say(pick(COUNT_LINES[r - 1]), r === ROUNDS.length ? 'hype' : 'normal');
    await this.sleep(COUNT_MS);

    // 2) Luta: todo mundo vira controle. Ninguém "responde" — quem encerra é a TV (ou o tempo-limite).
    this.setPhase('fight', { round: r });
    for (const id of this.ids) {
      this.ask(id, { kind: 'joystick', title: `Rodada ${r}`, prompt: mode.prompt, button: 'TRANCO!' });
    }
    await this.waitFor(FIGHT_MS, () => this.roundOver);
    this.reqs.clear();
    if (!this.res) this.res = this.fallbackResult();
    this.applyResult(this.res, mode.mult);

    // 3) Resultado da rodada
    this.setPhase('roundResult', { round: r });
    const w = this.res.order[0];
    if (this.res.source === 'timeout' && this.res.survivors > 1) {
      this.say(`Acabou o tempo com gente demais em pé! Decidi no sorteio: ${this.name(w)} leva. Reclamações com o síndico.`);
    } else if (w) {
      this.say(pick(WIN_LINES)(this.name(w)), 'hype');
    }
    await this.sleep(RESULT_MS);

    // 4) Placar
    this.setPhase('scores', { round: r, before: this.before });
    this.say(
      r === ROUNDS.length
        ? 'Fim da pancadaria! Placar final.'
        : pick(['Placar! Vamos ver quem tá mandando no ringue.', 'Hora do placar. Uns empurram, outros são empurrados.', 'Placar! Alonguem o dedão que vem mais.']),
    );
    await this.sleep(SCORES_MS);
  }

  // ───────────────────────── comandos da TV ─────────────────────────

  hostInput(data) {
    if (!data || typeof data !== 'object') return { error: 'Comando inválido' };
    if (this.phase !== 'fight' || Number(data.phaseId) !== this.phaseId || this.roundOver) return { error: 'Fora de hora' };
    if (data.type === 'out') return this.onOut(data);
    if (data.type === 'roundEnd') return this.onRoundEnd(data);
    return { error: 'Comando desconhecido' };
  }

  onOut(data) {
    const id = typeof data.id === 'string' ? data.id : '';
    if (!this.ids.includes(id) || this.outs.some((o) => o.id === id)) return { error: 'Jogador inválido' };
    const by = typeof data.by === 'string' && data.by !== id && this.ids.includes(data.by) ? data.by : null;
    this.outs.push({ id, by });
    this.reqs.delete(id); // o celular troca o joystick por "Você caiu!"
    this.narrateOut(id, by);
    this.room.changed();
    return { ok: true };
  }

  narrateOut(id, by) {
    const out = new Set(this.outs.map((o) => o.id));
    const alive = this.fighters().filter((x) => !out.has(x));
    if (alive.length <= 1) return; // a rodada tá acabando; o vencedor ganha fala própria
    const n = this.name(id);
    const b = by ? this.name(by) : null;
    const t = Date.now();
    let line = null;
    let mood = 'normal';
    if (this.outs.length === 1) line = b ? pick(FIRST_PUSHED)(n, b) : pick(FIRST_SOLO)(n);
    else if (alive.length === 2 && this.fighters().length > 2) {
      line = pick(FINAL_TWO)(this.name(alive[0]), this.name(alive[1]));
      mood = 'hype';
    } else if (t - this.lastSayAt > 3500 * this.room.timeScale && Math.random() < 0.45) line = b ? pick(PUSHED)(n, b) : pick(SOLO)(n);
    if (line) {
      this.lastSayAt = t;
      this.say(line, mood);
    }
  }

  onRoundEnd(data) {
    const valid = new Set(this.ids);
    const order = [];
    for (const id of Array.isArray(data.order) ? data.order.slice(0, 64) : []) {
      if (typeof id === 'string' && valid.has(id) && !order.includes(id)) order.push(id);
    }
    if (!order.length) return { error: 'Ordem inválida' };
    // Quem a TV não listou vai pro fim (sorteado).
    order.push(...shuffle(this.ids.filter((id) => !order.includes(id))));

    const n = this.ids.length;
    const num = (obj, id, hi) => {
      const v = obj && typeof obj === 'object' ? Number(obj[id]) : NaN;
      return Number.isFinite(v) ? clamp(Math.round(v), 0, hi) : 0;
    };
    const knocks = {};
    const times = {};
    const dashes = {};
    const pups = {};
    let budget = Math.max(0, n - 1); // não dá pra derrubar mais gente do que caiu
    for (const id of order) {
      const k = Math.min(num(data.knocks, id, n - 1), budget);
      budget -= k;
      if (k) knocks[id] = k;
      const t = num(data.times, id, 600);
      if (t) times[id] = t;
      const d = num(data.dashes, id, 999);
      if (d) dashes[id] = d;
      const p = num(data.pups, id, 99);
      if (p) pups[id] = p;
    }
    const soloSet = new Set(Array.isArray(data.solo) ? data.solo.filter((id) => typeof id === 'string' && valid.has(id) && id !== order[0]) : []);
    this.res = { order, knocks, solo: [...soloSet], times, dashes, pups, source: 'tv', survivors: 1 };
    this.roundOver = true;
    this.poke();
    return { ok: true };
  }

  /** Plano B (TV muda/sumiu ou alguém pulou a luta): vivos sorteados na frente, depois as quedas ao contrário. */
  fallbackResult() {
    const outIds = this.outs.map((o) => o.id);
    const alive = shuffle(this.ids.filter((id) => !outIds.includes(id)));
    const order = [...alive, ...[...outIds].reverse()];
    const knocks = {};
    for (const o of this.outs) if (o.by) knocks[o.by] = (knocks[o.by] ?? 0) + 1;
    const solo = this.outs.filter((o) => !o.by).map((o) => o.id);
    return { order, knocks, solo, times: {}, dashes: {}, pups: {}, source: 'timeout', survivors: alive.length };
  }

  applyResult(res, mult) {
    const n = res.order.length;
    res.rows = res.order.map((id, k) => {
      const kn = res.knocks[id] ?? 0;
      const base = n > 1 ? (800 * (n - 1 - k)) / (n - 1) : 800;
      const pts = Math.round(((base + (k === 0 ? 200 : 0) + kn * KNOCK_PTS) * mult) / 10) * 10;
      this.score(id, pts);
      if (kn) this.stat(id, 'knocks', kn);
      if (k === 0) this.stat(id, 'wins');
      if (res.times[id]) this.stat(id, 'survive', res.times[id]);
      if (res.dashes[id]) this.stat(id, 'dashes', res.dashes[id]);
      if (res.pups[id]) this.stat(id, 'pups', res.pups[id]);
      return { id, place: k + 1, pts, knocks: kn, solo: res.solo.includes(id) };
    });
    for (const id of res.solo) this.stat(id, 'solo');
    // Primeiro a cair: só conta se alguém caiu de verdade (no tempo-limite sem TV ninguém caiu)
    const firstOut = res.source === 'tv' ? res.order[n - 1] : this.outs[0]?.id;
    if (firstOut && n > 1) this.stat(firstOut, 'firstOut');
  }

  // ───────────────────────── views ─────────────────────────

  hostView() {
    const m = this.mode;
    const base = {
      round: this.round,
      total: ROUNDS.length,
      mode: { id: m.id, name: m.name, emoji: m.emoji, desc: m.desc, slices: m.slices, chaos: m.chaos, mult: m.mult },
    };
    switch (this.phase) {
      case 'countdown':
        return { ...base, fighters: this.fighters(), goAt: this.goAt };
      case 'fight':
        return { ...base, fighters: this.fighters(), outs: this.outs.map((o) => o.id) };
      case 'roundResult':
        return { ...base, fighters: this.fighters(), rows: this.res?.rows ?? [], source: this.res?.source ?? 'tv' };
      case 'scores':
        return { ...base, before: this.pd.before ?? {}, final: this.round === ROUNDS.length };
      default:
        return base;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    const m = this.mode;
    switch (this.phase) {
      case 'countdown':
        return { wait: { emoji: m.emoji, title: `Rodada ${this.round}: ${m.name}`, msg: 'Prepara o dedão! O controle aparece no VAI.' } };
      case 'fight': {
        const o = this.outs.find((x) => x.id === p.id);
        if (o) {
          return {
            wait: {
              emoji: '💀',
              title: 'Você caiu!',
              msg: o.by ? `Cortesia de ${this.name(o.by)}. Anota o nome pra vingança.` : 'Caiu sozinho. Ninguém encostou em você. Ninguém.',
            },
          };
        }
        break;
      }
      case 'roundResult': {
        const row = this.res?.rows?.find((r) => r.id === p.id);
        if (row) {
          const emoji = row.place === 1 ? '🏆' : row.place === 2 ? '🥈' : row.place === 3 ? '🥉' : '💀';
          return { wait: { emoji, title: `${row.place}º lugar`, msg: `+${row.pts} pontos${row.knocks ? ` · derrubou ${row.knocks}` : ''}` } };
        }
        break;
      }
      case 'scores':
        return { wait: { emoji: '📊', title: 'Placar na TV!', msg: this.round < ROUNDS.length ? 'Alonga o dedão que vem mais.' : 'Acabou a pancadaria.' } };
    }
    return { wait: { emoji: '👀', title: 'Olha a TV!', msg: '' } };
  }

  awards() {
    return [
      this.topStat('knocks', 'Trator', 'Derrubou {n} caixinha(s) da plataforma. Sem dó nem piedade.'),
      this.topStat('survive', 'Sabonete', 'Ficou {n} segundos em pé, escorregando de todo mundo.'),
      this.topStat('solo', 'Kamikaze', 'Se jogou da plataforma sozinho {n} vez(es). Ninguém encostou.'),
      this.topStat('firstOut', 'Pão com Manteiga', 'Foi o primeiro a cair {n} vez(es). Sempre do lado errado.'),
      this.topStat('dashes', 'Dedo Nervoso', 'Deu {n} trancos. Calma, criatura.'),
      this.topStat('pups', 'Consumista', 'Pegou {n} power-up(s). Não pode ver uma promoção.'),
    ]
      .filter(Boolean)
      .slice(0, 4);
  }
}
