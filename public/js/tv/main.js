// BOBOBOX — tela principal (TV).
import { html, render, useEffect, useRef, useState } from '/vendor/preact.js';
import { socket, createStore, useStore, cls } from '../shared/core.js';
import { Bobo, Logo } from '../shared/art.js';
import { audio } from '../shared/audio.js';
import { speak, unlockVoice, stopSpeaking } from './narrator.js';
import { startBackground } from './bg.js';
import { Lobby, toggleFullscreen, pushCustom } from './lobby.js';
import { fxBus, Timer, GameIntro, MascotCorner, Confetti, Reactions, JoinBadge, Results, PartyFinal, P } from './common.js';
import { HOST_GAMES } from './games/index.js';

const bg = startBackground(document.getElementById('bg'));
const app = createStore({ started: false, code: null, catalog: [], joinUrl: null, state: null, toast: null, kicked: null });

// ───────── conexão ─────────
const saved = (() => {
  try {
    return JSON.parse(sessionStorage.getItem('bobo:host') ?? 'null');
  } catch {
    return null;
  }
})();

async function joinBase() {
  try {
    const info = await fetch('/api/info').then((r) => r.json());
    if (info.publicUrl) return info.publicUrl.replace(/\/$/, '');
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return info.lan?.[0] ?? location.origin;
  } catch {}
  return location.origin;
}

function onRoom(res) {
  if (!res?.ok) return false;
  try {
    sessionStorage.setItem('bobo:host', JSON.stringify({ code: res.code, token: res.token }));
  } catch {}
  joinBase().then((base) => app.set((a) => ({ ...a, joinUrl: `${base}/?c=${res.code}` })));
  app.set((a) => ({ ...a, code: res.code, token: res.token, catalog: res.catalog }));
  pushCustom((cmd, data) => socket.emit('host:cmd', { cmd, ...data }));
  return true;
}

function openRoom() {
  const cur = app.get();
  const creds = cur.code ? { code: cur.code, token: cur.token } : saved;
  if (creds) {
    socket.emit('host:resume', creds, (res) => {
      if (!onRoom(res)) socket.emit('host:create', {}, onRoom);
    });
  } else socket.emit('host:create', {}, onRoom);
}

socket.on('connect', () => {
  if (app.get().started) openRoom();
});
socket.on('state', (st) => app.set((a) => ({ ...a, state: st })));
socket.on('fx', (fx) => fxBus.emit(fx));
socket.on('kicked', ({ reason }) => app.set((a) => ({ ...a, kicked: reason })));

export function send(cmd, data = {}) {
  socket.emit('host:cmd', { cmd, ...data }, (res) => {
    if (res?.error) toast(res.error);
  });
}

let toastTimer;
function toast(msg) {
  app.set((a) => ({ ...a, toast: msg }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => app.set((a) => ({ ...a, toast: null })), 3500);
  audio.sfx('wrong');
}

// ───────── efeitos ─────────
const JOIN_LINES = [
  'Chegou {n}!',
  'Olha quem apareceu: {n}!',
  '{n} entrou na caixa!',
  'Bem-vindo, {n}. Fica à vontade, mas não muito.',
  '{n} chegou. Agora a festa começou de verdade.',
  'Ih, {n} chegou. Escondam os salgadinhos.',
  '{n} na área!',
  'Salve, {n}!',
];
const IDLE = {
  empty: ['Ei, tem alguém aí? Escaneia o QR code com o celular!', 'Eu sou só uma caixa. Uma caixa solitária. Entra aí, vai.', 'Dica: aponta a câmera do celular pro QR code. Ele não morde.', 'Sozinho? Aperta o botão de demo e assiste os Bobôs jogando.'],
  few: ['Chama mais gente! Quanto mais, mais caos.', 'Com três jogadores ou mais, libera quase tudo. Só dizendo.', 'Cadê o resto da galera? Manda o QR code no grupo!'],
  wait: ['E aí, VIP? Vai escolher o jogo ou vai ficar me olhando?', 'Tô esperando. Caixas são pacientes. Mas nem tanto.', 'Dica: a Maratona joga vários jogos seguidos, com um campeão no final.', 'Alguém escolhe um jogo antes que eu crie teia de aranha.', 'Desenhem seus avatares no celular enquanto isso! Fica mais bonito na TV.'],
};
const BOT_LINES = ['{n}, um robô. Pode zoar, ele não tem sentimentos.', 'Chegou {n}. Bip bop.', '{n} foi fabricado agora mesmo.'];

fxBus.on((fx) => {
  const st = app.get().state;
  switch (fx.type) {
    case 'sfx':
      audio.sfx(fx.data);
      break;
    case 'join': {
      audio.sfx('join', { pitch: 0.8 + Math.random() * 0.5 });
      const p = P(st, fx.data.id);
      if (p && st?.room.scene === 'lobby') {
        const pool = p.bot ? BOT_LINES : JOIN_LINES;
        speak(pool[Math.floor(Math.random() * pool.length)].replace('{n}', p.name));
      }
      break;
    }
    case 'vote':
      audio.sfx('vote');
      break;
    case 'shake':
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 700);
      break;
  }
});

