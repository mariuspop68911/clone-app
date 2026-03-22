import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BookImportPreviewPage, BooksApiService } from '../../core/api/books-api.service';
import { RagApiService } from '../../core/api/rag-api.service';
import { PdfPageReviewComponent } from './pdf-page-review';

@Component({
  selector: 'app-import',
  imports: [FormsModule, PdfPageReviewComponent],
  templateUrl: './import.html',
  styleUrl: './import.scss'
})
export class ImportComponent implements OnInit {
  docKey = '';
  selectedFile: File | null = null;
  reviewFile = signal<File | null>(null);
  loading = signal(false);
  message = signal('');
  sourceLabel = signal('');
  reviewPages = signal<BookImportPreviewPage[]>([]);

  constructor(
    private readonly ragApi: RagApiService,
    private readonly booksApi: BooksApiService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const editionId = params.get('editionId')?.trim();
      if (!editionId) {
        return;
      }
      void this.loadBookImportFile(editionId);
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextFile = input.files?.[0] ?? null;
    const isPdf =
      !!nextFile &&
      (nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf'));

    if (nextFile && !isPdf) {
      this.selectedFile = null;
      this.reviewFile.set(null);
      this.message.set('Please select a PDF file.');
      input.value = '';
      return;
    }

    this.selectedFile = nextFile;
    this.reviewFile.set(nextFile);
    this.message.set('');
  }

  cancelReview(): void {
    this.selectedFile = null;
    this.reviewFile.set(null);
    this.message.set('');
    this.sourceLabel.set('');
    this.reviewPages.set([]);
  }

  onConfirmSelection(keptPageNumbers: number[]): void {
    void this.submit(keptPageNumbers);
  }

  async submit(keptPageNumbers?: number[]): Promise<void> {
    const docKey = this.docKey.trim();

    if (!docKey) {
      this.message.set('docKey is required.');
      return;
    }

    if (!this.selectedFile) {
      this.message.set('Please select a PDF file.');
      return;
    }

    this.loading.set(true);
    this.message.set('Preparing PDF for ingest...');

    let fileForIngest = this.selectedFile;
    if (Array.isArray(keptPageNumbers) && keptPageNumbers.length) {
      try {
        fileForIngest = await this.createFilteredPdf(this.selectedFile, keptPageNumbers);
      } catch (error) {
        console.error('[Import] Failed to prepare filtered PDF', error);
        this.message.set('Could not prepare the filtered PDF for ingest.');
        this.loading.set(false);
        return;
      }
    }

    this.message.set('Uploading document...');
    this.ragApi
      .ingestDocument(docKey, fileForIngest)
      .subscribe({
      next: () => {
        this.message.set('File ingested successfully.');
        this.loading.set(false);
        this.selectedFile = null;
        this.reviewFile.set(null);
        this.sourceLabel.set('');
        this.reviewPages.set([]);
      },
      error: (err) => {
        if (err?.name === 'TimeoutError') {
          this.message.set('Ingest timed out after 120s. Backend is taking too long or is unreachable.');
          this.loading.set(false);
          return;
        }
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Ingest failed (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }

  private async createFilteredPdf(sourceFile: File, keptPageNumbers: number[]): Promise<File> {
    const { PDFDocument } = await import('pdf-lib');
    const sourceBytes = await sourceFile.arrayBuffer();
    const sourceDocument = await PDFDocument.load(sourceBytes);
    const totalPages = sourceDocument.getPageCount();
    const keptIndexes = keptPageNumbers
      .map((pageNumber) => pageNumber - 1)
      .filter((pageIndex) => pageIndex >= 0 && pageIndex < totalPages);

    if (!keptIndexes.length) {
      throw new Error('No pages selected for ingest.');
    }

    if (keptIndexes.length === totalPages) {
      return sourceFile;
    }

    const filteredDocument = await PDFDocument.create();
    const copiedPages = await filteredDocument.copyPages(sourceDocument, keptIndexes);
    for (const page of copiedPages) {
      filteredDocument.addPage(page);
    }

    const filteredBytes = await filteredDocument.save();
    const normalizedBuffer = new ArrayBuffer(filteredBytes.byteLength);
    new Uint8Array(normalizedBuffer).set(filteredBytes);
    return new File([normalizedBuffer], sourceFile.name, {
      type: sourceFile.type || 'application/pdf'
    });
  }

  private async loadBookImportFile(editionId: string): Promise<void> {
    this.loading.set(true);
    this.message.set('Loading book content for import...');
    this.sourceLabel.set('');
    this.selectedFile = null;
    this.reviewFile.set(null);
    this.reviewPages.set([]);

    this.booksApi.getBookImportPreview(editionId).subscribe({
      next: (preview) => {
        this.reviewPages.set(preview.pages ?? []);

        this.booksApi.getBookImportFile(editionId).subscribe({
          next: (response) => {
            const blob = response.body;
            if (!blob) {
              this.message.set('The selected book did not return an importable file.');
              this.loading.set(false);
              return;
            }

            const fileName = this.extractFileName(response) ?? `${editionId}.pdf`;
            const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
            const suggestedDocKey = response.headers.get('X-Suggested-Doc-Key')?.trim();
            const bookTitle = response.headers.get('X-Book-Title')?.trim();

            this.docKey = suggestedDocKey || this.docKey || editionId.toLowerCase();
            this.selectedFile = file;
            this.reviewFile.set(file);
            this.sourceLabel.set(bookTitle ? `Loaded from "${bookTitle}"` : 'Loaded from selected book');
            this.message.set('');
            this.loading.set(false);
          },
          error: (err) => {
            const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
            const backendMessage =
              typeof err?.error === 'string'
                ? err.error
                : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
            this.message.set(`Could not load the selected book (${status}): ${backendMessage}`);
            this.loading.set(false);
          }
        });
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Could not load the selected book preview (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }

  private extractFileName(response: { headers: { get(name: string): string | null } }): string | null {
    const disposition = response.headers.get('Content-Disposition');
    if (!disposition) {
      return null;
    }

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
    return plainMatch?.[1] ?? null;
  }
}
