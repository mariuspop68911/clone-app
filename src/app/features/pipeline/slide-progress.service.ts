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
  loading: boolean;
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
    currentIndex: number,
    loading = false
  ): PipelineSlideProgressViewItem[] {
    const firstUnseenIndex = items.findIndex((_, index) => index >= currentIndex);

    return items.map((item, index) => {
      const color = this.kindColor(item.kind);
      const viewed = index < currentIndex;
      const current = index === currentIndex;
      const future = index > currentIndex;
      const loadingItem = loading && index === firstUnseenIndex;

      return {
        ...item,
        index,
        current,
        viewed,
        future,
        loading: loadingItem,
        dotBackground: loadingItem ? 'transparent' : current || viewed ? color : '#ffffff',
        dotBorder: loadingItem
          ? this.transparentize(color, 0.24)
          : current || viewed
            ? color
            : this.transparentize(color, 0.42),
        dotColor: loadingItem ? this.darken(color, 0.18) : viewed ? '#ffffff' : color,
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
    const { red, green, blue } = this.hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  private darken(hex: string, amount: number): string {
    const { red, green, blue } = this.hexToRgb(hex);
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    const factor = 1 - amount;

    return `rgb(${clamp(red * factor)}, ${clamp(green * factor)}, ${clamp(blue * factor)})`;
  }

  private hexToRgb(hex: string): { red: number; green: number; blue: number } {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

    return {
      red: Number.parseInt(value.slice(0, 2), 16),
      green: Number.parseInt(value.slice(2, 4), 16),
      blue: Number.parseInt(value.slice(4, 6), 16)
    };
  }
}
