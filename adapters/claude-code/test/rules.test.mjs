import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRules, evaluate, isInsideDirectory, loadRules } from '../lib/rules.mjs';

const POSIX_CWD = '/home/dev/proyectos/demo';
const WINDOWS_CWD = 'C:\\Codev\\demo';

const bash = (command, cwd = POSIX_CWD) => ({
  hook_event_name: 'PreToolUse',
  session_id: 's1',
  cwd,
  tool_name: 'Bash',
  tool_input: { command },
});
const tool = (tool_name, tool_input, cwd = POSIX_CWD) => ({ hook_event_name: 'PreToolUse', session_id: 's1', cwd, tool_name, tool_input });
const ruleOf = (native, options) => evaluate(native, options)?.rule ?? null;

function cases(rule, blocked, allowed, cwd = POSIX_CWD) {
  for (const command of blocked) {
    test(`AC-20: ${rule} bloquea ${JSON.stringify(command)}`, () => {
      const native = typeof command === 'string' ? bash(command, cwd) : command;
      const block = evaluate(native, { home: '/home/dev' });
      assert.equal(block?.rule, rule);
      assert.ok(block.reason.length > 10);
    });
  }
  for (const command of allowed) {
    test(`AC-20: ${rule} no bloquea ${JSON.stringify(command)}`, () => {
      const native = typeof command === 'string' ? bash(command, cwd) : command;
      assert.equal(ruleOf(native, { home: '/home/dev' }), null);
    });
  }
}

cases(
  'dangerous-rm',
  [
    'rm -rf /',
    'rm -fr /*',
    'rm -r -f ~',
    'rm -Rf ~/',
    'rm --recursive --force $HOME',
    'rm -rf "${HOME}"',
    'sudo rm -rf /',
    'sudo -u root rm -rf /var/lib',
    'cd src && rm -rf ../../otro',
    'npm test; rm -rf /etc',
    'ls | xargs rm -rf /tmp/x',
    'rm -rf .',
    'bash -c "rm -rf /"',
    '/bin/rm -rf -- /opt',
    'rm -rf dist ~/Documentos',
  ],
  [
    'rm -rf node_modules',
    'rm -rf ./dist build/*',
    'rm -rf src/../dist',
    'rm -f /tmp/fichero',
    'rm -r ~/x',
    `rm -rf ${POSIX_CWD}/coverage`,
    'rm -rf ~/proyectos/demo/.cache',
    'echo "rm -rf /"',
    'npm run clean',
  ],
);

cases(
  'dangerous-rm',
  ['rm -rf C:/Windows', 'rm -rf /', 'rm -rf /c/Users', 'rm -rf "C:\\Codev\\otro"', 'rm -rf ..'],
  ['rm -rf dist', 'rm -rf /c/Codev/demo/dist', 'rm -rf "c:\\codev\\DEMO\\build"', 'rm -rf C:/Codev/demo/out'],
  WINDOWS_CWD,
);

cases(
  'sensitive-file',
  [
    tool('Read', { file_path: `${POSIX_CWD}/.env` }),
    tool('Read', { file_path: `${POSIX_CWD}/config/.env.local` }),
    tool('Write', { file_path: 'C:\\Codev\\demo\\certs\\server.pem', content: 'x' }),
    tool('Edit', { file_path: '/home/dev/.ssh/id_rsa', old_string: 'a', new_string: 'b' }),
    tool('MultiEdit', { file_path: '.env.production', edits: [] }),
    tool('NotebookEdit', { notebook_path: '.env', new_source: '' }),
    'cat .env',
    'cp ~/.ssh/id_rsa /tmp',
    'source .env && npm start',
    'docker run --env-file=.env app',
    'echo SECRET=1 >> .env',
    'grep API config/.env.development',
  ],
  [
    tool('Read', { file_path: `${POSIX_CWD}/.env.example` }),
    tool('Read', { file_path: `${POSIX_CWD}/src/env.ts` }),
    tool('Write', { file_path: `${POSIX_CWD}/.env.sample`, content: 'API_URL=' }),
    tool('Edit', { file_path: `${POSIX_CWD}/.env.template`, old_string: 'a', new_string: 'b' }),
    tool('Read', { file_path: '/home/dev/.ssh/id_rsa.pub' }),
    tool('Grep', { pattern: 'x', path: '.env' }),
    'cat .env.example',
    'echo ".env" >> .gitignore',
    'git commit -m "ignora los .env"',
    'echo "tokens: 5"',
    'npm run env:check',
  ],
);

cases(
  'force-push-main',
  [
    'git push --force origin main',
    'git push -f origin master',
    'git push --force-with-lease origin main',
    'git push origin +main',
    'git push --force origin HEAD:main',
    'git push -uf origin refs/heads/main',
    'git -C repo push --force origin main',
    'npm test && git push -f origin feature/x:master',
  ],
  [
    'git push --force origin feature/x',
    'git push origin main',
    'git push --force',
    'git push -f origin',
    'git push origin +feature/main-refactor',
    'git push --force origin main-backup',
    'echo "git push --force origin main"',
    'git pull --force origin main',
  ],
);

