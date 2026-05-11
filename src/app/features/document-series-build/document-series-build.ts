import { Component, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { RagApiService, RagSeriesEpisodeResponse } from '../../core/api/rag-api.service';
import { AppShellUiService } from '../../app-shell-ui.service';
import { EpisodeTextAreaComponent } from './episode-text-area';
import { JobStatusPollingService } from '../../core/api/job-status-polling.service';

@Component({
  selector: 'app-document-series-build',
  imports: [RouterLink, EpisodeTextAreaComponent],
  templateUrl: './document-series-build.html',
  styleUrl: './document-series-build.scss'
})
export class DocumentSeriesBuildComponent implements OnDestroy {
  private seriesJobSubscription: Subscription | null = null;
  readonly docKey = signal('');
  readonly docId = signal<number | null>(null);
  readonly building = signal(false);
  readonly message = signal('');
  readonly episodes = signal<RagSeriesEpisodeResponse[]>([]);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly appShellUi: AppShellUiService,
    private readonly jobStatusPolling: JobStatusPollingService
  ) {
    this.appShellUi.setBrowseButtonVisible(false);

    this.route.paramMap.subscribe((params) => {
      const docKey = params.get('docKey')?.trim() ?? '';
      this.docKey.set(docKey);
      this.docId.set(null);
      this.message.set('');
      this.building.set(false);
      this.episodes.set([]);
      this.seriesJobSubscription?.unsubscribe();
      this.seriesJobSubscription = null;
      if (docKey) {
        void this.resolveDocumentAndLoadEpisodes(docKey);
      }
    });
  }

  ngOnDestroy(): void {
    this.seriesJobSubscription?.unsubscribe();
    this.appShellUi.setBrowseButtonVisible(true);
  }

  build(): void {
    const docKey = this.docKey().trim();
    const docId = this.docId();
    if (!docKey || docId === null || this.building()) {
      return;
    }

    this.building.set(true);
    this.message.set('');

    this.ragApi
      .processSeries({
        docId,
        limit: 20
      })
      .subscribe({
        next: (job) => {
          this.message.set(
            typeof job.message === 'string' && job.message.trim()
              ? job.message.trim()
              : 'Series build started for your document.'
          );
          this.seriesJobSubscription?.unsubscribe();
          this.seriesJobSubscription = this.jobStatusPolling.watchJob(job.jobId).subscribe({
            next: (status) => {
              const stageMessage =
                typeof status.message === 'string' && status.message.trim()
                  ? status.message.trim()
                  : this.friendlyJobMessage(status.status, 'Building your series...');

              if (!this.jobStatusPolling.isTerminal(status)) {
                this.message.set(stageMessage);
                return;
              }

              this.building.set(false);
              if (this.jobStatusPolling.isSuccessful(status)) {
                this.message.set(`Series build completed for your document "${docKey}".`);
                this.loadEpisodes(docId);
                return;
              }

              this.message.set(stageMessage || 'Series build failed.');
            },
            error: (err) => {
              this.building.set(false);
              this.message.set(`Build failed: ${this.readApiError(err)}`);
            }
          });
        },
        error: (err) => {
          this.building.set(false);
          this.message.set(`Build failed: ${this.readApiError(err)}`);
        }
      });
  }

  private loadEpisodes(docId: number): void {
    this.ragApi.getSeriesEpisodes(docId).subscribe({
      next: (episodes) => {
        this.episodes.set(
          Array.isArray(episodes)
            ? episodes.filter((episode) => {
                const title =
                  typeof episode?.episodeTitle === 'string'
                    ? episode.episodeTitle
                    : typeof episode?.episode_title === 'string'
                      ? episode.episode_title
                      : '';
                return title.trim().length > 0;
              })
            : []
        );
      },
      error: () => {
        this.episodes.set([]);
      }
    });
  }

  private async resolveDocumentAndLoadEpisodes(docKey: string): Promise<void> {
    try {
      const docs = await firstValueFrom(this.ragApi.listDocuments());
      const normalizedDocKey = docKey.trim();
      const match = (docs ?? []).find((doc) => {
        const candidate = typeof doc.docKey === 'string' ? doc.docKey.trim() : '';
        return candidate === normalizedDocKey;
      });
      const docId =
        typeof match?.documentId === 'number'
          ? match.documentId
          : typeof match?.id === 'number'
            ? match.id
            : null;

      this.docId.set(docId !== null && Number.isFinite(docId) ? docId : null);
      if (docId !== null && Number.isFinite(docId)) {
        this.loadEpisodes(docId);
      } else {
        this.episodes.set([]);
        this.message.set(`Document "${docKey}" was not found in your library.`);
      }
    } catch {
      this.docId.set(null);
      this.episodes.set([]);
    }
  }

  private readApiError(error: unknown): string {
    const err = error as {
      status?: number;
      error?: unknown;
      message?: string;
    };
    const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
    const backendMessage =
      typeof err?.error === 'string'
        ? err.error
        : (err?.error as { message?: string; error?: string } | undefined)?.message ??
          (err?.error as { message?: string; error?: string } | undefined)?.error ??
          err?.message ??
          'unknown error';
    return `${status}: ${backendMessage}`;
  }

  private friendlyJobMessage(status: unknown, fallback: string): string {
    if (typeof status !== 'string' || !status.trim()) {
      return fallback;
    }

    return status.trim().toLowerCase().replace(/_/g, ' ');
  }
}
