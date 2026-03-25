import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RagIngestMode } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-import-mode-selector',
  templateUrl: './import-mode-selector.html',
  styleUrl: './import-mode-selector.scss'
})
export class ImportModeSelectorComponent {
  readonly modeOptions: RagIngestMode[] = ['Story Mode', 'Learning Mode'];

  @Input() selectedMode: RagIngestMode = 'Story Mode';
  @Input() busy = false;
  @Output() selectedModeChange = new EventEmitter<RagIngestMode>();
  @Output() confirmRequested = new EventEmitter<void>();
  @Output() cancelRequested = new EventEmitter<void>();

  setMode(mode: RagIngestMode): void {
    if (this.busy || mode === this.selectedMode) {
      return;
    }
    this.selectedModeChange.emit(mode);
  }
}
