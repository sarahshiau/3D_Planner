/**
 * Simulation API Service
 * 
 * Handles simulation execution API calls.
 * Transport layer only - does not build payloads.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BaseTaskPayload } from '../models/task-payload.model';

@Injectable({
  providedIn: 'root'
})
export class SimulationApiService {

  constructor(private http: HttpClient) { }

  /**
   * Post simulation request
   */
  postSimulation(payload: BaseTaskPayload): Observable<HttpResponse<string>> {
    const url = '/son/simulation';
    const body = JSON.stringify(payload);
    const headers = this.buildHeaders();

    console.log('[SIM_API_PHASE2][simulation][request]', {
      url,
      taskid: payload.task_meta.taskid,
      sessionid: payload.task_meta.sessionid,
      bodyIsString: typeof body === 'string'
    });

    return this.http.post(url, body, {
      headers: headers,
      observe: 'response',
      responseType: 'text'
    }).pipe(
      tap((resp: HttpResponse<string>) => {
        console.log('[SIM_API_PHASE2][simulation][response]', {
          status: resp.status,
          ok: resp.ok
        });
      })
    );
  }

  /**
   * Build HTTP headers for API requests
   */
  private buildHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'text/plain',
      'Accept': 'application/json, text/plain, */*'
    });
  }
}
