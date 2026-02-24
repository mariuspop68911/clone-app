import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChunkedTtsPlayerService } from '../../core/audio/chunked-tts-player.service';
import { RagApiService, RagStoredSummaryResponse } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-summary-details',
  imports: [RouterLink],
  templateUrl: './summary-details.html',
  styleUrl: './summary-details.scss'
})
export class SummaryDetailsComponent {
  docKey = signal('');
  summaryId = signal<number | null>(null);
  summary = signal<RagStoredSummaryResponse | null>(null);
  loading = signal(false);
  message = signal('');
  ttsMessage = signal('');
  ttsLoading = signal(false);
  ttsPlaying = signal(false);
  ttsCurrentChunk = signal(0);
  ttsTotalChunks = signal(0);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ttsPlayer: ChunkedTtsPlayerService
  ) {
    this.route.paramMap.subscribe((params) => {
      const docKey = params.get('docKey') ?? '';
      const idText = params.get('summaryId');
      const summaryId = idText ? Number(idText) : NaN;

      this.docKey.set(docKey);
      this.summaryId.set(Number.isFinite(summaryId) ? summaryId : null);
      this.loadSummary();
    });
  }

  ngOnDestroy(): void {
    this.stopSummaryTts();
  }

  async playSummaryTts(): Promise<void> {
    const text = this.summary()?.summary?.trim();
    if (!text) {
      this.ttsMessage.set('No summary text available for TTS.');
      return;
    }

    this.ttsCurrentChunk.set(0);
    this.ttsTotalChunks.set(0);

    await this.ttsPlayer.play(text, {
      onLoading: (loading) => this.ttsLoading.set(loading),
      onPlaying: (playing) => this.ttsPlaying.set(playing),
      onMessage: (message) => this.ttsMessage.set(message),
      onProgress: (current, total) => {
        this.ttsCurrentChunk.set(current);
        this.ttsTotalChunks.set(total);
      }
    });
  }

  stopSummaryTts(): void {
    this.ttsPlayer.stop();
    this.ttsPlaying.set(false);
  }

  private loadSummary(): void {
    const key = this.docKey().trim();
    const id = this.summaryId();
    if (!key || !id) {
      this.summary.set(null);
      this.message.set('Invalid summary route parameters.');
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.summary.set(null);

    this.ragApi.listStoredSummaries(key).subscribe({
      next: (items) => {
        const found = (items ?? []).find((x) => x.id === id) ?? null;
        this.summary.set(found);
        if (!found) {
          this.message.set('Summary not found for this document.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Failed to load summary (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }
}
