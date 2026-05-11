import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingOverlayService {
  private readonly activeTokens = signal<symbol[]>([]);
  readonly message = signal('Loading...');
  readonly visible = computed(() => this.activeTokens().length > 0);

  show(message = 'Loading...'): symbol {
    const token = Symbol('loading-overlay');
    this.message.set(message);
    this.activeTokens.update((current) => [...current, token]);
    return token;
  }

  hide(token: symbol | null | undefined): void {
    if (!token) {
      return;
    }

    this.activeTokens.update((current) => current.filter((entry) => entry !== token));
  }
}
