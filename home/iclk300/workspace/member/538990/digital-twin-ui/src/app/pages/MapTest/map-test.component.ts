// src/app/pages/MapTest/map-test.component.ts
// 目的：
// - 左側 Leaflet 地圖：可畫矩形（BBox）
// - 畫完矩形後：自動更新中心點 → 抓 OSM → 右側 3D 生成建築
// - 右側 Babylon：可點選建築，並用 Slider 調整 mesh.scaling.y

import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

import * as L from 'leaflet';
import 'leaflet-draw';

import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  PointerEventTypes,
  LinesMesh,
  DynamicTexture,
  Texture,
} from '@babylonjs/core';

import { MapCoordinateService, ReferencePoint } from 'src/app/services/map-coordinate.service';
import { MapGeneratorService, BBox } from 'src/app/services/map-generator.service';

// 1. 修正匯入
import { SignalTestService } from 'src/app/services/signal-test.service';

type Mode = 'none' | 'place';

@Component({
  selector: 'app-map-test',
  templateUrl: './map-test.component.html',
  styleUrls: ['./map-test.component.scss'],
})
export class MapTestComponent implements AfterViewInit, OnDestroy {
  @ViewChild('renderCanvas', { static: true })
  renderCanvas!: ElementRef<HTMLCanvasElement>;

  // ---------- UI 狀態 ----------
  searchText = '';
  errorMsg: string | null = null;

  bboxText = '(尚未畫框)';
  buildingCount = 0;

  refPoint: ReferencePoint = { lat: 0, lon: 0 };

  selectedBuilding: Mesh | null = null;
  heightScale = 1;

  mode: Mode = 'none';

  private lastBBox: BBox | null = null;
  // ---------- Leaflet ----------
  private map!: L.Map;
  private drawLayer!: L.FeatureGroup;

  // ---------- Babylon ----------
  private engine!: Engine;
  private scene!: Scene;
  private camera!: ArcRotateCamera;

  private buildingMeshes: Mesh[] = [];

  // ✅ 貼圖更新節流：避免拖曳地圖時每一幀都截圖
  private captureTimer: any = null;
  private isCapturing = false;


  // 對齊可視化用（每次畫 BBox 都會重建）
  private groundMesh: Mesh | null = null;
  private bboxLines: LinesMesh | null = null;
  private centerCross: LinesMesh | null = null;

  private cornerSpheres: Mesh[] = [];

  constructor(
    private coord: MapCoordinateService,
    private mapGen: MapGeneratorService,
    private signalTest: SignalTestService // 注入
  ) {}

