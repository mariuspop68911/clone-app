import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BooksApiService,
  BookSearchResult,
  BrowseBooksCategory,
  BrowseBooksResponse
} from '../../core/api/books-api.service';

@Component({
  selector: 'app-books-browse',
  imports: [RouterLink],
  templateUrl: './books-browse.html',
  styleUrl: './books-browse.scss'
})
export class BooksBrowseComponent implements OnInit {
  browseData = signal<BrowseBooksResponse | null>(null);
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
        this.browseData.set(results);
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

  browseCategories(): BrowseBooksCategory[] {
    return this.browseData()?.categories ?? [];
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
}
