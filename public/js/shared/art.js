// Arte vetorial: avatares-caixinha dos jogadores, desenhos e o mascote Bobo.
import { html, useMemo } from '/vendor/preact.js';
import { avatars, useStore, cls } from './core.js';

// ───────── desenhos vetoriais ─────────

export function pathD(p) {
  if (!p || p.length < 2) return '';
  if (p.length < 6) return `M${p[0]} ${p[1]}L${p[p.length - 2] + 0.1} ${p[p.length - 1]}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${p[i]} ${p[i + 1]} ${mx} ${my}`;
  }
  d += `L${p[p.length - 2]} ${p[p.length - 1]}`;
  return d;
}

/** Renderiza um desenho. `animate` faz ele “se desenhar” na tela. */
export function Drawing({ d, animate = false, duration = 3, class: className, bg }) {
  const strokes = d?.s ?? [];
  const timing = useMemo(() => {
    if (!animate) return null;
    const lens = strokes.map((s) => Math.max(4, s.p.length));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return lens.map((l) => {
      const start = (acc / total) * duration;
      acc += l;
      return { delay: start, dur: Math.max(0.05, (l / total) * duration) };
    });
  }, [d, animate, duration]);
  return html`<svg class=${cls('drawing', className)} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
    <rect width="1000" height="1000" fill=${bg ?? d?.bg ?? '#fffdf7'} />
    ${strokes.map(
      (s, i) => html`<path
        d=${pathD(s.p)}
        stroke=${s.c}
        stroke-width=${s.w}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        pathLength=${animate ? 1 : undefined}
        class=${animate ? 'draw-on' : ''}
        style=${animate ? `animation-delay:${timing[i].delay.toFixed(3)}s;animation-duration:${timing[i].dur.toFixed(3)}s` : ''}
      />`,
    )}
  </svg>`;
}

// ───────── avatares-caixinha ─────────

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = '#1b1033';

const EYES = [
  // bolinhas
  () => html`<circle cx="36" cy="58" r="5" fill=${INK} /><circle cx="64" cy="58" r="5" fill=${INK} />`,
  // olhos grandes com brilho
  () => html`<g class="eyes"><ellipse cx="36" cy="57" rx="8" ry="9" fill="#fff" stroke=${INK} stroke-width="2.5" /><ellipse cx="64" cy="57" rx="8" ry="9" fill="#fff" stroke=${INK} stroke-width="2.5" /><circle cx="38" cy="59" r="4" fill=${INK} /><circle cx="66" cy="59" r="4" fill=${INK} /><circle cx="39.5" cy="57" r="1.4" fill="#fff" /><circle cx="67.5" cy="57" r="1.4" fill="#fff" /></g>`,
  // sonolento
  () => html`<path d="M29 58 Q36 63 43 58 M57 58 Q64 63 71 58" stroke=${INK} stroke-width="3.5" fill="none" stroke-linecap="round" />`,
  // bravinho
  () => html`<circle cx="36" cy="60" r="4.5" fill=${INK} /><circle cx="64" cy="60" r="4.5" fill=${INK} /><path d="M28 50 L43 54 M72 50 L57 54" stroke=${INK} stroke-width="3.5" stroke-linecap="round" />`,
  // óculos
  () => html`<circle cx="35" cy="58" r="9" fill="#ffffffaa" stroke=${INK} stroke-width="3" /><circle cx="65" cy="58" r="9" fill="#ffffffaa" stroke=${INK} stroke-width="3" /><path d="M44 58 H56" stroke=${INK} stroke-width="3" /><circle cx="36" cy="59" r="3" fill=${INK} /><circle cx="66" cy="59" r="3" fill=${INK} />`,
  // um olho maior
  () => html`<g class="eyes"><circle cx="35" cy="57" r="10" fill="#fff" stroke=${INK} stroke-width="2.5" /><circle cx="66" cy="59" r="6" fill="#fff" stroke=${INK} stroke-width="2.5" /><circle cx="37" cy="59" r="4.5" fill=${INK} /><circle cx="67" cy="60" r="3" fill=${INK} /></g>`,
  // estrelinhas
  () => html`<path d="M36 51 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z M64 51 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill=${INK} />`,
  // óculos escuros
  () => html`<path d="M24 53 H47 V60 Q47 66 40 66 H31 Q24 66 24 60Z M53 53 H76 V60 Q76 66 69 66 H60 Q53 66 53 60Z" fill=${INK} /><path d="M47 56 H53" stroke=${INK} stroke-width="3" /><path d="M28 56 l5 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7" />`,
];

