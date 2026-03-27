import { CUSTOM_ELEMENTS_SCHEMA, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  RagApiService,
  RagLearningChapterQuiz,
  RagLearningChapterQuizQuestion,
  RagLearningPipelineChapter
} from '../../core/api/rag-api.service';
import { marked } from 'marked';

@Component({
  selector: 'app-pipeline-chapters-sidebar',
  templateUrl: './pipeline-chapters-sidebar.html',
  styleUrl: './pipeline-chapters-sidebar.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PipelineChaptersSidebarComponent {
  private readonly ragApi = inject(RagApiService);
  private readonly sanitizer = inject(DomSanitizer);
  @Input() docKey = '';
  @Input() chapters: RagLearningPipelineChapter[] = [];
  @Input() activeChapterIndex: number | null = null;
  @Input() availableChapterIndexes: number[] = [];
  @Input() quizGeneratingChapterIndexes: number[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() chapterSelected = new EventEmitter<RagLearningPipelineChapter>();
  @Output() chapterQuizCompleted = new EventEmitter<RagLearningPipelineChapter>();
  private readonly expandedTakeawayIndexes = new Set<number>();
  private readonly expandedQuizIndexes = new Set<number>();
  private readonly answeredQuestionIndexes = new Map<string, Map<number, number>>();

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

  quiz(chapter: RagLearningPipelineChapter): RagLearningChapterQuiz | null {
    return chapter.quiz && Array.isArray(chapter.quiz.questions) && chapter.quiz.questions.length
      ? chapter.quiz
      : null;
  }

  isQuizGenerating(index: number): boolean {
    return this.quizGeneratingChapterIndexes.includes(index);
  }

  isQuizExpanded(index: number): boolean {
    return this.expandedQuizIndexes.has(index);
  }

  toggleQuiz(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.expandedQuizIndexes.has(index)) {
      this.expandedQuizIndexes.delete(index);
      return;
    }

    this.expandedQuizIndexes.add(index);
  }

  quizQuestions(chapter: RagLearningPipelineChapter): RagLearningChapterQuizQuestion[] {
    return Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];
  }

  quizCompleted(chapter: RagLearningPipelineChapter): boolean {
    return chapter.quiz?.completed === true;
  }

  selectQuizAnswer(
    chapter: RagLearningPipelineChapter,
    questionIndex: number,
    optionIndex: number,
    event: Event
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const quiz = this.quiz(chapter);
    if (!quiz || this.quizCompleted(chapter)) {
      return;
    }

    if (this.isQuestionAnswered(chapter, questionIndex)) {
      return;
    }

    const chapterKey = this.chapterStorageKey(chapter);
    const answered = this.answeredQuestionIndexes.get(chapterKey) ?? new Map<number, number>();
    answered.set(questionIndex, optionIndex);
    this.answeredQuestionIndexes.set(chapterKey, answered);

    const chapterIndex = this.validNumber(chapter.chapterIndex);
    const docKey = this.docKey.trim() || quiz.docKey?.trim() || '';
    if (chapterIndex !== null && docKey) {
      this.ragApi.answerChapterQuiz({
        docKey,
        chapterIndex,
        questionIndex,
        selectedAnswerIndex: optionIndex
      }).subscribe({
        error: () => {
          // Keep the local answer state even if telemetry/save fails.
        }
      });
    }

    if (answered.size === this.quizQuestions(chapter).length) {
      this.chapterQuizCompleted.emit(chapter);
    }
  }

  selectedOptionIndex(chapter: RagLearningPipelineChapter, questionIndex: number): number | null {
    const chapterKey = this.chapterStorageKey(chapter);
    const localAnswer = this.answeredQuestionIndexes.get(chapterKey)?.get(questionIndex);
    if (typeof localAnswer === 'number') {
      return localAnswer;
    }

    const question = this.quizQuestions(chapter)[questionIndex];
    return typeof question?.selectedAnswerIndex === 'number' ? question.selectedAnswerIndex : null;
  }

  isQuestionAnswered(chapter: RagLearningPipelineChapter, questionIndex: number): boolean {
    return this.selectedOptionIndex(chapter, questionIndex) !== null;
  }

  isCorrectOption(
    chapter: RagLearningPipelineChapter,
    questionIndex: number,
    optionIndex: number
  ): boolean {
    const question = this.quizQuestions(chapter)[questionIndex];
    return question?.correctAnswerIndex === optionIndex;
  }

  showAnsweredOptionState(
    chapter: RagLearningPipelineChapter,
    questionIndex: number,
    optionIndex: number
  ): boolean {
    return this.selectedOptionIndex(chapter, questionIndex) === optionIndex;
  }

  questionAnsweredIncorrectly(chapter: RagLearningPipelineChapter, questionIndex: number): boolean {
    const selectedOptionIndex = this.selectedOptionIndex(chapter, questionIndex);
    return selectedOptionIndex !== null && !this.isCorrectOption(chapter, questionIndex, selectedOptionIndex);
  }

  shouldRevealCorrectOption(
    chapter: RagLearningPipelineChapter,
    questionIndex: number,
    optionIndex: number
  ): boolean {
    return this.questionAnsweredIncorrectly(chapter, questionIndex) &&
      this.isCorrectOption(chapter, questionIndex, optionIndex);
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

  private chapterStorageKey(chapter: RagLearningPipelineChapter): string {
    const chapterIndex = this.validNumber(chapter.chapterIndex);
    return chapterIndex !== null ? `chapter-${chapterIndex}` : `title-${chapter.title ?? ''}`;
  }

  private escapeHtmlForMarkdown(summary: string): string {
    return summary.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
