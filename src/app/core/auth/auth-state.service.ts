import { Injectable, computed, signal } from '@angular/core';

export interface AuthUserProfile {
  subject: string | null;
  email: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  roles: string[];
  isAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  // Keep the bearer token in memory only for the current app runtime.
  private readonly accessTokenState = signal<string | null>(null);
  private readonly resolvedState = signal(false);
  private readonly profileState = signal<AuthUserProfile | null>(null);

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.accessTokenState()));
  readonly isResolved = this.resolvedState.asReadonly();
  readonly isResolving = computed(() => !this.resolvedState());
  readonly profile = this.profileState.asReadonly();

  setAccessToken(accessToken: string): void {
    this.accessTokenState.set(accessToken);
    this.profileState.set(this.parseProfile(accessToken));
  }

  markResolved(): void {
    this.resolvedState.set(true);
  }

  clear(): void {
    this.accessTokenState.set(null);
    this.profileState.set(null);
  }

  private parseProfile(accessToken: string): AuthUserProfile | null {
    const payload = this.readJwtPayload(accessToken);
    if (!payload) {
      return null;
    }

    const email = this.readString(payload['email']);
    const givenName = this.readString(payload['given_name']);
    const familyName = this.readString(payload['family_name']);
    const name = this.readString(payload['name']);
    const subject = this.readString(payload['sub']);
    const roles = this.readRoles(payload);
    const isAdminClaim = this.readBoolean(payload['is_admin']) ?? this.readBoolean(payload['admin']) ?? false;
    const isAdmin = isAdminClaim || roles.some((role) => role.toLowerCase() === 'admin');
    const fullName = [givenName, familyName]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();
    const displayName =
      name ??
      (fullName || email || subject);

    return {
      subject,
      email,
      displayName: displayName || null,
      givenName,
      familyName,
      roles,
      isAdmin
    };
  }

  private readJwtPayload(accessToken: string): Record<string, unknown> | null {
    const parts = accessToken.split('.');
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    try {
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
      const decoded = atob(padded);
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private readRoles(payload: Record<string, unknown>): string[] {
    const roleClaims = [payload['roles'], payload['role']];
    for (const claim of roleClaims) {
      if (Array.isArray(claim)) {
        return claim
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim());
      }
      if (typeof claim === 'string' && claim.trim()) {
        return claim
          .split(/[,\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
    return [];
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private readBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return null;
  }
}
