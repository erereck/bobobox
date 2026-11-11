// Quiz Macabro na TV: hotel assombrado, salas de tortura e a grande fuga.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, P } from '../common.js';

const SYMBOLS = [
  { e: '💀', c: '#ff5c5c' },
  { e: '🕷️', c: '#a77bff' },
  { e: '🦇', c: '#2ec4ff' },
  { e: '🎃', c: '#ff8a3d' },
];
const LETTERS = ['A', 'B', 'C', 'D'];
const OPT_COLORS = ['#ff5c5c', '#2ec4ff', '#ffd23f', '#3ddc84'];

function Soul({ s, id, size = 64, dead }) {
  const p = P(s, id);
  return html`<div class=${cls('qz-soul', dead && 'ghost')}>
    <${Avatar} p=${p} size=${size} />
    ${dead ? html`<span class="qz-ghost-badge">👻</span>` : null}
  </div>`;
}

function Money({ s, g, v }) {
  const dead = new Set(v.dead ?? []);
  return html`<div class="qz-money">
    ${s.room.players
      .filter((p) => g.scores[p.id] != null)
      .map(
        (p) => html`<div class=${cls('qz-m', dead.has(p.id) && 'ghost', g.pending.includes(p.id) && 'pending')} key=${p.id}>
          <${Soul} s=${s} id=${p.id} size=${50} dead=${dead.has(p.id)} />
          <span class="qz-m-name">${p.name}</span>
          <b>${dead.has(p.id) ? `🟢 ${v.ecto?.[p.id] ?? 0}` : `R$ ${fmt(g.scores[p.id])}`}</b>
        </div>`,
      )}
  </div>`;
}

function Question({ s, g, v }) {
  const answered = g.phase === 'answer';
  return html`<div class="qz-q">
    <div class="qz-qcard pop-in" key=${v.q}>
      <div class="qz-cat">${v.cat} · pergunta ${v.qn}/${v.total}</div>
      <div class="qz-text">${v.q}</div>
    </div>
    <div class="qz-opts">
      ${v.options.map((o, i) => {
        const ok = answered && i === v.correct;
        return html`<div class=${cls('qz-opt', answered && (ok ? 'right' : 'wrong'))} style=${`--oc:${OPT_COLORS[i]};--i:${i}`}>
          <span class="qz-letter">${LETTERS[i]}</span>
          <span class="qz-otext">${o}</span>
          ${answered
            ? html`<div class="qz-who">${(v.by?.[i] ?? []).map((id) => html`<${Soul} s=${s} id=${id} size=${42} dead=${v.dead.includes(id)} />`)}${v.aud?.[String(i)] ? html`<em>👥${v.aud[String(i)]}</em>` : null}</div>`
            : null}
        </div>`;
      })}
    </div>
    <${Money} s=${s} g=${g} v=${v} />
  </div>`;
}

function TortureHead({ v, sub }) {
  return html`<div class="qz-thead"><div class="qz-tlabel">SALA DE TORTURA</div><h1 class="qz-tname font-creepster">${v.name}</h1>${sub ? html`<div class="sub">${sub}</div>` : null}</div>`;
}

function Victims({ s, v, result }) {
  const dies = new Set(v.dies ?? []);
  return html`<div class="qz-victims">
    ${v.victims.map((id) => {
      const p = P(s, id);
      const d = result && dies.has(id);
      const det = v.detail ?? {};
      const extra = result
        ? det.taps
          ? `${det.taps[id]} toques`
          : det.right
            ? `${det.right[id]}/3 certas`
            : det.picks
              ? `bebeu o cálice ${Number(det.picks[id]) + 1}`
              : det.answers
                ? (det.answers[id] ?? []).map((x) => SYMBOLS[x]?.e).join('') || 'nada'
                : ''
        : '';
      return html`<div class=${cls('qz-victim', result && (d ? 'died' : 'lived'), !result && 'chained')} key=${id}>
        <${Soul} s=${s} id=${id} size=${120} dead=${d} />
        <div class="qz-vname" style=${`--pc:${p?.color}`}>${p?.name}</div>
        ${result ? html`<div class="qz-verdict">${d ? '💀 MORREU' : '😮‍💨 VIVO'}</div>${extra ? html`<small>${extra}</small>` : null}` : null}
      </div>`;
    })}
  </div>`;
}

function Cups({ v, result, s }) {
  const det = v.detail ?? {};
  const K = result ? det.K : v.k;
  return html`<div class="qz-cups">
    ${Array.from({ length: K }, (_, i) => {
      const poison = result && String(i) === det.poison;
      const drinkers = result ? Object.entries(det.picks ?? {}).filter(([, c]) => c === String(i)).map(([id]) => id) : [];
      return html`<div class=${cls('qz-cup', poison && 'poison')} style=${`--i:${i}`}>
        <div class="qz-drinkers">${drinkers.map((id) => html`<${Avatar} p=${P(s, id)} size=${44} />`)}</div>
        <div class="qz-goblet">🍷</div>
        ${poison ? html`<div class="qz-skull">☠️</div>` : null}
        <div class="qz-cupn">${i + 1}</div>
      </div>`;
    })}
  </div>`;
}

