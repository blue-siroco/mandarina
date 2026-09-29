import { defineConfig } from 'vitest/config';
import analog from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [analog()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test.ts'],
    // `e2e/**` son specs de Playwright, no de Vitest: comparten el sufijo
    // `.spec.ts` pero cargarlos aquí rompe con `TransformStream is not defined`.
    exclude: ['node_modules', 'dist', '.tools', 'e2e/**', '**/*.node-test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '.tools'],
      // Umbral de partida genérico sobre todo src/app: el boilerplate no
      // presupone capas todavía (ver CLAUDE.md), así que no hay umbrales por
      // carpeta como en el proyecto de origen. Acótalos por capa
      // (application/, mappers/...) en cuanto exista esa separación.
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