const MOUTHS = [
  () => html`<path d="M38 74 Q50 84 62 74" stroke=${INK} stroke-width="3.5" fill="none" stroke-linecap="round" />`,
  () => html`<path d="M38 72 Q50 72 62 72 Q60 86 50 86 Q40 86 38 72Z" fill=${INK} /><path d="M44 81 Q50 77 56 81 Q53 85 50 85 Q47 85 44 81Z" fill="#ff6b8b" />`,
  () => html`<path d="M40 77 H60" stroke=${INK} stroke-width="3.5" stroke-linecap="round" />`,
  () => html`<ellipse cx="50" cy="77" rx="5" ry="6" fill=${INK} />`,
  () => html`<path d="M36 73 Q50 80 64 73 L62 79 Q50 86 38 79Z" fill="#fff" stroke=${INK} stroke-width="2.5" stroke-linejoin="round" /><path d="M43 76 V81 M50 77 V83 M57 76 V81" stroke=${INK} stroke-width="1.5" />`,
  () => html`<path d="M38 76 Q44 72 50 76 Q56 80 62 76" stroke=${INK} stroke-width="3.5" fill="none" stroke-linecap="round" />`,
  () => html`<path d="M40 74 Q50 82 60 74" stroke=${INK} stroke-width="3.5" fill="none" stroke-linecap="round" /><path d="M52 78 Q55 86 59 79" fill="#ff6b8b" stroke=${INK} stroke-width="2" />`,
];

const HATS = [
  () => null,
  () => null,
  // boné
  (c) => html`<path d="M24 22 Q50 0 76 22 Z" fill=${c} stroke=${INK} stroke-width="3" /><path d="M70 21 Q88 20 94 25 L72 25Z" fill=${c} stroke=${INK} stroke-width="3" stroke-linejoin="round" />`,
  // laço
  () => html`<path d="M50 18 L36 9 L36 27Z M50 18 L64 9 L64 27Z" fill="#ff3d7f" stroke=${INK} stroke-width="3" stroke-linejoin="round" /><circle cx="50" cy="18" r="4.5" fill="#ff3d7f" stroke=${INK} stroke-width="3" />`,
  // antena
  () => html`<path d="M50 24 V6" stroke=${INK} stroke-width="3" /><circle cx="50" cy="6" r="5" fill="#ffd23f" stroke=${INK} stroke-width="3" class="antenna" />`,
  // topete
  () => html`<path d="M40 25 Q38 6 52 8 Q46 14 56 12 Q50 18 60 24" fill=${INK} />`,
  // coroa
  () => html`<path d="M32 24 L34 8 L42 17 L50 4 L58 17 L66 8 L68 24Z" fill="#ffd23f" stroke=${INK} stroke-width="3" stroke-linejoin="round" />`,
  // chapéu de festa
  () => html`<path d="M38 25 L50 0 L62 25Z" fill="#2ec4ff" stroke=${INK} stroke-width="3" stroke-linejoin="round" /><path d="M42 17 L58 17 M45 10 L55 10" stroke="#fff" stroke-width="2.5" /><circle cx="50" cy="1" r="4" fill="#ffd23f" stroke=${INK} stroke-width="2.5" />`,
  // fone
  (c) => html`<path d="M14 40 Q14 6 50 6 Q86 6 86 40" fill="none" stroke=${INK} stroke-width="5" /><rect x="6" y="36" width="12" height="20" rx="5" fill=${c} stroke=${INK} stroke-width="3" /><rect x="82" y="36" width="12" height="20" rx="5" fill=${c} stroke=${INK} stroke-width="3" />`,
];

export function faceParts(seed) {
  const r = mulberry(seed || 1);
  return {
    eyes: Math.floor(r() * EYES.length),
    mouth: Math.floor(r() * MOUTHS.length),
    hat: Math.floor(r() * HATS.length),
    blush: r() > 0.5,
    tilt: (r() - 0.5) * 8,
  };
}

