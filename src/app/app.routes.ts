import { Routes } from '@angular/router';
import { DocumentDetailsComponent } from './features/document-details';
import { HomeComponent } from './home';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { SummaryDetailsComponent } from './features/summary-details';
import { TtsPlaybackComponent } from './features/tts-playback';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'import', component: ImportComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: 'documents/:docKey/summaries/:summaryId', component: SummaryDetailsComponent },
  { path: 'tts-playback', component: TtsPlaybackComponent }
];
