import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { AuthApiService, GoogleLoginRequest, LoginResponse, PasswordLoginRequest } from './auth-api.service';
import { AuthStateService } from './auth-state.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private refreshRequest$: Observable<string> | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly router: Router
  ) {}

  login(request: PasswordLoginRequest): Observable<LoginResponse> {
    return this.authApi.login(request).pipe(tap((response) => this.applyLoginResponse(response)));
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.authApi.loginWithGoogle(request).pipe(tap((response) => this.applyLoginResponse(response)));
  }

  refreshAccessToken(): Observable<string> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.authApi.refresh().pipe(
        tap((response) => this.applyLoginResponse(response)),
        map((response) => response.accessToken),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.refreshRequest$;
  }

  restoreSession(): Observable<boolean> {
    return this.refreshAccessToken().pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      })
    );
  }

  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      tap(() => {
        this.finishLogout();
      })
    );
  }

  logoutAll(): Observable<void> {
    return this.authApi.logoutAll().pipe(
      tap(() => {
        this.finishLogout();
      })
    );
  }

  clearSession(): void {
    this.authState.clear();
  }

  private finishLogout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  private applyLoginResponse(response: LoginResponse): void {
    this.authState.setAccessToken(response.accessToken);
  }
}
