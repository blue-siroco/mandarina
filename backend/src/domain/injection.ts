// Avisos de inyección: contenido leído por una herramienta que parece dar órdenes
// al agente (AC-63; roadmap §1.13). Son heurísticas que avisan y nunca bloquean:
// un README que documenta la técnica puede saltar, y por eso se pueden descartar.
import { maskSecrets } from './mask-secrets.js';

export type InjectionSeverity = 'low' | 'medium' | 'high';
export type InjectionCategory = 'override' | 'impersonation' | 'hidden' | 'exfiltration';

export interface InjectionPattern {
  id: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  regexes: RegExp[];
}

export interface InjectionFinding {
  pattern: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  snippet: string;
}

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  {
    id: 'ignore-previous',
    category: 'override',
    severity: 'medium',
    regexes: [
      /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|guidelines?|context)\b/i,
      /\b(?:ignora|olvida|descarta|omite)\b[^.\n]{0,40}\b(?:instrucciones|indicaciones|reglas)\b[^.\n]{0,30}\b(?:anteriores|previas|de arriba)\b/i,
    ],
  },
  {
    id: 'role-reassignment',
    category: 'override',
    severity: 'medium',
    regexes: [
      /\byou are now\b[^.\n]{0,40}\b(?:assistant|agent|ai|model|bot|dan|unrestricted|jailbroken|no longer)\b/i,
      /\bnew system prompt\b/i,
      /\bact as (?:an? )?(?:unrestricted|jailbroken|dan)\b/i,
    ],
  },
  {
    id: 'fake-system-tag',
    category: 'impersonation',
    severity: 'high',
    regexes: [/<\/?(?:system|assistant|user|instructions?)\b[^>]{0,40}>|<\|im_(?:start|end)\|>|\[\/?(?:SYSTEM|INST)\]/i],
  },
  {
    id: 'fake-turn',
    category: 'impersonation',
    severity: 'high',
    regexes: [/^[ \t]*(?:Human|Assistant|System):[ \t]/m],
  },
  { id: 'tag-characters', category: 'hidden', severity: 'high', regexes: [/[\u{E0000}-\u{E007F}]/u] },
  { id: 'bidi-controls', category: 'hidden', severity: 'medium', regexes: [/[‪-‮⁦-⁩]/] },
  { id: 'zero-width-run', category: 'hidden', severity: 'low', regexes: [/[​-‍⁠﻿]{3,}/] },
  {
    id: 'html-comment-instruction',
    category: 'hidden',
    severity: 'low',
    regexes: [/<!--[^>]{0,300}?\b(?:ignore|assistant|instructions?|you must|system prompt|llm|language model)\b[^>]{0,300}?-->/i],
  },
  {
    id: 'hidden-element',
    category: 'hidden',
    severity: 'low',
    regexes: [/display\s*:\s*none[^>]{0,100}>[^<]{0,300}\b(?:ignore|instructions?|assistant|system prompt)\b/i],
  },
  {
    id: 'exfiltrate-request',
    category: 'exfiltration',
    severity: 'high',
    regexes: [
      /\b(?:send|post|upload|forward|leak|exfiltrate|email)\b[^.\n]{0,80}\b(?:secrets?|credentials?|api[ _-]?keys?|tokens?|passwords?|\.env|ssh keys?|private keys?|system prompt|conversation)\b[^\n]{0,80}?https?:\/\//i,
    ],
  },
  {
    id: 'pipe-to-shell',
    category: 'exfiltration',
    severity: 'high',
    // Solo si se lo piden al agente: `curl … | sh` a secas es lo que dice cualquier README de instalación.
    regexes: [/\b(?:you must|you should|please|assistant|agent|ai)\b[^.\n]{0,80}\b(?:run|execute)\b[^.\n]{0,80}\b(?:curl|wget)\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/i],
  },
  {
    id: 'read-secrets-and-send',
    category: 'exfiltration',
    severity: 'high',
    regexes: [/\b(?:cat|read|print|output|include)\b[^.\n]{0,40}(?:\.env\b|id_rsa|\.ssh\b|credentials)[^.\n]{0,80}\b(?:curl|wget|send|post|upload)\b/i],
  },
  {
    id: 'markdown-image-exfil',
    category: 'exfiltration',
    severity: 'high',
    regexes: [/!\[[^\]]{0,100}\]\(https?:\/\/[^)\s]+\?[^)\s]*(?:data|token|secret|key|q|prompt|conversation)=[^)\s]*\)/i],
  },
];

const SNIPPET_CONTEXT = 60;
const SNIPPET_MAX = 200;
// Los caracteres invisibles se enseñan escapados: si no, el fragmento parecería vacío.
const INVISIBLE = /[\u{E0000}-\u{E007F}​-‍⁠﻿‪-‮⁦-⁩]/gu;

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  const end = Math.min(text.length, index + length + SNIPPET_CONTEXT);
  const raw = text
    .slice(start, end)
    .replace(INVISIBLE, (char) => `\\u{${char.codePointAt(0)!.toString(16).toUpperCase()}}`)
    .replace(/\s+/g, ' ')
    .trim();
  const masked = maskSecrets(raw);
  return masked.length > SNIPPET_MAX ? `${masked.slice(0, SNIPPET_MAX - 1)}…` : masked;
}

/** Los patrones que saltan en `text`, uno como mucho por patrón, con el fragmento de su primera coincidencia. */
export function scanInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const { id, category, severity, regexes } of INJECTION_PATTERNS) {
    for (const regex of regexes) {
      const match = regex.exec(text);
      if (!match) continue;
      findings.push({ pattern: id, category, severity, snippet: snippetAround(text, match.index, match[0].length) });
      break;
    }
  }
  return findings;
}

const READS_EXTERNAL_CONTENT: ReadonlySet<string> = new Set(['WebFetch', 'WebSearch', 'Read']);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Herramientas cuya respuesta se vigila: lectura de la web y de ficheros, MCP y `Bash` con `curl`/`wget` (AC-63). */
export function isScannedTool(toolName: string | null, toolInput: unknown): boolean {
  if (toolName === null) return false;
  if (READS_EXTERNAL_CONTENT.has(toolName) || toolName.startsWith('mcp__')) return true;
  const command = record(toolInput).command;
  return toolName === 'Bash' && typeof command === 'string' && /\b(?:curl|wget)\b/.test(command);
}

const oneLine = (value: string, max = 120) => {
  const line = value.split('\n')[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** De dónde se leyó el contenido, en una línea: URL, búsqueda, ruta, `servidor · herramienta` o comando. */
export function sourceOf(toolName: string, toolInput: unknown): string | null {
  const input = record(toolInput);
  const pick = (field: string) => (typeof input[field] === 'string' && (input[field] as string).trim() !== '' ? oneLine(input[field] as string) : null);
  if (toolName === 'WebFetch') return pick('url');
  if (toolName === 'WebSearch') return pick('query');
  if (toolName === 'Read') return pick('file_path');
  if (toolName === 'Bash') return pick('command');
  if (toolName.startsWith('mcp__')) {
    const [server, ...tool] = toolName.slice('mcp__'.length).split('__');
    return `${server} · ${tool.join('__')}`;
  }
  return null;
}
