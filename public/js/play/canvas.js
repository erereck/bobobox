// Prancheta de desenho do celular. Grava vetores normalizados (0..1000).
import { html, useEffect, useRef, useState } from '/vendor/preact.js';
import { cls, vibrate } from '../shared/core.js';

export const DEFAULT_PALETTE = ['#1b1033', '#ffffff', '#ff3d7f', '#ff5c5c', '#ff8a3d', '#ffd23f', '#3ddc84', '#2ec4ff', '#5c7cff', '#a77bff', '#8b5a2b', '#ffb3a7'];
const SIZES = [8, 20, 44];

export function DrawPad({ palette = DEFAULT_PALETTE, bg = '#fffdf7', onChange, initial, compact = false, guide }) {
  const cvRef = useRef();
  const wrapRef = useRef();
  const strokes = useRef(initial?.s ? initial.s.map((s) => ({ ...s, p: [...s.p] })) : []);
  const cur = useRef(null);
  const [color, setColor] = useState(palette[0]);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const [count, setCount] = useState(strokes.current.length);
  const [px, setPx] = useState(300);

  const redraw = () => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const k = cv.width / 1000;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const s of strokes.current) drawStroke(ctx, s, k);
  };

  // tamanho quadrado que cabe no espaço disponível
  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? 300;
      const h = Math.max(220, innerHeight - (compact ? 330 : 290));
      setPx(Math.floor(Math.min(w, h, 640)));
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const cv = cvRef.current;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(px * dpr);
    cv.height = Math.round(px * dpr);
    redraw();
  }, [px]);

  const emit = () => {
    setCount(strokes.current.length);
    onChange?.({ s: strokes.current, bg: bg !== '#fffdf7' ? bg : undefined });
  };

  const toLocal = (e) => {
    const r = cvRef.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };

  const down = (e) => {
    e.preventDefault();
    cvRef.current.setPointerCapture?.(e.pointerId);
    const [x, y] = toLocal(e);
    const s = { c: eraser ? bg : color, w: SIZES[size] * (eraser ? 1.6 : 1), p: [x, y] };
    cur.current = s;
    strokes.current.push(s);
    const ctx = cvRef.current.getContext('2d');
    drawStroke(ctx, s, cvRef.current.width / 1000);
  };
  const move = (e) => {
    const s = cur.current;
    if (!s) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const ctx = cvRef.current.getContext('2d');
    const k = cvRef.current.width / 1000;
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = toLocal(ev);
      const lx = s.p[s.p.length - 2];
      const ly = s.p[s.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < 4) continue;
      s.p.push(x, y);
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lx * k, ly * k);
      ctx.lineTo(x * k, y * k);
      ctx.stroke();
    }
  };
  const up = () => {
    if (!cur.current) return;
    cur.current = null;
    emit();
  };

  const undo = () => {
    strokes.current.pop();
    redraw();
    emit();
    vibrate(10);
  };
  const clear = () => {
    if (!strokes.current.length) return;
    strokes.current = [];
    redraw();
    emit();
    vibrate([10, 30, 10]);
  };

  return html`<div class=${cls('drawpad', compact && 'compact')} ref=${wrapRef}>
    <div class="dp-canvas-wrap" style=${`width:${px}px;height:${px}px`}>
      ${guide ? html`<div class="dp-guide">${guide}</div>` : null}
      <canvas
        ref=${cvRef}
        class="dp-canvas"
        style=${`width:${px}px;height:${px}px`}
        onPointerDown=${down}
        onPointerMove=${move}
        onPointerUp=${up}
        onPointerCancel=${up}
        onPointerLeave=${up}
      />
    </div>
    <div class="dp-tools">
      <div class="dp-colors">
        ${palette.map(
          (c) => html`<button
            class=${cls('dp-color', !eraser && c === color && 'on')}
            style=${`background:${c}`}
            onClick=${() => (setColor(c), setEraser(false), vibrate(5))}
            aria-label=${`cor ${c}`}
          />`,
        )}
      </div>
      <div class="dp-row">
        ${SIZES.map(
          (s, i) => html`<button class=${cls('dp-size', size === i && 'on')} onClick=${() => setSize(i)} aria-label=${`pincel ${i + 1}`}>
            <i style=${`width:${6 + i * 8}px;height:${6 + i * 8}px;background:${eraser ? '#999' : color}`} />
          </button>`,
        )}
        <button class=${cls('dp-tool', eraser && 'on')} onClick=${() => setEraser(!eraser)} title="Borracha">🧽</button>
        <button class="dp-tool" onClick=${undo} disabled=${!count} title="Desfazer">↩️</button>
        <button class="dp-tool" onClick=${clear} disabled=${!count} title="Limpar">🗑️</button>
      </div>
    </div>
  </div>`;
}

export function drawStroke(ctx, s, k) {
  const p = s.p;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length < 4) {
    ctx.beginPath();
    ctx.arc(p[0] * k, p[1] * k, (s.w * k) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * k, p[1] * k);
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, mx * k, my * k);
  }
  ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
  ctx.stroke();
}

/** Gera um PNG do desenho (com legenda e marca d'água) e baixa no aparelho. */
export function saveDrawingPng(d, title = 'desenho') {
  const W = 900;
  const H = 1040;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b1033';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = d.bg ?? '#fffdf7';
  ctx.fillRect(30, 30, W - 60, W - 60);
  ctx.save();
  ctx.translate(30, 30);
  for (const s of d.s ?? []) drawStroke(ctx, s, (W - 60) / 1000);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px Nunito, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(title).slice(0, 40), 34, W + 30);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '400 34px Lilita, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('BOBOBOX', W - 34, W + 30);
  cv.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = String(title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'desenho';
    a.download = `bobobox-${slug}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}
