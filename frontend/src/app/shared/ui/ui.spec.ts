import { TestBed } from '@angular/core/testing';
import { modelSeries, shortModel, ModelBadge } from './model-badge/model-badge';
import { SelectFilter } from './select-filter/select-filter';
import { StateDot } from './state-dot/state-dot';
import { ToggleGroup } from './toggle-group/toggle-group';
import { CheckFilter } from './check-filter/check-filter';

async function create<T>(component: new (...args: never[]) => T, inputs: Record<string, unknown>) {
  await TestBed.configureTestingModule({ imports: [component] }).compileComponents();
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return fixture;
}

describe('AC-16: StateDot', () => {
  it.each([
    ['active', 'Activa'],
    ['idle', 'Inactiva'],
    ['orphaned', 'Huérfana'],
    ['closed', 'Cerrada'],
  ])('el Estado %s lleva su etiqueta visible, no solo color', async (state, label) => {
    const fixture = await create(StateDot, { state, reason: 'motivo' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent?.trim()).toBe(label);
    expect(host.dataset['state']).toBe(state);
    expect(host.getAttribute('title')).toBe('motivo');
  });
});

describe('AC-16: ModelBadge', () => {
  it.each([
    ['claude-opus-5-5', 'opus-5.5', 'var(--series-1)'],
    ['claude-sonnet-5', 'sonnet-5', 'var(--series-2)'],
    ['claude-haiku-4-5-20251001', 'haiku-4.5', 'var(--series-3)'],
    ['claude-fable-5-1', 'fable-5.1', 'var(--series-4)'],
    ['gpt-5', 'gpt-5', 'var(--series-other)'],
  ])('%s → %s con color estable', (model, short, series) => {
    expect(shortModel(model)).toBe(short);
    expect(modelSeries(model)).toBe(series);
  });

  it('pasa el texto y el color al smallchip de Lucia', async () => {
    const fixture = await create(ModelBadge, { model: 'claude-opus-5-5' });
    const chip = (fixture.nativeElement as HTMLElement).querySelector('lucia--smallchip') as HTMLElement & {
      smallChip: unknown;
    };
    expect(chip.smallChip).toStrictEqual({ text: 'opus-5.5', background: 'var(--series-1)' });
  });
});

describe('AC-16, AC-17: ToggleGroup', () => {
  it('reparte el ancho por opción y emite el índice elegido en Lucia', async () => {
    const fixture = await create(ToggleGroup, { label: 'Estado', labels: ['A', 'B', 'C'], selectedIndex: 1, optionWidth: 80 });
    const emitted: number[] = [];
    fixture.componentInstance.selected.subscribe((i) => emitted.push(i));
    const toggle = (fixture.nativeElement as HTMLElement).querySelector('lucia--togglebuttons') as HTMLElement & {
      toogleOptions: { defaultSelectedOption: number };
    };

    expect(toggle.style.width).toBe('240px');
    expect(toggle.toogleOptions.defaultSelectedOption).toBe(1);

    toggle.dispatchEvent(new CustomEvent('callback', { detail: { value: 2 } }));
    expect(emitted).toStrictEqual([2]);
  });
});

describe('AC-16, AC-22: SelectFilter', () => {
  it('emite la opción elegida o null para "todos"', async () => {
    const fixture = await create(SelectFilter, { label: 'Regla', allLabel: 'Todas', options: ['a', 'b'], value: 'b' });
    const emitted: Array<string | null> = [];
    fixture.componentInstance.changed.subscribe((v) => emitted.push(v));
    const select = (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;

    expect(select.value).toBe('b');
    select.value = 'a';
    select.dispatchEvent(new Event('change'));
    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toStrictEqual(['a', null]);
  });

  it('mantiene visible un valor que ya no está entre las opciones', async () => {
    const fixture = await create(SelectFilter, { label: 'Regla', allLabel: 'Todas', options: ['a'], value: 'vieja' });
    const options = [...(fixture.nativeElement as HTMLElement).querySelectorAll('option')].map((o) => o.value);
    expect(options).toStrictEqual(['', 'a', 'vieja']);
  });
});

describe('AC-36: CheckFilter', () => {
  it('marca la casilla según el valor y avisa al cambiarla', async () => {
    const fixture = await create(CheckFilter, { label: 'Mostrar internos', checked: false });
    const box = (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;
    const emitted: boolean[] = [];
    fixture.componentInstance.changed.subscribe((v) => emitted.push(v));

    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('Mostrar internos');
    expect(box.checked).toBe(false);
    box.click();
    expect(emitted).toStrictEqual([true]);

    fixture.componentRef.setInput('checked', true);
    await fixture.whenStable();
    expect(box.checked).toBe(true);
  });
});
