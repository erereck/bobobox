// FORA DE CONTEXTO — respostas inocentes, contextos criminosos.
// Cada um responde perguntas pessoais; depois OUTRO jogador pega a resposta e
// enfia num "molde" absurdo (zap da família, manchete, review 1 estrela, placa…).
// A TV monta tudo bonitinho e a galera vota no mais fora de contexto.

import { Game } from '../game.js';
import { clamp, pick, rand, sample, shuffle, similar } from '../util.js';
import content from '../../content/contexto.js';
import botContent from '../../content/bots.js';

const ANSWER_MS = 60_000;
const TWIST_MS = 80_000;
const VOTE_MS = 20_000;
const VOTE_PTS = 500; // por voto, pra quem distorceu (× rodada)
const AUTHOR_PTS = 150; // por voto, pro dono da resposta original (× rodada)
const WIN_BONUS = 250; // mais votado do bloco (× rodada)
const TOTAL_BONUS = 250; // levou TODOS os votos (× rodada)

const FAMILY = ['Mãe', 'Pai', 'Vô Armando', 'Vó Dirce', 'Tio Rubens', 'Primo Jorge', 'Prima Kelly', 'Dinda Solange', 'Cunhado Marcos', 'Tio Paulo'];
const COMMENTERS = ['@cidadao_de_bem_1975', '@tia.cleide.oficial', '@ze_comenta_tudo', '@patriota_do_bairro', '@marcia.fofoqueira', '@leitor_indignado', '@vovo_conectada', '@sabe_de_nada_inocente'];
const REVIEWERS = ['Rosângela M.', 'Cleiton S.', 'Dona Neide', 'Juscelino P.', 'Marquinhos', 'Edileuza R.', 'Valdir T.'];
const FACES = ['🧔', '👩', '👨‍🦲', '👵', '🕵️', '🤠', '👩‍🦰', '🧑‍🎤', '👴', '🧕', '🧑‍🍳', '🦸'];
const STUDIOS = ['Tattoo do Primo', 'Agulha Torta Studio', 'Tinta & Arrependimento', 'Ink do Beco', 'Studio Nunca Mais'];
const AD_COLORS = ['#ff3d7f', '#2ec4ff', '#ffd23f', '#3ddc84', '#ff8a3d', '#a77bff', '#1fe0c8'];

const two = (n) => String(n).padStart(2, '0');

// ───────────────────────── moldes ─────────────────────────
// `template(ans)` vira o prompt no celular: o "___" é onde entra o que o jogador escreve.
// `line0` narra o contexto (setup) e `line1` narra a resposta (punchline).

