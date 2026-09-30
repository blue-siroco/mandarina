import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ObservedEvent } from '../../models/observed-event';
import { observedEvent } from '../../testing/event-fixtures';
import { EventRows } from './event-rows';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function render(events: ObservedEvent[], compact = false) {
  await TestBed.configureTestingModule({ imports: [EventRows], providers: [provideRouter([])] }).compileComponents();
  const fixture = TestBed.createComponent(EventRows);
  fixture.componentRef.setInput('events', events);
  fixture.componentRef.setInput('compact', compact);
  await fixture.whenStable();
  return fixture;
}

describe('AC-17: EventRows', () => {
  it('pinta una fila por Evento con su resumen y enlace a la Sesión', async () => {
    const fixture = await render([observedEvent({ id: 'a', payload: { tool_input: { command: 'npm test' } } })]);
    const row = fixture.nativeElement.querySelector('[data-testid="event-row"]') as HTMLElement;

    expect(text(row)).toContain('Bash · npm test');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/sesiones/7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33');
  });

  it('expande el detalle con Tipo nativo, Directorio, Transcript y payload', async () => {
    const fixture = await render([
      observedEvent({ id: 'a', transcriptPath: '/home/dev/.claude/projects/p/s.jsonl', payload: { token: '***' } }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('[data-testid="event-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="event-detail"]')).toBeNull();

    toggle.click();
    await fixture.whenStable();

    const detail = el.querySelector('[data-testid="event-detail"]');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(text(detail)).toContain('PreToolUse');
    expect(text(detail)).toContain('/home/dev/.claude/projects/p/s.jsonl');
    expect(text(detail?.querySelector('.secret'))).toBe('‹secreto›');
    expect(text(detail)).not.toContain('***');
  });

  it('un Bloqueo muestra su Regla y su motivo sin expandir', async () => {
    const fixture = await render([
      observedEvent({ eventType: 'tool.blocked', block: { rule: 'dangerous-rm', reason: 'Borrado fuera del Directorio' } }),
    ]);
    const row = fixture.nativeElement.querySelector('[data-testid="event-row"]') as HTMLElement;

    expect(row.dataset['type']).toBe('tool.blocked');
    expect(text(row.querySelector('.badge--block'))).toBe('dangerous-rm');
    expect(text(row)).toContain('Borrado fuera del Directorio');
  });

  it('en modo compacto oculta Proyecto, Sesión y Directorio', async () => {
    const fixture = await render([observedEvent()], true);
    const headers = [...(fixture.nativeElement as HTMLElement).querySelectorAll('th')].map((th) => text(th));
    expect(headers).toStrictEqual(['Hora', 'Tipo', 'Resumen', 'Detalle']);
  });
});

describe('AC-68: avisos de inyección en las filas', () => {
  const warning = (severity: 'low' | 'medium' | 'high', dismissed = false, pattern = 'fake-system-tag') => ({
    id: `evt-1:${pattern}`,
    pattern,
    severity,
    dismissed,
  });
  // Los elementos hermanos no llevan espacios entre sí: se leen uno a uno.
  const parts = (el: Element | null) => [...(el?.children ?? [])].map((c) => text(c)).join(' ');
  const row = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="event-row"]') as HTMLElement;

  it('un Evento sin avisos no lleva marca', async () => {
    const fixture = await render([observedEvent()]);
    expect(row(fixture).querySelector('[data-testid="event-warning"]')).toBeNull();
  });

  it.each([
    [[warning('low'), warning('high', false, 'fake-turn'), warning('medium', false, 'ignore-previous')], 'high', 'Aviso de inyección · Alta'],
    [[warning('low'), warning('medium', false, 'ignore-previous')], 'medium', 'Aviso de inyección · Media'],
    [[warning('low', false, 'zero-width-run')], 'low', 'Aviso de inyección · Baja'],
  ] as const)('lleva el texto "Aviso de inyección" con la mayor severidad', async (warnings, severity, label) => {
    const fixture = await render([observedEvent({ eventType: 'tool.post', warnings: [...warnings] })]);
    const badge = row(fixture).querySelector('[data-testid="event-warning"]') as HTMLElement;
    expect(text(badge)).toBe(label);
    expect(badge.dataset['severity']).toBe(severity);
  });

  it('los avisos descartados no marcan la fila, pero se ven en el detalle', async () => {
    const fixture = await render([observedEvent({ warnings: [warning('high', true)] })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(row(fixture).querySelector('[data-testid="event-warning"]')).toBeNull();

    (el.querySelector('[data-testid="event-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(parts(el.querySelector('[data-testid="event-warning-item"]'))).toBe('fake-system-tag Severidad Alta Descartado');
  });

  it('el detalle lista cada aviso con su severidad y enlaza a Seguridad filtrado por la Sesión', async () => {
    const fixture = await render([observedEvent({ warnings: [warning('high'), warning('medium', false, 'ignore-previous')] })]);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="event-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    const items = [...el.querySelectorAll('[data-testid="event-warning-item"]')].map((i) => parts(i));
    expect(items).toStrictEqual(['fake-system-tag Severidad Alta', 'ignore-previous Severidad Media']);
    const link = el.querySelector('[data-testid="event-detail"] a[href^="/seguridad"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/seguridad?pestana=avisos&sesion=7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33');
  });

  it('un Evento sin avisos no tiene la sección en el detalle', async () => {
    const fixture = await render([observedEvent()]);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="event-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="event-warning-list"]')).toBeNull();
  });
});

describe('AC-113: salida de la herramienta en la fila', () => {
  const post = (payload: Record<string, unknown>, extra: Partial<ObservedEvent> = {}) =>
    observedEvent({ id: 'p', eventType: 'tool.post', toolName: 'Bash', payload, ...extra });
  const output = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.querySelector('[data-testid="event-output"]');

  it('un tool.post muestra la entrada y, debajo, la primera línea de la salida', async () => {
    const fixture = await render([
      post({ tool_input: { command: 'npm test' }, tool_response: { stdout: 'Tests 12 passed\nmás', stderr: '' } }),
    ]);
    const row = fixture.nativeElement.querySelector('[data-testid="event-row"]') as HTMLElement;
    expect(text(row)).toContain('Bash · npm test');
    expect(text(output(fixture))).toBe('→ Tests 12 passed');
  });

  it('un fallo muestra el error recortado', async () => {
    const fixture = await render([post({ tool_input: { command: 'npm run x' }, error: 'Exit code 1\nmissing script' })]);
    expect(text(output(fixture))).toBe('→ Exit code 1 · missing script');
  });

  it('Read muestra el número de líneas', async () => {
    const fixture = await render([post({ tool_response: { file: { numLines: 42 } } }, { toolName: 'Read' })]);
    expect(text(output(fixture))).toBe('→ 42 líneas');
  });

  it('un tool.pre no muestra salida aunque el payload la traiga', async () => {
    const fixture = await render([post({ tool_response: { stdout: 'x' } }, { eventType: 'tool.pre' })]);
    expect(output(fixture)).toBeNull();
  });

  it('el texto de la salida se pinta como texto, nunca como HTML', async () => {
    const fixture = await render([post({ tool_response: { stdout: '<img src=x onerror=alert(1)>' } })]);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(text(output(fixture))).toContain('<img src=x onerror=alert(1)>');
  });
});
