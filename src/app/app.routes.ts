import { Routes } from '@angular/router';
import { HomeComponent } from './home';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'import', component: ImportComponent },
  { path: 'documents', component: DocumentsComponent }
];
