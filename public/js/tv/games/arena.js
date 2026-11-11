// ARENA BOBO na TV — sumô de caixinhas em tempo real.
//
// A TV é a autoridade da física: recebe o joystick dos celulares (`socket.on('in')`),
// simula tudo num passo fixo dentro de requestAnimationFrame, pilota os Bobôs (IA)
// e avisa o servidor com `host:cmd { cmd:'game', type:'out' | 'roundEnd', phaseId }`.
// O `roundEnd` sai UMA vez por fase de luta (guardado pelo phaseId). Se a TV sumir,
// o servidor encerra a rodada sozinho no tempo-limite.

import { html, useEffect, useRef, useState } from '/vendor/preact.js';
import { socket, now, cls, fmt, useStore } from '../../shared/core.js';
import { Avatar } from '../../shared/art.js';
import { audio } from '../../shared/audio.js';
import { Scoreboard, fxBus, P } from '../common.js';
import { narration } from '../narrator.js';

// ───────── constantes da física (unidades do mundo; plataforma ~65–110 de raio) ─────────
const TAU = Math.PI * 2;
const STEP = 1 / 120; // passo fixo
const PR = 9; // raio da caixinha
const ACCEL = 420; // velocidade máxima ≈ ACCEL/FRICTION ≈ 93 u/s
const FRICTION = 4.5;
const MAX_V = 300;
const DASH_V = 175; // tranco anda ~45 u; acertado, empurra a vítima ~40 u (meio raio)
const DASH_T = 0.2; // duração do tranco (mais pesado e com menos atrito)
const DASH_CD = 1.2;
const TURBO_CD = 0.4;
const DASH_MASS = 1.5;
const CREDIT_S = 3.5; // quem encostou nos últimos 3,5 s leva o crédito da queda
const FALL_S = 0.9;
const WARN_S = 2.2; // aviso antes da fatia sumir
const MAG_R = 75;
const END_DELAY = 1.4; // segundos (reais) entre o último cair e o roundEnd
const VIEW = 1.16; // margem da câmera em volta da plataforma
const INK = '#1b1033';

const PU = {
  magnet: { emoji: '🧲', name: 'ÍMÃ', color: '#ff5c5c', time: 5, desc: 'puxa quem tá perto' },
  giant: { emoji: '📦', name: 'CAIXA GIGANTE', color: '#ffd23f', time: 6, desc: 'enorme e pesadona' },
  ice: { emoji: '🧊', name: 'GELO', color: '#2ec4ff', time: 6, desc: 'chão vira rinque pros outros' },
  turbo: { emoji: '⚡', name: 'TURBO', color: '#3ddc84', time: 6, desc: 'tranco quase sem recarga' },
};
const PU_KINDS = Object.keys(PU);

const wrap = (a) => (((a % TAU) + TAU * 1.5) % TAU) - TAU / 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function prune(arr) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i].life > 0) arr[j++] = arr[i];
  arr.length = j;
}

function schedule(mode) {
  if (mode?.chaos) return { grace: 5, shrinkEnd: 34, minK: 0.5, sudden: 40, suddenEnd: 50, pu: [3.5, 5.5], puMax: 3, slices: [8, 15, 22, 29, 36] };
  return { grace: 7, shrinkEnd: 44, minK: 0.52, sudden: 50, suddenEnd: 62, pu: [6, 9], puMax: 2, slices: mode?.slices ? [10, 19, 28, 37] : [] };
}

