import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideMarkdown } from 'ngx-markdown';
import { AuthService } from './core/auth/auth.service';
import { AuthStateService } from './core/auth/auth-state.service';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => {
      const authState = inject(AuthStateService);
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        authState.markResolved();
        return Promise.resolve();
      }
      return firstValueFrom(inject(AuthService).restoreSession())
        .catch(() => undefined)
        .then(() => {
          authState.markResolved();
        });
    }),
    provideMarkdown()
  ]
};
