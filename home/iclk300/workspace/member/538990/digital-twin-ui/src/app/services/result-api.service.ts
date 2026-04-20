/**
 * Result API Service
 * 
 * Handles result retrieval API calls.
 * Transport layer only - does not parse or adapt results.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ResultApiService {

  constructor(private http: HttpClient) { }

  /**
   * Get complete calculation result
   */
  getCompleteCalcResult(taskId: string, sessionId: string): Observable<any> {
    const url = this.buildCompleteCalcResultUrl(taskId, sessionId);

    console.log('[SIM_API_PHASE2][completeCalcResult][request]', {
      taskId,
      sessionId,
      url
    });

    return this.http.get<any>(url).pipe(
      tap((resp: any) => {
        console.log('[SIM_API_PHASE2][completeCalcResult][response]', {
          taskId,
          hasResult: !!resp
        });
      })
    );
  }

  /**
   * Build complete calc result URL
   */
  private buildCompleteCalcResultUrl(taskId: string, sessionId: string): string {
    return `/son/completeCalcResult/${taskId}/${sessionId}`;
  }
}
