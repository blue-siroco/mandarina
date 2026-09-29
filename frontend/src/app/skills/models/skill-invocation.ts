/** Quién cargó la Skill (ver `CONTEXT.md`). */
export type SkillInvoker = 'agent' | 'subagent' | 'user';

export type SkillInvocationStatus = 'running' | 'finished' | 'failed';

/** Invocación de skill leída de los Eventos o de los Transcripts (AC-29). */
export interface SkillInvocation {
  id: string;
  /** `null` si solo consta en el Transcript. */
  eventId: string | null;
  project: string;
  directory: string;
  sessionId: string;
  subagentId: string | null;
  subagentType: string | null;
  /** Turno de la Sesión en que se cargó. */
  turn: number | null;
  skill: string;
  args: string | null;
  invoker: SkillInvoker;
  status: SkillInvocationStatus;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  error: string | null;
}

/** Uso agregado de una Skill en un Proyecto (AC-30). */
export interface SkillUsage {
  project: string;
  skill: string;
  total: number;
  byInvoker: Record<SkillInvoker, number>;
  lastAt: Date;
}

export interface SkillInvocationList {
  /** La más reciente primero. */
  items: SkillInvocation[];
  /** Ordenado por total descendente. */
  stats: SkillUsage[];
  /** Proyectos con alguna invocación en la ventana. */
  projects: string[];
}

export interface SkillInvocationQuery {
  /** Ventana hacia atrás desde ahora; sin ella, todo el histórico. */
  windowMs?: number;
  sessionId?: string;
}
