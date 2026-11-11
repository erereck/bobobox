// Estampa Braba na TV: camisetas em SVG, desfile no varal, chave do mata-mata e ringue.
import { html, useMemo } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar, pathD } from '../../shared/art.js';
import { PlayerStrip, Scoreboard, VoteBadges, P } from '../common.js';

const INK = '#1b1033';

// ───────── geometria da camiseta (viewBox -8 -8 420 440) ─────────
const SHIRT = 'M150 20 Q200 80 250 20 L312 38 Q362 58 396 126 L348 170 Q330 158 314 144 L318 398 Q318 410 306 410 L94 410 Q82 410 82 398 L86 144 Q70 158 52 170 L4 126 Q38 58 88 38 Z';
const SLEEVE_L = 'M88 38 Q38 58 4 126 L52 170 Q70 158 86 144 Q96 92 88 38 Z';
const SLEEVE_R = 'M312 38 Q362 58 396 126 L348 170 Q330 158 314 144 Q304 92 312 38 Z';
const NECK_IN = 'M150 20 Q200 80 250 20 Q200 36 150 20 Z';
const VIEWBOX = '-8 -8 420 440';

// área de estampa: arte [x, y, lado] e caixas de texto [x, y, w, h, linhas]
const GEO = {
  bottom: { art: [116, 66, 168], txt: [[92, 244, 216, 108, 3]] },
  top: { art: [118, 150, 164], txt: [[96, 60, 208, 84, 2]] },
  split: { art: [128, 120, 146], txt: [[100, 58, 200, 58, 2], [92, 272, 216, 76, 2]] },
  plain: { art: [110, 80, 180], txt: [] },
};

const FONTS = {
  display: { fam: 'var(--display)', css: 'Lilita', fw: 0.5 },
  marker: { fam: "'Marker', var(--display)", css: 'Marker', fw: 0.6 },
  bungee: { fam: "'Bungee', var(--display)", css: 'Bungee', fw: 0.74, up: true },
};

