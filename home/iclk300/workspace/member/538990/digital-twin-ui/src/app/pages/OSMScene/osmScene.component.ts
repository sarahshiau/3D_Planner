import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3,
  MeshBuilder, Color3, StandardMaterial, Color4
} from '@babylonjs/core';
import '@babylonjs/loaders';
import * as osmtogeojson from 'osmtogeojson';
import earcutImport from 'earcut';
import * as L from 'leaflet';

const earcut: any = (earcutImport as any).default ?? (earcutImport as any);
(window as any).earcut = earcut;

@Component({
  selector: 'app-osmScene',
  templateUrl: './osmScene.component.html',
  styleUrls: ['./osmScene.component.scss']
})
export class osmSceneComponent implements AfterViewInit {
  @ViewChild('renderCanvas', { static: false }) renderCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  engine!: Engine;
  scene!: Scene;
  camera!: ArcRotateCamera;

  loading = true;
  message = '載入地圖中...';

  private south = 22.6205;
  private west = 120.275;
  private north = 22.6270;
  private east = 120.2860;

  async ngAfterViewInit() {
    this.initLeafletMap();
    this.createBabylonScene();
    await this.loadOSMData(this.south, this.west, this.north, this.east);
    this.loading = false;
  }

  /** 初始化 Leaflet 地圖 */
  private initLeafletMap() {
    const centerLat = (this.south + this.north) / 2;
    const centerLon = (this.west + this.east) / 2;

    const map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([centerLat, centerLon], 17);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 0);
  }

  /** 建立 Babylon 場景 */
  private createBabylonScene() {
    const canvas = this.renderCanvas.nativeElement;

    // 透明背景
    this.engine = new Engine(canvas, true, { antialias: true, alpha: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0); // 透明背景讓底圖可見

    // 相機設定
    this.camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 150, Vector3.Zero(), this.scene);
    this.camera.attachControl(canvas, true);

    (this.camera as any)._useCtrlForPanning = false; // 不需按 Ctrl
    (this.camera as any)._panningMouseButton = 2;    // 右鍵平移
    this.camera.panningSensibility = 10;
    this.camera.panningInertia = 0.9;
    this.camera.panningAxis = new Vector3(1, 0, 1);
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.wheelPrecision = 50;
    this.camera.useNaturalPinchZoom = true;
    this.camera.lowerRadiusLimit = 0.1;
    this.camera.upperRadiusLimit = 1_000_000;

    const light = new HemisphericLight('light', new Vector3(0.5, 1, 0.3), this.scene);
    light.intensity = 1.4;

    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener('resize', () => this.engine.resize());
  }

  /** 經緯度轉 XY */
  private lonLatToXY(lon: number, lat: number, centerLon: number, centerLat: number): [number, number] {
    const R = 6378137;
    const dX = ((lon - centerLon) * Math.PI / 180) * R * Math.cos(centerLat * Math.PI / 180);
    const dY = ((lat - centerLat) * Math.PI / 180) * R;
    return [dX, dY];
  }

  /** 載入 OSM 建築資料 */
  private async loadOSMData(south: number, west: number, north: number, east: number) {
    const overpassUrls = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter'
    ];

    let raw: any = null;
    const query = `[out:json][timeout:25];(way["building"](${south},${west},${north},${east});relation["building"](${south},${west},${north},${east}););out body;>;out skel qt;`;

    for (const baseUrl of overpassUrls) {
      try {
        const res = await fetch(`${baseUrl}?data=${encodeURIComponent(query)}`);
        if (res.ok) {
          raw = await res.json();
          console.log(`成功從 ${baseUrl} 取得資料`);
          break;
        }
      } catch {}
    }

    if (!raw) throw new Error('所有 Overpass API 節點都無法連線');
    const geojson: any = (osmtogeojson as any)(raw);
    if (!geojson || !geojson.features?.length) return;

    if (!geojson.bbox) {
      const lons: number[] = [];
      const lats: number[] = [];
      for (const f of geojson.features) {
        const coords = f.geometry?.coordinates?.flat(2) || [];
        for (let i = 0; i < coords.length; i += 2) {
          lons.push(coords[i]);
          lats.push(coords[i + 1]);
        }
      }
      if (lons.length && lats.length) {
        geojson.bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
      }
    }

    await this.buildCityFromGeoJSON(geojson);
  }

  /** 建立建築模型 */
  private async buildCityFromGeoJSON(geojson: any) {
    if (!geojson.bbox || geojson.bbox.length < 4) return;

    const [minLon, minLat, maxLon, maxLat] = geojson.bbox;
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;

    let anyMesh = false;
    const allPts: Vector3[] = [];

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;

      const polys = geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : [];

      for (const poly of polys) {
        const ring = poly[0];
        if (!Array.isArray(ring) || ring.length < 3) continue;

        const shape = ring.map((p: number[]) => {
          const [x, z] = this.lonLatToXY(p[0], p[1], centerLon, centerLat);
          const v = new Vector3(x, 0, z);
          allPts.push(v);
          return v;
        });

        const hRaw = feature.properties?.height ?? feature.properties?.['building:levels'] ?? null;
        const height = hRaw
          ? Number(hRaw) * (feature.properties?.['building:levels'] ? 3.2 : 1)
          : 20 + Math.random() * 40;

        try {
          const mesh = (MeshBuilder as any).ExtrudePolygon('bld', { shape, depth: height, earcut }, this.scene);
          mesh.position.y = height / 2;

          const mat = new StandardMaterial('m', this.scene);
          mat.diffuseColor = new Color3(
            0.55 + Math.random() * 0.25,
            0.55 + Math.random() * 0.25,
            0.55 + Math.random() * 0.25
          );
          mesh.material = mat;
          anyMesh = true;
        } catch {}
      }
    }

    if (anyMesh && allPts.length) {
      const min = allPts.reduce((acc, v) => new Vector3(Math.min(acc.x, v.x), 0, Math.min(acc.z, v.z)), new Vector3(+Infinity, 0, +Infinity));
      const max = allPts.reduce((acc, v) => new Vector3(Math.max(acc.x, v.x), 0, Math.max(acc.z, v.z)), new Vector3(-Infinity, 0, -Infinity));

      const center = min.add(max).scale(0.5);
      const extX = max.x - min.x;
      const extZ = max.z - min.z;
      const diagonal = Math.max(extX, extZ);

      this.camera.setTarget(center);
      this.camera.radius = Math.max(200, diagonal * 0.9);
      this.camera.beta = Math.PI / 3;
    }
  }

  /** 匯出 GLB */
  exportGLB() {
    import('@babylonjs/serializers').then(({ GLTF2Export }) => {
      GLTF2Export.GLBAsync(this.scene, 'osm-scene').then(glb => glb.downloadFiles());
    });
  }
}
