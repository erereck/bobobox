// Renderizadores de pedidos no celular. Cada pedido do servidor tem um `kind`
// e vira uma tela: texto, escolha, desenho, número, toques, sequência, joystick…
import { html, useEffect, useRef, useState } from '/vendor/preact.js';
import { socket, cls, vibrate, timerLeft, useTick, playerById } from '../shared/core.js';
import { Avatar, Drawing } from '../shared/art.js';
import { DrawPad } from './canvas.js';

export function submit(req, v) {
  socket.emit('act', { t: 'submit', rid: req.id, v });
  vibrate(15);
}

function PromptHead({ req }) {
  return html`<div class="req-head">
    ${req.title ? html`<div class="req-title">${req.title}</div>` : null}
    ${req.prompt ? html`<div class="req-prompt">${formatBlank(req.prompt)}</div>` : null}
    ${req.sub ? html`<div class="req-sub">${req.sub}</div>` : null}
    ${req.drawing ? html`<div class="req-drawing"><${Drawing} d=${req.drawing} /></div>` : null}
  </div>`;
}

function formatBlank(t) {
  const parts = String(t).split(/_{3,}/);
  if (parts.length === 1) return t;
  return parts.flatMap((p, i) => (i ? [html`<span class="blank">____</span>`, p] : [p]));
}

/** Envia automaticamente quando o tempo está acabando (não perde o que já foi feito). */
function useAutoSubmit(timer, fire) {
  useTick(250);
  const done = useRef(false);
  const left = timerLeft(timer);
  useEffect(() => {
    if (!timer || timer.paused || done.current) return;
    if (left > 0 && left < 700) {
      done.current = true;
      fire();
    }
  }, [left]);
}

// ───────── texto ─────────
function TextReq({ req, timer, sent, setSent }) {
  const [v, setV] = useState('');
  const ref = useRef();
  const max = req.max ?? 80;
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 250);
  }, []);
  const send = () => {
    if (!v.trim() || sent) return;
    setSent(true);
    submit(req, v.trim());
  };
  useAutoSubmit(timer, () => v.trim() && !sent && send());
  return html`<form class="req req-text" onSubmit=${(e) => (e.preventDefault(), send())}>
    <${PromptHead} req=${req} />
    <div class="text-wrap">
      <textarea
        ref=${ref}
        maxlength=${max}
        rows=${max > 60 ? 3 : 2}
        placeholder=${req.placeholder ?? 'Escreve aqui…'}
        value=${v}
        disabled=${sent}
        onInput=${(e) => setV(e.currentTarget.value.replace(/\n/g, ' '))}
        onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), send())}
        enterkeyhint="send"
        autocomplete="off"
        autocorrect="on"
        spellcheck="true"
      />
      <span class=${cls('counter', v.length > max * 0.85 && 'warn')}>${max - v.length}</span>
    </div>
    ${req.hints?.length ? html`<div class="hints">${req.hints.map((h) => html`<button type="button" class="hint" onClick=${() => setV((x) => (x ? x.trimEnd() + ' ' + h : h).slice(0, max))}>${h}</button>`)}</div>` : null}
    <div class="req-actions">
      ${req.safety
        ? html`<button type="button" class="btn alt small" disabled=${sent} onClick=${() => (setSent(true), socket.emit('act', { t: 'safety', rid: req.id }))}>🆘 Me salva</button>`
        : null}
      <button class="btn pink" type="submit" disabled=${!v.trim() || sent}>${sent ? 'Enviando…' : req.submitLabel ?? 'Enviar ➜'}</button>
    </div>
  </form>`;
}

// ───────── escolha única ─────────
function ChoiceReq({ req, sent, setSent, s }) {
  const [picked, setPicked] = useState(null);
  const [likes, setLikes] = useState({});
  const choose = (o) => {
    if (sent || o.disabled) return;
    setPicked(o.id);
    setSent(true);
    submit(req, o.id);
  };
  const like = (o, e) => {
    e.stopPropagation();
    if (likes[o.id]) return;
    setLikes((l) => ({ ...l, [o.id]: true }));
    socket.emit('act', { t: 'like', rid: req.id, o: o.id });
    vibrate(8);
  };
  return html`<div class=${cls('req', 'req-choice', req.big && 'big', req.grid && 'grid')}>
    <${PromptHead} req=${req} />
    <div class="options">
      ${req.options.map((o, i) => {
        const p = o.pid ? playerById(s, o.pid) : null;
        return html`<button
          class=${cls('opt', picked === o.id && 'picked', sent && picked !== o.id && 'faded', o.disabled && 'disabled', o.drawing && 'has-drawing')}
          style=${`--i:${i};${o.color ? `--oc:${o.color}` : ''}`}
          onClick=${() => choose(o)}
          disabled=${o.disabled}
        >
          ${o.drawing ? html`<div class="opt-drawing"><${Drawing} d=${o.drawing} /></div>` : null}
          ${p ? html`<${Avatar} p=${p} size=${40} />` : null}
          ${o.emoji ? html`<span class="opt-emoji">${o.emoji}</span>` : null}
          <span class="opt-label">${o.label}${o.sub ? html`<small>${o.sub}</small>` : null}</span>
          ${req.likeable && !o.disabled ? html`<span class=${cls('like', likes[o.id] && 'on')} onClick=${(e) => like(o, e)}>${likes[o.id] ? '❤️' : '🤍'}</span>` : null}
        </button>`;
      })}
    </div>
    ${req.likeable ? html`<div class="req-foot">Toque no 🤍 pra curtir as que achar boas</div>` : null}
  </div>`;
}