/**
 * Avatar de um jogador: uma caixinha de papelão na cor dele, com cara gerada
 * ou com o autorretrato que ele desenhou no celular.
 */
export function Avatar({ p, size = 64, class: className, mood, style }) {
  const avs = useStore(avatars);
  if (!p) return null;
  const drawn = avs[p.id]?.d;
  const f = faceParts(p.face);
  const c = p.color ?? '#999';
  const uid = `cl${p.id}`;
  return html`<svg
    class=${cls('avatar', className, mood && `mood-${mood}`, p.on === false && 'offline')}
    viewBox="0 0 100 100"
    width=${size}
    height=${size}
    style=${`--av:${size};${style ?? ''}`}
  >
    <g class="av-body" style=${`transform-origin:50px 90px;transform:rotate(${f.tilt}deg)`}>
      <path d="M12 32 L3 17 L46 14 L50 30Z" fill=${c} stroke=${INK} stroke-width="3" stroke-linejoin="round" />
      <path d="M12 32 L3 17 L46 14 L50 30Z" fill="#000" opacity=".22" />
      <path d="M88 32 L97 17 L54 14 L50 30Z" fill=${c} stroke=${INK} stroke-width="3" stroke-linejoin="round" />
      <path d="M88 32 L97 17 L54 14 L50 30Z" fill="#000" opacity=".12" />
      <rect x="10" y="28" width="80" height="66" rx="11" fill=${c} stroke=${INK} stroke-width="3.5" />
      <path d="M13 38 H87" stroke="#000" stroke-opacity=".15" stroke-width="3" />
      ${drawn
        ? html`<clipPath id=${uid}><rect x="17" y="41" width="66" height="47" rx="7" /></clipPath>
            <g clip-path=${`url(#${uid})`}>
              <rect x="17" y="41" width="66" height="47" fill="#fffdf7" />
              <svg x="17" y="36" width="66" height="57" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
                ${drawn.s.map((s) => html`<path d=${pathD(s.p)} stroke=${s.c} stroke-width=${s.w} fill="none" stroke-linecap="round" stroke-linejoin="round" />`)}
              </svg>
            </g>
            <rect x="17" y="41" width="66" height="47" rx="7" fill="none" stroke=${INK} stroke-width="2.5" />`
        : html`${f.blush ? html`<ellipse cx="26" cy="70" rx="6" ry="3.5" fill="#ff6b8b" opacity=".55" /><ellipse cx="74" cy="70" rx="6" ry="3.5" fill="#ff6b8b" opacity=".55" />` : null}
            ${EYES[f.eyes]()} ${MOUTHS[f.mouth]()}`}
      ${HATS[f.hat](c)}
    </g>
  </svg>`;
}

// ───────── Bobo, o mascote-apresentador ─────────

