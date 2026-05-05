import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { RagApiService, RagIngestMode } from '../../core/api/rag-api.service';
import { IngestProgressComponent } from './ingest-progress';
import { IngestProgressStatus, IngestProgressService } from './ingest-progress.service';
import { ImportModeSelectorComponent } from './import-mode-selector';
import { LoadingOverlayService } from '../../shared/loading-overlay.service';
import { DocumentCoverCacheService } from '../../shared/document-cover-cache.service';

@Component({
  selector: 'app-import',
  imports: [
    FormsModule,
    RouterLink,
    ImportModeSelectorComponent,
    IngestProgressComponent
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
  private sourceCoverUrl: string | null = null;

  docKey = '';
  selectedFile: File | null = null;
  loading = signal(false);
  message = signal('');
  sourceLabel = signal('');
  ingestMode = signal<RagIngestMode>('Story Mode');
  ingestActive = signal(false);
  usableDocKey = signal('');
  currentIngestStatus = signal<IngestProgressStatus | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ingestProgress: IngestProgressService,
    private readonly loadingOverlay: LoadingOverlayService,
    private readonly documentCoverCache: DocumentCoverCacheService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const modeParam = params.get('mode')?.trim();
      const requestedMode =
        modeParam === 'Learning Mode' || modeParam === 'Story Mode'
          ? modeParam
          : null;
      this.autoIngestAfterLoad = params.get('autoIngest') === 'true';
      if (requestedMode) {
        this.ingestMode.set(requestedMode);
      }

      const source = params.get('source')?.trim();
      const sourceId = params.get('sourceId')?.trim();
      const title = params.get('title')?.trim();
      const readerUrl = params.get('readerUrl')?.trim();
      const downloadUrl = params.get('downloadUrl')?.trim();
      const coverUrl = params.get('coverUrl')?.trim();
      if (!source || !sourceId || (!readerUrl && !downloadUrl)) {
        return;
      }

      void this.loadStorySourceImportFile({
        source,
        sourceId,
        title,
        readerUrl,
        downloadUrl,
        coverUrl
      });
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
      this.resetIngestProgress();
      this.message.set('Please select a PDF or EPUB file.');
      input.value = '';
      return;
    }

    this.selectedFile = nextFile;
    this.sourceCoverUrl = null;
    this.docKey = nextFile ? this.suggestDocKey(nextFile.name) : '';
    this.ingestMode.set('Story Mode');
    this.resetIngestProgress();
    this.message.set('');
  }

  cancelImport(): void {
    this.selectedFile = null;
    this.sourceCoverUrl = null;
    this.message.set('');
    this.sourceLabel.set('');
    this.ingestMode.set('Story Mode');
    this.resetIngestProgress();
  }

  onModeConfirmed(): void {
    if (!this.selectedFile || this.loading() || this.ingestActive()) {
      return;
    }

    void this.submit();
  }

  async submit(): Promise<void> {
    const docKey = this.docKey.trim();

    if (!docKey) {
      this.message.set('Document name is required.');
      return;
    }

    if (!this.selectedFile) {
      this.message.set('Please select a PDF or EPUB file.');
      return;
    }

    this.loading.set(true);
    this.message.set('Preparing PDF for ingest...');
    this.showIngestOverlay('Preparing document...');

    const fileForIngest = this.selectedFile;
    const thumbnailUrl =
      typeof this.sourceCoverUrl === 'string' && this.sourceCoverUrl.trim()
        ? this.sourceCoverUrl.trim()
        : null;
    const thumbnailFile = thumbnailUrl ? null : await this.createThumbnailFile(fileForIngest);
    const task = this.ingestProgress.startIngest({
      docKey,
      mode: this.ingestMode(),
      file: fileForIngest,
      thumbnail: thumbnailFile,
      thumbnailUrl
    });

    this.stopIngestTracking();
    this.ingestActive.set(true);
    this.usableDocKey.set('');
    this.currentIngestStatus.set(null);
    this.message.set('Uploading document...');
    this.showIngestOverlay('Uploading document...');

    this.ingestStateSubscription = task.status$.subscribe({
      next: (status) => {
        this.currentIngestStatus.set(status);
        this.hideIngestOverlay();
        if (status.failed) {
          this.ingestActive.set(false);
          this.loading.set(false);
          this.message.set(status.message || 'Ingest failed.');
          this.stopIngestTracking();
        } else if (status.done) {
          this.ingestActive.set(false);
          this.loading.set(false);
          this.message.set(status.message || 'File ingested successfully.');
          this.selectedFile = null;
          this.sourceLabel.set('');
          this.ingestMode.set('Story Mode');
          this.stopIngestTracking();
        } else if (status.usable) {
          const nextUsableDocKey = status.docKey?.trim() || docKey;
          if (thumbnailUrl) {
            this.documentCoverCache.remember(nextUsableDocKey, thumbnailUrl);
          }
          if (!this.usableDocKey()) {
            this.dispatchDocumentsRefresh();
          }
          this.usableDocKey.set(nextUsableDocKey);
          this.message.set(
            status.message ||
              'First chapter ready. You can open the document now while the remaining chapters keep processing in the background.'
          );
        }
      },
      error: (error) => {
        this.ingestActive.set(false);
        this.loading.set(false);
        this.message.set(`Ingest status failed: ${this.readApiError(error)}`);
        this.currentIngestStatus.set(null);
        this.hideIngestOverlay();
      }
    });

    this.ingestUploadSubscription = task.upload$.subscribe({
      next: (response) => {
        this.loading.set(false);
        if (thumbnailUrl) {
          this.documentCoverCache.remember(docKey, thumbnailUrl);
        }
        this.message.set(
          typeof response.jobId === 'string' && response.jobId.trim()
            ? 'Upload accepted. Processing your document now.'
            : 'Upload finished. Waiting for ingest progress updates.'
        );
        this.hideIngestOverlay();
      },
      error: (err) => {
        if (err?.name === 'TimeoutError') {
          this.message.set('Ingest timed out after 120s. Backend is taking too long or is unreachable.');
          this.loading.set(false);
          this.ingestActive.set(false);
          this.currentIngestStatus.set(null);
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
        this.currentIngestStatus.set(null);
        this.hideIngestOverlay();
      }
    });
  }

  setIngestMode(mode: RagIngestMode): void {
    this.ingestMode.set(mode);
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

  private async loadStorySourceImportFile(sourceBook: {
    source?: string;
    sourceId?: string;
    title?: string;
    readerUrl?: string;
    downloadUrl?: string;
    coverUrl?: string;
  }): Promise<void> {
    this.loading.set(true);
    this.message.set('Loading source book for import...');
    this.sourceLabel.set('');
    this.selectedFile = null;
    this.sourceCoverUrl = null;
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
          this.sourceCoverUrl =
            typeof sourceBook.coverUrl === 'string' && sourceBook.coverUrl.trim()
              ? sourceBook.coverUrl.trim()
              : null;
          const requestedMode = this.route.snapshot.queryParamMap.get('mode')?.trim();
          const isLearningMode = requestedMode === 'Learning Mode';
          this.ingestMode.set(isLearningMode ? 'Learning Mode' : 'Story Mode');
          this.sourceLabel.set(
            bookTitle ? `Loaded from ${sourceName}: "${bookTitle}"` : `Loaded from ${sourceName}`
          );

          this.message.set('');
          this.loading.set(false);

          if (this.autoIngestAfterLoad) {
            await this.submit();
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
    this.currentIngestStatus.set(null);
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
