// Narrador: voz sintetizada em pt-BR (Web Speech API) + estado de "falando" pro mascote.
import { createStore } from '../shared/core.js';
import { audio } from '../shared/audio.js';

export const narration = createStore({ talking: false, text: '', id: 0, mood: 'normal' });

const synth = window.speechSynthesis;
let voice = null;
let enabled = (() => {
  try {
    return localStorage.getItem('bobo:narrator') !== '0';
  } catch {
    return true;
  }
})();

const PREFER = [/francisca/i, /thalita/i, /antonio/i, /natural/i, /neural/i, /online/i, /google/i, /luciana/i, /maria/i, /daniel/i];

function pickVoice() {
  if (!synth) return null;
  const all = synth.getVoices();
  const pt = all.filter((v) => /^pt[-_]BR/i.test(v.lang));
  const pool = pt.length ? pt : all.filter((v) => /^pt/i.test(v.lang));
  if (!pool.length) return null;
  for (const re of PREFER) {
    const v = pool.find((x) => re.test(x.name));
    if (v) return v;
  }
  return pool[0];
}

if (synth) {
  voice = pickVoice();
  synth.addEventListener?.('voiceschanged', () => (voice = pickVoice()));
}

export function narratorEnabled() {
  return enabled;
}
export function setNarrator(on) {
  enabled = on;
  try {
    localStorage.setItem('bobo:narrator', on ? '1' : '0');
  } catch {}
  if (!on) synth?.cancel();
}
/** Todas as vozes em português (pra dar vozes diferentes aos MCs). */
export function ptVoices() {
  if (!synth) return [];
  const all = synth.getVoices().filter((v) => /^pt/i.test(v.lang));
  const br = all.filter((v) => /^pt[-_]BR/i.test(v.lang));
  const rest = all.filter((v) => !br.includes(v));
  return [...br, ...rest];
}

export function voiceName() {
  return voice?.name ?? null;
}

/** Destrava a voz no primeiro clique (navegadores exigem gesto do usuário). */
export function unlockVoice() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

let current = 0;
let watchdog = null;

/** Fala um texto. Interrompe o que estiver falando (a tela manda no ritmo). */
export function speak(text, { mood = 'normal', rate, pitch } = {}) {
  const id = ++current;
  const clean = String(text ?? '').replace(/_{2,}/g, ' tracinho ').replace(/\s+/g, ' ').trim();
  narration.set({ talking: !!clean, text: clean, id, mood });
  clearTimeout(watchdog);
  const done = () => {
    if (current !== id) return;
    narration.set((s) => ({ ...s, talking: false }));
    audio.duck(false);
  };
  if (!clean) return done();
  // Estimativa de duração — garante que a boca feche mesmo se o navegador não avisar o fim
  const est = 900 + clean.length * 62;
  if (!enabled || !synth || !voice) {
    watchdog = setTimeout(done, Math.min(est, 6000));
    return;
  }
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate ?? (mood === 'hype' ? 1.12 : mood === 'spooky' ? 0.92 : 1.05);
    u.pitch = pitch ?? (mood === 'spooky' ? 0.7 : mood === 'hype' ? 1.15 : 1.0);
    u.volume = 1;
    u.onstart = () => current === id && audio.duck(true);
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
    watchdog = setTimeout(done, est * 1.8 + 2000);
  } catch {
    watchdog = setTimeout(done, est);
  }
}

/** Voz alternativa pra performances (rap): devolve uma Promise que resolve quando termina. */
export function perform(text, { rate = 1.15, pitch = 1, onWord, voice: forced } = {}) {
  return new Promise((resolve) => {
    const clean = String(text ?? '').trim();
    if (!clean || !enabled || !synth || !voice) {
      // Sem voz: simula o tempo de leitura chamando onWord por palavra
      const words = clean.split(/\s+/);
      let i = 0;
      const t = setInterval(() => {
        onWord?.(i);
        if (++i >= words.length) {
          clearInterval(t);
          setTimeout(resolve, 300);
        }
      }, 300);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.voice = forced ?? voice;
    u.lang = u.voice.lang;
    u.rate = rate;
    u.pitch = pitch;
    let word = 0;
    u.onboundary = (e) => {
      if (e.name === 'word' || e.name === undefined) {
        const idx = clean.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
        word = idx;
        onWord?.(idx);
      }
    };
    const end = () => {
      clearTimeout(wd);
      resolve();
    };
    u.onend = end;
    u.onerror = end;
    const wd = setTimeout(end, 1200 + clean.length * 110);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  current++;
  synth?.cancel();
  narration.set((s) => ({ ...s, talking: false }));
  audio.duck(false);
}
