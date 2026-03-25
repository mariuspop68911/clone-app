import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RagLearningPipelineChapter } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-pipeline-chapters-sidebar',
  templateUrl: './pipeline-chapters-sidebar.html',
  styleUrl: './pipeline-chapters-sidebar.scss'
})
export class PipelineChaptersSidebarComponent {
  @Input() chapters: RagLearningPipelineChapter[] = [];
  @Input() activeChapterIndex: number | null = null;
  @Input() availableChapterIndexes: number[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() chapterSelected = new EventEmitter<RagLearningPipelineChapter>();

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

  isChapterAvailable(index: number): boolean {
    return this.availableChapterIndexes.includes(index);
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
}
