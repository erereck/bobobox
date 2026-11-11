// ESTAMPA BRABA — desenhe estampas, escreva frases de camiseta, monte camisetas com as
// peças dos OUTROS e jogue tudo num mata-mata na TV. A sala vota; a campeã vira lenda.
//
// Fases: intro → draw (x2) → write → build → lineup → [bracket → duel → vote → result]* → champion → scores

import { Game } from '../game.js';
import { pick, rand, shuffle, similar, randomScribble } from '../util.js';
import content from '../../content/estampa.js';

const DRAW_MS = 60_000;
const WRITE_MS = 80_000;
const BUILD_MS = 100_000;
const VOTE_MS = 16_000;
const FINAL_VOTE_MS = 22_000;

const DRAWS_EACH = 2;
const LINES_EACH = 3;
const SHIRTS_EACH = 2;
const HAND_DRAW = 4;
const HAND_LINE = 5;
const LINE_MAX = 45;

// Pontuação
const VOTE_PTS = 100; // por voto recebido, pra quem montou a camiseta
const WIN_PTS = 200; // por duelo vencido
const KO_PTS = 200; // nocaute: levou todos os votos dos jogadores
const CHAMP_PTS = 1000; // camiseta campeã, pra quem montou
const AUTHOR_PTS = 25; // por voto, pro autor do desenho e pro autor da frase usados
const CHAMP_AUTHOR_PTS = 250; // autor do desenho / da frase da campeã

const PALETTE = ['#1b1033', '#ffffff', '#ff3d7f', '#ff5c5c', '#ff8a3d', '#ffd23f', '#b6e33d', '#3ddc84', '#1fe0c8', '#2ec4ff', '#5c7cff', '#a77bff', '#8b5a2b', '#ffb3a7', '#9a96a8'];

/** Cores de camiseta: `hex` é o tecido, `txt` é a cor da frase estampada. */
const SHIRT_COLORS = [
  { id: 'branca', label: 'Branca', hex: '#f7f4ec', txt: '#ff3d7f' },
  { id: 'amarela', label: 'Amarelo-gema', hex: '#ffd23f', txt: '#ff3d7f' },
  { id: 'rosa', label: 'Rosa-chiclete', hex: '#ff6fb1', txt: '#ffe14d' },
  { id: 'vermelha', label: 'Vermelho-paixão', hex: '#ff5050', txt: '#ffe14d' },
  { id: 'laranja', label: 'Laranja-mexerica', hex: '#ff9a3d', txt: '#ffffff' },
  { id: 'limao', label: 'Verde-limão', hex: '#a6e35a', txt: '#ff3d7f' },
  { id: 'menta', label: 'Menta', hex: '#7fe8cf', txt: '#ffffff' },
  { id: 'piscina', label: 'Azul-piscina', hex: '#45c2ff', txt: '#ffe14d' },
  { id: 'acai', label: 'Roxo-açaí', hex: '#9b6bff', txt: '#ffe14d' },
  { id: 'lilas', label: 'Lilás', hex: '#cdb6ff', txt: '#ffffff' },
  { id: 'mescla', label: 'Cinza-mescla', hex: '#bebbc9', txt: '#ffe14d' },
  { id: 'pacoca', label: 'Bege-paçoca', hex: '#e8cfa0', txt: '#ff5050' },
];
const FONTS = ['display', 'display', 'marker', 'bungee'];

