import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RagLearningPipelineChapter } from '../../core/api/rag-api.service';
import { marked } from 'marked';

@Component({
  selector: 'app-pipeline-chapters-sidebar',
  templateUrl: './pipeline-chapters-sidebar.html',
  styleUrl: './pipeline-chapters-sidebar.scss'
})
export class PipelineChaptersSidebarComponent {
  private readonly sanitizer = inject(DomSanitizer);
  @Input() chapters: RagLearningPipelineChapter[] = [];
  @Input() activeChapterIndex: number | null = null;
  @Input() availableChapterIndexes: number[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() chapterSelected = new EventEmitter<RagLearningPipelineChapter>();
  private readonly expandedTakeawayIndexes = new Set<number>();

  trackChapter(index: number, chapter: RagLearningPipelineChapter): number | string {
    return chapter.chapterIndex ?? chapter.title ?? index;
  }

  chapterLabel(index: number, chapter: RagLearningPipelineChapter): string {
    const rawTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';
    return rawTitle || `Chapter ${index + 1}`;
  }

  pageRange(chapter: RagLearningPipelineChapter): string {
    const start = this.validNumber(chapter.startPageNumber);
    const end = this.validNumber(chapter.endPageNumber);
    if (start === null || end === null) {
      return '';
    }
    return start === end ? `Page ${start}` : `Pages ${start}-${end}`;
  }

  keyTakeaways(chapter: RagLearningPipelineChapter): string[] {
    return Array.isArray(chapter.keyTakeaways)
      ? chapter.keyTakeaways.filter(
          (value, index, array): value is string =>
            typeof value === 'string' && value.trim().length > 0 && array.indexOf(value) === index
        )
      : [];
  }

  takeawayHtml(takeaway: string): SafeHtml {
    const parsed = marked.parseInline(this.escapeHtmlForMarkdown(takeaway));
    const html = typeof parsed === 'string' ? parsed : '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  isChapterAvailable(index: number): boolean {
    return this.availableChapterIndexes.includes(index);
  }

  isTakeawaysExpanded(index: number): boolean {
    return this.expandedTakeawayIndexes.has(index);
  }

  toggleTakeaways(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.expandedTakeawayIndexes.has(index)) {
      this.expandedTakeawayIndexes.delete(index);
      return;
    }

    this.expandedTakeawayIndexes.add(index);
  }

  selectChapter(index: number, chapter: RagLearningPipelineChapter): void {
    if (!this.isChapterAvailable(index)) {
      return;
    }
    this.chapterSelected.emit(chapter);
  }

  private validNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private escapeHtmlForMarkdown(summary: string): string {
    return summary.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
