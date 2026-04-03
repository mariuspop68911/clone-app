import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RagApiService, StorySourceBookResponse } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-story-source-browse',
  imports: [RouterLink],
  templateUrl: './story-source-browse.html',
  styleUrl: './story-source-browse.scss'
})
export class StorySourceBrowseComponent implements OnInit {
  books = signal<StorySourceBookResponse[]>([]);
  loading = signal(false);
  message = signal('');

  constructor(
    private readonly ragApi: RagApiService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading.set(true);
    this.message.set('');

    this.ragApi.getRandomStorySourceBooks(20).subscribe({
      next: (books) => {
        this.books.set(books ?? []);
        this.loading.set(false);
        if (!(books?.length ?? 0)) {
          this.message.set('No books available right now.');
        }
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Loading books failed (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }

  authorsText(book: StorySourceBookResponse): string {
    return Array.isArray(book.authors) && book.authors.length
      ? book.authors.join(', ')
      : 'Author not listed';
  }

  metaText(book: StorySourceBookResponse): string {
    const parts: string[] = [];
    if (typeof book.source === 'string' && book.source.trim()) {
      parts.push('Standard Ebooks');
    }
    if (typeof book.firstPublishYear === 'number') {
      parts.push(String(book.firstPublishYear));
    }
    const pageCount = this.pageCount(book);
    if (pageCount !== null) {
      parts.push(`${pageCount} pages`);
    }
    if (Array.isArray(book.languages) && book.languages.length) {
      parts.push(book.languages.join(', ').toUpperCase());
    }
    return parts.join(' • ');
  }

  tagsText(book: StorySourceBookResponse): string[] {
    return Array.isArray(book.tags)
      ? book.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 3)
      : [];
  }

  canCreateComic(book: StorySourceBookResponse): boolean {
    return !!this.importRouteParams(book);
  }

  importRouteParams(book: StorySourceBookResponse): Record<string, string> | null {
    const source = typeof book.source === 'string' ? book.source.trim() : '';
    const sourceId = typeof book.sourceId === 'string' ? book.sourceId.trim() : '';
    const title = typeof book.title === 'string' ? book.title.trim() : '';
    const readerUrl = typeof book.readerUrl === 'string' ? book.readerUrl.trim() : '';
    const downloadUrl = typeof book.downloadUrl === 'string' ? book.downloadUrl.trim() : '';

    if (!source || !sourceId) {
      return null;
    }

    if (source === 'STANDARD_EBOOKS') {
      if (!readerUrl) {
        return null;
      }

      const params: Record<string, string> = {
        source,
        sourceId,
        title,
        readerUrl,
        mode: 'Story Mode',
        autoIngest: 'true'
      };
      if (typeof book.coverUrl === 'string' && book.coverUrl.trim()) {
        params['coverUrl'] = book.coverUrl.trim();
      }
      return params;
    }

    if (!downloadUrl) {
      return null;
    }

    const params: Record<string, string> = {
      source,
      sourceId,
      title,
      downloadUrl,
      mode: 'Story Mode',
      autoIngest: 'true'
    };
    if (typeof book.coverUrl === 'string' && book.coverUrl.trim()) {
      params['coverUrl'] = book.coverUrl.trim();
    }
    return params;
  }

  private pageCount(book: StorySourceBookResponse): number | null {
    const candidates = [
      book.totalPages,
      book.pageCount,
      book.pages,
      book['total_pages'],
      book['page_count'],
      book['pageCount'],
      book['totalPages']
    ];
    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
    return null;
  }
}
