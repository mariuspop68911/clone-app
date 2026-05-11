import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DocumentCoverCacheService {
  private static readonly storageKey = 'codex:document-cover-cache';

  remember(docKey: string, coverUrl: string | null | undefined): void {
    const normalizedDocKey = docKey.trim();
    const normalizedCoverUrl = typeof coverUrl === 'string' ? coverUrl.trim() : '';
    if (!normalizedDocKey || !normalizedCoverUrl) {
      return;
    }

    const next = this.readCache();
    next[normalizedDocKey] = normalizedCoverUrl;
    this.writeCache(next);
  }

  coverUrl(docKey: string | null | undefined): string {
    const normalizedDocKey = typeof docKey === 'string' ? docKey.trim() : '';
    if (!normalizedDocKey) {
      return '';
    }

    return this.readCache()[normalizedDocKey] ?? '';
  }

  forget(docKey: string | null | undefined): void {
    const normalizedDocKey = typeof docKey === 'string' ? docKey.trim() : '';
    if (!normalizedDocKey) {
      return;
    }

    const next = this.readCache();
    if (!(normalizedDocKey in next)) {
      return;
    }

    delete next[normalizedDocKey];
    this.writeCache(next);
  }

  private readCache(): Record<string, string> {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(DocumentCoverCacheService.storageKey);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === 'string' &&
            typeof entry[1] === 'string' &&
            entry[0].trim().length > 0 &&
            entry[1].trim().length > 0
        )
      );
    } catch {
      return {};
    }
  }

  private writeCache(cache: Record<string, string>): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DocumentCoverCacheService.storageKey, JSON.stringify(cache));
    } catch {
      // ignore storage failures
    }
  }
}
