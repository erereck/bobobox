// Lorota na TV.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, VoteBadges, P } from '../common.js';

function Fact({ q, answer, cat, final, big }) {
  const [a, b] = String(q).split(/_{3,}/);
  return html`<div class=${cls('prompt-card', 'lo-fact', big && 'big', 'pop-in')}>
    <div class="lo-cat">${final ? '🔥 LOROTA FINAL · ' : ''}${cat}</div>
    ${a}${answer ? html`<mark class="lo-truth">${answer}</mark>` : html`<span class="blank">______</span>`}${b ?? ''}
  </div>`;
}

function Reveal({ s, v }) {
  const c = v.cur;
  return html`<div class=${cls('gar-reveal', 'lo-reveal', c.truth && 'truth', c.house && 'house')} key=${c.key}>
    <div class="gr-text">${c.text}</div>
    <div class="gr-pickers">
      ${c.pickers.length ? html`<${VoteBadges} s=${s} ids=${c.pickers} size=${62} />` : html`<span class="muted">ninguém escolheu</span>`}
      ${c.aud ? html`<span class="gr-aud">👥 ${c.aud}</span>` : null}
    </div>
    ${v.step >= 1
      ? html`<div class="gr-stamp">${c.truth ? 'VERDADE!' : c.house ? 'LOROTA DO BOBO' : 'LOROTA!'}</div>
          <div class="gr-authors">
            ${(c.authors ?? []).map((id) => {
              const p = P(s, id);
              return html`<div class="gr-author" style=${`--pc:${p?.color}`}><${Avatar} p=${p} size=${70} /><span>${p?.name}</span></div>`;
            })}
            ${c.pts ? html`<div class="gr-pts">+${fmt(c.pts)}${c.truth ? ' cada' : ''}</div>` : c.truth ? html`<div class="gr-pts sad">Ninguém achou 😬</div>` : null}
            ${c.likes ? html`<div class="gr-likes">❤️ ${c.likes}</div>` : null}
          </div>`
      : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'category': {
      const p = P(s, v.chooser);
      return html`<div class="lo-cats">
        <div class="lo-chooser pop-in"><${Avatar} p=${p} size=${120} /><div><b>${p?.name}</b> escolhe a categoria</div></div>
        <div class="lo-cat-grid">
          ${v.cats.map((c, i) => html`<div class=${cls('lo-cat-card', v.picked === i && 'picked', v.picked != null && v.picked !== i && 'out')} style=${`--i:${i}`}>${c}</div>`)}
        </div>
        ${v.final ? html`<div class="sub">🔥 Lorota Final · pontos x3</div>` : html`<div class="sub">Pergunta ${v.n} de ${v.count}</div>`}
      </div>`;
    }
    case 'lie':
      return html`<div class="center-col lo-col">
        <${Fact} q=${v.q} cat=${v.cat} final=${v.final} big=${true} />
        <div class="sub">Escrevam uma MENTIRA convincente pra lacuna</div>
        <${PlayerStrip} s=${s} label="Mentindo…" />
      </div>`;
    case 'pick':
      return html`<div class="lo-pick">
        <${Fact} q=${v.q} cat=${v.cat} final=${v.final} />
        <div class=${cls('lo-options', v.options.length > 6 && 'many')}>
          ${v.options.map((o, i) => html`<div class="lo-opt" style=${`--i:${i}`}>${o.text}</div>`)}
        </div>
        <${PlayerStrip} s=${s} size=${54} />
      </div>`;
    case 'reveal':
      return html`<div class="lo-pick">
        <${Fact} q=${v.q} cat=${v.cat} final=${v.final} answer=${v.answer} />
        <div class="lo-reveal-row">
          <div class="gar-options mini">
            ${v.options.map((o) => html`<div class=${cls('gar-opt', o.done && 'done', o.key === v.cur.key && 'now')}>${o.text}${o.pickers ? html`<b>${o.pickers}</b>` : null}</div>`)}
          </div>
          <${Reveal} s=${s} v=${v} />
        </div>
      </div>`;
    case 'finalIntro':
      return html`<div class="center-col"><h1 class="mega fire pop-in">A LOROTA FINAL</h1><div class="sub">Pontos em TRIPLO</div><div class="big-emoji wobble">🤥</div></div>`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${v.final ? 'Placar final' : 'Placar'} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  music: (phase) => ({ category: 'lobby', lie: 'chill', pick: 'tension', reveal: 'tension', scores: 'results', finalIntro: 'tension' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.round === 3 ? 'LOROTA FINAL · x3' : g.view?.round ? `Rodada ${g.view.round} · pontos x${g.view.round}` : null),
  theme: (g) => ({ energy: g.phase === 'reveal' ? 0.9 : 0.5 }),
};
