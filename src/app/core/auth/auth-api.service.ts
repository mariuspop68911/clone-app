import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { buildApiUrl, includeApiCredentials } from '../config/app-environment';

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export interface PasswordLoginRequest {
  email: string;
  password: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly baseUrl = buildApiUrl('/auth');
  private readonly withCredentials = includeApiCredentials();

  constructor(private readonly http: HttpClient) {}

  login(request: PasswordLoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, request, {
      withCredentials: this.withCredentials
    });
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/google`, request, {
      withCredentials: this.withCredentials
    });
  }

  refresh(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/refresh`, {}, { withCredentials: this.withCredentials });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: this.withCredentials });
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout-all`, {}, { withCredentials: this.withCredentials });
  }
}