const MOLDS = [
  {
    id: 'zap',
    name: 'Grupo da Família',
    emoji: '💬',
    template: (a) => `Alguém mandou no grupo da família: ___ … e a Tia Cleide respondeu: “${a}”`,
    sub: 'Escreva a MENSAGEM que alguém mandou no grupo pra Tia Cleide responder isso.',
    placeholder: 'Ex.: Gente, quem pegou meu pote de sorvete?',
    max: 80,
    hints: ['Bom dia, família!', 'Gente,', 'Mãe,', 'URGENTE:'],
    sfx: 'bloop',
    line0: (c) => `No grupo da família, alguém mandou: ${c}`,
    line1: (a) => `E a Tia Cleide respondeu: ${a}`,
    extra: () => {
      const h = pick([6, 7, 22, 23, 0, 3]);
      const m = rand(58);
      return { time: `${two(h)}:${two(m)}`, time2: `${two(h)}:${two(m + 1)}`, members: sample(FAMILY, 4) };
    },
    pool: [
      'Bom dia, família! Deus abençoe a todos 🌻',
      'Gente, quem pegou meu pote de sorvete do congelador?',
      'Mãe, posso levar meu namorado no almoço de domingo?',
      'Alguém sabe a senha do wi-fi da casa da vó?',
      'Quem quebrou o vaso da sala? Ninguém sai daqui.',
      'O vô aprendeu a mandar áudio, se preparem',
      'Pessoal, o que cada um vai levar no Natal?',
      'Gente, a Kátia passou no vestibular!',
      'Quem deixou o cachorro comer o bolo da festa?',
      'Alguém viu a dentadura do vô?',
      'Vou casar! Quem topa ser padrinho?',
      'Mandei um Pix errado, alguém recebeu 500 reais?',
      'Gente, a Vó Dirce entrou no aplicativo de namoro',
      'Quem foi que adicionou o ex da Kelly no grupo?',
      'Acabei de bater o carro do pai',
      'Quem vai pagar a pizza de ontem?',
      'Tio Rubens, o senhor tá de castigo no grupo',
      'Alguém sabe por que tem um bode no quintal?',
    ],
  },
  {
    id: 'noticia',
    name: 'Portal de Notícias',
    emoji: '📰',
    template: (a) => `MANCHETE: ___ — e o comentário mais curtido da notícia foi: “${a}”`,
    sub: 'Escreva a MANCHETE da notícia. A resposta vira o comentário mais curtido.',
    placeholder: 'Ex.: Capivara invade casamento e rouba o buquê',
    max: 80,
    hints: ['URGENTE:', 'Polícia investiga', 'Prefeito', 'Cientistas descobrem'],
    sfx: 'ding',
    line0: (c) => `Plantão Bobobox! ${c}`,
    line1: (a) => `E o comentário mais curtido foi: ${a}`,
    extra: () => ({ user: pick(COMMENTERS), likes: `${1 + rand(9)},${rand(10)} mil`, mins: 2 + rand(40), comments: `${1 + rand(9)}.${rand(900) + 100}` }),
    pool: [
      'Homem é preso tentando pagar a conta de luz com figurinha',
      'Prefeito inaugura buraco na avenida principal',
      'Capivara invade casamento e rouba o buquê',
      'Cientistas confirmam: segunda-feira é opcional',
      'Vó de 92 anos vira campeã mundial de skate',
      'Pombo assume a presidência de multinacional',
      'Ônibus passa no horário e passageiros desconfiam',
      'Estagiário apaga a internet do país inteiro',
      'Moradores relatam OVNI em formato de coxinha',
      'Homem passa três dias preso no próprio guarda-roupa',
      'Cachorro caramelo é eleito vereador',
      'Padre interrompe missa pra ver a final do campeonato',
      'Bombeiros resgatam homem entalado numa pia',
      'Jacaré é flagrado esperando o ônibus há 3 horas',
      'Ladrão devolve celular por ser velho demais',
      'Casal briga no altar por causa do sabor do bolo',
      'Professor dá prova surpresa e é surpreendido',
      'Governo anuncia feriado pra comemorar feriado',
    ],
  },
  {
    id: 'review',
    name: 'Avaliação 1 Estrela',
    emoji: '⭐',
    template: (a) => `Produto: ___ ★☆☆☆☆ Avaliação do cliente: “${a}”`,
    sub: 'Escreva o PRODUTO que recebeu essa avaliação de uma estrela.',
    placeholder: 'Ex.: Colchão inflável de casal',
    max: 50,
    hints: ['Colchão', 'Curso online de', 'Kit', 'Pomada'],
    sfx: 'boing',
    line0: (c) => `Produto: ${c}. Nota: uma estrela.`,
    line1: (a) => `Avaliação do cliente: ${a}`,
    extra: () => ({ price: `R$ ${9 + rand(480)},${pick(['90', '99', '00', '49'])}`, reviewer: pick(REVIEWERS), helpful: 40 + rand(900), icon: pick(['📦', '🎁', '🛍️', '🧸', '🔌']) }),
    pool: [
      'Colchão inflável de casal',
      'Aspirador de pó Turbo 3000',
      'Curso online de autoestima',
      'Pacote de viagem pra Cancún',
      'Pomada pra calo',
      'Detector de mentiras caseiro',
      'Fone de ouvido à prova d’água',
      'Kit churrasco gourmet',
      'Travesseiro que canta',
      'Cinta modeladora masculina',
      'Babá eletrônica',
      'Despertador com sirene de bombeiro',
      'Livro “Como fazer amigos”',
      'Bicicleta ergométrica (usada uma vez)',
      'Panela de pressão turbinada',
      'Peruca de luxo',
      'Serviço de buffet infantil',
      'Aula particular de canto',
    ],
  },
  {
    id: 'placa',
    name: 'Placa de Aviso',
    emoji: '🪧',
    template: (a) => `Placa encontrada ___ dizendo: “${a}”`,
    sub: 'Escreva ONDE essa placa estava pendurada.',
    placeholder: 'Ex.: na porta da UTI',
    max: 50,
    hints: ['na porta do', 'no banheiro da', 'na entrada do', 'dentro do'],
    sfx: 'ding',
    line0: (c) => `Essa placa foi encontrada ${c}.`,
    line1: (a) => `E nela está escrito: ${a}`,
    extra: () => ({ n: 100 + rand(900) }),
    pool: [
      'na porta da UTI',
      'na entrada do cemitério',
      'no banheiro da rodoviária',
      'na sala de parto',
      'no elevador do prédio',
      'na beira da piscina do clube',
      'na jaula do leão do zoológico',
      'na porta do consultório do dentista',
      'na saída da academia',
      'no velório do seu Lúcio',
      'na porta da delegacia',
      'no meio da pista do aeroporto',
      'dentro do confessionário da igreja',
      'na porta da sala do diretor',
      'no portão da creche',
      'no topo do Everest',
      'no fundo da piscina',
      'na fila do banco',
    ],
  },
  {
    id: 'ultimas',
    name: 'Últimas Palavras',
    emoji: '🪦',
    adult: true,
    template: (a) => `Morreu ___ e suas últimas palavras foram: “${a}”`,
    sub: 'Escreva COMO essa pessoa morreu.',
    placeholder: 'Ex.: tentando abrir um pote de palmito',
    max: 60,
    hints: ['engasgado com', 'tentando', 'atropelado pelo', 'depois de'],
    sfx: 'gong',
    line0: (c) => `Aqui jaz alguém que morreu ${c}.`,
    line1: (a) => `Suas últimas palavras foram: ${a}`,
    extra: () => ({ born: 1940 + rand(70) }),
    pool: [
      'engasgado com uma bala de coco',
      'tentando abrir um pote de palmito',
      'atropelado pelo carro do ovo',
      'brigando com um ganso no parque',
      'tirando selfie na beira de um vulcão',
      'depois de comer feijoada num calor de 40 graus',
      'de vergonha, no meio do karaokê',
      'pulando de paraquedas sem paraquedas',
      'esmagado por uma pilha de boletos',
      'tentando fazer embaixadinha na laje',
      'esperando o ônibus das 18h',
      'de tanto rir de uma piada do tio do pavê',
      'numa batalha de rima contra a avó',
      'testando se a tomada estava ligada',
      'na 47ª peça do rodízio de sushi',
      'levantando 200 kg sem aquecer',
    ],
  },
  {
    id: 'tattoo',
    name: 'Tatuagem',
    emoji: '🖋️',
    template: (a) => `Tatuagem feita ___ com os dizeres: “${a}”`,
    sub: 'Escreva ONDE foi a tatuagem (e quem fez, se quiser).',
    placeholder: 'Ex.: na testa, pelo primo bêbado',
    max: 60,
    hints: ['na testa,', 'no bumbum,', 'nas costas,', 'pelo primo'],
    sfx: 'scratch',
    line0: (c) => `Nova tatuagem, feita ${c}.`,
    line1: (a) => `E está escrito: ${a}`,
    extra: () => ({ studio: pick(STUDIOS) }),
    pool: [
      'na testa, pelo primo bêbado',
      'no bumbum, nas férias em Porto Seguro',
      'no pescoço, numa promoção de Black Friday',
      'nas costas, durante um apagão',
      'no braço, por um tatuador que tremia',
      'na canela, depois de perder uma aposta',
      'no peito, em letras góticas gigantes',
      'na sola do pé, pra ninguém ver',
      'na nuca, pela própria mãe',
      'na barriga, num carnaval em Salvador',
      'no dedinho do pé, com tinta de caneta',
      'na bochecha, por um estagiário',
      'no antebraço, em homenagem ao ex',
      'na careca, pra combinar com o bigode',
      'na orelha, numa despedida de solteiro',
    ],
  },
  {
    id: 'namoro',
    name: 'App de Namoro',
    emoji: '💘',
    template: (a) => `Perfil de ___ no app de namoro. Bio: “${a}”`,
    sub: 'Escreva NOME, idade e PROFISSÃO de quem tem esse perfil.',
    placeholder: 'Ex.: Rogério, 47, coach quântico',
    max: 50,
    hints: ['Rogério, 47,', 'Valdirene, 39,', 'coach', 'síndico'],
    sfx: 'pop',
    line0: (c) => `Novo match! ${c}.`,
    line1: (a) => `Na bio: ${a}`,
    extra: () => ({ km: 1 + rand(12), face: pick(FACES), hue: rand(360) }),
    pool: [
      'Rogério, 47, coach quântico',
      'Valdirene, 39, vidente nas horas vagas',
      'Cleber, 52, síndico há 20 anos',
      'Jéssica, 28, influencer de pão de queijo',
      'Dr. Fausto, 61, dentista aposentado',
      'Wellington, 33, motorista de van escolar',
      'Sandra, 45, pastora de cabras',
      'Josué, 30, palhaço de festa infantil',
      'Marlene, 70, campeã de bingo',
      'Thiago, 24, vendedor de curso de trade',
      'Kátia, 36, fiscal de condomínio',
      'Edinaldo, 41, cover do Elvis',
      'Patrícia, 29, astróloga de pets',
      'Gilmar, 58, dono de lava-jato',
      'Bruna, 31, juíza de futebol de várzea',
    ],
  },
  {
    id: 'outdoor',
    name: 'Outdoor',
    emoji: '📢',
    template: (a) => `Outdoor oficial de ___ com o slogan: “${a}”`,
    sub: 'Escreva a MARCA (ou empresa) que pagou esse outdoor.',
    placeholder: 'Ex.: Funerária Bom Descanso',
    max: 40,
    hints: ['Funerária', 'Clínica', 'Academia', 'Supermercado'],
    sfx: 'reveal',
    line0: (c) => `Propaganda oficial: ${c}.`,
    line1: (a) => `Slogan: ${a}`,
    extra: () => ({ bg: pick(AD_COLORS) }),
    pool: [
      'Funerária Bom Descanso',
      'Clínica de Depilação Sem Dor',
      'Autoescola Bate-Bate',
      'Laxante Vai Que Vai',
      'Academia Monstrão',
      'Supermercado Preço Bom',
      'Prefeitura Municipal',
      'Banco Juros Amigos',
      'Dentista Sorriso Feliz',
      'Imobiliária Lar Doce Lar',
      'Escolinha Pequeno Gênio',
      'Pet Shop Cão Chique',
      'Plano de Saúde Vida Longa',
      'Pizzaria Forno do Zé',
      'Advocacia Dr. Dirceu & Filhos',
      'Cursinho Passa Fácil',
    ],
  },
];

