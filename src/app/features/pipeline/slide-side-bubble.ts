import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-slide-side-bubble',
  templateUrl: './slide-side-bubble.html',
  styleUrl: './slide-side-bubble.scss'
})
export class SlideSideBubbleComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() variant: 'ask' | 'explain' | 'source' = 'explain';
  @Input() side: 'left' | 'right' = 'right';
  @Input() wide = false;
  @Input() showHeader = true;
  @Output() closeRequested = new EventEmitter<void>();

  requestClose(): void {
    this.closeRequested.emit();
  }
}
