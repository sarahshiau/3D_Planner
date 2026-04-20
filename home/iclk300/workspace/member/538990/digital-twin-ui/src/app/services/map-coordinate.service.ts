// src/app/services/map-coordinate.service.ts
// 目的：
// - 維護「ReferencePoint（中心點）」狀態，作為 2D/3D 對齊的唯一基準
// - 提供 convertToVector3(lat, lon)：把經緯度轉成以中心點為原點的 Babylon.js Vector3（單位：公尺）
//
// 為什麼要中心點偏移？
// - 經緯度轉成公尺後，若用絕對值會非常大，3D 引擎浮點精度會抖動
// - 以中心點當 (0,0,0)，整個區域落在幾百～幾千公尺，精度穩定，2D/3D 也好對齊

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Vector3 } from '@babylonjs/core';

export interface ReferencePoint {
  lat: number;
  lon: number;
}

@Injectable({ providedIn: 'root' })
export class MapCoordinateService {
  // 中心點狀態（可被 component 訂閱）
  private readonly _refPoint$ = new BehaviorSubject<ReferencePoint>({
    lat: 0,
    lon: 0,
  });

  readonly refPoint$ = this._refPoint$.asObservable();

  /** ✅【新增】最後一次有效的 BBox（給 2D/3D 對齊與地圖貼圖用） */
  lastBBox: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null = null;

  /** 取得目前中心點 */
  get refPoint(): ReferencePoint {
    return this._refPoint$.value;
  }
  
  /** 設定中心點（由 BBox 中心呼叫） */
  setReferencePoint(lat: number, lon: number): void {
    if (this._anchorCommitted) {
      console.warn('[Phase4][Coord] setReferencePoint ignored (anchor committed)', { lat, lon });
      return;
    }
    this._refPoint$.next({ lat, lon });
  }

  commitAnchor(bbox?: { south: number; west: number; north: number; east: number }): void {
    if (this._anchorCommitted) return;

    this._anchorCommitted = true;
    this._committedRefPoint = { ...this.refPoint };
    this._committedBBox = bbox ? { ...bbox } : null;

    console.log('[Phase4][Coord] anchor committed', {
      refPoint: this._committedRefPoint,
      bbox: this._committedBBox,
    });
  }

  /** 設定最後一次 BBox（給貼圖/對齊用） */
  setLastBBox(bbox: { south: number; west: number; north: number; east: number }) {
    this.lastBBox = bbox;
  }

  // -------------------- Phase4: Coordinate Anchor Commit --------------------
  private _anchorCommitted = false;
  private _committedRefPoint: ReferencePoint | null = null;
  private _committedBBox: { south: number; west: number; north: number; east: number } | null = null;

  get isAnchorCommitted(): boolean {
    return this._anchorCommitted;
  }

  get committedRefPoint(): ReferencePoint | null {
    return this._committedRefPoint;
  }

  get committedBBox(): { south: number; west: number; north: number; east: number } | null {
    return this._committedBBox;
  }

  private readonly R = 6378137; // WebMercator sphere radius

  private lonToMercX(lonDeg: number): number {
    const lonRad = lonDeg * Math.PI / 180;
    return this.R * lonRad;
  }

  private latToMercY(latDeg: number): number {
    const maxLat = 85.05112878;
    const lat = Math.max(Math.min(latDeg, maxLat), -maxLat);
    const latRad = lat * Math.PI / 180;
    return this.R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  }

  // ✅ [Stage2-F] WebMercator：把緯度轉 mercY（公尺），提供外部計算 merc 中點用
  public latToMercYPublic(latDeg: number): number {
    return this.latToMercY(latDeg);
  }

  // ✅ [Stage2-F] WebMercator：把 mercY（公尺）反解回緯度（度）
  public mercYToLat(mercY: number): number {
    const latRad = 2 * Math.atan(Math.exp(mercY / this.R)) - Math.PI / 2;
    return latRad * 180 / Math.PI;
  }

  convertToVector3(lat: number, lon: number): Vector3 {
    const { lat: lat0, lon: lon0 } = this.refPoint;

    const x = this.lonToMercX(lon) - this.lonToMercX(lon0);
    const z = this.latToMercY(lat) - this.latToMercY(lat0);

    return new Vector3(x, 0, z);
  }


  private degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
