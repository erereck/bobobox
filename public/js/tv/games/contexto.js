// Fora de Contexto na TV. Cada "molde" tem um visual próprio:
// zap da família, portal de notícias, review 1 estrela, placa, lápide,
// tatuagem, app de namoro e outdoor.
import { html } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, VoteBadges, P } from '../common.js';

const MOLDS = {
  zap: { name: 'Grupo da Família', emoji: '💬', color: '#25d366', ctx: 'Mensagem', ans: 'Tia Cleide respondeu' },
  noticia: { name: 'Portal de Notícias', emoji: '📰', color: '#ff5a4e', ctx: 'Manchete', ans: 'Comentário mais curtido' },
  review: { name: 'Avaliação 1 Estrela', emoji: '⭐', color: '#ffb02e', ctx: 'Produto', ans: 'Avaliação' },
  placa: { name: 'Placa de Aviso', emoji: '🪧', color: '#ffd400', ctx: 'Local', ans: 'A placa diz' },
  ultimas: { name: 'Últimas Palavras', emoji: '🪦', color: '#aab2c0', ctx: 'Morreu', ans: 'Últimas palavras' },
  tattoo: { name: 'Tatuagem', emoji: '🖋️', color: '#8f9bff', ctx: 'Feita', ans: 'Tatuado' },
  namoro: { name: 'App de Namoro', emoji: '💘', color: '#ff6f91', ctx: 'Perfil', ans: 'Bio' },
  outdoor: { name: 'Outdoor', emoji: '📢', color: '#2ec4ff', ctx: 'Marca', ans: 'Slogan' },
};
const moldOf = (id) => MOLDS[id] ?? MOLDS.zap;

/** Tamanho de fonte que encolhe conforme o texto cresce. */
function fs(text, max, min, long = 60) {
  const n = String(text ?? '').length;
  const k = Math.min(1, Math.max(0, (n - 10) / (long - 10)));
  return `font-size:${(max - (max - min) * k).toFixed(2)}rem`;
}

function Skel({ short }) {
  return html`<div class=${cls('fc-skel', short && 'short')} />`;
}

function Stars({ n = 1 }) {
  return html`<span class="fc-stars">${[0, 1, 2, 3, 4].map((i) => html`<i class=${i < n ? 'on' : ''}>★</i>`)}</span>`;
}

// ───────── moldes ─────────

function Zap({ it, step }) {
  const x = it.x ?? {};
  const members = ['Tia Cleide', ...(x.members ?? []), 'você'].join(', ');
  return html`<div class="fc-zap fc-mold">
    <div class="fc-zap-head">
      <span class="fc-zap-back">‹</span>
      <span class="fc-zap-gav">👨‍👩‍👧‍👦</span>
      <div class="fc-zap-title">
        <b>Família Unida 🙏❤️</b>
        <small class=${cls(step === 0 && 'typing')}>${step === 0 ? 'Tia Cleide está digitando…' : members}</small>
      </div>
      <span class="fc-zap-icons">📹 📞 ⋮</span>
    </div>
    <div class="fc-zap-body">
      <div class="fc-zap-day">HOJE</div>
      <div class="fc-bub out fc-in-right">
        <span class="fc-bub-text" style=${fs(it.ctx, 2.6, 1.8, 80)}>${it.ctx}</span>
        <i class="fc-bub-meta">${x.time} <b>✓✓</b></i>
      </div>
      ${step >= 1
        ? html`<div class="fc-bub in fc-in-left" key="ans">
            <div class="fc-bub-name">Tia Cleide 💅</div>
            <div class="fc-bub-quote"><b>Você</b><span>${it.ctx}</span></div>
            <span class="fc-bub-text big" style=${fs(it.ans, 3.6, 2.3, 45)}>${it.ans}</span>
            <i class="fc-bub-meta">${x.time2}</i>
          </div>`
        : html`<div class="fc-bub in fc-typing" key="typing"><i /><i /><i /></div>`}
    </div>
    <div class="fc-zap-input"><span>😊 Mensagem</span><b>🎤</b></div>
  </div>`;
}

