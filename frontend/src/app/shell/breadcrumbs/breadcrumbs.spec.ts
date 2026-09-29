import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Breadcrumbs } from './breadcrumbs';

@Component({ template: '' })
class Blank {}

describe('AC-16: Breadcrumbs', () => {
  async function crumbsAt(url: string): Promise<string[]> {
    TestBed.configureTestingModule({
      imports: [Breadcrumbs],
      providers: [
        provideRouter([
          { path: 'sesiones', component: Blank, data: { breadcrumb: 'Board' } },
          {
            path: 'sesiones/:id',
            component: Blank,
            data: { breadcrumb: 'Sesión', parent: { label: 'Board', link: '/sesiones' } },
          },
          { path: 'sin-migas', component: Blank },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const fixture = TestBed.createComponent(Breadcrumbs);
    await fixture.whenStable();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map((li) => li.textContent?.trim() ?? '');
  }

  it('muestra la sección de primer nivel', async () => {
    expect(await crumbsAt('/sesiones')).toStrictEqual(['Observar', 'Board']);
  });

  it('en el detalle enlaza al board y abrevia el id', async () => {
    expect(await crumbsAt('/sesiones/7f3c2a10-1b2c-4d5e')).toStrictEqual(['Observar', 'Board', '7f3c2a10']);
  });

  it('una ruta sin migas no pinta nada', async () => {
    expect(await crumbsAt('/sin-migas')).toStrictEqual([]);
  });
});
