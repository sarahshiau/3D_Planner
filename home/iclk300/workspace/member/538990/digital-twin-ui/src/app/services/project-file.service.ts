// src/app/services/project-file.service.ts
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

export interface SaveProjectPayload {
  projectName: string;
  layers: Array<{ name: string; file: string }>;
  savedAtISO: string; // debug 用：看得出每次儲存的時間
}

@Injectable({
  providedIn: 'root',
})
export class ProjectFileService {
  /**
   * 假 API：不打後端，只印出「像是有打出去」的紀錄，並模擬成功回傳
   */
  saveProject(payload: SaveProjectPayload): Observable<{ ok: boolean; requestId: string }> {
    // 模擬「打 API」的紀錄（你可以在 console 看到）
    console.log('[FAKE API] POST /api/projects/save');
    console.log('[FAKE API] payload =', payload);

    // 模擬回傳（延遲 300ms，讓你更像真實 request）
    const mockResponse = {
      ok: true,
      requestId: `REQ_${Date.now()}`,
    };

    return of(mockResponse).pipe(delay(300));
  }
}
