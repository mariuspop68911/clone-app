import { Component, ViewChild, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppShellUiService } from '../../app-shell-ui.service';
import { PipelineComponent } from '../pipeline';
import { PipelineChaptersSidebarComponent } from '../pipeline/pipeline-chapters-sidebar';

@Component({
  selector: 'app-document-details-modal',
  imports: [RouterLink, PipelineComponent, PipelineChaptersSidebarComponent],
  templateUrl: './document-details-modal.html',
  styleUrl: './document-details-modal.scss'
})
export class DocumentDetailsModalComponent {
  @ViewChild('pipelineRef') private pipelineRef?: PipelineComponent;
  private readonly appShellUi = inject(AppShellUiService);

  constructor() {
    this.appShellUi.setBrowseButtonVisible(false);
  }

  ngOnDestroy(): void {
    this.appShellUi.setBrowseButtonVisible(true);
  }

  documentTitle(): string {
    return this.pipelineRef?.docKey().trim() ?? '';
  }

  chapterItems() {
    return this.pipelineRef?.chapterItems() ?? [];
  }

  activeChapterIndex(): number | null {
    return this.pipelineRef?.activeChapterIndex() ?? null;
  }

  availableChapterIndexes(): number[] {
    return this.pipelineRef?.availableChapterIndexes() ?? [];
  }

  learningContextLoading(): boolean {
    return this.pipelineRef?.learningContextLoading() ?? false;
  }

  learningContextError(): string {
    return this.pipelineRef?.learningContextError() ?? '';
  }

  goToChapterSection(event: Parameters<PipelineComponent['goToChapterSection']>[0]): void {
    this.pipelineRef?.goToChapterSection(event);
  }
}
