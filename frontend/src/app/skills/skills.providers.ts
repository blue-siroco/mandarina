import { Provider } from '@angular/core';
import { HttpSkillInvocationSource } from './infrastructure/http-skill-invocation-source';
import { SkillInvocationSource } from './ports/skill-invocation-source';

/** Composition root del feature de skills. */
export function provideSkills(): Provider[] {
  return [{ provide: SkillInvocationSource, useClass: HttpSkillInvocationSource }];
}
