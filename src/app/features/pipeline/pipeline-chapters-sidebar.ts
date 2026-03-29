import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RagLearningPipelineChapter } from '../../core/api/rag-api.service';

export type ChapterSection = 'summary' | 'takeaways' | 'quiz' | 'review';

export interface ChapterSectionSelection {
  chapter: RagLearningPipelineChapter;
  section: ChapterSection;
}

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
  @Output() sectionSelected = new EventEmitter<ChapterSectionSelection>();

  readonly sectionItems: { key: ChapterSection; label: string; icon: string }[] = [
    { key: 'summary', label: 'Summary', icon: '▣' },
    { key: 'takeaways', label: 'Key Takeaways', icon: '◈' },
    { key: 'quiz', label: 'Quiz', icon: '◌' },
    { key: 'review', label: 'Review', icon: '✦' }
  ];

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

  chapterStatus(index: number, chapter: RagLearningPipelineChapter): 'completed' | 'in-progress' | 'upcoming' {
    if (this.quizCompleted(chapter)) {
      return 'completed';
    }

    if (this.activeChapterIndex === index || this.isChapterAvailable(index)) {
      return 'in-progress';
    }

    return 'upcoming';
  }

  chapterStatusLabel(index: number, chapter: RagLearningPipelineChapter): string {
    switch (this.chapterStatus(index, chapter)) {
      case 'completed':
        return 'Completed';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'Upcoming';
    }
  }

  sectionAvailable(chapterIndex: number, chapter: RagLearningPipelineChapter, section: ChapterSection): boolean {
    if (!this.isChapterAvailable(chapterIndex)) {
      return false;
    }

    if (section === 'summary' || section === 'takeaways') {
      return true;
    }

    if (section === 'quiz') {
      return Array.isArray(chapter.quiz?.questions) && chapter.quiz.questions.length > 0;
    }

    return Array.isArray(chapter.reviewSlides) && chapter.reviewSlides.length > 0;
  }

  quizCompleted(chapter: RagLearningPipelineChapter): boolean {
    return chapter.quiz?.completed === true || chapter.reviewQuiz?.completed === true;
  }

  selectSection(index: number, chapter: RagLearningPipelineChapter, section: ChapterSection): void {
    if (!this.sectionAvailable(index, chapter, section)) {
      return;
    }

    this.sectionSelected.emit({ chapter, section });
  }

  private validNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
