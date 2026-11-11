// Bate-Boca na TV.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, VoteBadges, PromptText, Typewriter, P } from '../common.js';

function Bubble({ s, side, slot, res, total, show }) {
  if (!show) return html`<div class=${cls('bb-bubble', side, 'hidden')} />`;
  const r = res?.[side];
  const author = slot.id ? P(s, slot.id) : null;
  const votes = r?.votes ?? [];
  const pct = total ? Math.round((votes.length / total) * 100) : 0;
  const lav = res?.lavada === side;
  const lost = res?.lavada && !lav;
  return html`<div class=${cls('bb-bubble', side, 'in', lav && 'lavada', lost && 'lost', res && 'revealed')} key=${side}>
    <div class="bb-text">${slot.text ?? html`<i class="muted">sem resposta</i>`}</div>
    ${res
      ? html`<div class="bb-res">
          <${VoteBadges} s=${s} ids=${votes} size=${54} />
          <div class="bb-pct" style=${res.forfeit ? "visibility:hidden" : ""}>${pct}%${res.aud && (res.aud.a + res.aud.b) ? html`<small>👥 ${res.aud[side]}</small>` : null}</div>
          <div class="bb-author" style=${`--pc:${author?.color}`}>
            <${Avatar} p=${author} size=${84} />
            <span>${author?.name}</span>
            ${slot.safety ? html`<em class="tag-safety">🆘 me salva</em>` : null}
          </div>
          <div class="bb-pts">+${fmt(r?.pts ?? 0)}</div>
        </div>`
      : null}
    ${lav ? html`<div class="lavada-splash"><span>LAVADA!</span>${Array.from({ length: 14 }, (_, i) => html`<i style=${`--i:${i}`} />`)}</div>` : null}
  </div>`;
}

function Duel({ s, g, v }) {
  const res = v.res;
  const total = res ? res.a.votes.length + res.b.votes.length : 0;
  return html`<div class="bb-duel">
    <div class="bb-count">Duelo ${v.idx} de ${v.total}</div>
    <div class="prompt-card big pop-in" key=${v.prompt}><${PromptText} text=${v.prompt} /></div>
    <div class="bb-arena">
      <${Bubble} s=${s} side="a" slot=${v.a} res=${res} total=${total} show=${v.step >= 1} />
      <div class=${cls('bb-vs', v.step >= 2 && 'on')}>VS</div>
      <${Bubble} s=${s} side="b" slot=${v.b} res=${res} total=${total} show=${v.step >= 2} />
    </div>
    ${g.phase === 'vote' ? html`<div class="vote-banner">VOTEM NO CELULAR!</div><${PlayerStrip} s=${s} pending=${v.pending} size=${56} />` : null}
    ${res?.forfeit ? html`<div class="vote-banner">W.O.!</div>` : null}
  </div>`;
}

function FinalGrid({ s, g, v }) {
  const result = g.phase === 'finalResult';
  return html`<div class="bb-final">
    <div class="prompt-card pop-in"><span class="final-tag">🔥 RODADA FINAL</span><${PromptText} text=${v.prompt} /></div>
    <div class=${cls('final-grid', `n${Math.min(v.answers.length, 10)}`)}>
      ${v.answers.map((a, i) => {
        if (!result && i > v.step) return html`<div class="final-ans hidden" key=${a.key} />`;
        const p = result ? P(s, a.id) : null;
        const top = result && i === 0 && a.votes.length > 0;
        return html`<div class=${cls('final-ans', 'in', top && 'top', result && 'res')} key=${a.key} style=${`--i:${i}`}>
          ${top ? html`<div class="final-crown">👑</div>` : null}
          <div class="fa-text">${a.text}</div>
          ${result
            ? html`<div class="fa-foot">
                <${Avatar} p=${p} size=${44} /><span class="fa-name" style=${`--pc:${p?.color}`}>${p?.name}</span>
                <${VoteBadges} s=${s} ids=${a.votes} size=${30} />
                <b class="fa-pts">+${fmt(a.pts)}</b>
              </div>`
            : null}
        </div>`;
      })}
    </div>
    ${g.phase === 'finalVote' ? html`<div class="vote-banner small">Distribuam 3 votos!</div><${PlayerStrip} s=${s} size=${54} />` : null}
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'write':
      return html`<div class="center-col">
        <h1 class="mega pop-in">RODADA ${v.round}</h1>
        <div class="sub">${v.round === 2 ? 'Pontos em DOBRO!' : 'Olhem pro celular e escrevam!'}</div>
        <div class="big-emoji wobble">✍️</div>
        <${PlayerStrip} s=${s} label="Escrevendo…" />
      </div>`;
    case 'duel':
    case 'vote':
    case 'result':
      return html`<${Duel} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${v.final ? 'Placar final' : `Placar · Rodada ${v.round}`} />`;
    case 'finalIntro':
      return html`<div class="center-col"><h1 class="mega fire pop-in">RODADA FINAL</h1><div class="sub">Todo mundo responde o mesmo prompt</div><div class="big-emoji wobble">🔥</div></div>`;
    case 'finalWrite':
      return html`<div class="center-col">
        <div class="prompt-card big pop-in"><span class="final-tag">🔥 RODADA FINAL</span><${Typewriter} text=${v.prompt} /></div>
        <${PlayerStrip} s=${s} label="Escrevendo…" />
      </div>`;
    case 'finalShow':
    case 'finalVote':
    case 'finalResult':
      return html`<${FinalGrid} s=${s} g=${g} v=${v} />`;
    default:
      return null;
  }
}

export default {
  View,
  music: (phase) => ({ write: 'chill', finalWrite: 'chill', duel: 'tension', vote: 'tension', result: 'tension', finalShow: 'tension', finalVote: 'tension', scores: 'results', finalResult: 'results', finalIntro: 'tension' })[phase] ?? 'lobby',
  roundLabel: (g) => (g.view?.round === 3 ? 'RODADA FINAL' : g.view?.round ? `Rodada ${g.view.round} · pontos x${g.view.round}` : null),
  theme: (g) => ({ energy: g.phase === 'vote' || g.phase === 'finalVote' ? 0.9 : 0.5 }),
};
