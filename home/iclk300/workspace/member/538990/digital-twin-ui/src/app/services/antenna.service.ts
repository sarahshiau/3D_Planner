import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, map, Observable, of, take, tap, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';
import { AntennaApiDto } from '../models/antenna/antenna.api.dto';
import { AntennaRow } from '../models/antenna/antenna.ui.model';
import { AntennaUpsertDraft } from '../models/antenna/antenna.draft';
import { MOCK_ANTENNAS } from '../mocks/antenna.mock';

export type AntennaUploadDomainError =
  | { kind: 'band_invalid'; code: '422_005'; messageKey: string }
  | { kind: 'port_invalid'; code: '422_006'; messageKey: string }
  | { kind: 'band_and_port_invalid'; code: '422_007'; messageKey: string }
  | { kind: 'unknown'; code?: string; messageKey: string };

// ===== [AP][WP-A1][DTO] getAntennaRawData =====
export interface AntennaRawDataPortDto {
  portName: string;
  portGain: number;
  frequency: number;
  pattern: number[][];
}

export interface AntennaRawDataResponseDto {
  antennaType: string;
  antennaName: string;
  chineseName?: string;
  model?: string;
  manufactor?: string;
  band?: number[];
  rawData: AntennaRawDataPortDto[];
}

/**
 * 舊系統 JSON mock 資料（原樣保留，支援 frequencyID/frequencyId normalize）
 */