const MOLD = Object.fromEntries(MOLDS.map((m) => [m.id, m]));

/** Tamanhos dos blocos de votação dentro de uma "leva" de n itens (tenta 3 a 5 por bloco). */
function blockSizes(n) {
  if (n <= 5) return [n];
  if (n === 6) return [3, 3];
  if (n === 7) return [4, 3];
  return [4, 4];
}

const readMs = (t, min = 2800, max = 7500) => clamp(1500 + String(t ?? '').length * 62, min, max);

export default class Contexto extends Game {
  static meta = {
    id: 'contexto',
    name: 'Fora de Contexto',
    tag: 'Sua resposta, o contexto dos outros',
    emoji: '✂️',
    desc: 'Responda perguntas inocentes sobre você. Depois um amigo pega sua resposta e enfia num contexto absurdo: zap da família, manchete, review, placa… A galera vota no mais fora de contexto.',
    min: 3,
    max: 8,
    mins: 15,
    color: '#1fe0c8',
    color2: '#ff3d7f',
    kind: 'Escrever',
    rules: [
      'Primeiro, responda DUAS perguntas pessoais no celular. Curtinho e com sinceridade. O que pode dar errado?',
      'Suas respostas vão parar nas mãos de OUTRO jogador, junto com um molde: zap da família, manchete, review, placa, tatuagem…',
      'Quem recebe escreve o contexto. Sua resposta inocente vira a resposta da Tia Cleide, o slogan de um outdoor, a bio de um perfil de namoro…',
      'Todo mundo vota no mais fora de contexto. Pontos pra quem distorceu, um agrado pra quem respondeu. Rodada 2 vale o dobro!',
    ],
    rulesLine: 'Regra de ouro: tudo que você disser pode e vai ser usado contra você.',
    introLines: [
      'Fora de Contexto! O jogo onde a sua resposta inocente vai parar no lugar errado.',
      'Bem-vindos ao Fora de Contexto. Aqui ninguém disse o que disse. Mas disse.',
      'Fora de Contexto! Preparem-se pra virar print no grupo da família.',
    ],
  };

