import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, tap } from 'rxjs';

import { AuthService } from './auth.service';

export interface ObstacleOption {
  id: number;
  name: string;
  chineseName: string;
  decayCoefficient: number;
  property: string;
}

@Injectable({
  providedIn: 'root',
})
export class ObstacleMasterService {
  private cache: ObstacleOption[] | null = null;
  private mapById = new Map<number, ObstacleOption>();

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  public getObstacles(forceRefresh = false): Observable<ObstacleOption[]> {
    if (!forceRefresh && this.cache) {
      return of(this.cache);
    }

    const sessionToken = this.authService.getSessionInfo();
    const url = `/son/getObstacle/${sessionToken}`;

    return this.http.get<any>(url).pipe(
      map((resp) => this.normalizeObstacleResponse(resp)),
      tap((list) => {
        this.cache = list;
        this.mapById = new Map(list.map((o) => [o.id, o]));
      })
    );
  }

  public getObstacleById(id: number | null | undefined): ObstacleOption | null {
    if (id == null) return null;
    return this.mapById.get(Number(id)) ?? null;
  }

  public clearCache(): void {
    this.cache = null;
    this.mapById = new Map();
  }

  private normalizeObstacleResponse(resp: any): ObstacleOption[] {
    if (!resp) return [];

    let rawList: any[] | null = null;

    // direct array
    if (Array.isArray(resp)) {
      rawList = resp;
    } else if (typeof resp === 'object') {
      // try common wrappers: { data: [...] } / { data: { list: [...] } } / { list: [...] } / { items: [...] }
      const candidates = [
        resp,
        resp.data,
        resp.data?.list,
        resp.data?.items,
        resp.list,
        resp.items,
        resp.data?.data,
        resp.data?.data?.list,
      ];

      const firstArray = candidates.find((v) => Array.isArray(v));
      if (firstArray) {
        rawList = firstArray;
      } else if (typeof resp.id !== 'undefined') {
        // treat as single item
        rawList = [resp];
      } else if (resp.data && typeof resp.data.id !== 'undefined') {
        rawList = [resp.data];
      }
    }

    if (!rawList) return [];

    return rawList.map((item) => {
      const id = Number(item?.id);
      const decayCoefficient = Number(
        item?.decayCoefficient ?? item?.decay_coefficient ?? item?.decay ?? 0
      );

      return {
        id: Number.isFinite(id) ? id : 0,
        name: String(item?.name ?? ''),
        chineseName: String(item?.chineseName ?? item?.chinese_name ?? ''),
        decayCoefficient: Number.isFinite(decayCoefficient) ? decayCoefficient : 0,
        property: String(item?.property ?? ''),
      } satisfies ObstacleOption;
    });
  }
}