// Valores falsos troceados a propósito: el hook check-secrets del repositorio
// los tomaría por credenciales reales si aparecieran enteros en el código.
const FAKE_AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const FAKE_DB_ASSIGNMENT = 'DB_PASS' + 'WORD="hunter22"';
const FAKE_SLACK_TOKEN = 'xo' + 'xb-1234567890-abcdef';

cases(
  'secret-in-command',
  [
    'curl -H "x-api-key: sk-ant-api03-abcdefghijklmnop" https://api.anthropic.com',
    'OPENAI_API_KEY=sk-abcdefghijklmnopqrstu npm start',
    'gh auth login --with-token ghp_abcdefghijklmnopqrstuvwxyz0123',
    `aws s3 ls # ${FAKE_AWS_KEY}`,
    'curl -H "Authorization: Bearer abcdefghijklmnop" https://api.example.com',
    'export API_KEY=supersecreto',
    `${FAKE_DB_ASSIGNMENT} node migrate.js`,
    `curl -H "Authorization: ${FAKE_SLACK_TOKEN}" https://slack.com`,
  ],
  [
    'echo "tokens: 5"',
    'export API_KEY=$API_KEY',
    'API_KEY=*** npm start',
    'curl -H "Authorization: Bearer $TOKEN" https://api.example.com',
    'export GITHUB_TOKEN="$(gh auth token)"',
    'npm run lint -- --max-warnings=0',
    'git log --oneline -n 5',
  ],
);

test('AC-20: solo se evalúan los PreToolUse', () => {
  assert.equal(evaluate({ ...bash('rm -rf /'), hook_event_name: 'PostToolUse' }), null);
  assert.equal(evaluate({ ...bash('rm -rf /'), hook_event_name: 'UserPromptSubmit' }), null);
});

test('AC-20: sin home conocido, ~ cuenta como fuera del Directorio', () => {
  assert.equal(ruleOf(bash('rm -rf ~/proyectos/demo/.cache')), 'dangerous-rm');
  assert.equal(isInsideDirectory('~/proyectos/demo/x', POSIX_CWD, '/home/dev'), true);
});

test('AC-20: sin cwd solo se aceptan rutas relativas que no suben', () => {
  assert.equal(isInsideDirectory('dist', undefined), true);
  assert.equal(isInsideDirectory('../x', undefined), false);
  assert.equal(isInsideDirectory('/tmp', undefined), false);
});

test('AC-20: una regla desactivada en rules.json no bloquea', () => {
  const rules = { rules: { 'dangerous-rm': { enabled: false } }, projects: {} };
  assert.equal(ruleOf(bash('rm -rf /'), { rules }), null);
  assert.equal(ruleOf(bash('cat .env'), { rules }), 'sensitive-file');
});

test('AC-20: el override por Proyecto desactiva la regla solo en ese Proyecto', () => {
  const rules = { rules: {}, projects: { demo: { disabled: ['sensitive-file'] } } };
  assert.equal(ruleOf(bash('cat .env'), { rules, project: 'demo' }), null);
  assert.equal(ruleOf(bash('cat .env'), { rules, project: 'otro' }), 'sensitive-file');
  assert.equal(ruleOf(bash('rm -rf /'), { rules, project: 'demo' }), 'dangerous-rm');
});

test('AC-20: sin configuración se aplican todas las reglas', () => {
  assert.equal(ruleOf(bash('git push -f origin main')), 'force-push-main');
  assert.deepEqual(Object.keys(defaultRules().rules).sort(), ['dangerous-rm', 'force-push-main', 'secret-in-command', 'sensitive-file']);
});

const tempFile = (name, content) => {
  const path = join(mkdtempSync(join(tmpdir(), 'mandarina-rules-')), name);
  writeFileSync(path, content);
  return path;
};

test('AC-20: loadRules lee el fichero de MANDARINA_RULES', () => {
  const path = tempFile('rules.json', JSON.stringify({ rules: { 'secret-in-command': { enabled: false } }, projects: { demo: { disabled: ['dangerous-rm'] } } }));
  const rules = loadRules({ MANDARINA_RULES: path });
  assert.equal(rules.rules['secret-in-command'].enabled, false);
  assert.equal(ruleOf(bash('export API_KEY=x1'), { rules }), null);
  assert.equal(ruleOf(bash('rm -rf /'), { rules, project: 'demo' }), null);
});

test('AC-20: loadRules sin MANDARINA_RULES usa el rules.json del Adaptador (todas activas)', () => {
  const rules = loadRules({});
  for (const id of ['dangerous-rm', 'force-push-main', 'sensitive-file', 'secret-in-command']) {
    assert.notEqual(rules.rules[id]?.enabled, false, id);
  }
});

test('AC-20: un rules.json mal formado o inexistente aplica todas las reglas', () => {
  for (const path of [tempFile('rules.json', '{ esto no es json'), tempFile('rules.json', '[1, 2]'), tempFile('rules.json', '{"rules": 3}'), join(tmpdir(), 'no-existe-mandarina.json')]) {
    const rules = loadRules({ MANDARINA_RULES: path });
    assert.deepEqual(rules, defaultRules(), path);
  }
});
