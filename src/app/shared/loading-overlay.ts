import { Component, inject } from '@angular/core';
import { LoadingOverlayService } from './loading-overlay.service';

@Component({
  selector: 'app-loading-overlay',
  templateUrl: './loading-overlay.html',
  styleUrl: './loading-overlay.scss'
})
export class AppLoadingOverlayComponent {
  readonly loadingOverlay = inject(LoadingOverlayService);
}
