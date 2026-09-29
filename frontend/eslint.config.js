// @ts-check
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const importX = require('eslint-plugin-import-x');
const sonarjs = require('eslint-plugin-sonarjs');
const jest = require('eslint-plugin-jest');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.tools/**',
      'out-tsc/**',
      'node_modules/**',
      'coverage/**',
      'reports/**',
      '.stryker-tmp/**',
    ],
  },
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
      sonarjs.configs.recommended,
    ],
    processor: angular.processInlineTemplates,
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    rules: {
      complexity: ['error', 10],
      'import-x/no-cycle': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  // Reglas de fronteras arquitectónicas por capa (no-restricted-imports entre
  // application/ports/presentation/infraestructure): este boilerplate no
  // presupone arquitectura hexagonal (ver CLAUDE.md). Añádelas aquí, siguiendo
  // el mismo patrón, en cuanto el proyecto adopte esas carpetas.
  {
    files: ['src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['src/**/*.spec.ts'],
    plugins: { jest },
    settings: {
      // El proyecto usa Vitest con globals compatibles con Jest, no el paquete `jest`;
      // sin esto, eslint-plugin-jest no puede autodetectar versión y revienta.
      jest: { version: 29 },
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      'jest/expect-expect': 'error',
      'jest/no-disabled-tests': 'error',
      'jest/no-conditional-expect': 'error',
      'jest/max-nested-describe': 'error',
      'jest/prefer-strict-equal': 'error',
      // sonarjs/no-duplicate-string genera ruido en specs con literales de aserciones repetidos.
      'sonarjs/no-duplicate-string': 'off',
    },
  },
);
