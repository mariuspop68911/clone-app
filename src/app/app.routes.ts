import { Routes } from '@angular/router';
import { HomeComponent } from './home';
import { ImportComponent } from './features/import';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'import', component: ImportComponent }
];