// ───────── teclado ─────────
addEventListener('keydown', (e) => {
  if (!app.get().started) return start();
  if (e.target.matches?.('input, textarea')) return;
  const st = app.get().state;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    send('skip');
  } else if (k === 'p') send(st?.game?.paused ? 'resume' : 'pause');
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') audio.setMuted(!audio.muted);
  else if (k === 'escape' && st?.room.scene !== 'lobby') {
    if (st?.room.scene !== 'game' || confirm('Encerrar a partida e voltar pro menu?')) send('menu');
  }
});

function start() {
  if (app.get().started) return;
  audio.unlock();
  unlockVoice();
  app.set((a) => ({ ...a, started: true }));
  audio.sfx('join');
  if (socket.connected) openRoom();
}

// ───────── componentes ─────────

function Splash() {
  return html`<div class="splash" onClick=${start}>
    <div class="splash-bobo"><${Bobo} size=${300} mood="party" /></div>
    <${Logo} size=${2.2} />
    <div class="splash-sub">a festa de minigames que acontece no seu celular</div>
    <button class="btn big pulse" onClick=${start}>▶ CLIQUE PRA COMEÇAR</button>
    <div class="splash-hint">Melhor em tela cheia, com som ligado 🔊 · Abra esta tela na TV ou num PC ligado na TV</div>
  </div>`;
}

function GameShell({ s, catalog, joinUrl }) {
  const g = s.game;
  const meta = catalog.find((x) => x.id === g.id);
  const mod = HOST_GAMES[g.id];
  const intro = g.phase === 'intro' || g.phase === 'rules';
  const host = joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\/\?c=.*$/, '') : '';
  const View = mod?.View;
  const roundLabel = mod?.roundLabel?.(g) ?? null;
  return html`<div class=${cls('game', `game-${g.id}`, mod?.font && `font-${mod.font}`)} style=${`--gc:${meta?.color};--gc2:${meta?.color2}`}>
    <div class="game-hud">
      <div class="hud-game"><span>${meta?.emoji}</span> ${meta?.name}${s.room.party ? html` <small class="hud-party">🏆 Maratona ${s.room.party.index + 1}/${s.room.party.queue.length}</small>` : null}</div>
      ${roundLabel ? html`<div class="hud-round" key=${roundLabel}>${roundLabel}</div>` : html`<div />`}
      <${JoinBadge} s=${s} joinHost=${host} />
    </div>
    ${g.timer ? html`<div class="hud-timer"><${Timer} timer=${g.timer} /></div>` : null}
    <div class="game-stage">
      ${intro ? html`<${GameIntro} meta=${meta} g=${g} key=${g.phase + (g.rule ?? '')} />` : View ? html`<${View} s=${s} g=${g} v=${g.view ?? {}} meta=${meta} />` : html`<div class="center-msg">…</div>`}
    </div>
    ${g.paused ? html`<div class="paused"><div class="paused-box">❚❚ PAUSADO<small>aperte P pra continuar</small><button class="btn" onClick=${() => send('resume')}>▶ Continuar</button></div></div>` : null}
  </div>`;
}