  constructor(room, opts) {
    super(room, opts);
    this.roundNo = 0;
    this.items = [];
    this.blocks = [];
    this.cur = null;
    this.block = null;
    this.gain = new Map(); // pontos do último bloco, pra tela do celular
  }

  molds() {
    return MOLDS.filter((m) => !m.adult || !this.room.settings.family);
  }

  async run() {
    await this.intro();
    for (let r = 1; r <= 2; r++) await this.playRound(r);
  }

  // ───────────────────────── rodada ─────────────────────────

  async playRound(r) {
    this.roundNo = r;
    this.before = Object.fromEntries(this.scores);
    this.cur = null;
    this.block = null;

    await this.answerPhase(r);
    this.buildItems();
    await this.twistPhase(r);

    this.setPhase('showtime', { round: r });
    this.sfx('drumroll');
    this.say(pick(['Hora de ver o estrago.', 'Vamos ver o que vocês fizeram com as respostas dos amigos.', 'Segura que lá vem bomba.', 'Advogados de plantão, atenção: começou.']));
    await this.sleep(3200);

    const total = this.items.length;
    let shown = 0;
    for (let b = 0; b < this.blocks.length; b++) {
      const block = this.blocks[b];
      for (const it of block) {
        shown++;
        await this.showItem(it, shown, total, b + 1);
      }
      await this.voteBlock(block, b + 1, r);
    }

    this.cur = null;
    this.block = null;
    this.setPhase('scores', { round: r, before: this.before });
    this.say(pick(['Placar! Vamos ver quem é o maior distorcedor da sala.', 'Hora do placar. Advogados, fiquem atentos.', 'Placar! Quem tá na frente tá mentindo melhor.']));
    await this.sleep(7500);
  }

