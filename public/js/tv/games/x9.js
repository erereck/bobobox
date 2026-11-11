// X9 na TV.
import { html } from '/vendor/preact.js';
import { cls } from '../../shared/core.js';
import { Avatar, Drawing } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, P } from '../common.js';

function Votes({ v, id }) {
  const n = v.tally?.[id] ?? 0;
  const a = v.aud?.[id] ?? 0;
  if (!v.tally) return null;
  return html`<div class=${cls('x9-votes', n && 'on')}>${n ? `🗳️ ${n}` : ''}${a ? html`<small>👥${a}</small>` : null}</div>`;
}

function Stamp({ v, id }) {
  if (v.x9 !== id) return null;
  return html`<div class=${cls('x9-stamp', v.caught ? 'caught' : 'free')}>${v.caught ? 'X9 PEGO!' : 'X9 ESCAPOU!'}</div>`;
}

function NumberLine({ s, v }) {
  const span = Math.max(1, v.max - v.min);
  // empilha quem ficou perto demais na linha (andares)
  const floors = [];
  const level = {};
  for (const a of [...v.answers].sort((x, y) => x.n - y.n)) {
    const pct = ((a.n - v.min) / span) * 100;
    let f = 0;
    while (floors[f] != null && pct - floors[f] < 7) f++;
    floors[f] = pct;
    level[a.id] = f;
  }
  return html`<div class="x9-line">
    <div class="x9-axis"><span>${v.min}</span><span>${v.max}</span></div>
    ${v.answers.map((a) => {
      const lvl = level[a.id] ?? 0;
      const pct = ((a.n - v.min) / span) * 100;
      const p = P(s, a.id);
      return html`<div class=${cls('x9-pin', v.x9 === a.id && 'is-x9', v.x9 && v.x9 !== a.id && 'dim')} key=${a.id} style=${`left:${pct}%;--lvl:${lvl}`}>
        <div class="x9-pin-n">${a.n}</div>
        <${Avatar} p=${p} size=${74} />
        <div class="x9-pin-name" style=${`--pc:${p?.color}`}>${p?.name}</div>
        <${Votes} v=${v} id=${a.id} />
        <${Stamp} v=${v} id=${a.id} />
      </div>`;
    })}
  </div>`;
}

function Cards({ s, v }) {
  const many = v.answers.length > 6;
  return html`<div class=${cls('x9-cards', many && 'many', v.type === 'draw' && 'draws')}>
    ${v.answers.map((a, i) => {
      const p = P(s, a.id);
      const target = a.pid ? P(s, a.pid) : null;
      return html`<div class=${cls('x9-card', v.x9 === a.id && 'is-x9', v.x9 && v.x9 !== a.id && 'dim')} key=${a.id} style=${`--pc:${p?.color};--i:${i}`}>
        <div class="x9-who"><${Avatar} p=${p} size=${52} /><span>${p?.name}</span></div>
        ${a.d ? html`<div class="x9-draw"><${Drawing} d=${a.d} animate=${true} duration=${1.4} /></div>` : null}
        ${a.text != null ? html`<div class="x9-text">${a.text}</div>` : null}
        ${target ? html`<div class="x9-target"><span>➜</span><${Avatar} p=${target} size=${60} /><b>${target.name}</b></div>` : null}
        ${a.pid && !target ? html`<div class="x9-text">?</div>` : null}
        <${Votes} v=${v} id=${a.id} />
        <${Stamp} v=${v} id=${a.id} />
      </div>`;
    })}
  </div>`;
}

function Board({ s, g, v }) {
  return html`<div class="x9-board">
    <div class="prompt-card x9-q pop-in"><span class="x9-q-label">A PERGUNTA ERA</span>${v.q}</div>
    ${v.type === 'number' ? html`<${NumberLine} s=${s} v=${v} />` : html`<${Cards} s=${s} v=${v} />`}
    ${g.phase === 'discuss' ? html`<div class="x9-discuss"><span>🗣️ DEBATAM!</span><small>Quem destoou? Acusem em voz alta.</small></div>` : null}
    ${g.phase === 'vote' ? html`<div class="vote-banner">QUEM É O X9?</div><${PlayerStrip} s=${s} size=${54} />` : null}
    ${v.qb ? html`<div class=${cls('x9-qb', v.caught ? 'caught' : 'free')}><b>A pergunta do X9 era:</b> ${v.qb}</div>` : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'answer':
      return html`<div class="center-col">
        <h1 class="mega pop-in">RESPONDAM!</h1>
        <div class="sub">Um de vocês recebeu uma pergunta diferente… e nem sabe.</div>
        <div class="big-emoji x9-eye">🕵️</div>
        <${PlayerStrip} s=${s} label="Respondendo…" />
      </div>`;
    case 'reveal':
    case 'discuss':
    case 'vote':
    case 'result':
      return html`<${Board} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${`Placar · Rodada ${v.round}/${v.rounds}`} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  music: (phase) => ({ answer: 'chill', reveal: 'tension', discuss: 'tension', vote: 'tension', result: 'tension', scores: 'results' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.round ? `Rodada ${g.view.round} de ${g.view.rounds}` : null),
  theme: (g) => ({ base: '#0c2a22', energy: g.phase === 'discuss' ? 1 : 0.5 }),
};
