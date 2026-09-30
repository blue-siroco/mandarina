import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { WaitingTitleStrategy } from './sessions/application/waiting-title-strategy';
import { routes } from './app.routes';
import { provideBudgets } from './budgets/budgets.providers';
import { provideEvaluations } from './evaluations/evaluations.providers';
import { provideSecurity } from './security/security.providers';
import { provideExporter } from './exporter/exporter.providers';
import { provideEvents } from './events/events.providers';
import { provideSessions } from './sessions/sessions.providers';
import { provideSubscription } from './subscription/subscription.providers';
import { provideSkills } from './skills/skills.providers';
import { provideSubagents } from './subagents/subagents.providers';
import { provideMcp } from './mcp/mcp.providers';
import { provideAgents } from './agents/agents.providers';
import { provideTests } from './tests/tests.providers';
import { provideUsage } from './usage/usage.providers';

// La UI está en español (CLAUDE.md): fechas como "vie 25" o "25 sept 2026".
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: WaitingTitleStrategy },
    provideHttpClient(withFetch()),
    provideEvents(),
    provideUsage(),
    provideSessions(),
    provideTests(),
    provideSkills(),
    provideSubagents(),
    provideMcp(),
    provideAgents(),
    provideExporter(),
    provideEvaluations(),
    provideSecurity(),
    provideBudgets(),
    provideSubscription(),
  ],
};
