import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthApiService, GoogleLoginRequest, LoginResponse, PasswordLoginRequest } from './auth-api.service';
import { AuthStateService } from './auth-state.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly router: Router
  ) {}

  login(request: PasswordLoginRequest): Observable<LoginResponse> {
    return this.authApi.login(request).pipe(
      tap((response) => this.authState.setAccessToken(response.accessToken))
    );
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.authApi.loginWithGoogle(request).pipe(
      tap((response) => this.authState.setAccessToken(response.accessToken))
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
    this.authState.clear();
  }
}
