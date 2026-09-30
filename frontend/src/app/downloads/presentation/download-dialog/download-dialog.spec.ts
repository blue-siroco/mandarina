import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { DownloadTarget } from '../../models/download';
import { downloadPreview, stubDownloadSource } from '../../testing/download-fixtures';
import { DownloadDialog } from './download-dialog';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-147: DownloadDialog', () => {
  const session: DownloadTarget = { kind: 'session', sessionId: 's1' };

  async function render(target: DownloadTarget = session, respond?: Parameters<typeof stubDownloadSource>[0]) {
    const stub = stubDownloadSource(respond);
    TestBed.configureTestingModule({ imports: [DownloadDialog], providers: [stub.provider] });
    const fixture = TestBed.createComponent(DownloadDialog);
    fixture.componentRef.setInput('target', target);
    await fixture.whenStable();
    return { fixture, stub, el: fixture.nativeElement as HTMLElement };
  }
  const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it('es un diálogo modal accesible con el foco dentro', async () => {
    const { el } = await render();
    const dialog = q(el, 'download-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(text(el.querySelector('#download-title'))).toBe('Descarga de Sesión');
    expect(document.activeElement).toBe(dialog);
  });

  it('en modo Eventos se titula «Descarga de Eventos» y dice JSONL', async () => {
    const { el } = await render({ kind: 'events', filters: {} });
    expect(text(el.querySelector('#download-title'))).toBe('Descarga de Eventos');
    expect(text(q(el, 'download-format'))).toContain('JSONL');
  });

  it('enseña el recuento y la lista de campos, sin línea de ejemplo', async () => {
    const { el } = await render(session, () => of(downloadPreview({ exported: 7, fields: ['id', 'event_type'] })));
    expect(text(q(el, 'download-count'))).toBe('7 Eventos en el fichero');
    expect([...q(el, 'download-fields')!.querySelectorAll('li')].map(text)).toStrictEqual(['id', 'event_type']);
    expect(el.querySelector('pre')).toBeNull();
  });

  it('la casilla «Incluir contenido» nace desmarcada; al marcarla se repide la vista previa y se avisa del enmascarado', async () => {
    const { fixture, stub, el } = await render();
    const box = q(el, 'download-content') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(q(el, 'download-content-note')).toBeNull();
    box.click();
    await fixture.whenStable();
    expect(stub.calls.map((c) => c.content)).toStrictEqual([false, true]);
    expect(text(q(el, 'download-content-note'))).toContain('enmascarados');
    expect(q(el, 'download-link')!.getAttribute('href')).toBe('/api/v1/test/export?content=true');
  });

  it('una apertura nueva no recuerda la casilla ni la guarda en el navegador', async () => {
    const first = await render();
    (q(first.el, 'download-content') as HTMLInputElement).click();
    await first.fixture.whenStable();
    first.fixture.destroy();
    TestBed.resetTestingModule();
    const second = await render();
    expect((q(second.el, 'download-content') as HTMLInputElement).checked).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('con truncado avisa de cuántos Eventos salen y cuántos quedan fuera', async () => {
    const { el } = await render(session, () => of(downloadPreview({ total: 60, exported: 50, truncated: true, omitted: 10 })));
    expect(text(q(el, 'download-truncated'))).toBe('Se incluirán los 50 Eventos más recientes; 10 quedan fuera. Acota con los filtros.');
  });

  it('sin truncado no enseña el aviso', async () => {
    const { el } = await render();
    expect(q(el, 'download-truncated')).toBeNull();
  });

  it('avisa siempre de que el fichero sale de Mandarina sin control posterior', async () => {
    const { el } = await render(session, () => NEVER);
    expect(text(q(el, 'download-warning'))).toContain('ya no tiene control posterior');
  });

  it('«Descargar» es un enlace con `download` a la URL cuando la vista previa cargó', async () => {
    const { el } = await render();
    const link = q(el, 'download-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.hasAttribute('download')).toBe(true);
    expect(link.getAttribute('href')).toBe('/api/v1/test/export?content=false');
    expect(text(link)).toBe('Descargar');
  });

  it('mientras carga la vista previa «Descargar» está desactivado', async () => {
    const { el } = await render(session, () => NEVER);
    const button = q(el, 'download-link') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.disabled).toBe(true);
  });

  it('con total 0 «Descargar» está desactivado y el diálogo lo dice', async () => {
    const { el } = await render(session, () => of(downloadPreview({ total: 0, exported: 0, fields: [] })));
    expect((q(el, 'download-link') as HTMLButtonElement).disabled).toBe(true);
    expect(text(q(el, 'download-empty'))).toContain('No hay Eventos');
  });

  it('un fallo de la vista previa se dice con texto y se reintenta', async () => {
    let fail = true;
    const { fixture, stub, el } = await render(session, () => (fail ? throwError(() => new Error('x')) : of(downloadPreview())));
    expect(text(q(el, 'download-error'))).toContain('No se pudo calcular');
    expect(q(el, 'download-link')!.tagName).toBe('BUTTON');
    fail = false;
    q(el, 'download-retry')!.click();
    await fixture.whenStable();
    expect(stub.calls).toHaveLength(2);
    expect(q(el, 'download-error')).toBeNull();
    expect(q(el, 'download-link')!.tagName).toBe('A');
  });

  it('Escape y clic en la capa cierran; un clic dentro no', async () => {
    const { fixture, el } = await render();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    q(el, 'download-dialog')!.click();
    expect(closed).toBe(0);
    q(el, 'download-overlay')!.click();
    expect(closed).toBe(1);
    q(el, 'download-overlay')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(2);
  });

  it('atrapa el foco: si sale de la ventana, vuelve a ella', async () => {
    const { el } = await render();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.activeElement).toBe(q(el, 'download-dialog'));
    outside.remove();
  });
});
