import type { EventInput, StoredEvent } from '../domain/event.js';
import { maskSecrets } from '../domain/mask-secrets.js';
import type { Clock, EventPublisher, EventRepository, IdGenerator } from './ports.js';

export class IngestEvent {
  constructor(
    private readonly repository: EventRepository,
    private readonly publisher: EventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Enmascara, persiste y difunde. Se difunde solo después de persistir (AC-07). */
  execute(input: EventInput): StoredEvent {
    const event: StoredEvent = maskSecrets({
      ...input,
      subagent_id: input.subagent_id ?? null,
      tool_name: input.tool_name ?? null,
      transcript_path: input.transcript_path ?? null,
      block: input.block ?? null,
      id: this.ids.next(),
      received_at: this.clock.now().toISOString(),
    });
    this.repository.save(event);
    this.publisher.publish(event);
    return event;
  }
}
