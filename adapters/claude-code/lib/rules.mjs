// Reglas de bloqueo del hook PreToolUse (ADR-0004, ADR-0006). Se evalúan en
// local, sin red, para proteger aunque Mandarina esté caído. Sin dependencias:
// el Adaptador corre en el host con Node a pelo.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RULE_IDS = ['dangerous-rm', 'force-push-main', 'sensitive-file', 'secret-in-command'];

const DEFAULT_RULES_PATH = fileURLToPath(new URL('../rules.json', import.meta.url));

/** Configuración con todas las reglas activas y sin overrides de Proyecto. */
export function defaultRules() {
  return { rules: Object.fromEntries(RULE_IDS.map((id) => [id, { enabled: true }])), projects: {} };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Lee `rules.json` (o el fichero de `MANDARINA_RULES`). Si falta o está mal
 * formado se aplican todas las reglas: ante la duda, proteger.
 */
export function loadRules(env = process.env) {
  const path = env.MANDARINA_RULES || DEFAULT_RULES_PATH;
  try {
    const config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    if (!isObject(config) || (config.rules !== undefined && !isObject(config.rules)) || (config.projects !== undefined && !isObject(config.projects))) {
      throw new Error('estructura inesperada');
    }
    return { rules: config.rules ?? {}, projects: config.projects ?? {} };
  } catch (error) {
    if (env.MANDARINA_DEBUG) process.stderr.write(`mandarina: reglas no válidas en ${path} (${error.message}); se aplican todas\n`);
    return defaultRules();
  }
}

// Una regla ausente o con una entrada rara cuenta como activa, para que una
// regla nueva proteja sin tener que tocar el rules.json de cada máquina.
function isEnabled(config, id, project) {
  if (config.rules?.[id]?.enabled === false) return false;
  const disabled = config.projects?.[project]?.disabled;
  return !(Array.isArray(disabled) && disabled.includes(id));
}

// ---------------------------------------------------------------------------
// Troceado de comandos de shell. No es un parser de Bash completo: basta con
// separar comandos encadenados, respetar comillas y distinguir redirecciones.

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '`']);

/** Divide un comando en segmentos (`&&`, `;`, `|`...) de palabras `{ text, redirect }`. */
export function splitCommand(command) {
  const segments = [];
  let tokens = [];
  let word = '';
  let inWord = false;
  let pendingRedirect = false;
  const endWord = () => {
    if (inWord) {
      tokens.push({ text: word, redirect: pendingRedirect });
      pendingRedirect = false;
    }
    word = '';
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    pendingRedirect = false;
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      const stop = end === -1 ? command.length : end;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== '"') {
        if (command[j] === '\\' && '"\\$`'.includes(command[j + 1] ?? '')) j++;
        word += command[j++] ?? '';
      }
      inWord = true;
      i = j;
    } else if (c === '$' && next === '{') {
      const end = command.indexOf('}', i);
      const stop = end === -1 ? command.length - 1 : end;
      word += command.slice(i, stop + 1);
      inWord = true;
      i = stop;
    } else if (c === '$' && next === '(') {
      // `$(...)`: lo de dentro también se ejecuta, así que se evalúa como otro segmento.
      endSegment();
      i++;
    } else if (c === '#' && !inWord) {
      const end = command.indexOf('\n', i);
      i = end === -1 ? command.length : end - 1;
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // `2>` o `&>`: el número o el `&` es el descriptor, no una palabra.
      if (/^\d+$/.test(word)) {
        word = '';
        inWord = false;
      } else endWord();
      while ('<>&|'.includes(command[i + 1] ?? ' ')) i++;
      pendingRedirect = true;
    } else if (c === '\\' && next === '\n') {
      i++;
    } else if (SEPARATORS.has(c)) {
      endSegment();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endSegment();
  return segments;
}

// Envoltorios que ejecutan el comando que les sigue, con las opciones que
// consumen argumento (para no confundir `sudo -u root rm` con el comando `root`).
const WRAPPERS = {
  sudo: ['-u', '-g', '-U', '-C', '-D', '-h', '-p', '-r', '-t'],
  doas: ['-u', '-C'],
  env: ['-u', '-C', '-S'],
  nice: ['-n'],
  xargs: ['-I', '-n', '-P', '-d', '-L', '-a', '-E', '-s'],
  nohup: [],
  time: [],
  command: [],
  builtin: [],
  exec: [],
  then: [],
  do: [],
  else: [],
  '{': [],
  '!': [],
};
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const MAX_NESTING = 3;

function basename(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function commandOf(tokens) {
  const redirects = tokens.filter((t) => t.redirect).map((t) => t.text);
  const words = tokens.filter((t) => !t.redirect).map((t) => t.text);
  let i = 0;
  while (i < words.length) {
    const name = basename(words[i]);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) {
      i++; // `VAR=valor comando`
    } else if (Object.hasOwn(WRAPPERS, name)) {
      i++;
      while (i < words.length && words[i].startsWith('-')) i += WRAPPERS[name].includes(words[i]) ? 2 : 1;
    } else {
      return { name, args: words.slice(i + 1), redirects };
    }
  }
  return { name: null, args: [], redirects };
}

