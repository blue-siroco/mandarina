import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { switchMap } from 'rxjs';
import '@lucia/button';
import { formatInteger } from '../../../shared/format';
import { LOADING_PREVIEW, PreviewDownload } from '../../application/preview-download';
import { DownloadTarget } from '../../models/download';

/**
 * Diálogo de la Descarga de Sesión y de la Descarga de Eventos (AC-147). Se monta solo
 * mientras está abierto: así la casilla «Incluir contenido» nace desmarcada cada vez
 * y nada se recuerda entre descargas (ADR-0013).
 */
@Component({
  selector: 'app-download-dialog',
  templateUrl: './download-dialog.html',
  styleUrl: './download-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { '(document:focusin)': 'keepFocusInside($event)' },
})
export class DownloadDialog {
  readonly target = input.required<DownloadTarget>();
  readonly closed = output<void>();

  private readonly preview = inject(PreviewDownload);
  private readonly window = viewChild.required<ElementRef<HTMLElement>>('window');

  protected readonly closeButton = { text: '✕', typeButton: 'secondary', icon: '', position: 'after', disabled: false };
  protected readonly formatInteger = formatInteger;
  protected readonly includeContent = signal(false);
  private readonly attempt = signal(0);

  protected readonly title = computed(() =>
    this.target().kind === 'session' ? 'Descarga de Sesión' : 'Descarga de Eventos',
  );
  protected readonly format = computed(() =>
    this.target().kind === 'session' ? 'JSON de Sesión (.json)' : 'JSONL de Eventos (.jsonl), una línea por Evento',
  );

  protected readonly state = toSignal(
    toObservable(computed(() => ({ content: this.includeContent(), attempt: this.attempt() }))).pipe(
      switchMap(({ content }) => this.preview.execute(this.target(), content)),
    ),
    { initialValue: LOADING_PREVIEW },
  );
  /** Con la vista previa sin cargar, o con `total` 0, no hay nada que descargar. */
  protected readonly canDownload = computed(() => {
    const s = this.state();
    return s.status === 'ready' && s.preview.total > 0;
  });
  protected readonly link = computed(() => this.preview.link(this.target(), this.includeContent()));

  constructor() {
    // El foco vuelve a lo que lo tenía (el botón que abrió el diálogo) al destruirse; hacerlo aquí y no
    // en quien abre evita que el atrapado de foco lo devuelva a la ventana antes de que desaparezca.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inject(DestroyRef).onDestroy(() => opener?.focus());
    // El foco entra en la ventana al abrir para que Esc y el tabulador actúen dentro.
    afterNextRender(() => this.window().nativeElement.focus());
  }

  close(): void {
    this.closed.emit();
  }

  protected onCloseButtonClick(): void {
    this.close();
  }

  protected onContentChange(event: Event): void {
    this.includeContent.set((event.target as HTMLInputElement).checked);
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }

  /** Solo cierra un clic en la capa, no uno dentro de la ventana. */
  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  /** Foco atrapado: si el tabulador se sale de la ventana, vuelve a ella. */
  protected keepFocusInside(event: FocusEvent): void {
    const window = this.window().nativeElement;
    if (event.target instanceof Node && !window.contains(event.target)) window.focus();
  }
}