// medição de texto com canvas (com fallback por estimativa enquanto a fonte não carrega)
const mctx = (() => {
  try {
    return document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
})();
try {
  for (const f of Object.values(FONTS)) document.fonts?.load(`40px ${f.css}`);
} catch {}
const widthCache = new Map();
function emWidth(t, font) {
  const F = FONTS[font] ?? FONTS.display;
  const est = t.length * F.fw;
  try {
    if (!mctx || !document.fonts?.check(`40px ${F.css}`)) return est;
    const k = font + '|' + t;
    let w = widthCache.get(k);
    if (w == null) {
      mctx.font = `100px ${F.css}`;
      w = mctx.measureText(t).width / 100;
      widthCache.set(k, w);
    }
    return w;
  } catch {
    return est;
  }
}

/** Quebra em no máximo L linhas o mais equilibradas possível. */
function wrapTo(words, L) {
  const total = words.join(' ').length;
  const longest = Math.max(...words.map((w) => w.length));
  for (let W = Math.max(longest, Math.ceil(total / L)); W <= total + 1; W++) {
    const lines = [];
    let cur = '';
    for (const wd of words) {
      if (!cur) cur = wd;
      else if ((cur + ' ' + wd).length <= W) cur += ' ' + wd;
      else {
        lines.push(cur);
        cur = wd;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= L) return lines;
  }
  return [words.join(' ')];
}

function fitText(t, font, w, h, maxLines) {
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 10 };
  let best = null;
  for (let L = 1; L <= maxLines; L++) {
    const lines = wrapTo(words, L);
    const widest = Math.max(...lines.map((l) => emWidth(l, font)));
    const size = Math.min(52, w / Math.max(0.5, widest), h / (lines.length * 1.06));
    // só aceita mais linhas se a letra crescer de verdade
    if (!best || size > best.size * 1.1) best = { lines, size };
  }
  return best;
}

/** Frases com pausa natural no meio (". ", ", ", " (") viram texto em cima E embaixo. */
function findSplit(t) {
  let best = null;
  for (const m of t.matchAll(/([.!?…,;:])\s+|\s+[-–—]\s+|\s+(?=\()/g)) {
    const cut = m.index + (m[1] ? 1 : 0);
    const r = cut / t.length;
    if (r < 0.2 || r > 0.8) continue;
    if (!best || Math.abs(r - 0.5) < Math.abs(best.r - 0.5)) best = { r, a: t.slice(0, cut).trim(), b: t.slice(m.index + m[0].length).trim() };
  }
  return best && best.a && best.b ? [best.a, best.b] : null;
}

function strokeTiming(strokes, duration) {
  const lens = strokes.map((s) => Math.max(4, s.p.length));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return lens.map((l) => {
    const delay = (acc / total) * duration;
    acc += l;
    return { delay, dur: Math.max(0.05, (l / total) * duration) };
  });
}

function ShirtText({ text, font, box, fill }) {
  const [x, y, w, h, maxLines] = box;
  const F = FONTS[font] ?? FONTS.display;
  const t = F.up ? text.toUpperCase() : text;
  const { lines, size } = fitText(t, font, w, h, maxLines);
  const lh = size * 1.04;
  const first = y + (h - lh * lines.length) / 2 + size * 0.8;
  const cx = x + w / 2;
  const sw = Math.max(2.5, size * 0.15);
  return html`<g class="es-print-text" style=${`font-family:${F.fam}`} font-size=${size.toFixed(1)} text-anchor="middle" stroke-linejoin="round">
    ${lines.map((l, i) => html`<text x=${cx + size * 0.05} y=${first + i * lh + size * 0.09} fill=${INK} stroke=${INK} stroke-width=${sw}>${l}</text>`)}
    ${lines.map((l, i) => html`<text x=${cx} y=${first + i * lh} fill=${fill} stroke=${INK} stroke-width=${sw} paint-order="stroke">${l}</text>`)}
  </g>`;
}

let UID = 0;

/**
 * A camiseta. `shirt` = { color, txt, text, pos, font }; `d` = desenho vetorial.
 * `plain` = camiseta lisa (sem estampa); `mark` = um símbolo grande no peito.
 */
export function Shirt({ shirt, d, animate = false, duration = 2.4, delay = 0, plain = false, mark, class: className }) {
  const uid = useMemo(() => `es${++UID}`, []);
  const strokes = plain ? [] : d?.s ?? [];
  const timing = useMemo(() => (animate ? strokeTiming(strokes, duration) : null), [d, animate, plain]);
  if (!shirt) return null;
  const text = plain ? '' : shirt.text ?? '';
  const split = text ? findSplit(text) : null;
  const kind = plain || !text ? 'plain' : split ? 'split' : shirt.pos === 'top' ? 'top' : 'bottom';
  const geo = GEO[kind];
  const [ax, ay, aw] = geo.art;
  const parts = split ?? (text ? [text] : []);
  const fill = shirt.txt ?? '#fff';
  return html`<svg class=${cls('es-shirt', className)} viewBox=${VIEWBOX}>
    <defs>
      <clipPath id=${uid + 'c'}><path d=${SHIRT} /></clipPath>
      <linearGradient id=${uid + 'g'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".34" />
        <stop offset=".42" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity=".28" />
      </linearGradient>
      <linearGradient id=${uid + 'h'} x1="0" x2="1">
        <stop offset="0" stop-color="#000" stop-opacity=".24" />
        <stop offset=".2" stop-color="#000" stop-opacity="0" />
        <stop offset=".8" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity=".28" />
      </linearGradient>
    </defs>
    <path d=${SHIRT} transform="translate(9 11)" fill=${INK} />
    <path class="es-cloth" d=${SHIRT} fill=${shirt.color ?? '#fff'} />
    <g clip-path=${`url(#${uid}c)`}>
      <path d=${SLEEVE_L} fill="#000" opacity=".08" />
      <path d=${SLEEVE_R} fill="#000" opacity=".14" />
      <rect x="82" y="0" width="236" height="420" fill=${`url(#${uid}h)`} />
      ${strokes.length
        ? html`<svg x=${ax} y=${ay} width=${aw} height=${aw} viewBox="0 0 1000 1000" class="es-print">
            ${d?.bg ? html`<rect width="1000" height="1000" rx="60" fill=${d.bg} />` : null}
            ${strokes.map(
              (s, i) => html`<path
                d=${pathD(s.p)}
                stroke=${s.c}
                stroke-width=${s.w}
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                pathLength=${timing ? 1 : undefined}
                class=${timing ? 'draw-on' : ''}
                style=${timing ? `animation-delay:${(delay + timing[i].delay).toFixed(3)}s;animation-duration:${timing[i].dur.toFixed(3)}s` : ''}
              />`,
            )}
          </svg>`
        : null}
      ${parts.map((t, i) => (geo.txt[i] ? html`<${ShirtText} text=${t} font=${shirt.font} box=${geo.txt[i]} fill=${fill} />` : null))}
      ${mark ? html`<text x="200" y="285" text-anchor="middle" font-size="190" class="es-mark" fill="#fff" stroke=${INK} stroke-width="14" paint-order="stroke">${mark}</text>` : null}
      <rect x="-10" y="-10" width="420" height="440" fill=${`url(#${uid}g)`} />
      <g fill="none" stroke="#000" stroke-linecap="round" opacity=".13" stroke-width="5">
        <path d="M96 168 Q128 186 120 228" />
        <path d="M304 168 Q272 186 280 228" />
        <path d="M118 404 Q136 374 156 402" />
        <path d="M246 404 Q264 378 284 404" />
      </g>
      <g fill="none" stroke="#fff" stroke-linecap="round" opacity=".28" stroke-width="6">
        <path d="M104 62 Q126 52 146 60" />
        <path d="M30 110 Q48 84 74 70" />
      </g>
      <g fill="none" stroke="#000" opacity=".3" stroke-width="2.4" stroke-dasharray="7 6">
        <path d="M84 394 H316" />
        <path d="M13 117 L59 160" />
        <path d="M387 117 L341 160" />
        <path d="M88 38 Q96 92 86 144" />
        <path d="M312 38 Q304 92 314 144" />
      </g>
      <rect x="98" y="382" width="30" height="16" rx="3" fill="#fff" stroke=${INK} stroke-width="2.5" opacity=".9" />
    </g>
    <path d=${NECK_IN} fill="#000" opacity=".38" />
    <path d="M150 20 Q200 80 250 20" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="11" />
    <path d="M154 26 Q200 72 246 26" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-dasharray="3 4" />
    <path d=${SHIRT} fill="none" stroke=${INK} stroke-width="7" stroke-linejoin="round" />
  </svg>`;
}

function GhostShirt({ label = '?' }) {
  return html`<svg class="es-shirt es-ghost" viewBox=${VIEWBOX}>
    <path d=${SHIRT} fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.5)" stroke-width="9" stroke-dasharray="24 16" stroke-linejoin="round" />
    <text x="200" y="285" text-anchor="middle" font-size="190" fill="rgba(255,255,255,.55)" class="es-mark">${label}</text>
  </svg>`;
}

const who = (s, id) => (id ? P(s, id)?.name ?? '???' : 'Bobo');

// ───────── telas de espera (desenho, frases, montagem) ─────────

const BLANK = { color: '#f7f4ec' };
const CYCLE = ['#ff6fb1', '#ffd23f', '#45c2ff', '#a6e35a', '#9b6bff', '#ff9a3d', '#7fe8cf'];

function DrawWait({ s, v }) {
  return html`<div class="center-col es-wait">
    <h1 class="mega pop-in">DESENHEM!</h1>
    <div class="sub">Estampa ${v.n} de ${v.total} · a ideia no celular é só uma sugestão</div>
    <div class="es-blank-wrap">
      <div class="es-blank"><${Shirt} shirt=${BLANK} plain=${true} mark="?" /></div>
      <span class="es-pencil">✏️</span>
    </div>
    <${PlayerStrip} s=${s} label="Desenhando…" />
  </div>`;
}

function WriteWait({ s, v }) {
  return html`<div class="center-col es-wait">
    <h1 class="mega pop-in">FRASES!</h1>
    <div class="sub">${v.total} frases de camiseta cada. Quanto mais tiozão, melhor.</div>
    <div class="es-trio">
      ${['#ffd23f', '#45c2ff', '#ff6fb1'].map((c, i) => html`<div class="es-trio-item" style=${`--i:${i}`}><${Shirt} shirt=${{ color: c }} plain=${true} mark="…" /></div>`)}
    </div>
    <${PlayerStrip} s=${s} label="Escrevendo…" />
  </div>`;
}

function BuildWait({ s, v }) {
  const made = v.made ?? [];
  return html`<div class="center-col es-wait">
    <h1 class="mega pop-in">MONTEM AS CAMISETAS!</h1>
    <div class="sub">Estampa + frase + cor. As peças são dos outros — sem dó.</div>
    <div class="es-build-row">
      <div class="es-cycle"><${Shirt} shirt=${{ color: CYCLE[0] }} plain=${true} mark="?" /></div>
      <div class="es-made">
        ${made.length
          ? made.map((c, i) => html`<div class="es-made-item" key=${i}><${Shirt} shirt=${{ color: c }} plain=${true} mark="★" /></div>`)
          : html`<span class="es-made-empty">a fábrica tá ligando as máquinas…</span>`}
      </div>
    </div>
    <${PlayerStrip} s=${s} label="Costurando…" />
  </div>`;
}

// ───────── desfile no varal ─────────

function Lineup({ v }) {
  const list = v.shirts ?? [];
  const half = Math.ceil(list.length / 2);
  const rows = list.length > 7 ? [list.slice(0, half), list.slice(half)] : [list];
  let k = 0;
  return html`<div class="es-lineup">
    <h1 class="es-title pop-in">O DESFILE</h1>
    <div class="es-lines">
      ${rows.map(
        (row) => html`<div class="es-line" style=${`--n:${row.length}`}>
          <svg class="es-rope" viewBox="0 0 1000 80" preserveAspectRatio="none"><path d="M-10 6 Q500 74 1010 6" /></svg>
          ${row.map((sh, i) => {
            const t = (i + 0.5) / row.length;
            const sag = 4 * t * (1 - t);
            const n = k++;
            // a corda é uma curva quadrática: y = 0.3rem + 1.7rem · 4t(1-t) (casa com o SVG da corda)
            return html`<div class="es-hang" key=${sh.key} style=${`--i:${n};--dy:${(0.3 + sag * 1.7).toFixed(2)}rem`}>
              <i class="es-pin" />
              <div class="es-hang-shirt"><${Shirt} shirt=${sh} d=${v.art?.[sh.dk]} animate=${true} duration=${1.6} delay=${0.5 + n * 0.12} /></div>
            </div>`;
          })}
        </div>`,
      )}
    </div>
  </div>`;
}

// ───────── chave do mata-mata ─────────

const BW = 960;
const BH = 320;

function Bracket({ s, v }) {
  const rounds = v.rounds ?? [];
  const R = rounds.length;
  if (!R) return null;
  const cols = 2 * R + 1;
  const colW = BW / cols;
  const colX = (k) => (k + 0.5) * colW;
  const slotsFor = (r, side) => {
    const ms = rounds[r];
    if (r === R - 1) return [{ key: side ? ms[0].b : ms[0].a, m: ms[0] }];
    const half = ms.length / 2;
    return ms.slice(side ? half : 0, side ? ms.length : half).flatMap((m) => [
      { key: m.a, m },
      { key: m.b, m },
    ]);
  };
  const lines = [];
  const nodes = [];
  let order = 0;
  for (let side = 0; side < 2; side++) {
    for (let r = 0; r < R; r++) {
      const slots = slotsFor(r, side);
      const n = slots.length;
      const k = side ? cols - 1 - r : r;
      const x = colX(k);
      const size = Math.min(colW * 0.8, (BH / n) * 0.9, 128);
      const nk = side ? k - 1 : k + 1;
      slots.forEach((sl, i) => {
        const y = ((i + 0.5) / n) * BH;
        const ny = r === R - 1 ? BH / 2 : ((Math.floor(i / 2) + 0.5) / (n / 2)) * BH;
        const nx = colX(nk);
        const xm = (x + nx) / 2;
        const bye = !sl.key && sl.m.bye;
        const won = sl.key && sl.m.w === sl.key;
        const lost = sl.key && sl.m.w && sl.m.w !== sl.key;
        const now = r === v.r && !sl.m.w;
        if (!bye) lines.push(html`<path class=${cls('es-br-line', won && 'won')} d=${`M${x} ${y} H${xm} V${ny} H${nx}`} />`);
        const sh = sl.key ? v.shirts?.[sl.key] : null;
        const bp = sh?.builder ? P(s, sh.builder) : null;
        nodes.push(html`<div
          class=${cls('es-slot', bye && 'bye', lost && 'lost', won && 'won', now && 'now', !sh && !bye && 'tbd')}
          key=${`${side}-${r}-${i}`}
          style=${`left:${x / 10}rem;top:${y / 10}rem;width:${size / 10}rem;--i:${order++}`}
        >
          ${sh ? html`<${Shirt} shirt=${sh} d=${v.art?.[sh.dk]} />` : bye ? html`<span class="es-bye">folga</span>` : html`<${GhostShirt} />`}
          ${bp ? html`<div class="es-slot-av"><${Avatar} p=${bp} size=${40} /></div>` : null}
          ${lost ? html`<i class="es-x">✕</i>` : null}
        </div>`);
      });
    }
  }
  const champ = v.champ ? v.shirts?.[v.champ] : null;
  const labels = [];
  for (let k = 0; k < cols; k++) {
    const r = k < R ? k : cols - 1 - k;
    labels.push(html`<div class=${cls('es-br-label', k === R && 'center', r === v.r && k !== R && 'now')} style=${`left:${colX(k) / 10}rem`}>${k === R ? '🏆' : v.names?.[r]}</div>`);
  }
  return html`<div class="es-bracket-wrap">
    <div class="es-br-head">
      <h1 class=${cls('es-title', 'pop-in', R - 1 === v.r && 'fire')} key=${v.name}>${R - 1 === v.r ? 'GRANDE FINAL' : v.name}</h1>
    </div>
    <div class="es-br-labels">${labels}</div>
    <div class="es-bracket">
      <svg class="es-br-lines" viewBox=${`0 0 ${BW} ${BH}`} preserveAspectRatio="none">${lines}</svg>
      ${nodes}
      <div class="es-slot es-champ-slot" style=${`left:${colX(R) / 10}rem;top:${BH / 20}rem;width:${Math.min(colW * 0.95, 150) / 10}rem`}>
        ${champ ? html`<div class="es-crown-mini">👑</div><${Shirt} shirt=${champ} d=${v.art?.[champ.dk]} />` : html`<div class="es-trophy">🏆</div>`}
      </div>
    </div>
    ${v.r === 0 && v.byes ? html`<div class="es-br-foot">${v.byes === 1 ? '1 camiseta passou direto (folga)' : `${v.byes} camisetas passaram direto (folga)`}</div>` : null}
  </div>`;
}

// ───────── ringue ─────────

function Info({ s, side, sh, res }) {
  const r = res[side];
  const won = res.w === side;
  const total = res.a.votes.length + res.b.votes.length;
  const pct = total ? Math.round((r.votes.length / total) * 100) : 0;
  const bp = sh.builder ? P(s, sh.builder) : null;
  return html`<div class=${cls('es-info', won && 'won')}>
    <div class="es-votes"><b>${r.votes.length}</b> voto${r.votes.length === 1 ? '' : 's'}${total ? html`<small>${pct}%</small>` : null}</div>
    <${VoteBadges} s=${s} ids=${r.votes} size=${44} />
    ${r.aud ? html`<div class="es-aud">👥 plateia: ${r.aud}</div>` : null}
    <div class="es-builder" style=${`--pc:${bp?.color ?? '#ffd23f'}`}>
      ${bp ? html`<${Avatar} p=${bp} size=${48} />` : html`<span class="es-bobo">📦</span>`}
      <span>${bp?.name ?? 'Bobo'}</span>
    </div>
    <div class="es-pts">+${fmt(r.pts)}</div>
    <div class="es-credits">🎨 ${who(s, sh.drawBy)} · ✍️ ${who(s, sh.lineBy)}${r.credit ? html` <em>+${fmt(r.credit)}</em>` : null}</div>
    ${won && res.ko ? html`<div class="es-tag ko">NOCAUTE!</div>` : won && res.coin ? html`<div class="es-tag">🪙 no cara ou coroa</div>` : null}
  </div>`;
}

function Corner({ s, side, sh, res, show }) {
  if (!show) return html`<div class=${cls('es-corner', side, 'hidden')} />`;
  const won = res && res.w === side;
  const lost = res && res.w !== side;
  return html`<div class=${cls('es-corner', side, 'in', won && 'won', lost && 'lost', lost && res.ko && 'ko')}>
    <div class="es-fighter">
      <div class="es-corner-tag">${side === 'a' ? '◀ CORNER ESQUERDO' : 'CORNER DIREITO ▶'}</div>
      <div class="es-pose"><div class="es-bob"><${Shirt} shirt=${sh} d=${sh.d} /></div></div>
      ${won ? html`<div class="es-stamp win">VENCEU!</div>` : null}
      ${lost && res.ko ? html`<div class="es-stamp ko">K.O.</div>` : null}
    </div>
    ${res ? html`<${Info} s=${s} side=${side} sh=${sh} res=${res} />` : html`<div class="es-info-space" />`}
  </div>`;
}

function Ring({ s, v }) {
  const res = v.res;
  const intro = v.step === 0;
  return html`<div class=${cls('es-ring', v.final && 'final', res && 'has-res')}>
    <div class="es-ropes"><i /><i /><i /></div>
    ${intro
      ? html`<div class="es-bell">
          <h1 class=${cls('mega', 'pop-in', v.final && 'fire')}>${v.final ? 'GRANDE FINAL' : v.name}</h1>
          <div class="sub">${v.final ? 'Valendo o título, a glória e a dignidade' : `Duelo ${v.idx} de ${v.total}`}</div>
          <div class="es-gloves"><span>🥊</span><span>🥊</span></div>
        </div>`
      : null}
    <div class="es-arena">
      <${Corner} s=${s} side="a" sh=${v.a} res=${res} show=${v.step >= 1} />
      <div class=${cls('es-vs', v.step >= 2 && 'on')}><span>VS</span></div>
      <${Corner} s=${s} side="b" sh=${v.b} res=${res} show=${v.step >= 2} />
    </div>
    ${v.voting ? html`<div class="vote-banner">VOTEM NO CELULAR!</div><${PlayerStrip} s=${s} pending=${v.pending} size=${54} />` : null}
  </div>`;
}

// ───────── campeã ─────────

function Champion({ s, v }) {
  const c = v.shirt;
  if (!c) return null;
  if (!v.step) {
    return html`<div class="center-col">
      <h1 class="mega pop-in">E A CAMPEÃ É…</h1>
      <div class="big-emoji es-drum">🥁</div>
    </div>`;
  }
  const bp = c.builder ? P(s, c.builder) : null;
  return html`<div class="es-champ">
    <div class="es-rays" />
    <div class="es-champ-shirt">
      <div class="es-crown">👑</div>
      <${Shirt} shirt=${c} d=${c.d} animate=${true} duration=${1.8} />
      <div class="es-ribbon"><span>CAMPEÃ!</span></div>
    </div>
    <div class="es-champ-info">
      <div class="es-builder big" style=${`--pc:${bp?.color ?? '#ffd23f'}`}>
        ${bp ? html`<${Avatar} p=${bp} size=${72} />` : html`<span class="es-bobo">📦</span>`}
        <span>montada por <b>${bp?.name ?? 'Bobo'}</b></span>
      </div>
      <div class="es-credits big">🎨 desenho de <b>${who(s, c.drawBy)}</b> · ✍️ frase de <b>${who(s, c.lineBy)}</b></div>
      <div class="es-champ-stats">${c.wins} vitória${c.wins === 1 ? '' : 's'} · ${c.votes} voto${c.votes === 1 ? '' : 's'}${c.ko ? ` · ${c.ko} nocaute${c.ko === 1 ? '' : 's'}` : ''}</div>
    </div>
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'draw':
      return html`<${DrawWait} s=${s} v=${v} />`;
    case 'write':
      return html`<${WriteWait} s=${s} v=${v} />`;
    case 'build':
      return html`<${BuildWait} s=${s} v=${v} />`;
    case 'lineup':
      return html`<${Lineup} v=${v} />`;
    case 'bracket':
      return html`<${Bracket} s=${s} v=${v} key=${'br' + v.r} />`;
    case 'duel':
    case 'vote':
    case 'result':
      return v.a ? html`<${Ring} s=${s} v=${v} key=${`ring-${v.r}-${v.idx}`} />` : null;
    case 'champion':
      return html`<${Champion} s=${s} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title="Placar final" />`;
    case 'empty':
      return html`<div class="center-col"><h1 class="mega pop-in">COLEÇÃO CANCELADA</h1><div class="big-emoji">🚫👕</div><div class="sub">Ninguém montou nada. A fábrica faliu.</div></div>`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  music: (phase) =>
    ({ draw: 'chill', write: 'boombap', build: 'funk', lineup: 'funk', bracket: 'arena', duel: 'arena', vote: 'arena', result: 'arena', champion: 'results', scores: 'results', empty: 'lobby' })[phase] ?? 'lobby',
  roundLabel: (g) => {
    const v = g.view ?? {};
    switch (g.phase) {
      case 'draw':
        return v.n ? `Estampa ${v.n} de ${v.total}` : null;
      case 'write':
        return 'Frases';
      case 'build':
        return 'Montagem';
      case 'lineup':
        return 'Desfile';
      case 'bracket':
        return 'A chave';
      case 'duel':
      case 'vote':
      case 'result':
        return v.final ? 'GRANDE FINAL' : v.name ? `${v.name} · ${v.idx}/${v.total}` : null;
      case 'champion':
        return 'A CAMPEÃ';
      default:
        return null;
    }
  },
  theme: (g) => ({ energy: ['duel', 'vote', 'result', 'champion', 'bracket'].includes(g.phase) ? 0.95 : 0.5 }),
  mood: (g) => (g.phase === 'champion' ? 'party' : g.view?.final ? 'hype' : 'normal'),
};