function App() {
  const a = useStore(app);
  const s = a.state;
  const lastSay = useRef(null);
  const scene = s?.room?.scene;
  const g = s?.game;
  const mod = g ? HOST_GAMES[g.id] : null;
  const meta = g ? a.catalog.find((x) => x.id === g.id) : null;

  // Narrador
  useEffect(() => {
    const say = s?.say;
    if (!say) return;
    if (lastSay.current === null) {
      lastSay.current = say.id;
      return;
    }
    if (say.id !== lastSay.current) {
      lastSay.current = say.id;
      speak(say.text, { mood: say.mood });
    }
  }, [s?.say?.id]);

  // Música e fundo
  const track = !s ? 'lobby' : scene === 'game' && g ? (g.phase === 'intro' || g.phase === 'rules' ? mod?.introMusic ?? 'lobby' : mod?.music?.(g.phase, g.view) ?? 'chill') : scene === 'lobby' ? 'lobby' : 'results';
  useEffect(() => {
    if (a.started) audio.music(track);
  }, [track, a.started]);
  useEffect(() => {
    if (scene === 'game' && meta) {
      const th = mod?.theme?.(g) ?? {};
      bg.setTheme(th.c1 ?? meta.color, th.c2 ?? meta.color2, th.base ?? '#1b1033', th.energy ?? 0.5);
    } else if (scene === 'results' || scene === 'partyFinal') bg.setTheme('#ffd23f', '#ff3d7f', '#2a0f45', 0.9);
    else bg.setTheme('#ff3d7f', '#2ec4ff', '#1b1033', 0.4);
  }, [scene, g?.id, g?.phase]);
  useEffect(() => {
    if (scene !== 'game') stopSpeaking();
  }, [scene]);

  // Falas de espera no lobby
  useEffect(() => {
    if (scene !== 'lobby' || !a.started) return;
    const t = setInterval(() => {
      const n = app.get().state?.room.players.length ?? 0;
      const pool = n === 0 ? IDLE.empty : n < 3 ? IDLE.few : IDLE.wait;
      speak(pool[Math.floor(Math.random() * pool.length)]);
    }, 42_000);
    return () => clearInterval(t);
  }, [scene, a.started]);

  if (a.kicked) return html`<div class="splash"><${Bobo} size=${220} /><h2>${a.kicked}</h2><button class="btn" onClick=${() => location.reload()}>Recarregar</button></div>`;
  if (!a.started) return html`<${Splash} />`;
  if (!s || !a.code) return html`<div class="splash"><${Bobo} size=${220} talking=${true} /><h2 class="loading">Montando a caixa…</h2></div>`;

  const mood = mod?.mood?.(g) ?? 'normal';
  return html`<div class=${cls('stage', `scene-${scene}`)}>
    ${scene === 'lobby' ? html`<${Lobby} s=${s} catalog=${a.catalog} joinUrl=${a.joinUrl} send=${send} />` : null}
    ${scene === 'game' && g ? html`<${GameShell} s=${s} catalog=${a.catalog} joinUrl=${a.joinUrl} />` : null}
    ${scene === 'results' ? html`<${Results} s=${s} catalog=${a.catalog} send=${send} />` : null}
    ${scene === 'partyFinal' ? html`<${PartyFinal} s=${s} catalog=${a.catalog} send=${send} />` : null}
    ${mod?.hideMascot?.(g) ? null : html`<${MascotCorner} mood=${scene === 'game' ? mood : 'normal'} big=${scene === 'lobby'} />`}
    <${Reactions} s=${s} />
    ${a.toast ? html`<div class="tv-toast">${a.toast}</div>` : null}
  </div>`;
}

// Atalho de depuração no console do navegador: __bobo.send('bots', { n: 3 })
window.__bobo = { send, app };

render(html`<${App} /><${Confetti} />`, document.getElementById('app'));
