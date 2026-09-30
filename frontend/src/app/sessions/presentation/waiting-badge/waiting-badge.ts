import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { relativeTime, shortId } from '../../../shared/format';
import { SessionWaiting } from '../../models/session';

/** Trozo del motivo; `code` marca herramienta, comando y Subagente para pintarlos en monoespaciada. */
export interface ReasonPart {
  text: string;
  code?: boolean;
}

/** Motivo de la espera en una línea, sin HTML: todo se pinta como texto (AC-94). */
export function waitingReasonParts(waiting: SessionWaiting): ReasonPart[] {
  const { reason, tool, summary, subagent } = waiting;
  if (reason === 'idle') return [{ text: 'Inactiva esperando tu respuesta' }];
  const parts: ReasonPart[] = [];
  const verb = reason === 'question' ? 'pregunta' : 'pide permiso';
  if (subagent) {
    parts.push(
      { text: 'Subagente ' },
      { text: subagent.type ?? shortId(subagent.id), code: true },
      { text: ` ${verb}` },
    );
  } else {
    parts.push({ text: verb[0].toUpperCase() + verb.slice(1) });
  }
  if (reason === 'permission') {
    if (tool) parts.push({ text: ' para ' }, { text: tool, code: true });
    if (summary) parts.push({ text: ': ' }, { text: summary, code: !!tool });
  } else if (summary) {
    parts.push({ text: `: ${summary}` });
  }
  return parts;
}

/**
 * Badge *Esperando* con el motivo (AC-94). El estado va en texto, no solo en color, y sirve igual
 * en la tarjeta del board, el detalle y el aviso de la cabecera.
 */
@Component({
  selector: 'app-waiting-badge',
  templateUrl: './waiting-badge.html',
  styleUrl: './waiting-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaitingBadge {
  readonly waiting = input.required<SessionWaiting>();
  /** Con reloj se añade cuánto lleva esperando (detalle). */
  readonly now = input<Date | null>(null);
  /** Sin la etiqueta *Esperando*: el aviso de la cabecera ya tiene la suya. */
  readonly reasonOnly = input(false);

  protected readonly parts = computed(() => waitingReasonParts(this.waiting()));
  protected readonly since = computed(() => {
    const now = this.now();
    return now ? relativeTime(this.waiting().since, now).replace('hace', 'desde hace') : null;
  });
}
