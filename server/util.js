// Utilitários compartilhados do servidor.
import { randomBytes } from 'node:crypto';

export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rand(arr.length)];
export const uid = (n = 10) => randomBytes(n).toString('base64url').slice(0, n);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, n) => shuffle(arr).slice(0, n);

/** Texto limpo vindo de um jogador: sem controle, espaços colapsados, limite de tamanho. */
export function clean(text, max = 80) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const STOP = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'the', 'e']);

/** Normaliza pra comparação: sem acento, minúsculo, sem pontuação, sem artigos, singular ingênuo. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(oes|aes|es|s)$/, '') : w))
    .join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "Parece a mesma resposta?" — tolera acento, artigo, plural e erro de digitação pequeno. */
export function similar(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const len = Math.max(x.length, y.length);
  const tol = len <= 4 ? 0 : len <= 8 ? 1 : 2;
  return levenshtein(x, y) <= tol;
}

/** Baralho: entrega itens sem repetir até esgotar (persistente por sala). */
export class Deck {
  constructor(items) {
    this.items = items;
    this.pool = [];
  }
  draw(filter) {
    for (let tries = 0; tries < 2; tries++) {
      if (!this.pool.length) this.pool = shuffle(this.items);
      if (!filter) return this.pool.pop();
      const i = this.pool.findIndex(filter);
      if (i >= 0) return this.pool.splice(i, 1)[0];
      this.pool = [];
    }
    return pick(this.items.filter(filter ?? (() => true))) ?? pick(this.items);
  }
  drawMany(n, filter) {
    const out = [];
    const seen = new Set();
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      const it = this.draw(filter);
      if (it === undefined) break;
      if (seen.has(it)) continue;
      seen.add(it);
      out.push(it);
    }
    return out;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Desenhos trafegam como vetores: { s: [{ c: '#rrggbb', w: 4..60, p: [x0,y0,x1,y1,...] }] }
 * Coordenadas inteiras 0..1000 num quadro quadrado. Aqui a gente garante que ninguém
 * mande um desenho de 50MB ou com cor maliciosa.
 */
export function sanitizeDrawing(d) {
  if (!d || !Array.isArray(d.s)) return { s: [] };
  const out = [];
  let budget = 24000;
  for (const st of d.s.slice(0, 800)) {
    if (!st || !Array.isArray(st.p)) continue;
    const c = HEX.test(st.c) ? st.c.toLowerCase() : '#222222';
    const w = clamp(Math.round(Number(st.w) || 8), 2, 120);
    const n = Math.min(st.p.length - (st.p.length % 2), budget);
    if (n < 2) continue;
    const p = new Array(n);
    for (let i = 0; i < n; i++) p[i] = clamp(Math.round(Number(st.p[i]) || 0), -50, 1050);
    budget -= n;
    out.push({ c, w, p });
    if (budget <= 0) break;
  }
  const bg = HEX.test(d.bg) ? d.bg.toLowerCase() : undefined;
  return bg ? { s: out, bg } : { s: out };
}

export function drawingIsEmpty(d) {
  return !d || !d.s || d.s.reduce((n, s) => n + s.p.length, 0) < 4;
}

/** Rabiscos aleatórios (usados pelos bots). Parecem obra de criança de 4 anos — de propósito. */
export function randomScribble() {
  const colors = ['#1b1033', '#ff3d7f', '#2ec4ff', '#ffd23f', '#3ddc84', '#ff8a3d', '#8f5bff'];
  const s = [];
  const kind = rand(4);
  const cx = 300 + rand(400);
  const cy = 300 + rand(400);
  const r = 150 + rand(200);
  // cabeça/corpo redondo
  const circle = [];
  for (let a = 0; a <= 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    circle.push(Math.round(cx + Math.cos(t) * r * (0.9 + Math.random() * 0.2)), Math.round(cy + Math.sin(t) * r * (0.9 + Math.random() * 0.2)));
  }
  s.push({ c: '#1b1033', w: 10, p: circle });
  if (kind !== 3) {
    // olhos
    s.push({ c: '#1b1033', w: 22, p: [cx - r / 3, cy - r / 4, cx - r / 3 + 1, cy - r / 4 + 1].map(Math.round) });
    s.push({ c: '#1b1033', w: 22, p: [cx + r / 3, cy - r / 4, cx + r / 3 + 1, cy - r / 4 + 1].map(Math.round) });
    // boca
    const m = [];
    for (let a = 0; a <= 10; a++) {
      const t = Math.PI * (0.15 + 0.7 * (a / 10));
      m.push(Math.round(cx + Math.cos(t) * r * 0.5), Math.round(cy + r * 0.1 + Math.sin(t) * r * 0.35 * (kind === 1 ? -1 : 1)));
    }
    s.push({ c: '#ff3d7f', w: 12, p: m });
  }
  // rabiscos extras
  for (let k = 0; k < 2 + rand(4); k++) {
    const p = [];
    let x = rand(1000);
    let y = rand(1000);
    for (let i = 0; i < 6 + rand(10); i++) {
      x = clamp(x + rand(240) - 120, 20, 980);
      y = clamp(y + rand(240) - 120, 20, 980);
      p.push(x, y);
    }
    s.push({ c: pick(colors), w: 6 + rand(20), p });
  }
  return { s };
}

/** Pontuação em ordem decrescente, com posições compartilhadas em empate. */
export function rankEntries(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  let lastScore = null;
  let lastRank = 0;
  return sorted.map((e, i) => {
    const rank = e.score === lastScore ? lastRank : i + 1;
    lastScore = e.score;
    lastRank = rank;
    return { ...e, rank };
  });
}
