import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER, of } from 'rxjs';
import { App } from './app';
import { BudgetSource } from './budgets/ports/budget-source';
import { budgetList } from './budgets/testing/budget-fixtures';
import { EventFeed } from './events/ports/event-feed';
import { ExporterSource } from './exporter/ports/exporter-source';
import { SessionSource } from './sessions/ports/session-source';

@Component({ template: '<p data-testid="page">página</p>' })
class Page {}

describe('AC-16, AC-32, AC-37, AC-44, AC-47: App', () => {
  async function renderAt(url: string) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'sesiones', component: Page, data: { breadcrumb: 'Board' } },
          { path: 'eventos', component: Page, data: { breadcrumb: 'Eventos' } },
          { path: 'bloqueos', component: Page, data: { breadcrumb: 'Bloqueos' } },
          { path: 'seguridad', component: Page, data: { breadcrumb: 'Seguridad' } },
          { path: 'evaluaciones', component: Page, data: { breadcrumb: 'Evaluaciones' } },
          { path: 'tests', component: Page, data: { breadcrumb: 'Tests' } },
          { path: 'skills', component: Page, data: { breadcrumb: 'Skills' } },
          { path: 'subagentes', component: Page, data: { breadcrumb: 'Subagentes' } },
          { path: 'mcp', component: Page, data: { breadcrumb: 'MCP' } },
          { path: 'agentes', component: Page, data: { breadcrumb: 'Agentes' } },
          {
            path: 'presupuestos',
            component: Page,
            data: { breadcrumb: 'Presupuestos', group: 'Configurar' },
          },
        ]),
        // Sin red: el shell escucha el WebSocket para el indicador de conexión.
        { provide: EventFeed, useValue: { search: () => of([]), live: () => NEVER } },
        // Sin exportador: el indicador de la Exportación OTLP no aparece.
        { provide: ExporterSource, useValue: { fetch: () => NEVER } },
        // Sin Sesiones Esperando: el aviso de la cabecera (AC-95) no aparece.
        {
          provide: SessionSource,
          useValue: { list: () => of({ items: [], facets: { projects: [], directories: [] } }) },
        },
        // Sin Presupuestos activos que avisen: el aviso de la cabecera no aparece.
        { provide: BudgetSource, useValue: { list: () => of({ ...budgetList(), items: [] }) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const fixture = TestBed.createComponent(App);
    await harness.navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra la marca, la navegación de Observar de lo más general a lo más detallado y el contenido de la ruta', async () => {
    const el = await renderAt('/sesiones');
    expect(el.querySelector('h1')?.textContent).toContain('Mandarina');
    const labels = [...el.querySelectorAll('nav[aria-label="Principal"] a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(labels).toStrictEqual([
      'Board',
      'Agentes',
      'Subagentes',
      'Skills',
      'MCP',
      'Tests',
      'Bloqueos',
      'Seguridad',
      'Evaluaciones',
      'Eventos',
      'Presupuestos',
    ]);
    expect(el.querySelector('main [data-testid="page"]')).not.toBeNull();
  });

  it.each([
    ['/sesiones', 'Board'],
    ['/eventos', 'Eventos'],
    ['/bloqueos', 'Bloqueos'],
    ['/seguridad', 'Seguridad'],
    ['/evaluaciones', 'Evaluaciones'],
    ['/tests', 'Tests'],
    ['/skills', 'Skills'],
    ['/subagentes', 'Subagentes'],
    ['/mcp', 'MCP'],
    ['/agentes', 'Agentes'],
    ['/presupuestos', 'Presupuestos'],
  ])('en %s marca %s como página actual', async (url, label) => {
    const el = await renderAt(url);
    const current = el.querySelector('nav[aria-label="Principal"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe(label);
  });

  it('AC-82: Presupuestos va en el grupo Configurar, después de Observar, y su miga lo dice', async () => {
    const el = await renderAt('/presupuestos');
    const groups = [...el.querySelectorAll('nav[aria-label="Principal"] .sidebar__group')].map(
      (g) => g.textContent?.trim(),
    );
    expect(groups).toStrictEqual(['Observar', 'Configurar']);
    const crumbs = [...el.querySelectorAll('nav[aria-label="Migas de pan"] li')].map((c) =>
      c.textContent?.trim(),
    );
    expect(crumbs).toStrictEqual(['Configurar', 'Presupuestos']);
  });

  it('AC-83: sin Presupuestos Cerca o Superados no hay aviso en la cabecera', async () => {
    const el = await renderAt('/sesiones');
    expect(el.querySelector('[data-testid="budget-alert"]')).toBeNull();
  });

  it('AC-95: sin Sesiones Esperando no hay aviso en la cabecera, pero sí la región de estado', async () => {
    const el = await renderAt('/sesiones');
    expect(el.querySelector('[data-testid="waiting-alert"]')).toBeNull();
    expect(el.querySelector('app-waiting-alert [role="status"]')).not.toBeNull();
  });

  it('muestra el indicador de conexión en la barra lateral', async () => {
    const el = await renderAt('/sesiones');
    expect(el.querySelector('.sidebar [role="status"]')?.textContent?.trim()).toBe('Conectando…');
  });
});
