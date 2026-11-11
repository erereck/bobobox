// Simulação headless: sobe o servidor com o tempo acelerado, cria uma sala,
// enche de Bobôs e joga cada minigame do começo ao fim. Também conecta um
// "celular" de verdade (socket.io-client) que responde tudo pela rede.
//
//   npm run simulate                 → todos os jogos, 6 jogadores
//   npm run simulate -- garrancho 4  → só um jogo, 4 jogadores
//   npm run simulate -- party 5      → maratona

process.env.BOBO_TIMESCALE ??= '0.03';
process.env.PORT ??= '3999';
const PORT = process.env.PORT;

const errors = [];
const origError = console.error;
console.error = (...a) => {
  errors.push(a.map(String).join(' '));
  origError(...a);
};
const origLog = console.log;
console.log = () => {};
const { server } = await import('../server/index.js');
const { catalog } = await import('../server/games/index.js');
console.log = origLog;
const { io } = await import('socket.io-client');

const [onlyArg, nArg] = process.argv.slice(2);
const N = Number(nArg) || 6;

const url = `http://localhost:${PORT}`;
const host = io(url, { transports: ['websocket'] });
await new Promise((r) => host.on('connect', r));
let state = null;
host.on('state', (s) => (state = s));
const ack = (sock, ev, data) => new Promise((r) => sock.emit(ev, data, r));
const cmd = (c, data = {}) => ack(host, 'host:cmd', { cmd: c, ...data });

const created = await ack(host, 'host:create', {});
const code = created.code;

// Um celular de verdade pela rede, que responde qualquer pedido de forma genérica
const phone = io(url, { transports: ['websocket'] });
await new Promise((r) => phone.on('connect', r));
let phoneState = null;
const answered = new Set();
const phoneKinds = new Set();
phone.on('state', (s) => {
  phoneState = s;
  const req = s.game?.view?.req;
  if (!req || answered.has(req.id)) return;
  answered.add(req.id);
  phoneKinds.add(req.kind);
  const v = genericAnswer(req);
  if (v === undefined) return;
  setTimeout(() => phone.emit('act', { t: 'submit', rid: req.id, v }), 20 + Math.random() * 40);
});
phone.on('toast', ({ msg }) => {
  // pedido recusado (ex.: escreveu a verdade) → tenta de novo com outro texto
  const req = phoneState?.game?.view?.req;
  if (req) {
    answered.delete(req.id);
    setTimeout(() => phone.emit('act', { t: 'submit', rid: req.id, v: genericAnswer(req, true) }), 30);
  }
});
function genericAnswer(req, alt) {
  switch (req.kind) {
    case 'text':
      return alt ? `resposta ${Math.random().toString(36).slice(2, 7)}` : 'uma capivara de terno';
    case 'choice':
    case 'players':
      return req.options.filter((o) => !o.disabled)[0]?.id;
    case 'multi':
      return req.options.filter((o) => !o.disabled).slice(0, req.min ?? 1).map((o) => o.id);
    case 'number':
      return req.min ?? 0;
    case 'draw':
      return { s: [{ c: '#1b1033', w: 10, p: [100, 100, 500, 500, 900, 100] }] };
    case 'taps':
      return 42;
    case 'sequence':
      return Array.from({ length: req.length ?? 4 }, () => 0);
    case 'confirm':
      return true;
    default:
      return undefined;
  }
}
const joined = await ack(phone, 'join', { code, name: 'Tester' });
if (!joined.ok) throw new Error('phone join failed: ' + JSON.stringify(joined));
await cmd('bots', { n: N - 1 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(25);
  }
  throw new Error(`timeout esperando ${label} (cena=${state?.room?.scene}, fase=${state?.game?.phase})`);
}

const results = [];
async function playOne(id) {
  const t0 = Date.now();
  const phases = new Set();
  const e0 = errors.length;
  const res = await cmd('start', { gameId: id });
  if (res?.error) {
    results.push({ id, ok: false, note: res.error });
    return;
  }
  const watch = setInterval(() => state?.game?.phase && phases.add(state.game.phase), 10);
  try {
    await waitFor(() => state?.room?.scene === 'results', 240_000, `fim de ${id}`);
    const r = state.result;
    results.push({
      id,
      ok: errors.length === e0,
      secs: ((Date.now() - t0) / 1000).toFixed(1),
      phases: [...phases].join(','),
      top: r.ranking.slice(0, 3).map((e) => `${state.room.players.find((p) => p.id === e.id)?.name}:${e.score}`).join(' '),
      awards: r.awards.length,
    });
  } catch (e) {
    results.push({ id, ok: false, note: e.message, phases: [...phases].join(',') });
  } finally {
    clearInterval(watch);
  }
  await cmd('menu');
  await sleep(50);
}

if (onlyArg === 'party') {
  const e0 = errors.length;
  await cmd('party', { count: 4 });
  await waitFor(() => state?.room?.scene === 'partyFinal', 600_000, 'final da maratona');
  results.push({ id: 'party', ok: errors.length === e0, note: state.result.played.join(' → ') });
} else {
  const ids = onlyArg ? [onlyArg] : catalog.map((g) => g.id).filter((id) => {
    const g = catalog.find((x) => x.id === id);
    return N >= g.min && N <= g.max;
  });
  for (const id of ids) await playOne(id);
}

console.table(results);
console.log('Pedidos respondidos pelo celular de teste:', [...phoneKinds].join(', ') || '(nenhum)');
console.log(errors.length ? `❌ ${errors.length} erro(s) no servidor` : '✅ nenhum erro no servidor');
host.close();
phone.close();
server.close();
process.exit(errors.length || results.some((r) => !r.ok) ? 1 : 0);
