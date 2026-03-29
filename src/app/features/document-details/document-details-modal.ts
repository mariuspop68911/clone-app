import { Component, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppShellUiService } from '../../app-shell-ui.service';
import { PipelineComponent } from '../pipeline';
import { PipelineChaptersSidebarComponent } from '../pipeline/pipeline-chapters-sidebar';

@Component({
  selector: 'app-document-details-modal',
  imports: [PipelineComponent, PipelineChaptersSidebarComponent],
  templateUrl: './document-details-modal.html',
  styleUrl: './document-details-modal.scss'
})
export class DocumentDetailsModalComponent {
  @ViewChild('pipelineRef') private pipelineRef?: PipelineComponent;
  private readonly appShellUi = inject(AppShellUiService);
  private readonly router = inject(Router);

  constructor() {
    this.appShellUi.setBrowseButtonVisible(false);
  }

  ngOnDestroy(): void {
    this.appShellUi.setBrowseButtonVisible(true);
  }

  closeModal(): void {
    void this.router.navigate(['/documents']);
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
