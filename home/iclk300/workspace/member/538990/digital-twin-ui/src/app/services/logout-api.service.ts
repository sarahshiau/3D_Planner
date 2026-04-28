import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LogoutApiService {
  constructor(private http: HttpClient) {}

  /**
   * Stub logout:
   * - 先用假的 endpoint（之後再換成真正後端）
   * - 不處理 token、不清狀態，只「嘗試呼叫」並 log
   */
  logout(): Observable<any> {
    const url = '/api/auth/logout'; // 之後跟後端對齊
    const headers = new HttpHeaders({
      'X-Debug-Stub': 'logout'
    });

    return this.http.post(url, {}, { headers }).pipe(
      catchError((err) => {
        console.warn('[LogoutApi] logout request failed (stub) - ignored', err);
        // Stub：失敗也不影響 UI，所以吞掉錯誤回傳成功樣式
        return of({ ok: false, stub: true });
      })
    );
  }
}