function News({ it, step }) {
  const x = it.x ?? {};
  return html`<div class="fc-news fc-mold">
    <div class="fc-news-top"><span>☰</span><b>bobo<em>news</em></b><span class="fc-news-live">● PLANTÃO</span></div>
    <div class="fc-news-body">
      <div class="fc-news-sec">BRASIL · URGENTE</div>
      <h2 class="fc-news-h" style=${fs(it.ctx, 3.4, 2.4, 80)}>${it.ctx}</h2>
      <div class="fc-news-by">Por Redação Bobobox · há ${x.mins ?? 5} minutos · Atualizado agora</div>
      <div class="fc-news-row">
        <div class="fc-news-photo"><span>🚨</span><small>Foto: Reprodução/Grupo da família</small></div>
        <p>Testemunhas dizem que ninguém esperava. O caso repercutiu nas redes e a família pede privacidade. Mais informações a qualquer momento.</p>
      </div>
      <div class="fc-news-cmts">💬 ${x.comments ?? '1.234'} comentários</div>
      ${step >= 1
        ? html`<div class="fc-news-cmt fc-in-up" key="ans">
            <div class="fc-news-av">${String(x.user ?? '@x').slice(1, 2).toUpperCase()}</div>
            <div class="fc-news-cbody">
              <div class="fc-news-user">${x.user} <span class="fc-badge">🏆 Mais curtido</span></div>
              <div class="fc-news-ctext" style=${fs(it.ans, 3, 2, 45)}>${it.ans}</div>
              <div class="fc-news-react">👍 ${x.likes ?? '1 mil'} · 👎 3 · Responder</div>
            </div>
          </div>`
        : html`<div class="fc-news-cmt ghost" key="ghost"><div class="fc-news-av">?</div><${Skel} /></div>`}
    </div>
  </div>`;
}

function Review({ it, step }) {
  const x = it.x ?? {};
  return html`<div class="fc-review fc-mold">
    <div class="fc-rv-top"><b>🛒 BoboShop</b><span class="fc-rv-search">Buscar produtos, marcas e muito mais…</span><span>🛒</span></div>
    <div class="fc-rv-prod">
      <div class="fc-rv-img">${x.icon ?? '📦'}</div>
      <div class="fc-rv-info">
        <div class="fc-rv-new">Novo · 1 vendido · Devolvido</div>
        <h2 style=${fs(it.ctx, 3, 2.1, 50)}>${it.ctx}</h2>
        <div class="fc-rv-stars"><${Stars} n=${1} /><span>1,0 (1 avaliação)</span></div>
        <div class="fc-rv-price">${x.price ?? 'R$ 49,90'}</div>
        <div class="fc-rv-ship">Frete grátis · Chega amanhã</div>
      </div>
    </div>
    <div class="fc-rv-ops">Opiniões do produto</div>
    ${step >= 1
      ? html`<div class="fc-rv-card fc-in-up" key="ans">
          <div class="fc-rv-head"><${Stars} n=${1} /><b>Não recomendo</b></div>
          <div class="fc-rv-text" style=${fs(it.ans, 3.2, 2.2, 45)}>“${it.ans}”</div>
          <div class="fc-rv-foot">${x.reviewer ?? 'Cliente'} · Comprador verificado ✔ · 👍 Útil (${x.helpful ?? 99})</div>
        </div>`
      : html`<div class="fc-rv-card ghost" key="ghost"><${Skel} /><${Skel} short=${true} /></div>`}
  </div>`;
}

function Sign({ it, step }) {
  return html`<div class="fc-polaroid fc-mold">
    <div class="fc-photo">
      <div class="fc-sign-post l" />
      <div class="fc-sign-post r" />
      <div class=${cls('fc-sign', step >= 1 && 'on')}>
        <div class="fc-sign-tri">⚠️</div>
        <div class="fc-sign-att">ATENÇÃO</div>
        ${step >= 1 ? html`<div class="fc-sign-text fc-in-slam" key="ans" style=${fs(it.ans, 3.8, 2.3, 45)}>${it.ans}</div>` : html`<div class="fc-sign-text dim" key="dim">• • •</div>`}
      </div>
    </div>
    <div class="fc-polaroid-cap"><small>📍 local da foto</small>${it.ctx}</div>
  </div>`;
}

