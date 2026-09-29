import { Routes } from '@angular/router';
import { BreadcrumbData } from './shell/breadcrumbs/breadcrumbs';

const crumb = (data: BreadcrumbData) => data;

// El board es la pantalla de inicio (spec/design.md §6.1).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sesiones' },
  {
    path: 'sesiones',
    title: 'Board · Mandarina',
    data: crumb({ breadcrumb: 'Board' }),
    loadComponent: () => import('./sessions/presentation/session-board/session-board').then((m) => m.SessionBoard),
  },
  {
    path: 'sesiones/:id',
    title: 'Sesión · Mandarina',
    data: crumb({ breadcrumb: 'Sesión', parent: { label: 'Board', link: '/sesiones' } }),
    loadComponent: () => import('./sessions/presentation/session-detail/session-detail').then((m) => m.SessionDetailPage),
  },
  {
    path: 'eventos',
    title: 'Eventos · Mandarina',
    data: crumb({ breadcrumb: 'Eventos' }),
    loadComponent: () => import('./events/presentation/event-list/event-list').then((m) => m.EventList),
  },
  {
    path: 'bloqueos',
    title: 'Bloqueos · Mandarina',
    data: crumb({ breadcrumb: 'Bloqueos' }),
    loadComponent: () => import('./blocks/presentation/blocks-page/blocks-page').then((m) => m.BlocksPage),
  },
  {
    path: 'seguridad',
    title: 'Seguridad · Mandarina',
    data: crumb({ breadcrumb: 'Seguridad' }),
    loadComponent: () => import('./security/presentation/security-page/security-page').then((m) => m.SecurityPage),
  },
  {
    path: 'evaluaciones',
    title: 'Evaluaciones · Mandarina',
    data: crumb({ breadcrumb: 'Evaluaciones' }),
    loadComponent: () => import('./evaluations/presentation/evaluations-page/evaluations-page').then((m) => m.EvaluationsPage),
  },
  {
    path: 'tests',
    title: 'Tests · Mandarina',
    data: crumb({ breadcrumb: 'Tests' }),
    loadComponent: () => import('./tests/presentation/tests-page/tests-page').then((m) => m.TestsPage),
  },
  {
    path: 'skills',
    title: 'Skills · Mandarina',
    data: crumb({ breadcrumb: 'Skills' }),
    loadComponent: () => import('./skills/presentation/skills-page/skills-page').then((m) => m.SkillsPage),
  },
  {
    path: 'subagentes',
    title: 'Subagentes · Mandarina',
    data: crumb({ breadcrumb: 'Subagentes' }),
    loadComponent: () => import('./subagents/presentation/subagents-page/subagents-page').then((m) => m.SubagentsPage),
  },
  {
    path: 'mcp',
    title: 'MCP · Mandarina',
    data: crumb({ breadcrumb: 'MCP' }),
    loadComponent: () => import('./mcp/presentation/mcp-page/mcp-page').then((m) => m.McpPage),
  },
  {
    path: 'agentes',
    title: 'Agentes · Mandarina',
    data: crumb({ breadcrumb: 'Agentes' }),
    loadComponent: () => import('./agents/presentation/agents-page/agents-page').then((m) => m.AgentsPage),
  },
  {
    path: 'agentes/:tipo',
    title: 'Agente · Mandarina',
    data: crumb({ breadcrumb: 'Agente', parent: { label: 'Agentes', link: '/agentes' } }),
    loadComponent: () => import('./agents/presentation/agent-profile-page/agent-profile-page').then((m) => m.AgentProfilePage),
  },
  {
    path: 'presupuestos',
    title: 'Presupuestos · Mandarina',
    data: crumb({ breadcrumb: 'Presupuestos', group: 'Configurar' }),
    loadComponent: () => import('./budgets/presentation/budgets-page/budgets-page').then((m) => m.BudgetsPage),
  },
  { path: '**', redirectTo: 'sesiones' },
];
