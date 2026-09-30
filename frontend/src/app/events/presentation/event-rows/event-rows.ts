import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { shortId } from '../../../shared/format';
import { ObservedEvent } from '../../models/observed-event';
import {
  EVENT_TYPE_LABELS,
  Segment,
  hasActiveWarnings,
  maskedSegments,
  summarizeEvent,
  summarizeEventOutput,
} from '../event-labels';
import { EventWarningBadge } from '../event-warning-badge/event-warning-badge';
import { EventWarningList } from '../event-warning-list/event-warning-list';

/** Filas de Evento expandibles (spec/design.md §5.8), compartidas por la lista y el detalle de Sesión. */
@Component({
  selector: 'app-event-rows',
  imports: [DatePipe, EventWarningBadge, EventWarningList, RouterLink],
  templateUrl: './event-rows.html',
  styleUrl: './event-rows.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRows {
  readonly events = input.required<ObservedEvent[]>();
  /** Sin Proyecto, Sesión ni Directorio: dentro del detalle de Sesión son redundantes. */
  readonly compact = input(false);

  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;
  protected readonly shortId = shortId;
  protected readonly summary = summarizeEvent;
  protected readonly output = summarizeEventOutput;
  protected readonly hasWarnings = hasActiveWarnings;
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggle(id: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected payloadSegments(event: ObservedEvent): Segment[] {
    return maskedSegments(JSON.stringify(event.payload, null, 2));
  }
}
