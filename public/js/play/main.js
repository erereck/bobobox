// BOBOBOX — controle (celular).
import { html, render, useEffect, useRef, useState } from '/vendor/preact.js';
import { socket, createStore, useStore, cls, fmt, vibrate, timerLeft, useTick, playerById, MODE } from '../shared/core.js';
import { Avatar, Bobo, Logo } from '../shared/art.js';
import { RequestView } from './inputs.js';
import { DrawPad, saveDrawingPng } from './canvas.js';

const params = new URLSearchParams(location.search);
const SKEY = 'bobo:session';
const loadSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) ?? 'null');
    return s && Date.now() - (s.at ?? 0) < 8 * 3600_000 ? s : null;
  } catch {
    return null;
  }
};
const saveSession = (s) => {
  try {
    localStorage.setItem(SKEY, JSON.stringify({ ...s, at: Date.now() }));
  } catch {}
};

const app = createStore({ joined: null, state: null, catalog: [], toast: null, kicked: null, connected: socket.connected });

// ───────── conexão ─────────
async function join({ code, name, token, asAudience }, cb) {
  // Modo online: primeiro acha a TV desse código na rede P2P
  if (socket.connectTo) {
    try {
      await socket.connectTo(code);
    } catch (e) {
      return cb?.({ error: e.message });
    }
  }
  socket.emit('join', { code, name, token, asAudience }, (res) => {
    if (res?.ok) {
      app.set((a) => ({ ...a, joined: { code: res.code, id: res.id, audience: !!res.audience }, catalog: res.catalog ?? a.catalog, kicked: null }));
      if (!res.audience) saveSession({ code: res.code, token: res.token, name });
      else saveSession({ ...(loadSession() ?? {}), code: res.code, name, token: null });
      history.replaceState(null, '', `/?c=${res.code}`);
      requestWakeLock();
    }
    cb?.(res);
  });
}

socket.on('connect', () => {
  app.set((a) => ({ ...a, connected: true }));
  const j = app.get().joined;
  const sess = loadSession();
  if (j && sess?.token && sess.code === j.code) join({ code: j.code, token: sess.token, name: sess.name });
  else if (j?.audience && sess) join({ code: j.code, name: sess.name, asAudience: true });
});
socket.on('disconnect', () => app.set((a) => ({ ...a, connected: false })));
socket.on('state', (st) => app.set((a) => ({ ...a, state: st })));
socket.on('kicked', ({ reason }) => {
  app.set((a) => ({ ...a, kicked: reason, joined: null, state: null }));
  try {
    localStorage.removeItem(SKEY);
  } catch {}
});
socket.on('promoted', (res) => {
  if (res?.ok) {
    app.set((a) => ({ ...a, joined: { code: res.code, id: res.id, audience: false } }));
    const sess = loadSession();
    saveSession({ code: res.code, token: res.token, name: sess?.name });
  } else if (res?.error) showToast(res.error);
});
let toastT;
function showToast(msg) {
  app.set((a) => ({ ...a, toast: msg }));
  vibrate([30, 50, 30]);
  clearTimeout(toastT);
  toastT = setTimeout(() => app.set((a) => ({ ...a, toast: null })), 3200);
}
socket.on('toast', ({ msg }) => showToast(msg));

// Tela ligada durante a partida (quando o navegador deixa)
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && app.get().joined && requestWakeLock());

const act = (msg) => socket.emit('act', msg);
const vip = (cmd, data = {}) => act({ t: 'vip', cmd, ...data });

// ───────── telas ─────────