  ngAfterViewInit(): void {
    // 1) 初始化 Leaflet
    this.initLeaflet();

    // 2) 初始化 Babylon
    this.initBabylon();

    // 3) 訂閱中心點狀態（UI 顯示用）
    this.coord.refPoint$.subscribe((p) => (this.refPoint = p));

    // 4) 3D 點選事件
    this.bindBabylonPick();
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.scene) this.scene.dispose();
    if (this.engine) this.engine.dispose();
    window.removeEventListener('resize', this.onResize);
  }

  
  // -------------------- Leaflet --------------------

  private initLeaflet(): void {
    // Leaflet 預設 icon 在 Angular 常見會 404（因為打包路徑不同）
    // 這段是常見修法：把 icon 路徑改成 CDN 或你自己的 assets
    // 如果你不在意 marker icon（目前只畫框），可忽略此段。
    // 這裡保留以免你後續加 marker 時踩坑。
    (L.Icon.Default as any).mergeOptions({
      iconRetinaUrl:
        'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl:
        'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl:
        'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    this.map = L.map('leaflet-map', {
      center: [25.033, 121.5654], // 預設台北（你可改）
      zoom: 16,
    });

    // 底圖（OSM）
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    // 放 Draw 的圖層
    this.drawLayer = new L.FeatureGroup();
    this.map.addLayer(this.drawLayer);

    // Draw 控制項：只開 rectangle（BBox）
    const drawControl = new L.Control.Draw({
      draw: {
        rectangle: {
            // ✅ 關掉 tooltip（避免 leaflet.draw.js 內部 readableArea 觸發 type is not defined）
            // 目的：先確保矩形可以畫出來，後續再逐步恢復 tooltip/面積顯示
            showArea: false,
            metric: true,
            shapeOptions: { weight: 2 },
        },
        polygon: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    edit: {
      featureGroup: this.drawLayer,

      // ✅ 注意：leaflet-draw 的型別 edit 不是 boolean
      // 必須給「設定物件」或 false

      // remove 仍可用 boolean
      remove: true,
    },

    });
    this.map.addControl(drawControl);

    // 監聽畫完矩形事件
    this.map.on(L.Draw.Event.CREATED as any, async (e: any) => {
      this.errorMsg = null;

      // 清掉舊框（保持一次只有一個 BBox）
      this.drawLayer.clearLayers();

      const layer = e.layer;
      this.drawLayer.addLayer(layer);

      // 取得 bounds（BBox）
      const bounds: L.LatLngBounds = layer.getBounds();
      await this.onBBoxCreated(bounds);
    });

    // 監聽編輯後（拖曳縮放矩形後）重新生成
    this.map.on(L.Draw.Event.EDITED as any, async (e: any) => {
      this.errorMsg = null;

      // 編輯後可能有多個 layer，這裡取第一個
      const layers = e.layers;
      let editedBounds: L.LatLngBounds | null = null;
      layers.eachLayer((l: any) => {
        if (!editedBounds && l.getBounds) editedBounds = l.getBounds();
      });

      if (editedBounds) await this.onBBoxCreated(editedBounds);
    });

    // ✅ 保險：避免 leaflet-draw tooltip 的 runtime error 影響你畫框
    (this.map as any).on('draw:drawstart', () => {
        try {
            // noop 
        } catch {}
    });

  }

  /**
   * 畫完 BBox 後的主流程：
   * 1) 計算 bbox + center
   * 2) 更新 MapCoordinateService 中心點（2D/3D 對齊唯一基準）
   * 3) 呼叫 Overpass 抓 OSM
   * 4) 清掉舊建築 → generateBuildings 重建 3D
   */
  private async onBBoxCreated(bounds: L.LatLngBounds): Promise<void> {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const bbox: BBox = {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
    };

    // ✅ [Stage2-F] refPoint 必須用「Mercator 中點」而不是 lat 線性中點（否則建築與貼圖會在南北方向偏移）
    const centerLon = (bbox.west + bbox.east) / 2;

    // mercY 中點 → 反解回 lat（這才是「在 Mercator meter 空間」的幾何中心）
    const ySouth = this.coord.latToMercYPublic(bbox.south);
    const yNorth = this.coord.latToMercYPublic(bbox.north);
    const yMid = (ySouth + yNorth) / 2;
    const centerLat = this.coord.mercYToLat(yMid);

    // ✅ log：對照「線性中心」與「mercator 中心」
    const centerLatLinear = (bbox.south + bbox.north) / 2;
    console.log('[2D2U4WJ6][Stage2-F][RefCenterCompare]', {
      centerLatLinear,
      centerLatMercMid: centerLat,
      diffDeg: centerLat - centerLatLinear,
    });

    // UI 顯示文字
    this.bboxText = `S:${bbox.south.toFixed(6)} W:${bbox.west.toFixed(6)} N:${bbox.north.toFixed(
      6
    )} E:${bbox.east.toFixed(6)}`;

    // ✅ 建議：避免框太大造成 Overpass 超時
    // 若你希望自動縮框（例如縮成中心點周圍固定大小），可在此處做 bbox clamp
    const dLat = Math.abs(bbox.north - bbox.south);
    const dLon = Math.abs(bbox.east - bbox.west);
    if (dLat > 0.02 || dLon > 0.02) {
      this.errorMsg = `框選範圍太大（dLat=${dLat.toFixed(4)}, dLon=${dLon.toFixed(4)}），請縮小再試。`;
      this.buildingCount = 0;
      return;
    }

    // ✅ 關鍵：先更新中心點，後面轉座標才會用到正確 refPoint
    this.coord.setReferencePoint(centerLat, centerLon);

    // [2D2U4WJ6][Stage2-A] ✅ 第二階段入口：確認 refPoint 與 bbox（這是所有 2D/3D 對齊的唯一基準）
    console.log('[2D2U4WJ6][Stage2-A][RefPointSet]', {
      refPointNow: this.coord.refPoint,
      bbox,
      center: { lat: centerLat, lon: centerLon },
      mapZoom: this.map.getZoom(),
    });
    
    this.lastBBox = bbox;

    console.log('[2D2U4WJ6][BBoxCreated] bbox + center', {
      bbox,
      center: { lat: centerLat, lon: centerLon },
      mapZoom: this.map?.getZoom?.(),
    });

    // ✅ 先建立 3D 對齊可視化（地面 + BBox 邊框 + 中心十字）
    this.buildAlignmentHelpers(bbox);

    console.log('[2D2U4WJ6][BBoxCreated] alignment helpers built', {
      hasGround: !!this.groundMesh,
      groundId: this.groundMesh?.id,
      groundUniqueId: (this.groundMesh as any)?.uniqueId,
    });

    // ✅ 自動把 2D 地圖貼到 3D ground（等 tile 載入後再截圖）
    this.scheduleCaptureMapToGround(500);

    console.log('[2D2U4WJ6][BBoxCreated] scheduled capture', {
      delayMs: 500,
      lastBBox: this.lastBBox,
    });

    // 抓 OSM → 生成 3D
    try {
      const data = await this.mapGen.getOSMData(bbox);

      // 清掉舊建築
      this.clearBuildings();

      // 生成新建築
      this.buildingMeshes = this.mapGen.generateBuildings(this.scene, data, bbox);
      this.buildingCount = this.buildingMeshes.length;

      // [2D2U4WJ6][Stage2-B] ✅ 建築生成後立即做量化檢查：建築 extents 是否落在 bbox extents
      this.logBuildingsVsBBox(bbox);

      // [2D2U4WJ6][Stage2-B] ✅ 抽樣 1 棟建築中心點（確認建築整體是否偏移到 bbox 外）
      if (this.buildingMeshes.length > 0) {
        const m0 = this.buildingMeshes[0];
        const bb0 = m0.getBoundingInfo().boundingBox;
        const c0 = bb0.minimumWorld.add(bb0.maximumWorld).scale(0.5);

        console.log('[2D2U4WJ6][Stage2-B][BuildingSample]', {
          meshId: m0.id,
          meshName: m0.name,
          centerWorld: { x: c0.x, y: c0.y, z: c0.z },
          minWorld: { x: bb0.minimumWorld.x, z: bb0.minimumWorld.z },
          maxWorld: { x: bb0.maximumWorld.x, z: bb0.maximumWorld.z },
        });
      }

      this.logBuildingsVsBBox(bbox);

      // 自動對焦到建築群（避免生成了但鏡頭不在）
      this.frameCameraToBuildings();

      if (this.buildingCount === 0) {
        this.errorMsg =
          'BBox 內抓到 0 筆 building（可能選到空地，或該區建築未標 building）。請換個區域再畫框。';
      }
    } catch (err: any) {
      const msg =
        err?.status
          ? `Overpass 失敗：HTTP ${err.status} ${err.statusText ?? ''}`
          : `Overpass 失敗：${err?.message ?? '未知錯誤'}`;
      this.errorMsg = msg;
      console.error('[MapTest] getOSMData error =', err);
    }
  }

  onSearch(): void {
    // 先做 UI placeholder
    // 下一步可串 Nominatim 或你的內部地理服務，把結果 map.setView([lat,lon], zoom)
    console.log('[MapTest] search =', this.searchText);
    
  }

    /**
   * captureMapToGround：
   * - 把左側 Leaflet 地圖 DOM 截圖成一張 Canvas
   * - 再把 Canvas 畫到 Babylon 的 DynamicTexture 上
   * - 最後把這張 texture 指派給 ground 的 material.diffuseTexture
   *
   * 注意：
   * - Leaflet tile 是跨網域資源，必須用 useCORS + tiles server 允許 CORS
   * - OSM tile 通常可用，但若遇到 tainted canvas，你會在 console 看到錯誤
   */
  private lonLatToTile(lon: number, lat: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { x, y };
  }

  private bboxToTileRange(bbox: BBox, zoom: number) {
    const sw = this.lonLatToTile(bbox.west, bbox.south, zoom);
    const ne = this.lonLatToTile(bbox.east, bbox.north, zoom);

    const xMin = Math.min(sw.x, ne.x);
    const xMax = Math.max(sw.x, ne.x);
    const yMin = Math.min(sw.y, ne.y);
    const yMax = Math.max(sw.y, ne.y);

    return { xMin, xMax, yMin, yMax };
  }

  async captureMapToGround(): Promise<void> {
    console.log('[2D2U4WJ6][captureMapToGround] enter', {
      hasGround: !!this.groundMesh,
      hasMap: !!this.map,
      lastBBox: this.lastBBox,
    });

    if (!this.groundMesh) {
      console.log('[2D2U4WJ6][captureMapToGround] abort: no groundMesh');
      return;
    }

    try {
      const zoom = Math.min(19, this.map.getZoom() + 2);

      // 使用目前 bbox（由 buildAlignmentHelpers 建立）
      const lastBBox = this.lastBBox;
      if (!lastBBox) return;

      const { xMin, xMax, yMin, yMax } = this.bboxToTileRange(lastBBox, zoom);

      console.log('[2D2U4WJ6][TileRange]', {
        mapZoom: this.map.getZoom(),
        captureZoom: zoom,
        bbox: lastBBox,
        xMin, xMax, yMin, yMax,
        tilesX: xMax - xMin + 1,
        tilesY: yMax - yMin + 1,
      });

      const tilesX = xMax - xMin + 1;
      const tilesY = yMax - yMin + 1;

      console.log('[MapTest] tile range', { xMin, xMax, yMin, yMax });
      // [CHK-CROP-1] BBox pixel offset inside the stitched mosaic (needs fractional crop)
      const tileSize = 256;
      const n = Math.pow(2, zoom);

      const lonToPixelX = (lon: number) => ((lon + 180) / 360) * n * tileSize;
      const latToPixelY = (lat: number) => {
        const latRad = (lat * Math.PI) / 180;
        const merc = Math.log(Math.tan(latRad) + 1 / Math.cos(latRad));
        return (1 - merc / Math.PI) / 2 * n * tileSize;
      };

      const pxW = lonToPixelX(lastBBox.west);
      const pxE = lonToPixelX(lastBBox.east);
      const pyN = latToPixelY(lastBBox.north);
      const pyS = latToPixelY(lastBBox.south);

      // mosaic top-left pixel in global space
      const mosaicLeft = xMin * tileSize;
      const mosaicTop = yMin * tileSize;

      // bbox rect inside mosaic
      const cropLeft = pxW - mosaicLeft;
      const cropTop = pyN - mosaicTop;
      const cropW = (pxE - pxW);
      const cropH = (pyS - pyN);

      const texW = tilesX * tileSize;
      const texH = tilesY * tileSize;

      console.log('[2D2U4WJ6][CropCalc raw]', {
        cropLeft, cropTop, cropW, cropH,
        texW, texH,
        note: 'Expect: cropW/cropH > 0, and crop rect inside [0..texW],[0..texH]',
      });

      if (cropW <= 1 || cropH <= 1) {
        console.warn('[2D2U4WJ6][CropCalc] suspicious small crop size', { cropW, cropH });
      }

      // 建立拼貼用 DynamicTexture
      const dyn = new DynamicTexture(
        'leaflet_tile_mosaic',
        { width: texW, height: texH },
        this.scene,
        false
      );

      console.log('[2D2U4WJ6][Mosaic] dyn created', {
        texW,
        texH,
        dynName: (dyn as any).name,
      });

      const ctx = dyn.getContext();

      // 逐張載入 tile 並畫到 DynamicTexture
      let okCount = 0;
      let errCount = 0;
      const total = (xMax - xMin + 1) * (yMax - yMin + 1);

      console.log('[2D2U4WJ6][Tiles] start loading', { total });

      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

          await new Promise<void>((res) => {
            img.onload = () => {
              const dx = (x - xMin) * tileSize;
              const dy = (y - yMin) * tileSize;
              ctx.drawImage(img, dx, dy, tileSize, tileSize);

              okCount++;
              if (okCount <= 3) {
                console.log('[2D2U4WJ6][TileOK]', { zoom, x, y, dx, dy, url: img.src });
              }
              res();
            };

            img.onerror = () => {
              errCount++;
              console.warn('[2D2U4WJ6][TileERR]', { zoom, x, y, url: img.src, errCount });
              res();
            };

          });
        }
      }

      dyn.update();

      console.log(`[2D2U4WJ6][Tiles] finished total=${total} ok=${okCount} err=${errCount} okRatio=${total ? (okCount/total).toFixed(3) : 'n/a'}`);

      // ✅ Debug：檢查 mosaic canvas 是否真的有畫到像素（避免白圖）
      try {
        const sample = ctx.getImageData(10, 10, 1, 1).data;
        console.log('[2D2U4WJ6][DBG-MOSAIC-PIXEL]', { r: sample[0], g: sample[1], b: sample[2], a: sample[3] });
      } catch (e) {
        console.warn('[2D2U4WJ6][DBG-MOSAIC-PIXEL] blocked (tainted canvas likely)', e);
      }



      // ===== [NEW] Crop the mosaic into bbox-only texture (NO UV scaling) =====
      // 你已經算好的：cropLeft/cropTop/cropW/cropH、以及 texW/texH (mosaic size)
      // 如果你目前 cropW/cropH 是浮點，務必取整數避免瀏覽器 drawImage 的半像素誤差
      const cropWInt = Math.max(1, Math.round(cropW));
      const cropHInt = Math.max(1, Math.round(cropH));
      const cropLeftInt = Math.round(cropLeft);
      const cropTopInt = Math.round(cropTop);

      console.log('[2D2U4WJ6][CropCalc int]', {
        cropLeftInt, cropTopInt, cropWInt, cropHInt,
        mosaicSize: { texW, texH },
      });

      const cropRight = cropLeftInt + cropWInt;
      const cropBottom = cropTopInt + cropHInt;
      if (cropLeftInt < 0 || cropTopInt < 0 || cropRight > texW || cropBottom > texH) {
        console.warn('[2D2U4WJ6][CropCalc] crop out of mosaic bounds', {
          cropLeftInt, cropTopInt, cropRight, cropBottom, texW, texH
        });
      }

      // 用一個離屏 canvas 裁切 bbox 區塊
      const srcCanvas = ctx.canvas as HTMLCanvasElement; // mosaic 畫布
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropWInt;
      cropCanvas.height = cropHInt;

      const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
      if (!cropCtx) throw new Error('crop canvas 2d context not available');

      cropCtx.drawImage(
        srcCanvas,
        cropLeftInt, cropTopInt, cropWInt, cropHInt, // source rect in mosaic
        0, 0, cropWInt, cropHInt                      // dest rect
      );

      // 把裁切結果放進新的 DynamicTexture
      const dynBBox = new DynamicTexture(
        'leaflet_bbox_tex',
        { width: cropWInt, height: cropHInt },
        this.scene,
        false
      );
      const bboxCtx = dynBBox.getContext();

      bboxCtx.drawImage(cropCanvas, 0, 0);

      // ✅ 角點標記：用顏色直接標出 NW/NE/SE/SW
      const mark = (x: number, y: number, color: string, label: string) => {
        bboxCtx.fillStyle = color;
        bboxCtx.fillRect(x, y, 18, 18);
        bboxCtx.fillStyle = 'white';
        bboxCtx.font = '16px sans-serif';
        bboxCtx.fillText(label, x + 22, y + 16);
      };

    // 左上：NW（綠）
    mark(6, 22, 'green', 'NW');
    // 右上：NE（blue）
    mark(cropWInt - 60, 22, 'blue', 'NE');
    // 右下：SE（magenta）
    mark(cropWInt - 60, cropHInt - 10, 'magenta', 'SE');
    // 左下：SW（orange）
    mark(6, cropHInt - 10, 'orange', 'SW');

    console.log('[2D2U4WJ6][CornerMarks] painted on bbox texture');

      // // ✅ Debug：畫一個紅框與紅色對角線，肉眼一定看得出來
      // bboxCtx.strokeStyle = 'red';
      // bboxCtx.lineWidth = 8;
      // bboxCtx.strokeRect(0, 0, cropWInt, cropHInt);
      // bboxCtx.beginPath();
      // bboxCtx.moveTo(0, 0);
      // bboxCtx.lineTo(cropWInt, cropHInt);
      // bboxCtx.stroke();

      dynBBox.update();

      console.log('[2D2U4WJ6][TextureState] dynBBox final', {
        name: (dynBBox as any).name ?? null,
        isReady: (dynBBox as any).isReady?.() ?? null,
        size: (dynBBox as any).getSize?.() ?? null,
        uScale: (dynBBox as any).uScale,
        uOffset: (dynBBox as any).uOffset,
        vScale: (dynBBox as any).vScale,
        vOffset: (dynBBox as any).vOffset,
        wrapU: (dynBBox as any).wrapU,
        wrapV: (dynBBox as any).wrapV,
      });


      // ✅ DebugPlane：定位用，正式請關掉
      if (this.ENABLE_DEBUG_PLANE) {
        this.createDebugPlaneForTexture(dynBBox);
      } else {
        if (this.debugPlane) {
          console.log('[2D2U4WJ6][DebugPlane] dispose because disabled', {
            planeId: this.debugPlane.id,
            planeName: this.debugPlane.name,
          });
          this.debugPlane.dispose(false, true);
          this.debugPlane = null;
        } else {
          console.log('[2D2U4WJ6][DebugPlane] disabled (no plane)');
        }
      }

      console.log('[CROP-APPLIED] bbox-only texture', {
        cropLeft: cropLeftInt, cropTop: cropTopInt, cropW: cropWInt, cropH: cropHInt
      });

      // [2D2U4WJ6][Stage2-E1] ✅ 貼圖對位基準：bbox 對應到 texture 的像素尺寸（後面要拿來算 u/v → pixel）
      console.log('[2D2U4WJ6][Stage2-E1][TexBasis]', {
        bbox: lastBBox,
        crop: { cropLeftInt, cropTopInt, cropWInt, cropHInt },
        captureZoom: zoom,
        note: 'Later we will map a building lat/lon to (u,v) inside bbox, then to (px,py) inside this texture.',
      });

      try {
        const sample2 = bboxCtx.getImageData(10, 10, 1, 1).data;
        console.log('[2D2U4WJ6][DBG-BBOX-PIXEL]', { r: sample2[0], g: sample2[1], b: sample2[2], a: sample2[3] });
      } catch (e) {
        console.warn('[2D2U4WJ6][DBG-BBOX-PIXEL] blocked (tainted canvas likely)', e);
      }

      console.log('[2D2U4WJ6][Ground] before assign material', {
        groundId: this.groundMesh.id,
        groundUniqueId: (this.groundMesh as any).uniqueId,
        hasMaterial: !!this.groundMesh.material,
        materialName: (this.groundMesh.material as any)?.name ?? null,
      });

      // 指派給 ground（用 bbox-only texture，不做任何 UV 裁切/縮放）
      let mat = this.groundMesh.material as StandardMaterial;
      if (!mat) {
        mat = new StandardMaterial('bbox_ground_mat', this.scene);
        this.groundMesh.material = mat;
      }

      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);

      // ✅ 正式版：固定用 diffuseTexture
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);

      // 清空 emissive，避免 emissiveColor 造成白色誤判
      mat.emissiveTexture = null;
      mat.emissiveColor = new Color3(0, 0, 0);

      // 使用 diffuse
      mat.diffuseTexture = dynBBox;
      mat.diffuseColor = new Color3(1, 1, 1);

      console.log('[2D2U4WJ6][GroundTexMode] DIFFUSE(FINAL)', {
        diffuseTexName: (mat.diffuseTexture as any)?.name ?? null,
        emissiveTexName: (mat.emissiveTexture as any)?.name ?? null,
        disableLighting: mat.disableLighting,
      });

      // ground 可見性保險
      this.groundMesh.visibility = 1;
      this.groundMesh.isVisible = true;

      mat.backFaceCulling = false;

      // 確保 emissive 生效
      mat.emissiveColor = new Color3(1, 1, 1);
      mat.diffuseColor = new Color3(0, 0, 0);   // ✅ 讓 diffuse 不干擾
      mat.specularColor = new Color3(0, 0, 0);

      // 強制 ground 可見（避免透明或 visibility 被改）
      this.groundMesh.visibility = 1;
      this.groundMesh.isVisible = true;

      // ✅ Debug：確認 ground UV 是否正常（如果 UV 全 0，貼圖會變單色）
      const uvs = this.groundMesh.getVerticesData('uv');
      console.log('[DBG-GROUND-UV]', {
        hasUV: !!uvs,
        first8: uvs ? uvs.slice(0, 8) : null,
      });

      console.log('[DBG-GROUND-MESH]', {
        groundId: this.groundMesh.id,
        groundName: this.groundMesh.name,
        materialName: (this.groundMesh.material as any)?.name ?? null,
        emissiveTexName: ((this.groundMesh.material as any)?.emissiveTexture as any)?.name ?? null,
        size: { w: (dynBBox as any).getSize?.().width, h: (dynBBox as any).getSize?.().height },
      });


      // ✅ 新增：避免接縫 + 修正上下顛倒
      dynBBox.wrapU = Texture.CLAMP_ADDRESSMODE;
      dynBBox.wrapV = Texture.CLAMP_ADDRESSMODE;

      // ✅ 若你看到貼圖上下顛倒，這兩行必加（不算 UV 裁切，只是方向修正）
      dynBBox.vScale = -1;
      dynBBox.vOffset = 1;

      dynBBox.uScale = -1;
      dynBBox.uOffset = 1;

      console.log('[2D2U4WJ6][UVFix] applied U flip', {
        uScale: dynBBox.uScale,
        uOffset: dynBBox.uOffset,
        vScale: dynBBox.vScale,
        vOffset: dynBBox.vOffset,
      });

      console.log('[2D2U4WJ6][Ground] after assign texture', {
        materialName: (mat as any)?.name ?? null,
        emissiveTexName: ((mat as any)?.emissiveTexture as any)?.name ?? null,
        dynBBoxSize: { w: (dynBBox as any).getSize?.().width, h: (dynBBox as any).getSize?.().height },
        vScale: (dynBBox as any).vScale,
        vOffset: (dynBBox as any).vOffset,
        wrapU: (dynBBox as any).wrapU,
        wrapV: (dynBBox as any).wrapV,
        groundVisible: { isVisible: this.groundMesh.isVisible, visibility: this.groundMesh.visibility },
      });

      // ✅ 渲染後再檢查一次：避免「當下 log 有設到，但下一幀被覆蓋/失效」
      if (!this._postRenderCheckOnce) {
        this._postRenderCheckOnce = true;

        this.scene.onAfterRenderObservable.addOnce(() => {
          const m = this.groundMesh?.material as any;
          const tex = m?.emissiveTexture as any;

          console.log('[2D2U4WJ6][PostRenderCheck] ground material snapshot', {
            groundExists: !!this.groundMesh,
            groundId: this.groundMesh?.id,
            groundUniqueId: (this.groundMesh as any)?.uniqueId ?? null,
            materialName: m?.name ?? null,
            hasEmissiveTex: !!tex,
            emissiveTexName: tex?.name ?? null,
            emissiveTexIsReady: tex?.isReady?.() ?? null,
            emissiveTexSize: tex?.getSize?.() ?? null,
            emissiveColor: m?.emissiveColor ?? null,
            diffuseColor: m?.diffuseColor ?? null,
            disableLighting: m?.disableLighting ?? null,
          });
        });
      }

      const tex: any = mat.emissiveTexture;
      // ✅ 不要再改 uOffset/uScale/vScale/vOffset

      console.log('[MapTest] captureMapToGround success (tile mosaic)', {
        tilesX,
        tilesY,
        texW,
        texH,
      });
    } catch (e) {
      console.error('[MapTest] captureMapToGround mosaic failed', e);
    }
    
  }
  private ENABLE_DEBUG_PLANE = false; 
  private debugPlane: Mesh | null = null;

  private _postRenderCheckOnce = false;

  private USE_DIFFUSE_FOR_GROUND_DEBUG = false;

  private createDebugPlaneForTexture(tex: Texture): void {
    // 清掉舊 plane（避免越來越多）
    this.debugPlane?.dispose(false, true);

    const plane = MeshBuilder.CreatePlane('dbg_plane_tex', { size: 30 }, this.scene);
    plane.position = new Vector3(0, 20, 0);
    plane.billboardMode = 7; // BillboardMode.ALL

    const mat = new StandardMaterial('dbg_plane_mat', this.scene);
    mat.disableLighting = true;
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0, 0, 0);

    plane.material = mat;
    this.debugPlane = plane;

    console.log('[2D2U4WJ6][DebugPlane] created', {
      planeId: plane.id,
      texName: (tex as any)?.name ?? null,
    });

    // ✅ 下一幀檢查 plane 的貼圖是否 ready
    this.scene.onAfterRenderObservable.addOnce(() => {
      const t: any = tex as any;
      console.log('[2D2U4WJ6][DebugPlane][PostRenderCheck]', {
        texName: t?.name ?? null,
        isReady: t?.isReady?.() ?? null,
        size: t?.getSize?.() ?? null,
      });
    });

  }

    /**
   * scheduleCaptureMapToGround：
   * - 用 setTimeout 做節流（debounce）
   * - 地圖拖曳/縮放/編輯框選時會觸發多次事件，避免一直截圖
   */
  private scheduleCaptureMapToGround(delayMs: number = 300): void {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      console.log('[2D2U4WJ6][Debounce] clear previous timer');
    }

    const scheduledAt = Date.now();
    const groundUniqueIdAtSchedule = (this.groundMesh as any)?.uniqueId ?? null;
    const bboxAtSchedule = this.lastBBox;

    console.log('[2D2U4WJ6][Debounce] schedule capture', {
      delayMs,
      scheduledAt,
      groundUniqueIdAtSchedule,
      bboxAtSchedule,
      isCapturing: this.isCapturing,
    });

    this.captureTimer = setTimeout(async () => {
      console.log('[2D2U4WJ6][Debounce] timer fired', {
        firedAt: Date.now(),
        waitedMs: Date.now() - scheduledAt,
        isCapturing: this.isCapturing,
        groundUniqueIdNow: (this.groundMesh as any)?.uniqueId ?? null,
        groundUniqueIdAtSchedule,
        bboxNow: this.lastBBox,
        bboxAtSchedule,
      });

      // 避免並發
      if (this.isCapturing) {
        console.log('[2D2U4WJ6][Debounce] skip: already capturing');
        return;
      }

      // ground 在 debounce 期間被 dispose/recreate，直接放棄這次（避免貼錯或貼到舊 mesh）
      if (!this.groundMesh) {
        console.log('[2D2U4WJ6][Debounce] skip: groundMesh missing');
        return;
      }
      const groundUniqueIdNow = (this.groundMesh as any)?.uniqueId ?? null;
      if (groundUniqueIdAtSchedule !== null && groundUniqueIdNow !== groundUniqueIdAtSchedule) {
        console.log('[2D2U4WJ6][Debounce] skip: ground changed during debounce', {
          groundUniqueIdAtSchedule,
          groundUniqueIdNow,
        });
        return;
      }

      this.isCapturing = true;
      console.log('[2D2U4WJ6][Capture] START', {
        groundId: this.groundMesh.id,
        groundUniqueIdNow,
        bbox: this.lastBBox,
        mapZoom: this.map?.getZoom?.(),
      });

      try {
        await this.captureMapToGround();
        console.log('[2D2U4WJ6][Capture] DONE');
      } catch (e) {
        console.error('[2D2U4WJ6][Capture] FAILED (uncaught)', e);
      } finally {
        this.isCapturing = false;
        console.log('[2D2U4WJ6][Capture] END isCapturing=false');
      }
    }, delayMs);
  }


  // -------------------- Babylon --------------------

  private initBabylon(): void {
    const canvas = this.renderCanvas.nativeElement;

    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.06, 1);

    this.camera = new ArcRotateCamera(
      'cam',
      Math.PI / 2,
      Math.PI / 3,
      250,
      Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);

    new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    if (this.engine) this.engine.resize();
  };

  private bindBabylonPick(): void {
    // Babylon 的 pick 事件：點選建築 → 顯示 slider
    this.scene.onPointerObservable.add((p) => {
      if (p.type !== PointerEventTypes.POINTERDOWN) return;

      const pick = p.pickInfo;
      if (!pick?.hit || !pick.pickedMesh) return;

      const mesh = pick.pickedMesh as Mesh;

      // 只允許選取我們生成的建築（metadata.type === 'osm_building'）
      if (mesh?.metadata?.type !== 'osm_building') return;

      this.selectedBuilding = mesh;

      // slider 與 mesh 同步
      this.heightScale = mesh.scaling.y;
    });
  }

  onHeightScaleChange(value: number): void {
    this.heightScale = value;
    if (!this.selectedBuilding) return;

    // scaling.y 立即生效（因為 pivot 已鎖底部，所以只會往上長）
    this.selectedBuilding.scaling.y = this.heightScale;
  }

  setModePlace(): void {
    this.mode = 'place';
    // 下一步（你已經做過）可以在這裡加入「點表面放天線」流程
    console.log('[MapTest] mode = place');
  }

  startSim(): void {
    // 下一步可串你的 Ray / Pathloss / Heatmap
    console.log('[MapTest] start sim');
  }

  private clearBuildings(): void {
    for (const m of this.buildingMeshes) {
      m.dispose(false, true);
    }
    this.buildingMeshes = [];
    this.selectedBuilding = null;
    this.buildingCount = 0;
  }

  /**
   * buildAlignmentHelpers：
   * 在 3D 場景中畫出：
   * - Ground（以 BBox 範圍為尺寸）
   * - BBox 邊框線（可視化 2D 框選在 3D 的投影）
   * - 中心十字（顯示 reference point 對齊）
   *
   * 這一步的目的不是貼圖，而是「肉眼驗證對齊」：
   * - 建築是否落在 BBox 範圍內
   * - reference point 是否在畫面中心
   * - 經緯度 → 公尺換算比例是否合理
   */
  private buildAlignmentHelpers(bbox: BBox): void {
    // 先清掉舊的 helper
    this.groundMesh?.dispose(false, true);
    this.bboxLines?.dispose(false, true);
    this.centerCross?.dispose(false, true);

    // 1) 計算 BBox 四角在 3D 的位置（以 refPoint 為原點）
    const sw = this.coord.convertToVector3(bbox.south, bbox.west); // 左下
    const se = this.coord.convertToVector3(bbox.south, bbox.east); // 右下
    const ne = this.coord.convertToVector3(bbox.north, bbox.east); // 右上
    const nw = this.coord.convertToVector3(bbox.north, bbox.west); // 左上

    // [CHK-PROJ-1] Compare MapCoordinateService (equirect) vs Leaflet CRS (web mercator meters)
    const crs: any = (this.map as any)?.options?.crs;
    if (crs?.project) {
      const pSW = crs.project(L.latLng(bbox.south, bbox.west));
      const pSE = crs.project(L.latLng(bbox.south, bbox.east));
      const pNW = crs.project(L.latLng(bbox.north, bbox.west));

      const w_equirect = Math.abs(se.x - sw.x);
      const h_equirect = Math.abs(nw.z - sw.z);

      const w_merc = Math.abs(pSE.x - pSW.x);
      const h_merc = Math.abs(pNW.y - pSW.y); // note: mercator y grows southward in many impl

      console.log('[CHK-PROJ-1] meter width/height compare', {
        equirect: { w: w_equirect, h: h_equirect },
        mercator: { w: w_merc, h: h_merc },
        ratio: { w: w_equirect / w_merc, h: h_equirect / h_merc },
      });
    } else {
      console.log('[CHK-PROJ-1] Leaflet CRS project() not available');
    }

    // 2) 地面尺寸（以公尺計）
    const width = Math.max(10, Math.abs(se.x - sw.x));
    const height = Math.max(10, Math.abs(nw.z - sw.z));

    // 地面中心（四角平均）
    const center = sw.add(ne).scale(0.5);

    // 3) 建立 Ground（XZ 平面）
    this.groundMesh = MeshBuilder.CreateGround(
      'bbox_ground',
      { width, height, updatable: true },
      this.scene
    );
    this.groundMesh.position = new Vector3(center.x, 0, center.z);

    // [CHK-UV-1] Check axis direction: in our coord, north should be +z. Verify ground corners.
    const halfW = width / 2;
    const halfH = height / 2;

    // ground corners in world (assuming no rotation)
    const gCenter = this.groundMesh.position;
    const gSW = new Vector3(gCenter.x - halfW, 0, gCenter.z - halfH);
    const gNE = new Vector3(gCenter.x + halfW, 0, gCenter.z + halfH);

    console.log('[2D2U4WJ6][GroundBuild] created', {
      groundId: this.groundMesh.id,
      groundUniqueId: (this.groundMesh as any).uniqueId,
      width,
      height,
      center: { x: center.x, z: center.z },
    });

    console.log('[CHK-UV-1] ground corners vs bbox vectors', {
      bboxVectors: {
        sw: { x: sw.x, z: sw.z },
        ne: { x: ne.x, z: ne.z },
      },
      groundWorld: {
        sw: { x: gSW.x, z: gSW.z },
        ne: { x: gNE.x, z: gNE.z },
      },
      note: 'If bbox.ne.z > bbox.sw.z but ground NE.z does not reflect “north”, your V axis likely needs flip (vScale negative + vOffset adjust).'
    });

    // ✅ ground 初始材質：只在第一次沒有 material 時建立，避免覆蓋貼圖材質
    if (!this.groundMesh.material) {
      const gmat = new StandardMaterial('bbox_ground_mat', this.scene);
      gmat.diffuseColor = new Color3(0.12, 0.12, 0.13);
      gmat.specularColor = new Color3(0, 0, 0);
      this.groundMesh.material = gmat;
    }

    // 4) 建立 BBox 邊框（LinesMesh 才有 color）
    const bboxPts = [
      new Vector3(sw.x, 0.05, sw.z),
      new Vector3(se.x, 0.05, se.z),
      new Vector3(ne.x, 0.05, ne.z),
      new Vector3(nw.x, 0.05, nw.z),
      new Vector3(sw.x, 0.05, sw.z),
    ];

    this.bboxLines = MeshBuilder.CreateLines(
      'bbox_lines',
      { points: bboxPts },
      this.scene
    );
    this.bboxLines.color = new Color3(1, 0.75, 0.2);

    // 5) 中心十字：reference point = (0,0,0)
    const s = Math.max(5, Math.min(width, height) * 0.06);

    const crossX = MeshBuilder.CreateLines(
      'center_cross_x',
      { points: [new Vector3(-s, 0.06, 0), new Vector3(s, 0.06, 0)] },
      this.scene
    );
    crossX.color = new Color3(0.2, 0.9, 0.9);

    const crossZ = MeshBuilder.CreateLines(
      'center_cross_z',
      { points: [new Vector3(0, 0.06, -s), new Vector3(0, 0.06, s)] },
      this.scene
    );
    crossZ.color = new Color3(0.2, 0.9, 0.9);

    // 用一個欄位管理（centerCross）並在 dispose 時連動清理 crossZ
    this.centerCross = crossX;
    this.centerCross.onDisposeObservable.add(() => {
      crossZ.dispose(false, true);
    });
  }


  private rebuildCornerSpheres(bbox: BBox): void {
    // 清掉舊球
    for (const s of this.cornerSpheres) s.dispose(false, true);
    this.cornerSpheres = [];

    const sw = this.coord.convertToVector3(bbox.south, bbox.west);
    const se = this.coord.convertToVector3(bbox.south, bbox.east);
    const ne = this.coord.convertToVector3(bbox.north, bbox.east);
    const nw = this.coord.convertToVector3(bbox.north, bbox.west);

    const add = (name: string, p: Vector3, color: Color3) => {
      const s = MeshBuilder.CreateSphere(name, { diameter: 2 }, this.scene);
      s.position = new Vector3(p.x, 1.0, p.z);
      const m = new StandardMaterial(name + '_mat', this.scene);
      m.disableLighting = true;
      m.diffuseColor = color;
      m.emissiveColor = color;
      s.material = m;
      this.cornerSpheres.push(s);
    };

    // NW 綠、NE 藍、SE 紫、SW 橘（和貼圖標記一致）
    add('corner_NW', nw, new Color3(0, 1, 0));
    add('corner_NE', ne, new Color3(0.2, 0.4, 1));
    add('corner_SE', se, new Color3(1, 0, 1));
    add('corner_SW', sw, new Color3(1, 0.5, 0));

    console.log('[2D2U4WJ6][CornerSpheres] rebuilt', {
      nw: { x: nw.x, z: nw.z },
      ne: { x: ne.x, z: ne.z },
      se: { x: se.x, z: se.z },
      sw: { x: sw.x, z: sw.z },
    });
  }
  private frameCameraToBuildings(): void {
    if (this.buildingMeshes.length === 0) return;

    let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (const m of this.buildingMeshes) {
      const bb = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bb.minimumWorld);
      max = Vector3.Maximize(max, bb.maximumWorld);
    }

    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);
    const radius = Math.max(size.x, size.y, size.z) * 1.2;

    this.camera.setTarget(center);
    this.camera.radius = Math.max(30, radius);
  }

  private logBuildingsVsBBox(bbox: BBox): void {
    if (!this.buildingMeshes || this.buildingMeshes.length === 0) {
      console.log('[2D2U4WJ6][AlignCheck] no buildings to compare');
      return;
    }

    // BBox 在 3D 空間的範圍（以 reference point 為原點）
    const sw = this.coord.convertToVector3(bbox.south, bbox.west);
    const ne = this.coord.convertToVector3(bbox.north, bbox.east);

    const bboxMinX = Math.min(sw.x, ne.x);
    const bboxMaxX = Math.max(sw.x, ne.x);
    const bboxMinZ = Math.min(sw.z, ne.z);
    const bboxMaxZ = Math.max(sw.z, ne.z);

    // 建築群 bounding box
    let bMinX = Number.POSITIVE_INFINITY;
    let bMaxX = Number.NEGATIVE_INFINITY;
    let bMinZ = Number.POSITIVE_INFINITY;
    let bMaxZ = Number.NEGATIVE_INFINITY;

    for (const m of this.buildingMeshes) {
      const bb = m.getBoundingInfo().boundingBox;
      bMinX = Math.min(bMinX, bb.minimumWorld.x);
      bMaxX = Math.max(bMaxX, bb.maximumWorld.x);
      bMinZ = Math.min(bMinZ, bb.minimumWorld.z);
      bMaxZ = Math.max(bMaxZ, bb.maximumWorld.z);
    }

    console.log('[2D2U4WJ6][AlignCheck] BBox vs Buildings extents', {
      bbox: {
        minX: bboxMinX,
        maxX: bboxMaxX,
        minZ: bboxMinZ,
        maxZ: bboxMaxZ,
        width: bboxMaxX - bboxMinX,
        height: bboxMaxZ - bboxMinZ,
      },
      buildings: {
        minX: bMinX,
        maxX: bMaxX,
        minZ: bMinZ,
        maxZ: bMaxZ,
        width: bMaxX - bMinX,
        height: bMaxZ - bMinZ,
      },
      delta: {
        minX: bMinX - bboxMinX,
        maxX: bMaxX - bboxMaxX,
        minZ: bMinZ - bboxMinZ,
        maxZ: bMaxZ - bboxMaxZ,
      },
    });
  }

  
}
