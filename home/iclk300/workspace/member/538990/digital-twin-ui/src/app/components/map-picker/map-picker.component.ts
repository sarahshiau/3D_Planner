import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import { CommittedMapData } from 'src/app/models/committed-map-data.model';
import { Renderer2 } from '@angular/core';
import { MapPreviewService } from 'src/app/services/map-preview.service';
import { MapCoordinateService } from 'src/app/services/map-coordinate.service';
import { MapGeneratorService } from 'src/app/services/map-generator.service';

import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
} from '@babylonjs/core';

const BBOX_STYLE = {
  color: '#3b82f6',
  weight: 2,
  fillColor: '#3b82f6',
  fillOpacity: 0.1,
};

@Component({
  selector: 'app-map-picker',
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss'],
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  @Output() cancel = new EventEmitter<void>();
  @Output() committed = new EventEmitter<CommittedMapData>();

  @ViewChild('leafletHost', { static: false }) leafletHost!: ElementRef<HTMLDivElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvas!: ElementRef<HTMLCanvasElement>;
  
  // loading-1. 在類別屬性定義處增加
  public isGenerating: boolean = false;

  // [Map Picker Guard] state
  previewStatus: 'idle' | 'validating' | 'generating' | 'success' | 'error' = 'idle';
  validationError: string | null = null;
  previewError: string | null = null;
  private previewMessageOverride: string | null = null;
  previewReady = false;
  previewRequestId = 0;

  
  private refreshDebounceTimer: any = null;
  private readonly REFRESH_DEBOUNCE_MS = 400;

  private readonly MIN_BBOX_WIDTH_M = 10;
  private readonly MIN_BBOX_HEIGHT_M = 10;
  private readonly MAX_BBOX_WIDTH_M = 1200;
  private readonly MAX_BBOX_HEIGHT_M = 1200;
  private readonly SEARCH_DEFAULT_WIDTH_M = 600;
  private readonly SEARCH_DEFAULT_HEIGHT_M = 600;

  private readonly R_EARTH = 6378137; // Web Mercator radius (meters)

  // Leaflet instances
  private map: L.Map | null = null;

  private drawLayer: L.FeatureGroup | null = null;
  private bboxRect: L.Rectangle | null = null;
  private rectEditHandler: any | null = null;
  private boundRectEditListener: (() => void) | null = null;

  // Preview manager (Phase 2C) - latest-request mechanism, no previewBusy skip
  private preview: MapPreviewService | null = null;

  // Babylon preview runtime
  private previewEngine: Engine | null = null;
  private previewScene: Scene | null = null;
  private previewCamera: ArcRotateCamera | null = null;
  private previewAssets: any | null = null;
  private previewResizeObserver: ResizeObserver | null = null;
  private previewLastResizeW = 0;
  private previewLastResizeH = 0;

  private onResize = () => {
    try {
      this.previewEngine?.resize();

      requestAnimationFrame(() => {
        this.previewEngine?.resize();
        requestAnimationFrame(() => {
          this.previewEngine?.resize();
        });
      });
    } catch {}
  };

  constructor(
    private renderer: Renderer2,
    private coord: MapCoordinateService,
    private mapGen: MapGeneratorService
  ) {}

  // Selected bbox (lat/lng bounds)
  selectedBBox: { south: number; west: number; north: number; east: number } | null = null;

  // --- Search / locate ---
  searchQuery = '';
  searchResults: Array<{ display_name: string; lat: string; lon: string }> = [];
  isSearching = false;
  searchError = '';

  bboxSouth: number | null = 24.769551220901064;
  bboxWest: number | null = 121.03998184204103;
  bboxNorth: number | null = 24.779058839923554;
  bboxEast: number | null = 121.0495948791504;
  bboxWidthM: number | null = 500;
  bboxHeightM: number | null = 500;

  private locateMarker: L.Marker | null = null;

  ngAfterViewInit(): void {
    this.initLeaflet();

    // 只初始化 preview runtime，不自動生成 preview
    setTimeout(() => {
      this.tryInitPreview();
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
      this.refreshDebounceTimer = null;
    }
    if (this.previewResizeObserver) {
      this.previewResizeObserver.disconnect();
      this.previewResizeObserver = null;
}
  }

  private validateBBoxBasic(bbox: { south: number; west: number; north: number; east: number } | null): { ok: boolean; message?: string } {
    if (!bbox) return { ok: false, message: '框選範圍無效，請重新選取。' };
    const { south, north, west, east } = bbox;
    if (![south, north, west, east].every(Number.isFinite)) {
      return { ok: false, message: '框選範圍無效，請重新選取。' };
    }
    if (south >= north || west >= east) {
      return { ok: false, message: '框選範圍無效，請重新選取。' };
    }
    if (south < -90 || south > 90 || north < -90 || north > 90) {
      return { ok: false, message: '框選範圍無效，請重新選取。' };
    }
    if (west < -180 || west > 180 || east < -180 || east > 180) {
      return { ok: false, message: '框選範圍無效，請重新選取。' };
    }
    return { ok: true };
  }

  private lonToMercX(lonDeg: number): number {
    return this.R_EARTH * (lonDeg * Math.PI / 180);
  }

  private latToMercY(latDeg: number): number {
    const maxLat = 85.05112878;
    const lat = Math.max(Math.min(latDeg, maxLat), -maxLat);
    const latRad = lat * Math.PI / 180;
    return this.R_EARTH * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  }

  private mercXToLon(mercX: number): number {
    return (mercX / this.R_EARTH) * (180 / Math.PI);
  }

  private mercYToLat(mercY: number): number {
    const latRad = 2 * Math.atan(Math.exp(mercY / this.R_EARTH)) - Math.PI / 2;
    return latRad * (180 / Math.PI);
  }

  private rejectOversizedBBox(message?: string): void {
    this.validationError = message ?? '框選範圍過大，請縮小選取範圍後再試一次。';
    this.previewError = null;
    this.previewMessageOverride = null;
    this.previewReady = false;
    this.previewStatus = 'error';
  }

  private measureBBoxSizeMeters(bbox: { south: number; west: number; north: number; east: number }): { widthM: number; heightM: number } {
    const widthM = Math.abs(this.lonToMercX(bbox.east) - this.lonToMercX(bbox.west));
    const heightM = Math.abs(this.latToMercY(bbox.north) - this.latToMercY(bbox.south));
    return { widthM, heightM };
  }

  private validateBBoxSize(bbox: { south: number; west: number; north: number; east: number }): { ok: boolean; message?: string } {
    const { widthM, heightM } = this.measureBBoxSizeMeters(bbox);
    if (widthM < this.MIN_BBOX_WIDTH_M || heightM < this.MIN_BBOX_HEIGHT_M) {
      return { ok: false, message: '框選範圍過小，請放大選取範圍後再試一次。' };
    }
    if (widthM > this.MAX_BBOX_WIDTH_M || heightM > this.MAX_BBOX_HEIGHT_M) {
      return { ok: false, message: '框選範圍過大，請縮小選取範圍後再試一次。' };
    }
    return { ok: true };
  }

  private resetPreviewValidationState(): void {
    this.validationError = null;
    this.previewError = null;
    this.previewMessageOverride = null;
    this.previewReady = false;
    this.previewStatus = 'idle';
  }

  /**
   * Single entry point for bbox changes. Clears old validation/preview state and triggers
   * validation + preview refresh. All bbox sources (draw:created, draw:edited, manual input,
   * search result apply) must go through this to ensure consistent refresh lineage.
   */
  private applyBBoxChange(
    bbox: { south: number; west: number; north: number; east: number } | null,
    reason: string
  ): void {
    console.log('[MapPicker][BBoxPending]', { reason, bbox });

    this.selectedBBox = bbox;

    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
      this.refreshDebounceTimer = null;
    }

    if (!bbox) {
      this.previewReady = false;
      this.validationError = null;
      this.previewError = null;
      this.previewMessageOverride = null;
      this.previewStatus = 'idle';
      this.currentPreviewBBoxKey = null;
      return;
    }

    const size = this.measureBBoxSizeMeters(bbox);
    this.bboxWidthM = Math.round(size.widthM);
    this.bboxHeightM = Math.round(size.heightM);

    // BBox 變更只更新 pending，不自動生成 preview
    this.validationError = null;
    this.previewError = null;
    this.previewMessageOverride = null;
    this.previewReady = false;
    this.previewStatus = 'idle';
  }

  private schedulePreviewRefresh(reason: string) {
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
    }
    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshDebounceTimer = null;
      this.guardedRefreshPreview(reason);
    }, this.REFRESH_DEBOUNCE_MS);
  }

  private async fetchOsmWithRetry<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, maxRetries: number) => void
  ): Promise<T> {
    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        const isRetryable = this.isOverpassRetryableError(err);
        if (!isRetryable || attempt >= maxRetries) {
          throw err;
        }

        // Notify UI retry progress before waiting (attempt is 1-based in message).
        onRetry?.(attempt + 1, maxRetries);

        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((res) => setTimeout(res, delay));
        attempt++;
      }
    }
  }

  private isOverpassRetryableError(err: any): boolean {
    const msg = String(err?.message ?? '').toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('504') ||
      msg.includes('too busy') ||
      msg.includes('gateway timeout')
    );
  }

  // Dedup overpass/preview generation while a bbox is already in-flight.
  // This prevents duplicate Overpass calls for the same bbox when user drags quickly.
  private pendingOsmRequests = new Map<string, Promise<any>>();
  private pendingOsmSubscribers = new Map<string, number>();
  private currentPreviewBBoxKey: string | null = null;
  private lastFetchedBBox: { south: number; west: number; north: number; east: number } | null = null;
  private _previewFlowState: '' | 'preview_cancelling' | 'preview_clearing' = '';

  private buildBBoxKey(b: { south: number; west: number; north: number; east: number }): string {
    return [
      b.south.toFixed(5),
      b.west.toFixed(5),
      b.north.toFixed(5),
      b.east.toFixed(5),
    ].join('_');
  }

  private hasSignificantBBoxChange(
    a: { south: number; west: number; north: number; east: number },
    b: { south: number; west: number; north: number; east: number }
  ): boolean {
    const threshold = 20; // meters

    // Compare center distance in WebMercator meters (approx).
    const aCenterX = (this.lonToMercX(a.west) + this.lonToMercX(a.east)) / 2;
    const aCenterY = (this.latToMercY(a.south) + this.latToMercY(a.north)) / 2;
    const bCenterX = (this.lonToMercX(b.west) + this.lonToMercX(b.east)) / 2;
    const bCenterY = (this.latToMercY(b.south) + this.latToMercY(b.north)) / 2;
    const dx = aCenterX - bCenterX;
    const dy = aCenterY - bCenterY;
    const centerDist = Math.sqrt(dx * dx + dy * dy);
    if (centerDist >= threshold) return true;

    // Also consider bbox size change.
    const aSize = this.measureBBoxSizeMeters(a);
    const bSize = this.measureBBoxSizeMeters(b);
    if (Math.abs(aSize.widthM - bSize.widthM) >= threshold) return true;
    if (Math.abs(aSize.heightM - bSize.heightM) >= threshold) return true;

    return false;
  }

  // [PreviewFlow v1 re-confirm fix]
  get canConfirmPreview(): boolean {
    return !!this.pendingBBox && !this.isPreviewLocked;
  }

  get canConfirmMap(): boolean {
    return !!this.selectedBBox
      && !this.isGenerating
      && this.previewReady
      && this.previewStatus === 'success'
      && !this.validationError
      && !this.previewError;
  }

  get pendingBBox(): { south: number; west: number; north: number; east: number } | null {
    return this.selectedBBox;
  }

  get previewFlowState(): string {
    return this._previewFlowState;
  }

  get isPreviewLocked(): boolean {
    if (this._previewFlowState === 'preview_cancelling' || this._previewFlowState === 'preview_clearing') {
      return true;
    }
    return this.isGenerating || this.previewStatus === 'generating' || this.previewStatus === 'validating';
  }

  get canCancelPreview(): boolean {
    if (this._previewFlowState === 'preview_cancelling' || this._previewFlowState === 'preview_clearing') {
      return false;
    }
    return !!this.selectedBBox || !!this.previewAssets || this.previewReady || this.previewStatus === 'generating';
  }

  get stepTitle(): string {
    if (this.previewReady && this.previewStatus === 'success') {
      return '預覽結果確認';
    }
    if (this.pendingBBox) {
      return '確認預覽範圍';
    }
    return '選取地圖範圍';
  }

  get previewMessage(): string {
    if (this.validationError) return this.validationError;
    if (this.previewError) return this.previewError;
    if (this.previewMessageOverride) return this.previewMessageOverride;
    switch (this.previewStatus) {
      case 'idle': return '請先在左側框選地圖範圍';
      case 'validating': return '檢查地圖範圍中...';
      case 'generating': return '地圖載入中...';
      case 'error': return '右側地圖載入失敗，請重新框選或縮小範圍後再試一次。';
      default: return '';
    }
  }

  get showPreviewMessage(): boolean {
    return this.previewStatus !== 'success';
  }

  get showConfirmHint(): boolean {
    return !this.canConfirmMap && (
      !!this.selectedBBox ||
      !!this.validationError ||
      !!this.previewError ||
      this.isGenerating
    );
  }

  onCancel(): void {
    console.log('[MapPicker] cancel clicked');
    this.disposePreview();
    this.cancel.emit();
  }

  onConfirmPreview(): void {
    if (!this.pendingBBox) {
      console.warn('[MapPicker] preview confirm blocked: no pending bbox');
      return;
    }
    if (this.isPreviewLocked) {
      console.warn('[MapPicker] preview confirm blocked: flow locked');
      return;
    }

    console.log('[MapPicker][PreviewConfirm]', { bbox: this.pendingBBox });

    this.tryInitPreview();

    if (!this.preview) {
      this.previewStatus = 'error';
      this.previewError = '預覽引擎尚未就緒，請稍後再試。';
      return;
    }

    this._previewFlowState = '';
    this.guardedRefreshPreview('preview-confirm');
  }

  onCancelPreview(): void {
    if (this._previewFlowState === 'preview_cancelling' || this._previewFlowState === 'preview_clearing') {
      return;
    }
    if (!this.canCancelPreview) {
      return;
    }

    const isCancellingInFlight =
      this.isGenerating ||
      this.previewStatus === 'generating' ||
      this.previewStatus === 'validating';

    this._previewFlowState = isCancellingInFlight ? 'preview_cancelling' : 'preview_clearing';

    console.log('[MapPicker][PreviewCancel]', {
      mode: this._previewFlowState,
      hasSelectedBBox: !!this.selectedBBox,
      hasPreviewAssets: !!this.previewAssets,
    });

    try {
      this.previewRequestId++;
      this.isGenerating = false;
      this.previewReady = false;
      this.previewError = null;
      this.validationError = null;
      this.previewMessageOverride = null;

      if (this.preview && this.previewAssets) {
        try {
          (this.preview as any).disposeAssets?.(this.previewAssets);
        } catch (err) {
          console.warn('[MapPicker] cancel preview disposeAssets failed (ignored)', err);
        }
      }

      this.previewAssets = null;
      this.currentPreviewBBoxKey = null;
      this.lastFetchedBBox = null;
      this.previewStatus = 'idle';
      this.previewEngine?.resize();

      console.log('[MapPicker][PreviewCleared]', {
        hasSelectedBBox: !!this.selectedBBox,
        previewStatus: this.previewStatus,
      });
    } finally {
      this._previewFlowState = '';
    }
  }
  onRetry(): void {
    this.onConfirmPreview();
  }

  onConfirm(): void {
    if (!this.selectedBBox) {
      console.warn('[MapPicker] confirm blocked: no bbox selected');
      return;
    }

    const data: CommittedMapData = {
      bbox: { ...this.selectedBBox },
      // 先固定 zoom；Phase 2C 或後續可改為讀取 leaflet 的 zoom
      zoom: this.map?.getZoom?.() ?? 17,
      provider: 'osm',
      committedAtISO: new Date().toISOString(),
    };

    console.log('[MapPicker] confirm -> emit committed', data);
    this.disposePreview();
    this.committed.emit(data);
  }

  private initLeaflet(): void {
    if (!this.leafletHost?.nativeElement) {
      console.warn('[MapPicker] initLeaflet aborted: no leafletHost');
      return;
    }

    // 避免重複 init
    this.disposeLeaflet();

    const center = L.latLng(25.04, 121.53);
    const zoom = 16;

    this.map = L.map(this.leafletHost.nativeElement, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      crossOrigin: true,
      attribution: '',
    }).addTo(this.map);

    // --- [FIX][LeafletDraw] Harden GeometryUtil.readableArea to avoid draw crash ---
    const LAny: any = L as any;
    if (LAny?.GeometryUtil && typeof LAny.GeometryUtil.readableArea === 'function') {
      const _origReadableArea = LAny.GeometryUtil.readableArea;
      LAny.GeometryUtil.readableArea = function (area: number, isMetric?: boolean, precision?: number) {
        try {
          return _origReadableArea.call(this, area, isMetric, precision);
        } catch (err) {
          // Avoid leaflet-draw area tooltip compatibility errors from polluting bbox flow debug.
          return '';
        }
      };
    }

    // FeatureGroup for draw result
    this.drawLayer = new L.FeatureGroup();
    this.map.addLayer(this.drawLayer);

    // Draw control: rectangle only
    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: false,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
          shapeOptions: BBOX_STYLE,
        },
      },
      edit: {
        featureGroup: this.drawLayer,
        edit: false,
        remove: true,
      },
    });

    this.map.addControl(drawControl);

    // On rectangle created -> keep only one
    this.map.on((L as any).Draw.Event.CREATED, (e: any) => {
      this.drawLayer?.clearLayers();
      this.applyBBoxStyleToLayer(e.layer);
      this.drawLayer?.addLayer(e.layer);
      this.unbindBBoxRectEditEvents();
      // keep ref
      this.bboxRect = e.layer as L.Rectangle;

      // enable edit immediately so user can drag corners
      this.enableRectEditing();
      this.bindBBoxRectEditEvents();

      const bounds = e.layer.getBounds() as L.LatLngBounds;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const bbox = {
        south: sw.lat,
        west: sw.lng,
        north: ne.lat,
        east: ne.lng,
      };
      const sizeCheck = this.validateBBoxSize(bbox);
      if (!sizeCheck.ok) {
        this.drawLayer?.clearLayers();
        this.unbindBBoxRectEditEvents();
        this.bboxRect = null;
        this.rectEditHandler = null;
        this.rejectOversizedBBox(sizeCheck.message);
        return;
      }

      console.log('[MapPicker] bbox selected (leaflet-draw)', bbox);

      this.applyBBoxChange(bbox, 'bbox-created');
    });

    // NOTE:
    // We intentionally do not rely on draw:edited for bbox refresh.
    // Layer-level events are bound in bindBBoxRectEditEvents() on bboxRect,
    // which avoids duplicate refresh triggers when editing.

    // draw:deleted - bind once (not inside click)
    this.map.on('draw:deleted', () => {
      this.unbindBBoxRectEditEvents();
      this.bboxRect = null;
      this.rectEditHandler = null;

      this.applyBBoxChange(null, 'bbox-deleted');

      console.log('[MapPicker] bbox deleted -> reset');
    });

    // click - clear search results only
    this.map.on('click', () => {
      this.searchResults = [];
    });

    // 確保顯示尺寸正確
    this.map.invalidateSize();

    console.log('[MapPicker] leaflet initialized (leaflet-draw rectangle)');
  }

  private disposeLeaflet(): void {
    this.unbindBBoxRectEditEvents();

    if (this.map) {
      this.map.off();
      this.map.remove();
      this.locateMarker = null;
      this.searchResults = [];
      this.searchError = '';
      this.map = null;
    }

    this.drawLayer = null;

    // Reset state
    this.selectedBBox = null;
    this.resetPreviewValidationState();
  }

  private tryInitPreview(): void {
    if (this.preview) return;
    if (!this.previewCanvas?.nativeElement) return;

    // 1) Service instance
    this.preview = new MapPreviewService(this.coord, this.mapGen);

    // 2) Babylon runtime
    const canvas = this.previewCanvas.nativeElement;

    this.previewEngine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: true,
        stencil: true,
      },
      true
    );

    this.previewScene = new Scene(this.previewEngine);

    // Camera: ArcRotate
    this.previewCamera = new ArcRotateCamera(
      'mapPickerPreviewCam',
      Math.PI / 2,
      Math.PI / 3,
      250,
      Vector3.Zero(),
      this.previewScene
    );
    this.previewCamera.attachControl(canvas, true);

    // Light
    new HemisphericLight('mapPickerPreviewLight', new Vector3(0, 1, 0), this.previewScene);

    // Render loop
    this.previewEngine.runRenderLoop(() => {
      this.previewScene?.render();
    });

    window.addEventListener('resize', this.onResize);

    const hostEl = canvas.parentElement;
    if (hostEl && typeof ResizeObserver !== 'undefined') {
      this.previewResizeObserver?.disconnect();

      this.previewResizeObserver = new ResizeObserver(() => {
        const w = hostEl.clientWidth || canvas.clientWidth;
        const h = hostEl.clientHeight || canvas.clientHeight;

        if (w <= 2 || h <= 2) return;
        if (w === this.previewLastResizeW && h === this.previewLastResizeH) return;

        this.previewLastResizeW = w;
        this.previewLastResizeH = h;

        try {
          this.previewEngine?.resize();
        } catch {}
      });

      this.previewResizeObserver.observe(hostEl);
    }

    // 初次建立後補兩次 resize
    requestAnimationFrame(() => {
      this.previewEngine?.resize();
      requestAnimationFrame(() => {
        this.previewEngine?.resize();
      });
    });
    console.log('[MapPicker] preview manager + babylon runtime created');
  }


  /**
   * Guard: validate bbox before generate. Only calls refreshPreviewIfReady when valid.
   */
    private guardedRefreshPreview(reason: string): void {
      this.resetPreviewValidationState();

      if (!this.selectedBBox) {
        this.previewStatus = 'idle';
        this.previewReady = false;
        this.currentPreviewBBoxKey = null;
        return;
      }

      const validation = this.validateBBoxForPreview(this.selectedBBox);
      if (!validation.ok) {
        this.previewStatus = 'idle';
        this.previewReady = false;
        this.currentPreviewBBoxKey = null;
        this.validationError = validation.message ?? '預覽範圍不合法';
        return;
      }

      void this.refreshPreviewIfReady(reason);
    }

    private validateBBoxForPreview(
      bbox: { south: number; west: number; north: number; east: number } | null
    ): { ok: boolean; message?: string } {
      if (!bbox) {
        return { ok: false, message: '請先選取預覽範圍' };
      }

      const { south, west, north, east } = bbox;

      if (
        !Number.isFinite(south) ||
        !Number.isFinite(west) ||
        !Number.isFinite(north) ||
        !Number.isFinite(east)
      ) {
        return { ok: false, message: '預覽範圍座標無效' };
      }

      if (north <= south || east <= west) {
        return { ok: false, message: '預覽範圍尺寸無效' };
      }

      const size = this.measureBBoxSizeMeters(bbox);

      if (!Number.isFinite(size.widthM) || !Number.isFinite(size.heightM)) {
        return { ok: false, message: '無法計算預覽範圍尺寸' };
      }

      if (size.widthM <= 0 || size.heightM <= 0) {
        return { ok: false, message: '預覽範圍尺寸必須大於 0' };
      }

      return { ok: true };
    }
    
  private async refreshPreviewIfReady(reason: string): Promise<void> {
    const canvas = this.previewCanvas?.nativeElement;
    const hostEl = canvas?.parentElement;

    const cw = canvas?.clientWidth ?? 0;
    const ch = canvas?.clientHeight ?? 0;
    const hw = hostEl?.clientWidth ?? 0;
    const hh = hostEl?.clientHeight ?? 0;

    console.log('[MapPicker][PreviewCanvasSize][before-generate]', {
      canvasClient: { w: cw, h: ch },
      hostClient: { w: hw, h: hh },
      canvasBuffer: {
        w: canvas?.width ?? 0,
        h: canvas?.height ?? 0,
      },
    });

    if (Math.max(cw, hw) <= 2 || Math.max(ch, hh) <= 2) {
      console.warn('[MapPicker] preview generate skipped: canvas size not ready');
      this.previewStatus = 'error';
      this.previewError = '預覽畫布尚未完成排版，請再試一次。';
      this.isGenerating = false;
      return;
    }
    if (!this.preview || !this.previewCanvas?.nativeElement) return;
    if (!this.selectedBBox) return;

    // If bbox change is very small, keep current preview and skip regeneration.
    const selectedBBox = this.selectedBBox;
    const selectedBBoxKey = this.buildBBoxKey(selectedBBox);
    if (
      this.lastFetchedBBox &&
      !this.hasSignificantBBoxChange(this.lastFetchedBBox, selectedBBox)
    ) {
      this.previewStatus = this.previewAssets ? 'success' : 'idle';
      this.previewReady = !!this.previewAssets;
      this.isGenerating = false;
      this.previewError = null;
      this.validationError = null;
      this.previewMessageOverride = null;
      this.currentPreviewBBoxKey = this.previewAssets ? selectedBBoxKey : null;
      this.previewEngine?.resize();
      return;
    }

    // [Strategy A] latest-request only: bump id, clear stale success/error
    const requestId = ++this.previewRequestId;
    this.previewReady = false;
    this.validationError = null;
    this.previewError = null;
    this.previewMessageOverride = null;
    this.previewStatus = 'generating';
    this.isGenerating = true;

  try {
    console.log('[MapPicker] preview generate start', {
      reason,
      bbox: this.selectedBBox,
    });

    this.previewEngine?.resize();
    
    this.previewEngine?.resize();

    requestAnimationFrame(() => {
      this.previewEngine?.resize();
      requestAnimationFrame(() => {
        this.previewEngine?.resize();
      });
    });

    if (!this.previewScene) {
      console.warn('[MapPicker] previewScene not ready, skip');
      if (requestId !== this.previewRequestId) return;
      this.isGenerating = false;
      this.previewStatus = 'error';
      this.previewError = '右側地圖載入失敗，請重新框選或縮小範圍後再試一次。';
      return;
    }

    // 1️⃣ 將 selectedBBox 轉成 Leaflet LatLngBounds
    const b = this.selectedBBox;
    const bounds = L.latLngBounds(
      L.latLng(b.south, b.west),
      L.latLng(b.north, b.east)
    );

    const zoom = this.map?.getZoom?.() ?? 17;

    const bboxKey = this.buildBBoxKey(b);


    try {
      if (this.previewAssets) {
        (this.preview as any).disposeAssets?.(this.previewAssets);
      }
    } catch (e) {
      console.warn('[MapPicker] dispose previous preview assets failed (ignored)', e);
    }
    this.previewAssets = null;
    this.currentPreviewBBoxKey = null;

    // 3️⃣ 先清掉目前顯示中的 preview assets，避免舊 bbox 殘留在 scene
    try {
      if (this.previewAssets) {
        (this.preview as any).disposeAssets?.(this.previewAssets);
      }
    } catch (e) {
      console.warn('[MapPicker] dispose previous preview assets failed (ignored)', e);
    }
    this.previewAssets = null;
    this.currentPreviewBBoxKey = null;

    // 4️⃣ 關鍵：In-flight dedupe for same bbox (avoid duplicate Overpass)
    let pendingPromise = this.pendingOsmRequests.get(bboxKey);
    if (pendingPromise) {
      const nextSubs = (this.pendingOsmSubscribers.get(bboxKey) ?? 0) + 1;
      this.pendingOsmSubscribers.set(bboxKey, nextSubs);
    } else {
      pendingPromise = this.fetchOsmWithRetry(
        () =>
          (this.preview as any).generate(
            this.previewScene,
            bounds,
            zoom
          ),
        (retryAttempt, maxRetries) => {
          if (requestId !== this.previewRequestId) return;
          this.previewStatus = 'generating';
          this.isGenerating = true;
          this.previewMessageOverride = `伺服器忙碌，正在重試 (${retryAttempt}/${maxRetries})...`;
        }
      );
      this.pendingOsmRequests.set(bboxKey, pendingPromise);
      this.pendingOsmSubscribers.set(bboxKey, 1);
      // Record last bbox that actually triggered an Overpass query.
      this.lastFetchedBBox = { ...b };
    }

    let assets: any = null;
    const subsNow = this.pendingOsmSubscribers.get(bboxKey) ?? 1;
    try {
      assets = await pendingPromise;

      if (requestId !== this.previewRequestId) {
        // If multiple callers share the same promise, skip dispose to avoid breaking the newer one.
        if (subsNow <= 1) {
          try {
            (this.preview as any).disposeAssets?.(assets);
          } catch {}
        }
        return;
      }

    this.previewAssets = assets;
    this.currentPreviewBBoxKey = bboxKey;

    } finally {
      const prevSubs = this.pendingOsmSubscribers.get(bboxKey);
      if (prevSubs != null) {
        const nextSubs = prevSubs - 1;
        if (nextSubs <= 0) {
          this.pendingOsmRequests.delete(bboxKey);
          this.pendingOsmSubscribers.delete(bboxKey);
        } else {
          this.pendingOsmSubscribers.set(bboxKey, nextSubs);
        }
      }
    }
    this.isGenerating = false;
    this.previewReady = true;
    this.previewStatus = 'success';
    this.previewError = null;
    this.validationError = null;
    this.previewMessageOverride = null;

    console.log('[MapPicker] preview generate done', this.previewAssets);

    // 4️⃣ 自動對焦 camera
    try {
      const ground = this.previewAssets?.ground;
      const cam = this.previewCamera;

      if (ground && cam) {
        const center = ground.position ?? Vector3.Zero();
        cam.setTarget(center);

        const r = ground.getBoundingInfo?.().boundingSphere?.radiusWorld ?? 100;
        cam.radius = Math.max(80, r * 2.2);
      }
    } catch (e) {
      console.warn('[MapPicker] camera fit failed (ignored)', e);
    }

    // 5️⃣ 確保 resize
    this.previewEngine?.resize();

  } catch (err) {
    console.error('[MapPicker] preview generate failed', err);
    if (requestId !== this.previewRequestId) return;

    this.isGenerating = false;
    this.previewReady = false;
    this.previewStatus = 'error';
    this.previewError = '建築資料載入失敗，伺服器忙碌，請稍後重試或縮小範圍後再試一次。';
    this.previewMessageOverride = null;
  }
}

  private disposePreview(): void {
    // Dispose generated assets (ground/buildings/texture)
    try {
      (this.preview as any)?.disposeAssets?.(this.previewAssets);
    } catch {}
    this.previewAssets = null;
    this.currentPreviewBBoxKey = null;

    // Dispose Babylon runtime
    try {
      window.removeEventListener('resize', this.onResize);

      if (this.previewEngine) {
        this.previewEngine.stopRenderLoop();
      }

      this.previewScene?.dispose();
      this.previewEngine?.dispose();
    } catch (err) {
      console.warn('[MapPicker] preview dispose error', err);
    } finally {
      this.previewScene = null;
      this.previewEngine = null;
      this.previewCamera = null;
      this.preview = null;
    }
  }

  async onSearchSubmit(evt: Event): Promise<void> {
    evt.preventDefault();
    this.searchError = '';
    this.searchResults = [];

    const q = (this.searchQuery || '').trim();
    if (!q) return;

    this.isSearching = true;

    try {
      // Nominatim: forward geocoding
      // 注意：Nominatim 有 rate limit，建議不要做高頻自動查詢；本實作採手動 submit
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=' +
        encodeURIComponent(q);

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          // Browser 環境無法保證設定 User-Agent；至少送出 Accept-Language 比較友善
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6',
        },
      });

      if (!resp.ok) {
        throw new Error(`Nominatim HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as Array<any>;

      this.searchResults = (data || []).map((x) => ({
        display_name: String(x.display_name ?? ''),
        lat: String(x.lat ?? ''),
        lon: String(x.lon ?? ''),
      }));

      if (!this.searchResults.length) {
        this.searchError = '找不到結果，請換個關鍵字或輸入更完整地址。';
      }
    } catch (err) {
      console.error('[MapPicker][Nominatim] search failed', err);
      this.searchError = '搜尋失敗（可能被限制或網路問題）。請稍後再試。';
    } finally {
      this.isSearching = false;
    }
  }

  private enableRectEditing(): void {
    if (!this.bboxRect) return;

    try {
      // Leaflet.draw editing handler on a layer:
      // layer.editing.enable()
      const anyRect: any = this.bboxRect as any;
      if (anyRect.editing && typeof anyRect.editing.enable === 'function') {
        anyRect.editing.enable();
        this.rectEditHandler = anyRect.editing;
        console.log('[MapPicker] rectangle editing enabled');
      }
    } catch (e) {
      console.warn('[MapPicker] enableRectEditing failed', e);
    }
  }

  private extractBBoxFromRect(rect: L.Rectangle): { south: number; west: number; north: number; east: number } {
    const b = rect.getBounds() as L.LatLngBounds;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
    };
  }

  private applyBBoxStyleToLayer(layer: any): void {
    try {
      layer?.setStyle?.(BBOX_STYLE);
    } catch (e) {
      console.warn('[MapPicker] apply bbox style failed', e);
    }
  }

  private bindBBoxRectEditEvents(): void {
    const rectAny: any = this.bboxRect as any;
    if (!rectAny) return;

    // Avoid duplicate binding when bbox is recreated.
    this.unbindBBoxRectEditEvents();

    const onRectEdited = () => {
      if (!this.bboxRect) return;
      this.applyBBoxStyleToLayer(this.bboxRect);
      const bbox = this.extractBBoxFromRect(this.bboxRect);
      const sizeCheck = this.validateBBoxSize(bbox);
      if (!sizeCheck.ok) {
        this.rejectOversizedBBox(sizeCheck.message);
        if (this.selectedBBox) {
          this.bboxSouth = this.selectedBBox.south;
          this.bboxWest = this.selectedBBox.west;
          this.bboxNorth = this.selectedBBox.north;
          this.bboxEast = this.selectedBBox.east;
          this.goToBBox();
        } else {
          this.drawLayer?.clearLayers();
          this.unbindBBoxRectEditEvents();
          this.bboxRect = null;
          this.rectEditHandler = null;
        }
        return;
      }
      this.applyBBoxChange(bbox, 'bbox-edited');
    };

    // Layer-level events: different plugins/modes may emit different event names.
    rectAny.on?.('edit', onRectEdited);
    rectAny.on?.('resize', onRectEdited);
    rectAny.on?.('move', onRectEdited);
    rectAny.on?.('dragend', onRectEdited);

    this.boundRectEditListener = () => {
      rectAny.off?.('edit', onRectEdited);
      rectAny.off?.('resize', onRectEdited);
      rectAny.off?.('move', onRectEdited);
      rectAny.off?.('dragend', onRectEdited);
    };
  }

  private unbindBBoxRectEditEvents(): void {
    try {
      this.boundRectEditListener?.();
    } catch {}
    this.boundRectEditListener = null;
  }

  goToBBox(): void {
    this.searchError = '';

    const south = Number(this.bboxSouth);
    const west = Number(this.bboxWest);
    const north = Number(this.bboxNorth);
    const east = Number(this.bboxEast);

    // 基本檢查
    if (![south, west, north, east].every(Number.isFinite)) {
      this.searchError = '請輸入完整 bbox：South / West / North / East';
      return;
    }
    if (south < -90 || south > 90 || north < -90 || north > 90) {
      this.searchError = '緯度範圍不正確：south/north 必須在 [-90, 90]';
      return;
    }
    if (west < -180 || west > 180 || east < -180 || east > 180) {
      this.searchError = '經度範圍不正確：west/east 必須在 [-180, 180]';
      return;
    }
    if (north <= south || east <= west) {
      this.searchError = 'bbox 不合法：North 必須 > South，East 必須 > West';
      return;
    }

    if (!this.map) {
      console.warn('[MapPicker] goToBBox blocked: map not ready');
      return;
    }

    // Leaflet bounds
    const bounds = L.latLngBounds(
      L.latLng(south, west),
      L.latLng(north, east),
    );

    // 1) 視角定位：用 fitBounds，讓 bbox 完整入鏡
    this.map.fitBounds(bounds, { animate: true, padding: [20, 20] });

    // 2) 在地圖上畫出 bbox 矩形（用你的 drawLayer，保持「只留一個」）
    if (this.drawLayer) {
      this.drawLayer.clearLayers();

      const rect = L.rectangle(bounds, BBOX_STYLE) as L.Rectangle;
      this.applyBBoxStyleToLayer(rect);
      this.drawLayer.addLayer(rect);

      this.unbindBBoxRectEditEvents();
      this.bboxRect = rect;

      // Enable editing so user can drag corners/edges
      this.enableRectEditing();
      this.bindBBoxRectEditEvents();
    }

    // 3) 經由共用流程：清掉舊狀態、驗證、refreshPreviewIfReady
    const bbox = { south, west, north, east };
    console.log('[MapPicker] bbox set by input', bbox);

    this.applyBBoxChange(bbox, 'bbox-input');
  }

  applyBBoxSizeFromInput(): void {
    this.searchError = '';

    const widthM = Number(this.bboxWidthM);
    const heightM = Number(this.bboxHeightM);

    if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM <= 0 || heightM <= 0) {
      this.searchError = '請輸入有效的寬/高（公尺）。';
      return;
    }
    if (widthM > 1000 || heightM > 1000) {
      this.searchError = '寬/高上限為 1000m。';
      return;
    }

    const south = Number(this.bboxSouth);
    const west = Number(this.bboxWest);
    const north = Number(this.bboxNorth);
    const east = Number(this.bboxEast);
    if (![south, west, north, east].every(Number.isFinite) || north <= south || east <= west) {
      this.searchError = '請先輸入合法 bbox（South/West/North/East）。';
      return;
    }

    const centerMercX = (this.lonToMercX(west) + this.lonToMercX(east)) / 2;
    const centerMercY = (this.latToMercY(south) + this.latToMercY(north)) / 2;
    const halfWidth = widthM / 2;
    const halfHeight = heightM / 2;

    const newWest = this.mercXToLon(centerMercX - halfWidth);
    const newEast = this.mercXToLon(centerMercX + halfWidth);
    const newSouth = this.mercYToLat(centerMercY - halfHeight);
    const newNorth = this.mercYToLat(centerMercY + halfHeight);

    this.bboxWest = Number(newWest.toFixed(12));
    this.bboxEast = Number(newEast.toFixed(12));
    this.bboxSouth = Number(newSouth.toFixed(12));
    this.bboxNorth = Number(newNorth.toFixed(12));

    this.goToBBox();
  }

  selectSearchResult(r: { display_name: string; lat: string; lon: string }): void {
    const lat = Number(r.lat);
    const lng = Number(r.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('[MapPicker] invalid nominatim result', r);
      return;
    }

    // Keep center point and use compact default bbox size.
    const centerMercX = this.lonToMercX(lng);
    const centerMercY = this.latToMercY(lat);
    const halfW = this.SEARCH_DEFAULT_WIDTH_M / 2;
    const halfH = this.SEARCH_DEFAULT_HEIGHT_M / 2;

    this.bboxWest = this.mercXToLon(centerMercX - halfW);
    this.bboxEast = this.mercXToLon(centerMercX + halfW);
    this.bboxSouth = this.mercYToLat(centerMercY - halfH);
    this.bboxNorth = this.mercYToLat(centerMercY + halfH);
    this.bboxWidthM = this.SEARCH_DEFAULT_WIDTH_M;
    this.bboxHeightM = this.SEARCH_DEFAULT_HEIGHT_M;

    this.goToBBox();
    this.searchResults = [];
  }


  goToLatLng(): void {
  console.warn(
    '[MapPicker] goToLatLng() is deprecated. Redirecting to goToBBox().'
  );

    // 直接改走 bbox 流程，避免點/框兩套邏輯並存
    this.goToBBox();
  }

  private setMarkerAndView(lat: number, lng: number, zoom: number): void {
    if (!this.map) return;

    const ll = L.latLng(lat, lng);

    // marker
    if (this.locateMarker) {
      this.locateMarker.setLatLng(ll);
    } else {
      this.locateMarker = L.marker(ll);
      this.locateMarker.addTo(this.map);
    }

    this.map.setView(ll, zoom, { animate: true });
  }

}
