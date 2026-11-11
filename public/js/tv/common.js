// Componentes compartilhados da TV: cronômetro, faixa de jogadores, placar,
// intro/regras, pódio, confete, reações, legendas do narrador.
import { html, useEffect, useRef, useState, useMemo } from '/vendor/preact.js';
import { useStore, useTick, useCountUp, timerLeft, cls, fmt, playerById, now } from '../shared/core.js';
import { Avatar, Bobo, Drawing } from '../shared/art.js';
import { audio } from '../shared/audio.js';
import { narration } from './narrator.js';

export const P = playerById;

// ───────── barramento de efeitos visuais ─────────
export const fxBus = (() => {
  const subs = new Set();
  return {
    emit: (fx) => subs.forEach((f) => f(fx)),
    on: (f) => (subs.add(f), () => subs.delete(f)),
  };
})();

// ───────── cronômetro ─────────
export function Timer({ timer, size = 'md' }) {
  useTick(200);
  const lastSec = useRef(null);
  const left = timerLeft(timer);
  const sec = Math.ceil(left / 1000);
  useEffect(() => {
    if (!timer || timer.paused) return;
    if (sec !== lastSec.current && sec <= 5 && sec > 0) audio.sfx('tick', { hi: sec <= 3 });
    if (sec === 0 && lastSec.current > 0) audio.sfx('timeup');
    lastSec.current = sec;
  }, [sec]);
  if (!timer) return null;
  const k = timer.total ? left / timer.total : 0;
  const R = 44;
  const C = 2 * Math.PI * R;
  return html`<div class=${cls('timer', `timer-${size}`, sec <= 5 && 'hurry', sec <= 10 && 'warn', timer.paused && 'paused')}>
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r=${R} class="timer-bg" />
      <circle cx="50" cy="50" r=${R} class="timer-fg" stroke-dasharray=${C} stroke-dashoffset=${C * (1 - k)} />
    </svg>
    <span>${timer.paused ? '❚❚' : sec}</span>
  </div>`;
}

// ───────── faixa de jogadores (quem já respondeu) ─────────
export function PlayerStrip({ s, ids, pending, label, size = 74 }) {
  const players = (ids ?? s.room.players.map((p) => p.id)).map((id) => P(s, id)).filter(Boolean);
  const pend = new Set(pending ?? s.game?.pending ?? []);
  return html`<div class="strip">
    ${label ? html`<div class="strip-label">${label}</div>` : null}
    <div class="strip-row">
      ${players.map(
        (p) => html`<div class=${cls('strip-p', pend.has(p.id) ? 'is-pending' : 'is-done')} key=${p.id}>
          <${Avatar} p=${p} size=${size} />
          <div class="strip-name" style=${`--pc:${p.color}`}>${p.name}</div>
          ${pend.has(p.id) ? html`<div class="strip-dots"><i /><i /><i /></div>` : html`<div class="strip-check">✓</div>`}
        </div>`,
      )}
    </div>
  </div>`;
}

// ───────── placar animado ─────────
export function Scoreboard({ s, scores, before, title = 'Placar', subtitle }) {
  const ids = Object.keys(scores ?? {});
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 900);
    const t2 = setTimeout(() => audio.sfx('coin'), 1000);
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, []);
  const val = (id) => (step ? scores[id] : before?.[id] ?? 0);
  const order = [...ids].sort((a, b) => val(b) - val(a));
  const max = Math.max(1, ...ids.map((id) => scores[id]));
  const rowH = Math.min(7.2, 40 / Math.max(1, ids.length));
  return html`<div class="scoreboard pop-in">
    <h2 class="sb-title">${title}</h2>
    ${subtitle ? html`<div class="sb-sub">${subtitle}</div>` : null}
    <div class="sb-rows" style=${`height:${rowH * ids.length}rem`}>
      ${ids.map((id) => {
        const p = P(s, id);
        const idx = order.indexOf(id);
        const delta = (scores[id] ?? 0) - (before?.[id] ?? 0);
        return html`<${ScoreRow} key=${id} p=${p} idx=${idx} rowH=${rowH} value=${val(id)} max=${max} delta=${step ? delta : 0} />`;
      })}
    </div>
  </div>`;
}

