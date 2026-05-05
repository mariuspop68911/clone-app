import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { appEnvironment } from '../../core/config/app-environment';
import { AuthService } from '../../core/auth/auth.service';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: Record<string, string | number | boolean>
          ): void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent implements AfterViewInit, OnInit {
  @ViewChild('googleButtonHost') private readonly googleButtonHost?: ElementRef<HTMLDivElement>;
  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  readonly submitting = signal(false);
  readonly googleSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');
  readonly googleClientId = appEnvironment.googleClientId.trim();
  readonly googleEnabled = computed(() => this.googleClientId.length > 0);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    @Inject(PLATFORM_ID) private readonly platformId: object,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  ngAfterViewInit(): void {
    if (!this.googleEnabled() || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadGoogleIdentityScript();
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.infoMessage.set(
        params.get('reason') === 'session-expired'
          ? 'Your session expired. Please sign in again to continue.'
          : ''
      );
    });
  }

  submitPasswordLogin(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.infoMessage.set('');
    this.submitting.set(true);
    this.authService
      .login(this.form.getRawValue())
      .subscribe({
        next: () => this.navigateAfterLogin(),
        error: (error) => {
          this.submitting.set(false);
          this.errorMessage.set(this.readErrorMessage(error, 'Email or password is incorrect.'));
        }
      });
  }

  private loadGoogleIdentityScript(): void {
    if (window.google?.accounts?.id) {
      this.renderGoogleButton();
      return;
    }

    const existingScript = this.document.getElementById('google-identity-script') as
      | HTMLScriptElement
      | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => this.renderGoogleButton(), { once: true });
      return;
    }

    const script = this.document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => this.renderGoogleButton(), { once: true });
    this.document.head.appendChild(script);
  }

  private renderGoogleButton(): void {
    const host = this.googleButtonHost?.nativeElement;
    const googleAccounts = window.google?.accounts?.id;
    if (!host || !googleAccounts || !this.googleClientId) {
      return;
    }

    host.innerHTML = '';
    googleAccounts.initialize({
      client_id: this.googleClientId,
      callback: ({ credential }) => {
        if (!credential || this.googleSubmitting()) {
          return;
        }
        this.errorMessage.set('');
        this.infoMessage.set('');
        this.googleSubmitting.set(true);
        this.authService.loginWithGoogle({ idToken: credential }).subscribe({
          next: () => this.navigateAfterLogin(),
          error: (error) => {
            this.googleSubmitting.set(false);
            this.errorMessage.set(this.readErrorMessage(error, 'Google sign-in failed.'));
          }
        });
      }
    });
    googleAccounts.renderButton(host, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      type: 'standard',
      text: 'signin_with',
      width: 320
    });
  }

  private navigateAfterLogin(): void {
    this.submitting.set(false);
    this.googleSubmitting.set(false);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigateByUrl(returnUrl && returnUrl !== '/login' ? returnUrl : '/documents');
  }
  private readErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string' &&
      error.error.message.trim()
    ) {
      return error.error.message.trim();
    }
    return fallback;
  }
}
