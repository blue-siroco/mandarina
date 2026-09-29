// Enmascarado de secretos y datos personales antes de enviar un Evento (AC-60,
// AC-61, AC-62; ADR-0009). Copia con la misma lógica que
// `backend/src/domain/mask-secrets.ts`: las dos ejecutan las mismas fixtures
// (`test/fixtures/masking.json`) y un test comprueba que no divergen. Cada valor se
// sustituye por un marcador con su tipo y enmascarar dos veces da el mismo resultado.

export const PII_CATEGORIES = ['email', 'phone', 'iban', 'card', 'id'];

/** `MANDARINA_MASK_PII`: lista de categorías; sin definir, vacía o `all`, todas; `none`, ninguna. */
export function piiFromEnv(env = process.env) {
  const raw = (env.MANDARINA_MASK_PII ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'all') return [...PII_CATEGORIES];
  if (raw === 'none') return [];
  const wanted = raw.split(',').map((part) => part.trim());
  return PII_CATEGORIES.filter((category) => wanted.includes(category));
}

const marker = (type) => `[REDACTED_${type}]`;
const isMarker = (value) => value.startsWith('[REDACTED_');

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g;
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

const API_KEY_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bfigd_[A-Za-z0-9_-]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}/g,
  /\b[sr]k_live_[0-9A-Za-z]{16,}/g,
  /\bnpm_[A-Za-z0-9]{36}/g,
];

const BEARER = /\b(Bearer\s+)(?!\[REDACTED_)[A-Za-z0-9._~+/=-]{8,}/gi;

// `API_KEY=valor`, `export GITHUB_TOKEN="valor"`, `DB_PASSWORD: valor`...
// Solo nombres en mayúsculas (convención de variables de entorno) para no
// enmascarar texto normal como "tokens: 5".
const SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"']+)\3/g;

const SECRET_PROPERTY = /(api_?key|access_?key|secret|token|password|passwd|credentials?|authorization)$/i;
const API_KEY_PROPERTY = /(api_?key|access_?key)$/i;
const TOKEN_PROPERTY = /(token|authorization)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const CARD = /(?<![\d-])[3-6](?:[ -]?\d){12,18}(?!\d)/g;
const DNI = /\b\d{8}[A-HJ-NP-TV-Z]\b/gi;
const NIE = /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/gi;
const PHONE_E164 = /(?<![\w+])\+\d{1,3}(?:[ .-]?\d){7,12}(?!\d)/g;
const PHONE_ES = /(?<![\w.-])[6-9]\d{2}(?:[ .-]\d{3}[ .-]\d{3}|[ .-]\d{2}[ .-]\d{2}[ .-]\d{2})(?![\w-])/g;

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function validIban(candidate) {
  const iban = candidate.replaceAll(' ', '');
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validLuhn(candidate) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

const validDni = (candidate) => DNI_LETTERS[Number(candidate.slice(0, 8)) % 23] === candidate[8].toUpperCase();

function validNie(candidate) {
  const prefix = 'XYZ'.indexOf(candidate[0].toUpperCase());
  return DNI_LETTERS[Number(`${prefix}${candidate.slice(1, 8)}`) % 23] === candidate[8].toUpperCase();
}

const replaceIf = (text, pattern, type, valid) => text.replace(pattern, (match) => (valid(match) ? marker(type) : match));

// Los patrones de IBAN y de tarjeta son codiciosos y pueden arrastrar el número que va detrás;
// se prueba el prefijo válido más largo y lo que sobra se deja como estaba.
function replaceLongestValid(text, pattern, type, ends, valid) {
  return text.replace(pattern, (match) => {
    for (const end of ends(match)) {
      if (valid(match.slice(0, end))) return marker(type) + match.slice(end);
    }
    return match;
  });
}

const ibanEnds = (match) => {
  const ends = [];
  for (let i = match.length; i >= 15; i--) if (i === match.length || match[i] === ' ') ends.push(i);
  return ends;
};

const cardEnds = (match) => {
  const ends = [];
  for (let i = match.length; i >= 13; i--) if (/\d/.test(match[i - 1]) && (i === match.length || !/\d/.test(match[i]))) ends.push(i);
  return ends;
};

function maskPii(text, pii) {
  let masked = text;
  if (pii.includes('email')) masked = masked.replace(EMAIL, marker('EMAIL'));
  if (pii.includes('iban')) masked = replaceLongestValid(masked, IBAN, 'IBAN', ibanEnds, validIban);
  if (pii.includes('card')) masked = replaceLongestValid(masked, CARD, 'CARD', cardEnds, validLuhn);
  if (pii.includes('id')) {
    masked = replaceIf(masked, DNI, 'ID', validDni);
    masked = replaceIf(masked, NIE, 'ID', validNie);
  }
  if (pii.includes('phone')) masked = masked.replace(PHONE_E164, marker('PHONE')).replace(PHONE_ES, marker('PHONE'));
  return masked;
}

function maskString(value, pii) {
  let masked = value
    .replace(PRIVATE_KEY, marker('PRIVATE_KEY'))
    .replace(SLACK_WEBHOOK, marker('API_KEY'))
    .replace(URL_CREDENTIALS, (match, head, password, at) => (isMarker(password) ? match : `${head}${marker('PASSWORD')}${at}`))
    .replace(JWT, marker('TOKEN'));
  for (const pattern of API_KEY_PATTERNS) masked = masked.replace(pattern, marker('API_KEY'));
  masked = masked
    .replace(BEARER, `$1${marker('TOKEN')}`)
    .replace(SECRET_ASSIGNMENT, (match, name, separator, quote, secret) =>
      isMarker(secret) ? match : `${name}${separator}${quote}${marker('PASSWORD')}${quote}`,
    );
  return maskPii(masked, pii);
}

function propertyMarker(key) {
  if (API_KEY_PROPERTY.test(key)) return marker('API_KEY');
  return TOKEN_PROPERTY.test(key) ? marker('TOKEN') : marker('PASSWORD');
}

/** Devuelve una copia con los secretos y los datos personales sustituidos por marcadores. */
export function maskSecrets(value, { pii = piiFromEnv() } = {}) {
  const walk = (item) => {
    if (typeof item === 'string') return maskString(item, pii);
    if (Array.isArray(item)) return item.map(walk);
    if (item !== null && typeof item === 'object') {
      const result = {};
      for (const [key, inner] of Object.entries(item)) {
        result[key] = typeof inner === 'string' && SECRET_PROPERTY.test(key) ? (isMarker(inner) ? inner : propertyMarker(key)) : walk(inner);
      }
      return result;
    }
    return item;
  };
  return walk(value);
}

/**
 * Enmascara lo que el Adaptador envía: el `payload` y el `block`. El resto del Evento
 * son identificadores del Harness y del Proyecto, no contenido (AC-62).
 */
export function maskEvent(event, env = process.env) {
  const options = { pii: piiFromEnv(env) };
  const masked = { ...event, payload: maskSecrets(event.payload, options) };
  if (event.block) masked.block = maskSecrets(event.block, options);
  return masked;
}