// ───────── narração ─────────
const L = {
  draw1: [
    'Olhem o celular e desenhem uma estampa! A coleção primavera-verão depende de vocês. Que Deus nos ajude.',
    'Hora de desenhar! Pensem numa estampa digna de camelô premium.',
    'Desenhem! Lembrando que ninguém aqui é estilista, então relaxa.',
  ],
  draw2: ['Segunda estampa! Agora capricha, que a primeira... bom, deixa pra lá.', 'Mais um desenho! O ateliê não para.', 'Estampa número dois. Surpreendam. Ou pelo menos tentem.'],
  write: [
    'Agora escrevam frases de camiseta. Pensem naquela que o seu tio usa no churrasco.',
    'Hora das frases! Tipo aquelas que vendem na praia por vinte reais.',
    'Escrevam três frases de camiseta. Bom gosto é opcional. Na verdade, é proibido.',
  ],
  build: [
    'Hora da montagem! Vocês receberam desenhos e frases dos OUTROS. Juntem tudo e criem a camiseta mais braba do mundo.',
    'Agora é com vocês, estilistas: escolham desenho, frase e cor. A fábrica tá esperando.',
    'Montem as camisetas! Misturem as peças dos amigos sem dó nem piedade.',
  ],
  lineup: ['Olha só o desfile! A moda brasileira nunca mais será a mesma.', 'Senhoras e senhores, a coleção! Tem camiseta aí que nem o camelô aceitaria.', 'Que coleção! A semana de moda de Paris tá com medo.'],
  mid: ['A passarela tá pegando fogo.', 'Só as brabas sobraram.', 'As costuras estão tremendo.', 'Ninguém aqui lava à mão, só na porrada.'],
  finalBracket: ['É A GRANDE FINAL! Duas camisetas, um sonho e zero bom gosto.', 'Chegamos na final! Quem vencer vira lenda. E meme.'],
  duel: ['Que comece a briga!', 'Luvas calçadas, golas esticadas. Valendo!', 'Mais um duelo de moda duvidosa!', 'Atenção, passarela: vai ter treta.', 'Soem o gongo! Ou o sininho, sei lá.'],
  finalDuel: ['Senhoras e senhores... a GRANDE FINAL do Estampa Braba!', 'É agora! A final mais brega da história da moda!'],
  vote: ['Votem! Qual dessas vocês usariam no almoço de domingo?', 'Hora de votar! Escolham com o coração. Ou com o mau gosto.', 'Votem no celular! A passarela aguarda.', 'Qual é a mais braba? Votem!'],
  win: ['{n} leva essa! A outra vai virar pano de chão.', 'Vitória da camiseta de {n}! A perdedora vai pro bazar da igreja.', 'A galera escolheu a camiseta de {n}. Ponto pro bom gosto. Ou não.', '{n} avança! A outra volta pro cabide da vergonha.'],
  ko: ['NOCAUTE! A camiseta de {n} não deixou nem o cheiro da outra.', 'NOCAUTE TÉCNICO! {n} mandou a adversária direto pro brechó.', 'Foi NOCAUTE de {n}! Ninguém votou na outra. Nem a mãe de quem fez.'],
  coin: ['Empate! Decidi no cara ou coroa e deu {n}. A vida é injusta.', 'Empatou! Joguei uma moedinha e ganhou {n}. Reclamações com o Banco Central.'],
  house: ['A camiseta da casa venceu! Eu sou bom nisso, né?', 'Vitória da camiseta do Bobo! Ninguém segura essa grife.'],
};
const line = (arr, n) => pick(arr).replace('{n}', n);

export default class Estampa extends Game {
  static meta = {
    id: 'estampa',
    name: 'Estampa Braba',
    tag: 'Monte camisetas e jogue no ringue',
    emoji: '👕',
    desc: 'Desenhe estampas, escreva frases de tiozão e monte camisetas com as peças dos amigos. Depois elas saem no tapa num mata-mata. Só uma vira lenda.',
    min: 3,
    max: 8,
    mins: 15,
    color: '#ff8a3d',
    color2: '#1fe0c8',
    kind: 'Desenhar',
    rules: [
      'Primeiro, desenhe DUAS estampas no celular. Qualquer coisa. Ninguém vai saber que foi você.',
      'Depois escreva TRÊS frases de camiseta. Daquelas que só tio em churrasco tem coragem de usar.',
      'Você recebe desenhos e frases dos OUTROS e monta duas camisetas: estampa + frase + cor.',
      'As camisetas se enfrentam num mata-mata e a galera vota. Voto vale ponto pra quem montou e um agrado pra quem desenhou e escreveu. A campeã leva bônus!',
    ],
    rulesLine: 'Regra de ouro: a camiseta mais feia também pode ganhar. Aliás, geralmente ganha.',
    introLines: [
      'Estampa Braba! Onde a moda encontra o mau gosto e os dois saem no tapa.',
      'Bem-vindos ao Estampa Braba, a única confecção onde o controle de qualidade sou eu. E eu não tenho critério.',
      'Estampa Braba! Hoje vocês são estilistas. Que a indústria têxtil nos perdoe.',
    ],
  };

