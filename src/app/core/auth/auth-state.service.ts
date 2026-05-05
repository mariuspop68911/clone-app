import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  // Keep the bearer token in memory only for the current app runtime.
  private readonly accessTokenState = signal<string | null>(null);
  private readonly resolvedState = signal(false);

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.accessTokenState()));
  readonly isResolved = this.resolvedState.asReadonly();
  readonly isResolving = computed(() => !this.resolvedState());

  setAccessToken(accessToken: string): void {
    this.accessTokenState.set(accessToken);
  }

  markResolved(): void {
    this.resolvedState.set(true);
  }

  clear(): void {
    this.accessTokenState.set(null);
  }
}