function Tomb({ s, it, step }) {
  const x = it.x ?? {};
  const who = step >= 2 && it.author ? P(s, it.author)?.name : null;
  return html`<div class="fc-grave fc-mold">
    <div class="fc-grave-moon" />
    <div class="fc-grave-title font-creepster">Últimas Palavras</div>
    <div class="fc-tomb">
      <div class="fc-tomb-rip">R.I.P.</div>
      <div class="fc-tomb-jaz">AQUI JAZ</div>
      <div class="fc-tomb-name">${who ?? 'um cidadão de bem'}</div>
      <div class="fc-tomb-years">${x.born ?? 1970} – 2026</div>
      ${step >= 1 ? html`<div class="fc-tomb-words fc-in-fade" key="ans" style=${fs(it.ans, 3, 2, 45)}>“${it.ans}”</div>` : html`<div class="fc-tomb-words dim" key="dim">“…”</div>`}
      <div class="fc-tomb-how">Morreu ${it.ctx}</div>
    </div>
    <div class="fc-grave-grass"><span>🌷</span><span>🕯️</span><span>🌼</span></div>
  </div>`;
}

const HEART = 'M300 372 C 140 268 40 176 92 96 C 140 24 250 34 300 112 C 350 34 460 24 508 96 C 560 176 460 268 300 372 Z';
const BAND = 'M70 150 Q300 118 530 150 L530 240 Q300 208 70 240 Z';
const TAIL_L = 'M14 172 L86 172 L86 256 L14 256 L44 214 Z';
const TAIL_R = 'M586 172 L514 172 L514 256 L586 256 L556 214 Z';

function Tattoo({ it, step }) {
  const x = it.x ?? {};
  const on = step >= 1;
  return html`<div class="fc-tattoo fc-mold">
    <div class="fc-skin">
      <div class=${cls('fc-tat', on ? 'on' : 'stencil')}>
        <svg viewBox="0 0 600 400">
          <path d=${HEART} class="fc-tat-heart" />
          <path d=${TAIL_L} class="fc-tat-tail" />
          <path d=${TAIL_R} class="fc-tat-tail" />
          <path d=${BAND} class="fc-tat-band" />
          <path d="M40 70 l10 -24 l10 24 l-10 24 Z M560 70 l10 -24 l10 24 l-10 24 Z M80 330 l8 -18 l8 18 l-8 18 Z M512 330 l8 -18 l8 18 l-8 18 Z" class="fc-tat-spark" />
        </svg>
        ${on ? html`<div class="fc-tat-text" key="ans" style=${fs(it.ans, 4.6, 2, 45)}>${it.ans}</div>` : null}
      </div>
    </div>
    <div class="fc-tat-tag">
      <span class="fc-tat-studio">🖋️ ${x.studio ?? 'Tattoo do Primo'}</span>
      <span class="fc-tat-where">Feita ${it.ctx}</span>
    </div>
  </div>`;
}

function Dating({ it, step }) {
  const x = it.x ?? {};
  return html`<div class="fc-date fc-mold">
    <div class="fc-date-top"><span>👤</span><b>🔥 bobinder</b><span>💬</span></div>
    <div class="fc-date-card" style=${`--h:${x.hue ?? 320}`}>
      <div class="fc-date-photo"><span>${x.face ?? '🧔'}</span></div>
      <div class="fc-date-dots"><i class="on" /><i /><i /><i /></div>
      <div class="fc-date-name">
        <b style=${fs(it.ctx, 2.7, 1.9, 50)}>${it.ctx}</b>
        <small>📍 a ${x.km ?? 3} km de você · ✔ Perfil verificado</small>
      </div>
    </div>
    <div class="fc-date-bio">
      <div class="fc-date-label">Sobre mim</div>
      ${step >= 1 ? html`<div class="fc-date-text fc-in-up" key="ans" style=${fs(it.ans, 2.8, 2, 45)}>${it.ans}</div>` : html`<${Skel} />`}
    </div>
    <div class="fc-date-btns"><i class="no">✖</i><i class="star">★</i><i class="yes">❤</i></div>
  </div>`;
}

