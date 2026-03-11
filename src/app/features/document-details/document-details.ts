import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-document-details',
  imports: [RouterLink],
  templateUrl: './document-details.html',
  styleUrl: './document-details.scss'
})
export class DocumentDetailsComponent {
  docKey = signal('');
  message = signal('');

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? 'Unknown Document');
      this.message.set('');
    });
  }

  viewComicSlides(): void {
    const key = this.docKey().trim();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }
    this.router.navigate(['/documents', key, 'comic-slides']);
  }

  pipeline(): void {
    const key = this.docKey();
    if (!key || key === 'Unknown Document') {
      this.message.set('Missing docKey.');
      return;
    }
    this.router.navigate(['/documents', key, 'pipeline']);
  }
}
