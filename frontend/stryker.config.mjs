// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  reporters: ['html', 'clear-text', 'progress'],
  // Alcance genérico: el boilerplate no presupone capas (ver CLAUDE.md), así
  // que se muta todo src/app en vez de acotar a application/mappers como en
  // el proyecto de origen. Acótalo en cuanto exista esa separación. Se
  // excluye el wiring de bootstrap (app.config.ts, app.routes.ts) porque no
  // tiene lógica propia que mutar — solo declara providers/rutas, igual que
  // ports/ se excluye en el proyecto de origen "por ser solo el contrato".
  mutate: ['src/app/**/*.ts', '!**/*.spec.ts', '!src/app/app.config.ts', '!src/app/app.routes.ts'],
  // Umbral de partida, no medido todavía sobre código real (el boilerplate
  // apenas tiene lógica propia) — gate de regresión desde el primer commit
  // con dominio, no un objetivo aspiracional. Ajústalo con el mutation score
  // real en cuanto haya casos de uso.
  thresholds: {
    high: 90,
    low: 60,
    break: 60,
  },
};

export default config;
