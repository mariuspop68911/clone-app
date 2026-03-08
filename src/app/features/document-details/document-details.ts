import { Component, computed, effect, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  RagSummaryJobService,
  RagSummaryJobState
} from '../../core/api/rag-summary-job.service';
import {
  RagApiService,
  RagComicBookGenerateResponse,
  RagImageGenerateResponse,
  RagStoredSummaryResponse,
  RagSummarySize
} from '../../core/api/rag-api.service';

@Component({
  selector: 'app-document-details',
  imports: [RouterLink],
  templateUrl: './document-details.html',
  styleUrl: './document-details.scss'
})
export class DocumentDetailsComponent {
  docKey = signal('');
  showSizePicker = signal(false);
  message = signal('');
  quickQuestion = signal('');
  imageLoading = signal(false);
  imageMessage = signal('');
  generatedImageUrl = signal('');
  generatedImageMimeType = signal('');
  generatedImageModel = signal('');
  comicLoading = signal(false);
  comicMessage = signal('');
  comicProcessedChunks = signal(0);
  comicTotalChunks = signal(0);
  comicLastSceneId = signal<number | null>(null);
  comicNotesCount = signal(0);
  storedSummaries = signal<RagStoredSummaryResponse[]>([]);
  loadingStoredSummaries = signal(false);
  storedSummariesError = signal('');
  private readonly lastSuccessUpdatedAt = signal(0);
  summaryState = computed<RagSummaryJobState | null>(() =>
    this.summaryJobs.getJob(this.docKey())
  );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly summaryJobs: RagSummaryJobService,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? 'Unknown Document');
      this.showSizePicker.set(false);
      this.message.set('');
      this.quickQuestion.set('');
      this.imageLoading.set(false);
      this.imageMessage.set('');
      this.generatedImageUrl.set('');
      this.generatedImageMimeType.set('');
      this.generatedImageModel.set('');
      this.comicLoading.set(false);
      this.comicMessage.set('');
      this.comicProcessedChunks.set(0);
      this.comicTotalChunks.set(0);
      this.comicLastSceneId.set(null);
      this.comicNotesCount.set(0);
      this.lastSuccessUpdatedAt.set(0);
      this.loadStoredSummaries();
    });

    effect(
      () => {
        const job = this.summaryState();
        if (!job || job.status !== 'success') {
          return;
        }
        if (job.updatedAt === this.lastSuccessUpdatedAt()) {
          return;
        }
        this.lastSuccessUpdatedAt.set(job.updatedAt);
        this.loadStoredSummaries();
      }
    );
  }

  summarize(): void {
    this.showSizePicker.set(!this.showSizePicker());
    this.message.set('');
  }

  ask(): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }
    this.router.navigate(['/documents', key, 'chat']);
  }

  onQuickQuestionInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.quickQuestion.set(target?.value ?? '');
  }

  sendQuickQuestion(): void {
    const prompt = this.quickQuestion().trim();
    if (!prompt || this.imageLoading()) {
      return;
    }

    this.imageLoading.set(true);
    this.imageMessage.set('');
    this.generatedImageUrl.set('');
    this.generatedImageMimeType.set('');
    this.generatedImageModel.set('');
    const provider = 'openai';
    const model = 'gpt-image-1';

    this.ragApi.generateImage({ prompt, provider, model }).subscribe({
      next: (response) => {
        const imageUrl = this.toImageDataUrl(response);
        if (!imageUrl) {
          this.imageMessage.set('Image generation completed, but no image data was returned.');
          this.imageLoading.set(false);
          return;
        }

        this.generatedImageUrl.set(imageUrl);
        this.generatedImageMimeType.set((response.mimeType ?? '').trim());
        this.generatedImageModel.set((response.model ?? '').trim());
        this.imageLoading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.imageMessage.set(`Image generation failed (${status}): ${backendMessage}`);
        this.imageLoading.set(false);
      }
    });
  }

  generateComicBook(): void {
    const key = this.docKey().trim();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
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
        this.comicMessage.set(`Comic generation failed (${status}): ${backendMessage}`);
        this.comicLoading.set(false);
      }
    });
  }

  generateCharacterImages(): void {
    const key = this.docKey().trim();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }

    this.router.navigate(['/documents', key, 'characters-images']);
  }

  comicProgressPercent(): number {
    const total = this.comicTotalChunks();
    if (total <= 0) {
      return this.comicLoading() ? 10 : 0;
    }
    const processed = Math.max(0, Math.min(this.comicProcessedChunks(), total));
    return Math.round((processed / total) * 100);
  }

  private toImageDataUrl(response: RagImageGenerateResponse): string {
    const raw = (response.imageBase64 ?? '').trim();
    if (!raw) {
      return '';
    }
    if (raw.startsWith('data:')) {
      return raw;
    }

    const mimeType = (response.mimeType ?? 'image/png').trim() || 'image/png';
    return `data:${mimeType};base64,${raw}`;
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
      this.comicMessage.set('Comic generation completed, but no chunks were processed.');
      return;
    }

    this.comicMessage.set('Comic generation completed.');
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

  characters(): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }
    this.router.navigate(['/documents', key, 'characters']);
  }

  events(): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }
    this.router.navigate(['/documents', key, 'events']);
  }

  startSummary(size: RagSummarySize): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }

    const started = this.summaryJobs.start(key, size);
    if (!started) {
      this.message.set('Summary is already running for this document.');
      return;
    }

    this.showSizePicker.set(false);
    this.message.set(`Summary started in background with "${size}" size.`);
  }

  elapsedSeconds(job: RagSummaryJobState): number {
    const end = job.status === 'running' ? Date.now() : job.updatedAt;
    return Math.max(0, Math.floor((end - job.startedAt) / 1000));
  }

  summaryText(job: RagSummaryJobState): string {
    const text = job.response?.summary;
    if (typeof text === 'string' && text.trim()) {
      return text;
    }
    return 'Summary completed, but no summary text was returned.';
  }

  refreshStoredSummaries(): void {
    this.loadStoredSummaries();
  }

  private loadStoredSummaries(): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.storedSummaries.set([]);
      this.storedSummariesError.set('');
      return;
    }

    this.loadingStoredSummaries.set(true);
    this.storedSummariesError.set('');
    this.ragApi.listStoredSummaries(key).subscribe({
      next: (items) => {
        this.storedSummaries.set(items ?? []);
        this.loadingStoredSummaries.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.storedSummariesError.set(
          `Failed to load stored summaries (${status}): ${backendMessage}`
        );
        this.loadingStoredSummaries.set(false);
      }
    });
  }
}
