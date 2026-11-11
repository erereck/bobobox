# 📦 BOBOBOX

**A festa de minigames que acontece no seu celular.** Abre na TV, todo mundo escaneia o QR code e joga pelo celular — sem instalar nada. Tudo em português do Brasil, com narrador falando de verdade, trilha sonora gerada na hora e um apresentador que é uma caixa de papelão sarcástica.

> Inspirado no formato de party games de sala (TV + celulares), com jogos, personagens, arte, música e conteúdo 100% originais.

## Os jogos

| | Jogo | Jogadores | Em uma frase |
|---|---|---|---|
| 🥊 | **Bate-Boca** | 3–10 | Duelo de respostas engraçadas; a sala vota; levou todos os votos é **LAVADA**. |
| 🤥 | **Lorota** | 2–8 | Fatos reais e bizarros com uma lacuna: invente a mentira mais convincente e ache a verdade. |
| 🖍️ | **Garrancho** | 3–8 | Desenhe um tema secreto; a galera inventa títulos falsos; quem acha o verdadeiro? |
| 💀 | **Quiz Macabro** | 1–8 | Trivia num hotel assombrado: errou, sala de tortura; morreu, vira fantasma; no fim, a grande fuga. |
| 🕵️ | **X9** | 4–10 | Todos respondem a mesma pergunta, menos o infiltrado — que nem sabe que é ele. Debatam e votem. |
| ⚖️ | **Racha a Sala** | 3–12 | Complete um dilema pra dividir a sala exatamente ao meio. |
| 📰 | **Fora de Contexto** | 3–8 | Sua resposta inocente vira manchete, mensagem da tia no zap, placa, avaliação 1 estrela… |
| 🎤 | **Batalha de Rima** | 3–8 | Duelos de MC: complete provocações rimadas e ouça a TV cantar tudo em cima do beat. |
| 👕 | **Estampa Braba** | 3–8 | Desenhe, escreva frases, combine em camisetas e veja elas brigarem num mata-mata. |
| 🏟️ | **Arena Bobo** | 2–12 | Tempo real: o celular vira controle e as caixinhas se empurram pra fora da plataforma. |

E ainda:

- 🏆 **Maratona** — vários jogos seguidos, placar acumulado, prêmios e um campeão no final.
- 🍿 **Modo demo** — os Bobôs (jogadores-robô) jogam sozinhos pra você assistir.
- 👥 **Plateia** — quem chega com a partida rolando entra votando (e ainda influencia o resultado).
- 👑 **VIP** — o primeiro a entrar escolhe os jogos pelo próprio celular.
- 🎨 **Avatar desenhado** — cada um desenha a própria cara no celular e ela aparece na TV.
- 😂 **Reações** — emojis do celular voam na TV em tempo real.
- 🗣️ **Narrador com voz** (Web Speech, pt-BR) + legendas, **trilha e efeitos 100% sintetizados** (Web Audio).
- ⏸️ Pausar, pular, tempo extra, Modo Família, modo streamer (esconde o código), reconexão automática.

## Rodando

Precisa de [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm start
```

- Abra **http://localhost:3000/tv** no computador ligado na TV (melhor em tela cheia — tecla **F**).
- Os celulares precisam estar **na mesma rede Wi-Fi**: é só escanear o QR code da TV.
- No Windows, se o celular não conectar, libere o Node no Firewall quando ele perguntar (redes privadas).

> 🗣️ **Dica:** abra a TV no **Microsoft Edge** — ele tem vozes neurais em pt-BR (Francisca/Antonio) muito mais naturais pro narrador. No Chrome também funciona, com a voz do Google.

Atalhos na TV: **Espaço** pula · **P** pausa · **F** tela cheia · **M** mudo · **Esc** volta pro menu.

### Variáveis de ambiente

| Variável | Padrão | Pra quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `PUBLIC_URL` | — | URL pública usada no QR code (ex.: quando hospedado na internet) |
| `BOBO_TIMESCALE` | `1` | Acelera/desacelera todos os tempos (testes) |

### Jogar pela internet

O Bobobox é um servidor Node comum (Express + Socket.IO), então roda em qualquer lugar que aceite WebSocket — Render, Railway, Fly.io, uma VPS… Defina `PUBLIC_URL` com o endereço final pro QR code apontar certo.

## Testes

```bash
npm run simulate                  # joga TODOS os jogos com bots + um "celular" de teste pela rede
npm run simulate -- garrancho 4   # um jogo específico, com 4 jogadores
npm run simulate -- party 6       # uma maratona inteira
```

A simulação sobe o servidor com o tempo acelerado e falha se qualquer jogo travar ou der erro.

```bash
npm run shots -- quiz arena      # QA visual: abre a TV num Edge/Chrome headless e tira print de cada fase
```

Os prints vão pra pasta `shots/` (ou `--out pasta`). Precisa de um Edge ou Chrome instalado (ou `BROWSER=/caminho/do/navegador`).

## Como é feito

```
server/           Node + Express + Socket.IO
  room.js         salas, jogadores, plateia, VIP, maratona, sincronização
  game.js         classe base dos jogos (roteiro async, pedidos pros celulares, timers, pausa/pular)
  bots.js         os Bobôs: respondem qualquer pedido
  games/*.js      um arquivo por jogo
content/          banco de conteúdo em PT-BR (prompts, fatos, trivia, rimas…)
public/
  tv.html         a TV (Preact + htm, sem build)
  index.html      o controle do celular
  js/shared/      áudio sintetizado, arte vetorial (avatares, mascote), núcleo de rede
  js/tv/          TV: narrador, fundo WebGL, lobby, componentes e um renderizador por jogo
  js/play/        celular: entrada, prancheta de desenho, todos os tipos de pedido
```

Cada jogo é um roteiro `async` no servidor que pede coisas pros celulares (`texto`, `escolha`, `desenho`, `número`, `toques`, `sequência`, `joystick`…). O celular sabe desenhar qualquer pedido; a TV tem um renderizador por jogo. Não tem etapa de build: `npm start` e pronto.

## Licença

MIT.
