// Garrancho na TV.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar, Drawing } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, VoteBadges, P } from '../common.js';

export function Frame({ d, animate, small, label, key: k }) {
  return html`<div class=${cls('frame', small && 'small')}>
    <div class="frame-tape l" /><div class="frame-tape r" />
    <${Drawing} d=${d} animate=${animate} duration=${3.2} key=${k} />
    ${label ? html`<div class="frame-label">${label}</div>` : null}
  </div>`;
}

function Reveal({ s, v }) {
  const c = v.cur;
  const authors = c.authors ?? [];
  return html`<div class=${cls('gar-reveal', c.truth && 'truth', c.house && 'house')} key=${c.key}>
    <div class="gr-text">${c.text}</div>
    <div class="gr-pickers">
      ${c.pickers.length ? html`<${VoteBadges} s=${s} ids=${c.pickers} size=${62} />` : html`<span class="muted">ninguém escolheu</span>`}
      ${c.aud ? html`<span class="gr-aud">👥 ${c.aud}</span>` : null}
    </div>
    ${v.step >= 1
      ? html`<div class="gr-stamp">${c.truth ? 'VERDADE!' : c.house ? 'MENTIRA DO BOBO' : 'MENTIRA!'}</div>
          <div class="gr-authors">
            ${authors.map((id) => {
              const p = P(s, id);
              return html`<div class="gr-author" style=${`--pc:${p?.color}`}><${Avatar} p=${p} size=${70} /><span>${c.truth ? `desenho de ${p?.name}` : p?.name}</span></div>`;
            })}
            ${c.truth
              ? c.pts?.finder && c.pickers.length ? html`<div class="gr-pts">+${fmt(c.pts.finder)} pra quem achou · +${fmt(c.pts.artist)} pro artista</div>` : html`<div class="gr-pts sad">Ninguém achou 😬</div>`
              : c.pts ? html`<div class="gr-pts">+${fmt(c.pts)}</div>` : null}
            ${c.likes ? html`<div class="gr-likes">❤️ ${c.likes}</div>` : null}
          </div>`
      : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'draw':
      return html`<div class="center-col">
        <h1 class="mega font-marker pop-in">DESENHEM!</h1>
        <div class="sub">${v.rounds > 1 ? `Rodada ${v.round} de ${v.rounds} · ` : ''}cada um tem um tema secreto no celular</div>
        <div class="big-emoji wobble">🖍️</div>
        <${PlayerStrip} s=${s} label="Desenhando…" />
      </div>`;
    case 'title':
      return html`<div class="gar-layout">
        <${Frame} d=${v.d} animate=${true} key=${'f' + v.idx} label=${`${v.idx}/${v.total}`} />
        <div class="gar-side">
          <h2 class="gar-q font-marker pop-in">Que diabos é isso?</h2>
          <div class="sub">Inventem um título falso no celular</div>
        </div>
        <${PlayerStrip} s=${s} pending=${v.pending} size=${58} />
      </div>`;
    case 'guess':
      return html`<div class="gar-layout">
        <${Frame} d=${v.d} small=${true} label=${`${v.idx}/${v.total}`} />
        <div class="gar-side">
          <h2 class="gar-q small font-marker">Qual é o verdadeiro?</h2>
          <div class="gar-options">
            ${v.options.map((o, i) => html`<div class="gar-opt" style=${`--i:${i}`}>${o.text}</div>`)}
          </div>
        </div>
        <${PlayerStrip} s=${s} pending=${v.pending} size=${54} />
      </div>`;
    case 'reveal':
      return html`<div class="gar-layout">
        <${Frame} d=${v.d} small=${true} label=${`${v.idx}/${v.total}`} />
        <div class="gar-side">
          <div class="gar-options mini">
            ${v.options.map((o) => html`<div class=${cls('gar-opt', o.done && 'done', o.key === v.cur.key && 'now')}>${o.text}${o.pickers ? html`<b>${o.pickers}</b>` : null}</div>`)}
          </div>
          <${Reveal} s=${s} v=${v} />
        </div>
      </div>`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title="Placar" />`;
    default:
      return null;
  }
}

export default {
  View,
  font: null,
  music: (phase) => ({ draw: 'chill', title: 'chill', guess: 'tension', reveal: 'tension', scores: 'results' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.idx ? `Desenho ${g.view.idx} de ${g.view.total}` : null),
  theme: (g) => ({ energy: g.phase === 'reveal' ? 0.9 : 0.45 }),
};
