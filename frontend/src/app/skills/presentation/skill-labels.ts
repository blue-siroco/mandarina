// Textos de las Invocaciones de skill (spec/design.md §6.3, §6.4c).
import { SkillInvocation, SkillInvocationStatus, SkillInvoker } from '../models/skill-invocation';

export const INVOKER_LABELS: Record<SkillInvoker, string> = {
  agent: 'Agente',
  subagent: 'Subagente',
  user: 'Persona usuaria',
};

/** Un Subagente se nombra por su tipo, que es lo que se reconoce en `.claude/agents/`. */
export const invokerLabel = (invocation: Pick<SkillInvocation, 'invoker' | 'subagentType'>) =>
  invocation.invoker === 'subagent' && invocation.subagentType ? invocation.subagentType : INVOKER_LABELS[invocation.invoker];

/** El estado siempre se dice con texto, no solo con color (spec/design.md §7). */
export const STATUS_LABELS: Record<SkillInvocationStatus, string> = {
  running: 'En curso',
  finished: 'Terminada',
  failed: 'Fallida',
};