// ───────── escolha de jogador ─────────
function PlayersReq({ req, sent, setSent, s }) {
  const [picked, setPicked] = useState(null);
  return html`<div class="req req-players">
    <${PromptHead} req=${req} />
    <div class="player-grid">
      ${req.options.map((o) => {
        const p = playerById(s, o.pid ?? o.id);
        return html`<button
          class=${cls('pg-item', picked === o.id && 'picked', sent && picked !== o.id && 'faded')}
          disabled=${o.disabled}
          onClick=${() => {
            if (sent || o.disabled) return;
            setPicked(o.id);
            setSent(true);
            submit(req, o.id);
          }}
        >
          <${Avatar} p=${p ?? { id: o.id, name: o.label, color: '#ccc', face: 1 }} size=${72} />
          <span>${o.label}</span>
        </button>`;
      })}
    </div>
  </div>`;
}

// ───────── múltipla escolha ─────────
function MultiReq({ req, sent, setSent }) {
  const [sel, setSel] = useState([]);
  const max = req.max ?? req.options.length;
  const min = req.min ?? 1;
  const toggle = (o) => {
    if (sent || o.disabled) return;
    vibrate(8);
    setSel((cur) => (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : cur.length >= max ? (max === 1 ? [o.id] : cur) : [...cur, o.id]));
  };
  return html`<div class="req req-multi">
    <${PromptHead} req=${req} />
    <div class="options">
      ${req.options.map(
        (o, i) => html`<button class=${cls('opt', sel.includes(o.id) && 'picked', o.disabled && 'disabled')} style=${`--i:${i}`} onClick=${() => toggle(o)} disabled=${o.disabled}>
          <span class="check">${sel.includes(o.id) ? '✓' : ''}</span>
          ${o.drawing ? html`<div class="opt-drawing"><${Drawing} d=${o.drawing} /></div>` : null}
          <span class="opt-label">${o.label}</span>
        </button>`,
      )}
    </div>
    <div class="req-actions sticky">
      <span class="sel-count">${sel.length}/${max}</span>
      <button class="btn pink" disabled=${sel.length < min || sent} onClick=${() => (setSent(true), submit(req, sel))}>${sent ? 'Enviado!' : req.submitLabel ?? 'Confirmar ➜'}</button>
    </div>
  </div>`;
}

// ───────── número ─────────
function NumberReq({ req, sent, setSent, timer }) {
  const min = req.min ?? 0;
  const max = req.max ?? 10;
  const [v, setV] = useState(req.initial ?? Math.round((min + max) / 2));
  const small = max - min <= 10 && !req.slider;
  const send = (x = v) => {
    if (sent) return;
    setSent(true);
    submit(req, x);
  };
  useAutoSubmit(timer, () => req.autoSubmit !== false && send());
  if (req.keypad) return html`<${Keypad} req=${req} sent=${sent} onSend=${send} />`;
  return html`<div class="req req-number">
    <${PromptHead} req=${req} />
    ${small
      ? html`<div class="num-grid">
          ${Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
            (n) => html`<button class=${cls('num-btn', v === n && 'picked')} disabled=${sent} onClick=${() => (setV(n), vibrate(8))}>${n}</button>`,
          )}
        </div>`
      : html`<div class="num-big">${v}${req.unit ?? ''}</div>
          <input class="num-slider" type="range" min=${min} max=${max} step=${req.step ?? 1} value=${v} disabled=${sent} onInput=${(e) => setV(+e.currentTarget.value)} />
          <div class="num-row">
            <button class="btn alt small" disabled=${sent} onClick=${() => setV((x) => Math.max(min, x - (req.step ?? 1)))}>−</button>
            <span class="muted">${min}${req.unit ?? ''} – ${max}${req.unit ?? ''}</span>
            <button class="btn alt small" disabled=${sent} onClick=${() => setV((x) => Math.min(max, x + (req.step ?? 1)))}>+</button>
          </div>`}
    ${req.labels ? html`<div class="num-labels"><span>${req.labels[0]}</span><span>${req.labels[1]}</span></div>` : null}
    <div class="req-actions"><button class="btn pink" disabled=${sent} onClick=${() => send()}>${sent ? 'Enviado!' : 'Confirmar ➜'}</button></div>
  </div>`;
}

