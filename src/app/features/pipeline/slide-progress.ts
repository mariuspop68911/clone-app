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
  private static readonly maxVisibleIndicators = 10;
  private readonly slideProgressService = inject(SlideProgressService);

  @Input() items: PipelineSlideProgressItem[] = [];
  @Input() currentIndex = 0;
  @Input() loading = false;

  indicatorItems(): PipelineSlideProgressViewItem[] {
    const allItems = this.slideProgressService.buildIndicators(this.items, this.currentIndex, this.loading);
    if (allItems.length <= SlideProgressComponent.maxVisibleIndicators) {
      return allItems;
    }

    const normalizedCurrentIndex = Math.max(0, Math.min(this.currentIndex, allItems.length - 1));
    const startIndex = Math.min(
      normalizedCurrentIndex,
      Math.max(0, allItems.length - SlideProgressComponent.maxVisibleIndicators)
    );
    return allItems.slice(startIndex, startIndex + SlideProgressComponent.maxVisibleIndicators);
  }

  hasLineAfter(renderedIndex: number, renderedItems: PipelineSlideProgressViewItem[]): boolean {
    return renderedIndex < renderedItems.length - 1;
  }
}