function Track({ s, v }) {
  const goal = v.goal ?? 10;
  const dead = new Set(v.dead ?? []);
  const byCell = {};
  for (const [id, pos] of Object.entries(v.pos ?? {})) (byCell[pos] ??= []).push(id);
  return html`<div class="qz-track">
    <div class="qz-hall">
      ${Array.from({ length: goal + 1 }, (_, i) => html`<div class=${cls('qz-cell', i === goal && 'door')}>${i === goal ? '🚪' : i}</div>`)}
    </div>
    ${Object.entries(v.pos ?? {}).map(([id, pos]) => {
      const stack = byCell[pos].indexOf(id);
      const mv = v.moves?.[id];
      return html`<div class=${cls('qz-runner', dead.has(id) && 'ghost', v.winner === id && 'winner')} key=${id} style=${`left:${(pos / goal) * 100}%;--stack:${stack}`}>
        <${Soul} s=${s} id=${id} size=${58} dead=${dead.has(id)} />
        ${mv ? html`<span class="qz-move">+${mv}</span>` : null}
      </div>`;
    })}
  </div>`;
}

function Final({ s, g, v }) {
  const sw = v.swaps?.[0];
  return html`<div class="qz-final">
    ${g.phase === 'finalIntro' ? html`<h1 class="mega font-creepster qz-title pop-in">A GRANDE FUGA</h1><div class="sub">O primeiro VIVO a chegar na porta escapa. Fantasmas que alcançarem os vivos roubam seus corpos!</div>` : null}
    ${v.cat && g.phase !== 'finalIntro' && g.phase !== 'finalWin'
      ? html`<div class="qz-fq pop-in" key=${v.k}>
          <div class="qz-fcat">${v.cat}</div>
          <div class="qz-fitems">${v.items.map((it, i) => html`<div class=${cls('qz-fitem', it.ok === true && 'ok', it.ok === false && 'no')} style=${`--i:${i}`}>${it.t}</div>`)}</div>
        </div>`
      : null}
    ${g.phase === 'finalWin' ? html`<h1 class="mega font-creepster qz-title pop-in">${P(s, v.winner)?.name} ESCAPOU!</h1>` : null}
    <${Track} s=${s} v=${v} />
    ${sw ? html`<div class="qz-swap pop-in">👻 ${P(s, sw.ghost)?.name} possuiu ${P(s, sw.victim)?.name}!</div>` : null}
    ${g.phase === 'finalQ' ? html`<${PlayerStrip} s=${s} size=${46} />` : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'question':
    case 'answer':
      return html`<${Question} s=${s} g=${g} v=${v} />`;
    case 'tortureIntro':
      return html`<div class="qz-torture"><${TortureHead} v=${v} sub=${v.rule} /><${Victims} s=${s} v=${v} /></div>`;
    case 'cups':
      return html`<div class="qz-torture"><${TortureHead} v=${v} sub="Vítimas escolhem um cálice. Os vivos escolhem qual envenenar." /><${Cups} v=${v} s=${s} /><${PlayerStrip} s=${s} size=${50} /></div>`;
    case 'math':
    case 'taps':
    case 'truefalse':
    case 'memoryInput':
      return html`<div class="qz-torture"><${TortureHead} v=${v} sub=${g.phase === 'memoryInput' ? 'Repitam a sequência no celular!' : 'Olhem o celular. Rápido!'} /><${PlayerStrip} s=${s} ids=${v.victims} size=${110} /></div>`;
    case 'memoryShow':
      return html`<div class="qz-torture"><${TortureHead} v=${v} sub="DECOREM!" />
        <div class="qz-mem">${v.seq != null ? html`<div class="qz-sym" key=${v.idx} style=${`--sc:${SYMBOLS[v.seq].c}`}>${SYMBOLS[v.seq].e}</div>` : html`<div class="qz-sym empty">?</div>`}</div>
      </div>`;
    case 'tortureResult':
      return html`<div class="qz-torture">
        <${TortureHead} v=${v} />
        ${v.type === 'cups' ? html`<${Cups} v=${v} s=${s} result=${true} />` : null}
        ${v.type === 'memory' ? html`<div class="qz-seq">Sequência: ${(v.detail?.seq ?? []).map((x) => html`<span style=${`--sc:${SYMBOLS[x].c}`}>${SYMBOLS[x].e}</span>`)}</div>` : null}
        <${Victims} s=${s} v=${v} result=${true} />
      </div>`;
    case 'finalIntro':
    case 'finalQ':
    case 'finalMove':
    case 'finalWin':
      return html`<${Final} s=${s} g=${g} v=${v} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  introMusic: 'spooky',
  music: (phase) => (['cups', 'math', 'taps', 'truefalse', 'memoryInput', 'finalQ', 'finalMove'].includes(phase) ? 'tension' : phase === 'finalWin' ? 'results' : 'spooky'),
  roundLabel: (g) => (g.view?.goal ? 'A GRANDE FUGA' : g.view?.qn ? `Pergunta ${g.view.qn} de ${g.view.total}` : null),
  theme: (g) => ({ c1: '#5b2a86', c2: '#2f7d1f', base: '#0b0614', energy: g.phase?.startsWith('t') || g.phase === 'cups' ? 1 : 0.35 }),
  mood: () => 'spooky',
};