  // ───────────────────────── fase 1: respostas inocentes ─────────────────────────

  async answerPhase(r) {
    const deck = this.room.deck(`ctx:q:${this.room.settings.family}`, this.room.familyFilter(content.questions));
    this.answers = new Map();
    for (const id of this.ids) {
      const qs = deck.drawMany(2);
      while (qs.length < 2) qs.push(deck.draw());
      this.answers.set(
        id,
        qs.map((q) => ({ q: q.t, text: null, safety: false, house: false })),
      );
    }
    this.setPhase('answer', { round: r });
    this.say(
      r === 1
        ? 'Rodada um! Respondam as perguntas no celular com toda a sinceridade do mundo. Prometo que nada de ruim vai acontecer.'
        : 'Rodada dois, pontos em dobro! Respondam de novo. Vocês não aprendem, né?',
    );
    for (const id of this.ids) this.askAnswer(id);
    await this.waitAnswers(ANSWER_MS);
    this.reqs.clear();
    // Quem não respondeu ganha uma resposta da casa (o show não pode parar)
    for (const list of this.answers.values()) {
      for (const a of list) {
        if (!a.text) {
          a.text = pick(botContent.answers);
          a.house = true;
        }
      }
    }
    this.sfx('gong');
    await this.sleep(900);
  }

  askAnswer(id) {
    const list = this.answers.get(id);
    const k = list.findIndex((a) => a.text === null);
    if (k < 0) return;
    const slot = list[k];
    this.ask(id, {
      kind: 'text',
      title: `Pergunta ${k + 1} de ${list.length}`,
      prompt: slot.q,
      sub: 'Responda curtinho e com sinceridade. O que pode dar errado? 😇',
      max: 45,
      placeholder: 'Sua resposta inocente…',
      safety: true,
      safetyPool: botContent.answers,
      botPool: botContent.answers,
      on: (p, v, { safety }) => {
        slot.text = v;
        slot.safety = safety;
        if (safety) this.stat(id, 'safety');
        this.askAnswer(id);
      },
    });
  }

  // ───────────────────────── distribuição ─────────────────────────