function ScoreRow({ p, idx, rowH, value, max, delta }) {
  const shown = useCountUp(value, 1300);
  if (!p) return null;
  return html`<div class=${cls('sb-row', idx === 0 && 'lead')} style=${`transform:translateY(${idx * rowH}rem);height:${rowH * 0.86}rem;--pc:${p.color}`}>
    <div class="sb-rank">${idx + 1}</div>
    <${Avatar} p=${p} size=${Math.round(rowH * 11)} />
    <div class="sb-name">${p.name}</div>
    <div class="sb-bar"><div class="sb-fill" style=${`width:${Math.max(2, (value / max) * 100)}%`} /></div>
    <div class="sb-score">${fmt(shown)}</div>
    ${delta > 0 ? html`<div class="sb-delta">+${fmt(delta)}</div>` : null}
  </div>`;
}

// ───────── intro e regras (genérico) ─────────
export function GameIntro({ meta, g }) {
  if (!meta) return null;
  if (g.phase === 'intro') {
    return html`<div class="intro" style=${`--gc:${meta.color};--gc2:${meta.color2}`}>
      <div class="intro-burst" />
      <div class="intro-emoji">${meta.emoji}</div>
      <h1 class=${cls('intro-title', meta.font && `font-${meta.font}`)}>${meta.name}</h1>
      <div class="intro-tag">${meta.tag}</div>
    </div>`;
  }
  const i = g.rule ?? 0;
  return html`<div class="rules" style=${`--gc:${meta.color};--gc2:${meta.color2}`}>
    <div class="rules-head"><span class="rules-emoji">${meta.emoji}</span> Como jogar <b>${meta.name}</b></div>
    <div class="rules-card pop-in" key=${i}>
      <div class="rules-num">${i + 1}</div>
      <div class="rules-text">${meta.rules?.[i]}</div>
    </div>
    <div class="rules-dots">${(meta.rules ?? []).map((_, k) => html`<i class=${k === i ? 'on' : k < i ? 'past' : ''} />`)}</div>
    <div class="rules-skip">Espaço pra pular</div>
  </div>`;
}

// ───────── narrador no canto + legenda ─────────
export function MascotCorner({ mood = 'normal', big = false }) {
  const n = useStore(narration);
  const [shown, setShown] = useState('');
  const [vis, setVis] = useState(false);
  useEffect(() => {
    if (n.text) {
      setShown(n.text);
      setVis(true);
    }
  }, [n.id]);
  useEffect(() => {
    if (n.talking) return;
    const t = setTimeout(() => setVis(false), 2600);
    return () => clearTimeout(t);
  }, [n.talking, n.id]);
  return html`<div class=${cls('mascot-corner', big && 'big')}>
    <${Bobo} talking=${n.talking} mood=${n.mood === 'hype' || n.mood === 'party' ? n.mood : mood} size=${big ? 260 : 150} />
    <div class=${cls('caption', vis && 'show')} key=${n.id}>${shown}</div>
  </div>`;
}

// ───────── confete ─────────
export function Confetti() {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let parts = [];
    let raf = 0;
    const colors = ['#ff3d7f', '#ffd23f', '#2ec4ff', '#3ddc84', '#ff8a3d', '#a77bff', '#ffffff'];
    const resize = () => {
      cv.width = innerWidth;
      cv.height = innerHeight;
    };
    resize();
    addEventListener('resize', resize);
    const burst = (big) => {
      const n = big ? 380 : 180;
      for (let i = 0; i < n; i++) {
        const fromLeft = i % 2 === 0;
        parts.push({
          x: fromLeft ? -20 : cv.width + 20,
          y: cv.height * (0.55 + Math.random() * 0.35),
          vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 16),
          vy: -(12 + Math.random() * 18),
          r: 6 + Math.random() * 9,
          a: Math.random() * 6,
          va: (Math.random() - 0.5) * 0.4,
          c: colors[(Math.random() * colors.length) | 0],
          shape: Math.random() < 0.3 ? 1 : 0,
          life: 0,
        });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const loop = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.vy += 0.42;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        p.life++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        if (p.shape) {
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.life * 0.15));
          ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        }
        ctx.restore();
      }
      parts = parts.filter((p) => p.y < cv.height + 40 && p.life < 600);
      raf = parts.length ? requestAnimationFrame(loop) : 0;
      if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
    };
    const off = fxBus.on((fx) => fx.type === 'confetti' && burst(fx.data?.big));
    return () => (off(), removeEventListener('resize', resize), cancelAnimationFrame(raf));
  }, []);
  return html`<canvas class="confetti" ref=${ref} />`;
}

