import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BooksApiService,
  BookSearchResult,
  BrowseBooksCategory,
  BrowseBooksResponse
} from '../../core/api/books-api.service';

interface BrowseCategoryViewModel extends BrowseBooksCategory {
  offset: number;
  hasMore: boolean;
  loadingMore: boolean;
}

@Component({
  selector: 'app-books-browse',
  imports: [RouterLink],
  templateUrl: './books-browse.html',
  styleUrl: './books-browse.scss'
})
export class BooksBrowseComponent implements OnInit {
  private static readonly browsePageSize = 10;

  categories = signal<BrowseCategoryViewModel[]>([]);
  browseLoading = signal(false);
  browseMessage = signal('');

  constructor(
    private readonly booksApi: BooksApiService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadBrowseBooks();
  }

  loadBrowseBooks(): void {
    this.browseLoading.set(true);
    this.browseMessage.set('');

    this.booksApi.browseReadableBooks(20).subscribe({
      next: (results) => {
        this.categories.set(this.toCategoryViewModels(results));
        this.browseLoading.set(false);
        if (!results.categories?.length) {
          this.browseMessage.set('No browse books available right now.');
        }
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.browseMessage.set(`Browse books failed (${status}): ${backendMessage}`);
        this.browseLoading.set(false);
      }
    });
  }

  loadMore(categoryKey: string): void {
    const category = this.categories().find((entry) => entry.key === categoryKey);
    if (!category || category.loadingMore || !category.hasMore) {
      return;
    }

    this.patchCategory(categoryKey, { loadingMore: true });

    this.booksApi
      .browseCategoryPage(categoryKey, BooksBrowseComponent.browsePageSize, category.offset)
      .subscribe({
        next: (response) => {
          this.categories.update((current) =>
            current.map((entry) =>
              entry.key === categoryKey
                ? {
                    ...entry,
                    label: response.label || entry.label,
                    books: [...entry.books, ...response.books],
                    count: entry.count + response.count,
                    offset: response.offset + response.count,
                    hasMore: response.hasMore,
                    loadingMore: false
                  }
                : entry
            )
          );
        },
        error: (err) => {
          const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
          const backendMessage =
            typeof err?.error === 'string'
              ? err.error
              : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
          this.browseMessage.set(`Load more failed (${status}): ${backendMessage}`);
          this.patchCategory(categoryKey, { loadingMore: false });
        }
      });
  }

  bookSubtitle(book: BookSearchResult): string {
    return book.authors.length ? book.authors.join(', ') : 'Author not listed';
  }

  bookMeta(book: BookSearchResult): string {
    const parts: string[] = [];
    if (book.firstPublishYear) {
      parts.push(`First published ${book.firstPublishYear}`);
    }
    if (book.totalPages) {
      parts.push(`${book.totalPages} page${book.totalPages === 1 ? '' : 's'}`);
    }
    return parts.join(' | ');
  }

  private toCategoryViewModels(results: BrowseBooksResponse): BrowseCategoryViewModel[] {
    const pageSize = results.booksPerCategory || 20;
    return (results.categories ?? []).map((category) => ({
      ...category,
      offset: category.books.length,
      hasMore: category.books.length >= pageSize,
      loadingMore: false
    }));
  }

  private patchCategory(
    categoryKey: string,
    patch: Partial<Pick<BrowseCategoryViewModel, 'loadingMore' | 'hasMore' | 'offset'>>
  ): void {
    this.categories.update((current) =>
      current.map((entry) =>
        entry.key === categoryKey
          ? {
              ...entry,
              ...patch
            }
          : entry
      )
    );
  }
}
