import { isPlatformBrowser } from '@angular/common';
import { Component, EffectRef, Inject, OnInit, PLATFORM_ID, Signal, computed, effect, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';
import { filter } from 'rxjs';
import { AppShellUiService } from './app-shell-ui.service';
import { AuthService } from './core/auth/auth.service';
import { AuthStateService } from './core/auth/auth-state.service';
import { AppLoadingOverlayComponent } from './shared/loading-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppLoadingOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  drawerOpen = signal(false);
  currentUrl = signal('');
  logoutPending = signal(false);
  logoutAllPending = signal(false);
  authResolved: Signal<boolean>;
  showShell = computed(() => {
    return this.authResolved() && this.authState.isAuthenticated() && this.currentUrl() !== '/login';
  });
  private readonly loginRecoveryEffect: EffectRef;

  constructor(
    readonly appShellUi: AppShellUiService,
    readonly authService: AuthService,
    readonly authState: AuthStateService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {
    this.authResolved = this.authState.isResolved;
    this.loginRecoveryEffect = effect(() => {
      if (!isPlatformBrowser(this.platformId) || !this.authState.isAuthenticated()) {
        return;
      }

      const url = this.currentUrl();
      if (!url.startsWith('/login')) {
        return;
      }

      const parsedUrl = this.router.parseUrl(url);
      const returnUrl = parsedUrl.queryParams['returnUrl'];
      const destination =
        typeof returnUrl === 'string' && returnUrl.trim() && returnUrl !== '/login'
          ? returnUrl
          : '/documents2';
      void this.router.navigateByUrl(destination, { replaceUrl: true });
    });
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.currentUrl.set(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        if (event.urlAfterRedirects === '/login') {
          this.closeDrawer();
        }
      });
  }

  toggleDrawer(): void {
    this.drawerOpen.update((current) => !current);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  logout(): void {
    if (this.logoutPending() || this.logoutAllPending()) {
      return;
    }

    this.logoutPending.set(true);
    this.authService
      .logout()
      .pipe(finalize(() => this.logoutPending.set(false)))
      .subscribe({
        next: () => this.closeDrawer(),
        error: () => this.logoutPending.set(false)
      });
  }

  logoutAll(): void {
    if (this.logoutPending() || this.logoutAllPending()) {
      return;
    }

    this.logoutAllPending.set(true);
    this.authService
      .logoutAll()
      .pipe(finalize(() => this.logoutAllPending.set(false)))
      .subscribe({
        next: () => this.closeDrawer(),
        error: () => this.logoutAllPending.set(false)
      });
  }
}
