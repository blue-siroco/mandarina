import { DismissedFilter, InjectionCategory, InjectionSeverity, MarkerType } from '../models/security';

/** La severidad siempre con texto, no solo con color (AC-66). */
export const SEVERITY_LABELS: Record<InjectionSeverity, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

/** Valor de `?severidad=` de cada severidad. */
export const SEVERITY_PARAMS: Record<string, InjectionSeverity> = { alta: 'high', media: 'medium', baja: 'low' };

export const SEVERITY_OPTIONS = ['Alta', 'Media', 'Baja'] as const;

export const CATEGORY_LABELS: Record<InjectionCategory, string> = {
  override: 'Anulación de instrucciones',
  impersonation: 'Suplantación',
  hidden: 'Texto oculto',
  exfiltration: 'Exfiltración',
};

export const DISMISSED_OPTIONS: ReadonlyArray<{ param: string; filter: DismissedFilter; label: string }> = [
  { param: 'descartados', filter: 'true', label: 'Descartados' },
  { param: 'todos', filter: 'all', label: 'Todos' },
];

export const MARKER_LABELS: Record<MarkerType, string> = {
  API_KEY: 'Clave de API',
  TOKEN: 'Token',
  PRIVATE_KEY: 'Clave privada',
  // Falso positivo: es el rótulo de la columna del tipo de marcador `PASSWORD`, no una contraseña.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD: 'Contraseña',
  EMAIL: 'Correo',
  PHONE: 'Teléfono',
  IBAN: 'IBAN',
  CARD: 'Tarjeta',
  ID: 'Identificador',
};
