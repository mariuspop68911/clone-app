import { Component, Input, inject } from '@angular/core';
import {
  PipelineSlideProgressItem,
  PipelineSlideProgressViewItem,
  SlideProgressService
} from './slide-progress.service';

@Component({
  selector: 'app-slide-progress',
  templateUrl: './slide-progress.html',
  styleUrl: './slide-progress.scss'
})
export class SlideProgressComponent {
  private readonly slideProgressService = inject(SlideProgressService);

  @Input() items: PipelineSlideProgressItem[] = [];
  @Input() currentIndex = 0;

  indicatorItems(): PipelineSlideProgressViewItem[] {
    return this.slideProgressService.buildIndicators(this.items, this.currentIndex);
  }

  hasLineAfter(index: number): boolean {
    return index < this.items.length - 1;
  }
}