/** O apresentador: uma caixa de papelão falante e sarcástica. */
export function Bobo({ talking = false, mood = 'normal', size = 200, class: className }) {
  const spooky = mood === 'spooky';
  return html`<svg class=${cls('bobo', talking && 'talking', `bobo-${mood}`, className)} viewBox="0 0 200 200" width=${size} height=${size}>
    <defs>
      <linearGradient id="bobo-side" x1="0" x2="1">
        <stop offset="0" stop-color=${spooky ? '#4a2c6e' : '#c98a4b'} />
        <stop offset="1" stop-color=${spooky ? '#3a1f58' : '#b57636'} />
      </linearGradient>
      <radialGradient id="bobo-glow"><stop offset="0" stop-color="#b6ff3d" /><stop offset="1" stop-color="#b6ff3d" stop-opacity="0" /></radialGradient>
    </defs>
    <ellipse cx="100" cy="190" rx="70" ry="8" fill="#000" opacity=".25" class="bobo-shadow" />
    <g class="bobo-body">
      <g class="lid lid-l"><path d="M28 62 L6 32 L92 26 L100 58Z" fill=${spooky ? '#5b3785' : '#e0a463'} stroke=${INK} stroke-width="5" stroke-linejoin="round" /></g>
      <g class="lid lid-r"><path d="M172 62 L194 32 L108 26 L100 58Z" fill=${spooky ? '#4e2f74' : '#d1914f'} stroke=${INK} stroke-width="5" stroke-linejoin="round" /></g>
      <rect x="24" y="56" width="152" height="128" rx="16" fill=${spooky ? '#6a42a0' : '#e8ad6b'} stroke=${INK} stroke-width="6" />
      <rect x="86" y="56" width="28" height="34" fill=${spooky ? '#8b6bc4' : '#f6d9a8'} opacity=".9" />
      <path d="M86 56 V90 M114 56 V90" stroke=${INK} stroke-width="2" opacity=".35" />
      <path d="M36 172 Q100 180 164 172" stroke="#000" stroke-width="4" opacity=".12" fill="none" />
      ${spooky ? html`<circle cx="72" cy="112" r="26" fill="url(#bobo-glow)" opacity=".8" /><circle cx="128" cy="112" r="26" fill="url(#bobo-glow)" opacity=".8" />` : null}
      <g class="bobo-brows">
        ${mood === 'spooky' || mood === 'evil'
          ? html`<path d="M52 88 L88 100 M148 88 L112 100" stroke=${INK} stroke-width="7" stroke-linecap="round" />`
          : html`<path d="M54 92 Q70 82 86 90 M114 90 Q130 82 146 92" stroke=${INK} stroke-width="6" fill="none" stroke-linecap="round" />`}
      </g>
      <g class="bobo-eyes">
        <ellipse cx="72" cy="114" rx="15" ry="17" fill=${spooky ? '#eaffc2' : '#fff'} stroke=${INK} stroke-width="5" />
        <ellipse cx="128" cy="114" rx="15" ry="17" fill=${spooky ? '#eaffc2' : '#fff'} stroke=${INK} stroke-width="5" />
        <circle class="pupil" cx="75" cy="117" r="7" fill=${INK} />
        <circle class="pupil" cx="131" cy="117" r="7" fill=${INK} />
        <circle cx="78" cy="113" r="2.5" fill="#fff" />
        <circle cx="134" cy="113" r="2.5" fill="#fff" />
      </g>
      <ellipse cx="50" cy="140" rx="10" ry="6" fill="#ff6b8b" opacity=".45" />
      <ellipse cx="150" cy="140" rx="10" ry="6" fill="#ff6b8b" opacity=".45" />
      <g class="mouth mouth-closed"><path d="M78 146 Q100 162 122 146" stroke=${INK} stroke-width="6" fill="none" stroke-linecap="round" /></g>
      <g class="mouth mouth-open">
        <path d="M76 142 Q100 140 124 142 Q120 172 100 172 Q80 172 76 142Z" fill=${INK} />
        <path d="M88 162 Q100 154 112 162 Q107 170 100 170 Q93 170 88 162Z" fill="#ff6b8b" />
      </g>
      ${mood === 'party' || mood === 'hype'
        ? html`<g class="bobo-hat"><path d="M84 30 L100 -8 L116 30Z" fill="#ff3d7f" stroke=${INK} stroke-width="5" stroke-linejoin="round" /><circle cx="100" cy="-8" r="7" fill="#ffd23f" stroke=${INK} stroke-width="4" /></g>`
        : null}
      ${spooky
        ? html`<g class="bobo-hat"><rect x="66" y="-6" width="68" height="36" rx="4" fill=${INK} /><rect x="52" y="26" width="96" height="10" rx="5" fill=${INK} /><rect x="66" y="18" width="68" height="7" fill="#8b1e3f" /></g>`
        : null}
    </g>
  </svg>`;
}

/** Logo BOBOBOX com letras saltitantes. */
export function Logo({ size = 1, class: className }) {
  const letters = 'BOBOBOX'.split('');
  const colors = ['#ff3d7f', '#ffd23f', '#2ec4ff', '#3ddc84', '#ff8a3d', '#a77bff', '#ff3d7f'];
  return html`<div class=${cls('logo', className)} style=${`--s:${size}`} aria-label="Bobobox">
    ${letters.map((l, i) => html`<span style=${`--c:${colors[i]};--i:${i}`}>${l}</span>`)}
  </div>`;
}