function Keypad({ req, sent, onSend }) {
  const [v, setV] = useState('');
  const press = (k) => {
    vibrate(6);
    if (k === '⌫') return setV((x) => x.slice(0, -1));
    if (k === '−') return setV((x) => (x.startsWith('-') ? x.slice(1) : '-' + x));
    setV((x) => (x.replace('-', '').length >= 5 ? x : x + k));
  };
  return html`<div class="req req-keypad">
    <${PromptHead} req=${req} />
    <div class="kp-display">${v || html`<span class="muted">?</span>`}</div>
    <div class="kp-grid">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫'].map((k) => html`<button class="kp-key" disabled=${sent} onClick=${() => press(k)}>${k}</button>`)}
    </div>
    <div class="req-actions"><button class="btn pink" disabled=${sent || v === '' || v === '-'} onClick=${() => onSend(Number(v))}>${sent ? '…' : 'Responder ➜'}</button></div>
  </div>`;
}

// ───────── desenho ─────────
function DrawReq({ req, sent, setSent, timer }) {
  const d = useRef(null);
  const [has, setHas] = useState(false);
  const send = () => {
    if (sent || !d.current?.s?.length) return;
    setSent(true);
    submit(req, d.current);
  };
  useAutoSubmit(timer, send);
  return html`<div class="req req-draw">
    <${PromptHead} req=${{ ...req, drawing: null }} />
    <${DrawPad} palette=${req.palette} bg=${req.bg} guide=${req.guide} onChange=${(x) => ((d.current = x), setHas(x.s.length > 0))} />
    <div class="req-actions"><button class="btn pink" disabled=${!has || sent} onClick=${send}>${sent ? 'Enviado!' : req.submitLabel ?? 'Pronto! ➜'}</button></div>
  </div>`;
}

// ───────── toques frenéticos ─────────
function TapsReq({ req, sent, setSent }) {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready → go → done
  const [left, setLeft] = useState(req.duration ?? 7000);
  const cRef = useRef(0);
  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase('go');
      vibrate(80);
      const start = Date.now();
      const iv = setInterval(() => {
        const l = (req.duration ?? 7000) - (Date.now() - start);
        setLeft(Math.max(0, l));
        if (l <= 0) {
          clearInterval(iv);
          setPhase('done');
          setSent(true);
          submit(req, cRef.current);
          vibrate([60, 40, 60]);
        }
      }, 50);
    }, 1800);
    return () => clearTimeout(t1);
  }, []);
  const tap = (e) => {
    e.preventDefault();
    if (phase !== 'go') return;
    cRef.current++;
    setCount(cRef.current);
    vibrate(4);
  };
  const target = req.target;
  return html`<div class="req req-taps">
    <${PromptHead} req=${req} />
    <div class="taps-count">${count}${target ? html`<small>/${target}</small>` : null}</div>
    <div class="taps-left">${phase === 'ready' ? 'Prepara…' : phase === 'go' ? (left / 1000).toFixed(1) + 's' : 'Fim!'}</div>
    <button class=${cls('tap-btn', phase === 'go' && 'live', target && count >= target && 'hit')} onPointerDown=${tap}>${phase === 'ready' ? '…' : phase === 'go' ? 'TOCA!' : '✓'}</button>
  </div>`;
}

// ───────── sequência (memória) ─────────
export const SEQ_SYMBOLS = [
  { e: '💀', c: '#ff5c5c' },
  { e: '🕷️', c: '#a77bff' },
  { e: '🦇', c: '#2ec4ff' },
  { e: '🎃', c: '#ff8a3d' },
  { e: '👻', c: '#3ddc84' },
  { e: '🕯️', c: '#ffd23f' },
];
function SequenceReq({ req, sent, setSent }) {
  const [seq, setSeq] = useState([]);
  const n = req.length ?? 4;
  const symbols = SEQ_SYMBOLS.slice(0, req.symbols ?? 4);
  const add = (i) => {
    if (sent || seq.length >= n) return;
    vibrate(10);
    const next = [...seq, i];
    setSeq(next);
    if (next.length >= n) {
      setSent(true);
      setTimeout(() => submit(req, next), 250);
    }
  };
  return html`<div class="req req-seq">
    <${PromptHead} req=${req} />
    <div class="seq-slots">${Array.from({ length: n }, (_, i) => html`<span class=${cls('seq-slot', seq[i] != null && 'on')}>${seq[i] != null ? symbols[seq[i]].e : ''}</span>`)}</div>
    <div class="seq-grid">
      ${symbols.map((sy, i) => html`<button class="seq-btn" style=${`--sc:${sy.c}`} disabled=${sent} onClick=${() => add(i)}>${sy.e}</button>`)}
    </div>
    <div class="req-actions"><button class="btn alt small" disabled=${!seq.length || sent} onClick=${() => setSeq((x) => x.slice(0, -1))}>⌫ Apagar</button></div>
  </div>`;
}

