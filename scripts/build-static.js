// Gera o site estático do modo online (pra Vercel ou qualquer hospedagem estática) em dist/.
//
// No modo online não existe servidor de jogo: a TV roda o motor (server/ + content/) no
// navegador e os celulares conectam nela por WebRTC. Este script só junta os arquivos:
//   public/        → páginas, CSS e JS do cliente
//   server/ + content/ → o motor, importado pelo navegador da TV
//   vendor/ + fonts/   → bibliotecas e fontes que no modo servidor vêm do node_modules
//   config.js      → { mode: 'p2p' }
//
//   npm run build

import { cp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const nm = (...p) => path.join(ROOT, 'node_modules', ...p);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1) cliente
await cp(path.join(ROOT, 'public'), OUT, { recursive: true });

// 2) motor do jogo (sem o servidor HTTP/Socket.IO, que não existe aqui)
await cp(path.join(ROOT, 'server'), path.join(OUT, 'server'), {
  recursive: true,
  filter: (src) => !/[\\/]server[\\/]index\.js$/.test(src),
});
await cp(path.join(ROOT, 'content'), path.join(OUT, 'content'), { recursive: true });

// 3) bibliotecas
await mkdir(path.join(OUT, 'vendor'), { recursive: true });
await cp(nm('htm', 'preact', 'standalone.module.js'), path.join(OUT, 'vendor', 'preact.js'));
await cp(nm('qrcode-generator', 'dist', 'qrcode.mjs'), path.join(OUT, 'vendor', 'qrcode.mjs'));
await cp(nm('peerjs', 'dist', 'peerjs.min.js'), path.join(OUT, 'vendor', 'peerjs.min.js'));
await cp(nm('peerjs', 'dist', 'peerjs.min.js.map'), path.join(OUT, 'vendor', 'peerjs.min.js.map'));

// 4) fontes
for (const f of ['lilita-one', 'nunito', 'permanent-marker', 'creepster', 'bungee']) {
  await cp(nm('@fontsource', f, 'files'), path.join(OUT, 'fonts', f), {
    recursive: true,
    // só o que o CSS usa: woff2, alfabeto latino (cobre o português), estilo normal
    filter: (src) => statSync(src).isDirectory() || /-latin-\d+-normal\.woff2$/.test(src),
  });
}

// 5) modo online
const cfg = {
  mode: 'p2p',
  // Opcional: servidor PeerJS próprio (BOBO_PEER_HOST/PORT/PATH/SECURE) e ICE fixo (BOBO_ICE='[{"urls":"turn:..."}]').
  // Na Vercel, prefira TURN pela função api/ice.js (credenciais temporárias; a chave fica secreta).
  ...(process.env.BOBO_PEER_HOST
    ? {
        peerHost: process.env.BOBO_PEER_HOST,
        peerPort: Number(process.env.BOBO_PEER_PORT) || 443,
        peerPath: process.env.BOBO_PEER_PATH || '/',
        peerSecure: process.env.BOBO_PEER_SECURE !== 'false',
      }
    : {}),
  ...(process.env.BOBO_ICE ? { iceServers: JSON.parse(process.env.BOBO_ICE) } : {}),
};
await writeFile(path.join(OUT, 'config.js'), `window.BOBO = ${JSON.stringify(cfg)};\n`);

// resumo
let files = 0;
let bytes = 0;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else {
      files++;
      bytes += (await stat(p)).size;
    }
  }
}
await walk(OUT);
console.log(`✅ site estático gerado em dist/ (${files} arquivos, ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
