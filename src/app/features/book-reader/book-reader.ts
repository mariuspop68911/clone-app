import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BooksApiService, BookReaderData } from '../../core/api/books-api.service';

@Component({
  selector: 'app-book-reader',
  imports: [RouterLink],
  templateUrl: './book-reader.html',
  styleUrl: './book-reader.scss'
})
export class BookReaderComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly booksApi = inject(BooksApiService);
  private readonly sanitizer = inject(DomSanitizer);

  loading = signal(true);
  message = signal('');
  book = signal<BookReaderData | null>(null);
  embedUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const editionId = params.get('editionId')?.trim() ?? '';
      if (!editionId) {
        this.message.set('Missing book edition id.');
        this.loading.set(false);
        return;
      }
      this.loadBook(editionId);
    });
  }

  private loadBook(editionId: string): void {
    this.loading.set(true);
    this.message.set('');
    this.book.set(null);
    this.embedUrl.set(null);

    this.booksApi.getBookReader(editionId).subscribe({
      next: (book) => {
        this.book.set(book);
        this.embedUrl.set(
          book.embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(book.embedUrl) : null
        );
        if (!book.embedUrl && !book.textUrl && !book.pdfUrl && !book.epubUrl) {
          this.message.set('This book does not expose a readable file in the API response.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Loading book failed (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }
}
