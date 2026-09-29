#!/usr/bin/env node
// Cruza la complejidad ciclomática (ESLint `complexity`) con la cobertura por
// función (coverage-final.json de Vitest/v8) para aproximar el riesgo CRAP
// (`CRAP = CC^2 * (1-cov)^3 + CC`, ver `.claude/skills/gauntlet-audit`).
// Sin este cruce, un umbral de complejidad y uno de cobertura por separado no
// detectan el caso de mayor riesgo real: función compleja y sin tests.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const root = fileURLToPath(new URL('..', import.meta.url));
const coveragePath = new URL('../coverage/coverage-final.json', import.meta.url);
// Umbral de partida genérico (sin código de dominio propio todavía): ajústalo
// cuando exista lógica real, igual que en el proyecto de origen.
const threshold = Number(process.argv[2] ?? process.env.CRAP_THRESHOLD ?? 22);

function runEslintComplexity() {
  try {
    // `eslint/bin/eslint.js` no es un subpath exportado en package.json,
    // así que resolvemos el directorio del paquete y componemos la ruta.
    const eslintBin = join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
    execFileSync(
      process.execPath,
      [eslintBin, 'src', '--format', 'json', '--rule', '{"complexity":["error",1]}'],
      { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
    );
    return [];
  } catch (error) {
    // ESLint sale con exit code 1 porque el umbral 1 fuerza a reportar toda
    // función; el JSON útil llega igualmente por stdout.
    return JSON.parse(error.stdout);
  }
}

function parseComplexity(message) {
  const match = /has a complexity of (\d+)/.exec(message);
  return match ? Number(match[1]) : null;
}

function findFunction(fnMap, line) {
  let best = null;
  for (const key of Object.keys(fnMap)) {
    const fn = fnMap[key];
    if (fn.decl.start.line === line) return { key, fn };
    const start = fn.loc.start.line;
    const end = fn.loc.end.line ?? fn.loc.start.line;
    if (line >= start && line <= end) {
      const span = end - start;
      if (!best || span < best.span) best = { key, fn, span };
    }
  }
  return best;
}

function functionCoverage(entry, fn, key) {
  const start = fn.loc.start.line;
  const end = fn.loc.end.line ?? start;
  const statementIds = Object.keys(entry.statementMap).filter((id) => {
    const line = entry.statementMap[id].start.line;
    return line >= start && line <= end;
  });
  if (statementIds.length === 0) {
    return entry.f[key] > 0 ? 1 : 0;
  }
  const covered = statementIds.filter((id) => entry.s[id] > 0).length;
  return covered / statementIds.length;
}

function crap(cc, cov) {
  return cc ** 2 * (1 - cov) ** 3 + cc;
}

const coverage = JSON.parse(readFileSync(coveragePath));
const eslintResults = runEslintComplexity();

const risks = [];
for (const file of eslintResults) {
  if (file.filePath.endsWith('.spec.ts')) continue;
  const entry = coverage[file.filePath];
  if (!entry) continue;
  for (const message of file.messages) {
    if (message.ruleId !== 'complexity') continue;
    const cc = parseComplexity(message.message);
    const found = findFunction(entry.fnMap, message.line);
    if (cc === null || !found) continue;
    const cov = functionCoverage(entry, found.fn, found.key);
    const score = crap(cc, cov);
    risks.push({
      file: file.filePath.replace(root, ''),
      name: message.message.split(" has a complexity")[0],
      line: message.line,
      cc,
      coverage: Math.round(cov * 100),
      crap: Math.round(score * 100) / 100,
    });
  }
}

risks.sort((a, b) => b.crap - a.crap);

for (const r of risks.slice(0, 20)) {
}

const offenders = risks.filter((r) => r.crap > threshold);
if (offenders.length > 0) {
  console.error(
    `\n${offenders.length} función(es) superan el umbral CRAP de ${threshold}:`,
  );
  for (const r of offenders) {
    console.error(`  - ${r.name} (${r.file}:${r.line}) CRAP=${r.crap}`);
  }
  process.exit(1);
}
