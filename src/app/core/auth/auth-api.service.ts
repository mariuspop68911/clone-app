import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  private readonly baseUrl = '/api/auth';

  constructor(private readonly http: HttpClient) {}

  login(request: PasswordLoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, request, {
      withCredentials: true
    });
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/google`, request, {
      withCredentials: true
    });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true });
  }
}
