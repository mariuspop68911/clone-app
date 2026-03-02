import { Component, computed, effect, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  RagSummaryJobService,
  RagSummaryJobState
} from '../../core/api/rag-summary-job.service';
import {
  RagApiService,
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