  async run() {
    this.ideaDeck = this.room.deck('estampa:ideas', content.drawIdeas);
    this.lineDeck = this.room.deck(
      'estampa:lines',
      content.sloganIdeas.filter((t) => t.length <= LINE_MAX),
    );
    this.draws = new Map(); // key -> { key, owner, d, idea, house }
    this.lines = new Map(); // key -> { key, owner, text, safety, house }
    this.builds = new Map(); // playerId -> { hd, hl, shirts: [{dk, lk, color}] }
    this.shirts = new Map(); // key -> camiseta montada
    this.champ = null;

    await this.intro();
    await this.drawPhase();
    await this.writePhase();
    await this.buildPhase();
    if (!this.shirts.size) {
      this.setPhase('empty');
      this.say('Ninguém montou camiseta nenhuma. A coleção desse ano foi cancelada.');
      await this.sleep(5000);
      return;
    }
    await this.lineup();
    await this.tournament();
    await this.crown();
    this.setPhase('scores', { before: this.beforeFinal ?? {} });
    this.say(pick(['Placar final! Vamos ver quem sai daqui com estilo.', 'Hora do placar. Estilistas, segurem a tesoura.']));
    await this.sleep(7000);
  }

  // ───────────────────────── 1. desenhos ─────────────────────────

  async drawPhase() {
    for (let n = 1; n <= DRAWS_EACH; n++) {
      this.setPhase('draw', { n, total: DRAWS_EACH });
      this.say(pick(n === 1 ? L.draw1 : L.draw2));
      for (const id of this.ids) {
        const idea = this.ideaDeck.draw();
        this.ask(id, {
          kind: 'draw',
          title: `Estampa ${n} de ${DRAWS_EACH}`,
          prompt: 'Desenhe uma estampa de camiseta!',
          sub: `Sem ideia? Tenta: ${idea}. Nada de escrever — a frase vem depois.`,
          palette: PALETTE,
          on: (p, d) => {
            const key = `d${this.draws.size}`;
            this.draws.set(key, { key, owner: p.id, d, idea });
            this.stat(p.id, 'drawn');
          },
        });
      }
      await this.waitAnswers(DRAW_MS);
      this.reqs.clear();
      this.sfx('gong');
      await this.sleep(800);
    }
  }

  // ───────────────────────── 2. frases ─────────────────────────

  async writePhase() {
    this.setPhase('write', { total: LINES_EACH });
    this.say(pick(L.write));
    for (const id of this.ids) this.askLine(id, 1);
    await this.waitAnswers(WRITE_MS);
    this.reqs.clear();
    this.sfx('gong');
    await this.sleep(800);
  }

  askLine(id, n) {
    if (n > LINES_EACH) return;
    const hints = this.freshIdeas(3);
    this.ask(id, {
      kind: 'text',
      title: `Frase ${n} de ${LINES_EACH}`,
      prompt: 'Escreva uma frase de camiseta',
      sub: 'Toque numa ideia pra usar — ou invente a sua, que vale mais moral.',
      placeholder: 'Ex.: Sobrevivi ao amigo secreto da firma',
      max: LINE_MAX,
      hints,
      safety: true,
      bot: () => this.freshLine(hints),
      on: (p, v, { safety }) => {
        if (this.lineTaken(v)) return 'Alguém já mandou essa! Inventa outra.';
        const key = `l${this.lines.size}`;
        this.lines.set(key, { key, owner: p.id, text: v, safety });
        if (safety) this.stat(p.id, 'safety');
        this.askLine(id, n + 1);
      },
    });
  }

  lineTaken(t) {
    for (const l of this.lines.values()) if (similar(l.text, t)) return true;
    return false;
  }

