import { Injectable, computed, inject, signal } from '@angular/core';
import { SUGGESTED_TAGS } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';

/**
 * Caso de uso: Etiquetas para el autocompletado (AC-57): las sugeridas y las ya
 * usadas, pedidas una vez y ampliadas con lo que se guarda. Falla en silencio:
 * sin la lista siguen valiendo las sugeridas.
 */
@Injectable({ providedIn: 'root' })
export class EvaluationTags {
  private readonly source = inject(EvaluationSource);
  private readonly used = signal<readonly string[]>([]);
  private requested = false;

  /** Las usadas primero (por uso), luego las sugeridas que aún no se han usado. */
  readonly options = computed(() => [...new Set([...this.used(), ...SUGGESTED_TAGS])]);

  /** Pide las usadas la primera vez que un control las necesita. */
  ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;
    this.source.tags().subscribe({
      next: (tags) => this.used.update((known) => [...new Set([...tags.map((t) => t.tag), ...known])]),
      error: () => undefined,
    });
  }

  remember(tags: readonly string[]): void {
    this.used.update((known) => [...new Set([...known, ...tags])]);
  }
}
