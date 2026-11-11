// Motor de áudio 100% sintetizado: efeitos sonoros e trilhas procedurais.
// Nenhum arquivo de áudio — tudo nasce de osciladores e ruído no Web Audio.

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function freq(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 440;
  const midi = NOTE[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function load(k, d) {
  try {
    const v = localStorage.getItem(`bobo:${k}`);
    return v == null ? d : Number(v);
  } catch {
    return d;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(`bobo:${k}`, String(v));
  } catch {}
}

// ───────── trilhas ─────────
// Notação: bateria em strings de 16 passos ('x' forte, 'o' fraco, '.' pausa).
// Melodias: arrays de 16 posições com nota ou null. Acordes por compasso.

const TRACKS = {
  lobby: {
    bpm: 108,
    swing: 0.12,
    drums: {
      kick: ['x.....x...x.....', 'x.....x...x...o.'],
      snare: ['....x.......x...'],
      hat: ['x.o.x.o.x.o.x.oo'],
      shaker: ['.o.o.o.o.o.o.o.o'],
    },
    chords: [
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4', 'F4'],
    ],
    chordRhythm: '..x...x...x..x..',
    bass: [
      ['C2', null, null, 'C3', null, null, 'G2', null, null, null, 'C3', null, 'B2', null, 'G2', null],
      ['A1', null, null, 'A2', null, null, 'E2', null, null, null, 'A2', null, 'G2', null, 'E2', null],
      ['F1', null, null, 'F2', null, null, 'C2', null, null, null, 'F2', null, 'E2', null, 'C2', null],
      ['G1', null, null, 'G2', null, null, 'D2', null, null, null, 'G2', null, 'F2', null, 'D2', 'B1'],
    ],
    lead: [
      [null, null, 'E5', null, 'G5', null, null, 'A5', null, 'G5', null, null, 'E5', null, null, null],
      [null, null, 'C5', null, 'E5', null, null, 'G5', null, 'E5', null, 'D5', null, 'C5', null, null],
      [null, null, 'A4', null, 'C5', null, null, 'F5', null, 'E5', null, null, 'C5', null, null, null],
      [null, null, 'B4', null, 'D5', null, 'F5', null, 'G5', null, null, 'F5', 'D5', null, 'B4', null],
    ],
    leadInst: 'pluck',
    padInst: 'keys',
  },
  chill: {
    bpm: 84,
    swing: 0.22,
    drums: {
      kick: ['x.......x.x.....', 'x.......x.....o.'],
      snare: ['....x.......x...'],
      hat: ['x.x.x.x.x.x.x.xo'],
    },
    chords: [
      ['D4', 'F4', 'A4', 'C5'],
      ['G3', 'B3', 'D4', 'F4'],
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4'],
    ],
    chordRhythm: 'x...............',
    bass: [
      ['D2', null, null, null, null, null, null, 'A1', 'D2', null, null, null, null, null, null, null],
      ['G1', null, null, null, null, null, null, 'D2', 'G1', null, null, null, null, null, 'F2', null],
      ['C2', null, null, null, null, null, null, 'G1', 'C2', null, null, null, null, null, null, null],
      ['A1', null, null, null, null, null, null, 'E2', 'A1', null, null, null, 'G1', null, null, null],
    ],
    lead: [
      [null, null, null, null, null, null, 'A5', null, 'F5', null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, 'D5', null, 'F5', null, 'G5', null, null, null],
      [null, null, null, null, 'E5', null, null, null, 'G5', null, null, null, null, null, 'B4', null],
      [null, null, null, null, null, null, null, null, 'C5', null, 'E5', null, null, null, null, null],
    ],
    leadInst: 'bell',
    padInst: 'pad',
  },
  tension: {
    bpm: 124,
    swing: 0,
    drums: {
      kick: ['x...x...x...x...'],
      snare: ['................', '............x.x.'],
      hat: ['..x...x...x...x.'],
      tick: ['xxxxxxxxxxxxxxxx'],
    },
    chords: [
      ['A3', 'C4', 'E4'],
      ['A3', 'C4', 'E4'],
      ['F3', 'A3', 'C4'],
      ['G3', 'B3', 'E4'],
    ],
    chordRhythm: 'x...............',
    bass: [
      ['A1', 'A1', 'A2', 'A1', 'A1', 'A1', 'A2', 'A1', 'A1', 'A1', 'A2', 'A1', 'A1', 'A1', 'A2', 'A1'],
      ['A1', 'A1', 'A2', 'A1', 'A1', 'A1', 'A2', 'A1', 'A1', 'A1', 'A2', 'A1', 'C2', 'C2', 'C3', 'C2'],
      ['F1', 'F1', 'F2', 'F1', 'F1', 'F1', 'F2', 'F1', 'F1', 'F1', 'F2', 'F1', 'F1', 'F1', 'F2', 'F1'],
      ['E1', 'E1', 'E2', 'E1', 'E1', 'E1', 'E2', 'E1', 'G1', 'G1', 'G2', 'G1', 'G#1', 'G#1', 'G#2', 'G#1'],
    ],
    lead: [],
    padInst: 'pad',
  },
  results: {
    bpm: 118,
    swing: 0.08,
    drums: {
      kick: ['x...x...x...x...'],
      snare: ['....x.......x...'],
      clap: ['....x.......x..x'],
      hat: ['.xx..xx..xx..xx.'],
    },
    chords: [
      ['F4', 'A4', 'C5'],
      ['G4', 'B4', 'D5'],
      ['E4', 'G4', 'C5'],
      ['A4', 'C5', 'E5'],
    ],
    chordRhythm: 'x..x..x...x..x..',
    bass: [
      ['F2', null, 'F3', null, 'F2', null, 'F3', null, 'F2', null, 'F3', null, 'C3', null, 'A2', null],
      ['G2', null, 'G3', null, 'G2', null, 'G3', null, 'G2', null, 'G3', null, 'D3', null, 'B2', null],
      ['E2', null, 'E3', null, 'E2', null, 'E3', null, 'C2', null, 'C3', null, 'G2', null, 'E2', null],
      ['A2', null, 'A3', null, 'A2', null, 'A3', null, 'A2', null, 'G2', null, 'E2', null, 'C3', null],
    ],
    lead: [
      ['C6', null, 'A5', null, 'F5', null, 'A5', null, 'C6', null, null, 'D6', null, 'C6', null, null],
      ['B5', null, 'G5', null, 'D5', null, 'G5', null, 'B5', null, null, 'C6', null, 'B5', null, null],
      ['C6', null, 'G5', null, 'E5', null, 'G5', null, 'C6', null, 'E6', null, 'D6', null, 'C6', null],
      ['A5', null, 'E5', null, 'C5', null, 'E5', null, 'A5', null, null, 'B5', null, 'C6', null, null],
    ],
    leadInst: 'square',
    padInst: 'brass',
  },
  spooky: {
    bpm: 72,
    swing: 0.1,
    drums: {
      kick: ['x.........x.....'],
      tick: ['x...x...x...x...'],
    },
    chords: [
      ['D3', 'F3', 'A3'],
      ['D3', 'F3', 'G#3'],
      ['C#3', 'E3', 'A3'],
      ['D3', 'F3', 'Bb3'],
    ],
    chordRhythm: 'x...............',
    bass: [
      ['D2', null, null, null, null, null, null, null, 'A1', null, null, null, null, null, null, null],
      ['D2', null, null, null, null, null, null, null, 'G#1', null, null, null, null, null, null, null],
      ['C#2', null, null, null, null, null, null, null, 'A1', null, null, null, null, null, null, null],
      ['D2', null, null, null, null, null, null, null, 'Bb1', null, null, null, 'A1', null, null, null],
    ],
    lead: [
      ['D6', null, null, 'A5', null, null, 'F5', null, null, 'E5', null, null, 'D5', null, null, null],
      [null, null, null, null, 'G#5', null, null, null, 'F5', null, null, null, null, null, null, null],
      ['E6', null, null, 'C#6', null, null, 'A5', null, null, 'G5', null, null, 'E5', null, null, null],
      [null, null, null, null, 'Bb5', null, null, 'A5', null, null, 'F5', null, 'D5', null, null, null],
    ],
    leadInst: 'musicbox',
    padInst: 'organ',
  },
  boombap: {
    bpm: 90,
    swing: 0.28,
    drums: {
      kick: ['x.........x..x..', 'x.......x.x.....'],
      snare: ['....x.......x...'],
      hat: ['x.x.x.x.x.x.x.x.'],
      scratch: ['................', '................', '................', '..............x.'],
    },
    chords: [
      ['E3', 'G3', 'B3', 'D4'],
      ['E3', 'G3', 'B3', 'D4'],
      ['C3', 'E3', 'G3', 'B3'],
      ['D3', 'F#3', 'A3', 'C4'],
    ],
    chordRhythm: 'x.....x.........',
    bass: [
      ['E1', null, null, null, null, null, null, null, null, null, 'E1', null, 'G1', null, null, null],
      ['E1', null, null, null, null, null, null, null, 'E1', null, 'B1', null, null, null, 'D2', null],
      ['C2', null, null, null, null, null, null, null, null, null, 'C2', null, 'E2', null, null, null],
      ['D2', null, null, null, null, null, null, null, 'D2', null, 'A1', null, 'F#1', null, null, null],
    ],
    lead: [],
    padInst: 'keys',
  },
  funk: {
    bpm: 130,
    swing: 0,
    drums: {
      // tamborzão: 3-3-2 com variação
      kick: ['x..x..x...x..x..', 'x..x..x...x..x.x'],
      snare: ['...x..x....x..x.'],
      clap: ['....x.......x...'],
      hat: ['x.xxx.xxx.xxx.xx'],
    },
    chords: [
      ['A3', 'C4', 'E4'],
      ['A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4'],
      ['F3', 'A3', 'C4'],
    ],
    chordRhythm: 'x......x..x.....',
    bass: [
      ['A1', null, null, 'A1', null, null, 'A2', null, null, null, 'A1', null, null, 'C2', null, null],
      ['A1', null, null, 'A1', null, null, 'A2', null, null, null, 'A1', null, null, 'E2', null, null],
      ['G1', null, null, 'G1', null, null, 'G2', null, null, null, 'G1', null, null, 'B1', null, null],
      ['F1', null, null, 'F1', null, null, 'F2', null, null, null, 'F1', null, null, 'G1', null, null],
    ],
    lead: [
      ['E5', null, 'E5', null, null, 'C5', null, null, 'D5', null, null, null, null, null, null, null],
      ['E5', null, 'E5', null, null, 'G5', null, null, 'A5', null, null, null, null, null, null, null],
      ['D5', null, 'D5', null, null, 'B4', null, null, 'G4', null, null, null, null, null, null, null],
      ['C5', null, 'C5', null, null, 'A4', null, null, 'C5', null, 'D5', null, null, null, null, null],
    ],
    leadInst: 'whistle',
    padInst: 'stab',
  },
  arena: {
    bpm: 150,
    swing: 0,
    drums: {
      kick: ['x...x...x...x...'],
      snare: ['....x.......x...', '....x.......x.xx'],
      hat: ['..x...x...x...x.'],
      tick: ['x.x.x.x.x.x.x.x.'],
    },
    chords: [
      ['E4', 'G4', 'B4'],
      ['C4', 'E4', 'G4'],
      ['D4', 'F#4', 'A4'],
      ['B3', 'D#4', 'F#4'],
    ],
    chordRhythm: 'x..x..x..x..x.x.',
    bass: [
      ['E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'G2', 'B2'],
      ['C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'E2', 'G2'],
      ['D2', 'D3', 'D2', 'D3', 'D2', 'D3', 'D2', 'D3', 'D2', 'D3', 'D2', 'D3', 'D2', 'D3', 'F#2', 'A2'],
      ['B1', 'B2', 'B1', 'B2', 'B1', 'B2', 'B1', 'B2', 'B1', 'B2', 'B1', 'B2', 'D#2', 'F#2', 'B2', 'D#3'],
    ],
    lead: [
      ['B5', null, 'G5', null, 'E5', null, 'G5', null, 'B5', null, 'C6', null, 'B5', null, 'G5', null],
      ['C6', null, 'G5', null, 'E5', null, 'G5', null, 'C6', null, 'D6', null, 'E6', null, null, null],
      ['A5', null, 'F#5', null, 'D5', null, 'F#5', null, 'A5', null, 'B5', null, 'A5', null, 'F#5', null],
      ['B5', null, 'F#5', null, 'D#5', null, 'F#5', null, 'B5', null, null, null, 'D#6', null, null, null],
    ],
    leadInst: 'square',
    padInst: 'stab',
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { music: load('music', 0.45), sfx: load('sfx', 0.85) };
    this.muted = load('muted', 0) === 1;
    this.track = null;
    this.trackName = null;
    this.ducked = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.vol.music;
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.vol.sfx;
      this.sfxBus.connect(this.master);
      // reverb
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(2.2, 2.8);
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 0.28;
      this.verbSend.connect(this.verb).connect(this.master);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    save(kind, v);
    if (!this.ctx) return;
    const bus = kind === 'music' ? this.musicBus : this.sfxBus;
    bus.gain.setTargetAtTime(kind === 'music' && this.ducked ? v * 0.35 : v, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    save('muted', m ? 1 : 0);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  duck(on, level = 0.35) {
    this.ducked = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? this.vol.music * level : this.vol.music, this.ctx.currentTime, on ? 0.08 : 0.4);
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ───────── primitivas ─────────

  env(g, t, { a = 0.005, d = 0.1, s = 0, r = 0.1, peak = 1, hold = 0 }) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (s > 0) {
      g.gain.setTargetAtTime(peak * s, t + a, d / 3);
      g.gain.setValueAtTime(peak * s, t + a + d + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
      return t + a + d + hold + r;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return t + a + d;
  }

  tone({ type = 'sine', f = 440, f2, t, dur = 0.2, a = 0.005, peak = 0.3, dest, detune = 0, glide, filter, q = 1, verb = 0, pan = 0 }) {
    const ctx = this.ctx;
    t = t ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + (glide ?? dur));
    o.detune.value = detune;
    const g = ctx.createGain();
    let node = o;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = filter.type ?? 'lowpass';
      fl.frequency.setValueAtTime(filter.f ?? 2000, t);
      if (filter.f2) fl.frequency.exponentialRampToValueAtTime(filter.f2, t + (filter.dur ?? dur));
      fl.Q.value = filter.q ?? q;
      node.connect(fl);
      node = fl;
    }
    node.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(dest ?? this.sfxBus);
    if (verb) {
      const vs = ctx.createGain();
      vs.gain.value = verb;
      out.connect(vs).connect(this.verbSend);
    }
    const end = this.env(g, t, { a, d: dur, peak });
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }

  noise({ t, dur = 0.2, a = 0.002, peak = 0.3, filter = { type: 'highpass', f: 6000 }, dest, verb = 0, rate = 1 }) {
    const ctx = this.ctx;
    t = t ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter();
    fl.type = filter.type;
    fl.frequency.setValueAtTime(filter.f, t);
    if (filter.f2) fl.frequency.exponentialRampToValueAtTime(filter.f2, t + (filter.dur ?? dur));
    fl.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    src.connect(fl).connect(g).connect(dest ?? this.sfxBus);
    if (verb) {
      const vs = ctx.createGain();
      vs.gain.value = verb;
      g.connect(vs).connect(this.verbSend);
    }
    const end = this.env(g, t, { a, d: dur, peak });
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.05);
  }

  // ───────── efeitos sonoros ─────────

  sfx(name, opt = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    const S = SFX[name];
    if (S) S(this, t, opt);
  }

  // ───────── música ─────────

  music(name) {
    if (!this.ctx) return;
    if (name === this.trackName) return;
    this.trackName = name;
    const old = this.track;
    if (old) {
      old.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        clearInterval(old.timer);
        old.gain.disconnect();
      }, 2000);
    }
    this.track = null;
    if (!name || !TRACKS[name]) return;
    const tr = TRACKS[name];
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(1, this.ctx.currentTime + 0.1, 0.5);
    g.connect(this.musicBus);
    const vs = this.ctx.createGain();
    vs.gain.value = 0.35;
    g.connect(vs).connect(this.verbSend);
    const st = { tr, gain: g, step: 0, next: this.ctx.currentTime + 0.15, timer: null };
    const stepDur = 60 / tr.bpm / 4;
    st.timer = setInterval(() => {
      if (!this.ctx) return;
      while (st.next < this.ctx.currentTime + 0.12) {
        const sw = st.step % 2 === 1 ? tr.swing * stepDur : 0;
        this.playStep(st, st.next + sw, stepDur);
        st.next += stepDur;
        st.step++;
      }
    }, 25);
    this.track = st;
  }

  playStep(st, t, sd) {
    const { tr } = st;
    const s = st.step % 16;
    const bar = Math.floor(st.step / 16);
    const dest = st.gain;
    const at = (arr) => (arr && arr.length ? arr[bar % arr.length] : null);
    for (const [inst, pats] of Object.entries(tr.drums ?? {})) {
      const pat = at(pats);
      const ch = pat?.[s];
      if (ch === 'x' || ch === 'o') DRUM[inst]?.(this, t, ch === 'x' ? 1 : 0.5, dest);
    }
    const chord = at(tr.chords);
    if (chord && tr.chordRhythm?.[s] === 'x') {
      const len = tr.chordRhythm.slice(s + 1).search('x');
      const dur = (len < 0 ? 16 - s : len + 1) * sd;
      INST[tr.padInst ?? 'keys'](this, t, chord, dur, dest);
    }
    const bn = at(tr.bass)?.[s];
    if (bn) INST.bass(this, t, bn, sd * 1.8, dest);
    const ln = at(tr.lead)?.[s];
    if (ln) INST[tr.leadInst ?? 'pluck'](this, t, [ln], sd * 2.2, dest);
  }
}

const DRUM = {
  kick: (A, t, v, dest) => {
    A.tone({ type: 'sine', f: 150, f2: 42, glide: 0.12, t, dur: 0.32, peak: 0.95 * v, dest });
    A.tone({ type: 'triangle', f: 1200, f2: 200, glide: 0.02, t, dur: 0.02, peak: 0.25 * v, dest });
  },
  snare: (A, t, v, dest) => {
    A.noise({ t, dur: 0.16, peak: 0.42 * v, filter: { type: 'bandpass', f: 1800, q: 0.7 }, dest });
    A.tone({ type: 'triangle', f: 220, f2: 160, t, dur: 0.08, peak: 0.3 * v, dest });
  },
  clap: (A, t, v, dest) => {
    for (let i = 0; i < 3; i++) A.noise({ t: t + i * 0.011, dur: 0.05, peak: 0.25 * v, filter: { type: 'bandpass', f: 1300, q: 1.2 }, dest });
    A.noise({ t: t + 0.035, dur: 0.18, peak: 0.25 * v, filter: { type: 'bandpass', f: 1200, q: 1 }, dest, verb: 0.4 });
  },
  hat: (A, t, v, dest) => A.noise({ t, dur: 0.04, peak: 0.14 * v, filter: { type: 'highpass', f: 8000 }, dest }),
  shaker: (A, t, v, dest) => A.noise({ t, dur: 0.06, a: 0.02, peak: 0.07 * v, filter: { type: 'bandpass', f: 6500, q: 1.5 }, dest }),
  tick: (A, t, v, dest) => A.tone({ type: 'square', f: 2200, t, dur: 0.012, peak: 0.05 * v, dest }),
  scratch: (A, t, v, dest) => {
    A.noise({ t, dur: 0.09, peak: 0.3, filter: { type: 'bandpass', f: 600, f2: 3000, q: 4, dur: 0.09 }, dest });
    A.noise({ t: t + 0.1, dur: 0.12, peak: 0.3, filter: { type: 'bandpass', f: 3000, f2: 500, q: 4, dur: 0.12 }, dest });
  },
};

const INST = {
  bass: (A, t, n, dur, dest) => {
    const f = freq(n);
    A.tone({ type: 'sawtooth', f, t, dur: Math.max(0.12, dur), a: 0.004, peak: 0.26, dest, filter: { type: 'lowpass', f: 900, f2: 180, q: 6, dur: dur } });
    A.tone({ type: 'sine', f, t, dur: Math.max(0.12, dur), peak: 0.3, dest });
  },
  keys: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      A.tone({ type: 'triangle', f: freq(n), t, dur: Math.min(dur, 0.9), a: 0.006, peak: 0.07, dest });
      A.tone({ type: 'sine', f: freq(n) * 2, t, dur: Math.min(dur, 0.5) * 0.6, peak: 0.025, dest });
    }
  },
  pad: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      for (const dt of [-7, 7]) A.tone({ type: 'sawtooth', f: freq(n), detune: dt, t, dur, a: 0.35, peak: 0.028, dest, filter: { type: 'lowpass', f: 1100, q: 0.5 } });
    }
  },
  organ: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      const f = freq(n);
      A.tone({ type: 'sine', f, t, dur, a: 0.08, peak: 0.07, dest });
      A.tone({ type: 'sine', f: f * 2, t, dur, a: 0.08, peak: 0.035, dest });
      A.tone({ type: 'sine', f: f * 3, t, dur, a: 0.08, peak: 0.02, dest });
      A.tone({ type: 'sine', f: f / 2, t, dur, a: 0.1, peak: 0.04, dest });
    }
  },
  brass: (A, t, notes, dur, dest) => {
    for (const n of notes) A.tone({ type: 'sawtooth', f: freq(n), t, dur: Math.min(dur, 0.35), a: 0.02, peak: 0.05, dest, filter: { type: 'lowpass', f: 600, f2: 2600, q: 2, dur: 0.08 } });
  },
  stab: (A, t, notes, dur, dest) => {
    for (const n of notes) A.tone({ type: 'square', f: freq(n), t, dur: 0.12, a: 0.003, peak: 0.045, dest, filter: { type: 'lowpass', f: 2600, f2: 500, q: 3, dur: 0.12 } });
  },
  pluck: (A, t, notes, dur, dest) => {
    for (const n of notes) A.tone({ type: 'triangle', f: freq(n), t, dur: 0.28, a: 0.002, peak: 0.12, dest, verb: 0.3, filter: { type: 'lowpass', f: 5000, f2: 900, dur: 0.2 } });
  },
  bell: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      A.tone({ type: 'sine', f: freq(n), t, dur: 1.2, a: 0.003, peak: 0.08, dest, verb: 0.5 });
      A.tone({ type: 'sine', f: freq(n) * 2.76, t, dur: 0.4, a: 0.003, peak: 0.025, dest });
    }
  },
  musicbox: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      A.tone({ type: 'sine', f: freq(n), t, dur: 0.9, a: 0.002, peak: 0.07, dest, verb: 0.7 });
      A.tone({ type: 'sine', f: freq(n) * 4, t, dur: 0.15, a: 0.002, peak: 0.02, dest });
    }
  },
  square: (A, t, notes, dur, dest) => {
    for (const n of notes) A.tone({ type: 'square', f: freq(n), t, dur: Math.min(dur, 0.18), a: 0.003, peak: 0.04, dest, filter: { type: 'lowpass', f: 3500 } });
  },
  whistle: (A, t, notes, dur, dest) => {
    for (const n of notes) {
      const o = A.tone({ type: 'sine', f: freq(n) * 0.97, f2: freq(n), glide: 0.04, t, dur: Math.min(dur, 0.22), a: 0.01, peak: 0.07, dest });
    }
  },
};

