import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  MaterialApiDto,
  MaterialRow,
  AddMaterialPayload,
  UpdateMaterialPayload,
} from '../models/material.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class MaterialService {
  private apiBase = '/son';

  constructor(private http: HttpClient, private authService: AuthService) {}

  /**
   * 取得材質列表（不去重）
   * - 納入所有材質，不管是 property === 'default' 或 'customized'
   * - 前端 UI 需要顯示全部可選項
   */
  getMaterials(): Observable<MaterialRow[]> {
    const sessionToken = this.authService.getSessionInfo();

    return this.http.get<MaterialApiDto[]>(
      `${this.apiBase}/getObstacle/${sessionToken}`
    ).pipe(
      map((list) => this.normalizeAndMapToRows(list))
    );
  }

  /**
   * 新增材質
   */
  addMaterial(payload: AddMaterialPayload): Observable<void> {
    const sessionToken = this.authService.getSessionInfo();
    const url = `${this.apiBase}/addObstacle/${sessionToken}`;
    
    const body = {
      ...payload,
      chineseName: (payload.chineseName ?? payload.name).trim(),
    };
    
    return this.postTextJson(url, body).pipe(map(() => void 0));
  }

  /**
   * 更新材質
   */
  updateMaterial(payload: UpdateMaterialPayload): Observable<void> {
    const sessionToken = this.authService.getSessionInfo();
    const url = `${this.apiBase}/updateObstacle/${sessionToken}`;
    
    const body = {
      ...payload,
      chineseName: (payload.chineseName ?? payload.name).trim(),
    };
    
    return this.postTextJson(url, body).pipe(map(() => void 0));
  }

  /**
   * 刪除材質
   */
  deleteMaterial(id: number, name: string): Observable<void> {
    const sessionToken = this.authService.getSessionInfo();
    const url = `${this.apiBase}/deleteObstacle/${sessionToken}`;
    
    return this.postTextJson(url, { id, name }).pipe(map(() => void 0));
  }

  /**
   * Legacy-compatible POST helper
   * - Content-Type: text/plain
   * - Body: JSON.stringify(payload)
   * - responseType: 'text'
   * 避免後端多餘 JSON.parse 導致 "Unexpected token o in JSON at position 1"
   */
  private postTextJson(url: string, payload: any): Observable<string> {
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
    };
    const body = JSON.stringify(payload);
    
    return this.http.post(url, body, {
      headers,
      responseType: 'text',
    });
  }

  private deduplicateDefaults(list: MaterialApiDto[]): MaterialApiDto[] {
    const defaultMap = new Map<string, MaterialApiDto>();
    const customizedList: MaterialApiDto[] = [];

    for (const item of list ?? []) {
      const normalized = this.normalizeDto(item);

      if (normalized.property === 'default') {
        const signature = `${normalized.name}|${normalized.decayCoefficient}|${normalized.property}`;
        const existing = defaultMap.get(signature);

        if (!existing || normalized.id < existing.id) {
          defaultMap.set(signature, normalized);
        }
        continue;
      }

      customizedList.push(normalized);
    }

    return [...Array.from(defaultMap.values()), ...customizedList];
  }

  private normalizeAndMapToRows(list: MaterialApiDto[]): MaterialRow[] {
    return (list ?? []).map((dto) => this.mapDtoToRow(this.normalizeDto(dto)));
  }

  private normalizeDto(dto: MaterialApiDto): MaterialApiDto {
    const decayRaw = (dto as any)?.decayCoefficient;
    const decayNumber = Number(decayRaw);

    return {
      ...dto,
      decayCoefficient: Number.isFinite(decayNumber) ? decayNumber : 0,
      property: dto?.property === 'default' ? 'default' : 'customized',
    };
  }

  /**
   * DTO → UI Row 轉換
   */
  private mapDtoToRow(dto: MaterialApiDto): MaterialRow {
    return {
      id: dto.id,
      name: dto.name,
      chineseName: dto.chineseName,
      decay: dto.decayCoefficient,
      property: dto.property,
    };
  }
}
