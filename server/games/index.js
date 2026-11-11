// Registro de todos os minigames do Bobobox.
// Cada jogo é um arquivo `<id>.js` nesta pasta; a ordem abaixo é a ordem do menu.

const ORDER = ['bateboca', 'lorota', 'garrancho', 'quiz', 'x9', 'racha', 'contexto', 'rima', 'estampa', 'arena', 'ano'];

export const GAMES = [];
for (const id of ORDER) {
  try {
    const mod = await import(`./${id}.js`);
    GAMES.push(mod.default);
  } catch (e) {
    // Jogo ausente ou quebrado: o servidor sobe sem ele (e avisa), em vez de derrubar a festa inteira.
    if (!(e.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(`${id}.js`))) {
      console.warn(`[bobobox] jogo "${id}" não carregou: ${e.message.split('\n')[0]}`);
    }
  }
}

export const gameById = Object.fromEntries(GAMES.map((G) => [G.meta.id, G]));

/** Metadados públicos (vão pra TV e pros celulares). */
export const catalog = GAMES.map(({ meta }) => ({
  id: meta.id,
  name: meta.name,
  tag: meta.tag,
  emoji: meta.emoji,
  desc: meta.desc,
  min: meta.min,
  max: meta.max,
  mins: meta.mins,
  color: meta.color,
  color2: meta.color2,
  kind: meta.kind,
  rules: meta.rules,
  font: meta.font ?? null,
}));
