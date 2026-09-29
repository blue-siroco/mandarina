import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ExporterState, INITIAL_EXPORTER_STATE, WatchExporterStatus } from '../../application/watch-exporter-status';
import { exporterStatus } from '../../testing/exporter-fixtures';
import { ExporterIndicator } from './exporter-indicator';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-53: ExporterIndicator', () => {
  let state$: BehaviorSubject<ExporterState>;

  async function render() {
    await TestBed.configureTestingModule({
      imports: [ExporterIndicator],
      providers: [provideRouter([]), { provide: WatchExporterStatus, useValue: { execute: () => state$ } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExporterIndicator);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const indicator = (fixture: { nativeElement: unknown }) => el(fixture).querySelector<HTMLButtonElement>('[data-testid="exporter-indicator"]');
  const modal = (fixture: { nativeElement: unknown }) => el(fixture).querySelector('[data-testid="exporter-modal"]');

  beforeEach(() => {
    state$ = new BehaviorSubject<ExporterState>({ status: exporterStatus(), loaded: true, failed: false });
  });

  it('con el exportador activo dice a qué colector exporta', async () => {
    state$.next({ status: exporterStatus({ counts: { pending: 0, exported: 5, failed: 0 } }), loaded: true, failed: false });
    const fixture = await render();
    expect(text(el(fixture).querySelector('[data-testid="exporter-label"]'))).toBe('Exportando a collector.local:4318');
    expect(el(fixture).querySelector('[data-testid="exporter-failed"]')).toBeNull();
  });

  it('avisa de que incluye contenido', async () => {
    state$.next({ status: exporterStatus({ include_content: true }), loaded: true, failed: false });
    const fixture = await render();
    expect(text(el(fixture).querySelector('[data-testid="exporter-label"]'))).toBe('Exportando a collector.local:4318 · incluye contenido');
  });

  it('cuenta los Turnos fallidos con texto, no solo con color', async () => {
    const fixture = await render();
    expect(text(el(fixture).querySelector('[data-testid="exporter-failed"]'))).toBe('1 Turno fallido');
    state$.next({ status: exporterStatus({ counts: { pending: 0, exported: 1, failed: 3 } }), loaded: true, failed: false });
    await fixture.whenStable();
    expect(text(el(fixture).querySelector('[data-testid="exporter-failed"]'))).toBe('3 Turnos fallidos');
  });

  it('desactivado, sin cargar o sin poder consultarlo no aparece nada', async () => {
    state$.next({ status: exporterStatus({ enabled: false, endpoint_host: null }), loaded: true, failed: false });
    const fixture = await render();
    expect(indicator(fixture)).toBeNull();

    state$.next(INITIAL_EXPORTER_STATE);
    await fixture.whenStable();
    expect(indicator(fixture)).toBeNull();

    state$.next({ status: null, loaded: true, failed: true });
    await fixture.whenStable();
    expect(indicator(fixture)).toBeNull();
  });

  it('al pulsarlo abre el modal y devuelve el foco al indicador al cerrarlo con Esc', async () => {
    const fixture = await render();
    expect(modal(fixture)).toBeNull();
    indicator(fixture)!.click();
    await fixture.whenStable();
    expect(modal(fixture)).not.toBeNull();

    modal(fixture)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(modal(fixture)).toBeNull();
    expect(document.activeElement).toBe(indicator(fixture));
  });

  it('un fallo al consultar conserva el indicador con el último estado conocido', async () => {
    state$.next({ status: exporterStatus(), loaded: true, failed: true });
    const fixture = await render();
    expect(indicator(fixture)).not.toBeNull();
  });
});
