import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExporterIndicator } from './exporter/presentation/exporter-indicator/exporter-indicator';
import { BudgetAlert } from './budgets/presentation/budget-alert/budget-alert';
import { Breadcrumbs } from './shell/breadcrumbs/breadcrumbs';
import { ConnectionStatus } from './shell/connection-status/connection-status';
import { ThemeToggle } from './shell/theme-toggle/theme-toggle';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Breadcrumbs, BudgetAlert, ConnectionStatus, ExporterIndicator, ThemeToggle],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
