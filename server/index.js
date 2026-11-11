// BOBOBOX — servidor.
// TV abre /tv, celulares abrem / (ou escaneiam o QR).

import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TIME_SCALE = Number(process.env.BOBO_TIMESCALE) || 1;

const app = express();
app.disable('x-powered-by');

const nm = (...p) => path.join(ROOT, 'node_modules', ...p);
app.get('/vendor/preact.js', (_req, res) => res.type('js').sendFile(nm('htm', 'preact', 'standalone.module.js')));
app.get('/vendor/qrcode.mjs', (_req, res) => res.type('js').sendFile(nm('qrcode-generator', 'dist', 'qrcode.mjs')));
app.get('/vendor/peerjs.min.js', (_req, res) => res.type('js').sendFile(nm('peerjs', 'dist', 'peerjs.min.js')));
// Modo do cliente: aqui tem servidor, então Socket.IO (no site estático da Vercel o build gera mode: 'p2p')
app.get('/config.js', (_req, res) => res.type('js').set('Cache-Control', 'no-store').send("window.BOBO = { mode: 'server' };\n"));
for (const f of ['lilita-one', 'nunito', 'permanent-marker', 'creepster', 'bungee']) {
  app.use(`/fonts/${f}`, express.static(nm('@fontsource', f, 'files'), { maxAge: '7d', immutable: true }));
}
app.get(['/tv', '/tv/'], (_req, res) => res.sendFile(path.join(ROOT, 'public', 'tv.html')));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

/** IPs da rede local, priorizando Wi-Fi/Ethernet de verdade e ignorando adaptadores virtuais. */
function lanAddresses() {
  const out = [];
  const skip = /(vethernet|virtualbox|vmware|loopback|docker|wsl|hyper-v|tailscale|zerotier|vpn|bluetooth)/i;
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      const pri = a.address.startsWith('192.168.') ? 0 : a.address.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3;
      out.push({ ip: a.address, pri });
    }
  }
  return out.sort((a, b) => a.pri - b.pri).map((x) => x.ip);
}

app.get('/api/info', (_req, res) => {
  res.json({
    lan: lanAddresses().map((ip) => `http://${ip}:${PORT}`),
    publicUrl: process.env.PUBLIC_URL || null,
  });
});

app.get('/api/qr.svg', async (req, res) => {
  const u = String(req.query.u ?? '').slice(0, 300);
  if (!u) return res.status(400).end();
  const dark = /^[0-9a-f]{6}$/i.test(String(req.query.c)) ? `#${req.query.c}` : '#1b1033';
  try {
    const svg = await QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff' } });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  } catch {
    res.status(500).end();
  }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 3e6,
  pingInterval: 10_000,
  pingTimeout: 20_000,
  cors: { origin: false },
});
const rooms = new RoomManager(io, { timeScale: TIME_SCALE });
io.on('connection', (socket) => rooms.handle(socket));

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  const line = '─'.repeat(52);
  console.log(`\n  ${line}`);
  console.log('   📦  BOBOBOX tá no ar!');
  console.log(`  ${line}`);
  console.log(`   📺  TV (abra no PC/TV):   http://localhost:${PORT}/tv`);
  for (const ip of lan.slice(0, 2)) console.log(`   📱  Celulares (mesma rede): http://${ip}:${PORT}`);
  if (TIME_SCALE !== 1) console.log(`   ⏩  Escala de tempo: ${TIME_SCALE}`);
  console.log(`  ${line}\n`);
});

export { server, rooms };
