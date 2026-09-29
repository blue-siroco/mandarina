#!/usr/bin/env node
// Gate de proceso spec-first (ver `.claude/skills/gauntlet-audit`): si un push
// toca lógica de producción en `src/app/**` sin tocar ninguna spec en
// `specs/**` ni ningún `*.spec.ts`, es señal de que el cambio no se planificó
// ni se testeó como exige CLAUDE.md. No sustituye al criterio humano, solo
// detecta el caso más burdo: producción sin rastro de spec/test en el mismo
// rango de commits.
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:');

function changedFiles(range) {
  const out = execFileSync('git', ['diff', '--name-only', range], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

function resolveRange() {
  const before = process.env.GITHUB_BEFORE;
  const after = process.env.GITHUB_SHA;
  // `before` es todo-ceros en el primer push de una rama nueva: no hay rango que diffear.
  if (before && after && !/^0+$/.test(before)) {
    return `${before}..${after}`;
  }
  return 'HEAD~1..HEAD';
}

const range = resolveRange();
const files = changedFiles(range).map((f) => f.replace(/^frontend\//, ''));

const isProdSource = (f) =>
  f.startsWith('src/app/') && f.endsWith('.ts') && !f.endsWith('.spec.ts');
const isSpecOrTest = (f) => f.startsWith('specs/') || f.endsWith('.spec.ts');

const prodChanged = files.filter(isProdSource);
const specChanged = files.filter(isSpecOrTest);

if (prodChanged.length > 0 && specChanged.length === 0) {
  console.error(
    `El rango ${range} toca código de producción en src/app/ sin ninguna spec ` +
      `(specs/**) ni test (*.spec.ts) en el mismo rango:`,
  );
  for (const f of prodChanged) console.error(`  - ${f}`);
  console.error(
    '\nAñade o actualiza un fichero en frontend/specs/ y/o un *.spec.ts junto al cambio.',
  );
  process.exit(1);
}