  /** Cada resposta vai pra outro jogador (nunca o autor), com um molde sorteado. */
  buildItems() {
    const order = shuffle(this.ids);
    const n = order.length;
    const molds = shuffle(this.molds());
    const M = molds.length;
    const off = 1 + rand(M - 1);
    const items = [];
    const bySlot = [[], []];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) {
        const twister = order[i];
        // a resposta k do autor j vai pro jogador j+k+1 → autor de i no slot k é i-k-1
        const author = order[(i - k - 1 + 2 * n) % n];
        const ans = this.answers.get(author)[k];
        const mold = molds[(i + k * off) % M];
        const it = {
          key: `i${this.roundNo}_${i}_${k}`,
          slot: k,
          twister,
          author,
          q: ans.q,
          ans: ans.text,
          authorHouse: ans.house,
          mold: mold.id,
          x: mold.extra(),
          ctx: null,
          safety: false,
          twisterHouse: false,
          votes: [],
          aud: 0,
          pts: 0,
          apts: 0,
        };
        items.push(it);
        bySlot[k][i] = it;
      }
    }
    this.items = items;
    // Blocos de votação: cada bloco tem distorcedores diferentes (um item por pessoa)
    const blocks = [];
    for (const slotItems of bySlot) {
      let start = 0;
      for (const size of blockSizes(n)) {
        blocks.push(shuffle(slotItems.slice(start, start + size)));
        start += size;
      }
    }
    this.blocks = blocks;
    this.roundMolds = [...new Set(items.map((it) => it.mold))];
  }

  // ───────────────────────── fase 2: tirar de contexto ─────────────────────────

  async twistPhase(r) {
    this.setPhase('twist', { round: r });
    this.say(
      pick([
        'Agora a parte divertida: as respostas de vocês foram parar nas mãos erradas. Tirem tudo de contexto!',
        'Hora de distorcer! Cada um recebeu respostas dos amigos. Façam o pior.',
        'Olhem o celular: a resposta inocente de alguém tá na sua mão. Usem com irresponsabilidade.',
      ]),
    );
    for (const id of this.ids) this.askTwist(id);
    await this.waitAnswers(TWIST_MS);
    this.reqs.clear();
    for (const it of this.items) {
      if (!it.ctx) {
        it.ctx = pick(MOLD[it.mold].pool);
        it.twisterHouse = true;
      }
    }
    this.sfx('gong');
    await this.sleep(900);
  }

  askTwist(id) {
    const jobs = this.items.filter((it) => it.twister === id).sort((a, b) => a.slot - b.slot);
    const k = jobs.findIndex((it) => it.ctx === null);
    if (k < 0) return;
    const it = jobs[k];
    const m = MOLD[it.mold];
    this.ask(id, {
      kind: 'text',
      title: `${m.emoji} ${m.name} · ${k + 1} de ${jobs.length}`,
      prompt: m.template(it.ans),
      sub: m.sub,
      placeholder: m.placeholder,
      max: m.max,
      hints: m.hints,
      safety: true,
      safetyPool: m.pool,
      botPool: m.pool,
      submitLabel: 'Distorcer ➜',
      on: (p, v, { safety }) => {
        if (similar(v, it.ans)) return 'Isso é só a resposta de novo! Inventa o CONTEXTO.';
        it.ctx = v;
        it.safety = safety;
        if (safety) this.stat(id, 'safety');
        this.askTwist(id);
      },
    });
  }

  // ───────────────────────── revelação ─────────────────────────

  async showItem(it, idx, total, blockNo) {
    const m = MOLD[it.mold];
    this.cur = { it, idx, total, step: 0 };
    this.setPhase('show', { round: this.roundNo, block: blockNo });
    this.sfx('whoosh');
    const l0 = m.line0(it.ctx);
    this.say(l0);
    await this.sleep(readMs(l0, 3000, 7500));

    this.cur.step = 1;
    this.sfx(m.sfx);
    this.room.changed();
    const l1 = m.line1(it.ans);
    this.say(l1);
    await this.sleep(readMs(l1, 2800, 6500));

    this.cur.step = 2;
    this.sfx('swoosh');
    this.room.changed();
    const A = this.name(it.author);
    const T = this.name(it.twister);
    let l2 = it.authorHouse
      ? `${A} não respondeu, então a resposta é minha. A pergunta era: ${it.q}`
      : pick([`Na real, perguntaram pra ${A}: ${it.q}`, `Contexto original: ${it.q} Resposta de ${A}.`, `Detalhe: ${A} só tava respondendo: ${it.q}`]);
    if (it.twisterHouse) l2 += ` E ${T} dormiu no ponto, então eu mesmo distorci.`;
    this.say(l2);
    await this.sleep(readMs(l2, 4200, 8500));
  }

  // ───────────────────────── votação ─────────────────────────

  optionFor(it) {
    const m = MOLD[it.mold];
    return { id: it.key, emoji: m.emoji, label: it.ctx, sub: `“${it.ans}”` };
  }

  async voteBlock(block, blockNo, r) {
    this.cur = null;
    this.block = { items: block, no: blockNo, total: this.blocks.length, res: null };
    this.setPhase('vote', { round: r, block: blockNo });
    this.sfx('whoosh');
    this.say(pick(['Votem no mais fora de contexto! Não vale votar no próprio.', 'Qual desses vai parar no print? Votem!', 'Hora de votar no mais absurdo. Sem votar em si mesmo, espertinho.']));

    const eligible = [];
    for (const id of this.ids) {
      const options = block.map((it) => ({ ...this.optionFor(it), disabled: it.twister === id }));
      if (!options.some((o) => !o.disabled)) continue;
      eligible.push(id);
      this.ask(id, {
        kind: 'choice',
        title: 'Qual é o MAIS fora de contexto?',
        prompt: options.some((o) => o.disabled) ? 'Vote no mais absurdo (o seu tá bloqueado 😉)' : 'Vote no mais absurdo!',
        options,
        on: (p, key) => {
          const it = block.find((x) => x.key === key);
          if (!it || it.twister === p.id) return 'Não pode votar no seu!';
          it.votes.push(p.id);
          this.fx('vote', { id: p.id });
        },
      });
    }
    this.askAudience({ kind: 'choice', title: 'Plateia: qual é o mais fora de contexto?', options: block.map((it) => this.optionFor(it)) });
    await this.waitAnswers(VOTE_MS);
    this.reqs.clear();

    // ── apuração ──
    const aud = this.audienceTally();
    const audTotal = block.reduce((s, it) => s + (aud[it.key] ?? 0), 0);
    const voters = new Set(block.flatMap((it) => it.votes));
    const voted = voters.size;
    let best = 0;
    for (const it of block) {
      it.aud = aud[it.key] ?? 0;
      // a plateia inteira vale um voto extra, dividido proporcionalmente
      it.w = it.votes.length + (audTotal ? it.aud / audTotal : 0);
      best = Math.max(best, it.w);
    }
    this.gain = new Map();
    const add = (id, pts) => {
      if (!pts) return;
      this.score(id, pts);
      this.gain.set(id, (this.gain.get(id) ?? 0) + pts);
    };
    let total = null;
    for (const it of block) {
      it.winner = best > 0 && it.w === best;
      // "levou TODOS": todo mundo que votou (menos o próprio distorcedor) escolheu esse
      const others = voted - (voters.has(it.twister) ? 1 : 0);
      it.total = it.votes.length >= 2 && it.votes.length === others;
      if (it.total) total = it;
      let pts = Math.round(VOTE_PTS * r * it.w);
      if (it.winner) pts += WIN_BONUS * r;
      if (it.total) pts += TOTAL_BONUS * r;
      if (it.safety) pts = Math.round(pts / 2);
      it.pts = it.twisterHouse ? 0 : pts;
      it.apts = it.authorHouse ? 0 : Math.round(AUTHOR_PTS * r * it.w);
      if (!it.twisterHouse) {
        add(it.twister, it.pts);
        this.stat(it.twister, 'votes', it.votes.length);
        if (it.winner) this.stat(it.twister, 'wins');
        if (it.total) this.stat(it.twister, 'total');
      }
      if (!it.authorHouse) {
        add(it.author, it.apts);
        this.stat(it.author, 'authorVotes', it.votes.length);
      }
    }
    this.block.res = { audTotal, voted, eligible: eligible.length };
    this.setPhase('result', { round: r, block: blockNo });

    const winners = block.filter((it) => it.winner);
    if (total) {
      this.sfx('lavada');
      this.fx('shake', {});
      this.say(pick([`FORA DE CONTEXTO TOTAL! Todo mundo votou em ${this.who(total)}!`, `Unanimidade! ${this.who(total)} destruiu a reputação de ${this.name(total.author)}.`]), 'hype');
    } else if (!winners.length) {
      this.sfx('fail');
      this.say(pick(['Ninguém votou. Vocês estão bem?', 'Zero votos. A sala entrou em choque.']));
    } else if (winners.length > 1) {
      this.sfx('boing');
      this.say(pick(['Empate! A sala não consegue decidir qual é o pior.', 'Deu empate. Todo mundo é culpado.']));
    } else {
      const w = winners[0];
      this.sfx('tada');
      this.say(pick([`O mais fora de contexto foi de ${this.who(w)}!`, `${this.who(w)} levou esse bloco. ${this.name(w.author)}, sinto muito.`, `Ponto pra ${this.who(w)}! Que vergonha. Que orgulho.`]), 'hype');
    }
    await this.sleep(7200);
    this.gain = new Map();
  }

  who(it) {
    return it.twisterHouse ? 'mim, o Bobo' : this.name(it.twister);
  }

  // ───────────────────────── views ─────────────────────────

  pubItem(it, step = 9) {
    return {
      key: it.key,
      mold: it.mold,
      x: it.x,
      ctx: it.ctx,
      ans: step >= 1 ? it.ans : null,
      q: step >= 2 ? it.q : null,
      author: step >= 2 ? it.author : null,
      twister: step >= 2 ? it.twister : null,
      authorHouse: step >= 2 && it.authorHouse,
      twisterHouse: step >= 2 && it.twisterHouse,
      safety: step >= 2 && it.safety,
    };
  }

  hostView() {
    const v = { round: this.roundNo };
    switch (this.phase) {
      case 'answer':
      case 'showtime':
        return v;
      case 'twist':
        return { ...v, molds: (this.roundMolds ?? []).map((id) => ({ id, name: MOLD[id].name, emoji: MOLD[id].emoji })) };
      case 'show': {
        const c = this.cur;
        if (!c) return v;
        return { ...v, idx: c.idx, total: c.total, step: c.step, block: this.pd.block, blocks: this.blocks.length, item: this.pubItem(c.it, c.step) };
      }
      case 'vote': {
        const b = this.block;
        return { ...v, block: b.no, blocks: b.total, items: b.items.map((it) => this.pubItem(it, 1)), pending: this.pendingIds() };
      }
      case 'result': {
        const b = this.block;
        return {
          ...v,
          block: b.no,
          blocks: b.total,
          res: b.res,
          items: b.items.map((it) => ({ ...this.pubItem(it), votes: it.votes, aud: it.aud, pts: it.pts, apts: it.apts, winner: it.winner, total: it.total })),
        };
      }
      case 'scores':
        return { ...v, before: this.pd.before };
      default:
        return v;
    }
  }

  playerView(p) {
    const req = this.reqs.get(p.id);
    if (req) return { req };
    switch (this.phase) {
      case 'answer':
        return { wait: { emoji: '😇', title: 'Respostas enviadas!', msg: 'Você foi sincero(a). Isso vai ser usado contra você.' } };
      case 'twist':
        return { wait: { emoji: '✂️', title: 'Contexto destruído!', msg: 'Esperando os outros terminarem o estrago.' } };
      case 'show': {
        const it = this.cur?.it;
        if (it?.author === p.id) return { wait: { emoji: '😳', title: 'Essa resposta é SUA!', msg: `Você respondeu isso pra: “${it.q}”` } };
        if (it?.twister === p.id) return { wait: { emoji: '😈', title: 'Essa distorção é SUA!', msg: 'Segura o riso. Ou não.' } };
        return { wait: { emoji: '👀', title: 'Olha pra TV!', msg: 'O estrago tá lá.' } };
      }
      case 'vote':
        return { wait: { emoji: '🗳️', title: 'Voto computado!', msg: 'Agora é torcer.' } };
      case 'result': {
        const g = this.gain.get(p.id) ?? 0;
        return { wait: { emoji: g ? '🎉' : '🫠', title: g ? `+${g} pontos` : 'Nada dessa vez', msg: g ? 'Nesse bloco. O crime compensa.' : 'Distorce mais da próxima vez.' } };
      }
      default:
        return { wait: { emoji: '👀', title: 'Olha pra TV!', msg: '' } };
    }
  }

  audienceView() {
    return { req: this.areq };
  }

  awards() {
    return [
      this.topStat('votes', 'Fake News Ambulante', 'Arrancou {n} voto(s) tirando os amigos de contexto.'),
      this.topStat('authorVotes', 'Resposta Perigosa', 'Suas respostas "inocentes" renderam {n} voto(s). Inocentes, sei.'),
      this.topStat('total', 'Unanimidade', 'Levou TODOS os votos {n} vez(es). Sem defesa.'),
      this.topStat('safety', 'Me Salva!', 'Pediu socorro pro Bobo {n} vez(es).'),
    ];
  }
}
