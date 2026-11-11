// Lobby da TV: QR code, jogadores chegando, catálogo de jogos e configurações.
import { html, useState, useEffect } from '/vendor/preact.js';
import { cls } from '../shared/core.js';
import { Avatar, Logo } from '../shared/art.js';
import { audio } from '../shared/audio.js';
import { narratorEnabled, setNarrator, voiceName } from './narrator.js';

export function Lobby({ s, catalog, joinUrl, send }) {
  const [settings, setSettings] = useState(false);
  const [partyCount, setPartyCount] = useState(4);
  const players = s.room.players;
  const n = players.length;
  const hide = s.room.settings.hideCode;
  const [peek, setPeek] = useState(false);
  const host = joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\/\?c=.*$/, '') : '…';
  const max = s.room.settings.maxPlayers;
  const slots = Math.max(0, Math.min(max, Math.max(8, n + 1)) - n);

  return html`<div class="lobby">
    <div class="lobby-top">
      <${Logo} size=${1} />
      <div class="lobby-tools">
        <button class="icon-btn" title="Configurações" onClick=${() => setSettings(true)}>⚙️</button>
        <button class="icon-btn" title="Tela cheia (F)" onClick=${toggleFullscreen}>⛶</button>
      </div>
    </div>

    <div class="lobby-main">
      <div class=${cls('join-card', hide && !peek && 'hidden-code')}>
        <div class="jc-title">Escaneia e entra!</div>
        <div class="jc-qr">${joinUrl ? html`<img src=${`/api/qr.svg?u=${encodeURIComponent(joinUrl)}`} alt="QR code pra entrar" />` : null}</div>
        <div class="jc-or">ou acessa no celular</div>
        <div class="jc-url">${host}</div>
        <div class="jc-code-label">código da sala</div>
        <div class="jc-code">${s.room.code.split('').map((c, i) => html`<span style=${`--i:${i}`}>${c}</span>`)}</div>
        ${hide ? html`<button class="btn small alt" onMouseDown=${() => setPeek(true)} onMouseUp=${() => setPeek(false)} onMouseLeave=${() => setPeek(false)}>👁 Segura pra ver</button>` : null}
      </div>

      <div class="lobby-right">
        <div class="panel players-panel">
          <div class="panel-title">Jogadores <span class="count">${n}/${max}</span>${s.room.audienceCount ? html`<span class="aud-count">👥 ${s.room.audienceCount} na plateia</span>` : null}</div>
          <div class="lobby-players">
            ${players.map(
              (p) => html`<div class=${cls('lp', !p.on && 'off')} key=${p.id}>
                <div class="lp-av">${p.vip ? html`<span class="vip-crown" title="VIP: escolhe os jogos pelo celular">👑</span>` : null}<${Avatar} p=${p} size=${96} /></div>
                <div class="lp-name" style=${`--pc:${p.color}`}>${p.name}${p.bot ? ' 🤖' : ''}</div>
                <button class="lp-kick" title="Remover" onClick=${() => send('kick', { id: p.id })}>✕</button>
              </div>`,
            )}
            ${Array.from({ length: slots }, (_, i) => html`<div class="lp empty" key=${'e' + i}><div class="lp-slot">?</div></div>`)}
          </div>
          ${n === 0 ? html`<div class="lobby-hint">Aponte a câmera do celular pro QR code ✨</div>` : null}
          ${n < 3 ? html`<div class="demo-row"><span>Sozinho por aqui?</span><button class="btn small blue" onClick=${() => send('demo', { count: 3 })}>🍿 Assistir uma demo com os Bobôs</button></div>` : null}
        </div>

        <div class="panel games-panel">
          <div class="panel-title">Escolha o jogo ${n ? html`<small>(o 👑 VIP também pode escolher pelo celular)</small>` : null}</div>
          <div class="games-grid">
            <div class=${cls('game-card party-card', n < 3 && 'locked')}>
              <div class="gc-emoji">🏆</div>
              <div class="gc-name">MARATONA</div>
              <div class="gc-tag">Vários jogos seguidos, placar acumulado e um campeão no final</div>
              <div class="party-ctrl">
                ${[3, 4, 5, 6].map((k) => html`<button class=${cls('chip', partyCount === k && 'on')} onClick=${() => setPartyCount(k)}>${k} jogos</button>`)}
              </div>
              <button class="btn" disabled=${n < 2} onClick=${() => send('party', { count: partyCount })}>JOGAR MARATONA</button>
            </div>
            ${catalog.map((g) => {
              const ok = n >= g.min && n <= g.max;
              const why = n < g.min ? `precisa de ${g.min}+` : n > g.max ? `máx. ${g.max}` : '';
              return html`<button
                class=${cls('game-card', !ok && 'locked')}
                style=${`--gc:${g.color};--gc2:${g.color2}`}
                onClick=${() => ok && send('start', { gameId: g.id })}
                title=${g.desc}
              >
                <div class="gc-emoji">${g.emoji}</div>
                <div class=${cls('gc-name', g.font && `font-${g.font}`)}>${g.name}</div>
                <div class="gc-tag">${g.tag}</div>
                <div class="gc-meta"><span>👥 ${g.min}–${g.max}</span><span>⏱ ${g.mins} min</span><span>${g.kind}</span></div>
                ${!ok ? html`<div class="gc-lock">${why}</div>` : null}
              </button>`;
            })}
          </div>
        </div>
      </div>
    </div>

    <div class="lobby-foot">
      <span><kbd>Espaço</kbd> pular</span><span><kbd>P</kbd> pausar</span><span><kbd>F</kbd> tela cheia</span><span><kbd>M</kbd> mudo</span><span><kbd>Esc</kbd> menu</span>
    </div>

    ${settings ? html`<${Settings} s=${s} send=${send} close=${() => setSettings(false)} />` : null}
  </div>`;
}

