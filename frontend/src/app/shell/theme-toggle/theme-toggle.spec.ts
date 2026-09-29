import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeToggle } from './theme-toggle';

// spec/design.md §2.1 y §4.2: tema del sistema por defecto, claro u oscuro forzado a mano.
describe('ThemeToggle', () => {
  const root = document.documentElement;

  async function render() {
    await TestBed.configureTestingModule({ imports: [ThemeToggle] }).compileComponents();
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const click = async () => {
      button.click();
      await fixture.whenStable();
    };
    return { button, click };
  }

  beforeEach(() => {
    localStorage.clear();
    delete root.dataset['theme'];
  });

  it('sigue al sistema si no hay preferencia guardada', async () => {
    const { button } = await render();
    expect(root.dataset['theme']).toBeUndefined();
    expect(button.getAttribute('aria-label')).toContain('sistema');
  });

  it('alterna sistema → claro → oscuro → sistema y lo recuerda', async () => {
    const { button, click } = await render();

    await click();
    expect(root.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(button.getAttribute('aria-label')).toContain('claro');

    await click();
    expect(root.dataset['theme']).toBe('dark');

    await click();
    expect(root.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('aplica la preferencia guardada al arrancar', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    await render();
    expect(root.dataset['theme']).toBe('dark');
  });

  it('ignora una preferencia guardada que no es un tema', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    await render();
    expect(root.dataset['theme']).toBeUndefined();
  });
});
