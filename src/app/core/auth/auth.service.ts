import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthApiService, GoogleLoginRequest, LoginResponse, PasswordLoginRequest } from './auth-api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accessTokenState = signal<string | null>(null);

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.accessTokenState()));

  constructor(
    private readonly authApi: AuthApiService,
    private readonly router: Router
  ) {}

  login(request: PasswordLoginRequest): Observable<LoginResponse> {
    return this.authApi.login(request).pipe(
      tap((response) => this.accessTokenState.set(response.accessToken))
    );
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.authApi.loginWithGoogle(request).pipe(
      tap((response) => this.accessTokenState.set(response.accessToken))
    );
  }

  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      tap(() => {
        this.clearSession();
        void this.router.navigate(['/login']);
      })
    );
  }

  clearSession(): void {
    this.accessTokenState.set(null);
  }
}
