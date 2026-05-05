import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppShellUiService } from './app-shell-ui.service';
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
  showShell = computed(() => this.authState.isAuthenticated() && this.currentUrl() !== '/login');

  constructor(
    readonly appShellUi: AppShellUiService,
    readonly authState: AuthStateService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

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
}
