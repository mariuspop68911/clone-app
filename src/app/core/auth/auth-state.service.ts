import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  // Keep the bearer token in memory only for the current app runtime.
  private readonly accessTokenState = signal<string | null>(null);

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.accessTokenState()));

  setAccessToken(accessToken: string): void {
    this.accessTokenState.set(accessToken);
  }

  clear(): void {
    this.accessTokenState.set(null);
  }
}