function Toggle({ label, desc, on, onChange }) {
  return html`<label class="toggle">
    <input type="checkbox" checked=${on} onChange=${(e) => onChange(e.currentTarget.checked)} />
    <span class="tg-switch" />
    <span class="tg-text"><b>${label}</b>${desc ? html`<small>${desc}</small>` : null}</span>
  </label>`;
}

function Settings({ s, send, close }) {
  const st = s.room.settings;
  const [, force] = useState(0);
  const set = (patch) => send('settings', patch);
  const bots = s.room.players.filter((p) => p.bot).length;
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  }, []);
  return html`<div class="modal-bg" onClick=${close}>
    <div class="modal" onClick=${(e) => e.stopPropagation()}>
      <div class="modal-head"><h2>Configurações</h2><button class="icon-btn" onClick=${close}>✕</button></div>
      <div class="modal-cols">
        <div>
          <h3>Partida</h3>
          <${Toggle} label="Modo Família" desc="Esconde prompts apimentados" on=${st.family} onChange=${(v) => set({ family: v })} />
          <${Toggle} label="Tempo extra" desc="Cronômetros 60% mais longos" on=${st.extraTime} onChange=${(v) => set({ extraTime: v })} />
          <${Toggle} label="Plateia" desc="Quem chegar depois entra votando" on=${st.audience} onChange=${(v) => set({ audience: v })} />
          <${Toggle} label="Modo streamer" desc="Esconde o código da sala na tela" on=${st.hideCode} onChange=${(v) => set({ hideCode: v })} />
          <label class="range-row">Máx. de jogadores <b>${st.maxPlayers}</b>
            <input type="range" min="3" max="16" value=${st.maxPlayers} onInput=${(e) => set({ maxPlayers: +e.currentTarget.value })} />
          </label>
        </div>
        <div>
          <h3>Som</h3>
          <${Toggle}
            label="Narrador (voz)"
            desc=${voiceName() ? `Voz: ${voiceName()}` : 'Nenhuma voz pt-BR encontrada no navegador'}
            on=${narratorEnabled()}
            onChange=${(v) => (setNarrator(v), force((x) => x + 1))}
          />
          <label class="range-row">Música <input type="range" min="0" max="1" step="0.05" value=${audio.vol.music} onInput=${(e) => (audio.setVolume('music', +e.currentTarget.value), force((x) => x + 1))} /></label>
          <label class="range-row">Efeitos <input type="range" min="0" max="1" step="0.05" value=${audio.vol.sfx} onInput=${(e) => (audio.setVolume('sfx', +e.currentTarget.value), audio.sfx('pop'), force((x) => x + 1))} /></label>
          <h3>Bobôs (jogadores-robô)</h3>
          <p class="muted">Pra testar sozinho ou completar a mesa. Eles respondem qualquer coisa — mal, mas respondem.</p>
          <div class="row-btns">
            <button class="btn small" onClick=${() => send('bots', { n: 1 })}>+1 Bobô</button>
            <button class="btn small" onClick=${() => send('bots', { n: 3 })}>+3 Bobôs</button>
            <button class="btn small alt" disabled=${!bots} onClick=${() => send('clearBots')}>Remover ${bots || ''}</button>
          </div>
        </div>
      </div>
      <${CustomJokes} send=${send} />
    </div>
  </div>`;
}

// ───────── piadas internas (ficam salvas neste navegador) ─────────
const CKEY = 'bobo:custom';
export function loadCustom() {
  try {
    return JSON.parse(localStorage.getItem(CKEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
const lines = (t) => String(t ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
export function pushCustom(send, data = loadCustom()) {
  for (const game of ['bateboca', 'garrancho']) send('custom', { game, list: lines(data[game]) });
}

function CustomJokes({ send }) {
  const [data, setData] = useState(loadCustom);
  const [saved, setSaved] = useState(false);
  const save = () => {
    try {
      localStorage.setItem(CKEY, JSON.stringify(data));
    } catch {}
    pushCustom(send, data);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const field = (game, label, ph) => html`<label class="cj-field"><b>${label}</b><small>${lines(data[game]).length} cadastrado(s) · um por linha</small>
    <textarea rows="5" placeholder=${ph} value=${data[game] ?? ''} onInput=${(e) => setData((d) => ({ ...d, [game]: e.currentTarget.value }))} /></label>`;
  return html`<div class="cj">
    <h3>🎭 Piadas internas da turma</h3>
    <p>Coloque nomes, apelidos e histórias de vocês. Eles entram misturados nas partidas.</p>
    <div class="cj-cols">
      ${field('bateboca', '🥊 Prompts do Bate-Boca', 'O verdadeiro motivo do Júnior ter sido expulso do churrasco\nO que a tia Cleide esconde no freezer')}
      ${field('garrancho', '🖍️ Temas do Garrancho', 'o Paulo dançando forró\na viagem pra Ubatuba que deu errado')}
    </div>
    <button class="btn small green" onClick=${save}>${saved ? '✓ Salvo!' : 'Salvar piadas internas'}</button>
  </div>`;
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