function Billboard({ it, step }) {
  const x = it.x ?? {};
  return html`<div class="fc-bb fc-mold">
    <div class="fc-bb-lights"><i /><i /><i /></div>
    <div class="fc-bb-board" style=${`--ad:${x.bg ?? '#ff3d7f'}`}>
      <div class="fc-bb-brand" style=${fs(it.ctx, 2.4, 1.6, 40)}>${it.ctx}</div>
      ${step >= 1
        ? html`<div class="fc-bb-slogan fc-in-slam" key="ans" style=${fs(it.ans, 5.4, 3, 45)}>${it.ans}</div>`
        : html`<div class="fc-bb-slogan soon" key="soon">EM BREVE</div>`}
      <div class="fc-bb-fine">*Imagens meramente ilustrativas. Consulte condições. Proibido para menores de bom senso.</div>
    </div>
    <div class="fc-bb-legs"><i /><i /></div>
  </div>`;
}

const COMPS = { zap: Zap, noticia: News, review: Review, placa: Sign, ultimas: Tomb, tattoo: Tattoo, namoro: Dating, outdoor: Billboard };

// ───────── revelação ─────────

function Orig({ s, it, step }) {
  const m = moldOf(it.mold);
  const open = step >= 2;
  const a = open ? P(s, it.author) : null;
  const t = open ? P(s, it.twister) : null;
  return html`<div class="fc-side">
    <div class="fc-moldtag" style=${`--mc:${m.color}`}><span>${m.emoji}</span>${m.name}</div>
    <div class=${cls('fc-orig', open && 'open')} key=${open ? 'open' : 'closed'}>
      <div class="fc-orig-head">✂️ CONTEXTO ORIGINAL</div>
      ${open
        ? html`<div class="fc-orig-q"><small>A pergunta era:</small>${it.q}</div>
            <div class="fc-orig-who">
              <${Avatar} p=${a} size=${46} />
              <span><small>${it.authorHouse ? 'não respondeu · resposta do Bobo' : 'quem respondeu'}</small><b>${a?.name ?? '???'}</b></span>
            </div>
            <div class="fc-orig-ans">“${it.ans}”</div>
            <div class="fc-orig-twist" style=${`--pc:${t?.color ?? '#ddd'}`}>
              <${Avatar} p=${t} size=${46} />
              <span><small>${it.twisterHouse ? 'dormiu · o Bobo distorceu' : 'distorcido por'}</small><b>${t?.name ?? '???'}</b></span>
              ${it.safety ? html`<em class="tag-safety">🆘 me salva</em>` : null}
            </div>`
        : html`<div class="fc-orig-lock"><span>?</span><small>Quem respondeu? Pra qual pergunta?<br />Já já…</small></div>`}
    </div>
  </div>`;
}

function Show({ s, v }) {
  const it = v.item;
  if (!it) return null;
  const Comp = COMPS[it.mold] ?? Zap;
  return html`<div class="fc-show">
    <div class="fc-stage" key=${it.key}><${Comp} s=${s} it=${it} step=${v.step} /></div>
    <${Orig} s=${s} it=${it} step=${v.step} />
  </div>`;
}

// ───────── votação e resultado ─────────

function Card({ s, it, res, i, n }) {
  const m = moldOf(it.mold);
  const t = res ? P(s, it.twister) : null;
  const a = res ? P(s, it.author) : null;
  return html`<div class=${cls('fc-card', res && 'res', res && it.winner && 'win', res && !it.winner && 'lose')} style=${`--mc:${m.color};--i:${i}`}>
    ${res && it.winner ? html`<div class="fc-crown">👑</div>` : null}
    <div class="fc-card-head"><span>${m.emoji}</span>${m.name}</div>
    <div class="fc-card-body">
      <div class="fc-card-ctx"><b class="fc-card-lbl">${m.ctx}</b> ${it.ctx}</div>
      <div class="fc-card-lbl fc-card-alb">${m.ans}:</div>
      <div class="fc-card-ans">“${it.ans}”</div>
      ${res
        ? html`<div class="fc-card-res">
            <div class="fc-card-votes">
              ${it.votes.length ? html`<${VoteBadges} s=${s} ids=${it.votes} size=${n >= 5 ? 30 : n >= 4 ? 34 : 42} />` : html`<span class="muted">nenhum voto</span>`}
              ${it.aud ? html`<span class="fc-card-aud">👥 ${it.aud}</span>` : null}
            </div>
            <div class="fc-card-who">
              <span class="fc-chip" style=${`--pc:${t?.color ?? '#ddd'}`}>✂️ ${it.twisterHouse ? 'Bobo' : t?.name} <b>+${fmt(it.pts)}</b></span>
              <span class="fc-chip small" style=${`--pc:${a?.color ?? '#ddd'}`}>💬 ${it.authorHouse ? 'Bobo' : a?.name} <b>+${fmt(it.apts)}</b></span>
            </div>
          </div>`
        : null}
    </div>
    ${res && it.total ? html`<div class="fc-total-stamp">FORA DE CONTEXTO TOTAL!</div>` : null}
  </div>`;
}

