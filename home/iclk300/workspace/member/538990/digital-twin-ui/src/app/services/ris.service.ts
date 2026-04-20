import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, take, tap, throwError } from 'rxjs';
import {
  RisApi,
  RisRow,
  RisListRow,
  RisMaterialApi,
  RisProfileApi,
  RisProfileRow,
  RisProfileListRow,
  RisRawDataApi,
  AddRisPayload,
  UpdateRisPayload,
  AddRisProfilePayload,
  UpdateRisProfilePayload,
} from '../models/ris.model';
import { RisAddSubmitPayload } from '../components/modals/ris-add-modal/ris-add-modal.component';
import { MOCK_RIS_LIST, MOCK_RIS_MATERIALS, MOCK_RIS_PROFILES_BY_RISID, MOCK_RIS_RAWDATA_BY_KEY, makeRisKey } from '../mocks/ris.mock';
import { AuthService } from './auth.service'; // 請根據實際檔案路徑調整，通常在同個資料夾下
/**
 * [RIS][UPDATE] Backend response DTO for updateRis endpoint.
 */
type UpdateRisRespDto = { risID: number; statusCode: number; msg: string };

/**
 * [RIS][DELETE] Backend response DTO for deleteRis endpoint.
 */
type DeleteRisRespDto = { statusCode: number; msg: string };

export interface RisProfileDto {
  profileID: number;
  profileName: string;
  incHorizontal: number[];
  incVertical: number[];
  refHorizontal: number;
  refVertical: number;
  refCoefficient: number;
}

@Injectable({ providedIn: 'root' })
export class RisService {
  // Single source of truth for all in-memory mock databases
  private mockApiList: RisApi[] = structuredClone(MOCK_RIS_LIST);
  private mockMaterialList: RisMaterialApi[] = structuredClone(MOCK_RIS_MATERIALS);
  private profilesDb: Record<number, RisProfileApi[]> = structuredClone(MOCK_RIS_PROFILES_BY_RISID);
  private rawDataDb: Record<string, RisRawDataApi> = structuredClone(MOCK_RIS_RAWDATA_BY_KEY);

  private _rows$ = new BehaviorSubject<RisRow[]>([]);
  private _materials$ = new BehaviorSubject<RisMaterialApi[]>([]);
  public readonly materials$ = this._materials$.pipe(
    map((list) =>
      (list ?? [])
        .map((item) => (item?.risMaterialNameEng || item?.risMaterialNameCHI || '').trim())
        .filter((name) => !!name)
    )
  );

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {
    this.refreshSync();
    this._materials$.next(this.mockMaterialList);
  }

  // ===== [API-TPL v1.1][RIS][List] base + session helpers =====
  private readonly apiBase = ''; // dev walks proxy (/son -> target)

  private getSession(): string {
    // 1. 優先詢問 AuthService 拿你寫死的那個正確 ID
    const sessionFromAuth = this.authService.getSessionInfo();
    if (sessionFromAuth) {
      return sessionFromAuth;
    }

    // 2. 備援邏輯（如果上面沒拿到才看這裡）
    return (
      (window as any).__sonSession ||
      localStorage.getItem('son_session') ||
      ''
    );
  }

