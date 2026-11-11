// Racha a Sala na TV.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, P } from '../common.js';

function Sentence({ t, fill }) {
  const [a, b] = String(t).split(/_{3,}/);
  return html`<span>${a}<mark class="fill">${fill}</mark>${b ?? ''}</span>`;
}

function Bucket({ s, kind, ids, aud, label }) {
  return html`<div class=${cls('rc-bucket', kind)}>
    <div class="rc-label">${label}</div>
    <div class="rc-count">${ids ? ids.length : ''}</div>
    <div class="rc-avs">${(ids ?? []).map((id, i) => html`<div class="rc-av" style=${`--i:${i}`} key=${id}><${Avatar} p=${P(s, id)} size=${70} /></div>`)}</div>
    ${aud ? html`<div class="rc-aud">👥 ${aud}</div>` : null}
  </div>`;
}

function Item({ s, g, v }) {
  const res = v.res;
  const Y = res?.yes?.length ?? 0;
  const N = res?.no?.length ?? 0;
  const tilt = res?.shown ? Math.max(-14, Math.min(14, (N - Y) * 5)) : 0;
  const author = v.author ? P(s, v.author) : null;
  return html`<div class="rc-item">
    <div class="prompt-card big pop-in rc-card" key=${v.idx}>
      <${Sentence} t=${v.t} fill=${v.fill} />
      <div class="rc-q">${v.q}</div>
    </div>
    <div class=${cls('rc-scale', res?.shown && 'live', res?.perfect && res?.shown && 'perfect')}>
      <div class="rc-beam" style=${`transform:rotate(${tilt}deg)`}><i class="l" /><i class="r" /></div>
      <div class="rc-pivot" />
    </div>
    <div class="rc-buckets">
      <${Bucket} s=${s} kind="yes" label="SIM 👍" ids=${res ? res.yes : null} aud=${res?.shown ? res.aud?.yes : 0} />
      <${Bucket} s=${s} kind="no" label="NÃO 👎" ids=${res ? res.no : null} aud=${res?.shown ? res.aud?.no : 0} />
    </div>
    ${res?.shown && res.perfect ? html`<div class="rc-crack"><span>RACHOU!</span></div>` : null}
    ${author
      ? html`<div class="rc-author pop-in" style=${`--pc:${author.color}`}><${Avatar} p=${author} size=${64} /><span>${author.name}</span><b>+${fmt(res.pts)}</b></div>`
      : null}
    ${g.phase === 'vote' ? html`<div class="vote-banner">SIM OU NÃO?</div><${PlayerStrip} s=${s} pending=${v.pending} size=${54} />` : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'write':
      return html`<div class="center-col">
        <h1 class="mega pop-in">RODADA ${v.round}</h1>
        <div class="sub">Completem o dilema pra rachar a sala ao meio</div>
        <div class="big-emoji wobble">🪓</div>
        <${PlayerStrip} s=${s} label="Escrevendo…" />
      </div>`;
    case 'show':
    case 'vote':
    case 'result':
      return html`<${Item} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${`Placar · Rodada ${v.round}`} />`;
    default:
      return null;
  }
}

export default {
  View,
  music: (phase) => ({ write: 'chill', show: 'tension', vote: 'tension', result: 'tension', scores: 'results' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.round ? `Rodada ${g.view.round}${g.view.idx ? ` · ${g.view.idx}/${g.view.total}` : ''}` : null),
  theme: (g) => ({ energy: g.phase === 'result' ? 1 : 0.5 }),
};
