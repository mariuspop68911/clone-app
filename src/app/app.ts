import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppShellUiService } from './app-shell-ui.service';
import { AppLoadingOverlayComponent } from './shared/loading-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppLoadingOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  drawerOpen = signal(false);

  constructor(
    readonly appShellUi: AppShellUiService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
  }

  toggleDrawer(): void {
    this.drawerOpen.update((current) => !current);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}
