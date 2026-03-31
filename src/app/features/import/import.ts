import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { BookImportPreviewPage, BooksApiService } from '../../core/api/books-api.service';
import { RagApiService, RagIngestMode } from '../../core/api/rag-api.service';
import {
  IngestProgressService
} from './ingest-progress.service';
import { ImportModeSelectorComponent } from './import-mode-selector';
import { PdfPageReviewComponent } from './pdf-page-review';
import { LoadingOverlayService } from '../../shared/loading-overlay.service';
import { DocumentCoverCacheService } from '../../shared/document-cover-cache.service';

@Component({
  selector: 'app-import',
  imports: [
    FormsModule,
    RouterLink,
    PdfPageReviewComponent,
    ImportModeSelectorComponent
  ],
  templateUrl: './import.html',
  styleUrl: './import.scss'
})
export class ImportComponent implements OnInit, OnDestroy {
  private static readonly documentsRefreshEvent = 'codex:documents-refresh';
  private static pdfWorkerConfigured = false;
  private ingestUploadSubscription: Subscription | null = null;
  private ingestStateSubscription: Subscription | null = null;
  private ingestOverlayToken: symbol | null = null;
  private autoIngestAfterLoad = false;
  private coverThumbnailFile: File | null = null;
  private coverThumbnailUrl = '';

  docKey = '';
  selectedFile: File | null = null;
  reviewFile = signal<File | null>(null);
  loading = signal(false);
  message = signal('');
  sourceLabel = signal('');
  reviewPages = signal<BookImportPreviewPage[]>([]);
  ingestMode = signal<RagIngestMode>('Story Mode');
  ingestActive = signal(false);
  usableDocKey = signal('');

