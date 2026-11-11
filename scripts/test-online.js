// Teste de ponta a ponta do MODO ONLINE (site estático, TV como anfitriã, celulares por WebRTC).
// Sobe dist/ localmente, abre a TV e 2 "celulares" num Edge/Chrome headless, entra pelo código,
// joga uma partida inteira (com uns Bobôs completando a mesa), derruba a conexão de um
// celular no meio pra testar a reconexão e confere o resultado.
//
//   npm run build && npm run test:online [jogo] [--url https://seu-site.vercel.app] [--out pasta]
//
// Precisa de internet (o PeerJS usa o servidor público dele pra TV e celulares se acharem).

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const remote = opt('--url');
const OUT = opt('--out') ?? path.resolve('shots-online');
const GAME = args[0] ?? 'bateboca';
await mkdir(OUT, { recursive: true });

let server = null;
let base = remote?.replace(/\/$/, '');
if (!base) {
  process.env.PORT ??= '4174';
  const log = console.log;
  console.log = () => {};
  ({ server } = await import('./serve-static.js'));
  console.log = log;
  base = `http://localhost:${process.env.PORT}`;
}

const { chromium } = await import('playwright-core');
const exe =
  process.env.BROWSER ??
  ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => {
    try {
      return !!statSync(p);
    } catch {
      return false;
    }
  });
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
};
const step = (msg) => console.log(`• ${msg}`);
const fail = async (msg) => {
  console.log(`❌ ${msg}`);
  if (errors.length) console.log(errors.slice(0, 15).join('\n'));
  await browser.close();
  server?.close();
  process.exit(1);
};

// ── TV
const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(tv, 'tv');
await tv.goto(`${base}/tv?timescale=0.3`);
await tv.waitForFunction(() => window.__bobo, null, { timeout: 60_000 }); // espera os módulos carregarem
await tv.keyboard.press('Space');
try {
  await tv.waitForFunction(() => window.__bobo?.app.get().code, null, { timeout: 30_000 });
} catch {
  await fail('a TV não conseguiu abrir a sala online (PeerJS)');
}
const code = await tv.evaluate(() => window.__bobo.app.get().code);
step(`TV abriu a sala ${code} (anfitriã P2P)`);
await tv.screenshot({ path: path.join(OUT, '01-tv-lobby.png') });

// ── celulares
const phones = [];
for (const name of ['Erick', 'Duda']) {
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  watch(ph, name);
  await ph.goto(`${base}/?c=${code}`);
  await ph.waitForTimeout(500);
  await ph.fill('input:not(.code-input)', name);
  await ph.click('button[type=submit]');
  try {
    await ph.waitForFunction(() => window.__bobo?.app.get().joined, null, { timeout: 30_000 });
  } catch {
    await ph.screenshot({ path: path.join(OUT, `fail-${name}.png`) });
    await fail(`${name} não conseguiu entrar pela rede P2P`);
  }
  phones.push({ name, page: ph });
  step(`${name} entrou pelo celular (WebRTC direto na TV)`);
}
await phones[0].page.waitForTimeout(800);
await phones[0].page.screenshot({ path: path.join(OUT, '02-phone-lobby.png') });

// celulares respondem sozinhos qualquer pedido
for (const { page } of phones) {
  await page.evaluate(() => {
    const done = new Set();
    setInterval(() => {
      const s = window.__bobo.app.get().state;
      const req = s?.game?.view?.req;
      if (!req || done.has(req.id)) return;
      done.add(req.id);
      const pickable = (req.options ?? []).filter((o) => !o.disabled);
      const v = {
        text: `resposta ${Math.random().toString(36).slice(2, 7)}`,
        choice: pickable[0]?.id,
        players: pickable[0]?.id,
        multi: pickable.slice(0, req.min ?? 1).map((o) => o.id),
        number: req.min ?? 0,
        draw: { s: [{ c: '#1b1033', w: 12, p: [100, 100, 600, 700, 900, 200] }] },
        taps: 45,
        sequence: Array.from({ length: req.length ?? 4 }, () => 0),
        confirm: true,
      }[req.kind];
      if (v !== undefined) setTimeout(() => window.__bobo.socket.emit('act', { t: 'submit', rid: req.id, v }), 200);
    }, 150);
  });
}

await tv.evaluate(() => window.__bobo.send('bots', { n: 3 }));
await tv.waitForTimeout(1200);
const players = await tv.evaluate(() => window.__bobo.app.get().state.room.players.map((p) => p.name));
step(`na sala: ${players.join(', ')}`);
await tv.evaluate((g) => window.__bobo.send('start', { gameId: g }), GAME);

// derruba a conexão de um celular no meio do jogo e espera reconectar
let reconnected = null;
setTimeout(async () => {
  try {
    const ph = phones[1].page;
    await ph.evaluate(() => window.__bobo.socket.link?.close());
    step('conexão da Duda derrubada de propósito…');
    await ph.waitForFunction(() => window.__bobo.socket.connected && window.__bobo.app.get().state?.game, null, { timeout: 30_000 });
    reconnected = true;
    step('Duda reconectou e voltou pra partida');
  } catch {
    reconnected = false;
  }
}, 9000);

try {
  await tv.waitForFunction(() => window.__bobo.app.get().state.room.scene === 'results', null, { timeout: 420_000 });
} catch {
  await tv.screenshot({ path: path.join(OUT, 'fail-tv.png') });
  await fail(`a partida de ${GAME} não terminou`);
}
await tv.waitForTimeout(4500);
await tv.screenshot({ path: path.join(OUT, '03-tv-results.png') });
await phones[0].page.screenshot({ path: path.join(OUT, '04-phone-results.png') });
const ranking = await tv.evaluate(() => {
  const s = window.__bobo.app.get().state;
  return s.result.ranking.map((e) => `${s.room.players.find((p) => p.id === e.id)?.name}:${e.score}`);
});
step(`resultado: ${ranking.join('  ')}`);
const phoneScene = await phones[0].page.evaluate(() => window.__bobo.app.get().state?.room.scene);
if (phoneScene !== 'results') await fail(`o celular não recebeu o resultado (cena=${phoneScene})`);
if (reconnected === false) await fail('o celular derrubado não reconectou');

console.log(errors.length ? `⚠️ avisos do navegador:\n${errors.slice(0, 10).join('\n')}` : '✅ nenhum erro no navegador');
console.log(`✅ modo online OK (${GAME}) · prints em ${OUT}`);
await browser.close();
server?.close();
process.exit(0);