// Biblioteca de efeitos. Cada um recebe (engine, tempo, opções).
const SFX = {
  click: (A, t) => A.tone({ type: 'square', f: 1800, t, dur: 0.025, peak: 0.12, filter: { type: 'lowpass', f: 4000 } }),
  pop: (A, t, o) => A.tone({ type: 'sine', f: 380 * (o.pitch ?? 1), f2: 1100 * (o.pitch ?? 1), glide: 0.07, t, dur: 0.12, peak: 0.35 }),
  bloop: (A, t, o) => {
    const p = o.pitch ?? 1;
    A.tone({ type: 'sine', f: 300 * p, f2: 700 * p, glide: 0.08, t, dur: 0.14, peak: 0.3 });
    A.tone({ type: 'sine', f: 500 * p, f2: 1200 * p, glide: 0.08, t: t + 0.09, dur: 0.16, peak: 0.25 });
  },
  join: (A, t, o) => {
    const p = o.pitch ?? 1;
    [523, 659, 784, 1046].forEach((f, i) => A.tone({ type: 'triangle', f: f * p, t: t + i * 0.06, dur: 0.18, peak: 0.18, verb: 0.3 }));
  },
  whoosh: (A, t) => A.noise({ t, dur: 0.45, a: 0.15, peak: 0.25, filter: { type: 'bandpass', f: 300, f2: 3500, q: 2, dur: 0.45 } }),
  swoosh: (A, t) => A.noise({ t, dur: 0.3, a: 0.05, peak: 0.2, filter: { type: 'bandpass', f: 3000, f2: 400, q: 2, dur: 0.3 } }),
  ding: (A, t) => {
    A.tone({ type: 'sine', f: 1318, t, dur: 1.2, peak: 0.25, verb: 0.4 });
    A.tone({ type: 'sine', f: 1976, t, dur: 0.8, peak: 0.12 });
  },
  correct: (A, t) => [523, 659, 784, 1046].forEach((f, i) => A.tone({ type: 'square', f, t: t + i * 0.07, dur: 0.15, peak: 0.12, filter: { type: 'lowpass', f: 3000 }, verb: 0.2 })),
  wrong: (A, t) => {
    A.tone({ type: 'square', f: 140, t, dur: 0.45, peak: 0.18, filter: { type: 'lowpass', f: 900 } });
    A.tone({ type: 'square', f: 147, t, dur: 0.45, peak: 0.18, filter: { type: 'lowpass', f: 900 } });
  },
  tada: (A, t) => {
    const chord = [523, 659, 784, 1046];
    chord.forEach((f) => A.tone({ type: 'sawtooth', f, t, dur: 0.12, peak: 0.08, filter: { type: 'lowpass', f: 3000 } }));
    chord.forEach((f) => A.tone({ type: 'sawtooth', f, t: t + 0.16, dur: 1.1, a: 0.02, peak: 0.09, filter: { type: 'lowpass', f: 1200, f2: 4000, dur: 0.3 }, verb: 0.5 }));
    A.noise({ t: t + 0.16, dur: 1.2, peak: 0.12, filter: { type: 'highpass', f: 7000 } });
  },
  drumroll: (A, t, o) => {
    const len = o.len ?? 1.6;
    for (let i = 0; i < len / 0.045; i++) A.noise({ t: t + i * 0.045, dur: 0.05, peak: 0.08 + (i * 0.045 / len) * 0.25, filter: { type: 'bandpass', f: 1600, q: 0.8 } });
    DRUM.kick(A, t + len, 1, A.sfxBus);
    A.noise({ t: t + len, dur: 1.4, peak: 0.25, filter: { type: 'highpass', f: 5000 }, verb: 0.4 });
  },
  gong: (A, t) => {
    [65, 98, 131.5, 177, 233].forEach((f, i) => A.tone({ type: 'sine', f, t, dur: 2.5 - i * 0.3, a: 0.01, peak: 0.22 / (i + 1), verb: 0.6 }));
    A.noise({ t, dur: 0.6, peak: 0.08, filter: { type: 'lowpass', f: 1200 } });
  },
  lavada: (A, t) => {
    A.noise({ t, dur: 0.8, a: 0.02, peak: 0.4, filter: { type: 'bandpass', f: 4000, f2: 600, q: 1, dur: 0.8 }, verb: 0.5 });
    [392, 494, 587, 784].forEach((f) => A.tone({ type: 'sawtooth', f, t: t + 0.12, dur: 1.4, a: 0.03, peak: 0.08, filter: { type: 'lowpass', f: 800, f2: 5000, dur: 0.3 }, verb: 0.6 }));
    for (let i = 0; i < 8; i++) A.tone({ type: 'sine', f: 600 + Math.random() * 900, f2: 1800 + Math.random() * 900, glide: 0.06, t: t + 0.3 + i * 0.09, dur: 0.08, peak: 0.12 });
    DRUM.kick(A, t, 1, A.sfxBus);
  },
  tick: (A, t, o) => A.tone({ type: 'square', f: o.hi ? 1600 : 1100, t, dur: 0.04, peak: 0.1, filter: { type: 'lowpass', f: 3000 } }),
  timeup: (A, t) => {
    A.tone({ type: 'sawtooth', f: 440, f2: 110, glide: 0.6, t, dur: 0.7, peak: 0.16, filter: { type: 'lowpass', f: 1800 } });
  },
  vote: (A, t) => {
    const scale = [523, 587, 659, 784, 880, 1046];
    A.tone({ type: 'triangle', f: scale[Math.floor(Math.random() * scale.length)], t, dur: 0.22, peak: 0.2, verb: 0.3 });
  },
  coin: (A, t) => {
    A.tone({ type: 'square', f: 988, t, dur: 0.08, peak: 0.1, filter: { type: 'lowpass', f: 5000 } });
    A.tone({ type: 'square', f: 1318, t: t + 0.08, dur: 0.35, peak: 0.1, filter: { type: 'lowpass', f: 5000 } });
  },
  death: (A, t) => {
    A.tone({ type: 'sawtooth', f: 220, f2: 40, glide: 1.2, t, dur: 1.3, peak: 0.22, filter: { type: 'lowpass', f: 1200, f2: 200, dur: 1.2 } });
    A.noise({ t, dur: 1, peak: 0.15, filter: { type: 'lowpass', f: 600 }, verb: 0.6 });
    DRUM.kick(A, t, 1, A.sfxBus);
  },
  spooky: (A, t) => {
    const o = A.tone({ type: 'sine', f: 600, f2: 900, glide: 1.4, t, dur: 1.6, a: 0.3, peak: 0.12, verb: 0.8 });
  },
  heartbeat: (A, t) => {
    DRUM.kick(A, t, 0.8, A.sfxBus);
    DRUM.kick(A, t + 0.18, 0.55, A.sfxBus);
  },
  airhorn: (A, t) => {
    const blast = (t0, d) => [466, 470, 233, 699].forEach((f) => A.tone({ type: 'sawtooth', f, t: t0, dur: d, a: 0.01, peak: 0.07, filter: { type: 'lowpass', f: 2600 } }));
    blast(t, 0.25);
    blast(t + 0.3, 0.12);
    blast(t + 0.46, 0.7);
  },
  scratch: (A, t) => DRUM.scratch(A, t, 1, A.sfxBus),
  type: (A, t) => A.tone({ type: 'square', f: 2000 + Math.random() * 600, t, dur: 0.015, peak: 0.04 }),
  splat: (A, t) => {
    A.noise({ t, dur: 0.25, peak: 0.4, filter: { type: 'lowpass', f: 900, f2: 200, dur: 0.25 } });
    A.tone({ type: 'sine', f: 200, f2: 60, glide: 0.15, t, dur: 0.2, peak: 0.4 });
  },
  boing: (A, t) => {
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    const lfo = A.ctx.createOscillator();
    const lg = A.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 180;
    lfo.frequency.setValueAtTime(18, t);
    lfo.frequency.exponentialRampToValueAtTime(4, t + 0.6);
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    o.connect(g).connect(A.sfxBus);
    A.env(g, t, { a: 0.005, d: 0.6, peak: 0.3 });
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.7);
    lfo.stop(t + 0.7);
  },
  reveal: (A, t) => {
    A.noise({ t, dur: 0.35, a: 0.2, peak: 0.18, filter: { type: 'bandpass', f: 500, f2: 5000, q: 3, dur: 0.35 } });
    A.tone({ type: 'sine', f: 784, t: t + 0.33, dur: 0.5, peak: 0.2, verb: 0.4 });
    A.tone({ type: 'sine', f: 1175, t: t + 0.33, dur: 0.5, peak: 0.12, verb: 0.4 });
  },
  fail: (A, t) => [392, 370, 349, 330].forEach((f, i) => A.tone({ type: 'triangle', f, f2: i === 3 ? 260 : undefined, glide: 0.5, t: t + i * 0.28, dur: i === 3 ? 0.8 : 0.25, peak: 0.18 })),
  hit: (A, t, o) => {
    A.tone({ type: 'sine', f: 180 * (o.pitch ?? 1), f2: 60, glide: 0.1, t, dur: 0.15, peak: 0.45 * (o.vol ?? 1) });
    A.noise({ t, dur: 0.08, peak: 0.25 * (o.vol ?? 1), filter: { type: 'bandpass', f: 1500, q: 1 } });
  },
  fall: (A, t) => A.tone({ type: 'sine', f: 900, f2: 120, glide: 0.8, t, dur: 0.9, peak: 0.2 }),
  powerup: (A, t) => [523, 784, 1046, 1568].forEach((f, i) => A.tone({ type: 'square', f, t: t + i * 0.05, dur: 0.1, peak: 0.08, filter: { type: 'lowpass', f: 4000 } })),
  countdown: (A, t, o) => A.tone({ type: 'sine', f: o.go ? 1046 : 523, t, dur: o.go ? 0.6 : 0.18, peak: 0.3, verb: 0.2 }),
};

export const audio = new AudioEngine();
