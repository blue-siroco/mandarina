// Proyección de un Evento para las descargas (ADR-0013; AC-142, AC-143). Sin `content`
// el fichero lleva solo estructura; con él añade el payload y el motivo del Bloqueo,
// siempre enmascarados aunque el Evento ya lo estuviera al ingerirlo (doble red, ADR-0009).

import type { EventType, StoredEvent } from './event.js';
import { maskSecrets } from './mask-secrets.js';

/** Tope de Eventos por descarga (AC-145); no configurable en el MVP. */
export const MAX_DOWNLOAD_EVENTS = 50_000;

export interface DownloadedEvent {
  id: string;
  harness: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  event_type: EventType;
  native_event_type: string;
  tool_name: string | null;
  occurred_at: string;
  received_at: string;
  block: { rule: string; reason?: string } | null;
  payload?: Record<string, unknown>;
}

export interface DownloadWindow {
  total: number;
  exported: number;
  truncated: boolean;
  omitted: number;
}

const STRUCTURE_FIELDS = [
  'id',
  'harness',
  'project',
  'directory',
  'session_id',
  'subagent_id',
  'event_type',
  'native_event_type',
  'tool_name',
  'occurred_at',
  'received_at',
  'block.rule',
];

/** Campos que llevará cada Evento del fichero; lo que enseña la vista previa (AC-145). */
export function downloadFields(includeContent: boolean): string[] {
  return includeContent ? [...STRUCTURE_FIELDS, 'block.reason', 'payload'] : [...STRUCTURE_FIELDS];
}

/** Cuántos Eventos salen de `total` con el tope dado: los más recientes (AC-145). */
export function downloadWindow(total: number, cap: number): DownloadWindow {
  const exported = Math.min(total, cap);
  return { total, exported, truncated: total > exported, omitted: total - exported };
}

export function toDownloadedEvent(event: StoredEvent, includeContent: boolean): DownloadedEvent {
  const base: DownloadedEvent = {
    id: event.id,
    harness: event.harness,
    project: event.project,
    directory: event.directory,
    session_id: event.session_id,
    subagent_id: event.subagent_id,
    event_type: event.event_type,
    native_event_type: event.native_event_type,
    tool_name: event.tool_name,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    block: event.block ? { rule: event.block.rule } : null,
  };
  if (!includeContent) return base;
  return maskSecrets({
    ...base,
    block: event.block ? { rule: event.block.rule, reason: event.block.reason } : null,
    payload: event.payload,
  });
}