// ───────── simulação ─────────
class Sim {
  constructor(fighters, mode) {
    this.n = fighters.length;
    this.R0 = 58 + 4.2 * Math.max(2, this.n);
    this.R = this.R0;
    this.hub = this.R0 * 0.22; // miolo que nunca some
    this.sch = schedule(mode);
    this.mode = 'ready'; // ready → fight → ending → over
    this.t = 0; // tempo de luta
    this.clock = 0; // tempo total (animações)
    this.endT = 0;
    this.slow = 0;
    this.shake = 0;
    this.ice = null;
    this.winner = null;
    this.slices = [];
    this.sliceIdx = 0;
    this.items = [];
    this.nextPu = rnd(4, 6);
    this.parts = [];
    this.rings = [];
    this.trails = [];
    this.elim = [];
    this.flags = {};
    this.sfxAt = {};
    this.hooks = {};
    const off = Math.random() * TAU;
    const rr = this.R0 * (this.n > 6 ? 0.62 : 0.55);
    this.fs = fighters.map((p, i) => {
      const a = off + (i / Math.max(1, this.n)) * TAU;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        x: Math.cos(a) * rr,
        y: Math.sin(a) * rr,
        vx: 0,
        vy: 0,
        r: PR,
        m: 1,
        ix: 0,
        iy: 0,
        dashReq: false,
        cd: 0,
        cdMax: DASH_CD,
        dashT: 0,
        fx: -Math.cos(a),
        fy: -Math.sin(a),
        alive: true,
        fallT: -1,
        spin: 0,
        outAt: 0,
        last: null,
        by: null,
        solo: false,
        knocks: 0,
        dashes: 0,
        pups: 0,
        pu: { magnet: 0, giant: 0, turbo: 0 },
        squash: 0,
        tt: 0,
        ai: p.bot ? makeAI() : null,
      };
    });
    this.byId = Object.fromEntries(this.fs.map((f) => [f.id, f]));
  }

  start() {
    this.mode = 'fight';
    this.t = 0;
    for (const f of this.fs) f.dashReq = false;
  }

  aliveCount() {
    let n = 0;
    for (const f of this.fs) if (f.alive) n++;
    return n;
  }

  radiusAt(t) {
    const S = this.sch;
    if (t < S.grace) return this.R0;
    if (t < S.shrinkEnd) return this.R0 * (1 - ((1 - S.minK) * (t - S.grace)) / (S.shrinkEnd - S.grace));
    if (t < S.sudden) return this.R0 * S.minK;
    return this.R0 * S.minK * Math.max(0, 1 - (t - S.sudden) / (S.suddenEnd - S.sudden));
  }

  /** Raio “seguro” pensando no futuro próximo (a IA usa pra não ser pega pelo encolhimento). */
  safeRadius() {
    return this.mode === 'fight' ? Math.min(this.R, this.radiusAt(this.t + 1.2)) : this.R;
  }

  onFloor(x, y) {
    const d = Math.hypot(x, y);
    if (d > this.R) return false;
    if (d <= this.hub) return true;
    const a = Math.atan2(y, x);
    for (const s of this.slices) if (s.gone && Math.abs(wrap(a - s.a)) < s.hw) return false;
    return true;
  }

  /** Perigo pra IA: fatia sumida ou piscando (com folga). */
  inDanger(x, y, pad = 0.12) {
    const d = Math.hypot(x, y);
    if (d <= this.hub - PR) return false;
    const a = Math.atan2(y, x);
    for (const s of this.slices) if (Math.abs(wrap(a - s.a)) < s.hw + pad) return true;
    return false;
  }

  sound(name, gap = 0.05, opts) {
    const t = performance.now() / 1000;
    if (t - (this.sfxAt[name] ?? -9) < gap) return;
    this.sfxAt[name] = t;
    audio.sfx(name, opts);
  }

  step(dt) {
    this.clock += dt;
    const live = this.mode === 'fight' || this.mode === 'ending';
    if (this.mode === 'fight') {
      this.t += dt;
      this.updateArena(dt);
      if (this.ice && (this.ice.t -= dt) <= 0) this.ice = null;
    }
    for (const f of this.fs) this.updateFighter(f, dt, live);
    this.applyMagnets(dt);
    for (const f of this.fs) {
      if (!f.alive) continue;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    this.collide();
    if (this.mode === 'fight') {
      for (const f of this.fs) if (f.alive && !this.onFloor(f.x, f.y)) this.fall(f);
      this.updateItems(dt);
      if (this.aliveCount() <= (this.n >= 2 ? 1 : 0)) this.finish();
    } else {
      // Fora da luta ninguém cai: quem passou da borda volta pra dentro.
      for (const f of this.fs) if (f.alive) this.keepInside(f);
    }
    this.updateFx(dt);
  }

  updateFighter(f, dt, live) {
    if (!f.alive) {
      if (f.fallT >= 0 && f.fallT < FALL_S) {
        f.fallT += dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const k = Math.exp(-2 * dt);
        f.vx *= k;
        f.vy *= k;
      }
      return;
    }
    f.cd = Math.max(0, f.cd - dt);
    f.dashT = Math.max(0, f.dashT - dt);
    for (const k in f.pu) f.pu[k] = Math.max(0, f.pu[k] - dt);
    f.squash = Math.max(0, f.squash - dt * 4);
    const giant = f.pu.giant > 0;
    f.r += ((giant ? PR * 1.65 : PR) - f.r) * Math.min(1, dt * 8);
    f.m = giant ? 3.5 : 1;

    let ix = 0;
    let iy = 0;
    if (live) {
      if (f.bot) botThink(f, this, dt);
      ix = f.ix;
      iy = f.iy;
    } else f.dashReq = false;
    const il = Math.hypot(ix, iy);
    if (il > 1) {
      ix /= il;
      iy /= il;
    }
    if (il > 0.2) {
      // direção pra onde a caixinha “olha” (usada no tranco sem joystick)
      f.fx = ix / Math.min(il, 1);
      f.fy = iy / Math.min(il, 1);
    }
    const iced = !!this.ice && this.ice.owner !== f.id;
    const acc = ACCEL * (iced ? 0.5 : 1) * (f.pu.turbo > 0 ? 1.25 : 1) * (giant ? 0.85 : 1);
    f.vx += ix * acc * dt;
    f.vy += iy * acc * dt;
    if (f.dashReq) {
      f.dashReq = false;
      if (live && f.cd <= 0) this.dash(f);
    }
    const fr = (this.mode === 'over' ? FRICTION * 4 : FRICTION) * (iced ? 0.3 : 1) * (f.dashT > 0 ? 0.75 : 1);
    const k = Math.exp(-fr * dt);
    f.vx *= k;
    f.vy *= k;
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > MAX_V) {
      f.vx *= MAX_V / sp;
      f.vy *= MAX_V / sp;
    }
    if (f.dashT > 0 && (f.tt = (f.tt + 1) % 3) === 0) this.trails.push({ x: f.x, y: f.y, r: f.r, color: f.color, life: 0.28 });
  }

  dash(f) {
    let dx = f.ix;
    let dy = f.iy;
    if (Math.hypot(dx, dy) < 0.2) {
      dx = f.vx;
      dy = f.vy;
      if (Math.hypot(dx, dy) < 8) {
        dx = f.fx;
        dy = f.fy;
      }
    }
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    f.vx = f.vx * 0.35 + dx * DASH_V;
    f.vy = f.vy * 0.35 + dy * DASH_V;
    f.fx = dx;
    f.fy = dy;
    f.dashT = DASH_T;
    f.cd = f.cdMax = f.pu.turbo > 0 ? TURBO_CD : DASH_CD;
    f.dashes++;
    this.puff(f.x - dx * f.r, f.y - dy * f.r, '#ffffff', 6, -dx, -dy);
    this.sound('whoosh', 0.09);
  }

  applyMagnets(dt) {
    for (const h of this.fs) {
      if (!h.alive || h.pu.magnet <= 0) continue;
      for (const o of this.fs) {
        if (o === h || !o.alive) continue;
        const dx = h.x - o.x;
        const dy = h.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > MAG_R) continue;
        const a = (520 * (1 - d / MAG_R)) / o.m;
        o.vx += (dx / d) * a * dt;
        o.vy += (dy / d) * a * dt;
      }
    }
  }

  collide() {
    const A = this.fs;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        let nx;
        let ny;
        if (d < 1e-4) {
          const ang = Math.random() * TAU;
          nx = Math.cos(ang);
          ny = Math.sin(ang);
          d = 0;
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const ma = a.m * (a.dashT > 0 ? DASH_MASS : 1);
        const mb = b.m * (b.dashT > 0 ? DASH_MASS : 1);
        const ia = 1 / ma;
        const ib = 1 / mb;
        const sum = ia + ib;
        // separa (proporcional ao inverso da massa)
        const over = min - d;
        a.x -= (nx * over * ia) / sum;
        a.y -= (ny * over * ia) / sum;
        b.x += (nx * over * ib) / sum;
        b.y += (ny * over * ib) / sum;
        // impulso
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv >= 0) continue;
        const dashing = a.dashT > 0 || b.dashT > 0;
        const e = dashing ? 0.85 : 0.75; // tranco transfere quase tudo: a vítima voa, quem bateu quase para
        const jimp = (-(1 + e) * rv) / sum;
        a.vx -= jimp * ia * nx;
        a.vy -= jimp * ia * ny;
        b.vx += jimp * ib * nx;
        b.vy += jimp * ib * ny;
        const impact = -rv;
        if (impact > 20) {
          a.last = { by: b.id, t: this.t };
          b.last = { by: a.id, t: this.t };
        }
        if (impact > 45) this.bump(a, b, nx, ny, impact, dashing);
      }
    }
  }

  bump(a, b, nx, ny, impact, dashing) {
    const k = Math.min(1, impact / 200);
    this.shake = Math.min(16, this.shake + k * (dashing ? 10 : 4));
    a.squash = Math.max(a.squash, k);
    b.squash = Math.max(b.squash, k);
    const cx = a.x + nx * a.r;
    const cy = a.y + ny * a.r;
    this.stars(cx, cy, Math.round(3 + k * 9), [a.color, b.color, '#ffffff', '#ffd23f']);
    if (dashing && k > 0.35) this.ring(cx, cy, '#ffffff', 12 + k * 20);
    this.sound('hit', 0.06, { pitch: 0.75 + (1 - k) * 0.6 + Math.random() * 0.15, vol: 0.35 + 0.65 * k });
  }

  keepInside(f) {
    const lim = Math.max(4, this.R - 2);
    const d = Math.hypot(f.x, f.y);
    if (d <= lim || d < 1e-6) return;
    f.x *= lim / d;
    f.y *= lim / d;
    const ux = f.x / lim;
    const uy = f.y / lim;
    const vr = f.vx * ux + f.vy * uy;
    if (vr > 0) {
      f.vx -= vr * ux;
      f.vy -= vr * uy;
    }
  }

  fall(f) {
    f.alive = false;
    f.fallT = 0;
    f.outAt = this.t;
    f.spin = (Math.random() < 0.5 ? -1 : 1) * rnd(540, 900);
    f.dashT = 0;
    const L = f.last;
    const by = L && L.by !== f.id && this.t - L.t <= CREDIT_S && this.byId[L.by] ? L.by : null;
    f.by = by;
    f.solo = !by;
    if (by) this.byId[by].knocks++;
    this.elim.push(f.id);
    this.shake = Math.min(16, this.shake + 4);
    this.puff(f.x, f.y, f.color, 14);
    this.sound('fall', 0.05);
    this.hooks.onOut?.(f, by);
  }

  finish() {
    this.mode = 'ending';
    this.endT = 0;
    this.slow = 0.9;
    this.winner = this.fs.find((f) => f.alive) ?? null;
    this.hooks.onEnd?.(this.winner);
  }

  /** Resultado pro servidor: vivos primeiro (mais perto do centro na frente), depois quedas da última pra primeira. */
  result() {
    const alive = this.fs.filter((f) => f.alive).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const order = [...alive.map((f) => f.id), ...[...this.elim].reverse()];
    const knocks = {};
    const times = {};
    const dashes = {};
    const pups = {};
    for (const f of this.fs) {
      if (f.knocks) knocks[f.id] = f.knocks;
      times[f.id] = Math.round(f.alive ? this.t : f.outAt);
      if (f.dashes) dashes[f.id] = f.dashes;
      if (f.pups) pups[f.id] = f.pups;
    }
    return { order, knocks, solo: this.fs.filter((f) => f.solo).map((f) => f.id), times, dashes, pups };
  }

  // ───────── a arena: encolhe, fatias somem, power-ups brotam ─────────
  updateArena(dt) {
    const S = this.sch;
    const prev = this.R;
    this.R = this.radiusAt(this.t);
    if (!this.flags.shrink && this.t >= S.grace) {
      this.flags.shrink = true;
      this.hooks.onEvent?.('🌀 A plataforma começou a encolher!');
    }
    if (!this.flags.sudden && this.t >= S.sudden) {
      this.flags.sudden = true;
      this.hooks.onSudden?.();
    }
    if (this.R < prev && this.R > 1 && Math.random() < dt * 22) {
      const a = Math.random() * TAU;
      this.debris(Math.cos(a) * this.R, Math.sin(a) * this.R);
    }
    while (this.sliceIdx < S.slices.length && this.t >= S.slices[this.sliceIdx]) {
      this.sliceIdx++;
      this.addSlice();
    }
    for (const s of this.slices) {
      if (s.gone) {
        s.goneT += dt;
        continue;
      }
      const before = s.t;
      s.t += dt;
      if (Math.floor(s.t * 3) !== Math.floor(before * 3)) this.sound('tick', 0.05, { hi: s.t > WARN_S * 0.6 });
      if (s.t >= WARN_S) {
        s.gone = true;
        s.goneT = 0;
        this.shake = Math.min(16, this.shake + 7);
        this.sound('splat', 0.1);
        for (let i = 0; i < 22; i++) {
          const a = s.a + rnd(-s.hw, s.hw);
          const r = rnd(this.hub, Math.max(this.hub, this.R));
          this.debris(Math.cos(a) * r, Math.sin(a) * r);
        }
      }
    }
    this.nextPu -= dt;
    if (this.nextPu <= 0) {
      this.nextPu = rnd(S.pu[0], S.pu[1]);
      this.spawnItem();
    }
  }

  addSlice() {
    if (this.R <= this.hub * 1.4) return;
    const hw = rnd(0.36, 0.5);
    const used = this.slices.reduce((s, x) => s + x.hw * 2, 0);
    if (used + hw * 2 > TAU * 0.5) return;
    let best = null;
    for (let k = 0; k < 24; k++) {
      const a = wrap((k / 24) * TAU + Math.random() * 0.2);
      if (this.slices.some((s) => Math.abs(wrap(a - s.a)) < s.hw + hw + 0.14)) continue;
      // Maldade calculada: prefere a fatia com mais gente em cima.
      let score = Math.random() * 1.5;
      for (const f of this.fs) {
        if (f.alive && Math.hypot(f.x, f.y) > this.hub && Math.abs(wrap(Math.atan2(f.y, f.x) - a)) < hw) score += 2;
      }
      if (!best || score > best.score) best = { a, score };
    }
    if (!best) return;
    this.slices.push({ a: best.a, hw, t: 0, gone: false, goneT: 0 });
    this.hooks.onEvent?.('⚠️ Uma fatia do chão vai sumir!');
  }

  spawnItem() {
    if (this.items.length >= this.sch.puMax || this.R < this.hub) return;
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * this.R * 0.62;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (!this.onFloor(x, y) || this.inDanger(x, y, 0.05)) continue;
      if (this.fs.some((f) => f.alive && Math.hypot(f.x - x, f.y - y) < f.r + 14)) continue;
      const kind = PU_KINDS[Math.floor(Math.random() * PU_KINDS.length)];
      this.items.push({ x, y, kind, t: 0, ttl: 11, life: 1 });
      this.sound('bloop', 0.1);
      return;
    }
  }

  updateItems(dt) {
    for (const it of this.items) {
      it.t += dt;
      if (it.t > it.ttl || !this.onFloor(it.x, it.y)) {
        it.life = 0;
        this.puff(it.x, it.y, PU[it.kind].color, 8);
        continue;
      }
      for (const f of this.fs) {
        if (f.alive && Math.hypot(f.x - it.x, f.y - it.y) < f.r + 6) {
          it.life = 0;
          this.grab(f, it.kind);
          break;
        }
      }
    }
    prune(this.items);
  }

  grab(f, kind) {
    const info = PU[kind];
    f.pups++;
    if (kind === 'ice') this.ice = { t: info.time, owner: f.id };
    else f.pu[kind] = info.time;
    this.sound(kind === 'giant' ? 'boing' : 'powerup', 0.05);
    this.ring(f.x, f.y, info.color, 34);
    this.puff(f.x, f.y, info.color, 12);
    this.hooks.onEvent?.(`${info.emoji} ${f.name} pegou ${info.name}!`);
    this.hooks.onChange?.();
  }

  // ───────── partículas ─────────
  puff(x, y, color, n, dx = 0, dy = 0) {
    for (let i = 0; i < n && this.parts.length < 500; i++) {
      const a = Math.random() * TAU;
      const sp = rnd(20, 90);
      const life = rnd(0.35, 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * sp + dx * 60, vy: Math.sin(a) * sp + dy * 60, life, max: life, size: rnd(1.2, 2.6), color, rot: 0, vr: 0, kind: 0 });
    }
  }
  stars(x, y, n, colors) {
    for (let i = 0; i < n && this.parts.length < 500; i++) {
      const a = Math.random() * TAU;
      const sp = rnd(50, 150);
      const life = rnd(0.3, 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: rnd(1.6, 3.2), color: colors[i % colors.length], rot: Math.random() * TAU, vr: rnd(-10, 10), kind: 1 });
    }
  }
  debris(x, y) {
    if (this.parts.length >= 500) return;
    const life = rnd(0.6, 1.1);
    const a = Math.atan2(y, x);
    this.parts.push({ x, y, vx: Math.cos(a) * rnd(5, 25), vy: Math.sin(a) * rnd(5, 25), life, max: life, size: rnd(1.5, 3.4), color: Math.random() < 0.5 ? '#e0b77a' : '#c98a4b', rot: Math.random() * TAU, vr: rnd(-6, 6), kind: 2 });
  }
  ring(x, y, color, max) {
    this.rings.push({ x, y, color, max, life: 0.4 });
  }
  updateFx(dt) {
    const k = Math.exp(-3 * dt);
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= k;
      p.vy *= k;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    prune(this.parts);
    for (const r of this.rings) r.life -= dt;
    prune(this.rings);
    for (const t of this.trails) t.life -= dt;
    prune(this.trails);
    this.shake *= Math.exp(-7 * dt);
  }
}