  /**
   * [PATCH][RIS][ADD][WORKAROUND_TEXT_PLAIN]
   * Safe JSON parse helper: returns parsed object or null if invalid.
   */
  private safeJsonParse<T>(text: string): T | null {
    try {
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Create composite key for profile raw data lookup.
   */
  private makeKey(risID: number, profileID: number): string {
    return `${risID}:${profileID}`;
  }

  /**
   * Normalize patternRaw to ensure consistency.
   * Ensures keys are sorted numerically and dimensions match rowElement/columnElement.
   */
  private normalizePatternRaw(api: RisRawDataApi): RisRawDataApi {
    const normalized: Record<string, number[]> = {};
    const keys = Object.keys(api.patternRaw)
      .map(k => parseInt(k, 10))
      .sort((a, b) => a - b);

    let actualRows = 0;
    for (const key of keys) {
      const row = api.patternRaw[String(key)] || [];
      normalized[String(actualRows)] = row;
      actualRows++;
    }

    const actualCols = actualRows > 0 ? (api.patternRaw[String(keys[0])]?.length || 0) : 0;

    return {
      ...api,
      rowElement: actualRows,
      columnElement: actualCols,
      patternRaw: normalized,
    };
  }

  /**
   * Get RIS rows filtered by preset (system or custom).
   * - 'system': property === 'default'
   * - 'custom': property === 'customized'
   * Returns list rows formatted for table display.
   */
  getRisRows(preset: 'system' | 'custom'): Observable<RisListRow[]> {
    return this._rows$.pipe(
      map(rows => {
        const filterProp = preset === 'system' ? 'default' : 'customized';
        return rows.filter(r => r.property === filterProp).map(r => this.toListRow(r));
      })
    );
  }

  /**
   * Load RIS list from backend and sync into rows$.
   * GET /son/getRis/{session}
   */
  loadRisListFromApi(sessionOverride?: string): Observable<RisApi[]> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      // 不做 UI，交給 UI 層顯示「載入失敗」
      return throwError(() => new Error('[RIS] missing session (son_session)'));
    }

    const url = `/son/getRis/${session}`;
    console.log('[RisService] GET', url, { session });

    return this.http.get<RisApi[]>(url).pipe(
      tap((list) => {
        // 覆蓋 in-memory list（沿用你既有 refreshSync -> rows$ pipeline）
        this.mockApiList = Array.isArray(list) ? list : [];
        this.refreshSync();
      }),
      catchError((err) => {
        // service 不做 UI：這裡回空陣列避免整條 observable chain 炸裂造成 UI 卡住
        // UI 層仍會依需求顯示「載入失敗」
        console.error('[RisService] loadRisListFromApi error', err);
        return of([] as RisApi[]);
      })
    );
  }

  // ① REMOVED: addRisToApi() - use add() instead as the single entry point

  // ② REMOVED: addRisProfileToApi() - use addRisProfile() instead as the single entry point

  /**
   * Get all RIS materials.
   */
  getRisMaterials(): Observable<RisMaterialApi[]> {
    return this._materials$.asObservable();
  }

  getMaterialsSnapshot(): string[] {
    return (this._materials$.value ?? [])
      .map((item) => (item?.risMaterialNameEng || item?.risMaterialNameCHI || '').trim())
      .filter((name) => !!name);
  }

  /**
   * Get RIS profiles for a specific RIS by risID.
   * Returns formatted list rows for table display.
   */
  getProfiles(risID: number): Observable<RisProfileListRow[]> {
    return new Observable(observer => {
      const profiles = this.profilesDb[risID] || [];
      const rows = profiles.map(p => this.mapProfileDtoToRow(p)).map(r => this.toProfileListRow(r));
      observer.next(rows);
      observer.complete();
    });
  }

  /**
   * Add a new RIS profile.
   * If payload.rawData is provided, use it; otherwise create default raw data.
   */
  addProfile(risID: number, payload: AddRisProfilePayload): Observable<void> {
    return new Observable(observer => {
      if (!this.profilesDb[risID]) {
        this.profilesDb[risID] = [];
      }

      const profiles = this.profilesDb[risID];
      const maxId = profiles.reduce((acc, p) => Math.max(acc, p.profileID), 0);
      const newId = maxId + 1;

      const newProfile: RisProfileApi = {
        profileID: newId,
        profileName: payload.profileName,
        incHorizontal: payload.incHorizontal,
        incVertical: payload.incVertical,
        refHorizontal: payload.refHorizontal,
        refVertical: payload.refVertical,
        refCoefficient: payload.refCoefficient,
      };

      profiles.push(newProfile);

      // Store raw data: use provided rawData if exists, otherwise create default
      const key = this.makeKey(risID, newId);
      if (payload.rawData) {
        // Use uploaded rawData directly (no normalization at storage time)
        this.rawDataDb[key] = payload.rawData;
      } else {
        // Fallback: create default raw data
        const ris = this.mockApiList.find(r => r.risID === risID);
        const rowCount = ris ? ris.elementNumber[1] : 10;
        const colCount = ris ? ris.elementNumber[0] : 15;

        const defaultRawData: RisRawDataApi = {
          rowElement: rowCount,
          columnElement: colCount,
          patternRaw: this.buildDefaultPatternRaw(rowCount, colCount),
          radiationRaw: this.buildDefaultRadiationRaw(360),
        };

        this.rawDataDb[key] = defaultRawData;
      }

      observer.next(undefined);
      observer.complete();
    });
  }

