import { Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PipelineComponent } from '../pipeline';

@Component({
  selector: 'app-document-details',
  imports: [PipelineComponent],
  templateUrl: './document-details.html',
  styleUrl: './document-details.scss'
})
export class DocumentDetailsComponent {
  docKey = signal('');
  message = signal('');

  constructor(private readonly route: ActivatedRoute) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? 'Unknown Document');
      this.message.set('');
    });
  }
}
