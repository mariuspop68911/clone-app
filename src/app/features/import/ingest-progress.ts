import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IngestProgressStatus } from './ingest-progress.service';

@Component({
  selector: 'app-ingest-progress',
  templateUrl: './ingest-progress.html',
  styleUrl: './ingest-progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IngestProgressComponent {
  readonly status = input<IngestProgressStatus | null>(null);

  readonly progressPercent = computed(() => this.status()?.progressPercent ?? 0);
  readonly message = computed(() => {
    const status = this.status();
    if (!status) {
      return '';
    }
    return status.message?.trim() || this.friendlyStageLabel(status.stage);
  });
  readonly stageLabel = computed(() => {
    const stage = this.status()?.stage ?? '';
    return stage ? this.friendlyStageLabel(stage) : '';
  });
  readonly isFailed = computed(() => !!this.status()?.failed);
  readonly isDone = computed(() => !!this.status()?.done);

  private friendlyStageLabel(stage: string): string {
    const stageLabels: Record<string, string> = {
      STARTED: 'Starting ingest',
      EXTRACTING_PAGES: 'Extracting PDF pages',
      SAVING_DOCUMENT: 'Saving document',
      SAVING_COVER: 'Saving cover',
      BOOK_CONTEXT: 'Building book context',
      CHUNKING: 'Splitting content into chunks',
      EMBEDDINGS: 'Generating embeddings',
      PERSISTING_CHUNKS: 'Saving chunks',
      SAVING_CONTEXT: 'Saving context',
      WAITING_FOR_PDF_WORKFLOW: 'Waiting for PDF workflow',
      UPLOADING_PDF: 'Uploading PDF',
      EXTRACTING_PDF_IMAGES: 'Extracting PDF images',
      PDF_UPLOAD_READY: 'Preparing uploaded PDF',
      SAVING_PDF_REFERENCE: 'Saving PDF reference',
      DONE: 'Ingest completed',
      FAILED: 'Ingest failed'
    };

    return stageLabels[stage] ?? stage.toLowerCase().replace(/_/g, ' ');
  }
}