// ───────── confirmar ─────────
function ConfirmReq({ req, sent, setSent }) {
  return html`<div class="req req-confirm">
    <${PromptHead} req=${req} />
    <div class="req-actions center"><button class="btn big pink" disabled=${sent} onClick=${() => (setSent(true), submit(req, true))}>${req.submitLabel ?? 'Bora!'}</button></div>
  </div>`;
}

// ───────── joystick (tempo real) ─────────
function JoystickReq({ req, me }) {
  const base = useRef();
  const st = useRef({ x: 0, y: 0, b: 0, id: null });
  const [knob, setKnob] = useState([0, 0]);
  const [dash, setDash] = useState(false);
  const [cool, setCool] = useState(false);
  useEffect(() => {
    let last = '';
    const iv = setInterval(() => {
      const { x, y, b } = st.current;
      const key = `${x.toFixed(2)},${y.toFixed(2)},${b}`;
      if (key !== last || b) socket.volatile.emit('in', { x, y, b });
      last = key;
      if (b) st.current.b = 0;
    }, 50);
    return () => {
      clearInterval(iv);
      socket.volatile.emit('in', { x: 0, y: 0, b: 0 });
    };
  }, []);
  const set = (e) => {
    const r = base.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    st.current.x = dx;
    st.current.y = dy;
    setKnob([dx, dy]);
  };
  const down = (e) => {
    e.preventDefault();
    st.current.id = e.pointerId;
    base.current.setPointerCapture?.(e.pointerId);
    set(e);
  };
  const move = (e) => st.current.id === e.pointerId && set(e);
  const up = (e) => {
    if (st.current.id !== e.pointerId) return;
    st.current.id = null;
    st.current.x = 0;
    st.current.y = 0;
    setKnob([0, 0]);
  };
  const doDash = (e) => {
    e.preventDefault();
    if (cool) return vibrate(5);
    st.current.b = 1;
    setDash(true);
    setCool(true);
    vibrate(40);
    setTimeout(() => setDash(false), 180);
    setTimeout(() => setCool(false), req.cooldown ?? 1200);
  };
  return html`<div class="req req-joy" style=${`--me:${me?.color ?? '#fff'}`}>
    <div class="joy-title">${req.prompt ?? 'Empurre todo mundo pra fora!'}</div>
    <div class="joy-area">
      <div class="joy-base" ref=${base} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        <div class="joy-knob" style=${`transform:translate(${knob[0] * 60}%, ${knob[1] * 60}%)`} />
      </div>
      <button class=${cls('joy-dash', dash && 'on', cool && 'cool')} onPointerDown=${doDash}>${req.button ?? 'TRANCO!'}</button>
    </div>
  </div>`;
}

export function RequestView({ req, timer, s, me }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    setSent(false);
    vibrate([20, 40, 20]);
    const off = () => setSent(false);
    socket.on('toast', off);
    return () => socket.off('toast', off);
  }, [req.id]);
  const props = { req, timer, sent, setSent, s, me };
  switch (req.kind) {
    case 'text':
      return html`<${TextReq} ...${props} />`;
    case 'choice':
      return html`<${ChoiceReq} ...${props} />`;
    case 'players':
      return html`<${PlayersReq} ...${props} />`;
    case 'multi':
      return html`<${MultiReq} ...${props} />`;
    case 'number':
      return html`<${NumberReq} ...${props} />`;
    case 'draw':
      return html`<${DrawReq} ...${props} />`;
    case 'taps':
      return html`<${TapsReq} ...${props} />`;
    case 'sequence':
      return html`<${SequenceReq} ...${props} />`;
    case 'confirm':
      return html`<${ConfirmReq} ...${props} />`;
    case 'joystick':
      return html`<${JoystickReq} ...${props} />`;
    default:
      return html`<div class="req"><${PromptHead} req=${req} /></div>`;
  }
}