const LEGACY_ANTENNA_MOCK: any[] = [
  {
    antennaID: 1001,
    antennaType: 'Omnidirectional',
    antennaName: 'Mock Omni 410-7125',
    model: 'MOCK-OMNI-1',
    manufactor: 'MockVendor',
    band: [410, 7125],
    protocol: '5G',
    property: 'default',
    user: 'system',
    availableFrequency: [],
  },
  {
    antennaID: 2001,
    antennaType: 'Directional',
    antennaName: 'Mock Directional 4850',
    model: 'MOCK-DIR-1',
    manufactor: 'MockVendor',
    band: [4850, 4850],
    protocol: '5G',
    property: 'customized',
    user: 'tester',
    availableFrequency: [
      {
        frequency: 4850,
        ports: [
          {
            portID: 1,
            portName: 'P1',
            portGain: 10,
          },
        ],
        frequencyId: 1,
      },
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class AntennaService {
  private readonly apiUrl = '/son';
  private readonly _mockDb$ = new BehaviorSubject<AntennaApiDto[]>(
    typeof structuredClone === 'function'
      ? structuredClone(MOCK_ANTENNAS)
      : (JSON.parse(JSON.stringify(MOCK_ANTENNAS)) as AntennaApiDto[])
  );

  constructor(private http: HttpClient, private auth: AuthService) {}

  private getSession(): string {
    return 'son_session_3967d6ec-8304-402b-ab67-06cc9601895a';
  }

  /** 取得天線列表 (GET) */
  getAntennas(sessionOverride?: string): Observable<AntennaRow[]> {
    const session = sessionOverride ?? this.getSession();
    const url = `${this.apiUrl}/getAntenna/${session}`;

    return this.http.get<any>(url).pipe(
      map(res => this.extractArray(res)),
      map(list => list.map(raw => this.normalizeAnyToDto(raw))),
      map(list => list.map(dto => this.mapDtoToRow(this.normalizeDto(dto))))
    );
  }

  /** 取得天線列表（完整 DTO，供 EditScene 預載） */
  getAntennasAsDto(sessionOverride?: string): Observable<AntennaApiDto[]> {
    const session = sessionOverride ?? this.getSession();
    const url = `${this.apiUrl}/getAntenna/${session}`;

    return this.http.get<any>(url).pipe(
      map(res => this.extractArray(res)),
      map(list => list.map((raw: any) => this.normalizeAnyToDto(raw))),
      map(list => list.map((dto: Partial<AntennaApiDto>) => this.normalizeDto(dto)))
    );
  }

  
  private uploadAntennaMock(draft: AntennaUpsertDraft): Observable<void> {
    return this._mockDb$.pipe(
      take(1),
      map(list => {
        const maxId = list.reduce((acc, item) => Math.max(acc, item.antennaID), 0);
        const newId = draft.antennaID ?? maxId + 1;
        const band: [number, number] = [draft.freqStartMHz, draft.freqEndMHz];

        const nextItem: AntennaApiDto = {
          antennaID: newId,
          antennaName: draft.name,
          antennaType: draft.type,
          manufactor: draft.manufactor,
          model: draft.model,
          band,
          protocol: draft.protocol,
          property: draft.property ?? 'customized',
          availableFrequencies: [],
          user: 'mock',
        };

        return [...list, nextItem];
      }),
      tap(nextList => this._mockDb$.next(nextList)),
      map(() => undefined)
    );
  }

  public updateAntennaMock(draft: AntennaUpsertDraft): Observable<void> {
    return this._mockDb$.pipe(
      take(1),
      map(list => {
        if (draft.antennaID == null) {
          throw new Error('updateAntennaMock requires antennaID');
        }

        const band: [number, number] = [draft.freqStartMHz, draft.freqEndMHz];

        return list.map(item => {
          if (item.antennaID !== draft.antennaID) {
            return item;
          }

          return {
            ...item,
            antennaName: draft.name,
            antennaType: draft.type,
            manufactor: draft.manufactor,
            model: draft.model,
            band,
            protocol: draft.protocol,
            property: draft.property ?? item.property,
            availableFrequencies: item.availableFrequencies,
            user: item.user,
          };
        });
      }),
      tap(nextList => this._mockDb$.next(nextList)),
      map(() => undefined)
    );
  }

  public deleteAntennaMock(antennaID: number): Observable<void> {
    return this._mockDb$.pipe(
      take(1),
      map(list => list.filter(item => item.antennaID !== antennaID)),
      tap(nextList => this._mockDb$.next(nextList)),
      map(() => undefined)
    );
  }

  /**
   * 將舊系統 JSON 格式轉換為 AntennaApiDto（normalize 成 camelCase）
   */
  private mapLegacyToModel(raw: any): AntennaApiDto {
    return {
      antennaID: Number(raw.antennaID),
      antennaName: String(raw.antennaName ?? ''),
      antennaType: String(raw.antennaType ?? ''),
      model: String(raw.model ?? ''),
      manufactor: String(raw.manufactor ?? ''),
      band: Array.isArray(raw.band) ? raw.band : [],
      protocol: String(raw.protocol ?? ''),
      user: String(raw.user ?? ''),
      property: String(raw.property ?? ''),
      availableFrequencies: Array.isArray(raw.availableFrequency)
        ? raw.availableFrequency.map((af: any) => ({
            frequency: af.frequency ?? null,
            frequencyId: af.frequencyId ?? af.frequencyID ?? null,
            ports: Array.isArray(af.ports)
              ? af.ports.map((p: any) => ({
                  portId: Number(p.portID),
                  portName: String(p.portName ?? ''),
                  portGain: Number(p.portGain ?? 0),
                }))
              : [],
          }))
        : [],
    };
  }

  /** 允許後端回傳多種包裝格式：[] / {data:[]} / {result:[]} */
  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    if (Array.isArray(res?.rows)) return res.rows;
    return [];
  }

  /**
   * 允許後端字段命名不一致（legacy / camelCase 混用），先轉成 AntennaApiDto
   * - antennaID / antennaId
   * - antennaName / name
   * - antennaType / type
   * - manufactor / vendor
   * - availableFrequency / availableFrequencies
   * - portID / portId
   */
  private normalizeAnyToDto(raw: any): AntennaApiDto {
    if (!raw) {
      return this.normalizeDto({});
    }

    const antennaID =
      raw.antennaID ?? raw.antennaId ?? raw.id ?? 0;

    const antennaName =
      raw.antennaName ?? raw.name ?? '(unnamed)';

    const antennaType =
      raw.antennaType ?? raw.type ?? 'Unknown';

    const manufactor =
      raw.manufactor ?? raw.vendor ?? '-';

    const model =
      raw.model ?? '-';

    const protocol =
      raw.protocol ?? raw.network ?? '5G';

    const property =
      raw.property ?? 'customized';

    // band: prefer raw.band ([start,end]) else derive from freqStart/freqEnd
    let band: any = raw.band;
    if (!Array.isArray(band) || band.length !== 2) {
      const s = Number(raw.freqStartMHz ?? raw.freqStart ?? raw.bandStart ?? 0);
      const e = Number(raw.freqEndMHz ?? raw.freqEnd ?? raw.bandEnd ?? 0);
      band = [s, e];
    }

    const af = raw.availableFrequencies ?? raw.availableFrequency ?? [];
    const availableFrequencies = Array.isArray(af)
      ? af.map((x: any) => ({
          frequency: x.frequency ?? null,
          frequencyId: x.frequencyId ?? x.frequencyID ?? x.frequency_id ?? null,
          ports: Array.isArray(x.ports)
            ? x.ports.map((p: any) => ({
                portId: Number(p.portId ?? p.portID ?? p.id ?? 0),
                portName: String(p.portName ?? p.name ?? ''),
                portGain: Number(p.portGain ?? p.gain ?? 0),
              }))
            : [],
        }))
      : [];

    return {
      antennaID: Number(antennaID),
      antennaName: String(antennaName),
      antennaType: String(antennaType),
      manufactor: String(manufactor),
      model: String(model),
      band: [Number(band[0] ?? 0), Number(band[1] ?? 0)],
      protocol: String(protocol),
      property: String(property),
      user: String(raw.user ?? 'unknown'),
      availableFrequencies,
    };
  }

  private normalizeDto(dto: Partial<AntennaApiDto>): AntennaApiDto {
    const bandValue = Array.isArray(dto.band) && dto.band.length === 2 ? dto.band : [0, 0];

    return {
      antennaID: dto.antennaID ?? 0,
      antennaType: dto.antennaType ?? 'Unknown',
      antennaName: dto.antennaName ?? '(unnamed)',
      model: dto.model ?? '-',
      manufactor: dto.manufactor ?? '-',
      band: [bandValue[0], bandValue[1]],
      protocol: dto.protocol ?? '5G',
      property: dto.property ?? 'customized',
      user: dto.user ?? 'unknown',
      availableFrequencies: dto.availableFrequencies ?? [],
    };
  }

  private mapDtoToRow(dto: AntennaApiDto): AntennaRow {
    let typeLabel = dto.antennaType || '未知';

    if (dto.antennaType === 'Omnidirectional') {
      typeLabel = '全向';
    } else if (dto.antennaType === 'Directional') {
      typeLabel = '指向';
    }

    return {
      id: dto.antennaID,
      name: dto.antennaName,
      type: typeLabel,
      freqMHz: `${dto.band[0]} ~ ${dto.band[1]}`,
      network: dto.protocol,
      count: (dto.availableFrequencies ?? []).length,
      model: dto.model,
      vendor: dto.manufactor,
      property: dto.property,
    };
  }

  // ===== [AP][WP-A1][API] getAntennaRawData =====
  getAntennaRawData(antennaId: number, sessionOverride?: string): Observable<AntennaRawDataResponseDto> {
    const session = sessionOverride ?? this.auth.getSessionInfo();
    return this.http.get<AntennaRawDataResponseDto>(`${this.apiUrl}/getAntennaRawData/${antennaId}/${session}`);
  }

  private buildUploadFormData(draft: AntennaUpsertDraft, file: File, sha256sum: string): FormData {
    const formData = new FormData();

    const stringifyForUpload = (value: unknown): string => {
      if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
        return JSON.stringify(value);
      }
      return String(value ?? '');
    };

    formData.append('file', file);
    formData.append('name', String(draft.name ?? ''));
    formData.append('sha256sum', String(sha256sum ?? ''));
    formData.append('property', String(draft.property ?? 'customized'));
    formData.append('type', String(draft.type ?? ''));
    formData.append('band', stringifyForUpload([Number(draft.freqStartMHz), Number(draft.freqEndMHz)]));
    formData.append('protocol', String(draft.protocol ?? ''));
    formData.append('port', stringifyForUpload(Number(draft.port ?? 0)));
    formData.append('model', String(draft.model ?? ''));
    formData.append('manufactor', String(draft.manufactor ?? ''));

    if (draft.antennaID != null) {
      formData.append('antennaID', stringifyForUpload(Number(draft.antennaID)));
    }

    return formData;
  }

  private mapUploadErrorToDomainError(err: any): AntennaUploadDomainError {
    const code = String(err?.error?.statusCode ?? '');

    if (code === '422_005') {
      return { kind: 'band_invalid', code: '422_005', messageKey: 'antenna.add.band_invalid' };
    }
    if (code === '422_006') {
      return { kind: 'port_invalid', code: '422_006', messageKey: 'antenna.add.port_invalid' };
    }
    if (code === '422_007') {
      return {
        kind: 'band_and_port_invalid',
        code: '422_007',
        messageKey: 'antenna.add.band_and_port_invalid',
      };
    }

    return { kind: 'unknown', code: code || undefined, messageKey: 'antenna.add.failed' };
  }

  public uploadAntenna(session: string, draft: AntennaUpsertDraft, file: File, sha256sum: string): Observable<any> {
    const url = `${this.apiUrl}/uploadAntenna/${session}`;
    const formData = this.buildUploadFormData(draft, file, sha256sum);

    return this.http.post(url, formData).pipe(
      catchError((err: any) => {
        const domainError = this.mapUploadErrorToDomainError(err);
        return throwError(() => domainError);
      })
    );
  }

  updateAntenna(draft: AntennaUpsertDraft): Observable<any> {
    const session = this.getSession();
    const url = `${this.apiUrl}/updateAntenna/${session}`;

    const formData = new FormData();
    formData.append('antennaID', String(draft.antennaID ?? 0));
    formData.append('name', String(draft.name ?? ''));
    formData.append('type', String(draft.type ?? ''));
    formData.append('band', JSON.stringify([draft.freqStartMHz, draft.freqEndMHz]));
    formData.append('protocol', String(draft.protocol ?? ''));
    formData.append('port', String(draft.port ?? 1));
    formData.append('model', String(draft.model ?? ''));
    formData.append('manufactor', String(draft.manufactor ?? ''));
    formData.append('property', String(draft.property ?? 'customized'));

    return this.http.post(url, formData);
  }

  // ===== [Antenna][Delete][API][FIX] =====
  deleteAntenna(antennaId: number) {
    const session = this.auth.getSessionInfo();
    const url = `${this.apiUrl}/deleteAntenna/${antennaId}/${session}`;
    console.log('[Antenna][Delete][API] call', { antennaId, session, url });
    return this.http.get<{ msg: string }>(url);
  }
}