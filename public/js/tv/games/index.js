// Renderizadores de cada jogo na TV. Cada jogo tem `games/<id>.js` e, se quiser,
// um CSS próprio em `/css/games/<id>.css` (carregado automaticamente).
const IDS = ['bateboca', 'lorota', 'garrancho', 'quiz', 'x9', 'racha', 'contexto', 'rima', 'estampa', 'arena', 'ano'];

export const HOST_GAMES = {};

const results = await Promise.allSettled(IDS.map((id) => import(`./${id}.js`)));
results.forEach((r, i) => {
  const id = IDS[i];
  if (r.status === 'fulfilled') {
    HOST_GAMES[id] = r.value.default;
    if (r.value.default.css) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/css/games/${id}.css`;
      document.head.append(link);
    }
  } else if (!/Failed to fetch|Importing a module script failed|404/i.test(String(r.reason))) {
    console.error(`[bobobox] erro ao carregar o jogo ${id}:`, r.reason);
  }
});
