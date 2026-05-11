export type ApiCredentialsMode = 'include' | 'omit';

export interface AppEnvironment {
  production: boolean;
  apiBaseUrl: string;
  apiCredentialsMode: ApiCredentialsMode;
  googleClientId: string;
  auth: {
    expectedIssuer: string | null;
    expectedAudience: string | string[] | null;
  };
  polling: {
    jobStatusMs: number;
    ingestStatusMs: number;
  };
}
