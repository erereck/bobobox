// QA visual: abre a TV num navegador headless, enche a sala de Bobôs e tira um print
// de cada fase de cada jogo (+ o celular de um jogador de verdade no lobby).
//
//   node scripts/shots.js [jogo ...] [--out pasta]
//
// Usa o Edge/Chrome instalado (variável BROWSER pra apontar outro executável).

import { mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';

process.env.BOBO_TIMESCALE ??= '0.5';
process.env.PORT ??= '3977';
const PORT = process.env.PORT;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.resolve('shots');
await mkdir(OUT, { recursive: true });

const log = console.log;
console.log = () => {};
const { server } = await import('../server/index.js');
const { catalog } = await import('../server/games/index.js');
console.log = log;
const { chromium } = await import('playwright-core');

const exe =
  process.env.BROWSER ??
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => {
    try {
      return !!statSync(p);
    } catch {
      return false;
    }
  });
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(process.env.SHOTS_W) || 1280, height: Number(process.env.SHOTS_H) || 720 } });
page.on('pageerror', (e) => errors.push(`[tv] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && errors.push(`[tv] ${m.text()}`));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

await page.goto(`http://localhost:${PORT}/tv`);
await page.waitForTimeout(700);
await shot('00-splash');
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__bobo?.app.get().state?.room);
const code = await page.evaluate(() => window.__bobo.app.get().code);

// um celular de verdade entra e desenha o avatar
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
phone.on('pageerror', (e) => errors.push(`[cel] ${e.message}`));
await phone.goto(`http://localhost:${PORT}/?c=${code}`);
await phone.waitForTimeout(600);
await phone.screenshot({ path: path.join(OUT, '01-phone-join.png') });
await phone.fill('input:not(.code-input)', 'Erick');
await phone.click('button[type=submit]');
await phone.waitForTimeout(900);
await phone.screenshot({ path: path.join(OUT, '02-phone-lobby.png') });
await phone.close();

await page.evaluate(() => window.__bobo.send('bots', { n: 6 }));
await page.waitForTimeout(2500);
await shot('03-lobby');

const games = args.length ? args : catalog.map((g) => g.id);
for (const id of games) {
  await page.evaluate((gameId) => window.__bobo.send('start', { gameId }), id);
  const seen = new Set();
  let last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 300_000) {
    const st = await page.evaluate(() => {
      const s = window.__bobo.app.get().state;
      return { scene: s.room.scene, phase: s.game?.phase, phaseId: s.game?.phaseId };
    });
    if (st.scene === 'results') {
      await page.waitForTimeout(5500);
      await shot(`${id}-99-results`);
      break;
    }
    if (st.phaseId !== last) {
      last = st.phaseId;
      if (st.phase && !seen.has(st.phase)) {
        seen.add(st.phase);
        await page.waitForTimeout(st.phase === 'fight' ? 6000 : 1300);
        await shot(`${id}-${String(seen.size).padStart(2, '0')}-${st.phase}`);
      }
    }
    await page.waitForTimeout(120);
  }
  process.stdout.write(`${id}: ${[...seen].join(', ')}\n`);
  await page.evaluate(() => window.__bobo.send('menu'));
  await page.waitForTimeout(900);
}

log(errors.length ? `❌ erros no navegador:\n${errors.slice(0, 20).join('\n')}` : '✅ nenhum erro no navegador');
log(`prints em ${OUT}`);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
