import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, signal } from '@angular/core';
import { BookImportPreviewPage } from '../../core/api/books-api.service';

interface PdfReviewPage {
  pageNumber: number;
  thumbnailUrl: string;
  fullPageUrl: string;
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
  private static workerConfigured = false;
  private loadToken = 0;
  private previewUrls: string[] = [];

  @Input() file: File | null = null;
  @Input() externalPages: BookImportPreviewPage[] = [];
  @Input() busy = false;
  @Output() confirmSelectionRequested = new EventEmitter<number[]>();
  @Output() cancelReview = new EventEmitter<void>();

  pages = signal<PdfReviewPage[]>([]);
  selectedPages = signal<number[]>([]);
  activePageNumber = signal<number | null>(null);
  loading = signal(false);
  message = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if ('externalPages' in changes) {
      this.loadExternalPages(this.externalPages);
    }

    if ('file' in changes && (!Array.isArray(this.externalPages) || !this.externalPages.length)) {
      void this.loadPages(this.file);
    }
  }

  ngOnDestroy(): void {
    this.clearPreviewUrls();
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

    if (!this.isCurrentPageIncluded()) {
      this.selectedPages.update((current) => current.filter((value) => value !== pageNumber));
    }
    this.ensureActivePageVisible();
  }

  submitSelection(): void {
    if (this.busy) {
      return;
    }

    const includedPages = this.pages()
      .filter((page) => page.included)
      .map((page) => page.pageNumber);

    if (!includedPages.length) {
      this.message.set('At least one page must remain selected for ingest.');
      return;
    }

    this.message.set('Starting import...');
    this.confirmSelectionRequested.emit(includedPages);
  }

  includedCount(): number {
    return this.pages().filter((page) => page.included).length;
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

  private async loadPages(file: File | null): Promise<void> {
    const token = ++this.loadToken;
    this.clearPreviewUrls();
    this.pages.set([]);
    this.selectedPages.set([]);
    this.activePageNumber.set(null);
    this.message.set('');

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
      const nextPages: PdfReviewPage[] = [];

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        if (token !== this.loadToken) {
          await pdfDocument.destroy();
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.2 });
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

        const textContent = await page.getTextContent();
        const textSnippet = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 260);

        const fullPageUrl = canvas.toDataURL('image/png');
        const thumbnailUrl = this.createPreviewUrl(canvas);
        this.previewUrls.push(fullPageUrl, thumbnailUrl);
        nextPages.push({
          pageNumber,
          thumbnailUrl,
          fullPageUrl,
          included: true,
          textSnippet
        });
      }

      await pdfDocument.destroy();
      if (token !== this.loadToken) {
        return;
      }

      this.pages.set(nextPages);
      this.activePageNumber.set(nextPages[0]?.pageNumber ?? null);
      this.message.set(nextPages.length ? '' : 'No PDF pages available to review.');
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
    this.previewUrls = [];
  }

  private loadExternalPages(externalPages: BookImportPreviewPage[] | null | undefined): void {
    this.clearPreviewUrls();
    this.selectedPages.set([]);
    this.activePageNumber.set(null);
    this.message.set('');

    if (!Array.isArray(externalPages) || !externalPages.length) {
      this.pages.set([]);
      return;
    }

    const pages = externalPages.map((page) => ({
      pageNumber: page.pageNumber,
      thumbnailUrl: page.imageUrl,
      fullPageUrl: page.imageUrl,
      included: true,
      textSnippet: page.pageType ?? ''
    }));

    this.pages.set(pages);
    this.activePageNumber.set(pages[0]?.pageNumber ?? null);
    this.loading.set(false);
  }

  private ensureActivePageVisible(): void {
    const active = this.activePage();
    if (active?.included) {
      return;
    }

    const nextIncluded = this.pages().find((page) => page.included);
    this.activePageNumber.set(nextIncluded?.pageNumber ?? active?.pageNumber ?? null);
  }

  private createPreviewUrl(sourceCanvas: HTMLCanvasElement): string {
    const cropBounds = this.findContentBounds(sourceCanvas);
    if (!cropBounds) {
      return sourceCanvas.toDataURL('image/png');
    }

    const croppedCanvas = window.document.createElement('canvas');
    const croppedContext = croppedCanvas.getContext('2d');
    if (!croppedContext) {
      return sourceCanvas.toDataURL('image/png');
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

    return croppedCanvas.toDataURL('image/png');
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
