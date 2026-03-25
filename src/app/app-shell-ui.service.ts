import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AppShellUiService {
  readonly browseButtonVisible = signal(true);

  setBrowseButtonVisible(visible: boolean): void {
    this.browseButtonVisible.set(visible);
  }
}
