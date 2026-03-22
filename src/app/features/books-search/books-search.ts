import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BooksApiService, BookSearchResult } from '../../core/api/books-api.service';

@Component({
  selector: 'app-books-search',
  imports: [FormsModule, RouterLink],
  templateUrl: './books-search.html',
  styleUrl: './books-search.scss'
})
export class BooksSearchComponent {
  bookQuery = signal('');
  bookResults = signal<BookSearchResult[]>([]);
  booksLoading = signal(false);
  booksMessage = signal('Try "Pride and Prejudice", "Jane Austen", or "Frankenstein".');
 
  constructor(private readonly booksApi: BooksApiService) {}

  updateBookQuery(value: string): void {
    this.bookQuery.set(value);
  }

  searchBooks(): void {
    const query = this.bookQuery().trim();
    if (!query) {
      this.bookResults.set([]);
      this.booksMessage.set('Enter a title, author, or topic to search for books.');
      return;
    }

    this.booksLoading.set(true);
    this.booksMessage.set('');

    this.booksApi.searchBooks(query, 8).subscribe({
      next: (results) => {
        this.bookResults.set(results);
        this.booksLoading.set(false);
        if (!results.length) {
          this.booksMessage.set(`No books found for "${query}".`);
        }
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.booksMessage.set(`Book search failed (${status}): ${backendMessage}`);
        this.booksLoading.set(false);
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
}
