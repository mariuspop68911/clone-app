import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-image-viewer-modal',
  templateUrl: './image-viewer-modal.html',
  styleUrl: './image-viewer-modal.scss'
})
export class ImageViewerModalComponent {
  @Input() imageUrl = '';
  @Input() alt = 'Image preview';
  @Input() zoom = 1;
  @Input() explainVisible = false;
  @Input() explainLoading = false;
  @Output() closeRequested = new EventEmitter<void>();
  @Output() zoomInRequested = new EventEmitter<void>();
  @Output() zoomOutRequested = new EventEmitter<void>();
  @Output() zoomResetRequested = new EventEmitter<void>();
  @Output() explainRequested = new EventEmitter<void>();
}