// ───────── IA dos Bobôs ─────────
function makeAI() {
  return {
    aggr: rnd(0.55, 1), // vontade de partir pra cima
    react: rnd(0.07, 0.19), // tempo de reação
    think: rnd(0, 0.3),
    wake: rnd(1.4, 2.2), // dá um respiro pros humanos no começo (o celular leva um instante pra virar controle)
    aim: rnd(0.08, 0.28), // erro de mira do tranco (radianos)
    target: null,
    keepUntil: 0,
    wob: Math.random() * TAU,
  };
}

function botThink(f, sim, dt) {
  const ai = f.ai;
  ai.think -= dt;
  if (ai.think > 0) return;
  ai.think = ai.react + Math.random() * 0.06;

  const d0 = Math.hypot(f.x, f.y);
  const safeR = sim.safeRadius();
  const iced = !!sim.ice && sim.ice.owner !== f.id;
  let tx = 0;
  let ty = 0;

  // 0) Aquecimento: anda devagar pro meio, sem tranco.
  if (sim.t < ai.wake) {
    f.ix = d0 > 1e-3 ? (-f.x / d0) * 0.35 : 0;
    f.iy = d0 > 1e-3 ? (-f.y / d0) * 0.35 : 0;
    return;
  }

  // 1) Escolhe um alvo: o mais perto (com um pouco de teimosia pra não ficar trocando).
  if (!ai.target || !ai.target.alive || sim.clock > ai.keepUntil) {
    let best = null;
    let bd = Infinity;
    for (const o of sim.fs) {
      if (o === f || !o.alive) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y) * rnd(0.85, 1.15);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    ai.target = best;
    ai.keepUntil = sim.clock + rnd(1, 2.4);
  }
  const T = ai.target;
  if (T) {
    const tl = Math.hypot(T.x, T.y) || 1;
    const ox = T.x / tl;
    const oy = T.y / tl;
    // Chega pelo lado de dentro (entre o alvo e o centro) pra empurrar ele PRA FORA.
    const inside = d0 < tl - 4;
    const gx = inside ? T.x : T.x - ox * (f.r + T.r) * 1.1;
    const gy = inside ? T.y : T.y - oy * (f.r + T.r) * 1.1;
    const dx = gx - f.x;
    const dy = gy - f.y;
    const dl = Math.hypot(dx, dy) || 1;
    tx += (dx / dl) * ai.aggr;
    ty += (dy / dl) * ai.aggr;

    const dist = Math.hypot(T.x - f.x, T.y - f.y) || 1;
    if (f.cd <= 0 && dist < f.r + T.r + 26 * (0.7 + ai.aggr * 0.6)) {
      const ux = (T.x - f.x) / dist;
      const uy = (T.y - f.y) / dist;
      const outward = ux * ox + uy * oy; // 1 = empurrando o alvo direto pra borda
      const land = Math.hypot(f.x + ux * 40, f.y + uy * 40);
      const safe = land < safeR - f.r * 0.5 || dist < f.r + T.r + 6;
      if (safe && !sim.inDanger(f.x + ux * 40, f.y + uy * 40, 0) && (outward > 0.15 || Math.random() < 0.22 * ai.aggr)) {
        const err = rnd(-ai.aim, ai.aim); // ninguém é perfeito, nem robô
        f.ix = ux * Math.cos(err) - uy * Math.sin(err);
        f.iy = ux * Math.sin(err) + uy * Math.cos(err);
        f.dashReq = true;
        return;
      }
    }
  }

  // 2) Power-up perto? Vai buscar.
  let item = null;
  let idist = 60;
  for (const it of sim.items) {
    const d = Math.hypot(it.x - f.x, it.y - f.y);
    if (d < idist && !sim.inDanger(it.x, it.y, 0.05)) {
      idist = d;
      item = it;
    }
  }
  if (item) {
    const w = 1.4 * (1 - idist / 60) + 0.4;
    tx += ((item.x - f.x) / (idist || 1)) * w;
    ty += ((item.y - f.y) / (idist || 1)) * w;
  }

  // 3) Borda: quanto mais perto (e mais rápido), mais puxa pro centro.
  const sp = Math.hypot(f.vx, f.vy);
  const margin = (f.r * 2.6 + sp * 0.2) * (iced ? 1.8 : 1);
  const edge = safeR - d0;
  if (edge < margin && d0 > 1e-3) {
    const w = (1 - edge / margin) * 3.2;
    tx -= (f.x / d0) * w;
    ty -= (f.y / d0) * w;
  }
  // 4) Fatia piscando ou buraco: corre pro miolo.
  if (sim.inDanger(f.x, f.y) && d0 > 1e-3) {
    tx -= (f.x / d0) * 3;
    ty -= (f.y / d0) * 3;
  }
  // 5) Esquiva de quem vem de tranco na minha direção.
  for (const o of sim.fs) {
    if (o === f || !o.alive || o.dashT <= 0) continue;
    const rx = f.x - o.x;
    const ry = f.y - o.y;
    const rd = Math.hypot(rx, ry);
    const ov = Math.hypot(o.vx, o.vy);
    if (rd > 50 || rd < 1e-3 || ov < 1) continue;
    if ((o.vx * rx + o.vy * ry) / (rd * ov) > 0.75 && Math.random() < 0.6) {
      // de lado, escolhendo o lado que aponta pro centro
      let px = -o.vy / ov;
      let py = o.vx / ov;
      if (px * -f.x + py * -f.y < 0) {
        px = -px;
        py = -py;
      }
      tx += px * 2;
      ty += py * 2;
    }
  }
  // 6) Um pouco de ruído pra não parecerem robôs (ironia).
  ai.wob += 0.7;
  tx += Math.cos(ai.wob) * 0.15;
  ty += Math.sin(ai.wob * 1.3) * 0.15;
  const l = Math.hypot(tx, ty);
  if (l > 1) {
    tx /= l;
    ty /= l;
  }
  f.ix = Number.isFinite(tx) ? tx : 0;
  f.iy = Number.isFinite(ty) ? ty : 0;
}

