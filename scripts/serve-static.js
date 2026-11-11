// Serve dist/ do jeito que a Vercel serve (URLs limpas: /tv → tv.html). Pra testar o modo online local.
//   npm run build && npm run preview:online

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;
const app = express();
// mesma função que roda na Vercel (servidores ICE pro WebRTC)
const { default: ice } = await import('../api/ice.js');
app.get('/api/ice', ice);
app.use(express.static(path.join(ROOT, 'dist'), { extensions: ['html'] }));
app.use((_req, res) => res.status(404).send('404'));
export const server = app.listen(PORT, () => console.log(`modo online (estático) em http://localhost:${PORT}  ·  TV: http://localhost:${PORT}/tv`));
