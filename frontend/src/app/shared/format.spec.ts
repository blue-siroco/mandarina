import { formatCost, formatDuration, plural, relativeTime, shortId, tailPath } from './format';

describe('AC-16: formatDuration', () => {
  it.each([
    [35_000, '35 s'],
    [42 * 60_000, '42 min'],
    [70 * 60_000, '1 h 10 min'],
    [2 * 3_600_000, '2 h'],
    [27 * 3_600_000, '1 d 3 h'],
    [48 * 3_600_000, '2 d'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('AC-16: relativeTime', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  it.each([
    ['2026-09-25T11:59:48Z', 'hace 12 s'],
    ['2026-09-25T11:51:00Z', 'hace 9 min'],
    ['2026-09-25T10:00:00Z', 'hace 2 h'],
    ['2026-09-22T12:00:00Z', 'hace 3 d'],
    ['2026-09-25T12:00:05Z', 'hace 0 s'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(new Date(iso), now)).toBe(expected);
  });
});

describe('AC-16: formatos cortos', () => {
  it('abrevia el id a 8 caracteres', () => {
    expect(shortId('7f3c2a10-1b2c-4d5e')).toBe('7f3c2a10');
  });

  it('se queda con el final de la ruta con cualquier separador', () => {
    expect(tailPath('C:\\Users\\dev\\Codev\\mandarina')).toBe('…/Codev/mandarina');
    expect(tailPath('/home/dev/app')).toBe('…/dev/app');
    expect(tailPath('/app')).toBe('/app');
  });

  it('pluraliza con la cifra formateada', () => {
    expect(plural(1, 'Sesión', 'Sesiones')).toBe('1 Sesión');
    expect(plural(1200, 'Sesión', 'Sesiones')).toBe('1200 Sesiones');
  });

  it('marca el coste como estimado', () => {
    expect(formatCost(3.4212)).toMatch(/^~3,42\sUS\$$/);
  });
});