  /**
   * Update an existing RIS profile.
   * If payload.rawData is provided, update rawDataDb; otherwise leave rawData unchanged.
   */
  updateProfile(risID: number, payload: UpdateRisProfilePayload): Observable<void> {
    return new Observable(observer => {
      const profiles = this.profilesDb[risID];
      if (!profiles) {
        observer.next(undefined);
        observer.complete();
        return;
      }

      const idx = profiles.findIndex(p => p.profileID === payload.profileID);
      if (idx >= 0) {
        profiles[idx] = {
          profileID: payload.profileID,
          profileName: payload.profileName,
          incHorizontal: payload.incHorizontal,
          incVertical: payload.incVertical,
          refHorizontal: payload.refHorizontal,
          refVertical: payload.refVertical,
          refCoefficient: payload.refCoefficient,
        };

        // Update rawData only if provided (non-null)
        if (payload.rawData) {
          const key = this.makeKey(risID, payload.profileID);
          this.rawDataDb[key] = payload.rawData;
        }
      }

      observer.next(undefined);
      observer.complete();
    });
  }

  /**
   * Delete a RIS profile.
   * Also deletes associated raw data from rawDataDb.
   */
  deleteProfile(risID: number, profileID: number): Observable<void> {
    return new Observable(observer => {
      const profiles = this.profilesDb[risID];
      if (profiles) {
        this.profilesDb[risID] = profiles.filter(p => p.profileID !== profileID);
      }

      // Delete associated raw data
      const key = this.makeKey(risID, profileID);
      delete this.rawDataDb[key];

      observer.next(undefined);
      observer.complete();
    });
  }

  /**
   * Get RIS profile raw data (pattern + radiation).
   */
  getProfileRawData(risID: number, profileID: number): Observable<RisRawDataApi> {
    return new Observable(observer => {
      const key = this.makeKey(risID, profileID);
      const rawData = this.rawDataDb[key];

      if (rawData) {
        // Normalize pattern before returning
        const normalized = this.normalizePatternRaw(rawData);
        observer.next(normalized);
      } else {
        // Return empty/default raw data if key not found
        observer.next({
          rowElement: 0,
          columnElement: 0,
          patternRaw: {},
          radiationRaw: [],
        });
      }

      observer.complete();
    });
  }

  /**
   * Refresh rows from mockApiList.
   */
  refresh(): Observable<void> {
    return new Observable(observer => {
      this.refreshSync();
      observer.next(undefined);
      observer.complete();
    });
  }