  constructor(
    private readonly booksApi: BooksApiService,
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ingestProgress: IngestProgressService,
    private readonly loadingOverlay: LoadingOverlayService,
    private readonly documentCoverCache: DocumentCoverCacheService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const editionId = params.get('editionId')?.trim();
      const thumbnailUrl = params.get('thumbnailUrl')?.trim();
      const modeParam = params.get('mode')?.trim();
      const requestedMode =
        modeParam === 'Learning Mode' || modeParam === 'Story Mode'
          ? modeParam
          : null;
      this.autoIngestAfterLoad = params.get('autoIngest') === 'true';
      if (requestedMode) {
        this.ingestMode.set(requestedMode);
      }
      if (!editionId) {
        const source = params.get('source')?.trim();
        const sourceId = params.get('sourceId')?.trim();
        const title = params.get('title')?.trim();
        const readerUrl = params.get('readerUrl')?.trim();
        const downloadUrl = params.get('downloadUrl')?.trim();
        if (!source || !sourceId || (!readerUrl && !downloadUrl)) {
          return;
        }
        void this.loadStorySourceImportFile({
          source,
          sourceId,
          title,
          readerUrl,
          downloadUrl
        });
        return;
      }
      void this.loadBookImportFile(editionId, thumbnailUrl);
    });
  }

  ngOnDestroy(): void {
    this.stopIngestTracking();
    this.hideIngestOverlay();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextFile = input.files?.[0] ?? null;
    const isSupported = !!nextFile && this.isSupportedImportFile(nextFile);

    if (nextFile && !isSupported) {
      this.selectedFile = null;
      this.reviewFile.set(null);
      this.resetIngestProgress();
      this.message.set('Please select a PDF or EPUB file.');
      input.value = '';
      return;
    }

    this.selectedFile = nextFile;
    this.reviewFile.set(null);
    this.docKey = nextFile ? this.suggestDocKey(nextFile.name) : '';
    this.ingestMode.set('Story Mode');
    this.resetIngestProgress();
    this.message.set('');
  }

  cancelReview(): void {
    this.selectedFile = null;
    this.reviewFile.set(null);
    this.message.set('');
    this.sourceLabel.set('');
    this.reviewPages.set([]);
    this.ingestMode.set('Story Mode');
    this.coverThumbnailFile = null;
    this.coverThumbnailUrl = '';
    this.resetIngestProgress();
  }

  onConfirmSelection(excludedPageNumbers: number[]): void {
    void this.submit(excludedPageNumbers);
  }

  onModeConfirmed(): void {
    if (!this.selectedFile || this.loading() || this.ingestActive()) {
      return;
    }

    if (this.ingestMode() === 'Story Mode' && this.isPdfFile(this.selectedFile)) {
      this.reviewFile.set(this.selectedFile);
      this.message.set('');
      return;
    }

    void this.submit();
  }

  async submit(excludedPageNumbers?: number[]): Promise<void> {
    const docKey = this.docKey.trim();

    if (!docKey) {
      this.message.set('Document name is required.');
      return;
    }

    if (!this.selectedFile) {
      this.message.set('Please select a PDF or EPUB file.');
      return;
    }

    if (this.coverThumbnailUrl) {
      this.documentCoverCache.remember(docKey, this.coverThumbnailUrl);
    }

    this.loading.set(true);
    this.message.set('Preparing PDF for ingest...');
    this.showIngestOverlay('Preparing document...');

    let fileForIngest = this.selectedFile;
    if (Array.isArray(excludedPageNumbers)) {
      try {
        fileForIngest = await this.createFilteredPdf(this.selectedFile, excludedPageNumbers);
      } catch (error) {
        console.error('[Import] Failed to prepare filtered PDF', error);
        this.message.set('Could not prepare the filtered PDF for ingest.');
        this.loading.set(false);
        this.hideIngestOverlay();
        return;
      }
    }

    const thumbnailFile = this.coverThumbnailFile ?? await this.createThumbnailFile(fileForIngest);
    const task = this.ingestProgress.startIngest({
      docKey,
      mode: this.ingestMode(),
      file: fileForIngest,
      thumbnail: thumbnailFile
    });

    this.stopIngestTracking();
    this.ingestActive.set(true);
    this.usableDocKey.set('');
    this.message.set('Uploading document...');
    this.showIngestOverlay('Uploading document...');

    this.ingestStateSubscription = task.status$.subscribe({
      next: (status) => {
        if (status.failed) {
          this.ingestActive.set(false);
          this.loading.set(false);
          this.message.set(status.message || 'Ingest failed.');
          this.hideIngestOverlay();
          this.stopIngestTracking();
        } else if (status.done) {
          this.ingestActive.set(false);
          this.loading.set(false);
          this.message.set(status.message || 'File ingested successfully.');
          this.hideIngestOverlay();
          this.selectedFile = null;
          this.reviewFile.set(null);
          this.coverThumbnailFile = null;
          this.sourceLabel.set('');
          this.reviewPages.set([]);
          this.ingestMode.set('Story Mode');
          this.stopIngestTracking();
        } else if (status.usable) {
          this.usableDocKey.set(status.docKey?.trim() || docKey);
          this.message.set(
            status.message ||
              'First chapter ready. You can open the document now while the remaining chapters keep processing in the background.'
          );
          this.hideIngestOverlay();
        }
      },
      error: (error) => {
        this.ingestActive.set(false);
        this.loading.set(false);
        this.message.set(`Ingest status failed: ${this.readApiError(error)}`);
        this.hideIngestOverlay();
      }
    });

    this.ingestUploadSubscription = task.upload$.subscribe({
      next: (response) => {
        this.loading.set(false);
        const usableDocKey = response.docKey?.trim() || docKey;
        this.usableDocKey.set(usableDocKey);
        this.message.set(
          'First chapter ready. You can open the document now while the remaining chapters keep processing in the background.'
        );
        this.dispatchDocumentsRefresh();
        this.hideIngestOverlay();
      },
      error: (err) => {
        if (err?.name === 'TimeoutError') {
          this.message.set('Ingest timed out after 120s. Backend is taking too long or is unreachable.');
          this.loading.set(false);
          this.ingestActive.set(false);
          this.hideIngestOverlay();
          return;
        }

        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Ingest failed (${status}): ${backendMessage}`);
        this.loading.set(false);
        this.ingestActive.set(false);
        this.hideIngestOverlay();
      }
    });
  }

  setIngestMode(mode: RagIngestMode): void {
    this.ingestMode.set(mode);
  }

  private async createFilteredPdf(sourceFile: File, excludedPageNumbers: number[]): Promise<File> {
    const { PDFDocument } = await import('pdf-lib');
    const sourceBytes = await sourceFile.arrayBuffer();
    const sourceDocument = await PDFDocument.load(sourceBytes);
    const totalPages = sourceDocument.getPageCount();
    const excludedIndexes = new Set(
      excludedPageNumbers
        .map((pageNumber) => pageNumber - 1)
        .filter((pageIndex) => pageIndex >= 0 && pageIndex < totalPages)
    );
    const keptIndexes = Array.from({ length: totalPages }, (_, pageIndex) => pageIndex).filter(
      (pageIndex) => !excludedIndexes.has(pageIndex)
    );

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

  private async createThumbnailFile(sourceFile: File): Promise<File | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!ImportComponent.pdfWorkerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
          import.meta.url
        ).toString();
        ImportComponent.pdfWorkerConfigured = true;
      }

      const pdfDocument = await pdfjs.getDocument({ data: await sourceFile.arrayBuffer() }).promise;

      try {
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport
        }).promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', 0.82)
        );
        if (!blob) {
          return null;
        }

        return new File([blob], 'thumbnail.webp', { type: 'image/webp' });
      } finally {
        await pdfDocument.destroy();
      }
    } catch (error) {
      console.warn('[Import] Failed to create PDF thumbnail', error);
      return null;
    }
  }

  private async loadBookImportFile(editionId: string, thumbnailUrl?: string | null): Promise<void> {
    this.loading.set(true);
    this.message.set('Loading book content for import...');
    this.sourceLabel.set('');
    this.selectedFile = null;
    this.reviewFile.set(null);
    this.reviewPages.set([]);
    this.coverThumbnailFile = null;
    this.coverThumbnailUrl = typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '';
    this.resetIngestProgress();

    if (this.coverThumbnailUrl) {
      this.coverThumbnailFile = await this.loadRemoteThumbnail(this.coverThumbnailUrl);
    }

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

            this.docKey = suggestedDocKey || this.suggestDocKey(file.name) || editionId.toLowerCase();
            if (this.coverThumbnailUrl) {
              this.documentCoverCache.remember(this.docKey, this.coverThumbnailUrl);
            }
            this.selectedFile = file;
            this.reviewFile.set(null);
            this.sourceLabel.set(bookTitle ? `Loaded from "${bookTitle}"` : 'Loaded from selected book');
            this.ingestMode.set('Story Mode');
            this.resetIngestProgress();
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

  private async loadStorySourceImportFile(sourceBook: {
    source?: string;
    sourceId?: string;
    title?: string;
    readerUrl?: string;
    downloadUrl?: string;
  }): Promise<void> {
    this.loading.set(true);
    this.message.set('Loading source book for import...');
    this.sourceLabel.set('');
    this.selectedFile = null;
    this.reviewFile.set(null);
    this.reviewPages.set([]);
    this.coverThumbnailFile = null;
    this.coverThumbnailUrl = '';
    this.resetIngestProgress();

    this.ragApi
      .importStorySourceBookFile({
        source: sourceBook.source?.trim() || '',
        sourceId: sourceBook.sourceId?.trim() || '',
        title: sourceBook.title?.trim() || undefined,
        readerUrl:
          sourceBook.source?.trim() === 'STANDARD_EBOOKS'
            ? sourceBook.readerUrl?.trim() || null
            : sourceBook.readerUrl?.trim() || null,
        downloadUrl:
          sourceBook.source?.trim() === 'STANDARD_EBOOKS'
            ? null
            : sourceBook.downloadUrl?.trim() || null
      })
      .subscribe({
        next: async (response) => {
          const blob = response.body;
          if (!blob) {
            this.message.set('The selected source book did not return an importable file.');
            this.loading.set(false);
            return;
          }

          const fileName =
            this.extractFileName(response) ?? this.sourceFileName(sourceBook, blob.type);
          const normalizedFileType = blob.type || this.fileTypeFromName(fileName);
          const file = new File([blob], fileName, { type: normalizedFileType });
          const bookTitle =
            response.headers.get('X-Book-Title')?.trim() || sourceBook.title?.trim();
          const suggestedDocKey = response.headers.get('X-Suggested-Doc-Key')?.trim();
          const sourceName = this.storySourceLabel(sourceBook.source);

          this.docKey =
            suggestedDocKey ||
            this.suggestDocKey(bookTitle || file.name) ||
            this.suggestDocKey(sourceBook.sourceId || '') ||
            'document';
          this.selectedFile = file;
          this.reviewFile.set(null);
          const requestedMode = this.route.snapshot.queryParamMap.get('mode')?.trim();
          const isLearningMode = requestedMode === 'Learning Mode';
          this.ingestMode.set(isLearningMode ? 'Learning Mode' : 'Story Mode');
          this.sourceLabel.set(
            bookTitle ? `Loaded from ${sourceName}: "${bookTitle}"` : `Loaded from ${sourceName}`
          );

          const isPdf = this.isPdfFile(file);
          this.message.set(
            isPdf
              ? ''
              : 'Loaded source book. Page preview is only available for PDF source files.'
          );
          this.loading.set(false);

          if (this.autoIngestAfterLoad) {
            await this.submit();
          } else if (!isLearningMode && isPdf) {
            this.reviewFile.set(file);
            this.message.set('');
          }
        },
        error: (error) => {
          console.error('[Import] Failed to load source book', error);
          this.message.set(`Could not load the selected source book: ${this.readApiError(error)}`);
          this.loading.set(false);
        }
      });
  }

  private sourceFileName(
    sourceBook: { title?: string; sourceId?: string; downloadUrl?: string; readerUrl?: string },
    contentType?: string
  ): string {
    try {
      const candidateUrl = sourceBook.downloadUrl?.trim() || sourceBook.readerUrl?.trim() || '';
      const url = new URL(candidateUrl);
      const pathName = url.pathname.split('/').filter(Boolean).at(-1)?.trim();
      if (pathName && /\.[a-z0-9]+$/i.test(pathName)) {
        return decodeURIComponent(pathName);
      }
    } catch {
      // ignore URL parsing failure and fall back below
    }

    const title = sourceBook.title?.trim() || sourceBook.sourceId?.trim() || 'source-book';
    const stem = this.suggestDocKey(title) || 'source-book';
    const normalizedType = (contentType || '').toLowerCase();
    if (normalizedType.includes('html')) {
      return `${stem}.html`;
    }
    if (normalizedType.includes('epub')) {
      return `${stem}.epub`;
    }
    if (normalizedType.includes('pdf')) {
      return `${stem}.pdf`;
    }
    return stem;
  }

  private storySourceLabel(source?: string): string {
    switch ((source || '').trim()) {
      case 'STANDARD_EBOOKS':
        return 'Standard Ebooks';
      case 'OPENSTAX':
        return 'OpenStax';
      case 'WIKIBOOKS':
        return 'Wikibooks';
      case 'LIBRETEXTS':
        return 'LibreTexts';
      default:
        return 'Source book';
    }
  }

  private fileTypeFromName(fileName: string): string {
    const normalized = fileName.trim().toLowerCase();
    if (normalized.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (normalized.endsWith('.epub')) {
      return 'application/epub+zip';
    }
    if (normalized.endsWith('.html') || normalized.endsWith('.htm')) {
      return 'text/html';
    }
    return 'application/octet-stream';
  }

  private isPdfFile(file: File): boolean {
    const normalizedName = file.name.trim().toLowerCase();
    return file.type === 'application/pdf' || normalizedName.endsWith('.pdf');
  }

  private isEpubFile(file: File): boolean {
    const normalizedName = file.name.trim().toLowerCase();
    return file.type === 'application/epub+zip' || normalizedName.endsWith('.epub');
  }

  private isSupportedImportFile(file: File): boolean {
    return this.isPdfFile(file) || this.isEpubFile(file);
  }

  private async loadRemoteThumbnail(thumbnailUrl: string): Promise<File | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const response = await fetch(thumbnailUrl);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const url = new URL(thumbnailUrl, window.location.origin);
      const pathName = url.pathname.split('/').filter(Boolean).at(-1) || 'thumbnail';
      const fileName = /\.[a-z0-9]+$/i.test(pathName) ? pathName : `${pathName}.jpg`;
      return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    } catch (error) {
      console.warn('[Import] Failed to load remote thumbnail', error);
      return null;
    }
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

  private suggestDocKey(fileName: string): string {
    const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
    const normalized = withoutExtension
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized || 'document';
  }

  private stopIngestTracking(): void {
    this.ingestUploadSubscription?.unsubscribe();
    this.ingestStateSubscription?.unsubscribe();
    this.ingestUploadSubscription = null;
    this.ingestStateSubscription = null;
  }

  private resetIngestProgress(): void {
    this.stopIngestTracking();
    this.ingestActive.set(false);
    this.usableDocKey.set('');
    this.hideIngestOverlay();
  }

  private readApiError(error: unknown): string {
    const err = error as {
      status?: number;
      error?: unknown;
      message?: string;
    };
    const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
    const backendMessage =
      typeof err?.error === 'string'
        ? err.error
        : (err?.error as { message?: string; error?: string } | undefined)?.message ??
          (err?.error as { message?: string; error?: string } | undefined)?.error ??
          err?.message ??
          'unknown error';
    return `${status}: ${backendMessage}`;
  }

  private dispatchDocumentsRefresh(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent(ImportComponent.documentsRefreshEvent));
  }

  private showIngestOverlay(message: string): void {
    this.hideIngestOverlay();
    this.ingestOverlayToken = this.loadingOverlay.show(message);
  }

  private hideIngestOverlay(): void {
    if (!this.ingestOverlayToken) {
      return;
    }

    this.loadingOverlay.hide(this.ingestOverlayToken);
    this.ingestOverlayToken = null;
  }
}
