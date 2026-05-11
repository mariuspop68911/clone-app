import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'documents/:docKey/chat',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents2/:docKey',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