// ───────── desenho (canvas) ─────────
function platformPath(c, sim) {
  const R = sim.R;
  const h = sim.hub;
  const gone = sim.slices.filter((s) => s.gone).sort((a, b) => a.a - b.a);
  c.beginPath();
  if (!gone.length || R <= h + 0.5) {
    c.arc(0, 0, Math.max(0, R), 0, TAU);
    return;
  }
  const S = gone.map((s) => s.a - s.hw);
  const E = gone.map((s) => s.a + s.hw);
  c.moveTo(Math.cos(E[0]) * R, Math.sin(E[0]) * R);
  for (let i = 0; i < gone.length; i++) {
    const j = (i + 1) % gone.length;
    const s1 = j ? S[j] : S[0] + TAU;
    const e1 = j ? E[j] : E[0] + TAU;
    c.arc(0, 0, R, E[i], s1);
    c.lineTo(Math.cos(s1) * h, Math.sin(s1) * h);
    c.arc(0, 0, h, s1, e1);
    c.lineTo(Math.cos(e1) * R, Math.sin(e1) * R);
  }
  c.closePath();
}

function wedgePath(c, s, h, R) {
  c.beginPath();
  c.arc(0, 0, R, s.a - s.hw, s.a + s.hw);
  c.arc(0, 0, h, s.a + s.hw, s.a - s.hw, true);
  c.closePath();
}

