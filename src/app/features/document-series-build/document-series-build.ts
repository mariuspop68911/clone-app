import { Component, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagSeriesEpisodeResponse } from '../../core/api/rag-api.service';
import { AppShellUiService } from '../../app-shell-ui.service';
import { EpisodeTextAreaComponent } from './episode-text-area';

@Component({
  selector: 'app-document-series-build',
  imports: [RouterLink, EpisodeTextAreaComponent],
  templateUrl: './document-series-build.html',
  styleUrl: './document-series-build.scss'
})
export class DocumentSeriesBuildComponent implements OnDestroy {
  readonly docKey = signal('');
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
      this.message.set('');
      this.building.set(false);
      this.episodes.set([]);
      if (docKey) {
        this.loadEpisodes(docKey);
      }
    });
  }

  ngOnDestroy(): void {
    this.appShellUi.setBrowseButtonVisible(true);
  }

  build(): void {
    const docKey = this.docKey().trim();
    if (!docKey || this.building()) {
      return;
    }

    this.building.set(true);
    this.message.set('');

    this.ragApi
      .processSeries({
        docKey,
        limit: 20
      })
      .subscribe({
        next: () => {
          this.building.set(false);
          this.message.set(`Build started for "${docKey}".`);
          this.loadEpisodes(docKey);
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

  private loadEpisodes(docKey: string): void {
    this.ragApi.getSeriesEpisodes(docKey).subscribe({
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
}
