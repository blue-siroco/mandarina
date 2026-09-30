import { sessionDetail, sessionDetailDto, sessionSummary, sessionSummaryDto } from '../testing/session-fixtures';
import { toSessionDetail, toSessionList } from './session.mapper';

describe('AC-15: toSessionList', () => {
  it('traduce las Sesiones y las facetas', () => {
    const list = toSessionList({
      items: [sessionSummaryDto()],
      facets: { projects: ['demo'], directories: ['C:\\Codev\\demo'] },
    });
    expect(list).toStrictEqual({
      items: [sessionSummary()],
      facets: { projects: ['demo'], directories: ['C:\\Codev\\demo'] },
    });
  });
});

describe('AC-68: avisos de inyección de la Sesión', () => {
  it('traduce injection_alerts en el board y en el detalle', () => {
    const list = toSessionList({
      items: [sessionSummaryDto({ injection_alerts: 3 })],
      facets: { projects: [], directories: [] },
    });
    expect(list.items[0]?.injectionAlerts).toBe(3);
    expect(toSessionDetail(sessionDetailDto({ injection_alerts: 2 })).injectionAlerts).toBe(2);
    // AC-72: sin caché (backend antiguo o sin Transcript) queda vacío.
    expect(toSessionDetail(sessionDetailDto()).cache).toBeNull();
    expect(toSessionDetail(sessionDetailDto()).cacheRewrites).toStrictEqual([]);
  });

  it('acepta un backend anterior que no lo envía', () => {
    const dto = sessionSummaryDto();
    delete dto.injection_alerts;
    expect(toSessionList({ items: [dto], facets: { projects: [], directories: [] } }).items[0]?.injectionAlerts).toBe(0);
  });
});

describe('AC-84: Sesión detenida por presupuesto', () => {
  it('traduce budget_stopped en el board y en el detalle', () => {
    const list = toSessionList({
      items: [sessionSummaryDto({ budget_stopped: true })],
      facets: { projects: [], directories: [] },
    });
    expect(list.items[0]?.budgetStopped).toBe(true);
    expect(toSessionDetail(sessionDetailDto({ budget_stopped: true })).budgetStopped).toBe(true);
  });

  it('acepta un backend anterior que no lo envía', () => {
    const dto = sessionSummaryDto();
    delete dto.budget_stopped;
    expect(toSessionList({ items: [dto], facets: { projects: [], directories: [] } }).items[0]?.budgetStopped).toBe(false);
  });
});

describe('AC-59: Puntuación de la Sesión', () => {
  it.each([1, -1, null] as const)('traduce evaluation_score %s', (score) => {
    const list = toSessionList({
      items: [sessionSummaryDto({ evaluation_score: score })],
      facets: { projects: [], directories: [] },
    });
    expect(list.items[0]?.evaluationScore).toBe(score);
  });

  it('el detalle conserva la Puntuación y el id de cada Turno (AC-54)', () => {
    const detail = toSessionDetail(sessionDetailDto({ evaluation_score: -1 }));
    expect(detail.evaluationScore).toBe(-1);
    expect(detail.turns.map((t) => t.id)).toStrictEqual(['prompt-1', 'prompt-2']);
  });
});

describe('AC-92, AC-94: espera de la Sesión', () => {
  const waitingDto = {
    since: '2026-09-25T10:05:00.000Z',
    reason: 'permission' as const,
    tool: 'Bash',
    summary: 'npm run build',
    subagent: { id: 'agent-1', type: 'e2e-builder' },
  };
  const empty = { projects: [], directories: [] };

  it('traduce waiting con since como fecha y conserva el Subagente', () => {
    const list = toSessionList({
      items: [sessionSummaryDto({ activity: 'waiting', waiting: waitingDto })],
      facets: empty,
    });
    expect(list.items[0]).toMatchObject({
      activity: 'waiting',
      waiting: {
        since: new Date('2026-09-25T10:05:00.000Z'),
        reason: 'permission',
        tool: 'Bash',
        summary: 'npm run build',
        subagent: { id: 'agent-1', type: 'e2e-builder' },
      },
    });
  });

  it('acepta waiting sin herramienta ni Subagente, nulo, o ausente en un backend anterior', () => {
    const idle = {
      since: waitingDto.since,
      reason: 'idle' as const,
      tool: null,
      summary: null,
      subagent: null,
    };
    const old = sessionSummaryDto();
    delete old.waiting;
    const items = toSessionList({
      items: [sessionSummaryDto({ waiting: idle }), sessionSummaryDto(), old],
      facets: empty,
    }).items;
    expect(items[0]?.waiting).toStrictEqual({
      since: new Date(waitingDto.since),
      reason: 'idle',
      tool: null,
      summary: null,
      subagent: null,
    });
    expect(items[1]?.waiting).toBeNull();
    expect(items[2]?.waiting).toBeNull();
  });

  it('el detalle hereda waiting', () => {
    expect(toSessionDetail(sessionDetailDto({ activity: 'waiting', waiting: waitingDto })).waiting?.reason).toBe('permission');
  });
});

describe('AC-18: toSessionDetail', () => {
  it('traduce el detalle completo con fechas', () => {
    expect(toSessionDetail(sessionDetailDto())).toStrictEqual(sessionDetail());
  });

  it('conserva los null de una Sesión sin Transcript', () => {
    const detail = toSessionDetail(
      sessionDetailDto({
        transcript_available: false,
        usage: null,
        context: null,
        model: null,
        subagents: [{ ...sessionDetailDto().subagents[0]!, tokens: null, model: null, stopped_at: null }],
      }),
    );
    expect(detail).toMatchObject({
      transcriptAvailable: false,
      usage: null,
      context: null,
      model: null,
    });
    expect(detail.subagents[0]).toMatchObject({ tokens: null, model: null, stoppedAt: null });
  });
});
