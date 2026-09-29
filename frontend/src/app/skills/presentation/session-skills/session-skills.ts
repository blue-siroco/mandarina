import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDuration } from '../../../shared/format';
import { INITIAL_SKILL_INVOCATIONS, SkillInvocationsState } from '../../application/watch-skill-invocations';
import { STATUS_LABELS, invokerLabel } from '../skill-labels';

/** Pestaña *Skills* del detalle de Sesión (AC-31). */
@Component({
  selector: 'app-session-skills',
  imports: [DatePipe, RouterLink],
  templateUrl: './session-skills.html',
  styleUrl: './session-skills.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionSkills {
  readonly state = input<SkillInvocationsState>(INITIAL_SKILL_INVOCATIONS);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly invokerLabel = invokerLabel;
  protected readonly formatDuration = formatDuration;
}
