// src/app/pages/EditScene/components/map-scene/map-scene.component.ts
// 目的：把 MapTest 的核心地圖功能抽成可嵌入元件（Leaflet + Babylon + tile mosaic + Overpass + extrusion）
// 注意：本檔案為 Part 1（僅 skeleton），方法本體將在 Part 2/3 補齊。

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

import {
  MapCoordinateService,
  ReferencePoint,
} from 'src/app/services/map-coordinate.service';
import { MapGeneratorService, BBox } from 'src/app/services/map-generator.service';

type Mode = 'none' | 'place';

@Component({
  selector: 'app-map-scene',
  templateUrl: './map-scene.component.html',
  styleUrls: ['./map-scene.component.scss'],
})
export class MapSceneComponent implements AfterViewInit, OnDestroy {
  // ✅ DOM 以 ViewChild 取得（避免全域 id 衝突）
  @ViewChild('renderCanvas', { static: true })
  renderCanvas!: ElementRef<HTMLCanvasElement>;

  @ViewChild('leafletMap', { static: true })
  leafletMapEl!: ElementRef<HTMLDivElement>;

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
    private mapGen: MapGeneratorService
  ) {}

  // ---------------- Lifecycle ----------------

ngAfterViewInit(): void {
  this.initLeaflet();
  this.initBabylon();

  // ✅ 與 MapTest 一致：訂閱 refPoint（UI 顯示用）
  this.coord.refPoint$.subscribe((p) => (this.refPoint = p));

  // Leaflet 移動時，節流後重新截圖貼到 Babylon ground
  this.map.on('move', () => {
    if (this.lastBBox) {
      this.scheduleCaptureMapToGround(250);
    }
  });

  // 3D 點選事件（如果你 initBabylon 內已呼叫 bindBabylonPick，可留可不留）
  // this.bindBabylonPick();
}

ngOnDestroy(): void {
  try {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
    if (this.map) {
      this.map.off();
      this.map.remove();
    }
    if (this.engine) {
      this.engine.stopRenderLoop();
      this.engine.dispose();
    }
  } catch (e) {
    // TODO: 若 MapTest 原本有更完整的 destroy 流程，請在 Part3 補齊
    console.warn('[MapScene] destroy error', e);
  }
}

// ---------------- Leaflet ----------------

