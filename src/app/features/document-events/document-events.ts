import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagChapterEventResponse } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-document-events',
  imports: [RouterLink, FormsModule],
  templateUrl: './document-events.html',
  styleUrl: './document-events.scss'
})
export class DocumentEventsComponent {
  readonly importanceOptions = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  docKey = signal('');
  loading = signal(false);
  message = signal('');
  importanceMin = signal(0.9);
  events = signal<RagChapterEventResponse[]>([]);

  filteredEvents = computed(() =>
    this.events()
      .filter((event) => event.importanceScore >= this.importanceMin())
      .sort((a, b) => {
        if (a.chapterId !== b.chapterId) {
          return a.chapterId - b.chapterId;
        }
        if (a.eventOrder !== b.eventOrder) {
          return a.eventOrder - b.eventOrder;
        }
        return a.id - b.id;
      })
  );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? '');
      this.loadEvents();
    });
  }

  retry(): void {
    this.loadEvents();
  }

  onImportanceChange(value: string | number): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.max(0.1, Math.min(1, parsed));
    this.importanceMin.set(Number(clamped.toFixed(1)));
    this.loadEvents();
  }

  private loadEvents(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      this.events.set([]);
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.events.set([]);

    this.ragApi.listChapterEvents(key, this.importanceMin()).subscribe({
      next: (items) => {
        this.events.set(items ?? []);
        if (!items?.length) {
          this.message.set('No events found for this document.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Failed to load events (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }
}
