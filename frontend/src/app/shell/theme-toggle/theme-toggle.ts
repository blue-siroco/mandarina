import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mandarina.theme';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const LABELS: Record<ThemePreference, string> = { system: 'sistema', light: 'claro', dark: 'oscuro' };

// localStorage puede no existir o lanzar (modo privado, datos bloqueados): la preferencia es solo una comodidad.
function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Sin almacenamiento el tema dura lo que la pestaña.
  }
}

/** Conmutador de tema (spec/design.md §4.2): sistema → claro → oscuro. */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" class="theme-toggle" [attr.aria-label]="label()" [title]="label()" (click)="cycle()">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        @switch (preference()) {
          @case ('light') {
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          }
          @case ('dark') {
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          }
          @default {
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          }
        }
      </svg>
    </button>
  `,
  styles: `
    .theme-toggle {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);

      &:hover {
        background: var(--surface-2);
        color: var(--text);
      }
    }

    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggle {
  private readonly root = inject(DOCUMENT).documentElement;
  protected readonly preference = signal<ThemePreference>(readPreference());
  protected readonly label = computed(() => `Tema: ${LABELS[this.preference()]}. Cambiar tema`);

  constructor() {
    effect(() => {
      const preference = this.preference();
      if (preference === 'system') delete this.root.dataset['theme'];
      else this.root.dataset['theme'] = preference;
    });
  }

  protected cycle(): void {
    const next = NEXT[this.preference()];
    this.preference.set(next);
    writePreference(next);
  }
}
