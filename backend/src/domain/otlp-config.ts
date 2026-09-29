// Configuración de la Exportación OTLP a partir de las variables estándar de
// OpenTelemetry (AC-50, ADR-0008). Sin endpoint, el exportador está apagado.

export interface OtlpConfig {
  /** URL completa a la que se hace el `POST`. */
  url: string;
  headers: Record<string, string>;
  /** Host y puerto del colector, sin ruta ni credenciales: es lo único que se enseña. */
  host: string;
  includeContent: boolean;
}

const TRACES_PATH = '/v1/traces';

function parseHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  for (const pair of (raw ?? '').split(',')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    if (name === '') continue;
    const value = pair.slice(separator + 1).trim();
    try {
      headers[name.toLowerCase()] = decodeURIComponent(value);
    } catch {
      headers[name.toLowerCase()] = value;
    }
  }
  return headers;
}

export function parseOtlpConfig(env: Record<string, string | undefined>): OtlpConfig | null {
  const traces = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  const base = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const target = traces || (base ? `${base.replace(/\/+$/, '')}${TRACES_PATH}` : '');
  if (target === '') return null;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return {
    url: url.toString(),
    headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    host: url.host,
    includeContent: env.MANDARINA_OTLP_INCLUDE_CONTENT === 'true',
  };
}