  /**
   * Add a new RIS (customized) via backend API.
   * POST /son/addRis/{session}
   *
   * [PATCH][RIS][ADD][WORKAROUND_TEXT_PLAIN]
   * ✅ CRITICAL: This is the ONLY entry point for adding RIS.
   * Workaround: Some legacy backends incorrectly do JSON.parse(req.body) even when req.body is already an object.
   * To avoid "Unexpected token o in JSON at position 1", we MUST:
   * 1) Send Content-Type: text/plain; charset=utf-8
   * 2) Send body as JSON.stringify(payload) - a STRING, not object
   * 3) Use responseType: 'text' and parse safely to extract risID
   */
  add(payload: AddRisPayload, sessionOverride?: string): Observable<{ risID: number }> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS] missing session (son_session)'));
    }

    const url = `/son/addRis/${session}`;

    // ===== [PATCH][RIS][ADD][HEADER_MATCH_LEGACY] =====
    // Keep Content-Type EXACTLY as legacy: "text/plain"
    // Some legacy servers branch parser logic by strict string match.
    const headers = new HttpHeaders({
      'Content-Type': 'text/plain',
      'Accept': 'application/json, text/plain, */*',
    });

    // ✅ MUST: body must be a STRING
    const bodyText = JSON.stringify(payload);

    console.log('[DBG][RIS][add] bodyText=', bodyText);
    console.log('[RisService] POST(addRis) -> text/plain workaround', url, {
      contentType: headers.get('Content-Type'),
      bodyPreview: bodyText.slice(0, 120),
    });

    return this.http
      .post(url, bodyText, {
        headers,
        observe: 'response',
        responseType: 'text',
      })
      .pipe(
        map((res: HttpResponse<string>) => {
          const raw = (res.body ?? '').trim();

          // 後端有可能回空字串（500 時常見），這裡要給清楚錯誤
          if (!raw) {
            throw new Error('[RIS] addRis empty response body (backend likely crashed)');
          }

          // 後端正常回： {"risID":24,"statusCode":200,"msg":"..."}
          const parsed = this.safeJsonParse<any>(raw);
          const risID = Number(parsed?.risID);

          if (!Number.isFinite(risID) || risID <= 0) {
            throw new Error(`[RIS] addRis invalid response. raw=${raw}`);
          }

          return { risID };
        }),
        catchError((err) => {
          console.error('[RisService] addRis error', err);
          return throwError(() => err);
        })
      );
  }

  /**
   * [PATCH][RIS][PROFILE_ADD][FORMDATA]
   * Add RIS profile via backend API.
   * POST /son/addRisProfile/{risID}/{session}
   * Sends FormData with incHorizontal/incVertical as JSON.stringify strings.
   */
  addRisProfile(
    risID: number,
    payload: {
      profileName: string;
      incHorizontal: [number, number];
      incVertical: [number, number];
      refHorizontal: number;
      refVertical: number;
      refCoefficient: number;
      file: File;
      sha256sum: string;
    },
    sessionOverride?: string
  ): Observable<any> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS] missing session (son_session)'));
    }

    const url = `/son/addRisProfile/${risID}/${session}`;

    const fd = new FormData();
    fd.append('profileName', payload.profileName);
    fd.append('incHorizontal', JSON.stringify(payload.incHorizontal));
    fd.append('incVertical', JSON.stringify(payload.incVertical));
    fd.append('refHorizontal', String(payload.refHorizontal));
    fd.append('refVertical', String(payload.refVertical));
    fd.append('refCoefficient', String(payload.refCoefficient));
    fd.append('sha256sum', payload.sha256sum);
    fd.append('file', payload.file);

    console.log('[RisService] POST', url, { risID, profileName: payload.profileName });

    return this.http.post(url, fd).pipe(
      catchError((err) => {
        console.error('[RisService] addRisProfile error', err);
        return throwError(() => err);
      })
    );
  }

  getRisProfilesOnApi(risID: number, sessionOverride?: string): Observable<RisProfileDto[]> {
    const session = sessionOverride || this.getSession();
    if (!session) return throwError(() => new Error('[RIS][profiles] missing session'));

    const id = Number(risID);
    if (!Number.isFinite(id) || id <= 0) {
      return throwError(() => new Error('[RIS][profiles] invalid risID'));
    }

    const url = `${this.apiBase}/son/getRisProfiles/${id}/${session}`;

    return this.http.get<RisProfileDto[]>(url).pipe(
      map((res) => Array.isArray(res) ? res : [])
    );
  }

  getRisRawDataOnApi(risID: number, profileID: number, sessionOverride?: string): Observable<RisRawDataApi> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS][rawData] missing session'));
    }

    const rid = Number(risID);
    const pid = Number(profileID);
    if (!Number.isFinite(rid) || rid <= 0) {
      return throwError(() => new Error('[RIS][rawData] invalid risID'));
    }
    if (!Number.isFinite(pid) || pid <= 0) {
      return throwError(() => new Error('[RIS][rawData] invalid profileID'));
    }

    const url = `${this.apiBase}/son/getRisRawData/${rid}/${pid}/${session}`;
    console.log('[RisService] GET', url, { risID: rid, profileID: pid });

    return this.http.get<RisRawDataApi>(url).pipe(
      map((raw) => this.normalizePatternRaw(raw)),
      catchError((err) => {
        console.error('[RisService] getRisRawDataOnApi error', err);
        return throwError(() => err);
      })
    );
  }

  updateRisProfileOnApi(
    risID: number,
    payload: {
      profileID: number;
      profileName: string;
      incHorizontal: [number, number];
      incVertical: [number, number];
      refHorizontal: number;
      refVertical: number;
      refCoefficient: number;
      file?: File | null;
      sha256sum?: string | null;
    },
    sessionOverride?: string
  ): Observable<any> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS][profileUpdate] missing session'));
    }

    const rid = Number(risID);
    if (!Number.isFinite(rid) || rid <= 0) {
      return throwError(() => new Error('[RIS][profileUpdate] invalid risID'));
    }

    const pid = Number(payload?.profileID);
    if (!Number.isFinite(pid) || pid <= 0) {
      return throwError(() => new Error('[RIS][profileUpdate] invalid profileID'));
    }

    const url = `${this.apiBase}/son/updateRisProfile/${rid}/${session}`;
    const fd = new FormData();
    fd.append('profileID', String(pid));
    fd.append('profileName', String(payload?.profileName ?? ''));
    fd.append('incHorizontal', JSON.stringify(payload?.incHorizontal ?? [0, 0]));
    fd.append('incVertical', JSON.stringify(payload?.incVertical ?? [0, 0]));
    fd.append('refHorizontal', String(payload?.refHorizontal ?? 0));
    fd.append('refVertical', String(payload?.refVertical ?? 0));
    fd.append('refCoefficient', String(payload?.refCoefficient ?? 0));

    // ===== [RIS][profileUpdate][FORMDATA_REQUIRED_KEYS] =====
    // Backend requires sha256sum param ALWAYS exists (even when no file uploaded)
    const sha = (payload?.sha256sum ?? 'undefined');
    fd.append('sha256sum', String(sha));

    // file is optional (backend currently does not require it)
    if (payload?.file) {
      fd.append('file', payload.file);
    }

    console.log('[RisService] POST', url, {
      risID: rid,
      profileID: pid,
      profileName: payload?.profileName,
      hasFile: !!payload?.file,
      hasSha256Key: true,
      sha256Value: sha,
    });

    return this.http.post(url, fd).pipe(
      catchError((err) => {
        console.error('[RisService] updateRisProfileOnApi error', err);
        return throwError(() => err);
      })
    );
  }

  deleteRisProfileOnApi(risID: number, profileID: number, sessionOverride?: string): Observable<void> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS][profileDelete] missing session'));
    }

    const rid = Number(risID);
    const pid = Number(profileID);
    if (!Number.isFinite(rid) || rid <= 0) {
      return throwError(() => new Error('[RIS][profileDelete] invalid risID'));
    }
    if (!Number.isFinite(pid) || pid <= 0) {
      return throwError(() => new Error('[RIS][profileDelete] invalid profileID'));
    }

    const url = `${this.apiBase}/son/deleteRisProfile/${rid}/${pid}/${session}`;
    console.log('[RisService] DELETE', url, { risID: rid, profileID: pid });

    return this.http
      .delete(url, { observe: 'response', responseType: 'text' })
      .pipe(
        map((res: HttpResponse<string>) => {
          const text = res.body ?? '';
          const data = this.safeJsonParse<{ statusCode?: number; msg?: string }>(text);

          if (!data) return;

          const statusCode = Number(data?.statusCode);
          if (Number.isFinite(statusCode) && statusCode !== 200) {
            throw new Error(`[RIS][profileDelete] backend statusCode=${statusCode}`);
          }
        })
      );
  }

  /**
   * [PATCH][RIS][UPDATE][TEXT_PLAIN]
   * Update RIS on backend via API.
   * POST /son/updateRis/{session}
   * Legacy backend expects text/plain with STRING body (JSON.stringify).
   */
  updateRisOnApi(payload: UpdateRisPayload, sessionOverride?: string): Observable<number> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS][update] missing session (son_session)'));
    }

    const url = `/son/updateRis/${session}`;

    // Keep Content-Type EXACTLY as legacy.
    const headers = new HttpHeaders({
      'Content-Type': 'text/plain',
      'Accept': 'application/json, text/plain, */*',
    });

    const bodyText = JSON.stringify(payload);

    console.log('[RisService] POST(updateRis) -> text/plain workaround', url, {
      contentType: headers.get('Content-Type'),
      bodyPreview: bodyText.slice(0, 120),
    });

    return this.http
      .post(url, bodyText, { headers, observe: 'response', responseType: 'text' })
      .pipe(
        map((res: HttpResponse<string>) => {
          const text = res.body ?? '';
          const data = this.safeJsonParse<UpdateRisRespDto>(text);

          if (!data) {
            throw new Error('[RIS][update] empty/invalid response body');
          }
          const risID = Number((data as any).risID);
          if (!Number.isFinite(risID) || risID <= 0) {
            throw new Error('[RIS][update] invalid risID in response');
          }
          return risID;
        }),
        catchError((err) => {
          console.error('[RisService] updateRisOnApi error', err);
          return throwError(() => err);
        })
      );
  }

  /**
   * Delete RIS on backend.
   * DELETE /son/deleteRis/{risID}/{session}
   */
  deleteRisOnApi(risID: number, sessionOverride?: string): Observable<void> {
    const session = sessionOverride || this.getSession();
    if (!session) {
      return throwError(() => new Error('[RIS][delete] missing session (son_session)'));
    }

    const id = Number(risID);
    if (!Number.isFinite(id) || id <= 0) {
      return throwError(() => new Error('[RIS][delete] invalid risID'));
    }

    const url = `${this.apiBase}/son/deleteRis/${id}/${session}`;

    // Many legacy endpoints still return JSON, but we parse safely via text.
    const headers = new HttpHeaders({
      'Accept': 'application/json, text/plain, */*',
    });

    return this.http
      .delete(url, { headers, observe: 'response', responseType: 'text' })
      .pipe(
        map((res: HttpResponse<string>) => {
          const text = res.body ?? '';
          const data = this.safeJsonParse<DeleteRisRespDto>(text);

          // Some servers may return empty body on success; treat 2xx as success.
          if (!data) return;

          const statusCode = Number((data as any).statusCode);
          if (Number.isFinite(statusCode) && statusCode !== 200) {
            throw new Error(`[RIS][delete] backend statusCode=${statusCode}`);
          }
        })
      );
  }

  /**
   * Update an existing RIS.
   */
  update(payload: UpdateRisPayload): Observable<void> {
    return this._rows$.pipe(
      take(1),
      map(() => {
        const idx = this.mockApiList.findIndex(item => item.risID === payload.risID);
        if (idx >= 0) {
          this.mockApiList[idx] = payload;
        }
        return undefined;
      }),
      tap(() => this.refreshSync())
    );
  }

  /**
   * Delete a RIS by risID (only customized).
   */
  delete(risID: number): Observable<void> {
    return this._rows$.pipe(
      take(1),
      map(() => {
        this.mockApiList = this.mockApiList.filter(item => item.risID !== risID);
        return undefined;
      }),
      tap(() => this.refreshSync())
    );
  }

  /**
   * Sync refresh: convert API list to rows and emit.
   */
  private refreshSync(): void {
    const rows = this.mockApiList.map(api => this.mapDtoToRow(api));
    this._rows$.next(rows);
  }

  /**
   * Map RisApi DTO to RisRow for UI rendering.
   * Handles normalization of type (case-insensitive), frequency tuples, and elementNumber/elementSize tuples.
   * Defensive: handles missing/undefined array fields gracefully.
   */
  private mapDtoToRow(api: RisApi): RisRow {
    // Normalize type to title case (Passive, Active)
    const normalizedType = api.type
      ? api.type.charAt(0).toUpperCase() + api.type.slice(1).toLowerCase()
      : 'Unknown';

    // Defensive guards for array accesses
    const frequency = Array.isArray(api.frequency) ? api.frequency : [0, 0];
    const elementNumber = Array.isArray(api.elementNumber) ? api.elementNumber : [0, 0];
    const elementSize = Array.isArray(api.elementSize) ? api.elementSize : [0, 0];

    return {
      id: api.risID ?? 0,
      name: api.risName || '',
      type: normalizedType,
      frequencyMin: frequency[0] ?? 0,
      frequencyMax: frequency[1] ?? 0,
      material: api.material || '',
      manufacturer: api.manufacturer || '',
      elementCols: elementNumber[0] ?? 0,
      elementRows: elementNumber[1] ?? 0,
      elementWidth: elementSize[0] ?? 0,
      elementHeight: elementSize[1] ?? 0,
      property: api.property || 'customized',
      risEnergy: api.risEnergy ?? 0,
      risCost: api.risCost ?? 0,
    };
  }

  /**
   * Convert RisRow to RisListRow for table display.
   * Formats fields: frequency range, element count, element size, etc.
   * Defensive: handles zero/undefined values gracefully.
   */
  private toListRow(row: RisRow): RisListRow {
    const elementCount = (row.elementRows ?? 0) * (row.elementCols ?? 0);
    const freqMin = row.frequencyMin ?? 0;
    const freqMax = row.frequencyMax ?? 0;
    const freqMHz = freqMin === 0 && freqMax === 0 ? '' : `${freqMin} ~ ${freqMax}`;
    
    const elWidth = row.elementWidth ?? 0;
    const elHeight = row.elementHeight ?? 0;
    const elementSizeMm = elWidth === 0 && elHeight === 0 ? '' : `${elWidth} x ${elHeight}`;

    return {
      id: row.id ?? 0,
      name: row.name || '',
      type: row.type || '',
      freqMHz,
      vendor: row.manufacturer || '',
      material: row.material || '',
      elementCount,
      elementSizeMm,
      avgPower: row.risEnergy ?? 0,
      price: row.risCost ?? 0,
      property: row.property || 'customized',
    };
  }

  /**
   * Convert RisProfileRow to RisProfileListRow for profile table display.
   * Formats fields for template binding.
   */
  private toProfileListRow(row: RisProfileRow): RisProfileListRow {
    const incAzRange = `${row.incHorizontalMin ?? 0} ~ ${row.incHorizontalMax ?? 0}`;
    const incElRange = `${row.incVerticalMin ?? 0} ~ ${row.incVerticalMax ?? 0}`;

    return {
      profileID: row.profileID ?? 0,
      name: row.profileName || '',
      incAzRange,
      incElRange,
      refAz: row.refHorizontal ?? 0,
      refEl: row.refVertical ?? 0,
      reflGainDb: row.refCoefficient ?? 0,
    };
  }

  private mapProfileDtoToListRow(dto: RisProfileDto): RisProfileListRow {
    const incHorizontal = Array.isArray(dto?.incHorizontal) ? dto.incHorizontal : [0, 0];
    const incVertical = Array.isArray(dto?.incVertical) ? dto.incVertical : [0, 0];

    return {
      profileID: Number(dto?.profileID ?? 0),
      name: String(dto?.profileName ?? ''),
      incAzRange: `${incHorizontal[0] ?? 0} ~ ${incHorizontal[1] ?? 0}`,
      incElRange: `${incVertical[0] ?? 0} ~ ${incVertical[1] ?? 0}`,
      refAz: Number(dto?.refHorizontal ?? 0),
      refEl: Number(dto?.refVertical ?? 0),
      reflGainDb: Number(dto?.refCoefficient ?? 0),
    };
  }

  /**
   * Build default pattern raw data (all zeros).
   */
  private buildDefaultPatternRaw(rows: number, cols: number): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(0); // Default all zeros
      }
      out[String(r)] = row;
    }
    return out;
  }

  /**
   * Build default radiation raw data (all zeros).
   */
  private buildDefaultRadiationRaw(n: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      out.push([i, 0, 0]); // [angleIndex, v1, v2] all zeros
    }
    return out;
  }

  /**
   * Map RisProfileApi DTO to RisProfileRow for UI rendering.
   */
  private mapProfileDtoToRow(api: RisProfileApi): RisProfileRow {
    return {
      profileID: api.profileID,
      profileName: api.profileName,
      incHorizontalMin: api.incHorizontal[0],
      incHorizontalMax: api.incHorizontal[1],
      incVerticalMin: api.incVertical[0],
      incVerticalMax: api.incVertical[1],
      refHorizontal: api.refHorizontal,
      refVertical: api.refVertical,
      refCoefficient: api.refCoefficient,
    };
  }
}
