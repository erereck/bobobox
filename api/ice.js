// Função da Vercel: entrega os servidores ICE (STUN/TURN) pro WebRTC do modo online.
//
// Sem configuração nenhuma devolve só STUN públicos — funciona na mesma rede Wi-Fi e na
// maioria das redes de casa. Pra garantir conexão em 4G/redes corporativas, cadastre um
// TURN nas variáveis de ambiente do projeto na Vercel (Settings → Environment Variables)
// e faça redeploy. As credenciais saem daqui temporárias: a chave secreta nunca vai pro navegador.
//
//   Cloudflare (1 TB/mês grátis):  CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//   Metered (plano grátis):         METERED_DOMAIN (ex.: seuapp.metered.live) + METERED_API_KEY
//   Qualquer TURN com senha fixa:   TURN_URLS (separadas por vírgula) + TURN_USERNAME + TURN_CREDENTIAL

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

async function fetchJson(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function iceServers(env = process.env) {
  try {
    if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
      const j = await fetchJson(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86_400 }),
      });
      const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
      if (list.length) return { iceServers: [...STUN, ...list], turn: 'cloudflare' };
    }
    if (env.METERED_DOMAIN && env.METERED_API_KEY) {
      const list = await fetchJson(`https://${env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`);
      if (Array.isArray(list) && list.length) return { iceServers: [...STUN, ...list], turn: 'metered' };
    }
    if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
      const urls = env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
      return { iceServers: [...STUN, { urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }], turn: 'static' };
    }
  } catch (e) {
    console.error('[ice] falha ao gerar credenciais TURN:', e.message);
  }
  return { iceServers: STUN, turn: null };
}

export default async function handler(_req, res) {
  const body = await iceServers();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify(body));
}
