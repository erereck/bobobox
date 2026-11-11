// Valida o banco de conteúdo: formatos, lacunas, duplicatas e contagens.
//   npm run check

import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalize, similar } from '../server/util.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const problems = [];
const warn = (file, msg) => problems.push(`${file}: ${msg}`);
const blanks = (s) => (String(s).match(/_{3,}/g) ?? []).length;

function dupes(file, list, key = (x) => x) {
  const seen = new Map();
  for (const it of list) {
    const k = normalize(key(it));
    if (seen.has(k)) warn(file, `duplicado: "${key(it)}"`);
    seen.set(k, true);
  }
}

const checks = {
  'bateboca.js': (d, f) => {
    dupes(f, d.prompts, (x) => x.t);
    for (const p of [...d.prompts, ...d.finals]) if (blanks(p.t) > 1) warn(f, `mais de uma lacuna: ${p.t}`);
  },
  'racha.js': (d, f) => {
    for (const s of d.scenarios) if (blanks(s.t) !== 1) warn(f, `precisa de exatamente uma lacuna: ${s.t}`);
    dupes(f, d.scenarios, (x) => x.t);
  },
  'lorota.js': (d, f) => {
    for (const q of d.questions) {
      if (blanks(q.q) !== 1) warn(f, `lacuna: ${q.q}`);
      if ((q.lies ?? []).length < 3) warn(f, `poucas iscas: ${q.q}`);
      for (const l of q.lies ?? []) if (similar(l, q.a) || (q.alt ?? []).some((a) => similar(l, a))) warn(f, `isca igual à verdade: ${q.q} → ${l}`);
    }
    dupes(f, d.questions, (x) => x.q);
  },
  'quiz.js': (d, f) => {
    for (const q of d.questions) {
      if (q.o?.length !== 4) warn(f, `precisa de 4 opções: ${q.q}`);
      if (!(q.a >= 0 && q.a <= 3)) warn(f, `índice inválido: ${q.q}`);
    }
    for (const c of d.final) {
      if (c.yes.length < 2 || c.no.length < 2) warn(f, `categoria curta: ${c.cat}`);
      for (const y of c.yes) if (c.no.some((n) => normalize(n) === normalize(y))) warn(f, `item nos dois lados: ${c.cat} → ${y}`);
    }
    dupes(f, d.questions, (x) => x.q);
  },
  'x9.js': (d, f) => {
    for (const it of d.items) {
      if (!it.a || !it.b) warn(f, `item sem a/b`);
      if (it.type === 'number' && !(it.min < it.max)) warn(f, `min/max: ${it.a}`);
      if (it.type === 'choice' && !(it.options?.length >= 3)) warn(f, `opções: ${it.a}`);
    }
  },
  'rima.js': (d, f) => {
    for (const s of d.setups) {
      if (!s.l.includes('{alvo}')) warn(f, `sem {alvo}: ${s.l}`);
      if ((s.rhymes ?? []).length < 6) warn(f, `poucas rimas: ${s.l}`);
      if (!(s.fb ?? []).length) warn(f, `sem fallback: ${s.l}`);
    }
  },
  'garrancho.js': (d, f) => dupes(f, d.prompts),
};

const files = (await readdir(dir)).filter((f) => f.endsWith('.js')).sort();
for (const f of files) {
  const d = (await import(`../content/${f}`)).default;
  const counts = Object.entries(d)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : typeof v}`)
    .join('  ');
  console.log(`${f.padEnd(14)} ${counts}`);
  checks[f]?.(d, f);
}
if (problems.length) {
  console.log(`\n⚠️  ${problems.length} problema(s):`);
  for (const p of problems.slice(0, 60)) console.log('  -', p);
  process.exitCode = 1;
} else console.log('\n✅ conteúdo ok');
