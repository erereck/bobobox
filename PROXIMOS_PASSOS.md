# Próximos passos (estado em 10/11/2026)

## Onde está tudo
- **Site no ar (Vercel):** https://bobobox-eta.vercel.app — TV em `/tv`. Cada push na `main` republica sozinho.
- **Repositório:** https://github.com/erereck/bobobox (público).
- **Modo online:** site estático; a TV roda o motor (`server/` + `content/` no navegador) e os celulares conectam nela por WebRTC (PeerJS). Detalhes no README.
- **Modo local:** `npm start` (Node + Socket.IO), igual sempre.

## Testes que existem
```bash
npm run simulate                 # 11 jogos com bots, modo servidor
npm run shots -- quiz            # prints de cada fase (Edge/Chrome headless)
npm run build && npm run test:online                               # modo online local
node scripts/test-online.js bateboca --url https://bobobox-eta.vercel.app  # site publicado
```

## TURN (pra quem está no 4G conectar)
Os TURN padrão do PeerJS não existem mais. Sem TURN, funciona no mesmo Wi-Fi e na maioria das redes de casa.
Pra garantir 4G/redes corporativas: criar TURN grátis na Cloudflare (Realtime → TURN, 1 TB/mês) e cadastrar na Vercel
(Settings → Environment Variables) `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`, depois redeploy.
A função `api/ice.js` passa a entregar credenciais temporárias. (Metered e TURN fixo também funcionam — ver o arquivo.)

## Revisão adversária do modo online — achados AINDA NÃO VERIFICADOS
Os 4 revisores terminaram; a etapa dos céticos (que derruba falsos positivos) não terminou. Conferir cada um antes de mexer.
Já corrigidos: TURN morto (lista ICE explícita + `/api/ice`), fontes sobrando, sourcemap do PeerJS, `BOBO_PEER_HOST` completo.

**Prioridade alta (provável bug real)**
1. TV presa em "Montando a caixa…" se não conseguir registrar o peer no PeerJS: o erro do `host:create` não aparece e não há nova tentativa (`public/js/tv/main.js` → `onRoom`/`openRoom`). Mostrar erro + botão "tentar de novo".
2. Celular preso em "Reconectando…" pra sempre quando a sala some (TV recarregada/fechada): o retry engole `peer-unavailable` (`public/js/shared/p2p.js`). Depois de N falhas por "sala não encontrada", voltar pra tela de entrada com aviso.
3. `connectTo` reaproveita a tentativa em andamento mesmo quando o código mudou (`p2p.js`).
4. Sem heartbeat no link P2P: conexão "zumbi" parece conectada (`server/transport.js`/`p2p.js`). Ping a cada ~5 s; sem resposta em ~15 s → fecha e reconecta.
5. Acks pendentes nunca liquidam quando o link cai ("Entrando…" eterno) e `timeout()` deixa entrada no Map (`server/transport.js`).
6. Servidor Node: handlers chamam `ack?.()` sem checar se é função — um pacote malformado derruba o processo (pré-existente; `server/rooms.js`). Trocar por `typeof ack === 'function'`.

**Abuso / robustez (modo online)**
7. Mensagem BinaryPack malformada de poucos bytes pode travar a TV (decodificador do PeerJS sem limite). Avaliar trocar a serialização pra `'json'` (+ limitar tamanho) ou validar antes de decodificar.
8. Uma conexão consegue criar vários jogadores/plateia (`join` repetido em `server/room.js`); limitar 1 jogador por conexão e teto de plateia.
9. Sem limite de taxa por conexão (`in`/`act`/`avatar`) — rate limit simples no `EndpointSocket`.
10. `EndpointSocket` aceita eventos reservados vindos da rede (ex.: `'disconnect'`) — ignorar `connect`/`disconnect`/`error` remotos.
11. "TV impostora": se a TV perde a sinalização, outro peer poderia registrar `bobobox-CÓDIGO` (baixo risco; códigos aleatórios).
12. Qualquer um assume o lugar de um jogador desconectado digitando o mesmo nome (`server/room.js`, `join` → ghost). Considerar exigir o token durante a partida.

**Menores**
13. Margem do QR (`qrcode-generator` usa pixels): zona de silêncio ficou pequena — usar `margin: 8*4`.
14. `games/index.js` no navegador carrega os jogos em série e some com um jogo se o fetch falhar sem avisar.
15. `volatile` não descarta nada no P2P (canal confiável) — joystick pode acumular atraso em rede ruim.
16. QR usa `location.origin`: abrir a TV numa URL de *preview* protegida da Vercel manda os celulares pro login. Usar sempre o domínio de produção.
17. Sem Wake Lock na TV no modo online (aba oculta atrasa o jogo).
