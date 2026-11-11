// Núcleo do cliente: socket, relógio sincronizado e uma store minúscula.
import { useEffect, useState, useRef } from '/vendor/preact.js';

/**
 * Dois jeitos de rodar:
 *  - 'server' (npm start): um servidor Node com Socket.IO segura as salas.
 *  - 'p2p' (site estático, ex.: Vercel): a TV roda o jogo e os celulares conectam nela por WebRTC.
 * O modo vem de /config.js.
 */
export const MODE = window.BOBO?.mode === 'p2p' ? 'p2p' : 'server';
const isTV = ['/tv', '/tv/', '/tv.html'].includes(location.pathname);

async function makeSocket() {
  if (MODE === 'p2p') {
    const p2p = await import('./p2p.js');
    return isTV ? p2p.createHostSocket() : p2p.createPhoneSocket();
  }
  const { io } = await import('/socket.io/socket.io.esm.min.js');
  return io({ reconnectionDelayMax: 2500 });
}

export const socket = await makeSocket();

// ───────── relógio sincronizado com o servidor ─────────
let offset = 0;
async function syncClock() {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const st = await new Promise((r) => socket.timeout(2500).emit('time', (err, t) => r(err ? null : t)));
    const t1 = Date.now();
    if (st == null) continue;
    const rtt = t1 - t0;
    if (rtt < best) {
      best = rtt;
      offset = st + rtt / 2 - t1;
    }
  }
}
socket.on('connect', syncClock);
export const now = () => Date.now() + offset;

// ───────── store ─────────
export function createStore(init) {
  let s = init;
  const subs = new Set();
  return {
    get: () => s,
    set(v) {
      s = typeof v === 'function' ? v(s) : v;
      for (const f of subs) f(s);
    },
    sub(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export function useStore(store) {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    setV(store.get());
    return store.sub(setV);
  }, [store]);
  return v;
}

/** Avatares desenhados chegam separados do estado (são pesados). */
export const avatars = createStore({});
socket.on('avatars', (map) => avatars.set((cur) => ({ ...cur, ...map })));

/** Re-renderiza periodicamente (cronômetros). */
export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Valor que muda com atraso — útil pra animar “antes → depois”. */
export function useLater(value, delay) {
  const [v, setV] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Contador animado (números subindo). */
export function useCountUp(target, duration = 1200, from = 0) {
  const [v, setV] = useState(from);
  const ref = useRef({ from, target });
  useEffect(() => {
    const start = performance.now();
    const a = ref.current.cur ?? from;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const val = Math.round(a + (target - a) * e);
      ref.current.cur = val;
      setV(val);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export const cls = (...xs) => xs.filter(Boolean).join(' ');
export const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function timerLeft(timer) {
  if (!timer) return 0;
  if (timer.paused) return Math.max(0, timer.remaining ?? 0);
  return Math.max(0, timer.end - now());
}

/** Busca um jogador público pelo id dentro do estado da sala. */
export function playerById(state, id) {
  return state?.room?.players?.find((p) => p.id === id) ?? null;
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
