// src/app/services/map-generator.service.ts
// 目的：
// - getOSMData(bbox)：呼叫 Overpass API 抓 OSM 建築資料
// - generateBuildings(scene, data)：解析 Overpass JSON，ExtrudePolygon 生成 Babylon Mesh
// - 每個建築要：
//   1) mesh.metadata 存「原始高度、衰減參數、OSM tags」
//   2) pivot 在底部（確保 scaling.y 調整高度只往上長）

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  Quaternion,
  StandardMaterial,
  Color3,
  VertexBuffer,
} from '@babylonjs/core';

import { MapCoordinateService } from './map-coordinate.service';

import earcutImport from 'earcut';
const earcut: any = (earcutImport as any).default ?? (earcutImport as any);
declare const window: any;
window.earcut = earcut;

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

@Injectable({ providedIn: 'root' })
export class MapGeneratorService {
    private readonly OVERPASS_URLS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.nchc.org.tw/api/interpreter',
    ];


  constructor(
    private http: HttpClient,
    private coord: MapCoordinateService
  ) {}

  /**
   * getOSMData：
   * - 使用 BBox 抓取 building 的 way（入門版：先不處理 relation multipolygon）
   * - 使用 out geom 直接取得 geometry 座標列
   */
    async getOSMData(bbox: BBox): Promise<any> {
        // ✅ 防呆：bbox 太大很容易 504 / 回傳超慢
        // 建議：經度/緯度範圍各自不要超過 ~0.01（約 1km 級）
        const dLat = Math.abs(bbox.north - bbox.south);
        const dLon = Math.abs(bbox.east - bbox.west);
        if (dLat > 0.02 || dLon > 0.02) {
        throw new Error(
            `BBox 太大（dLat=${dLat.toFixed(4)}, dLon=${dLon.toFixed(4)}），Overpass 容易超時。請縮小框選範圍（建議 < 0.02）。`
        );
        }

        const query = this.buildOverpassQuery(bbox);

        const body = `data=${encodeURIComponent(query)}`;
        const headers = new HttpHeaders({
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        });

        let lastErr: any = null;

        // ✅ 輪詢多個 Overpass 站點（避免單點 504）
        for (const url of this.OVERPASS_URLS) {
        try {
            const resp = await lastValueFrom(
            this.http.post(url, body, { headers, responseType: 'json' })
            );
            return resp;
        } catch (err) {
            lastErr = err;
            // 504/429 很常見，直接換下一個 endpoint
            continue;
        }
        }

        throw lastErr ?? new Error('Overpass 全部 endpoint 失敗');
    }


  /**
   * generateBuildings：
   * - 解析 Overpass JSON elements
   * - 將每個 way.geometry（lat/lon）轉成「相對中心點」的 Vector3
   * - ExtrudePolygon(depth=height) 生成 Mesh
   */
  generateBuildings(scene: Scene, data: any, bbox?: BBox): Mesh[] {

    // [2D2U4WJ6][Stage2-D0] ✅ generateBuildings 入口：確認當下 refPoint（必須等於 bbox center）
    console.log('[2D2U4WJ6][Stage2-D0][GenerateEnter]', {
      refPointNow: this.coord.refPoint,
      elements: data?.elements?.length ?? 0,
    });

    const meshes: Mesh[] = [];

    const elements: any[] = data?.elements ?? [];
    const ways = elements.filter((e) => e.type === 'way' && e.geometry?.length && e.tags?.building);

    for (const w of ways) {
      const tags = w.tags ?? {};
      const osmId = `way/${w.id}`;

      // 1) 建築高度（公尺）：height > building:levels*3 > 預設
      const baseHeightM = this.extractHeightMeters(tags);

      // 2) 「衰減參數」示範：你後續做 pathloss/penetration 可直接用 metadata 讀
      // 這裡先放一個入門值（可依材質/建築類型改）
      const attenuation = this.estimateAttenuation(tags);

      // [2D2U4WJ6][Stage2-C] ✅ 檢查該 building 的原始 lat/lon 是否在 bbox 內（Overpass out geom 理論上要在內）
      const geom = w.geometry as any[];
      let rawMinLat = Number.POSITIVE_INFINITY;
      let rawMaxLat = Number.NEGATIVE_INFINITY;
      let rawMinLon = Number.POSITIVE_INFINITY;
      let rawMaxLon = Number.NEGATIVE_INFINITY;

      for (const p of geom) {
        rawMinLat = Math.min(rawMinLat, p.lat);
        rawMaxLat = Math.max(rawMaxLat, p.lat);
        rawMinLon = Math.min(rawMinLon, p.lon);
        rawMaxLon = Math.max(rawMaxLon, p.lon);
      }

      // 如果 bbox 是你畫框那個：它在 MapTestComponent 裡，不在 service。
      // 所以這裡只先印 raw 範圍，待會在 component 端用 bbox 對照也可。
      // 若你想在 service 端直接比較 bbox，需把 bbox 傳進 generateBuildings。
      console.log('[2D2U4WJ6][Stage2-C][RawLatLonExtents]', {
        osmId,
        raw: { minLat: rawMinLat, maxLat: rawMaxLat, minLon: rawMinLon, maxLon: rawMaxLon },
        refPointNow: this.coord.refPoint,
        note: 'If lat≈121 or lon≈25 then swapped. If extents are far from bbox area, Overpass data or bbox mismatch.',
      });

      // 3) lat/lon -> local Vector3（以 MapCoordinateService 的中心點為基準）
      const disableMirror = (window as any).__dbgDisableBuildingMirror === true;
      if ((meshes.length === 0) && bbox) {
        // 每次 generateBuildings 進來時打一筆模式 log（一次即可）
        console.log('[DBG][BuildingMirrorMode]', { disableMirror });
      }

      const shape = (w.geometry as any[])
        .map((p) => this.coord.convertToVector3(p.lat, p.lon))
        .map((v) => {
          // Debug-only mirror switch: NOT a final fix, just to validate whether (-x,-z)
          // is the root cause of building/ground/heatmap misalignment.
          const final = disableMirror ? new Vector3(v.x, 0, v.z) : new Vector3(v.x, 0, v.z);
          return final;
        });

      // [DBG][BuildingPointAlign] 檢查單一代表點在 bbox-UV 與 localXZ 的對位情形
      // 目的：驗證 (-x,-z) 是否造成 building 對 ground texture 的鏡射
      if (bbox && (meshes.length % 50) === 0) { // 每 50 棟印一次，避免洗版
        const p0 = (w.geometry as any[])[0];
        const rawLocal = this.coord.convertToVector3(p0.lat, p0.lon);
        const finalLocalForMesh = disableMirror
          ? new Vector3(rawLocal.x, 0, rawLocal.z)
          : new Vector3(-rawLocal.x, 0, -rawLocal.z);

        // u: 0..1 (west->east), v: 0..1 (north->south)
        const u = (p0.lon - bbox.west) / (bbox.east - bbox.west);
        const v = (bbox.north - p0.lat) / (bbox.north - bbox.south);

        console.log('[DBG][BuildingPointAlign]', {
          osmId,
          lat: p0.lat,
          lon: p0.lon,
          uv: { u, v },
          rawLocalFromCoord: { x: rawLocal.x, z: rawLocal.z },
          finalLocalForMesh: { x: finalLocalForMesh.x, z: finalLocalForMesh.z },
          disableMirror,
          refPointNow: this.coord.refPoint,
        });
      }

      const cleaned = this.removeDuplicateClosingPoint(shape);
      if (cleaned.length < 3) continue;
      const footprintRect = this.computeBuildingRectFromFootprint(cleaned);

      // [2D2U4WJ6][Stage2-D] ✅ 檢查此 building 在「local meters」座標系下的範圍（用來定位是否 Z 方向相反或尺度爆掉）
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;

      for (const v of cleaned) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z);
        maxZ = Math.max(maxZ, v.z);
      }

      /** Footprint center in the same local XZ space as ExtrudePolygon `shape` (obstacle tuple x/y plane). */
      const finalLocalForMesh = {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
      };

      // 只印少量，避免洗版：例如每 30 棟印一次
      if ((meshes.length % 30) === 0) {
        console.log('[2D2U4WJ6][Stage2-D][LocalXZExtents]', {
          osmId,
          local: { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ },
          refPointNow: this.coord.refPoint,
          samplePoint0: cleaned[0] ? { x: cleaned[0].x, z: cleaned[0].z } : null,
          note: 'If local values are huge (thousands+) while bbox is ~100m, refPoint timing or conversion mismatch. If Z sign seems inverted vs ground, consider z = -mercY delta in MapCoordinateService.',
        });
      }

      // 4) ExtrudePolygon：depth 沿 +Y 擠出（高度）
      const mesh = MeshBuilder.ExtrudePolygon(
        `building_${osmId}`,
        { shape: cleaned, depth: Math.max(1, baseHeightM) },
        scene
      );

      // 5) 材質（先統一色，後續可依 tags/material 分類）
      const mat = new StandardMaterial(`mat_${osmId}`, scene);
      mat.diffuseColor = new Color3(0.75, 0.75, 0.78);
      // [UX] Lift building readability without making it glossy
      mat.emissiveColor = new Color3(0.12, 0.12, 0.12);
      mat.specularColor = Color3.Black();
      mat.specularPower = 16;
      mesh.material = mat;

      // 6) metadata：存 OSM tags + 原始高度 + 衰減參數
      // 你後續點選建築、計算穿透/遮擋，全部都從 mesh.metadata 取
      mesh.metadata = {
        type: 'osm_building',
        osmId,
        tags,
        baseHeightM,
        attenuation, // ✅ 衰減參數（示範）
        createdAtISO: new Date().toISOString(),
        /** Obstacle payload: tuple x = local x, tuple y = local z (aligned with extruded footprint). */
        finalLocalForMesh,
        width: footprintRect?.width ?? null,
        length: footprintRect?.length ?? null,
        angle: footprintRect?.angle ?? null,
      };

      if (footprintRect) {
        console.log('[BuildingRect][FootprintRect]', {
          osmId,
          width: footprintRect.width,
          length: footprintRect.length,
          angle: footprintRect.angle,
          pointCount: cleaned.length,
        });
      }

      mesh.computeWorldMatrix(true);
      const srcBb = mesh.getBoundingInfo().boundingBox;
      const srcWorldSize = {
        x: (srcBb.maximumWorld?.x ?? 0) - (srcBb.minimumWorld?.x ?? 0),
        z: (srcBb.maximumWorld?.z ?? 0) - (srcBb.minimumWorld?.z ?? 0),
      };
      const srcLocalSize = {
        x: (srcBb.maximum?.x ?? 0) - (srcBb.minimum?.x ?? 0),
        z: (srcBb.maximum?.z ?? 0) - (srcBb.minimum?.z ?? 0),
      };
      console.log('[BuildingRect][Source]', {
        rowId: null,
        osmId,
        meshName: mesh.name,
        worldCenter: {
          x: srcBb.centerWorld?.x ?? null,
          z: srcBb.centerWorld?.z ?? null,
        },
        bboxWorldSize: srcWorldSize,
        bboxLocalSize: srcLocalSize,
        meshRotationY: mesh.rotation?.y ?? 0,
        metadataWidth: (mesh.metadata as any)?.width ?? null,
        metadataLength: (mesh.metadata as any)?.length ?? null,
        metadataAngle: (mesh.metadata as any)?.angle ?? null,
      });

      // 7) ✅ Pivot 設在底部：確保 scaling.y 調整高度時「底部固定，只往上長」
      // 原理：
      // - scaling/rotation 以 pivot 為中心
      // - pivot 若在中心，縮放會往上+往下
      // - pivot 鎖底部，縮放只會往上變高/變矮，貼地不亂跑
      const bi = mesh.getBoundingInfo();
      const localMinY = bi.boundingBox.minimum.y;
      mesh.setPivotPoint(new Vector3(0, localMinY, 0));
      mesh.position.y -= localMinY;

      // [NS_PROBE] One-shot: same sampled vertex + N/S + world + E/W (first building only; logs only).
      if (meshes.length === 0 && geom.length > 0 && cleaned.length > 0) {
        const p0 = geom[0];
        const rawLocal0 = this.coord.convertToVector3(p0.lat, p0.lon);
        const v0 = cleaned[0];
        const applyVertexMirror = (vx: Vector3) =>
          disableMirror ? new Vector3(vx.x, 0, vx.z) : new Vector3(vx.x, 0, vx.z);

        console.log('[NS_PROBE][BUILD_PLACE_VERTEX]', {
          osmId,
          // 1–3 same sampled vertex (geom[0] → cleaned[0])
          latLon: { lat: p0.lat, lon: p0.lon },
          convertedWorldXZ: { x: rawLocal0.x, z: rawLocal0.z },
          rawLocalFromCoord: { x: rawLocal0.x, z: rawLocal0.z },
          // 4 footprint center stored on metadata; sampled vertex footprint point:
          finalLocalForMesh: { x: finalLocalForMesh.x, z: finalLocalForMesh.z },
          sampledVertex_finalLocalXZ: { x: v0.x, z: v0.z },
          // 5–6
          meshPosition: {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
          },
          disableMirrorFlag: disableMirror,
          note: 'convertedWorldXZ === rawLocalFromCoord. sampledVertex_finalLocalXZ is first cleaned polygon point for that lat/lon.',
        });

        let pMinLat = geom[0];
        let pMaxLat = geom[0];
        for (const p of geom) {
          if (p.lat < pMinLat.lat) pMinLat = p;
          if (p.lat > pMaxLat.lat) pMaxLat = p;
        }
        const latSpread = pMaxLat.lat - pMinLat.lat;
        if (latSpread > 1e-9) {
          const rawSouth = this.coord.convertToVector3(pMinLat.lat, pMinLat.lon);
          const rawNorth = this.coord.convertToVector3(pMaxLat.lat, pMaxLat.lon);
          const finalSouth = applyVertexMirror(rawSouth);
          const finalNorth = applyVertexMirror(rawNorth);
          console.log('[NS_PROBE][BUILD_PLACE_NORTH_SOUTH_PAIR]', {
            osmId,
            southernVertex: {
              latLon: { lat: pMinLat.lat, lon: pMinLat.lon },
              rawLocalFromCoord: { x: rawSouth.x, z: rawSouth.z },
              finalLocalForMeshZ_vertexAfterMirror: finalSouth.z,
            },
            northernVertex: {
              latLon: { lat: pMaxLat.lat, lon: pMaxLat.lon },
              rawLocalFromCoord: { x: rawNorth.x, z: rawNorth.z },
              finalLocalForMeshZ_vertexAfterMirror: finalNorth.z,
            },
            latitudeOrdering_north_gt_south: pMaxLat.lat > pMinLat.lat,
            finalLocalZOrdering_north_gt_south: finalNorth.z > finalSouth.z,
            zOrderingMatchesLatitudeOrdering:
              (finalNorth.z > finalSouth.z) === (pMaxLat.lat > pMinLat.lat),
          });
        } else {
          console.log('[NS_PROBE][BUILD_PLACE_NORTH_SOUTH_PAIR]', {
            osmId,
            skipped: true,
            reason: 'footprint lat spread ~0; pick another way or use bbox corners',
            latSpread,
          });
        }

        mesh.computeWorldMatrix(true);
        const biW = mesh.getBoundingInfo();
        const bbMnW = biW.boundingBox.minimumWorld;
        const bbMxW = biW.boundingBox.maximumWorld;
        const bbCenterL = biW.boundingBox.center;
        const bbCenterW = biW.boundingBox.centerWorld;
        const absPos = mesh.getAbsolutePosition();

        const posArr = mesh.getVerticesData(VertexBuffer.PositionKind);
        let firstVertexLocal: { x: number; y: number; z: number } | null = null;
        let firstVertexWorld: { x: number; y: number; z: number } | null = null;
        if (posArr && posArr.length >= 3) {
          const lv = new Vector3(posArr[0], posArr[1], posArr[2]);
          firstVertexLocal = { x: lv.x, y: lv.y, z: lv.z };
          const wv = Vector3.TransformCoordinates(lv, mesh.getWorldMatrix());
          firstVertexWorld = { x: wv.x, y: wv.y, z: wv.z };
        }

        const footprintCentroidLocal = {
          x: finalLocalForMesh.x,
          y: bbCenterL.y,
          z: finalLocalForMesh.z,
        };
        const wm = mesh.getWorldMatrix();
        const footprintCentroidWorldVec = Vector3.TransformCoordinates(
          new Vector3(footprintCentroidLocal.x, footprintCentroidLocal.y, footprintCentroidLocal.z),
          wm
        );

        const floorMesh = this.findFloorLikeMeshForProbe(scene);
        let floorProbe: Record<string, unknown> = { found: false as const };
        if (floorMesh) {
          floorMesh.computeWorldMatrix(true);
          const fbi = floorMesh.getBoundingInfo();
          const fMin = fbi.boundingBox.minimumWorld;
          const fMax = fbi.boundingBox.maximumWorld;
          const eps = 1.0;
          const insideX =
            bbMnW.x >= fMin.x - eps && bbMxW.x <= fMax.x + eps;
          const insideZ =
            bbMnW.z >= fMin.z - eps && bbMxW.z <= fMax.z + eps;
          const overlapsX = !(bbMxW.x < fMin.x || bbMnW.x > fMax.x);
          const overlapsZ = !(bbMxW.z < fMin.z || bbMnW.z > fMax.z);
          const cx = (bbMnW.x + bbMxW.x) / 2;
          const cz = (bbMnW.z + bbMxW.z) / 2;
          const fcx = (fMin.x + fMax.x) / 2;
          const fcz = (fMin.z + fMax.z) / 2;
          floorProbe = {
            found: true,
            floorName: floorMesh.name,
            floorMinimumWorld: { x: fMin.x, y: fMin.y, z: fMin.z },
            floorMaximumWorld: { x: fMax.x, y: fMax.y, z: fMax.z },
            buildingVsFloorCenterDelta: { x: cx - fcx, z: cz - fcz },
            buildingInsideFloorAabb_loose1m: { insideX, insideZ, both: insideX && insideZ },
            buildingOverlapsFloorAabbXZ: { overlapsX, overlapsZ, both: overlapsX && overlapsZ },
            note: 'Mesh not yet parented to buildingsRoot in preview; world = scene-root chain.',
          };
        }

        console.log('[NS_PROBE][BUILD_WORLD_PLACE]', {
          osmId,
          meshPosition: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          meshAbsolutePosition: { x: absPos.x, y: absPos.y, z: absPos.z },
          meshParentName: mesh.parent?.name ?? null,
          boundingBoxMinimumWorld: { x: bbMnW.x, y: bbMnW.y, z: bbMnW.z },
          boundingBoxMaximumWorld: { x: bbMxW.x, y: bbMxW.y, z: bbMxW.z },
          firstVertexLocal: firstVertexLocal,
          firstVertexWorld: firstVertexWorld,
          footprintCentroidLocalXZ: { x: finalLocalForMesh.x, z: finalLocalForMesh.z },
          footprintCentroidLocal_withY: footprintCentroidLocal,
          meshBoundingBoxCenterLocal: { x: bbCenterL.x, y: bbCenterL.y, z: bbCenterL.z },
          meshBoundingBoxCenterWorld: { x: bbCenterW.x, y: bbCenterW.y, z: bbCenterW.z },
          footprintCentroidWorld_fromXZ_timesYlocal: {
            x: footprintCentroidWorldVec.x,
            y: footprintCentroidWorldVec.y,
            z: footprintCentroidWorldVec.z,
          },
          floorGround: floorProbe,
        });

        let pMinLon = geom[0];
        let pMaxLon = geom[0];
        for (const p of geom) {
          if (p.lon < pMinLon.lon) pMinLon = p;
          if (p.lon > pMaxLon.lon) pMaxLon = p;
        }
        const lonSpread = pMaxLon.lon - pMinLon.lon;
        if (lonSpread > 1e-12) {
          const rawWest = this.coord.convertToVector3(pMinLon.lat, pMinLon.lon);
          const rawEast = this.coord.convertToVector3(pMaxLon.lat, pMaxLon.lon);
          const finalWest = applyVertexMirror(rawWest);
          const finalEast = applyVertexMirror(rawEast);
          const baseY = firstVertexLocal?.y ?? 0;
          const wWest = Vector3.TransformCoordinates(
            new Vector3(finalWest.x, baseY, finalWest.z),
            wm
          );
          const wEast = Vector3.TransformCoordinates(
            new Vector3(finalEast.x, baseY, finalEast.z),
            wm
          );
          console.log('[NS_PROBE][BUILD_PLACE_EAST_WEST_PAIR]', {
            osmId,
            westernVertex: {
              latLon: { lat: pMinLon.lat, lon: pMinLon.lon },
              finalLocalX_vertexAfterMirror: finalWest.x,
            },
            easternVertex: {
              latLon: { lat: pMaxLon.lat, lon: pMaxLon.lon },
              finalLocalX_vertexAfterMirror: finalEast.x,
            },
            longitudeOrdering_east_gt_west: pMaxLon.lon > pMinLon.lon,
            finalLocalXOrdering_east_gt_west: finalEast.x > finalWest.x,
            worldXOrdering_east_gt_west: wEast.x > wWest.x,
            xOrderingMatchesLongitudeOrdering:
              (finalEast.x > finalWest.x) === (pMaxLon.lon > pMinLon.lon),
            worldXOrderingMatchesLongitudeOrdering:
              (wEast.x > wWest.x) === (pMaxLon.lon > pMinLon.lon),
            worldXWest: wWest.x,
            worldXEast: wEast.x,
          });
        } else {
          console.log('[NS_PROBE][BUILD_PLACE_EAST_WEST_PAIR]', {
            osmId,
            skipped: true,
            reason: 'footprint lon spread ~0',
            lonSpread,
          });
        }

        // --- Coordinate-frame diagnosis (no fixes): floor vs geo vs building root/pivot ---
        const diag: Record<string, unknown> = { osmId };
        const fMeshDiag = this.findFloorLikeMeshForProbe(scene);

        let floorWorldEffective: {
          anyNegativeWorldScale: boolean;
          approx180DegWorldYaw: boolean;
          worldEulerDeg: { x: number; y: number; z: number };
        } | null = null;

        if (fMeshDiag) {
          fMeshDiag.computeWorldMatrix(true);
          const fbb = fMeshDiag.getBoundingInfo().boundingBox;
          const fMn = fbb.minimumWorld;
          const fMx = fbb.maximumWorld;
          const fCx = (fMn.x + fMx.x) / 2;
          const fCy = (fMn.y + fMx.y) / 2;
          const fCz = (fMn.z + fMx.z) / 2;
          const toDeg = (r: number) => (r * 180) / Math.PI;

          const wmFloor = fMeshDiag.getWorldMatrix();
          const wScale = new Vector3();
          const wRot = new Quaternion();
          const wTrans = new Vector3();
          wmFloor.decompose(wScale, wRot, wTrans);
          const wEulerRad = wRot.toEulerAngles();
          const wEulerDeg = {
            x: toDeg(wEulerRad.x),
            y: toDeg(wEulerRad.y),
            z: toDeg(wEulerRad.z),
          };
          const anyNegativeWorldScale = wScale.x < 0 || wScale.y < 0 || wScale.z < 0;
          const wy = wEulerDeg.y;
          const approx180DegWorldYaw =
            Math.abs(Math.abs(wy) - 180) < 5 || Math.abs(Math.abs(wy) - 360) < 5;
          floorWorldEffective = {
            anyNegativeWorldScale,
            approx180DegWorldYaw,
            worldEulerDeg: wEulerDeg,
          };

          const parentChain: Array<{
            name: string;
            className: string;
            position: { x: number; y: number; z: number };
            rotationEulerDeg: { x: number; y: number; z: number };
            scaling: { x: number; y: number; z: number };
          }> = [];
          for (let node: any = fMeshDiag; node; node = node.parent) {
            parentChain.push({
              name: typeof node.name === 'string' ? node.name : '',
              className: typeof node.getClassName === 'function' ? node.getClassName() : 'Node',
              position: { x: node.position.x, y: node.position.y, z: node.position.z },
              rotationEulerDeg: {
                x: toDeg(node.rotation?.x ?? 0),
                y: toDeg(node.rotation?.y ?? 0),
                z: toDeg(node.rotation?.z ?? 0),
              },
              scaling: {
                x: node.scaling?.x ?? 1,
                y: node.scaling?.y ?? 1,
                z: node.scaling?.z ?? 1,
              },
            });
          }

          diag.mapPreviewGround_effectiveWorldTransform = {
            parentChain_meshToRoot: parentChain,
            worldMatrixDecompose_translation: { x: wTrans.x, y: wTrans.y, z: wTrans.z },
            worldMatrixDecompose_scale: { x: wScale.x, y: wScale.y, z: wScale.z },
            worldMatrixDecompose_rotationQuaternion: {
              x: wRot.x,
              y: wRot.y,
              z: wRot.z,
              w: wRot.w,
            },
            worldMatrixDecompose_rotationEulerDeg_fromQuaternion: wEulerDeg,
            note_eulerFromQuaternion:
              'from Quaternion.toEulerAngles() (Babylon internal order); use for yaw magnitude, not gimbal-critical exact axes.',
            flags: {
              anyNegativeWorldScale,
              approx180DegWorldYaw,
            },
            localNodeRotationEulerDeg_forComparison: {
              x: toDeg(fMeshDiag.rotation.x),
              y: toDeg(fMeshDiag.rotation.y),
              z: toDeg(fMeshDiag.rotation.z),
            },
            localNodeScaling_forComparison: {
              x: fMeshDiag.scaling.x,
              y: fMeshDiag.scaling.y,
              z: fMeshDiag.scaling.z,
            },
          };

          diag.floorGroundWorldBbox = {
            minimumWorld: { x: fMn.x, y: fMn.y, z: fMn.z },
            maximumWorld: { x: fMx.x, y: fMx.y, z: fMx.z },
            centerWorld: { x: fCx, y: fCy, z: fCz },
            meshName: fMeshDiag.name,
            floorPosition: {
              x: fMeshDiag.position.x,
              y: fMeshDiag.position.y,
              z: fMeshDiag.position.z,
            },
            floorScaling: {
              x: fMeshDiag.scaling.x,
              y: fMeshDiag.scaling.y,
              z: fMeshDiag.scaling.z,
            },
            floorRotationEulerRad: {
              x: fMeshDiag.rotation.x,
              y: fMeshDiag.rotation.y,
              z: fMeshDiag.rotation.z,
            },
            floorRotationEulerDeg: {
              x: toDeg(fMeshDiag.rotation.x),
              y: toDeg(fMeshDiag.rotation.y),
              z: toDeg(fMeshDiag.rotation.z),
            },
          };
          diag.buildingVsFloorCenterDelta = {
            x: bbCenterW.x - fCx,
            z: bbCenterW.z - fCz,
            y: bbCenterW.y - fCy,
          };
        } else {
          diag.floorGroundWorldBbox = { found: false };
          diag.buildingVsFloorCenterDelta = null;
        }

        if (bbox?.south != null && bbox?.north != null && bbox?.east != null && bbox?.west != null) {
          const swG = this.coord.convertToVector3(bbox.south, bbox.west);
          const seG = this.coord.convertToVector3(bbox.south, bbox.east);
          const neG = this.coord.convertToVector3(bbox.north, bbox.east);
          const nwG = this.coord.convertToVector3(bbox.north, bbox.west);

          const midNorth = {
            x: (nwG.x + neG.x) / 2,
            z: (nwG.z + neG.z) / 2,
          };
          const midSouth = {
            x: (swG.x + seG.x) / 2,
            z: (swG.z + seG.z) / 2,
          };
          const midEast = {
            x: (neG.x + seG.x) / 2,
            z: (neG.z + seG.z) / 2,
          };
          const midWest = {
            x: (nwG.x + swG.x) / 2,
            z: (nwG.z + swG.z) / 2,
          };
          const vecNorthScene = { x: midNorth.x - midSouth.x, z: midNorth.z - midSouth.z };
          const vecEastScene = { x: midEast.x - midWest.x, z: midEast.z - midWest.z };

          const widthM = Math.abs(seG.x - swG.x);
          const depthM = Math.abs(nwG.z - swG.z);
          const ctrScene = {
            x: (swG.x + neG.x) / 2,
            z: (swG.z + neG.z) / 2,
          };
          const expectedMinCornerFromCenteredGround = {
            x: ctrScene.x - widthM / 2,
            z: ctrScene.z - depthM / 2,
          };
          const expectedMaxCornerFromCenteredGround = {
            x: ctrScene.x + widthM / 2,
            z: ctrScene.z + depthM / 2,
          };

          diag.geoCornerMapping_sceneSpace_sameAsMapCoordinate = {
            SW: { lat: bbox.south, lon: bbox.west, x: swG.x, z: swG.z },
            SE: { lat: bbox.south, lon: bbox.east, x: seG.x, z: seG.z },
            NE: { lat: bbox.north, lon: bbox.east, x: neG.x, z: neG.z },
            NW: { lat: bbox.north, lon: bbox.west, x: nwG.x, z: nwG.z },
          };
          diag.worldDirectionFromGeo_inSceneSpace = {
            vectorFromSouthMidToNorthMid: vecNorthScene,
            vectorFromWestMidToEastMid: vecEastScene,
            interpretation: {
              increasingLatitude_trends_scene:
                vecNorthScene.z > Math.abs(vecNorthScene.x) * 0.5
                  ? `primarily +sceneZ (Δz=${vecNorthScene.z.toFixed(3)})`
                  : vecNorthScene.z < -Math.abs(vecNorthScene.x) * 0.5
                    ? `primarily -sceneZ (Δz=${vecNorthScene.z.toFixed(3)})`
                    : `mixed X/Z (Δx=${vecNorthScene.x.toFixed(3)}, Δz=${vecNorthScene.z.toFixed(3)})`,
              increasingLongitude_trends_scene:
                vecEastScene.x > Math.abs(vecEastScene.z) * 0.5
                  ? `primarily +sceneX (Δx=${vecEastScene.x.toFixed(3)})`
                  : vecEastScene.x < -Math.abs(vecEastScene.z) * 0.5
                    ? `primarily -sceneX (Δx=${vecEastScene.x.toFixed(3)})`
                    : `mixed X/Z (Δx=${vecEastScene.x.toFixed(3)}, Δz=${vecEastScene.z.toFixed(3)})`,
            },
            note: 'Scene X/Z here = MapCoordinateService.convertToVector3 (WebMercator delta from ref). Not Babylon world until meshes are positioned.',
          };

          diag.mapPreviewStyleGroundExtents_fromGeo = {
            widthM,
            depthM,
            centerSceneXZ: ctrScene,
            expectedMinCornerScene_ifCenteredGroundXZ: expectedMinCornerFromCenteredGround,
            expectedMaxCornerScene_ifCenteredGroundXZ: expectedMaxCornerFromCenteredGround,
          };

          diag.cameraVsGeoNorth_secondary = this.buildCameraVsGeoNorthProbe(scene, vecNorthScene);

          if (fMeshDiag) {
            const fbb = fMeshDiag.getBoundingInfo().boundingBox;
            const fMn = fbb.minimumWorld;
            const fMx = fbb.maximumWorld;
            diag.floorWorldVsGeoCorners = {
              delta_floorMinWorld_minus_geoSW: {
                dx: fMn.x - swG.x,
                dz: fMn.z - swG.z,
              },
              delta_floorMaxWorld_minus_geoNE: {
                dx: fMx.x - neG.x,
                dz: fMx.z - neG.z,
              },
              delta_floorMinWorld_minus_expectedCenteredMin: {
                dx: fMn.x - expectedMinCornerFromCenteredGround.x,
                dz: fMn.z - expectedMinCornerFromCenteredGround.z,
              },
              note: 'Axis-aligned world AABB vs geo points: if yaw≠0, AABB corners ≠ oriented quad corners. Use floorCornerWorld_fromLocalQuad below.',
            };

            const lbb = fMeshDiag.getBoundingInfo().boundingBox;
            const ly = lbb.minimum.y;
            const floorLocalQuad = [
              { id: 'local_minX_minZ', p: new Vector3(lbb.minimum.x, ly, lbb.minimum.z) },
              { id: 'local_maxX_minZ', p: new Vector3(lbb.maximum.x, ly, lbb.minimum.z) },
              { id: 'local_maxX_maxZ', p: new Vector3(lbb.maximum.x, ly, lbb.maximum.z) },
              { id: 'local_minX_maxZ', p: new Vector3(lbb.minimum.x, ly, lbb.maximum.z) },
            ];
            const fWm = fMeshDiag.getWorldMatrix();
            const floorCornerWorld_fromLocalQuad = floorLocalQuad.map((q) => {
              const w = Vector3.TransformCoordinates(q.p, fWm);
              return { id: q.id, x: w.x, y: w.y, z: w.z };
            });

            const geoCorners = [
              { id: 'geo_SW', x: swG.x, z: swG.z },
              { id: 'geo_SE', x: seG.x, z: seG.z },
              { id: 'geo_NE', x: neG.x, z: neG.z },
              { id: 'geo_NW', x: nwG.x, z: nwG.z },
            ];

            const nearestFloorCornerToEachGeo = geoCorners.map((g) => {
              let bestId = floorCornerWorld_fromLocalQuad[0].id;
              let bestD = Infinity;
              for (const c of floorCornerWorld_fromLocalQuad) {
                const d = Math.hypot(c.x - g.x, c.z - g.z);
                if (d < bestD) {
                  bestD = d;
                  bestId = c.id;
                }
              }
              return {
                geoId: g.id,
                nearestFloorLocalCornerId: bestId,
                distXZ_m: bestD,
              };
            });

            const avgMatchDist =
              nearestFloorCornerToEachGeo.reduce((s, r) => s + r.distXZ_m, 0) /
              Math.max(1, nearestFloorCornerToEachGeo.length);

            const ryDeg = (fMeshDiag.rotation.y * 180) / Math.PI;
            const near180Yaw =
              Math.abs(Math.abs(ryDeg) - 180) < 4 || Math.abs(Math.abs(ryDeg) - 360) < 4;
            const near90Yaw =
              Math.abs(Math.abs(ryDeg) - 90) < 4 || Math.abs(Math.abs(ryDeg) - 270) < 4;

            diag.floorCornerWorld_fromLocalQuad = floorCornerWorld_fromLocalQuad;
            diag.nearestFloorCornerToEachGeo = nearestFloorCornerToEachGeo;
            diag.avgGeoToFloorCornerMatchDistXZ_m = avgMatchDist;

            diag.reversalHypotheses_readOnly = {
              summary:
                'Compare rotation/scaling to nearest-corner distances. Buildings/heatmap math use MapCoordinate scene XZ; mapPreviewGround uses centered CreateGround + this transform.',
              floorLocalYawDeg: ryDeg,
              possible180DegYaw_localEuler: near180Yaw,
              possible90DegYaw_localEuler: near90Yaw,
              negativeLocalScaleIndicatesMirror: {
                scaleXNegative: fMeshDiag.scaling.x < 0,
                scaleZNegative: fMeshDiag.scaling.z < 0,
              },
              effectiveWorldFromDecompose:
                floorWorldEffective != null
                  ? {
                      anyNegativeWorldScale: floorWorldEffective.anyNegativeWorldScale,
                      approx180DegWorldYaw: floorWorldEffective.approx180DegWorldYaw,
                      worldEulerDeg: floorWorldEffective.worldEulerDeg,
                    }
                  : null,
              centeredGround_vs_geoOrigin:
                'buildGroundFromBBox positions ground at (sw+ne)/2 with width=|se-sw|, depth=|nw-sw|; vertices use same coord service without that offset — not SW-origin vs center mismatch by itself if transforms match.',
              ifAvgMatchDistSmall_m:
                avgMatchDist < 2
                  ? 'Oriented floor quad corners align with geo corners → reversal likely texture/heatmap UV, not floor placement.'
                  : avgMatchDist >= 2
                    ? 'Floor world quad still far from geo in XZ after transform → floor rotation/scale/position vs geo frame is primary suspect for full-scene flip.'
                    : 'unknown',
            };

            const MATCH_THRESH_M = 2;
            const cornerIds = nearestFloorCornerToEachGeo.map((r) => r.nearestFloorLocalCornerId);
            const distinctNearestCorners = new Set(cornerIds).size;
            const quadAlignedA =
              avgMatchDist < MATCH_THRESH_M && distinctNearestCorners === 4;
            const transformSuspiciousB =
              floorWorldEffective != null &&
              (floorWorldEffective.anyNegativeWorldScale ||
                floorWorldEffective.approx180DegWorldYaw ||
                fMeshDiag.scaling.x < 0 ||
                fMeshDiag.scaling.z < 0 ||
                near180Yaw);

            let primaryVerdict: string;
            if (!quadAlignedA && transformSuspiciousB) {
              primaryVerdict =
                'floor_transform_wrong: oriented quad does not land on geo corners AND world/local scale or yaw looks mirrored or ~180° — treat floor/parent chain as primary.';
            } else if (!quadAlignedA && !transformSuspiciousB) {
              primaryVerdict =
                'floor_transform_suspect: quad mismatch without obvious negative scale / 180° yaw — check parentChain translation, non-uniform scale, or wrong mesh in findFloorLikeMeshForProbe.';
            } else if (quadAlignedA && transformSuspiciousB) {
              primaryVerdict =
                'ambiguous: corners align numerically but decomposition flags yaw/negative scale — inspect parentChain and quaternion euler ambiguity; secondary: texture.';
            } else {
              primaryVerdict =
                'floor_aligned_with_geo: prefer heatmap_texture_or_plotly_babylon_UV_convention next; camera is interpretation-only.';
            }

            diag.coordFrameVerdict_readOnly = {
              optionA_floorWorldQuadAlignedWithGeo: quadAlignedA,
              optionB_floorWorldQuadNotAlignedWithGeo: !quadAlignedA,
              decompositionAmbiguousDespiteTightCornerFit:
                quadAlignedA && transformSuspiciousB,
              avgGeoToFloorCornerMatchDistXZ_m: avgMatchDist,
              matchThreshold_m: MATCH_THRESH_M,
              nearestFloorCornerIds_forGeoSW_SE_NE_NW: cornerIds,
              distinctNearestFloorCorners_count: distinctNearestCorners,
              oneToOneCornerAssignmentLikely: distinctNearestCorners === 4,
              transformSuspicious_flags: {
                anyNegativeWorldScale: floorWorldEffective?.anyNegativeWorldScale ?? null,
                approx180DegWorldYaw: floorWorldEffective?.approx180DegWorldYaw ?? null,
                negativeLocalScaleXZ:
                  fMeshDiag.scaling.x < 0 || fMeshDiag.scaling.z < 0,
                approx180DegLocalYaw: near180Yaw,
              },
              primaryHypothesis: primaryVerdict,
              secondaryIfFloorAligned: quadAlignedA
                ? 'Inspect heatmap dynamic texture U/V axis, imageData row order, and world extent binding (Plotly vs Babylon).'
                : 'N/A until floor quad matches geo.',
              cameraNote:
                'See cameraVsGeoNorth_secondary on this log object; oblique views distort XZ compass comparison.',
            };
          } else {
            diag.coordFrameVerdict_readOnly = {
              skipped: true,
              reason: 'mapPreviewGround not found by findFloorLikeMeshForProbe',
            };
          }

          const midLat = (bbox.north + bbox.south) / 2;
          const midLon = (bbox.east + bbox.west) / 2;
          let gLat = 0;
          let gLon = 0;
          let nG = 0;
          for (const p of geom) {
            gLat += p.lat;
            gLon += p.lon;
            nG++;
          }
          const bCentLat = nG ? gLat / nG : midLat;
          const bCentLon = nG ? gLon / nG : midLon;
          const geoNorthOfBboxCenter = bCentLat > midLat;
          const geoEastOfBboxCenter = bCentLon > midLon;
          const geoQuadrantVsBboxCenter = `${geoNorthOfBboxCenter ? 'N' : 'S'}${geoEastOfBboxCenter ? 'E' : 'W'}`;

          const fCx =
            fMeshDiag != null
              ? (fMeshDiag.getBoundingInfo().boundingBox.minimumWorld.x +
                  fMeshDiag.getBoundingInfo().boundingBox.maximumWorld.x) /
                2
              : NaN;
          const fCz =
            fMeshDiag != null
              ? (fMeshDiag.getBoundingInfo().boundingBox.minimumWorld.z +
                  fMeshDiag.getBoundingInfo().boundingBox.maximumWorld.z) /
                2
              : NaN;

          const worldNorthOfFloorCenter =
            Number.isFinite(fCz) && bbCenterW.z > fCz;
          const worldEastOfFloorCenter =
            Number.isFinite(fCx) && bbCenterW.x > fCx;
          const worldQuadrantVsFloorCenter_provisional = `${worldNorthOfFloorCenter ? 'N' : 'S'}${worldEastOfFloorCenter ? 'E' : 'W'}`;
          const cScene = this.coord.convertToVector3(bCentLat, bCentLon);
          diag.quadrantConsistency_provisional = {
            convention:
              'N = building world Z > floor center Z; E = building world X > floor center X (map-agnostic labels for comparison only).',
            buildingGeoCentroid: { lat: bCentLat, lon: bCentLon },
            bboxCenterGeo: { lat: midLat, lon: midLon },
            geoQuadrantVsBboxCenter,
            worldQuadrantVsFloorCenter_provisional,
            geoVsWorldNorthAgrees: geoNorthOfBboxCenter === worldNorthOfFloorCenter,
            geoVsWorldEastAgrees: geoEastOfBboxCenter === worldEastOfFloorCenter,
            centroidSceneFromLatLon: { x: cScene.x, z: cScene.z },
            footprintCenterLocal_meta: { x: finalLocalForMesh.x, z: finalLocalForMesh.z },
            delta_geoCentroidScene_vs_footprintLocal: {
              dx: cScene.x - finalLocalForMesh.x,
              dz: cScene.z - finalLocalForMesh.z,
            },
          };
        } else {
          diag.geoCornerMapping_sceneSpace_sameAsMapCoordinate = {
            skipped: true,
            reason: 'no bbox passed to generateBuildings',
          };
        }

        const bbLocMin = biW.boundingBox.minimum;
        const bbLocMax = biW.boundingBox.maximum;
        let pivotLocal: { x: number; y: number; z: number } | null = null;
        try {
          const pv = mesh.getPivotPoint();
          pivotLocal = { x: pv.x, y: pv.y, z: pv.z };
        } catch {
          pivotLocal = null;
        }

        diag.meshRootVsNegativeLocalGeometry = {
          meshPosition: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          meshAbsolutePosition: { x: absPos.x, y: absPos.y, z: absPos.z },
          boundingBoxLocalMinimum: { x: bbLocMin.x, y: bbLocMin.y, z: bbLocMin.z },
          boundingBoxLocalMaximum: { x: bbLocMax.x, y: bbLocMax.y, z: bbLocMax.z },
          pivotPointLocal: pivotLocal,
          whyRootCanBeZeroXZ_whileFootprintNegativeLocal: [
            'ExtrudePolygon footprint lives in mesh LOCAL space; origin is not necessarily the polygon centroid.',
            'Vertices are expressed relative to mesh pivot/origin before world matrix; large negative local X/Z means geometry sits on the -X/-Z side of that origin.',
            'mesh.position.x/z stay 0 if no lateral translation is applied; only Y is adjusted after setPivotPoint(bottom) to keep the base near ground.',
            'World placement comes from local bbox × world matrix; building "layer" vs map can still look shifted if floor uses a different centering/UV convention than geo scene corners.',
          ],
        };

        diag.disableMirrorFlag = disableMirror;

        console.log('[NS_PROBE][COORD_FRAME_DIAG]', diag);
      }

      meshes.push(mesh);
    }

    return meshes;
  }

  // -------------------- helpers --------------------

  private buildOverpassQuery(b: BBox): string {
    // ✅ timeout 降低，避免卡太久；出錯就讓上層換 endpoint
    // ✅ out geom 只拿幾何點
    // ✅ limit 結果量（避免 bbox 內建築太多爆掉）
    return `
      [out:json][timeout:12];
      (
        way["building"](${b.south},${b.west},${b.north},${b.east});
      );
      out geom 200;
    `;
  }

  private extractHeightMeters(tags: Record<string, any>): number {
    const h = tags?.height;
    if (typeof h === 'string') {
      const n = parseFloat(h);
      if (!isNaN(n)) return n;
    }
    if (typeof h === 'number') return h;

    const levels = tags?.['building:levels'];
    if (typeof levels === 'string') {
      const n = parseFloat(levels);
      if (!isNaN(n)) return Math.max(3, n * 3);
    }
    return 12;
  }

  private estimateAttenuation(tags: Record<string, any>): number {
    // 入門版：先用固定值或依 building/material 做粗分類
    // 你後續可改成：玻璃、混凝土、金屬等不同衰減
    const material = (tags?.material ?? tags?.building?.material ?? '').toString().toLowerCase();
    if (material.includes('glass')) return 2.0;
    if (material.includes('concrete')) return 8.0;
    if (material.includes('metal')) return 12.0;
    return 6.0; // 預設衰減
  }

  private removeDuplicateClosingPoint(points: Vector3[]): Vector3[] {
    if (points.length < 4) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (Vector3.Distance(first, last) < 0.001) return points.slice(0, -1);
    return points;
  }

  private computeBuildingRectFromFootprint(
    points: Vector3[]
  ): { width: number; length: number; angle: number } | null {
    if (!Array.isArray(points) || points.length < 3) return null;

    let longest = { dx: 0, dz: 0, lenSq: 0 };
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const dx = (p2?.x ?? 0) - (p1?.x ?? 0);
      const dz = (p2?.z ?? 0) - (p1?.z ?? 0);
      const lenSq = dx * dx + dz * dz;
      if (lenSq > longest.lenSq) {
        longest = { dx, dz, lenSq };
      }
    }

    if (!(longest.lenSq > 1e-8)) return null;

    const axisLen = Math.sqrt(longest.lenSq);
    const axisX = longest.dx / axisLen;
    const axisZ = longest.dz / axisLen;
    const perpX = -axisZ;
    const perpZ = axisX;

    let minAxis = Number.POSITIVE_INFINITY;
    let maxAxis = Number.NEGATIVE_INFINITY;
    let minPerp = Number.POSITIVE_INFINITY;
    let maxPerp = Number.NEGATIVE_INFINITY;

    for (const p of points) {
      const x = p?.x ?? 0;
      const z = p?.z ?? 0;
      const axisProj = x * axisX + z * axisZ;
      const perpProj = x * perpX + z * perpZ;
      minAxis = Math.min(minAxis, axisProj);
      maxAxis = Math.max(maxAxis, axisProj);
      minPerp = Math.min(minPerp, perpProj);
      maxPerp = Math.max(maxPerp, perpProj);
    }

    let length = maxAxis - minAxis;
    let width = maxPerp - minPerp;
    if (!(Number.isFinite(length) && Number.isFinite(width)) || length <= 0 || width <= 0) {
      return null;
    }

    let angle = (Math.atan2(axisZ, axisX) * 180) / Math.PI;
    if (width > length) {
      const temp = length;
      length = width;
      width = temp;
      angle += 90;
    }

    angle = ((angle % 180) + 180) % 180;

    return {
      width: Number(width.toFixed(4)),
      length: Number(length.toFixed(4)),
      angle: Number(angle.toFixed(2)),
    };
  }

  /**
   * Secondary interpretation only: compare active camera view direction (world) to geo-north in scene XZ.
   * Oblique cameras project poorly onto XZ; do not treat as ground truth for flips.
   */
  private buildCameraVsGeoNorthProbe(
    scene: Scene,
    vecNorthScene: { x: number; z: number }
  ): Record<string, unknown> {
    const cam = scene.activeCamera;
    if (!cam) {
      return { skipped: true, reason: 'no activeCamera' };
    }

    let viewDir = new Vector3(0, 0, 1);
    try {
      const anyCam = cam as any;
      if (typeof anyCam.getTarget === 'function') {
        const target = anyCam.getTarget();
        viewDir = target.subtract(cam.position).normalize();
      } else if (typeof anyCam.getForwardRay === 'function') {
        viewDir = anyCam.getForwardRay().direction.normalize();
      }
    } catch {
      return {
        skipped: true,
        reason: 'camera direction computation threw',
        cameraName: cam.name,
        cameraClass: typeof cam.getClassName === 'function' ? cam.getClassName() : 'Camera',
      };
    }

    const nLen = Math.hypot(vecNorthScene.x, vecNorthScene.z);
    const geoNorthUnitXZ =
      nLen > 1e-9
        ? { x: vecNorthScene.x / nLen, z: vecNorthScene.z / nLen }
        : null;

    const vx = viewDir.x;
    const vz = viewDir.z;
    const vLen = Math.hypot(vx, vz);
    const viewXZProjectedUnit =
      vLen > 1e-9 ? { x: vx / vLen, z: vz / vLen } : null;

    let dotViewXZ_vs_geoNorthXZ: number | null = null;
    if (geoNorthUnitXZ && viewXZProjectedUnit) {
      dotViewXZ_vs_geoNorthXZ =
        geoNorthUnitXZ.x * viewXZProjectedUnit.x +
        geoNorthUnitXZ.z * viewXZProjectedUnit.z;
    }

    return {
      cameraName: cam.name,
      cameraClass: typeof cam.getClassName === 'function' ? cam.getClassName() : 'Camera',
      viewDirectionWorld_unit: { x: viewDir.x, y: viewDir.y, z: viewDir.z },
      viewDirectionProjectedToXZ_unit: viewXZProjectedUnit,
      geoNorthFromSouthMidToNorthMid_unitXZ: geoNorthUnitXZ,
      dot_viewXZ_vs_geoNorthXZ: dotViewXZ_vs_geoNorthXZ,
      note:
        'Interpretation only: for ArcRotateCamera uses (target - position); FPS uses getForwardRay. XZ dot compares horizontal components only.',
    };
  }

  /** Debug: locate a ground mesh if present (preview ground is created before buildings). */
  private findFloorLikeMeshForProbe(scene: Scene): Mesh | null {
    const byName = scene.getMeshByName('mapPreviewGround');
    if (byName instanceof Mesh) return byName;
    for (const m of scene.meshes) {
      if (m instanceof Mesh) {
        const t = (m as any).metadata?.type;
        if (t === 'ground' || t === 'floor') return m;
      }
    }
    return null;
  }
}