/** Emoji nítido: desenha em pixels de tela, não em unidades do mundo. */
function emojiAt(c, x, y, size, text, sc) {
  if (sc <= 0) return;
  c.save();
  c.translate(x, y);
  c.scale(1 / sc, 1 / sc);
  c.font = `${Math.max(1, size * sc).toFixed(1)}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 0, 0);
  c.restore();
}

function drawWorld(sim, bg, fx, W, H, dpr) {
  const sc = W / (2 * sim.R0 * VIEW);
  for (const c of [bg, fx]) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(dpr * sc, 0, 0, dpr * sc, (dpr * W) / 2, (dpr * H) / 2);
  }
  if (!(sc > 0)) return;
  const t = sim.clock;
  const R = Math.max(0, sim.R);

  // Poço escuro + marca do tamanho original
  const grd = bg.createRadialGradient(0, 0, sim.R0 * 0.3, 0, 0, sim.R0 * 1.14);
  grd.addColorStop(0, 'rgba(10,4,25,0.85)');
  grd.addColorStop(1, 'rgba(10,4,25,0)');
  bg.fillStyle = grd;
  bg.beginPath();
  bg.arc(0, 0, sim.R0 * 1.14, 0, TAU);
  bg.fill();
  bg.setLineDash([3, 4]);
  bg.lineWidth = 0.8;
  bg.strokeStyle = 'rgba(255,255,255,0.18)';
  bg.beginPath();
  bg.arc(0, 0, sim.R0, 0, TAU);
  bg.stroke();
  bg.setLineDash([]);

  // Fatias despencando
  for (const s of sim.slices) {
    if (!s.gone || s.goneT >= 0.8 || R <= sim.hub) continue;
    const p = s.goneT / 0.8;
    const mid = (sim.hub + R) / 2;
    const cx = Math.cos(s.a) * mid;
    const cy = Math.sin(s.a) * mid;
    bg.save();
    bg.globalAlpha = 1 - p;
    bg.translate(cx, cy + p * 8);
    bg.scale(1 - p * 0.55, 1 - p * 0.55);
    bg.translate(-cx, -cy);
    wedgePath(bg, s, sim.hub, R);
    bg.fillStyle = '#d9b47a';
    bg.fill();
    bg.lineWidth = 1.2;
    bg.strokeStyle = INK;
    bg.stroke();
    bg.restore();
  }

  if (R > 0.5) {
    // sombra sólida (estilo da casa)
    bg.save();
    bg.translate(0, sim.R0 * 0.05);
    platformPath(bg, sim);
    bg.fillStyle = INK;
    bg.fill();
    bg.restore();
    // chão
    platformPath(bg, sim);
    bg.fillStyle = sim.ice ? '#cdf3ff' : '#f6dfae';
    bg.fill();
    bg.save();
    bg.clip();
    // anel de palha (tawara) e linhas de largada
    bg.lineWidth = 2.6;
    bg.strokeStyle = sim.ice ? '#7fd3f0' : '#c98a4b';
    bg.beginPath();
    bg.arc(0, 0, sim.R0 * 0.82, 0, TAU);
    bg.stroke();
    bg.setLineDash([2, 3]);
    bg.lineWidth = 0.7;
    bg.strokeStyle = sim.ice ? '#ffffff' : '#a8692e';
    bg.beginPath();
    bg.arc(0, 0, sim.R0 * 0.82, 0, TAU);
    bg.stroke();
    bg.setLineDash([]);
    bg.fillStyle = '#fffdf7';
    bg.strokeStyle = INK;
    bg.lineWidth = 0.6;
    for (const sx of [-1, 1]) {
      bg.beginPath();
      bg.rect(sx * sim.R0 * 0.1 - 0.8, -sim.R0 * 0.06, 1.6, sim.R0 * 0.12);
      bg.fill();
      bg.stroke();
    }
    // gelo: brilhinhos
    if (sim.ice) {
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996;
        const rr = Math.sqrt((i + 0.5) / 14) * R * 0.95;
        const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.7);
        bg.globalAlpha = tw;
        bg.fillStyle = '#ffffff';
        bg.beginPath();
        bg.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.6 + tw * 0.9, 0, TAU);
        bg.fill();
      }
      bg.globalAlpha = 1;
    }
    // morte súbita: chão pulsando
    if (sim.flags.sudden) {
      bg.fillStyle = `rgba(255,61,61,${0.12 + 0.1 * Math.sin(t * 9)})`;
      bg.fillRect(-R, -R, R * 2, R * 2);
    }
    // fatias piscando antes de sumir
    for (const s of sim.slices) {
      if (s.gone) continue;
      const blink = 0.5 + 0.5 * Math.sin(s.t * (7 + s.t * 7));
      wedgePath(bg, s, sim.hub, R + 2);
      bg.fillStyle = `rgba(255,61,61,${0.22 + 0.4 * blink})`;
      bg.fill();
    }
    // borda desmoronando enquanto encolhe
    if (sim.mode === 'fight' && sim.t > sim.sch.grace) {
      bg.lineWidth = 3;
      bg.strokeStyle = `rgba(255,92,92,${0.35 + 0.25 * Math.sin(t * 10)})`;
      bg.beginPath();
      bg.arc(0, 0, Math.max(0, R - 1.5), 0, TAU);
      bg.stroke();
    }
    bg.restore();
    platformPath(bg, sim);
    bg.lineWidth = 1.6;
    bg.strokeStyle = INK;
    bg.stroke();
    for (const s of sim.slices) {
      if (s.gone) continue;
      const mid = (sim.hub + R) / 2;
      const pulse = 1 + 0.15 * Math.sin(t * 12);
      emojiAt(bg, Math.cos(s.a) * mid, Math.sin(s.a) * mid, 9 * pulse, '⚠️', sc);
    }
  }

  // rastro do tranco
  for (const tr of sim.trails) {
    const k = tr.life / 0.28;
    bg.globalAlpha = 0.45 * k;
    bg.fillStyle = tr.color;
    bg.beginPath();
    bg.arc(tr.x, tr.y, tr.r * (0.5 + 0.5 * k), 0, TAU);
    bg.fill();
  }
  bg.globalAlpha = 1;

  // power-ups no chão
  for (const it of sim.items) {
    const left = it.ttl - it.t;
    if (left < 2 && Math.floor(left * 8) % 2) continue;
    const info = PU[it.kind];
    const r = 6.2 * (1 + 0.08 * Math.sin(t * 6 + it.x)) * Math.min(1, it.t * 4 + 0.05);
    bg.fillStyle = 'rgba(27,16,51,.35)';
    bg.beginPath();
    bg.arc(it.x, it.y + 1.4, r, 0, TAU);
    bg.fill();
    bg.fillStyle = info.color;
    bg.beginPath();
    bg.arc(it.x, it.y, r, 0, TAU);
    bg.fill();
    bg.lineWidth = 1.1;
    bg.strokeStyle = INK;
    bg.stroke();
    emojiAt(bg, it.x, it.y + 0.3, r * 1.2, info.emoji, sc);
  }

  // sombras, ímã e recarga do tranco
  for (const f of sim.fs) {
    if (f.fallT >= FALL_S) continue;
    const k = f.alive ? 1 : Math.max(0, 1 - f.fallT / (FALL_S * 0.5));
    if (k > 0) {
      bg.fillStyle = 'rgba(27,16,51,0.32)';
      bg.beginPath();
      bg.ellipse(f.x + 1, f.y + f.r * 0.5, f.r * 1.05 * k, f.r * 0.7 * k, 0, 0, TAU);
      bg.fill();
    }
    if (!f.alive) continue;
    if (f.pu.magnet > 0) {
      for (let i = 0; i < 3; i++) {
        const p = (t * 1.4 + i / 3) % 1;
        bg.globalAlpha = (1 - p) * 0.55;
        bg.lineWidth = 1.2;
        bg.strokeStyle = PU.magnet.color;
        bg.beginPath();
        bg.arc(f.x, f.y, f.r + (1 - p) * (MAG_R - f.r), 0, TAU);
        bg.stroke();
      }
      bg.globalAlpha = 1;
    }
    if (f.cd > 0 && sim.mode !== 'ready') {
      const p = 1 - f.cd / (f.cdMax || DASH_CD);
      bg.lineWidth = 1.3;
      bg.strokeStyle = 'rgba(255,255,255,0.8)';
      bg.beginPath();
      bg.arc(f.x, f.y, f.r + 2.6, -Math.PI / 2, -Math.PI / 2 + clamp(p, 0, 1) * TAU);
      bg.stroke();
    }
  }

  // FX por cima das caixinhas: estrelinhas, poeira, anéis de impacto
  for (const p of sim.parts) {
    fx.globalAlpha = clamp((p.life / p.max) * 1.5, 0, 1);
    fx.fillStyle = p.color;
    if (p.kind === 1) {
      fx.save();
      fx.translate(p.x, p.y);
      fx.rotate(p.rot);
      fx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? p.size * 0.45 : p.size;
        const a = (i / 10) * TAU;
        if (i) fx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else fx.moveTo(rr, 0);
      }
      fx.closePath();
      fx.fill();
      fx.restore();
    } else if (p.kind === 2) {
      const s = p.size * (0.4 + 0.6 * (p.life / p.max));
      fx.save();
      fx.translate(p.x, p.y);
      fx.rotate(p.rot);
      fx.fillRect(-s / 2, -s / 2, s, s);
      fx.restore();
    } else {
      fx.beginPath();
      fx.arc(p.x, p.y, p.size * (p.life / p.max), 0, TAU);
      fx.fill();
    }
  }
  for (const r of sim.rings) {
    const p = 1 - r.life / 0.4;
    fx.globalAlpha = 1 - p;
    fx.lineWidth = 1.6;
    fx.strokeStyle = r.color;
    fx.beginPath();
    fx.arc(r.x, r.y, 2 + p * r.max, 0, TAU);
    fx.stroke();
  }
  fx.globalAlpha = 1;
}

/** Posiciona as caixinhas (DOM) em cima do canvas. */
function placePlayers(sim, els, W, H) {
  const sc = W / (2 * sim.R0 * VIEW);
  const D = Math.max(1, 2 * PR * sc);
  const over = sim.mode === 'ending' || sim.mode === 'over';
  for (const f of sim.fs) {
    const el = els[f.id];
    if (!el) continue;
    const body = el.firstElementChild;
    if (el._d !== D) {
      el.style.width = `${D}px`;
      el.style.height = `${D}px`;
      el._d = D;
    }
    const px = W / 2 + f.x * sc - D / 2;
    const py = H / 2 + f.y * sc - D / 2;
    el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
    el.style.zIndex = f.alive ? String(1000 + Math.round(f.y * 4)) : '1';
    el.style.visibility = f.fallT >= FALL_S ? 'hidden' : 'visible';
    let s = f.r / PR;
    let rot = clamp(f.vx * 0.05, -12, 12);
    let op = 1;
    if (!f.alive && f.fallT >= 0) {
      const p = Math.min(1, f.fallT / FALL_S);
      s *= 1 - 0.88 * p;
      rot += f.spin * p;
      op = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
    }
    const sq = f.squash;
    if (body) {
      body.style.transform = `scale(${(s * (1 + 0.22 * sq)).toFixed(3)},${(s * (1 - 0.22 * sq)).toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
      body.style.opacity = String(clamp(op, 0, 1));
    }
    el.classList.toggle('dash', f.dashT > 0);
    el.classList.toggle('out', !f.alive);
    el.classList.toggle('win', over && f === sim.winner);
    el.classList.toggle('iced', f.alive && !!sim.ice && sim.ice.owner !== f.id);
    el.classList.toggle('giant', f.alive && f.pu.giant > 0);
  }
}

