import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom, from, map } from 'rxjs';
import { AuthService } from './auth.service';

export type PathlossProperty = 'default' | 'customized';

export interface PathlossApiDto {
  id: number;
  name: string;
  chineseName: string;
  distancePowerLoss: number;
  fieldLoss: number;
  property: PathlossProperty;
}

export interface PathlossUpsertDraft {
  id?: number;
  name: string;
  chineseName: string;
  distancePowerLoss: number;
  fieldLoss: number;
  property?: PathlossProperty;
}

type PathlossUpsertLike = Omit<PathlossUpsertDraft, 'property'> & {
  property?: string;
};

export interface PathlossDeleteDraft {
  id: number;
  name: string;
}

export interface PathlossRow {
  id: number;
  name: string;
  chineseName: string;
  distancePowerLoss: number;
  fieldLoss: number;
  property: PathlossProperty;
  formula: string;
  __uiKey: string;
  __uiStatus: 'idle' | 'uploading' | 'error';
}

@Injectable({ providedIn: 'root' })
export class PathLossModelService {
  private readonly baseUrl = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private getSession(): string {
    return this.auth.getSessionInfo();
  }

  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    if (Array.isArray(res?.rows)) return res.rows;
    return [];
  }

  private normalizeAnyToDto(raw: any): PathlossApiDto {
    if (!raw) {
      return this.normalizeDto({});
    }

    const propertyRaw = String(
      raw.property ?? raw.Property ?? raw.modelProperty ?? 'customized'
    ).toLowerCase();

    const property: PathlossProperty = propertyRaw === 'default' ? 'default' : 'customized';

    const candidate = {
      id: raw.id ?? raw.ID ?? raw.pathlossID ?? raw.pathLossModelID ?? raw.pathLossModelId,
      name: raw.name ?? raw.Name ?? raw.modelName,
      chineseName: raw.chineseName ?? raw.ChineseName ?? raw.chinesename ?? raw.zhName,
      distancePowerLoss:
        raw.distancePowerLoss ??
        raw.DistancePowerLoss ??
        raw.distance_power_loss ??
        raw.pathLossExponent,
      fieldLoss: raw.fieldLoss ?? raw.FieldLoss ?? raw.field_loss ?? raw.shadowLoss,
      property,
    };

    return this.normalizeDto(candidate);
  }

  private normalizeDto(dto: Partial<PathlossApiDto>): PathlossApiDto {
    const propertyRaw = String(dto.property ?? 'customized').toLowerCase();
    const property: PathlossProperty = propertyRaw === 'default' ? 'default' : 'customized';

    const id = Number(dto.id ?? 0);
    const distancePowerLoss = Number(dto.distancePowerLoss ?? 0);
    const fieldLoss = Number(dto.fieldLoss ?? 0);

    return {
      id: Number.isFinite(id) ? id : 0,
      name: String(dto.name ?? '-'),
      chineseName: String(dto.chineseName ?? '-'),
      distancePowerLoss: Number.isFinite(distancePowerLoss) ? distancePowerLoss : 0,
      fieldLoss: Number.isFinite(fieldLoss) ? fieldLoss : 0,
      property,
    };
  }

  mapDtoToRow(dto: PathlossApiDto): PathlossRow {
    return {
      id: dto.id,
      name: dto.name,
      chineseName: dto.chineseName,
      distancePowerLoss: dto.distancePowerLoss,
      fieldLoss: dto.fieldLoss,
      property: dto.property,
      formula: `Ltotal = 20 log10 f + ${dto.distancePowerLoss} log10 d + ${dto.fieldLoss} - 28`,
      __uiKey: `pathloss_${dto.id}`,
      __uiStatus: 'idle',
    };
  }

  private safeParseJsonText(text: unknown): any | null {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    // Only try to parse if it looks like JSON (starts with { or [)
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private buildTextPlainJsonHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'text/plain; charset=utf-8' });
  }

  private buildError(action: string, err: any): Error {
    const status = err?.status != null ? ` status=${err.status}` : '';
    const message = err?.error?.msg ?? err?.message ?? 'Unknown error';
    const rawError = err?.error;
    const detail =
      typeof rawError === 'string'
        ? rawError
        : rawError && typeof rawError === 'object'
          ? JSON.stringify(rawError)
          : '';
    const detailText = detail ? ` detail=${detail}` : '';
    return new Error(`[PathlossModelService] ${action} failed.${status} msg=${message}${detailText}`);
  }

  formatError(err: any): string {
    if (typeof err === 'string') return err;
    const hasHttpErrorPayload = !!(err as any)?.error;
    if (err instanceof Error && !hasHttpErrorPayload) return err.message;
    return this.buildError('request', err).message;
  }

  async getList(sessionOverride?: string): Promise<PathlossApiDto[]> {
    const session = encodeURIComponent(sessionOverride ?? this.getSession());
    const url = `${this.baseUrl}/son/getPathLossModel/${session}`;

    try {
      const res = await firstValueFrom(this.http.get<any>(url));
      const list = this.extractArray(res);
      return list
        .map(raw => this.normalizeAnyToDto(raw))
        .map(dto => this.normalizeDto(dto));
    } catch (err) {
      throw this.buildError('getPathLossModel', err);
    }
  }

  async getPathLossModelList(sessionOverride?: string): Promise<PathlossRow[]> {
    const list = await this.getList(sessionOverride);
    return list.map(dto => this.mapDtoToRow(dto));
  }

  async addPathLossModel(
    draft: PathlossUpsertDraft,
    sessionOverride?: string
  ): Promise<{ insertId: number; msg: string }> {
    const session = encodeURIComponent(sessionOverride ?? this.getSession());
    const url = `${this.baseUrl}/son/addPathLossModel/${session}`;
    const normalized = this.normalizeDto({ ...draft, property: draft.property ?? 'customized' });

    const payload = {
      name: normalized.name,
      chineseName: normalized.chineseName,
      distancePowerLoss: normalized.distancePowerLoss,
      fieldLoss: normalized.fieldLoss,
      property: normalized.property,
    };
    const body = JSON.stringify(payload);
    const headers = new HttpHeaders({ 'Content-Type': 'text/plain; charset=utf-8' });

    try {
      const res = await firstValueFrom(
        this.http.post(url, body, { headers, responseType: 'text' as const }) as any
      );
      // Try to parse as JSON, fallback to plain text
      const parsed = this.safeParseJsonText(res);
      return {
        insertId: parsed?.insertId ?? 0,
        msg: parsed?.msg ?? String(res ?? 'OK'),
      };
    } catch (err) {
      throw this.buildError('addPathLossModel', err);
    }
  }

  async updatePathLossModel(
    draft: PathlossUpsertDraft,
    sessionOverride?: string
  ): Promise<{ msg: string }> {
    const session = encodeURIComponent(sessionOverride ?? this.getSession());
    const url = `${this.baseUrl}/son/updatePathLossModel/${session}`;
    const normalized = this.normalizeDto({ ...draft, property: draft.property ?? 'customized' });

    const payload = {
      id: Number(draft.id ?? 0),
      name: normalized.name,
      chineseName: normalized.chineseName,
      distancePowerLoss: normalized.distancePowerLoss,
      fieldLoss: normalized.fieldLoss,
      property: normalized.property,
    };
    const body = JSON.stringify(payload);
    const headers = new HttpHeaders({ 'Content-Type': 'text/plain; charset=utf-8' });

    try {
      const res = await firstValueFrom(
        this.http.post(url, body, { headers, responseType: 'text' as const }) as any
      );
      // Try to parse as JSON, fallback to plain text
      const parsed = this.safeParseJsonText(res);
      return {
        msg: parsed?.msg ?? String(res ?? 'OK'),
      };
    } catch (err) {
      throw this.buildError('updatePathLossModel', err);
    }
  }

  async deletePathLossModel(
    draft: PathlossDeleteDraft,
    sessionOverride?: string
  ): Promise<{ msg: string }> {
    const session = encodeURIComponent(sessionOverride ?? this.getSession());
    const url = `${this.baseUrl}/son/deletePathLossModel/${session}`;

    const payload = {
      id: Number(draft.id ?? 0),
      name: String(draft.name ?? ''),
    };
    const body = JSON.stringify(payload);
    const headers = new HttpHeaders({ 'Content-Type': 'text/plain; charset=utf-8' });

    try {
      const res = await firstValueFrom(
        this.http.post(url, body, { headers, responseType: 'text' as const }) as any
      );
      // Try to parse as JSON, fallback to plain text
      const parsed = this.safeParseJsonText(res);
      return {
        msg: parsed?.msg ?? String(res ?? 'OK'),
      };
    } catch (err) {
      throw this.buildError('deletePathLossModel', err);
    }
  }

  getPathLossModels(): Observable<PathlossRow[]> {
    return from(this.getPathLossModelList());
  }

  add(payload: PathlossUpsertLike): Observable<void> {
    return from(this.addPathLossModel(payload as PathlossUpsertDraft)).pipe(map(() => undefined));
  }

  update(payload: PathlossUpsertLike): Observable<void> {
    return from(this.updatePathLossModel(payload as PathlossUpsertDraft)).pipe(map(() => undefined));
  }

  delete(id: number, name = ''): Observable<void> {
    return from(this.deletePathLossModel({ id, name })).pipe(map(() => undefined));
  }

  async calculateFromFile(
    session: string,
    args: { file: File; name: string; sha256sum: string; property: 'customized' }
  ): Promise<{ id: number; msg: string }> {
    const sessionEncoded = encodeURIComponent(session || this.getSession());
    const url = `${this.baseUrl}/son/calculatePathLossModel/${sessionEncoded}`;

    const formData = new FormData();
    formData.append('file', args.file);
    formData.append('name', args.name);
    formData.append('sha256sum', args.sha256sum);
    formData.append('property', args.property);

    try {
      const res = await firstValueFrom(this.http.post<any>(url, formData));
      return {
        id: Number(res?.id ?? 0),
        msg: String(res?.msg ?? ''),
      };
    } catch (err) {
      throw this.buildError('calculatePathLossModel', err);
    }
  }

  async pollPathlossModel(session: string, ids: number[]): Promise<any[]> {
    const sessionEncoded = encodeURIComponent(session || this.getSession());
    const url = `${this.baseUrl}/son/pollingPathLossModel/${sessionEncoded}`;

    const idsArray = ids.map(id => ({ id }));
    const bodyText = JSON.stringify(idsArray);
    const headers = this.buildTextPlainJsonHeaders();

    try {
      const res = await firstValueFrom(
        this.http.post(url, bodyText, { headers, responseType: 'text' as const }) as any
      );
      // Try to parse as JSON, fallback to empty array
      const parsed = this.safeParseJsonText(res);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      throw this.buildError('pollPathlossModel', err);
    }
  }

  async waitForPollComplete(
    session: string,
    id: number,
    opts?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<any> {
    const maxAttempts = opts?.maxAttempts ?? 30;
    const intervalMs = opts?.intervalMs ?? 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const pollResult = await this.pollPathlossModel(session, [id]);
        if (Array.isArray(pollResult) && pollResult.length > 0) {
          const item = pollResult[0];
          // Check status: 200 = success, 503 = processing, others = error
          if (item?.status === 200) {
            return item; // Success: return item with distancePowerLoss/fieldLoss
          } else if (item?.status === 503) {
            // Still processing, wait and retry
            if (attempt < maxAttempts - 1) {
              await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            continue;
          } else {
            // Other status codes (500, etc.) = error
            throw new Error(
              `Polling failed with status ${item?.status}: ${item?.msg || 'Unknown error'}`
            );
          }
        }
      } catch (err) {
        // If polling call itself fails, retry
        console.warn(`[PathLossModelService] waitForPollComplete attempt ${attempt + 1} failed`, err);
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    // Timeout: return null or throw
    throw new Error(
      `Polling timeout after ${maxAttempts} attempts. Please refresh the list manually.`
    );
  }
}
