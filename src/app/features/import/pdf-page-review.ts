import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, signal } from '@angular/core';
import { RagIngestMode } from '../../core/api/rag-api.service';

interface PdfReviewPage {
  pageNumber: number;
  thumbnailUrl: string;
  fullPageUrl: string | null;
  included: boolean;
  textSnippet: string;
}

@Component({
  selector: 'app-pdf-page-review',
  imports: [CommonModule],
  templateUrl: './pdf-page-review.html',
  styleUrl: './pdf-page-review.scss'
})
export class PdfPageReviewComponent {
  readonly modeOptions: RagIngestMode[] = [
    'Story Mode',
    'Learning Mode',
    'Action Mode',
    'Extraction Mode'
  ];
  private static readonly maxPreviewPages = 50;
  private static readonly thumbnailScale = 0.38;
  private static readonly fullPageScale = 1.15;
  private static workerConfigured = false;
  private loadToken = 0;
  private previewUrls: string[] = [];
  private pdfDocument: any = null;

  @Input() file: File | null = null;
  @Input() busy = false;
  @Input() selectedMode: RagIngestMode = 'Story Mode';
  @Input() showModePicker = true;
  @Output() confirmSelectionRequested = new EventEmitter<number[]>();
  @Output() cancelReview = new EventEmitter<void>();
  @Output() selectedModeChange = new EventEmitter<RagIngestMode>();

  pages = signal<PdfReviewPage[]>([]);
  selectedPages = signal<number[]>([]);
  activePageNumber = signal<number | null>(null);
  loading = signal(false);
  activePageLoading = signal(false);
  message = signal('');
  totalPageCount = signal(0);

  ngOnChanges(changes: SimpleChanges): void {
    if ('file' in changes) {
      void this.loadPages(this.file);
    }
  }

  ngOnDestroy(): void {
    this.clearPreviewUrls();
    void this.destroyPdfDocument();
  }

  toggleSelection(pageNumber: number): void {
    const targetPage = this.pages().find((page) => page.pageNumber === pageNumber);
    if (!targetPage?.included || this.busy) {
      return;
    }

    this.selectedPages.update((current) =>
      current.includes(pageNumber)
        ? current.filter((value) => value !== pageNumber)
        : [...current, pageNumber].sort((left, right) => left - right)
    );
  }

  deleteSelectedPages(): void {
    const selected = new Set(this.selectedPages());
    if (!selected.size || this.busy) {
      return;
    }

    this.pages.update((current) =>
      current.map((page) =>
        selected.has(page.pageNumber)
          ? {
              ...page,
              included: false
            }
          : page
      )
    );
    this.selectedPages.set([]);
    this.ensureActivePageVisible();
  }

  restoreAllPages(): void {
    if (this.busy) {
      return;
    }

    this.pages.update((current) => current.map((page) => ({ ...page, included: true })));
    this.selectedPages.set([]);
  }

  toggleCurrentPageIncluded(): void {
    const pageNumber = this.activePageNumber();
    if (!pageNumber || this.busy) {
      return;
    }

    const currentPages = this.pages();
    const currentIndex = currentPages.findIndex((page) => page.pageNumber === pageNumber);
    const currentPage = currentIndex >= 0 ? currentPages[currentIndex] : null;
    const nextVisiblePageNumber =
      currentIndex >= 0
        ? currentPages.slice(currentIndex + 1).find((page) => page.included)?.pageNumber ??
          currentPages.slice(0, currentIndex).find((page) => page.included)?.pageNumber ??
          null
        : null;

    this.pages.update((current) =>
      current.map((page) =>
        page.pageNumber === pageNumber
          ? {
              ...page,
              included: !page.included
            }
          : page
      )
    );

    if (currentPage?.included && nextVisiblePageNumber !== null) {
      this.activePageNumber.set(nextVisiblePageNumber);
      void this.ensureActivePagePreviewLoaded();
    } else if (!this.isCurrentPageIncluded()) {
      this.selectedPages.update((current) => current.filter((value) => value !== pageNumber));
    }
    this.ensureActivePageVisible();
  }

  submitSelection(): void {
    if (this.busy) {
      return;
    }

    const excludedPages = this.pages()
      .filter((page) => !page.included)
      .map((page) => page.pageNumber);

    if (this.includedCount() <= 0) {
      this.message.set('At least one page must remain selected for ingest.');
      return;
    }

    this.message.set('Starting import...');
    this.confirmSelectionRequested.emit(excludedPages);
  }

  includedCount(): number {
    const totalPageCount = this.totalPageCount();
    const excludedPreviewPages = this.pages().filter((page) => !page.included).length;
    return totalPageCount > 0
      ? Math.max(0, totalPageCount - excludedPreviewPages)
      : this.pages().filter((page) => page.included).length;
  }

  previewedPageCount(): number {
    return this.pages().length;
  }

