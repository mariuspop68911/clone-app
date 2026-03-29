import { Injectable } from '@angular/core';

export type PipelineSlideProgressKind =
  | 'story'
  | 'learning'
  | 'takeaway'
  | 'quiz'
  | 'review'
  | 'reviewQuiz';

export interface PipelineSlideProgressItem {
  kind: PipelineSlideProgressKind;
}

export interface PipelineSlideProgressViewItem extends PipelineSlideProgressItem {
  index: number;
  current: boolean;
  viewed: boolean;
  future: boolean;
  dotBackground: string;
  dotBorder: string;
  dotColor: string;
  lineColor: string;
  opacity: number;
}

@Injectable({ providedIn: 'root' })
export class SlideProgressService {
  buildIndicators(
    items: PipelineSlideProgressItem[],
    currentIndex: number
  ): PipelineSlideProgressViewItem[] {
    return items.map((item, index) => {
      const color = this.kindColor(item.kind);
      const viewed = index < currentIndex;
      const current = index === currentIndex;
      const future = index > currentIndex;

      return {
        ...item,
        index,
        current,
        viewed,
        future,
        dotBackground: current || viewed ? color : '#ffffff',
        dotBorder: current || viewed ? color : this.transparentize(color, 0.42),
        dotColor: viewed ? '#ffffff' : color,
        lineColor: index < currentIndex ? color : this.transparentize(color, 0.22),
        opacity: future ? 0.55 : 1
      };
    });
  }

  private kindColor(kind: PipelineSlideProgressKind): string {
    switch (kind) {
      case 'learning':
        return '#c8a97b';
      case 'takeaway':
        return '#d8a643';
      case 'quiz':
        return '#6b9fd9';
      case 'review':
        return '#d28d52';
      case 'reviewQuiz':
        return '#7f8fd8';
      case 'story':
      default:
        return '#e96b5b';
    }
  }

  private transparentize(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
}