// ───────── componente da arena ─────────
function Arena({ s, g, v }) {
  const live = useRef(null);
  live.current = { s, g, v };
  const boxRef = useRef(null);
  const worldRef = useRef(null);
  const bgRef = useRef(null);
  const fxRef = useRef(null);
  const els = useRef({});
  const simRef = useRef(null);
  const [, setVer] = useState(0);
  const [cd, setCd] = useState(null);
  const [banner, setBanner] = useState(null);
  const [feed, setFeed] = useState([]);
  const [sec, setSec] = useState(0);
  const narr = useStore(narration);

  if (!simRef.current) {
    const fighters = (v.fighters ?? [])
      .map((id) => P(s, id))
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot }));
    simRef.current = new Sim(fighters, v.mode);
  }
  const sim = simRef.current;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let fightPid = null; // phaseId da luta que esta TV está simulando
    let sentPid = null; // phaseId pro qual o roundEnd já saiu (uma vez só)
    let cdNow = null;
    let secNow = -1;
    let seq = 0;
    let alive = true;
    const timers = new Set();
    const bgc = bgRef.current.getContext('2d');
    const fxc = fxRef.current.getContext('2d');
    const bump = () => setVer((x) => x + 1);
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (alive) fn();
      }, ms);
      timers.add(id);
    };
    const show = (text, kind = '', ms = 1300) => {
      const k = ++seq;
      setBanner({ text, kind, k });
      later(() => setBanner((b) => (b && b.k === k ? null : b)), ms);
    };
    const addFeed = (text) => setFeed((cur) => [...cur.slice(-3), { k: ++seq, text }]);
    const myFight = () => {
      const { g } = live.current;
      return g.phase === 'fight' && g.phaseId === fightPid;
    };
    const sendEnd = () => {
      if (sentPid === fightPid || !myFight()) return;
      sentPid = fightPid;
      socket.emit('host:cmd', { cmd: 'game', type: 'roundEnd', phaseId: fightPid, ...sim.result() });
    };

    sim.hooks = {
      onOut: (f, by) => {
        if (myFight()) socket.emit('host:cmd', { cmd: 'game', type: 'out', phaseId: fightPid, id: f.id, by });
        addFeed(by ? `💥 ${sim.byId[by]?.name ?? '?'} derrubou ${f.name}` : `💀 ${f.name} caiu sozinho`);
        if (sim.aliveCount() === 2 && sim.n > 2) show('MANO A MANO!', 'duel', 1500);
        bump();
      },
      onEvent: addFeed,
      onChange: bump,
      onSudden: () => {
        show('MORTE SÚBITA!', 'sudden', 1900);
        audio.sfx('airhorn');
        addFeed('☠️ Morte súbita: o chão vai sumir de vez!');
      },
      onEnd: (w) => {
        const lastOut = sim.byId[sim.elim[sim.elim.length - 1]];
        show(w ? `${w.name} VENCEU!` : lastOut ? `${lastOut.name} CAIU POR ÚLTIMO!` : 'FIM!', 'end', 2400);
        audio.sfx('gong');
        bump();
      },
    };

    const onIn = (m) => {
      const f = m && sim.byId[m.id];
      if (!f || f.bot) return;
      let x = Number(m.x);
      let y = Number(m.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) x = y = 0;
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      f.ix = x;
      f.iy = y;
      if (m.b && sim.mode !== 'ready') f.dashReq = true;
    };
    socket.on('in', onIn);

    const resize = () => {
      const box = boxRef.current;
      if (!box) return;
      W = box.clientWidth;
      H = box.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [bgRef.current, fxRef.current]) {
        c.width = Math.max(1, Math.round(W * dpr));
        c.height = Math.max(1, Math.round(H * dpr));
      }
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(boxRef.current);
    else window.addEventListener('resize', resize);

    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const real = clamp((ts - last) / 1000, 0, 0.05);
      last = ts;
      const { g, v } = live.current;

      // Sincroniza com a fase do servidor
      if (g.phase === 'fight' && sim.mode === 'ready') {
        fightPid = g.phaseId;
        sim.start();
        cdNow = null;
        setCd(null);
        show('VAI!', 'go', 1000);
        audio.sfx('countdown', { go: true });
        audio.sfx('airhorn');
      } else if (g.phase !== 'fight' && g.phase !== 'countdown' && sim.mode !== 'over') {
        sim.mode = 'over';
        if (!sim.winner) sim.winner = sim.fs.find((f) => f.alive) ?? null;
        for (const f of sim.fs) {
          f.ix = f.iy = 0;
          f.dashReq = false;
        }
        setBanner(null); // o cartão de resultado ocupa o centro
        bump();
      }
      if (sim.mode === 'ready' && g.phase === 'countdown') {
        const left = (v.goAt ?? 0) - now();
        const n = left > 3000 ? 'title' : left > 0 ? Math.ceil(left / 1000) : 'ready';
        if (n !== cdNow) {
          cdNow = n;
          setCd(n);
          if (typeof n === 'number') audio.sfx('countdown');
        }
      }

      if (!g.paused) {
        let dt = real;
        if (sim.slow > 0) {
          sim.slow -= real;
          dt *= 0.3;
        }
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 10) {
          sim.step(STEP);
          acc -= STEP;
          steps++;
        }
        if (steps >= 10) acc = 0;
        if (sim.mode === 'ending') {
          sim.endT += real;
          if (sim.endT >= END_DELAY) sendEnd();
        }
        const sNow = Math.floor(sim.t);
        if (sNow !== secNow) {
          secNow = sNow;
          setSec(sNow);
        }
      }

      // Desenha
      if (W > 0 && H > 0) {
        drawWorld(sim, bgc, fxc, W, H, dpr);
        placePlayers(sim, els.current, W, H);
        const world = worldRef.current;
        if (world) {
          const sc = W / (2 * sim.R0 * VIEW);
          const amp = sim.shake * sc * 0.3;
          world.style.transform =
            amp > 0.3 ? `translate3d(${((Math.random() * 2 - 1) * amp).toFixed(1)}px,${((Math.random() * 2 - 1) * amp).toFixed(1)}px,0) rotate(${((Math.random() * 2 - 1) * amp * 0.03).toFixed(2)}deg)` : '';
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      socket.off('in', onIn);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      sim.hooks = {};
    };
  }, []);

  // Comemoração quando o resultado da rodada chega
  useEffect(() => {
    if (g.phase !== 'roundResult') return;
    audio.sfx('tada');
    fxBus.emit({ type: 'confetti', data: {} });
  }, [g.phase]);

  const mode = v.mode ?? {};
  const aliveN = sim.aliveCount();
  const status = (() => {
    if (sim.mode === 'ready') return 'Prontos…';
    if (sim.mode !== 'fight') return 'Fim da luta!';
    const S = sim.sch;
    if (sim.t < S.grace) return `Encolhe em ${Math.ceil(S.grace - sim.t)}s`;
    if (sim.t < S.sudden) return S.sudden - sim.t <= 10 ? `MORTE SÚBITA em ${Math.ceil(S.sudden - sim.t)}s` : 'A plataforma tá encolhendo!';
    return '☠️ MORTE SÚBITA';
  })();
  const dead = [...sim.elim].reverse().map((id) => sim.byId[id]);
  const roster = [...sim.fs.filter((f) => f.alive), ...dead];

  return html`<div class=${cls('ar-root', `ar-${g.phase}`)}>
    <div class="ar-roster">
      <div class="ar-roster-h">Na arena <b>${aliveN}/${sim.n}</b></div>
      ${roster.map((f) => {
        const p = P(s, f.id) ?? f;
        const place = f.alive ? null : sim.n - sim.elim.indexOf(f.id);
        const pus = f.alive ? [...PU_KINDS.filter((k) => k !== 'ice' && f.pu[k] > 0), ...(sim.ice?.owner === f.id ? ['ice'] : [])] : [];
        return html`<div class=${cls('ar-row', !f.alive && 'dead', sim.winner === f && 'win')} key=${f.id} style=${`--pc:${f.color}`}>
          <${Avatar} p=${p} size=${40} />
          <span class="ar-row-name">${f.name}</span>
          ${f.knocks ? html`<span class="ar-row-k">💥${f.knocks}</span>` : null}
          <span class="ar-row-st">${f.alive ? pus.map((k) => PU[k].emoji).join('') : `💀 ${place}º`}</span>
        </div>`;
      })}
    </div>

    <div class="ar-box" ref=${boxRef}>
      <div class="ar-world" ref=${worldRef}>
        <canvas class="ar-cv ar-bg" ref=${bgRef} />
        <div class="ar-players">
          ${sim.fs.map((f) => {
            const p = P(s, f.id) ?? { id: f.id, name: f.name, color: f.color, face: 1 };
            return html`<div
              class="ar-p"
              key=${f.id}
              ref=${(el) => {
                els.current[f.id] = el;
              }}
            >
              <div class="ar-body">
                <div class="ar-disc" style=${`--pc:${f.color}`} />
                <div class="ar-av"><${Avatar} p=${p} size=${64} /></div>
              </div>
              <div class="ar-tag" style=${`--pc:${f.color}`}>${f.name}</div>
            </div>`;
          })}
        </div>
        <canvas class="ar-cv ar-fx" ref=${fxRef} />
      </div>
      <div class="ar-over">
        ${g.phase === 'countdown'
          ? cd === 'title' || cd === null
            ? html`<div class="ar-title">
                <div class="ar-title-n">RODADA ${v.round}${v.total ? html`<small>/${v.total}</small>` : null}</div>
                <div class="ar-title-m">${mode.emoji} ${mode.name}</div>
                <div class="ar-title-d">${mode.desc}</div>
                ${mode.mult > 1 ? html`<div class="ar-title-x">PONTOS x1,5</div>` : null}
              </div>`
            : html`<div class=${cls('ar-count', cd === 'ready' && 'small')} key=${String(cd)}>${cd === 'ready' ? 'PRONTOS?' : cd}</div>`
          : null}
        ${banner ? html`<div class=${cls('ar-banner', banner.kind)} key=${banner.k}>${banner.text}</div>` : null}
        ${g.phase === 'roundResult' ? html`<${RoundResult} s=${s} v=${v} />` : null}
      </div>
    </div>

    <div class="ar-side">
      <div class="ar-card ar-round">
        <div class="ar-round-n">RODADA ${v.round}/${v.total}</div>
        <div class="ar-round-m">${mode.emoji} ${mode.name}</div>
        ${mode.mult > 1 ? html`<div class="ar-round-x">pontos x1,5</div>` : null}
      </div>
      <div class=${cls('ar-card', 'ar-clock', sim.flags.sudden && 'sudden')}>
        <span class="ar-clock-t">⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</span>
        <span class="ar-clock-s">${status}</span>
      </div>
      <div class="ar-feed">
        ${feed.map((it) => html`<div class="ar-feed-i" key=${it.k}>${it.text}</div>`)}
      </div>
      <div class="ar-legend">
        ${PU_KINDS.map((k) => html`<div class="ar-leg" style=${`--puc:${PU[k].color}`}><i>${PU[k].emoji}</i><span><b>${PU[k].name}</b><small>${PU[k].desc}</small></span></div>`)}
      </div>
      ${narr.text ? html`<div class=${cls('ar-narr', narr.talking && 'talking')} key=${narr.id}>🎙️ ${narr.text}</div>` : null}
    </div>
  </div>`;
}