// ───────── reações flutuantes dos celulares ─────────
export function Reactions({ s }) {
  const [items, setItems] = useState([]);
  const sRef = useRef(s);
  sRef.current = s;
  useEffect(() => {
    let n = 0;
    return fxBus.on((fx) => {
      if (fx.type !== 'react') return;
      const id = ++n;
      const x = 62 + Math.random() * 34;
      setItems((cur) => [...cur.slice(-24), { id, e: fx.data.e, pid: fx.data.id, color: fx.data.color, x, sway: (Math.random() - 0.5) * 8 }]);
      audio.sfx('pop', { pitch: 1.4 + Math.random() * 0.6 });
      setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 3200);
    });
  }, []);
  return html`<div class="reactions">
    ${items.map((it) => {
      const p = P(sRef.current, it.pid);
      return html`<div class="react" key=${it.id} style=${`left:${it.x}%;--sway:${it.sway}rem;--pc:${it.color}`}>
        <span class="react-e">${it.e}</span>
        ${p ? html`<${Avatar} p=${p} size=${34} />` : null}
      </div>`;
    })}
  </div>`;
}

// ───────── barra de entrada (sempre visível em jogo) ─────────
export function JoinBadge({ s, joinHost }) {
  const code = s.room.code;
  const hide = s.room.settings.hideCode;
  return html`<div class="join-badge">
    <span class="jb-url">${joinHost}</span>
    <span class="jb-code">${hide ? '••••' : code}</span>
    ${s.room.audienceCount ? html`<span class="jb-aud">👥 ${s.room.audienceCount}</span>` : null}
  </div>`;
}

// ───────── votos chegando: avatares voando ─────────
export function VoteBadges({ s, ids, size = 46 }) {
  return html`<div class="vote-badges">
    ${(ids ?? []).map((id, i) => {
      const p = P(s, id);
      return p ? html`<div class="vb" key=${id} style=${`animation-delay:${i * 0.12}s`}><${Avatar} p=${p} size=${size} /></div>` : null;
    })}
  </div>`;
}

/** Texto que entra letra por letra. */
export function Typewriter({ text, speed = 28, class: className }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text]);
  return html`<span class=${className}>${(text ?? '').slice(0, n)}<span class="tw-ghost">${(text ?? '').slice(n)}</span></span>`;
}

/** Destaca a lacuna "___" de um prompt. */
export function PromptText({ text }) {
  const parts = String(text ?? '').split(/_{3,}/);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [html`<span class="blank">_____</span>`, part]));
}