/** Comandos simples de una línea de shell, incluidos los de `bash -c "..."` y `eval`. */
export function commandsIn(command, depth = 0) {
  const result = [];
  for (const tokens of splitCommand(command)) {
    const cmd = commandOf(tokens);
    result.push(cmd);
    if (depth >= MAX_NESTING) continue;
    if (SHELLS.has(cmd.name)) {
      const flag = cmd.args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
      if (flag !== -1 && cmd.args[flag + 1] !== undefined) result.push(...commandsIn(cmd.args[flag + 1], depth + 1));
    } else if (cmd.name === 'eval') {
      result.push(...commandsIn(cmd.args.join(' '), depth + 1));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rutas. El hook puede correr en Windows con rutas `C:\...` mientras Claude
// Code escribe comandos de Git Bash con rutas POSIX (`/c/...`), así que no se
// usa `node:path`, que solo entiende las del SO en el que corre.

function parsePath(raw) {
  let rest = raw.replace(/\\/g, '/');
  let root = null;
  const drive = /^([A-Za-z]):/.exec(rest);
  if (drive) {
    root = `${drive[1].toLowerCase()}:`;
    rest = rest.slice(2);
  } else if (rest.startsWith('/')) {
    root = '/';
  }
  return { root, segments: rest.split('/').filter(Boolean) };
}

function resolveSegments(base, segments) {
  const out = [...base];
  for (const segment of segments) {
    if (segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out;
}

const HOME_REF = /^(~|\$HOME|\$\{HOME\})(?=[\\/]|$)/;

/**
 * ¿Queda `target` estrictamente dentro de `cwd`? Borrar el propio Directorio o
 * algo por encima de él cuenta como fuera.
 */
export function isInsideDirectory(target, cwd, home) {
  let path = target;
  const homeRef = HOME_REF.exec(path);
  if (homeRef) {
    // Sin saber dónde está el home no se puede comprobar: se asume fuera.
    if (!home) return false;
    path = home + path.slice(homeRef[0].length);
  } else if (path.startsWith('~')) {
    return false; // `~otro_usuario`
  }

  // Sin Directorio conocido se usa una raíz virtual: solo se aceptan rutas relativas que no suban.
  const base = cwd ? parsePath(cwd) : { root: '\0cwd', segments: ['\0cwd'] };
  let parsed = parsePath(path);
  const gitBashDrive = /^[A-Za-z]$/.test(parsed.segments[0] ?? '');
  if (parsed.root === '/' && base.root?.endsWith(':') && gitBashDrive) {
    parsed = { root: `${parsed.segments[0].toLowerCase()}:`, segments: parsed.segments.slice(1) };
  }
  const root = parsed.root ?? base.root;
  const segments = parsed.root ? resolveSegments([], parsed.segments) : resolveSegments(base.segments, parsed.segments);
  if (root !== base.root || segments.length <= base.segments.length) return false;

  // Las rutas de Windows no distinguen mayúsculas.
  const fold = root.endsWith(':') ? (s) => s.toLowerCase() : (s) => s;
  return base.segments.every((segment, i) => fold(segment) === fold(segments[i]));
}

// ---------------------------------------------------------------------------
// Reglas. Cada una devuelve el motivo (en español, para quien usa Claude Code) o null.

function dangerousRm(native, { home }) {
  if (native.tool_name !== 'Bash') return null;
  for (const { name, args } of commandsIn(String(native.tool_input?.command ?? ''))) {
    if (name !== 'rm') continue;
    let recursive = false;
    let force = false;
    const targets = [];
    let optionsEnded = false;
    for (const arg of args) {
      if (optionsEnded || !arg.startsWith('-') || arg === '-') targets.push(arg);
      else if (arg === '--') optionsEnded = true;
      else if (arg === '--recursive') recursive = true;
      else if (arg === '--force') force = true;
      else if (!arg.startsWith('--')) {
        if (/[rR]/.test(arg)) recursive = true;
        if (arg.includes('f')) force = true;
      }
    }
    if (!recursive || !force) continue;
    const outside = targets.find((target) => !isInsideDirectory(target, native.cwd, home));
    if (outside !== undefined) {
      return `rm -rf sobre "${outside}", fuera del Directorio de la Sesión. Borra solo rutas dentro del proyecto.`;
    }
  }
  return null;
}

// Las plantillas de `.env` se versionan a propósito y no llevan valores
// reales; bloquearlas impediría tareas legítimas como documentar variables.
const ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template']);

/** ¿Es un fichero de secretos (`.env*`, `*.pem`, `id_rsa*`)? */
export function isSensitiveFile(path) {
  const name = basename(String(path)).toLowerCase();
  if (ENV_TEMPLATES.has(name)) return false;
  // La clave pública se comparte por diseño; la privada es `id_rsa` a secas.
  if (name.startsWith('id_rsa') && name.endsWith('.pub')) return false;
  return name.startsWith('.env') || name.endsWith('.pem') || name.startsWith('id_rsa');
}

const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// Solo imprimen sus argumentos: `echo ".env" >> .gitignore` no toca el `.env`,
// aunque sí se vigila adónde redirigen.
const PRINTERS = new Set(['echo', 'printf']);

function sensitiveFile(native) {
  const reason = (file) => `Acceso a "${basename(file)}", un fichero con secretos. Usa una plantilla (.env.example) o pide el valor al usuario.`;
  if (FILE_TOOLS.has(native.tool_name)) {
    const file = native.tool_input?.file_path ?? native.tool_input?.notebook_path;
    return typeof file === 'string' && isSensitiveFile(file) ? reason(file) : null;
  }
  if (native.tool_name !== 'Bash') return null;
  for (const { name, args, redirects } of commandsIn(String(native.tool_input?.command ?? ''))) {
    const words = PRINTERS.has(name) ? redirects : [...args, ...redirects];
    // `--env-file=.env` también cuenta; un texto con espacios no es una ruta.
    const file = words.flatMap((w) => w.split('=')).find((w) => w && !/\s/.test(w) && isSensitiveFile(w));
    if (file) return reason(file);
  }
  return null;
}

const PUSH_OPTIONS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--exec', '--receive-pack']);
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const PROTECTED_BRANCHES = new Set(['main', 'master']);

function forcePushMain(native) {
  if (native.tool_name !== 'Bash') return null;
  for (const { name, args } of commandsIn(String(native.tool_input?.command ?? ''))) {
    if (name !== 'git') continue;
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) i += GIT_OPTIONS_WITH_VALUE.has(args[i]) ? 2 : 1;
    if (args[i] !== 'push') continue;
    let force = false;
    const positional = [];
    for (let j = i + 1; j < args.length; j++) {
      const arg = args[j];
      if (arg === '--force' || arg.startsWith('--force-with-lease')) force = true;
      else if (PUSH_OPTIONS_WITH_VALUE.has(arg)) j++;
      else if (/^-[A-Za-z]+$/.test(arg)) force ||= arg.includes('f');
      else if (!arg.startsWith('-')) positional.push(arg);
    }
    // El primer posicional es el remoto. Sin refspec explícito la rama sería
    // la actual, y averiguarla exige ejecutar git: no se bloquea.
    for (const refspec of positional.slice(1)) {
      const plus = refspec.startsWith('+');
      const destination = refspec.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');
      if ((force || plus) && PROTECTED_BRANCHES.has(destination)) {
        return `git push forzado a ${destination}. Empuja a una rama propia y abre una pull request.`;
      }
    }
  }
  return null;
}

// Mismos patrones que `backend/src/domain/mask-secrets.ts` (sin la `g`, aquí
// solo se detecta). Se copian porque el Adaptador no tiene dependencias:
// si cambian allí, cámbialos aquí.
const SECRET_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bfigd_[A-Za-z0-9_-]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
];
const SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"']+)\3/g;

function secretInCommand(native) {
  if (native.tool_name !== 'Bash') return null;
  const command = String(native.tool_input?.command ?? '');
  const reason = 'El comando lleva un secreto en claro. Léelo de una variable de entorno en vez de escribirlo en el comando.';
  if (SECRET_PATTERNS.some((pattern) => pattern.test(command))) return reason;
  // `TOKEN=$TOKEN` o `TOKEN=***` no exponen nada: son una referencia o un valor ya enmascarado.
  for (const [, , , , value] of command.matchAll(SECRET_ASSIGNMENT)) {
    if (!value.startsWith('$') && !/^\*+$/.test(value)) return reason;
  }
  return null;
}

// El orden solo decide qué regla se informa si varias coinciden.
const RULES = [
  ['dangerous-rm', dangerousRm],
  ['force-push-main', forcePushMain],
  ['sensitive-file', sensitiveFile],
  ['secret-in-command', secretInCommand],
];

/**
 * Decide si un PreToolUse debe bloquearse. Devuelve `{ rule, reason }` o null.
 * `rules` es la configuración de `loadRules` (por defecto, todas activas) y
 * `home` el directorio personal con el que resolver `~` (opcional).
 */
export function evaluate(native, { rules = defaultRules(), project, home } = {}) {
  if (native?.hook_event_name !== 'PreToolUse') return null;
  for (const [id, check] of RULES) {
    if (!isEnabled(rules, id, project)) continue;
    const reason = check(native, { home });
    if (reason) return { rule: id, reason };
  }
  return null;
}
