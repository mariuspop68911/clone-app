import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { RagApiService } from '../../core/api/rag-api.service';

@Injectable({ providedIn: 'root' })
export class LearningExplainService implements OnDestroy {
  private readonly ragApi = inject(RagApiService);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly selectionChangeHandler = () => {
    this.handleDocumentSelectionChange();
  };
  private explanationRequestSub: Subscription | null = null;

  readonly panelOpen = signal(false);
  readonly selectionVisible = signal(false);
  readonly selectionText = signal('');
  readonly selectionChunkId = signal<number | null>(null);
  readonly selectionButtonTop = signal(0);
  readonly selectionButtonLeft = signal(0);
  readonly loading = signal(false);
  readonly summary = signal('');
  readonly text = signal('');
  readonly chunkId = signal<number | null>(null);
  readonly message = signal('');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.documentRef.addEventListener('selectionchange', this.selectionChangeHandler);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.documentRef.removeEventListener('selectionchange', this.selectionChangeHandler);
    }
    this.cancelPendingRequest();
  }

  reset(): void {
    this.cancelPendingRequest();
    this.panelOpen.set(false);
    this.loading.set(false);
    this.summary.set('');
    this.text.set('');
    this.chunkId.set(null);
    this.message.set('');
    this.hideSelectionButton();
    this.selectionButtonTop.set(0);
    this.selectionButtonLeft.set(0);
    this.clearWindowSelection();
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  hideSelectionButton(): void {
    this.selectionVisible.set(false);
    this.selectionText.set('');
    this.selectionChunkId.set(null);
    this.selectionButtonTop.set(0);
    this.selectionButtonLeft.set(0);
  }

  updateSelectionFromMouseUp(event: MouseEvent, chunkId: number | null): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const container = event.currentTarget as HTMLElement | null;
    const selection = this.documentRef.defaultView?.getSelection();
    const selectedText = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

    if (
      !container ||
      !selection ||
      selection.isCollapsed ||
      !range ||
      !selectedText ||
      chunkId === null ||
      !container.contains(range.commonAncestorContainer)
    ) {
      this.hideSelectionButton();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      this.hideSelectionButton();
      return;
    }

    const viewportWidth = this.documentRef.defaultView?.innerWidth ?? 0;
    const estimatedWidth = 70;
    const margin = 8;
    let left = rect.right + margin;
    if (viewportWidth && left + estimatedWidth > viewportWidth - margin) {
      left = Math.max(margin, rect.left - estimatedWidth - margin);
    }

    this.selectionText.set(selectedText);
    this.selectionChunkId.set(chunkId);
    this.selectionButtonLeft.set(Math.round(left));
    this.selectionButtonTop.set(Math.round(rect.top + rect.height / 2));
    this.selectionVisible.set(true);
  }

  triggerSelectionExplain(docKey: string, beforeOpen?: () => void): void {
    const chunkId = this.selectionChunkId();
    const summary = this.selectionText();
    if (chunkId === null || !summary.trim()) {
      return;
    }

    this.explainSummary(docKey, chunkId, summary, beforeOpen);
  }

  explainSummary(
    docKey: string,
    chunkId: number | null,
    summary: string,
    beforeOpen?: () => void
  ): void {
    const cleanedSummary = this.normalizeSummary(summary);

    if (chunkId === null || !cleanedSummary) {
      this.cancelPendingRequest();
      this.hideSelectionButton();
      this.clearWindowSelection();
      beforeOpen?.();
      this.panelOpen.set(true);
      this.loading.set(false);
      this.summary.set(cleanedSummary);
      this.text.set('');
      this.chunkId.set(chunkId);
      this.message.set('Explanation is unavailable for this slide.');
      return;
    }

    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey) {
      return;
    }

    this.cancelPendingRequest();
    this.hideSelectionButton();
    this.clearWindowSelection();
    beforeOpen?.();
    this.panelOpen.set(true);
    this.loading.set(true);
    this.summary.set(cleanedSummary);
    this.text.set('');
    this.chunkId.set(chunkId);
    this.message.set('');

    this.explanationRequestSub = this.ragApi.explainLearningSummary({
      docKey: normalizedDocKey,
      chunkId,
      summary: cleanedSummary
    }).pipe(
      finalize(() => {
        this.loading.set(false);
      })
    ).subscribe({
      next: (response) => {
        this.summary.set(
          typeof response.summary === 'string' && response.summary.trim()
            ? response.summary.trim()
            : cleanedSummary
        );
        this.text.set(
          typeof response.explanation === 'string' ? response.explanation.trim() : ''
        );
        this.chunkId.set(this.toNullableFiniteNumber(response.chunkId) ?? chunkId);
        this.message.set(
          this.text() ? '' : 'No explanation was returned for this text.'
        );
      },
      error: (err) => {
        this.text.set('');
        this.message.set(`Explain failed: ${this.readApiError(err)}`);
      }
    });
  }

  private handleDocumentSelectionChange(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const selection = this.documentRef.defaultView?.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.hideSelectionButton();
    }
  }

  private clearWindowSelection(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.documentRef.defaultView?.getSelection()?.removeAllRanges();
  }

  private cancelPendingRequest(): void {
    this.explanationRequestSub?.unsubscribe();
    this.explanationRequestSub = null;
  }

  private normalizeSummary(summary: string): string {
    return summary.replace(/\s+/g, ' ').trim();
  }

  private toNullableFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private readApiError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const payload = err.error;
      if (typeof payload === 'string' && payload.trim()) {
        return `${payload.trim()} (HTTP ${err.status})`;
      }
      if (payload && typeof payload === 'object') {
        const data = payload as Record<string, unknown>;
        const message = data['message'] ?? data['error'] ?? data['detail'];
        if (typeof message === 'string' && message.trim()) {
          return `${message.trim()} (HTTP ${err.status})`;
        }
      }
      return `${err.message || 'Request failed'} (HTTP ${err.status})`;
    }

    if (err instanceof Error && err.message.trim()) {
      return err.message.trim();
    }

    return 'Unexpected error';
  }
}
