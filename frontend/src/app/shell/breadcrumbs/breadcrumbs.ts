import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { shortId } from '../../shared/format';

export interface Crumb {
  label: string;
  link: string | null;
}

/** Datos de ruta que alimentan las migas: `{ breadcrumb, parent? }`. */
export interface BreadcrumbData {
  breadcrumb: string;
  /** Grupo de la barra lateral al que pertenece; por defecto *Observar*. */
  group?: string;
  parent?: { label: string; link: string };
}

export function crumbsFor(root: ActivatedRouteSnapshot): Crumb[] {
  let route = root;
  while (route.firstChild) route = route.firstChild;
  const data = route.data as Partial<BreadcrumbData>;
  if (!data.breadcrumb) return [];
  const crumbs: Crumb[] = [{ label: data.group ?? 'Observar', link: null }];
  if (data.parent) crumbs.push({ label: data.parent.label, link: data.parent.link });
  const id = route.paramMap.get('id');
  crumbs.push({ label: id ? shortId(id) : data.breadcrumb, link: null });
  return crumbs;
}

/** Migas de pan de la topbar (spec/design.md §4.2). */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  template: `
    <nav aria-label="Migas de pan">
      <ol class="breadcrumbs">
        @for (crumb of crumbs(); track $index; let last = $last) {
          <li>
            @if (last) {
              <strong aria-current="page">{{ crumb.label }}</strong>
            } @else if (crumb.link) {
              <a [routerLink]="crumb.link">{{ crumb.label }}</a>
            } @else {
              <span>{{ crumb.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styleUrl: './breadcrumbs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumbs {
  private readonly router = inject(Router);
  protected readonly crumbs = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => crumbsFor(this.router.routerState.snapshot.root)),
    ),
    { initialValue: [] },
  );
}