function RoundResult({ s, v }) {
  const rows = v.rows ?? [];
  const top = rows[0];
  const wp = top ? P(s, top.id) : null;
  const rest = rows.slice(1);
  return html`<div class="ar-result">
    <div class="ar-res-h">${v.source === 'timeout' ? '⏱ Tempo esgotado!' : '🏆 Última caixinha em pé'}</div>
    ${wp
      ? html`<div class="ar-res-win" style=${`--pc:${wp.color}`}>
          <div class="ar-res-crown">👑</div>
          <${Avatar} p=${wp} size=${110} />
          <div class="ar-res-wn">${wp.name}</div>
          <div class="ar-res-wp">+${fmt(top.pts)}${top.knocks ? html` <small>💥${top.knocks}</small>` : null}</div>
        </div>`
      : null}
    <div class=${cls('ar-res-list', rest.length > 5 && 'two')}>
      ${rest.map((r, i) => {
        const p = P(s, r.id);
        return html`<div class="ar-res-row" key=${r.id} style=${`--pc:${p?.color ?? '#999'};--i:${i}`}>
          <b>${r.place}º</b>
          <${Avatar} p=${p} size=${34} />
          <span class="ar-res-n">${p?.name ?? '???'}</span>
          ${r.knocks ? html`<em>💥${r.knocks}</em>` : null}
          <span class="ar-res-p">+${fmt(r.pts)}</span>
        </div>`;
      })}
    </div>
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'countdown':
    case 'fight':
    case 'roundResult':
      return html`<${Arena} key=${`r${v.round}`} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${v.final ? 'Placar final' : `Placar · Rodada ${v.round}`} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  introMusic: 'arena',
  music: (phase) => (phase === 'scores' ? 'results' : 'arena'),
  roundLabel: (g) => (g.view?.round ? `Rodada ${g.view.round}/${g.view.total} · ${g.view.mode?.name ?? ''}${g.view.mode?.mult > 1 ? ' · pontos x1,5' : ''}` : null),
  theme: (g) => ({ energy: g.phase === 'fight' ? 1 : 0.6 }),
  mood: (g) => (g.phase === 'roundResult' ? 'hype' : 'normal'),
  hideMascot: (g) => g.phase === 'countdown' || g.phase === 'fight' || g.phase === 'roundResult',
};