private initLeaflet(): void {
  // Leaflet 預設 icon 在 Angular 常見會 404（保留 MapTest 的修法）
  (L.Icon.Default as any).mergeOptions({
    iconRetinaUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  const mapEl = this.leafletMapEl.nativeElement;

  this.map = L.map(mapEl, {
    center: [25.033, 121.5654],
    zoom: 16,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(this.map);

  this.drawLayer = new L.FeatureGroup();
  this.map.addLayer(this.drawLayer);

  const drawControl = new L.Control.Draw({
    draw: {
      rectangle: {
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
      remove: true,
    },
  });
  this.map.addControl(drawControl);

  // created
  this.map.on(L.Draw.Event.CREATED as any, async (e: any) => {
    this.errorMsg = null;
    this.drawLayer.clearLayers();

    const layer = e.layer;
    this.drawLayer.addLayer(layer);

    const bounds: L.LatLngBounds = layer.getBounds();
    await this.onBBoxCreated(bounds);
  });

  // edited
  this.map.on(L.Draw.Event.EDITED as any, async (e: any) => {
    this.errorMsg = null;

    const layers = e.layers;
    let editedBounds: L.LatLngBounds | null = null;
    layers.eachLayer((l: any) => {
      if (!editedBounds && l.getBounds) editedBounds = l.getBounds();
    });

    if (editedBounds) await this.onBBoxCreated(editedBounds);
  });
}


// ---------------- Babylon ----------------

private initBabylon(): void {
  const canvas = this.renderCanvas.nativeElement;

  this.engine = new Engine(canvas, true, {
    alpha: true,  
    preserveDrawingBuffer: true,
    stencil: true,
  });

  this.scene = new Scene(this.engine);
  (window as any).__dbgScene = this.scene;

  this.scene.clearColor = new Color4(0, 0, 0, 0);  // ✅ 必須：透明
  this.scene.autoClear = false;                    // ✅ 必須：不清 color buffer
  this.scene.autoClearDepthAndStencil = true;      // ✅ 必須：仍清 depth/stencil

  this.camera = new ArcRotateCamera(
    'camera',
    Math.PI / 2,
    Math.PI / 3,
    200,
    Vector3.Zero(),
    this.scene
  );
  this.camera.attachControl(canvas, true);

  const light = new HemisphericLight(
    'light',
    new Vector3(0, 1, 0),
    this.scene
  );
  light.intensity = 0.9;

  this.bindBabylonPick();

  this.engine.runRenderLoop(() => {
    this.scene.render();
  });

  window.addEventListener('resize', () => {
    this.engine.resize();
  });
}

// ---------------- BBox & Capture ----------------

private async onBBoxCreated(bounds: L.LatLngBounds): Promise<void> {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const bbox: BBox = {
    south: sw.lat,
    west: sw.lng,
    north: ne.lat,
    east: ne.lng,
  };

  // ✅ refPoint 必須用「Mercator 中點」
  const centerLon = (bbox.west + bbox.east) / 2;

  const ySouth = this.coord.latToMercYPublic(bbox.south);
  const yNorth = this.coord.latToMercYPublic(bbox.north);
  const yMid = (ySouth + yNorth) / 2;
  const centerLat = this.coord.mercYToLat(yMid);

  // UI 顯示文字（MapTest 格式）
  this.bboxText = `S:${bbox.south.toFixed(6)} W:${bbox.west.toFixed(
    6
  )} N:${bbox.north.toFixed(6)} E:${bbox.east.toFixed(6)}`;

  // 避免框太大
  const dLat = Math.abs(bbox.north - bbox.south);
  const dLon = Math.abs(bbox.east - bbox.west);
  if (dLat > 0.02 || dLon > 0.02) {
    this.errorMsg = `框選範圍太大（dLat=${dLat.toFixed(
      4
    )}, dLon=${dLon.toFixed(4)}），請縮小再試。`;
    this.buildingCount = 0;
    return;
  }

  // ✅ 關鍵：先 setReferencePoint，後面所有座標轉換才正確
  this.coord.setReferencePoint(centerLat, centerLon);

  this.lastBBox = bbox;

  // ✅ 先建立對齊可視化（你後續需把 buildAlignmentHelpers 改成吃 bbox）
  // 若你目前 buildAlignmentHelpers() 沒參數，先暫時呼叫無參數版也行
  // this.buildAlignmentHelpers(bbox);
this.buildAlignmentHelpers(bbox);

  // ✅ 自動把 2D 地圖貼到 3D ground（delay 與 MapTest 同步）
  this.scheduleCaptureMapToGround(500);

  // 抓 OSM → 生成 3D（這段沿用 MapTest，沒有用不存在的方法）
  try {
    const data = await this.mapGen.getOSMData(bbox);

    this.clearBuildings();

    this.buildingMeshes = this.mapGen.generateBuildings(this.scene, data, bbox);
    this.buildingCount = this.buildingMeshes.length;

    this.logBuildingsVsBBox();
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
    console.error('[MapScene] getOSMData error =', err);
  }
}


private scheduleCaptureMapToGround(delayMs: number = 250): void {
  if (this.isCapturing) return;

  if (this.captureTimer) {
    clearTimeout(this.captureTimer);
  }

  this.captureTimer = setTimeout(async () => {
    this.isCapturing = true;
    try {
      await this.captureMapToGround();
    } finally {
      this.isCapturing = false;
    }
  }, delayMs);
}


private async captureMapToGround(): Promise<void> {
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

      const tileSize = 256;

      // 先算 tile 範圍（xMin/xMax/yMin/yMax）
      const { xMin, xMax, yMin, yMax } = this.bboxToTileRange(lastBBox, zoom);

      console.log('[MapTest] tile range', { xMin, xMax, yMin, yMax });

      const tilesX = xMax - xMin + 1;
      const tilesY = yMax - yMin + 1;

      // 將 lat/lon 映射到 global pixel（WebMercator）
      const lonToPixelX = (lon: number) => {
        const n = Math.pow(2, zoom);
        return ((lon + 180) / 360) * n * tileSize;
      };

      const latToPixelY = (lat: number) => {
        const n = Math.pow(2, zoom);
        const latRad = (lat * Math.PI) / 180;
        const y =
          (1 -
            Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
          2;
        return y * n * tileSize;
      };

      // bbox in global pixel space
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

      const ctx = dyn.getContext();

      // 逐張載入 tile 並畫到 DynamicTexture
      const total = tilesX * tilesY;
      let okCount = 0;
      let errCount = 0;

      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          await new Promise<void>((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
            img.src = url;

            img.onload = () => {
              const dx = (x - xMin) * tileSize;
              const dy = (y - yMin) * tileSize;
              ctx.drawImage(img, dx, dy, tileSize, tileSize);
              okCount++;

              if (okCount <= 3) {
                console.log('[2D2U4WJ6][TileOK sample]', { zoom, x, y, dx, dy, url });
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
      const cropWInt = Math.max(1, Math.round(cropW));
      const cropHInt = Math.max(1, Math.round(cropH));
      const cropLeftInt = Math.round(cropLeft);
      const cropTopInt = Math.round(cropTop);

      console.log('[CROP-APPLIED] bbox-only texture', { cropLeft: cropLeftInt, cropTop: cropTopInt, cropW: cropWInt, cropH: cropHInt });

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropWInt;
      cropCanvas.height = cropHInt;
      const cropCtx = cropCanvas.getContext('2d')!;
      cropCtx.drawImage(
        (dyn as any)._canvas,
        cropLeftInt,
        cropTopInt,
        cropWInt,
        cropHInt,
        0,
        0,
        cropWInt,
        cropHInt
      );

      // 再建立 bbox-only DynamicTexture
      const dynBBox = new DynamicTexture(
        'leaflet_bbox_texture',
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

      dynBBox.update();

      console.log('[2D2U4WJ6][BBoxTexture] ready', {
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

      // 把 bbox-only texture 指到 emissive
      mat.emissiveTexture = dynBBox;

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
      });

      const tex: any = mat.emissiveTexture;
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

    bboxToTileRange(bbox: BBox, zoom: number) {
    const sw = this.lonLatToTile(bbox.west, bbox.south, zoom);
    const ne = this.lonLatToTile(bbox.east, bbox.north, zoom);

    const xMin = Math.min(sw.x, ne.x);
    const xMax = Math.max(sw.x, ne.x);
    const yMin = Math.min(sw.y, ne.y);
    const yMax = Math.max(sw.y, ne.y);

    return { xMin, xMax, yMin, yMax };
  }

  lonLatToTile(lon: number, lat: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { x, y };
  }


// ---------------- Buildings / Overpass / Extrusion ----------------

private clearBuildings(): void {
  if (!this.buildingMeshes || this.buildingMeshes.length === 0) return;

  for (const m of this.buildingMeshes) {
    try {
      m.dispose();
    } catch {
      // noop
    }
  }
  this.buildingMeshes = [];
  this.buildingCount = 0;
}

// ---------------- Picking / Scaling ----------------

private bindBabylonPick(): void {
  if (!this.scene) return;

  this.scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;

    const pick = pointerInfo.pickInfo;
    if (!pick || !pick.hit || !pick.pickedMesh) return;

    const mesh = pick.pickedMesh as Mesh;

    // TODO: MapTest 中若有過濾條件（只允許 building meshes），請在此補上
    this.selectedBuilding = mesh;
  });
}

onHeightScaleChange(): void {
  if (!this.selectedBuilding) return;

  // TODO: MapTest 中若是用 metadata.height / baseHeight 計算，請照原邏輯搬
  this.selectedBuilding.scaling.y = this.heightScale;
}

// ---------------- Alignment / Helpers ----------------

private buildAlignmentHelpers(bbox: BBox): void {
  if (!this.scene) return;

  // 清舊 ground（避免重複）
  this.groundMesh?.dispose(false, true);
  this.groundMesh = null;

  // 1) 轉四角到 3D（沿用 MapTest 邏輯）
  const sw = this.coord.convertToVector3(bbox.south, bbox.west);
  const se = this.coord.convertToVector3(bbox.south, bbox.east);
  const ne = this.coord.convertToVector3(bbox.north, bbox.east);
  const nw = this.coord.convertToVector3(bbox.north, bbox.west);

  // 2) ground 尺寸（XZ）
  const width = Math.max(10, Math.abs(se.x - sw.x));
  const height = Math.max(10, Math.abs(nw.z - sw.z));
  const center = sw.add(ne).scale(0.5);

  // 3) 建立 ground，關鍵是要「賦值到 this.groundMesh」
  this.groundMesh = MeshBuilder.CreateGround(
    'bbox_ground',
    { width, height, updatable: true },
    this.scene
  );
  this.groundMesh.position = new Vector3(center.x, 0, center.z);

  // 4) 給一個基本材質（避免 ground 是黑/不可見）
  if (!this.groundMesh.material) {
    const gmat = new StandardMaterial('bbox_ground_mat', this.scene);
    gmat.diffuseColor = new Color3(0.12, 0.12, 0.13);
    gmat.specularColor = new Color3(0, 0, 0);
    this.groundMesh.material = gmat;
  }

  console.log('[MapScene][GroundBuild] created', {
    id: this.groundMesh.id,
    width,
    height,
    center: { x: center.x, z: center.z },
  });
}


private rebuildCornerSpheres(): void {
  for (const s of this.cornerSpheres) {
    try {
      s.dispose();
    } catch {
      // noop
    }
  }
  this.cornerSpheres = [];

  // TODO(Part4): 依 MapTest 的實際 corner points 建立小球 Mesh（尺寸/顏色一致）
}

// ---------------- Camera / Debug ----------------

private frameCameraToBuildings(): void {
  if (!this.camera || this.buildingMeshes.length === 0) return;

  // TODO: MapTest 中若使用 boundingInfo/extendVectors 計算 radius/target，請照搬
  // this.camera.target = center;
  // this.camera.radius = computedRadius;
}

private logBuildingsVsBBox(): void {
  // TODO: 之後要完全同步 MapTest 的 logBuildingsVsBBox(bbox) 版本再補齊
}

}