  /** Ideias de frase ainda não usadas (sugestões pros botões de dica). */
  freshIdeas(n) {
    const out = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const t = this.lineDeck.draw();
      if (t && !this.lineTaken(t) && !out.includes(t)) out.push(t);
    }
    return out;
  }

  freshLine(prefer = []) {
    const free = prefer.filter((t) => !this.lineTaken(t));
    if (free.length) return pick(free);
    const all = content.sloganIdeas.filter((t) => t.length <= LINE_MAX && !this.lineTaken(t));
    return all.length ? pick(all) : `Edição limitada nº ${rand(900) + 100}`;
  }

  /** Botão "me salva" das frases: uma ideia da casa que ninguém usou ainda. */
  safetyFor(p, req) {
    return this.freshLine(req.hints ?? []);
  }

  // ───────────────────────── 3. montagem ─────────────────────────

  async buildPhase() {
    // estoque mínimo: se faltou gente desenhando/escrevendo, a casa completa
    while (this.draws.size < HAND_DRAW) {
      const key = `d${this.draws.size}`;
      this.draws.set(key, { key, owner: null, d: randomScribble(), idea: null, house: true });
    }
    while (this.lines.size < HAND_LINE) {
      const key = `l${this.lines.size}`;
      this.lines.set(key, { key, owner: null, text: this.freshLine(), house: true });
    }
    const useD = new Map();
    const useL = new Map();
    for (const id of shuffle(this.ids)) {
      this.builds.set(id, {
        hd: this.deal(id, [...this.draws.values()], HAND_DRAW, useD),
        hl: this.deal(id, [...this.lines.values()], HAND_LINE, useL),
        shirts: Array.from({ length: SHIRTS_EACH }, () => ({ dk: null, lk: null, color: null })),
      });
    }

    this.setPhase('build');
    this.say(pick(L.build));
    for (const id of this.ids) this.askBuild(id);
    await this.waitAnswers(BUILD_MS);
    this.reqs.clear();
    this.sfx('gong');

    // fecha o que ficou pela metade (escolheu o desenho mas não terminou → completa no sorteio)
    for (const id of this.ids) {
      const b = this.builds.get(id);
      for (const s of b.shirts) {
        if (!s.dk) continue;
        if (!s.lk) s.lk = pick(b.hl.filter((k) => !b.shirts.some((o) => o !== s && o.lk === k))) ?? pick(b.hl);
        if (!s.color) s.color = pick(SHIRT_COLORS).id;
        this.addShirt(id, s);
      }
    }
    // uma camiseta sozinha não briga com ninguém: a casa entra no ringue
    if (this.shirts.size === 1) {
      this.addShirt(null, { dk: pick([...this.draws.keys()]), lk: pick([...this.lines.keys()]), color: pick(SHIRT_COLORS).id });
    }
    await this.sleep(800);
  }

  /** Distribui peças priorizando as de OUTRAS pessoas e as que menos apareceram nas mãos. */
  deal(id, pool, k, usage) {
    const order = (arr) => shuffle(arr).sort((x, y) => (usage.get(x.key) ?? 0) - (usage.get(y.key) ?? 0));
    const hand = order(pool.filter((x) => x.owner !== id)).slice(0, k);
    if (hand.length < k) hand.push(...order(pool.filter((x) => x.owner === id)).slice(0, k - hand.length));
    for (const x of hand) usage.set(x.key, (usage.get(x.key) ?? 0) + 1);
    return shuffle(hand).map((x) => x.key);
  }

  askBuild(id) {
    const b = this.builds.get(id);
    const k = b.shirts.findIndex((s) => !s.dk || !s.lk || !s.color);
    if (k < 0) return;
    const s = b.shirts[k];
    const others = b.shirts.filter((x) => x !== s);
    const title = `Camiseta ${k + 1} de ${SHIRTS_EACH}`;
    if (!s.dk) {
      this.ask(id, {
        kind: 'choice',
        grid: true,
        title,
        prompt: 'Escolha a ESTAMPA',
        sub: k > 0 ? 'Desenho já usado não vale de novo.' : 'O desenho que vai no peito.',
        options: b.hd.map((key) => ({ id: key, label: '', drawing: this.draws.get(key).d, disabled: others.some((o) => o.dk === key) })),
        on: (p, key) => {
          s.dk = key;
          this.askBuild(id);
        },
      });
    } else if (!s.lk) {
      this.ask(id, {
        kind: 'choice',
        title,
        prompt: 'Agora a FRASE',
        drawing: this.draws.get(s.dk).d,
        options: b.hl.map((key) => ({ id: key, label: this.lines.get(key).text, disabled: others.some((o) => o.lk === key) })),
        on: (p, key) => {
          s.lk = key;
          this.askBuild(id);
        },
      });
    } else {
      this.ask(id, {
        kind: 'choice',
        grid: true,
        title,
        prompt: 'E a COR da camiseta?',
        sub: `“${this.lines.get(s.lk).text}”`,
        drawing: this.draws.get(s.dk).d,
        options: SHIRT_COLORS.map((c) => ({ id: c.id, label: c.label, color: c.hex, emoji: '👕' })),
        on: (p, cid) => {
          s.color = cid;
          this.sfx('pop');
          this.askBuild(id);
        },
      });
    }
  }

  addShirt(builder, { dk, lk, color }) {
    const c = SHIRT_COLORS.find((x) => x.id === color) ?? SHIRT_COLORS[0];
    const D = this.draws.get(dk);
    const T = this.lines.get(lk);
    const key = `s${this.shirts.size}`;
    this.shirts.set(key, {
      key,
      builder,
      dk,
      lk,
      color: c.hex,
      txt: c.txt,
      colorName: c.label,
      text: T.text,
      drawBy: D.owner,
      lineBy: T.owner,
      pos: pick(['top', 'bottom']),
      font: pick(FONTS),
      house: !builder,
      wins: 0,
      votes: 0,
      ko: 0,
      revealed: false,
    });
  }

  // ───────────────────────── 4. desfile ─────────────────────────

  async lineup() {
    this.setPhase('lineup');
    this.say(pick(L.lineup));
    this.sfx('whoosh');
    await this.sleep(Math.min(9000, 3800 + this.shirts.size * 320));
  }

  // ───────────────────────── 5. mata-mata ─────────────────────────

  /** Embaralha deixando as camisetas do mesmo estilista em metades opostas da chave. */
  seed(list) {
    const groups = new Map();
    for (const s of shuffle(list)) {
      const k = s.builder ?? s.key;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    const first = [];
    const rest = [];
    for (const g of groups.values()) {
      first.push(g[0]);
      rest.push(...g.slice(1));
    }
    return [...shuffle(first), ...shuffle(rest)];
  }

  /**
   * Chave com potência de 2. As folgas (byes) ficam na primeira rodada, espalhadas de
   * forma uniforme, nunca duas no mesmo confronto: a camiseta com folga avança direto.
   */
  makeBracket() {
    const list = this.seed([...this.shirts.values()]);
    const n = list.length;
    let size = 2;
    while (size < n) size *= 2;
    const nm = size / 2;
    const byes = size - n;
    const byeAt = new Set(Array.from({ length: byes }, (_, i) => Math.floor(((i + 0.5) * nm) / byes)));
    let q = 0;
    const rounds = [
      Array.from({ length: nm }, (_, j) => (byeAt.has(j) ? { a: list[q++].key, b: null, w: null, bye: true } : { a: list[q++].key, b: list[q++].key, w: null })),
    ];
    for (let m = nm / 2; m >= 1; m /= 2) rounds.push(Array.from({ length: m }, () => ({ a: null, b: null, w: null })));
    this.bracket = { size, byes, rounds };
    rounds[0].forEach((m, j) => m.bye && this.advance(0, j, m.a));
  }

  advance(r, j, key) {
    const rounds = this.bracket.rounds;
    rounds[r][j].w = key;
    if (rounds[r + 1]) rounds[r + 1][j >> 1][j % 2 ? 'b' : 'a'] = key;
    else this.champ = key;
  }

  roundName(r, short = false) {
    const m = this.bracket.rounds[r].length;
    if (short) return { 1: 'Final', 2: 'Semi', 4: 'Quartas', 8: 'Oitavas' }[m] ?? `Rodada ${r + 1}`;
    return { 1: 'FINAL', 2: 'SEMIFINAL', 4: 'QUARTAS DE FINAL', 8: 'OITAVAS DE FINAL' }[m] ?? `RODADA ${r + 1}`;
  }

  async tournament() {
    this.makeBracket();
    const rounds = this.bracket.rounds;
    const R = rounds.length;
    for (let r = 0; r < R; r++) {
      this.curRound = r;
      if (r === R - 1) this.beforeFinal = Object.fromEntries(this.scores);
      await this.showBracket(r);
      const todo = rounds[r].map((m, j) => ({ m, j })).filter(({ m }) => !m.w);
      for (let i = 0; i < todo.length; i++) {
        const { m, j } = todo[i];
        if (!m.a || !m.b) {
          this.advance(r, j, m.a ?? m.b);
          continue;
        }
        await this.playDuel(m, j, r, i + 1, todo.length);
      }
    }
  }

  async showBracket(r) {
    const R = this.bracket.rounds.length;
    this.setPhase('bracket', { r });
    if (r === R - 1) {
      this.sfx('airhorn');
      this.say(pick(L.finalBracket), 'hype');
    } else if (r === 0) {
      this.sfx('reveal');
      const n = this.shirts.size;
      const b = this.bracket.byes;
      this.say(`Essa é a chave do campeonato: ${n} camisetas, e só uma sai viva.${b ? ` ${b === 1 ? 'Uma passou' : `${b} passaram`} direto, na base da sorte.` : ''}`);
    } else {
      this.sfx('reveal');
      const name = this.roundName(r).toLowerCase();
      this.say(`${name[0].toUpperCase()}${name.slice(1)}! ${pick(L.mid)}`);
    }
    await this.sleep(r === 0 ? 6500 : 5000);
  }

  voteOption(S, side) {
    return { id: side, label: S.text, sub: side === 'a' ? '⬅️ esquerda' : 'direita ➡️', color: S.color, drawing: this.draws.get(S.dk).d };
  }

  async playDuel(m, j, r, idx, total) {
    const R = this.bracket.rounds.length;
    const final = r === R - 1;
    const quick = !final && this.bracket.rounds[r].length >= 4;
    const A = this.shirts.get(m.a);
    const B = this.shirts.get(m.b);
    const res = { a: { votes: [], aud: 0, pts: 0, credit: 0 }, b: { votes: [], aud: 0, pts: 0, credit: 0 }, w: null, ko: false, coin: false };
    this.cur = { m, j, r, idx, total, final, step: 0, res };

    // entrada dos lutadores
    this.setPhase('duel', { r });
    this.sfx(final ? 'airhorn' : 'ding');
    this.say(pick(final ? L.finalDuel : L.duel), final ? 'hype' : undefined);
    await this.sleep(final ? 3800 : quick ? 2200 : 2800);
    this.cur.step = 1;
    this.sfx('whoosh');
    this.say(`No corner esquerdo, a camiseta ${A.colorName.toLowerCase()}: ${A.text}`);
    this.room.changed();
    await this.sleep(quick ? 2700 : 3100);
    this.cur.step = 2;
    this.sfx('whoosh');
    this.say(`E no corner direito, a ${B.colorName.toLowerCase()}: ${B.text}`);
    this.room.changed();
    await this.sleep(quick ? 2700 : 3100);

    // votação (quem montou alguma das duas não vota)
    const builders = new Set([A.builder, B.builder].filter(Boolean));
    const voters = this.ids.filter((id) => !builders.has(id));
    const options = [this.voteOption(A, 'a'), this.voteOption(B, 'b')];
    this.setPhase('vote', { r });
    this.sfx('ding');
    this.say(pick(L.vote));
    for (const id of voters) {
      this.ask(id, {
        kind: 'choice',
        grid: true,
        title: final ? '🏆 GRANDE FINAL!' : 'Qual camiseta é mais braba?',
        prompt: final ? 'Qual merece o título?' : 'Vote na sua favorita',
        options,
        on: (p, v) => {
          res[v].votes.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', grid: true, title: 'Plateia: qual é a mais braba?', options });
    await this.waitAnswers(final ? FINAL_VOTE_MS : VOTE_MS);
    this.reqs.clear();

    // apuração: a plateia inteira vale no máximo 1 voto, dividido proporcionalmente
    const aud = this.audienceTally();
    res.a.aud = aud.a ?? 0;
    res.b.aud = aud.b ?? 0;
    const at = res.a.aud + res.b.aud;
    const weight = (k) => res[k].votes.length + (at ? res[k].aud / at : 0);
    const wa = weight('a');
    const wb = weight('b');
    let w = wa > wb ? 'a' : wb > wa ? 'b' : null;
    if (!w) {
      w = rand(2) ? 'a' : 'b';
      res.coin = true;
    }
    const nv = res.a.votes.length + res.b.votes.length;
    res.w = w;
    res.ko = nv >= 2 && res[w].votes.length === nv;
    const mult = final ? 2 : 1;
    for (const k of ['a', 'b']) {
      const S = k === 'a' ? A : B;
      const nk = res[k].votes.length;
      let pts = Math.round(weight(k) * VOTE_PTS * mult);
      if (k === w) pts += WIN_PTS * mult + (res.ko ? KO_PTS * mult : 0);
      const credit = Math.round(weight(k) * AUTHOR_PTS * mult);
      res[k].pts = pts;
      res[k].credit = credit;
      S.votes += nk;
      S.revealed = true;
      if (S.builder) {
        this.score(S.builder, pts);
        this.stat(S.builder, 'votes', nk);
      }
      if (S.drawBy) {
        this.score(S.drawBy, credit);
        this.stat(S.drawBy, 'artVotes', nk);
      }
      if (S.lineBy) {
        this.score(S.lineBy, credit);
        this.stat(S.lineBy, 'lineVotes', nk);
      }
    }
    const W = w === 'a' ? A : B;
    W.wins++;
    if (res.ko) W.ko++;
    if (W.builder) {
      this.stat(W.builder, 'wins');
      if (res.ko) this.stat(W.builder, 'ko');
    }
    this.advance(r, j, W.key);

    this.setPhase('result', { r });
    if (res.ko) {
      this.sfx('lavada');
      this.fx('shake', {});
    } else this.sfx('hit');
    const wn = W.builder ? this.name(W.builder) : null;
    this.say(!wn ? pick(L.house) : line(res.coin ? L.coin : res.ko ? L.ko : L.win, wn), res.ko ? 'hype' : undefined);
    await this.sleep(res.ko ? 6200 : quick ? 4800 : 5600);
  }

  // ───────────────────────── 6. coroação ─────────────────────────

  async crown() {
    const C = this.shirts.get(this.champ);
    if (!C) return;
    if (C.builder) {
      this.score(C.builder, CHAMP_PTS);
      this.stat(C.builder, 'champ');
    }
    if (C.drawBy) this.score(C.drawBy, CHAMP_AUTHOR_PTS);
    if (C.lineBy) this.score(C.lineBy, CHAMP_AUTHOR_PTS);
    this.crownStep = 0;
    this.setPhase('champion');
    this.sfx('drumroll');
    this.say('E a camiseta mais braba de todas é...');
    await this.sleep(2800);
    this.crownStep = 1;
    this.sfx('tada');
    this.fx('confetti', { big: true });
    const who = (id) => (id ? this.name(id) : 'Bobo');
    const same = C.builder && C.builder === C.drawBy && C.builder === C.lineBy;
    this.say(
      same
        ? `${C.text}! Tudo obra de ${who(C.builder)}. Uma grife independente!`
        : `${C.text}! Montada por ${who(C.builder)}, com desenho de ${who(C.drawBy)} e frase de ${who(C.lineBy)}. Isso é alta costura!`,
      'party',
    );
    this.room.changed();
    await this.sleep(3600);
    this.fx('confetti', {});
    this.sfx('airhorn');
    await this.sleep(4400);
  }

  // ───────────────────────── views ─────────────────────────

  shirtMeta(s, reveal = s.revealed) {
    return {
      key: s.key,
      color: s.color,
      txt: s.txt,
      text: s.text,
      pos: s.pos,
      font: s.font,
      dk: s.dk,
      house: s.house,
      wins: s.wins,
      builder: reveal ? s.builder : null,
    };
  }

  shirtFull(key, reveal) {
    const s = this.shirts.get(key);
    return {
      ...this.shirtMeta(s, reveal),
      d: this.draws.get(s.dk)?.d ?? null,
      colorName: s.colorName,
      drawBy: reveal ? s.drawBy : null,
      lineBy: reveal ? s.lineBy : null,
      votes: s.votes,
      ko: s.ko,
    };
  }

  artOf(list) {
    const art = {};
    for (const s of list) if (!art[s.dk]) art[s.dk] = this.draws.get(s.dk)?.d ?? null;
    return art;
  }

  hostView() {
    switch (this.phase) {
      case 'draw':
        return { n: this.pd.n, total: this.pd.total, made: this.draws.size };
      case 'write':
        return { total: LINES_EACH, made: this.lines.size };
      case 'build': {
        const made = [];
        for (const b of this.builds.values()) for (const s of b.shirts) if (s.dk && s.lk && s.color) made.push(SHIRT_COLORS.find((c) => c.id === s.color)?.hex);
        return { made };
      }
      case 'lineup': {
        const list = [...this.shirts.values()];
        return { shirts: list.map((s) => this.shirtMeta(s, false)), art: this.artOf(list) };
      }
      case 'bracket': {
        const B = this.bracket;
        const list = [...this.shirts.values()];
        return {
          r: this.curRound,
          name: this.roundName(this.curRound),
          names: B.rounds.map((_, i) => this.roundName(i, true)),
          byes: B.byes,
          rounds: B.rounds.map((rr) => rr.map((m) => ({ a: m.a, b: m.b, w: m.w, bye: !!m.bye }))),
          shirts: Object.fromEntries(list.map((s) => [s.key, this.shirtMeta(s)])),
          art: this.artOf(list),
          champ: this.champ,
        };
      }
      case 'duel':
      case 'vote':
      case 'result': {
        const c = this.cur;
        const result = this.phase === 'result';
        const A = this.shirts.get(c.m.a);
        const B = this.shirts.get(c.m.b);
        const pend = this.pendingIds();
        return {
          r: c.r,
          name: this.roundName(c.r),
          final: c.final,
          idx: c.idx,
          total: c.total,
          step: this.phase === 'duel' ? c.step : 2,
          voting: this.phase === 'vote',
          a: this.shirtFull(A.key, result),
          b: this.shirtFull(B.key, result),
          res: result ? c.res : null,
          // quem montou aparece como "pendente" pra não entregar a autoria
          pending: this.phase === 'vote' ? (pend.length ? [...new Set([...pend, A.builder, B.builder].filter(Boolean))] : []) : null,
        };
      }
      case 'champion':
        return { step: this.crownStep, shirt: this.shirts.has(this.champ) ? this.shirtFull(this.champ, true) : null };
      case 'scores':
        return { before: this.pd.before };
      default:
        return {};
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    switch (this.phase) {
      case 'draw':
        return { wait: { emoji: '🎨', title: 'Estampa enviada!', msg: 'Esperando os outros Picassos da malharia.' } };
      case 'write':
        return { wait: { emoji: '✍️', title: 'Frases enviadas!', msg: 'Agora é esperar os poetas lentos.' } };
      case 'build': {
        const b = this.builds.get(p.id);
        const done = b?.shirts.filter((s) => s.dk && s.lk && s.color) ?? [];
        return { wait: { emoji: '👕', title: done.length ? 'Camisetas prontas!' : 'Olha pra TV!', msg: done.length ? done.map((s) => `“${this.lines.get(s.lk).text}”`).join(' e ') : '', drawing: done[0] ? this.draws.get(done[0].dk).d : undefined } };
      }
      case 'duel':
      case 'vote': {
        const c = this.cur;
        const mine = c && [c.m.a, c.m.b].some((k) => this.shirts.get(k)?.builder === p.id);
        if (mine) return { wait: { emoji: '🥊', title: 'Sua camiseta tá no ringue!', msg: 'Faz cara de paisagem. Ninguém pode saber que é sua.' } };
        break;
      }
      case 'result': {
        const c = this.cur;
        const side = ['a', 'b'].find((k) => this.shirts.get(c.m[k])?.builder === p.id);
        if (side && c.res?.w) {
          const won = c.res.w === side;
          const r = c.res[side];
          return { wait: { emoji: won ? (c.res.ko ? '🥊' : '🏆') : '🩹', title: won ? (c.res.ko ? 'NOCAUTE!' : 'Sua camiseta venceu!') : 'Sua camiseta caiu…', msg: `+${r.pts} pontos · ${r.votes.length} voto(s)` } };
        }
        break;
      }
      case 'champion': {
        const C = this.shirts.get(this.champ);
        if (this.crownStep && C?.builder === p.id) return { wait: { emoji: '👑', title: 'SUA CAMISETA É A CAMPEÃ!', msg: `“${C.text}” entrou pra história da moda.` } };
        break;
      }
    }
    return { wait: { emoji: '👀', title: 'Olha pra TV!', msg: '' } };
  }

  audienceView() {
    return { req: this.areq };
  }

  awards() {
    const out = [];
    const C = this.shirts?.get(this.champ);
    if (C?.builder) out.push({ id: C.builder, title: 'Grife do Ano', desc: `Montou a campeã: “${C.text}”.` });
    out.push(this.topStat('artVotes', 'Picasso da Malharia', 'Seus desenhos renderam {n} voto(s).'));
    out.push(this.topStat('lineVotes', 'Poeta do Varal', 'Suas frases renderam {n} voto(s).'));
    out.push(this.topStat('ko', 'Nocauteador', 'Aplicou {n} nocaute(s) na passarela.') ?? this.topStat('safety', 'Me Salva!', 'Apertou o botão do desespero {n} vez(es).'));
    return out.filter(Boolean).slice(0, 4);
  }
}
