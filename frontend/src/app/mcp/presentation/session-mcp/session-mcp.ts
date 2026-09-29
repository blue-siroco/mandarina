import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { INITIAL_MCP, McpState } from '../../application/watch-mcp-invocations';
import { STATUS_LABELS, formatBytes, formatLatency, formatRate } from '../mcp-labels';

/** Pestaña *MCP* del detalle de Sesión (AC-43). */
@Component({
  selector: 'app-session-mcp',
  imports: [DatePipe],
  templateUrl: './session-mcp.html',
  styleUrl: './session-mcp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionMcp {
  readonly state = input<McpState>(INITIAL_MCP);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly formatBytes = formatBytes;
  protected readonly formatLatency = formatLatency;
  protected readonly formatRate = formatRate;
}