  excludedPagesLabel(): string {
    const excluded = this.pages()
      .filter((page) => !page.included)
      .map((page) => page.pageNumber);

    return excluded.join(', ');
  }

  isSelected(pageNumber: number): boolean {
    return this.selectedPages().includes(pageNumber);
  }

  setActivePage(pageNumber: number): void {
    this.activePageNumber.set(pageNumber);
    void this.ensureActivePagePreviewLoaded();
  }

  activePage(): PdfReviewPage | null {
    const activePageNumber = this.activePageNumber();
    if (!activePageNumber) {
      return this.pages()[0] ?? null;
    }
    return this.pages().find((page) => page.pageNumber === activePageNumber) ?? this.pages()[0] ?? null;
  }

  isActivePage(pageNumber: number): boolean {
    return this.activePage()?.pageNumber === pageNumber;
  }

  isCurrentPageIncluded(): boolean {
    return this.activePage()?.included ?? false;
  }

  trackPage(_index: number, page: PdfReviewPage): number {
    return page.pageNumber;
  }

  setMode(mode: RagIngestMode): void {
    if (this.busy || mode === this.selectedMode) {
      return;
    }
    this.selectedModeChange.emit(mode);
  }

  private async loadPages(file: File | null): Promise<void> {
    const token = ++this.loadToken;
    this.clearPreviewUrls();
    await this.destroyPdfDocument();
    this.pages.set([]);
    this.selectedPages.set([]);
    this.activePageNumber.set(null);
    this.activePageLoading.set(false);
    this.message.set('');
    this.totalPageCount.set(0);

    if (!file) {
      this.loading.set(false);
      return;
    }

    if (typeof window === 'undefined') {
      this.message.set('PDF preview is only available in the browser.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!PdfPageReviewComponent.workerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
          import.meta.url
        ).toString();
        PdfPageReviewComponent.workerConfigured = true;
      }

      const fileBuffer = await file.arrayBuffer();
      if (token !== this.loadToken) {
        return;
      }

      const documentTask = pdfjs.getDocument({ data: fileBuffer });
      const pdfDocument = await documentTask.promise;
      this.pdfDocument = pdfDocument;
      this.totalPageCount.set(pdfDocument.numPages);
      const totalPages = Math.min(pdfDocument.numPages, PdfPageReviewComponent.maxPreviewPages);
      const previewMessage =
        pdfDocument.numPages > PdfPageReviewComponent.maxPreviewPages
          ? `Showing the first ${PdfPageReviewComponent.maxPreviewPages} pages for preview.`
          : '';

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        if (token !== this.loadToken) {
          await pdfDocument.destroy();
          this.pdfDocument = null;
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PdfPageReviewComponent.thumbnailScale });
        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          continue;
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport
        }).promise;

        const thumbnailUrl = await this.createPreviewUrl(canvas);
        this.previewUrls.push(thumbnailUrl);
        const nextPage: PdfReviewPage = {
          pageNumber,
          thumbnailUrl,
          fullPageUrl: null,
          included: true,
          textSnippet: 'Preview text loads when you open a page.'
        };
        this.pages.update((current) => [...current, nextPage]);
        if (pageNumber === 1) {
          this.activePageNumber.set(1);
          void this.ensureActivePagePreviewLoaded();
        }
        this.message.set(previewMessage);
      }

      if (token !== this.loadToken) {
        return;
      }
      const loadedPages = this.pages();
      if (!loadedPages.length) {
        this.message.set('No PDF pages available to review.');
      }
    } catch (error) {
      console.error('[Import] Failed to prepare PDF review', error);
      this.message.set('Could not render the PDF preview. You can choose another file and try again.');
    } finally {
      if (token === this.loadToken) {
        this.loading.set(false);
      }
    }
  }

  private clearPreviewUrls(): void {
    if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
      for (const url of this.previewUrls) {
        URL.revokeObjectURL(url);
      }
    }
    this.previewUrls = [];
  }

  private ensureActivePageVisible(): void {
    const active = this.activePage();
    if (active?.included) {
      return;
    }

    const nextIncluded = this.pages().find((page) => page.included);
    this.activePageNumber.set(nextIncluded?.pageNumber ?? active?.pageNumber ?? null);
  }

  private async createPreviewUrl(sourceCanvas: HTMLCanvasElement): Promise<string> {
    const cropBounds = this.findContentBounds(sourceCanvas);
    if (!cropBounds) {
      return this.canvasToObjectUrl(sourceCanvas);
    }

    const croppedCanvas = window.document.createElement('canvas');
    const croppedContext = croppedCanvas.getContext('2d');
    if (!croppedContext) {
      return this.canvasToObjectUrl(sourceCanvas);
    }

    croppedCanvas.width = cropBounds.width;
    croppedCanvas.height = cropBounds.height;
    croppedContext.drawImage(
      sourceCanvas,
      cropBounds.x,
      cropBounds.y,
      cropBounds.width,
      cropBounds.height,
      0,
      0,
      cropBounds.width,
      cropBounds.height
    );

    return this.canvasToObjectUrl(croppedCanvas);
  }

  private async ensureActivePagePreviewLoaded(): Promise<void> {
    const activePageNumber = this.activePageNumber();
    if (!activePageNumber || !this.pdfDocument) {
      this.activePageLoading.set(false);
      return;
    }

    const currentPage = this.pages().find((page) => page.pageNumber === activePageNumber);
    if (!currentPage || currentPage.fullPageUrl) {
      this.activePageLoading.set(false);
      return;
    }

    const token = this.loadToken;
    this.activePageLoading.set(true);

    try {
      const pdfPage = await this.pdfDocument.getPage(activePageNumber);
      const viewport = pdfPage.getViewport({ scale: PdfPageReviewComponent.fullPageScale });
      const canvas = window.document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await pdfPage.render({
        canvas,
        canvasContext: context,
        viewport
      }).promise;

      const fullPageUrl = await this.canvasToObjectUrl(canvas);
      this.previewUrls.push(fullPageUrl);

      if (token !== this.loadToken) {
        return;
      }

      this.pages.update((current) =>
        current.map((page) =>
          page.pageNumber === activePageNumber
            ? {
                ...page,
                fullPageUrl,
                textSnippet:
                  'This page preview was rendered on demand. Text extraction is deferred to keep the preview fast.'
              }
            : page
        )
      );
    } catch (error) {
      console.error('[Import] Failed to render full page preview', error);
    } finally {
      if (token === this.loadToken) {
        this.activePageLoading.set(false);
      }
    }
  }

  private canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create preview image blob.'));
          return;
        }

        resolve(URL.createObjectURL(blob));
      }, 'image/webp', 0.86);
    });
  }

  private async destroyPdfDocument(): Promise<void> {
    if (!this.pdfDocument) {
      return;
    }

    try {
      await this.pdfDocument.destroy();
    } catch {
      // Ignore teardown failures during preview refresh.
    } finally {
      this.pdfDocument = null;
    }
  }

  private findContentBounds(canvas: HTMLCanvasElement):
    | { x: number; y: number; width: number; height: number }
    | null {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }

    const { width, height } = canvas;
    const imageData = context.getImageData(0, 0, width, height).data;
    const darkPixelThreshold = 235;
    const minDarkPixelsPerRow = Math.max(8, Math.floor(width * 0.01));
    const minDarkPixelsPerColumn = Math.max(8, Math.floor(height * 0.01));

    let top = 0;
    while (top < height && this.countDarkPixelsInRow(imageData, width, top, darkPixelThreshold) < minDarkPixelsPerRow) {
      top += 1;
    }

    let bottom = height - 1;
    while (bottom > top && this.countDarkPixelsInRow(imageData, width, bottom, darkPixelThreshold) < minDarkPixelsPerRow) {
      bottom -= 1;
    }

    let left = 0;
    while (left < width && this.countDarkPixelsInColumn(imageData, width, height, left, darkPixelThreshold) < minDarkPixelsPerColumn) {
      left += 1;
    }

    let right = width - 1;
    while (right > left && this.countDarkPixelsInColumn(imageData, width, height, right, darkPixelThreshold) < minDarkPixelsPerColumn) {
      right -= 1;
    }

    if (right <= left || bottom <= top) {
      return null;
    }

    const paddingX = Math.max(12, Math.floor(width * 0.015));
    const paddingY = Math.max(12, Math.floor(height * 0.015));
    const x = Math.max(0, left - paddingX);
    const y = Math.max(0, top - paddingY);
    const croppedWidth = Math.min(width - x, right - left + paddingX * 2 + 1);
    const croppedHeight = Math.min(height - y, bottom - top + paddingY * 2 + 1);

    return {
      x,
      y,
      width: Math.max(1, croppedWidth),
      height: Math.max(1, croppedHeight)
    };
  }

  private countDarkPixelsInRow(
    imageData: Uint8ClampedArray,
    width: number,
    row: number,
    threshold: number
  ): number {
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (row * width + x) * 4;
      if (this.isDarkPixel(imageData, offset, threshold)) {
        count += 1;
      }
    }
    return count;
  }

  private countDarkPixelsInColumn(
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    column: number,
    threshold: number
  ): number {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + column) * 4;
      if (this.isDarkPixel(imageData, offset, threshold)) {
        count += 1;
      }
    }
    return count;
  }

  private isDarkPixel(
    imageData: Uint8ClampedArray,
    offset: number,
    threshold: number
  ): boolean {
    const red = imageData[offset];
    const green = imageData[offset + 1];
    const blue = imageData[offset + 2];
    const alpha = imageData[offset + 3];
    return alpha > 0 && (red < threshold || green < threshold || blue < threshold);
  }
}