// ───────── tela de resultado de um jogo ─────────
export function Results({ s, catalog, send }) {
  const r = s.result;
  const meta = catalog.find((g) => g.id === r?.gameId);
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    audio.sfx('drumroll', { len: 1.4 });
    const ts = [setTimeout(() => setStep(1), 1500), setTimeout(() => setStep(2), 2600), setTimeout(() => setStep(3), 3700), setTimeout(() => setStep(4), 4300)];
    const t5 = setTimeout(() => audio.sfx('tada'), 3700);
    return () => (ts.forEach(clearTimeout), clearTimeout(t5));
  }, [r?.seq]);
  useTick(500);
  if (!r) return null;
  const top = r.ranking.slice(0, 3);
  const rest = r.ranking.slice(3);
  const podium = [top[1], top[0], top[2]];
  const heights = [62, 82, 46];
  const showAt = [2, 3, 1];
  const left = r.partyEnd ? Math.max(0, Math.ceil((r.partyEnd - now()) / 1000)) : null;
  const nextMeta = r.partyNext ? catalog.find((g) => g.id === r.partyNext) : null;
  return html`<div class="results" style=${meta ? `--gc:${meta.color};--gc2:${meta.color2}` : ''}>
    <div class="res-head">
      <div class="res-game">${meta?.emoji} ${meta?.name ?? ''}</div>
      <h1 class="res-title">RESULTADO</h1>
    </div>
    <div class="res-body">
      <div class="podium">
        ${podium.map((e, i) => {
          if (!e) return html`<div class="pod-col empty" />`;
          const p = P(s, e.id);
          const on = step >= showAt[i];
          return html`<div class=${cls('pod-col', on && 'on', i === 1 && 'first')} key=${e.id}>
            <div class="pod-av">${i === 1 && on ? html`<div class="pod-crown">👑</div>` : null}<${Avatar} p=${p} size=${i === 1 ? 170 : 130} /></div>
            <div class="pod-name" style=${`--pc:${p?.color}`}>${p?.name}</div>
            <div class="pod-score">${fmt(e.score)}</div>
            <div class="pod-block" style=${`height:${heights[i]}%`}><span>${e.rank}º</span></div>
          </div>`;
        })}
      </div>
      <div class="res-side">
        ${rest.length
          ? html`<div class="res-rest">
              ${rest.map((e) => {
                const p = P(s, e.id);
                return html`<div class="rr"><b>${e.rank}º</b><${Avatar} p=${p} size=${40} /><span>${p?.name}</span><em>${fmt(e.score)}</em></div>`;
              })}
            </div>`
          : null}
        ${step >= 4 && r.awards?.length
          ? html`<div class="awards">
              ${r.awards.map((a, i) => {
                const p = P(s, a.id);
                return html`<div class="award" style=${`animation-delay:${i * 0.35}s`}>
                  <div class="aw-medal">🏅</div>
                  <div class="aw-text"><b>${a.title}</b><span>${p?.name}</span><small>${a.desc}</small></div>
                  <${Avatar} p=${p} size=${54} />
                </div>`;
              })}
            </div>`
          : null}
        ${r.party && step >= 4
          ? html`<div class="party-mini">
              <div class="pm-title">🏆 Maratona</div>
              ${r.party.slice(0, 6).map((e) => {
                const p = P(s, e.id);
                return html`<div class="pm-row"><b>${e.rank}º</b><${Avatar} p=${p} size=${34} /><span>${p?.name}</span><em>${fmt(e.score)}</em></div>`;
              })}
            </div>`
          : null}
      </div>
    </div>
    ${r.gallery?.length && step >= 4
      ? html`<div class="res-gallery"><div class="rg-track" style=${`--n:${r.gallery.length}`}>${[...r.gallery, ...r.gallery].map((it, i) => {
          const p = P(s, it.by);
          return html`<div class="rg-item" key=${i}><div class="rg-frame"><${Drawing} d=${it.d} /></div><div class="rg-cap" style=${`--pc:${p?.color}`}>${it.title}<small>${p?.name}</small></div></div>`;
        })}</div></div>`
      : null}
    <div class="res-foot">
      ${r.party
        ? nextMeta
          ? html`<div class="res-next">Próximo jogo: <b style=${`color:${nextMeta.color}`}>${nextMeta.emoji} ${nextMeta.name}</b> em ${left}s <button class="btn small" onClick=${() => send('skip')}>Ir agora ▶</button></div>`
          : html`<div class="res-next">A grande final da maratona vem aí em ${left}s… <button class="btn small" onClick=${() => send('skip')}>▶</button></div>`
        : html`<button class="btn" onClick=${() => send('again')}>🔁 Jogar de novo</button><button class="btn alt" onClick=${() => send('menu')}>🏠 Escolher outro jogo</button>`}
    </div>
  </div>`;
}

// ───────── final da maratona ─────────
export function PartyFinal({ s, catalog, send }) {
  const r = s.result;
  const [step, setStep] = useState(0);
  useEffect(() => {
    audio.sfx('drumroll', { len: 2.4 });
    const ts = [setTimeout(() => setStep(1), 2500), setTimeout(() => setStep(2), 4200)];
    const t2 = setTimeout(() => audio.sfx('tada'), 2500);
    return () => (ts.forEach(clearTimeout), clearTimeout(t2));
  }, []);
  if (!r?.party) return null;
  const champ = r.party[0];
  const cp = P(s, champ?.id);
  return html`<div class="party-final">
    <div class="pf-rays" />
    <div class="pf-label">CAMPEÃO DA MARATONA BOBOBOX</div>
    ${step >= 1 && cp
      ? html`<div class="pf-champ">
          <div class="pf-crown">👑</div>
          <${Avatar} p=${cp} size=${280} />
          <div class="pf-name" style=${`--pc:${cp.color}`}>${cp.name}</div>
          <div class="pf-score">${fmt(champ.score)} pontos de maratona</div>
        </div>`
      : html`<div class="pf-suspense">🥁</div>`}
    ${step >= 2
      ? html`<div class="pf-bottom">
          <div class="pf-list">
            ${r.party.slice(1, 8).map((e) => {
              const p = P(s, e.id);
              return html`<div class="rr"><b>${e.rank}º</b><${Avatar} p=${p} size=${40} /><span>${p?.name}</span><em>${fmt(e.score)}</em></div>`;
            })}
          </div>
          <div class="pf-games">
            Jogos: ${(r.played ?? []).map((id) => catalog.find((g) => g.id === id)).filter(Boolean).map((m) => html`<span style=${`color:${m.color}`}>${m.emoji} ${m.name}</span>`)}
          </div>
          <div class="pf-actions"><button class="btn" onClick=${() => send('party', { count: 4 })}>🔁 Outra maratona</button><button class="btn alt" onClick=${() => send('menu')}>🏠 Menu</button></div>
        </div>`
      : null}
  </div>`;
}