function JoinScreen() {
  const sess = loadSession();
  const [code, setCode] = useState((params.get('c') ?? sess?.code ?? '').toUpperCase().slice(0, 4));
  const [name, setName] = useState(sess?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const a = useStore(app);
  const go = (e, asAudience = false) => {
    e?.preventDefault();
    if (code.length !== 4 || !name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const token = sess?.code === code ? sess.token : null;
    join({ code, name: name.trim(), token, asAudience }, (res) => {
      setBusy(false);
      if (res?.error) {
        setErr(res.error);
        vibrate([40, 40, 40]);
      }
    });
  };
  return html`<form class="join" onSubmit=${go}>
    <div class="join-bobo"><${Bobo} size=${130} mood="party" /></div>
    <${Logo} size=${0.9} />
    ${a.kicked ? html`<div class="join-err">${a.kicked}</div>` : null}
    <label class="field">
      <span>Código da sala</span>
      <input
        class="code-input"
        value=${code}
        maxlength="4"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder="ABCD"
        onInput=${(e) => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
      />
    </label>
    <label class="field">
      <span>Seu nome</span>
      <input value=${name} maxlength="14" autocomplete="nickname" placeholder="Como te chamam?" onInput=${(e) => setName(e.currentTarget.value)} />
    </label>
    ${err ? html`<div class="join-err">${err}</div>` : null}
    <button class="btn big pink" type="submit" disabled=${code.length !== 4 || !name.trim() || busy}>${busy ? 'Entrando…' : 'ENTRAR ➜'}</button>
    <button class="linkish" type="button" onClick=${(e) => go(e, true)} disabled=${code.length !== 4 || !name.trim()}>ou entrar só na plateia 👥</button>
    ${!a.connected && MODE === 'server' ? html`<div class="muted small">conectando ao servidor…</div>` : null}
  </form>`;
}

function TopBar({ s, me, meta }) {
  const score = s.game?.scores?.[me.id];
  const pme = playerById(s, me.id) ?? me;
  return html`<header class="topbar" style=${meta ? `--gc:${meta.color};--gc2:${meta.color2}` : ''}>
    <div class="tb-me">
      ${me.audience ? html`<span class="tb-aud">👥</span>` : html`<${Avatar} p=${pme} size=${38} />`}
      <span class="tb-name">${me.name}${me.vip ? ' 👑' : ''}</span>
    </div>
    ${meta ? html`<div class="tb-game">${meta.emoji} ${meta.name}</div>` : html`<div class="tb-game">sala ${s.room.code}</div>`}
    ${score != null ? html`<div class="tb-score">${fmt(score)}</div>` : html`<div />`}
  </header>`;
}

function TimeBar({ timer }) {
  useTick(200);
  if (!timer) return null;
  const left = timerLeft(timer);
  const k = timer.total ? left / timer.total : 0;
  return html`<div class=${cls('timebar', k < 0.2 && 'hurry')}><i style=${`width:${k * 100}%`} /><span>${Math.ceil(left / 1000)}s</span></div>`;
}

const REACTIONS = ['😂', '🔥', '😱', '👏', '💀', '🤡', '😍', '🍅'];
function ReactBar() {
  const [cool, setCool] = useState(false);
  return html`<div class="react-bar">
    ${REACTIONS.map(
      (e) => html`<button
        class=${cls(cool && 'cool')}
        onClick=${() => {
          act({ t: 'react', e });
          vibrate(10);
          setCool(true);
          setTimeout(() => setCool(false), 650);
        }}
      >${e}</button>`,
    )}
  </div>`;
}

function MyRank({ s }) {
  const sc = s.game?.scores;
  const me = s.me?.id;
  if (!sc || sc[me] == null) return null;
  const vals = Object.values(sc).sort((a, b) => b - a);
  const rank = vals.indexOf(sc[me]) + 1;
  return html`<div class="my-rank">${rank === 1 ? '👑 ' : ''}Você está em <b>${rank}º</b> de ${vals.length} · ${fmt(sc[me])} pts</div>`;
}

function WaitView({ wait, s }) {
  const w = wait ?? { emoji: '👀', title: 'Olha pra TV!', msg: '' };
  return html`<div class="wait">
    <div class="wait-emoji">${w.emoji}</div>
    <div class="wait-title">${w.title}</div>
    ${w.msg ? html`<div class="wait-msg">${w.msg}</div>` : null}
    ${w.drawing ? html`<div class="wait-drawing"><${Drawing2} d=${w.drawing} /></div>` : null}
    <${MyRank} s=${s} />
    <${ReactBar} />
  </div>`;
}
import { Drawing as Drawing2 } from '../shared/art.js';

function AvatarEditor({ me, close }) {
  const d = useRef(null);
  const [has, setHas] = useState(false);
  return html`<div class="avatar-editor">
    <div class="ae-title">Desenhe sua cara! 🎨</div>
    <div class="ae-sub">Vai aparecer na sua caixinha na TV</div>
    <${DrawPad} compact=${true} guide=${html`<div class="face-guide" />`} onChange=${(x) => ((d.current = x), setHas(x.s.length > 0))} />
    <div class="req-actions">
      <button class="btn alt small" onClick=${() => (act({ t: 'avatar', d: null }), close())}>Usar cara aleatória</button>
      <button class="btn pink" disabled=${!has} onClick=${() => (act({ t: 'avatar', d: d.current }), vibrate(30), close())}>Salvar ✓</button>
    </div>
  </div>`;
}

function LobbyPhone({ s, me, catalog }) {
  const [editing, setEditing] = useState(false);
  const pme = playerById(s, me.id);
  const n = s.room.players.length;
  if (editing) return html`<${AvatarEditor} me=${me} close=${() => setEditing(false)} />`;
  return html`<div class="lobby-phone">
    <div class="lp-me">
      <div class="lp-me-av" onClick=${() => setEditing(true)}><${Avatar} p=${pme} size=${150} /><span class="edit-badge">✏️</span></div>
      <div class="lp-me-name" style=${`--pc:${me.color}`}>${me.name}</div>
      <button class="btn small alt" onClick=${() => setEditing(true)}>🎨 Desenhar meu avatar</button>
    </div>
    ${me.vip
      ? html`<div class="vip-box">
          <div class="vip-title">👑 Você é o VIP! Escolha o jogo:</div>
          <button class="btn party-btn" disabled=${n < 2} onClick=${() => vip('party', { count: 4 })}>🏆 MARATONA (4 jogos)</button>
          <div class="vip-games">
            ${catalog.map((g) => {
              const ok = n >= g.min && n <= g.max;
              return html`<button class=${cls('vip-game', !ok && 'locked')} style=${`--gc:${g.color};--gc2:${g.color2}`} disabled=${!ok} onClick=${() => vip('start', { gameId: g.id })}>
                <span class="vg-emoji">${g.emoji}</span>
                <span class="vg-name">${g.name}</span>
                <span class="vg-meta">${ok ? `${g.min}–${g.max} 👥` : n < g.min ? `precisa de ${g.min}` : `máx ${g.max}`}</span>
              </button>`;
            })}
          </div>
        </div>`
      : html`<div class="wait small"><div class="wait-emoji wobble">⏳</div><div class="wait-title">Esperando o VIP escolher o jogo…</div><div class="wait-msg">${n} na sala</div></div>`}
    <${ReactBar} />
  </div>`;
}

function ResultsPhone({ s, me, catalog }) {
  const r = s.result;
  const mine = r?.ranking?.find((e) => e.id === me.id) ?? r?.party?.find((e) => e.id === me.id);
  const awards = (r?.awards ?? []).filter((a) => a.id === me.id);
  const mineArt = (r?.gallery ?? []).filter((it) => it.by === me.id);
  const final = s.room.scene === 'partyFinal';
  const rank = final ? r?.party?.find((e) => e.id === me.id)?.rank : mine?.rank;
  const emoji = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank ? '🫠' : '👀';
  return html`<div class="results-phone">
    <div class="rp-emoji">${emoji}</div>
    ${rank ? html`<div class="rp-rank">${rank}º lugar</div>` : null}
    ${mine && !final ? html`<div class="rp-score">${fmt(mine.score)} pontos</div>` : null}
    ${awards.map((a) => html`<div class="rp-award">🏅 <b>${a.title}</b><small>${a.desc}</small></div>`)}
    ${mineArt.length
      ? html`<div class="rp-gallery"><div class="rp-gtitle">Seus desenhos 🎨</div><div class="rp-grid">${mineArt.map(
          (it) => html`<button class="rp-art" onClick=${() => saveDrawingPng(it.d, it.title)}><${Drawing2} d=${it.d} /><span>💾 ${it.title}</span></button>`,
        )}</div></div>`
      : null}
    ${me.vip && !s.room.party
      ? html`<div class="rp-actions">
          ${final ? html`<button class="btn pink" onClick=${() => vip('party', { count: 4 })}>🔁 Outra maratona</button>` : html`<button class="btn pink" onClick=${() => vip('again')}>🔁 Jogar de novo</button>`}
          <button class="btn alt" onClick=${() => vip('menu')}>🏠 Escolher outro jogo</button>
        </div>`
      : me.vip && s.room.party
        ? html`<div class="rp-actions"><button class="btn" onClick=${() => vip('skip')}>▶ Próximo jogo</button></div>`
        : null}
    <${ReactBar} />
  </div>`;
}

function GamePhone({ s, me }) {
  const g = s.game;
  const v = g.view ?? {};
  if (g.paused) return html`<div class="wait"><div class="wait-emoji">⏸️</div><div class="wait-title">Pausado</div>${me.vip ? html`<button class="btn pink" onClick=${() => vip('resume')}>▶ Continuar</button>` : null}</div>`;
  if (g.phase === 'intro' || g.phase === 'rules') {
    return html`<div class="wait">
      <div class="wait-emoji wobble">📺</div>
      <div class="wait-title">Presta atenção nas regras na TV!</div>
      ${me.vip ? html`<button class="btn small alt" onClick=${() => vip('skip')}>⏭ Pular regras</button>` : null}
      <${ReactBar} />
    </div>`;
  }
  if (v.req) return html`<${RequestView} key=${v.req.id} req=${v.req} timer=${g.timer} s=${s} me=${me} />`;
  return html`<${WaitView} wait=${v.wait} s=${s} />`;
}

function AudiencePhone({ s, me }) {
  const g = s.game;
  const req = g?.view?.req;
  if (s.room.scene === 'lobby') {
    return html`<div class="wait"><div class="wait-emoji">👥</div><div class="wait-title">Você está na plateia</div>
      <button class="btn pink" onClick=${() => act({ t: 'promote' })}>Entrar como jogador</button></div>`;
  }
  if (req && !me.voted) return html`<${RequestView} key=${req.id} req=${req} timer=${g.timer} s=${s} me=${me} />`;
  return html`<div class="wait"><div class="wait-emoji">${me.voted ? '🗳️' : '🍿'}</div><div class="wait-title">${me.voted ? 'Voto da plateia computado!' : 'Plateia VIP'}</div><div class="wait-msg">Quando tiver votação, ela aparece aqui.</div></div>`;
}

function App() {
  const a = useStore(app);
  const s = a.state;
  const me = s?.me;
  const scene = s?.room?.scene;
  const gameId = s?.game?.id;
  const meta = gameId ? a.catalog.find((g) => g.id === gameId) : null;
  useEffect(() => {
    document.documentElement.style.setProperty('--gc', meta?.color ?? '#ff3d7f');
    document.documentElement.style.setProperty('--gc2', meta?.color2 ?? '#ffd23f');
    document.body.dataset.game = gameId ?? '';
  }, [gameId]);

  if (!a.joined || !s || !me) return html`<div class="screen"><${JoinScreen} /></div>`;
  let body;
  if (me.audience) body = html`<${AudiencePhone} s=${s} me=${me} />`;
  else if (scene === 'lobby') body = html`<${LobbyPhone} s=${s} me=${me} catalog=${a.catalog} />`;
  else if (scene === 'game' && s.game?.inGame) body = html`<${GamePhone} s=${s} me=${me} />`;
  else if (scene === 'game') body = html`<div class="wait"><div class="wait-emoji">⏳</div><div class="wait-title">Partida em andamento</div><div class="wait-msg">Você entra na próxima!</div><${ReactBar} /></div>`;
  else body = html`<${ResultsPhone} s=${s} me=${me} catalog=${a.catalog} />`;

  return html`<div class=${cls('screen', 'in-room', scene && `scene-${scene}`)}>
    <${TopBar} s=${s} me=${me} meta=${scene === 'game' ? meta : null} />
    ${scene === 'game' && s.game?.timer && (s.game.view?.req || me.audience) ? html`<${TimeBar} timer=${s.game.timer} />` : null}
    <main class="body" key=${(s.game?.phaseId ?? 0) + scene}>${body}</main>
    ${!a.connected ? html`<div class="offline-bar">Reconectando…</div>` : null}
    ${a.toast ? html`<div class="toast">${a.toast}</div>` : null}
  </div>`;
}

// Reentra automaticamente se a página recarregar e a sessão ainda for válida
(function autoRejoin() {
  const sess = loadSession();
  const c = (params.get('c') ?? '').toUpperCase();
  if (sess?.token && (!c || c === sess.code)) {
    const tryJoin = () => join({ code: sess.code, token: sess.token, name: sess.name });
    if (socket.connected || socket.connectTo) tryJoin();
    else socket.once('connect', () => !app.get().joined && tryJoin());
  }
})();

// Atalho de depuração/testes no console do navegador
window.__bobo = { socket, app };

render(html`<${App} />`, document.getElementById('app'));
