import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagComicBookGenerateResponse } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-pipeline',
  imports: [RouterLink],
  templateUrl: './pipeline.html',
  styleUrl: './pipeline.scss'
})
export class PipelineComponent {
  docKey = signal('');
  loading = signal(false);
  message = signal('');
  comicLoading = signal(false);
  comicMessage = signal('');
  comicProcessedChunks = signal(0);
  comicTotalChunks = signal(0);
  comicLastSceneId = signal<number | null>(null);
  comicNotesCount = signal(0);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? '');
      this.loading.set(false);
      this.message.set('');
      this.comicLoading.set(false);
      this.comicMessage.set('');
      this.comicProcessedChunks.set(0);
      this.comicTotalChunks.set(0);
      this.comicLastSceneId.set(null);
      this.comicNotesCount.set(0);
    });
  }

  generateComicNotes(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.comicMessage.set('Missing docKey.');
      return;
    }
    if (this.comicLoading()) {
      return;
    }

    this.comicLoading.set(true);
    this.comicMessage.set('');
    this.comicProcessedChunks.set(0);
    this.comicTotalChunks.set(0);
    this.comicLastSceneId.set(null);
    this.comicNotesCount.set(0);

    this.ragApi.generateComicBook({ docKey: key }).subscribe({
      next: (response) => {
        this.applyComicResponse(response);
        this.comicLoading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.comicMessage.set(`Comic notes generation failed (${status}): ${backendMessage}`);
        this.comicLoading.set(false);
      }
    });
  }

  generateGroupSummaries(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.message.set('');

    this.ragApi.generateComicGroupNotes({ docKey: key }).subscribe({
      next: () => {
        this.loading.set(false);
        this.message.set('Group summaries generation started.');
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.loading.set(false);
        this.message.set(`Failed to generate group summaries (${status}): ${backendMessage}`);
      }
    });
  }

  getSlides(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.message.set('');

    this.ragApi.getComicSlides(key).subscribe({
      next: (response) => {
        console.log('Comic slides response', response);
        this.loading.set(false);
        this.message.set('Slides loaded. Check console log.');
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.loading.set(false);
        this.message.set(`Failed to get slides (${status}): ${backendMessage}`);
      }
    });
  }

  comicProgressPercent(): number {
    const total = this.comicTotalChunks();
    if (total <= 0) {
      return this.comicLoading() ? 10 : 0;
    }
    const processed = Math.max(0, Math.min(this.comicProcessedChunks(), total));
    return Math.round((processed / total) * 100);
  }

  private applyComicResponse(response: RagComicBookGenerateResponse): void {
    const processed = this.toFiniteNonNegativeNumber(response.processedChunks);
    const total = this.toFiniteNonNegativeNumber(response.limit);
    const notes = Array.isArray(response.notes) ? response.notes : [];
    const lastSceneId = this.toNullableFiniteNumber(response.lastSceneId);

    this.comicProcessedChunks.set(processed);
    this.comicTotalChunks.set(total > 0 ? total : processed);
    this.comicLastSceneId.set(lastSceneId);
    this.comicNotesCount.set(notes.length);

    if (processed === 0 && !notes.length) {
      this.comicMessage.set('Comic notes generation completed, but no chunks were processed.');
      return;
    }

    this.comicMessage.set('Comic notes generation completed.');
  }

  private toFiniteNonNegativeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    return 0;
  }

  private toNullableFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return null;
  }
}
