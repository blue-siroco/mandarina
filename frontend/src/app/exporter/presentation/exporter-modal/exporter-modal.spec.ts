import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { exporterStatus } from '../../testing/exporter-fixtures';
import { ExporterModal } from './exporter-modal';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** Las celdas no llevan espacios entre sí: se leen una a una. */
const cells = (row: Element | undefined) => [...(row?.children ?? [])].map((c) => text(c));

describe('AC-53: ExporterModal', () => {
  async function render(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [ExporterModal], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ExporterModal);
    const values = { isOpen: true, status: exporterStatus(), ...inputs };
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const rows = (fixture: { nativeElement: unknown }) => [...el(fixture).querySelectorAll('[data-testid="exporter-row"]')];

  it('cerrado no pinta nada', async () => {
    const fixture = await render({ isOpen: false });
    expect(el(fixture).querySelector('[data-testid="exporter-modal"]')).toBeNull();
  });

  it('enseña el colector, los recuentos y la última exportación', async () => {
    const fixture = await render();
    expect(el(fixture).querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(text(el(fixture).querySelector('h2'))).toBe('Exportación OTLP');
    expect(text(el(fixture).querySelector('[data-testid="exporter-target"]'))).toBe('Cada Turno terminado se envía a collector.local:4318.');
    const counts = [...el(fixture).querySelectorAll('[data-testid="exporter-counts"] > div')].map((c) => text(c));
    expect(counts.slice(0, 3)).toStrictEqual(['Pendientes1', 'Exportados2', 'Fallidos1']);
    // El nombre del mes depende del idioma del navegador de pruebas; aquí solo importa el día y la hora.
    expect(text(el(fixture).querySelector('[data-testid="exporter-last"]'))).toMatch(/^25 \S+ 12:00:30$/);
  });

  it('indica si se exporta el contenido', async () => {
    const fixture = await render({ status: exporterStatus({ include_content: true }) });
    expect(text(el(fixture).querySelector('[data-testid="exporter-target"]'))).toContain('con el contenido de prompts y herramientas');
  });

  it('lista los Turnos con su estado en texto, intentos, último error y enlace a su Sesión', async () => {
    const fixture = await render();
    const [exported, pending, failed] = rows(fixture);
    expect(cells(exported)).toStrictEqual(['mandarina', 'Exportado', '1', '—', expect.stringMatching(/12:00:30$/), 'Ver Sesión']);
    expect(cells(pending)).toStrictEqual(['otro', 'Pendiente', '2', 'HTTP 503', expect.stringMatching(/12:00:10$/), 'Ver Sesión']);
    expect(cells(failed)).toStrictEqual(['mandarina', 'Fallido', '4', 'connect ECONNREFUSED', expect.stringMatching(/11:59:00$/), 'Ver Sesión']);
    expect(pending?.querySelector('a')?.getAttribute('href')).toBe('/sesiones/s2');
  });

  it('sin Turnos explica de dónde saldrán', async () => {
    const fixture = await render({ status: exporterStatus({ recent: [], counts: { pending: 0, exported: 0, failed: 0 }, last_exported_at: null }) });
    expect(el(fixture).querySelector('[data-testid="exporter-table"]')).toBeNull();
    expect(text(el(fixture).querySelector('[data-testid="exporter-empty"]'))).toContain('Se exportan los que terminan desde que se activó');
    expect(text(el(fixture).querySelector('[data-testid="exporter-last"]'))).toBe('—');
  });

  it('se cierra con Esc, con el botón de cerrar y pulsando fuera, no dentro', async () => {
    const fixture = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    el(fixture).querySelector('[data-testid="exporter-overlay"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);

    el(fixture).querySelector('lucia--button')!.dispatchEvent(new CustomEvent('callback'));
    expect(closed).toHaveBeenCalledTimes(2);

    (el(fixture).querySelector('[data-testid="exporter-modal"]') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(2);
    (el(fixture).querySelector('[data-testid="exporter-overlay"]') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(3);
  });

  it('al abrir lleva el foco a la ventana', async () => {
    const fixture = await render();
    await fixture.whenStable();
    expect(document.activeElement).toBe(el(fixture).querySelector('[data-testid="exporter-modal"]'));
  });
});
