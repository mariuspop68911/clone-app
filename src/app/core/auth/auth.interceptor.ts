import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import {
  includeApiCredentials,
  isConfiguredApiRequest,
  isConfiguredAuthRequest,
  isConfiguredRefreshRequest
} from '../config/app-environment';
import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';

const HAS_REFRESH_RETRY = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authState = inject(AuthStateService);
  const authService = inject(AuthService);
  const token = authState.accessToken();
  const shouldIncludeCredentials = includeApiCredentials();
  const isApiRequest = isConfiguredApiRequest(request.url);
  const isAuthRequest = isConfiguredAuthRequest(request.url);
  const isRefreshRequest = isConfiguredRefreshRequest(request.url);
  const requestToSend =
    isApiRequest
      ? request.clone({
          withCredentials: shouldIncludeCredentials,
          ...(token && !isRefreshRequest
            ? {
                setHeaders: {
                  Authorization: `Bearer ${token}`
                }
              }
            : {})
        })
      : request;

  return next(requestToSend).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      if (!isApiRequest || isAuthRequest || request.context.get(HAS_REFRESH_RETRY)) {
        authService.clearSession();
        return throwError(() => error);
      }

      return authService.refreshAccessToken().pipe(
        switchMap((refreshedToken) =>
          next(
            request.clone({
              withCredentials: shouldIncludeCredentials,
              context: request.context.set(HAS_REFRESH_RETRY, true),
              setHeaders: {
                Authorization: `Bearer ${refreshedToken}`
              }
            })
          )
        ),
        catchError((refreshError: unknown) => {
          authService.handleSessionExpired();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
