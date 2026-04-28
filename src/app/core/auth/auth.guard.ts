import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

function createLoginRedirect(router: Router, attemptedUrl: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: attemptedUrl || '/' }
  });
}

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return createLoginRedirect(router, state.url);
};

export const authMatchGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  const attemptedUrl = `/${segments.map((segment) => segment.path).join('/')}` || '/';
  return createLoginRedirect(router, attemptedUrl);
};
