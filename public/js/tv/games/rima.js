// Batalha de Rima na TV: beat, MCs no palco e versos "cantados" com karaokê.
import { html, useEffect, useState } from '/vendor/preact.js';
import { cls, fmt } from '../../shared/core.js';
import { Avatar, Bobo } from '../../shared/art.js';
import { audio } from '../../shared/audio.js';
import { perform, ptVoices, stopSpeaking } from '../narrator.js';
import { PlayerStrip, Scoreboard, VoteBadges, P } from '../common.js';

function MC({ s, id, name, side, active, res, k }) {
  const p = id === 'bobo' ? null : P(s, id);
  const votes = res?.[k] ?? null;
  return html`<div class=${cls('rm-mc', side, active && 'active', res && res.ko === k && 'ko-win', res && res.ko && res.ko !== k && 'ko-lose')}>
    <div class="rm-spot" />
    <div class="rm-av">
      ${p ? html`<${Avatar} p=${p} size=${220} />` : html`<${Bobo} size=${220} talking=${active} mood="party" />`}
      <div class="rm-mic">🎤</div>
    </div>
    <div class="rm-name" style=${`--pc:${p?.color ?? '#e8ad6b'}`}>${name}</div>
    ${votes
      ? html`<div class="rm-votes"><${VoteBadges} s=${s} ids=${votes} size=${46} />${res.aud?.[k] ? html`<span>👥 ${res.aud[k]}</span>` : null}<b>+${fmt(res.pts[k])}</b></div>`
      : null}
  </div>`;
}

function Lyrics({ verse, word }) {
  if (!verse) return null;
  const l1 = verse.l1.split(/\s+/);
  const l2 = verse.l2 ? verse.l2.split(/\s+/) : null;
  return html`<div class=${cls('rm-lyrics', verse.by)}>
    <div class="rm-l1">${l1.map((w, i) => html`<span class=${cls(i <= word && 'on')}>${w} </span>`)}</div>
    ${l2
      ? html`<div class="rm-l2">${l2.map((w, i) => html`<span class=${cls(i + l1.length <= word && 'on', i === l2.length - 1 && 'rhyme')}>${w} </span>`)}</div>`
      : html`<div class="rm-l2 silent">🦗 …silêncio constrangedor…</div>`}
  </div>`;
}

function Battle({ s, g, v }) {
  const [word, setWord] = useState(-1);
  const verse = v.verse >= 0 && v.verse < v.verses.length ? v.verses[v.verse] : null;
  useEffect(() => {
    if (g.phase !== 'battle' || !verse) return;
    setWord(-1);
    const text = verse.l2 ? `${verse.l1}, ${verse.l2}` : verse.l1;
    const words = text.split(/\s+/);
    let fromVoice = false;
    let i = -1;
    const per = Math.max(180, (verse.ms - 900) / Math.max(1, words.length));
    const tick = setInterval(() => !fromVoice && setWord(++i), per);
    const voices = ptVoices();
    const voice = voices.length ? voices[(verse.by === 'a' ? 0 : 1) % voices.length] : undefined;
    audio.sfx('scratch');
    audio.duck(true, 0.55);
    perform(verse.l2 ? text : `${verse.l1}... cri cri cri`, {
      voice,
      rate: 1.12,
      pitch: verse.by === 'a' ? 0.8 : 1.3,
      onWord: (k) => {
        fromVoice = true;
        setWord(k);
      },
    }).then(() => {
      setWord(999);
      audio.duck(false);
      audio.sfx(verse.l2 ? 'airhorn' : 'boing');
    });
    return () => {
      clearInterval(tick);
      stopSpeaking();
      audio.duck(false);
    };
  }, [g.phaseId, v.verse]);

  const active = verse ? verse.by : null;
  return html`<div class="rm-stage">
    <div class="rm-lights" />
    <${MC} s=${s} id=${v.a} name=${v.names.a} side="left" k="a" active=${active === 'a'} res=${v.res} />
    <div class="rm-center">
      ${verse ? html`<${Lyrics} verse=${verse} word=${word} key=${v.verse} />` : v.verse === 99 ? html`<div class="rm-ask pop-in">E aí, quem amassou?</div>` : html`<div class="rm-ready">🎧 solta o beat…</div>`}
      ${g.phase === 'vote' ? html`<div class="rm-ask pop-in">VOTEM NO CELULAR!</div>` : null}
      ${v.res?.ko ? html`<div class="rm-ko"><span>NOCAUTE!</span></div>` : null}
      <div class="rm-count">Batalha ${v.idx} de ${v.total}</div>
    </div>
    <${MC} s=${s} id=${v.b} name=${v.names.b} side="right" k="b" active=${active === 'b'} res=${v.res} />
    ${g.phase === 'vote' ? html`<${PlayerStrip} s=${s} pending=${g.pending.length ? [...g.pending, v.a, v.b] : []} size=${50} />` : null}
  </div>`;
}

function Faceoff({ s, v }) {
  const pa = v.a === 'bobo' ? null : P(s, v.a);
  const pb = v.b === 'bobo' ? null : P(s, v.b);
  return html`<div class="rm-faceoff">
    <div class="rm-fo-side left">${pa ? html`<${Avatar} p=${pa} size=${260} />` : html`<${Bobo} size=${260} mood="party" />`}<div class="rm-fo-name">${v.names.a}</div></div>
    <div class="rm-fo-vs">VS</div>
    <div class="rm-fo-side right">${pb ? html`<${Avatar} p=${pb} size=${260} />` : html`<${Bobo} size=${260} mood="party" />`}<div class="rm-fo-name">${v.names.b}</div></div>
    <div class="rm-bolt" />
  </div>`;
}

function View({ s, g, v }) {
  switch (g.phase) {
    case 'write':
      return html`<div class="center-col">
        <h1 class="mega font-bungee pop-in">ESCREVAM AS RIMAS!</h1>
        <div class="sub">${v.round === 2 ? 'Round 2 · pontos em dobro' : 'Completem os versos contra o adversário'}</div>
        <div class="big-emoji wobble">🎤</div>
        <${PlayerStrip} s=${s} label="Rimando…" />
      </div>`;
    case 'faceoff':
      return html`<${Faceoff} s=${s} v=${v} />`;
    case 'battle':
    case 'vote':
    case 'result':
      return html`<${Battle} s=${s} g=${g} v=${v} />`;
    case 'scores':
      return html`<${Scoreboard} s=${s} scores=${g.scores} before=${v.before} title=${`Placar · Round ${v.round}`} />`;
    default:
      return null;
  }
}

export default {
  View,
  css: true,
  introMusic: 'boombap',
  music: (phase, v) => (phase === 'write' ? 'chill' : phase === 'scores' ? 'results' : v?.beat ?? 'boombap'),
  roundLabel: (g) => (g.view?.round ? `Round ${g.view.round}${g.view.idx ? ` · batalha ${g.view.idx}/${g.view.total}` : ''}` : null),
  theme: (g) => ({ base: '#160b2e', energy: g.phase === 'battle' ? 1 : 0.6 }),
  hideMascot: (g) => g.phase === 'battle' || g.phase === 'faceoff',
};