function Grid({ s, g, v }) {
  const res = g.phase === 'result';
  const items = v.items ?? [];
  return html`<div class=${cls('fc-vote', res && 'res')}>
    <h2 class="fc-vote-title pop-in" key=${g.phase}>${res ? 'E O MAIS FORA DE CONTEXTO É…' : 'QUAL É O MAIS FORA DE CONTEXTO?'}</h2>
    <div class="fc-vote-sub">Votação ${v.block} de ${v.blocks}</div>
    <div class=${cls('fc-grid', `n${Math.min(items.length, 6)}`)}>
      ${items.map((it, i) => html`<${Card} key=${it.key} s=${s} it=${it} res=${res} i=${i} n=${items.length} />`)}
    </div>
    ${res ? null : html`<div class="vote-banner">VOTEM NO CELULAR!</div><${PlayerStrip} s=${s} pending=${v.pending} size=${54} />`}
  </div>`;
}

// ───────── telas de transição ─────────

function TwistIntro({ s, v }) {
  const molds = v.molds ?? [];
  return html`<div class="center-col fc-twist">
    <h1 class="mega pop-in">TIRA DE CONTEXTO!</h1>
    <div class="sub">As respostas foram parar nas mãos erradas. Escrevam o contexto no celular!</div>
    <div class="fc-deck">
      ${molds.map((m, i) => html`<div class="fc-deck-card" key=${m.id} style=${`--i:${i};--mc:${moldOf(m.id).color};--r:${i % 2 ? -3 : 3}deg`}><span>${m.emoji}</span>${m.name}</div>`)}
    </div>
    <${PlayerStrip} s=${s} label="Distorcendo…" />
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'answer':
      return html`<div class="center-col">
        <h1 class="mega pop-in">RODADA ${v.round}</h1>
        <div class="sub">${v.round === 2 ? 'Pontos em DOBRO! Respondam de novo, com sinceridade…' : 'Respondam as perguntas no celular. Com sinceridade. Confia.'}</div>
        <div class="big-emoji wobble">😇</div>
        <${PlayerStrip} s=${s} label="Respondendo…" />
      </div>`;
    case 'twist':
      return html`<${TwistIntro} s=${s} v=${v} />`;
    case 'showtime':
      return html`<div class="center-col">
        <div class="fc-snip">✂️</div>
        <h1 class="mega fire pop-in">HORA DO ESTRAGO</h1>
        <div class="sub">Tudo que vocês disserem pode e vai ser usado contra vocês.</div>
      </div>`;
    case 'show':
      return html`<${Show} s=${s} v=${v} />`;
    case 'vote':
    case 'result':
      return html`<${Grid} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${`Placar · Rodada ${v.round}`} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  music: (phase) => ({ answer: 'chill', twist: 'boombap', showtime: 'tension', show: 'tension', vote: 'tension', result: 'tension', scores: 'results' })[phase] ?? 'lobby',
  roundLabel: (g) => {
    const v = g.view;
    if (!v?.round) return null;
    let label = `Rodada ${v.round} · pontos x${v.round}`;
    if (g.phase === 'show' && v.idx) label += ` · ${v.idx}/${v.total}`;
    return label;
  },
  theme: (g) => ({ energy: g.phase === 'result' ? 1 : g.phase === 'vote' || g.phase === 'showtime' ? 0.85 : 0.5 }),
};
