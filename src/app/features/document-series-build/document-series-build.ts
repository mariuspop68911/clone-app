import { Component, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagSeriesEpisodeResponse } from '../../core/api/rag-api.service';
import { AppShellUiService } from '../../app-shell-ui.service';
import { EpisodeTextAreaComponent } from './episode-text-area';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-document-series-build',
  imports: [RouterLink, EpisodeTextAreaComponent],
  templateUrl: './document-series-build.html',
  styleUrl: './document-series-build.scss'
})
export class DocumentSeriesBuildComponent implements OnDestroy {
  readonly docKey = signal('');
  readonly docId = signal<number | null>(null);
  readonly building = signal(false);
  readonly message = signal('');
  readonly episodes = signal<RagSeriesEpisodeResponse[]>([]);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly appShellUi: AppShellUiService
  ) {
    this.appShellUi.setBrowseButtonVisible(false);

    this.route.paramMap.subscribe((params) => {
      const docKey = params.get('docKey')?.trim() ?? '';
      this.docKey.set(docKey);
      this.docId.set(null);
      this.message.set('');
      this.building.set(false);
      this.episodes.set([]);
      if (docKey) {
        void this.resolveDocumentAndLoadEpisodes(docKey);
      }
    });
  }

  ngOnDestroy(): void {
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
        next: () => {
          this.building.set(false);
          this.message.set(`Build completed for "${docKey}".`);
          this.loadEpisodes(docId);
        },
        error: (err) => {
          const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
          const backendMessage =
            typeof err?.error === 'string'
              ? err.error
              : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
          this.building.set(false);
          this.message.set(`Build failed (${status}): ${backendMessage}`);
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
        this.message.set(`Document "${docKey}" was not found.`);
      }
    } catch {
      this.docId.set(null);
      this.episodes.set([]);
    }
  }
}
