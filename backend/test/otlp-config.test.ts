import { parseOtlpConfig } from '../src/domain/otlp-config.js';

describe('AC-50: configuración de la Exportación OTLP', () => {
  it('está desactivada sin endpoint', () => {
    expect(parseOtlpConfig({})).toBeNull();
    expect(parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' })).toBeNull();
    expect(parseOtlpConfig({ MANDARINA_OTLP_INCLUDE_CONTENT: 'true' })).toBeNull();
  });

  it('añade /v1/traces al endpoint base', () => {
    expect(parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318' })?.url).toBe('http://tempo:4318/v1/traces');
    expect(parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318/' })?.url).toBe('http://tempo:4318/v1/traces');
  });

  it('usa el endpoint de trazas tal cual y tiene prioridad', () => {
    const config = parseOtlpConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otro:4318',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://cloud.langfuse.com/api/public/otel/v1/traces',
    });
    expect(config?.url).toBe('https://cloud.langfuse.com/api/public/otel/v1/traces');
    expect(config?.host).toBe('cloud.langfuse.com');
  });

  it('lee las cabeceras clave=valor, decodificadas, y fija el content-type', () => {
    const config = parseOtlpConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318',
      OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Basic%20abc==, x-team = core ,sin-valor,=roto',
    });
    expect(config?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Basic abc==',
      'x-team': 'core',
    });
  });

  it('exporta el contenido solo con MANDARINA_OTLP_INCLUDE_CONTENT=true', () => {
    const base = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318' };
    expect(parseOtlpConfig(base)?.includeContent).toBe(false);
    expect(parseOtlpConfig({ ...base, MANDARINA_OTLP_INCLUDE_CONTENT: 'false' })?.includeContent).toBe(false);
    expect(parseOtlpConfig({ ...base, MANDARINA_OTLP_INCLUDE_CONTENT: 'true' })?.includeContent).toBe(true);
  });

  it('descarta un endpoint que no es una URL http(s)', () => {
    expect(parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'tempo:4318' })).toBeNull();
    expect(parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'ftp://tempo' })).toBeNull();
  });

  it('el host no incluye ruta ni credenciales', () => {
    const config = parseOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://user:secreto@tempo.local:4318/ruta' });
    expect(config?.host).toBe('tempo.local:4318');
  });
});
