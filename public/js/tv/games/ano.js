// Que Ano Foi? na TV: linha do tempo com os chutes e a bandeira do ano certo.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, P } from '../common.js';

function Timeline({ s, v }) {
  const entries = Object.entries(v.results ?? {});
  const vals = entries.map(([, x]) => x.g);
  if (v.y != null) vals.push(v.y);
  if (v.audAvg != null) vals.push(v.audAvg);
  const lo = Math.min(...vals) - 3;
  const hi = Math.max(...vals) + 3;
  const span = Math.max(10, hi - lo);
  const x = (year) => ((year - lo) / span) * 100;
  const sorted = [...entries].sort((a, b) => a[1].g - b[1].g);
  // espalha avatares que ficam muito perto em "andares"
  const floors = [];
  const placed = sorted.map(([id, r]) => {
    let f = 0;
    while (floors[f] != null && x(r.g) - floors[f] < 7) f++;
    floors[f] = x(r.g);
    return { id, r, f };
  });
  return html`<div class="an-line">
    <div class="an-axis">
      ${Array.from({ length: 6 }, (_, i) => Math.round(lo + (span * i) / 5)).map((yr) => html`<span style=${`left:${x(yr)}%`}>${yr}</span>`)}
    </div>
    ${placed.map(({ id, r, f }) => {
      const p = P(s, id);
      return html`<div class=${cls('an-pin', v.y != null && r.diff === 0 && 'bull', v.y != null && r.best && 'best')} key=${id} style=${`left:${x(r.g)}%;--f:${f}`}>
        <div class="an-year">${r.g}</div>
        <${Avatar} p=${p} size=${62} />
        ${v.y != null ? html`<div class="an-pts">+${fmt(r.pts)}</div>` : null}
        <div class="an-stick" />
      </div>`;
    })}
    ${v.audAvg != null ? html`<div class="an-aud" style=${`left:${x(v.audAvg)}%`}>👥 ${v.audAvg}</div>` : null}
    ${v.y != null ? html`<div class="an-flag" style=${`left:${x(v.y)}%`}><div class="an-flag-cloth">${v.y}</div><div class="an-pole" /></div>` : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'guess':
      return html`<div class="center-col an-guess">
        <div class="an-q pop-in" key=${v.r}>
          <div class="an-label">QUE ANO FOI?${v.mult > 1 ? ' · VALE DOBRO' : ''}</div>
          <div class="an-event">${v.e}</div>
        </div>
        <div class="big-emoji wobble">📅</div>
        <${PlayerStrip} s=${s} label="Chutando…" />
      </div>`;
    case 'reveal':
      return html`<div class="an-reveal">
        <div class="an-q small"><div class="an-event">${v.e}</div></div>
        ${v.y != null ? html`<div class="an-big pop-in">${v.y}</div>` : html`<div class="an-big suspense">????</div>`}
        <${Timeline} s=${s} v=${v} />
      </div>`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title="Placar final" />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  music: (phase) => ({ guess: 'chill', reveal: 'tension', scores: 'results' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.r ? `Rodada ${g.view.r} de ${g.view.total}` : null),
  theme: (g) => ({ energy: g.phase === 'reveal' ? 0.9 : 0.45 }),
};
