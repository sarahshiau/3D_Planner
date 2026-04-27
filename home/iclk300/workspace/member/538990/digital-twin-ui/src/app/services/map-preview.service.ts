// src/app/services/map-preview.service.ts
import { Injectable } from '@angular/core';
import * as L from 'leaflet';

import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Vector3,
  TransformNode,
  AbstractMesh,
  Color3,
  VertexBuffer,
} from '@babylonjs/core';

import { MapCoordinateService } from './map-coordinate.service';
import { MapGeneratorService, BBox as GenBBox } from './map-generator.service';

export interface GeneratedSceneAssets {
  root: TransformNode;
  ground: Mesh;
  buildingsRoot: TransformNode;
  bbox: GenBBox;
  zoom: number;
  texture: DynamicTexture;
}

@Injectable({ providedIn: 'root' })
export class MapPreviewService {
  constructor(
    private coord: MapCoordinateService,
    private mapGen: MapGeneratorService
  ) {}

  async generate(scene: Scene, bounds: L.LatLngBounds, zoom = 18): Promise<GeneratedSceneAssets> {
    console.log('[CHK][Scene@MapPreview.generate]', {
      sceneRef: scene,
    });

    const bbox: GenBBox = {
      south: bounds.getSouthWest().lat,
      west: bounds.getSouthWest().lng,
      north: bounds.getNorthEast().lat,
      east: bounds.getNorthEast().lng,
    };

    const previewZoom = Math.max(18, zoom ?? 18);

    // ReferencePoint：Mercator center
    const centerLon = (bbox.west + bbox.east) / 2;
    const ySouth = this.coord.latToMercYPublic(bbox.south);
    const yNorth = this.coord.latToMercYPublic(bbox.north);
    const yMid = (ySouth + yNorth) / 2;
    const centerLat = this.coord.mercYToLat(yMid);
    this.coord.setReferencePoint(centerLat, centerLon);

    const root = new TransformNode('mapPreviewRoot', scene);
    console.log('[DBG][MapPreview] before root create', {
      sceneIsNull: scene === null,
      sceneIsUndef: scene === undefined,
      sceneType: scene ? scene.constructor?.name : null,
    });

    // Ground
    const ground = this.buildGroundFromBBox(scene, bbox);
    ground.setParent(root);

    // Tiles -> bbox texture -> apply to ground
    const bboxTex = await this.createBBoxTextureFromTiles(scene, bbox, previewZoom);
    const mat = new StandardMaterial('mapPreviewGroundMat', scene);
    mat.diffuseTexture = bboxTex;
    const previewTex = mat.diffuseTexture as Texture;
    previewTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    previewTex.wrapV = Texture.CLAMP_ADDRESSMODE;

    // Identity texture transform; axis mapping image X→world X / image Y→world Z is done on mesh UV (u↔v swap on mapPreviewGround).
    previewTex.uScale = 1;
    previewTex.uOffset = 0;
    previewTex.vScale = 1;
    previewTex.vOffset = 0;
    previewTex.uAng = 0;
    previewTex.vAng = 0;
    previewTex.wAng = 0;
    previewTex.uRotationCenter = 0.5;
    previewTex.vRotationCenter = 0.5;
    previewTex.wRotationCenter = 0.5;

    this.logMapPreviewGroundUvApplied(previewTex);

    // [UX] Make map ground readable: unlit/emissive to avoid dark look & avoid specular glare
    mat.disableLighting = true;
    // Let the texture be self-lit (stable across camera angles)
    if (mat.diffuseTexture) {
      mat.emissiveTexture = mat.diffuseTexture;
    }
    mat.emissiveColor = new Color3(1, 1, 1);
    // Avoid glare
    mat.specularColor = Color3.Black();
    mat.specularPower = 16;

    ground.material = mat;

    try {
      const bb = ground.getBoundingInfo().boundingBox;
      const min = bb.minimumWorld;
      const max = bb.maximumWorld;
      const groundWidth = max.x - min.x;
      const groundHeight = max.z - min.z;
      const tex = mat.diffuseTexture as Texture | null;

      console.log('[DBG][MapPreview][BBoxGround]', {
        bbox,
        centerLat,
        centerLon,
        widthMeters: groundWidth,
        heightMeters: groundHeight,
        groundMin: { x: min.x, z: min.z },
        groundMax: { x: max.x, z: max.z },
        texTransform: tex
          ? {
              uScale: tex.uScale,
              uOffset: tex.uOffset,
              vScale: tex.vScale,
              vOffset: tex.vOffset,
              uAng: tex.uAng,
              vAng: tex.vAng,
              wAng: tex.wAng,
              uRotationCenter: tex.uRotationCenter,
              vRotationCenter: tex.vRotationCenter,
              wRotationCenter: tex.wRotationCenter,
            }
          : null,
      });
    } catch (e) {
      console.warn('[DBG][MapPreview][BBoxGround] failed to log bbox/ground info', e);
    }

    // Buildings
    const buildingsRoot = new TransformNode('mapPreviewBuildingsRoot', scene);
    buildingsRoot.setParent(root);

    // [PreviewFlow v1 cancel-fix]
    const osm = await this.mapGen.getOSMData(bbox);
    // [PreviewFlow v1 cancel-fix]
    const meshes = this.mapGen.generateBuildings(scene, osm, bbox);
    // [PreviewFlow v1 cancel-fix]
    if (!Array.isArray(meshes)) {
      throw new Error('Building generation failed: invalid mesh result');
    }
    for (const m of meshes as AbstractMesh[]) {
      m.setParent(buildingsRoot);
    }

    return { root, ground, buildingsRoot, bbox, zoom: previewZoom, texture: bboxTex };
  }

  disposeAssets(assets: GeneratedSceneAssets | null): void {
    if (!assets) return;

    try {
      const mat = assets.ground.material as any;
      const tex = mat?.diffuseTexture as any;
      if (tex?.dispose) tex.dispose();
      if (mat?.dispose) mat.dispose();

      assets.ground.dispose(false, true);
      assets.buildingsRoot?.dispose(false, true);
      assets.root?.dispose(false, true);
    } catch (e) {
      console.warn('[MapPreviewService] disposeAssets error', e);
    }
  }

  private buildGroundFromBBox(scene: Scene, bbox: GenBBox): Mesh {
    const sw = this.coord.convertToVector3(bbox.south, bbox.west);
    const se = this.coord.convertToVector3(bbox.south, bbox.east);
    const ne = this.coord.convertToVector3(bbox.north, bbox.east);
    const nw = this.coord.convertToVector3(bbox.north, bbox.west);

    const width = Math.abs(se.x - sw.x);
    const height = Math.abs(nw.z - sw.z);

    const center = new Vector3((sw.x + ne.x) / 2, 0, (sw.z + ne.z) / 2);

    const ground = MeshBuilder.CreateGround('mapPreviewGround', { width, height }, scene);
    ground.position = center;
    ground.isPickable = true;
    ground.receiveShadows = true;

    this.swapMapPreviewGroundMeshUvAxes(ground);

    return ground;
  }

  /** Swap u↔v so canvas horizontal (image X / texture u) maps along world +X and canvas vertical (image Y / texture v) along world +Z. */
  private swapMapPreviewGroundMeshUvAxes(ground: Mesh): void {
    const uv = ground.getVerticesData(VertexBuffer.UVKind);
    if (!uv || uv.length < 4) return;
    for (let i = 0; i < uv.length; i += 2) {
      const u = uv[i];
      const v = uv[i + 1];
      uv[i] = v;
      uv[i + 1] = u;
    }
    ground.updateVerticesData(VertexBuffer.UVKind, uv);
  }

  /* -------------------- Tiles pipeline (mosaic -> crop bbox-only) -------------------- */

  private async createBBoxTextureFromTiles(scene: Scene, bbox: GenBBox, zoom: number): Promise<DynamicTexture> {
    const tileSize = 256;
    const { xMin, xMax, yMin, yMax } = this.bboxToTileRange(bbox, zoom);

    const tilesX = xMax - xMin + 1;
    const tilesY = yMax - yMin + 1;
    const texW = tilesX * tileSize;
    const texH = tilesY * tileSize;

    const mosaic = new DynamicTexture('tile_mosaic', { width: texW, height: texH }, scene, false);
    const mosaicCtx = mosaic.getContext();

    const loadOne = (x: number, y: number) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
      });

    const tasks: Promise<void>[] = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tasks.push(
          loadOne(x, y).then((img) => {
            const dx = (x - xMin) * tileSize;
            const dy = (y - yMin) * tileSize;
            mosaicCtx.drawImage(img, dx, dy, tileSize, tileSize);
          })
        );
      }
    }
    await Promise.all(tasks);
    mosaic.update();

    // bbox corners -> world pixel
    const swPx = this.lonLatToWorldPixel(bbox.west, bbox.south, zoom, tileSize);
    const nePx = this.lonLatToWorldPixel(bbox.east, bbox.north, zoom, tileSize);

    const mosaicOriginPx = { x: xMin * tileSize, y: yMin * tileSize };

    const left = swPx.x - mosaicOriginPx.x;
    const right = nePx.x - mosaicOriginPx.x;
    const top = nePx.y - mosaicOriginPx.y;
    const bottom = swPx.y - mosaicOriginPx.y;

    const cropLeft = Math.floor(Math.min(left, right));
    const cropRight = Math.ceil(Math.max(left, right));
    const cropTop = Math.floor(Math.min(top, bottom));
    const cropBottom = Math.ceil(Math.max(top, bottom));

    const cropW = Math.max(1, cropRight - cropLeft);
    const cropH = Math.max(1, cropBottom - cropTop);

    const upscale = 2;
    const maxOutputSize = 4096;
    const outW = Math.min(maxOutputSize, Math.max(1, cropW * upscale));
    const outH = Math.min(maxOutputSize, Math.max(1, cropH * upscale));

    const bboxTex = new DynamicTexture('bbox_only_tex', { width: outW, height: outH }, scene, false);
    const bboxCtx = bboxTex.getContext() as CanvasRenderingContext2D;
    const mosaicCanvas = (mosaic.getContext() as CanvasRenderingContext2D).canvas as HTMLCanvasElement;

    bboxCtx.imageSmoothingEnabled = true;
    bboxCtx.drawImage(
      mosaicCanvas,
      cropLeft,
      cropTop,
      cropW,
      cropH,
      0,
      0,
      outW,
      outH
    );
    bboxTex.update();

    console.log('[MapPreviewService][TextureQuality]', {
      zoom,
      cropW,
      cropH,
      outW,
      outH,
      upscale,
    });

    this.logMapPreviewTileCanvasOrientation({
      bbox,
      zoom,
      xMin,
      xMax,
      yMin,
      yMax,
      tileSize,
      texW,
      texH,
      mosaicOriginPx,
      swPx,
      nePx,
      left,
      right,
      top,
      bottom,
      cropLeft,
      cropTop,
      cropRight,
      cropBottom,
      cropW,
      cropH,
    });
    this.logMapPreviewImageCornerMeaning(bbox, {
      cropW,
      cropH,
      cropLeft,
      cropTop,
      cropRight,
      cropBottom,
    });

    mosaic.dispose();
    return bboxTex;
  }

  private bboxToTileRange(bbox: GenBBox, z: number): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const t1 = this.lonLatToTile(bbox.west, bbox.north, z);
    const t2 = this.lonLatToTile(bbox.east, bbox.south, z);

    return {
      xMin: Math.min(t1.x, t2.x),
      xMax: Math.max(t1.x, t2.x),
      yMin: Math.min(t1.y, t2.y),
      yMax: Math.max(t1.y, t2.y),
    };
  }

  private lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
    const n = Math.pow(2, z);
    const x = Math.floor(((lon + 180) / 360) * n);

    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

    return { x, y };
  }

  private lonLatToWorldPixel(lon: number, lat: number, z: number, tileSize: number): { x: number; y: number } {
    const n = Math.pow(2, z);
    const x = ((lon + 180) / 360) * n * tileSize;

    const latRad = (lat * Math.PI) / 180;
    const y =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n *
      tileSize;

    return { x, y };
  }

  /**
   * Diagnosis only: how OSM tiles land on 2D canvas and bbox crop (no behavior change).
   */
  private logMapPreviewTileCanvasOrientation(d: {
    bbox: GenBBox;
    zoom: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    tileSize: number;
    texW: number;
    texH: number;
    mosaicOriginPx: { x: number; y: number };
    swPx: { x: number; y: number };
    nePx: { x: number; y: number };
    left: number;
    right: number;
    top: number;
    bottom: number;
    cropLeft: number;
    cropTop: number;
    cropRight: number;
    cropBottom: number;
    cropW: number;
    cropH: number;
  }): void {
    console.log('[MAP_PREVIEW][TILE_CANVAS_ORIENTATION]', {
      osmTileGrid: {
        tileX_increases: 'east (longitude)',
        tileY_increases: 'south (standard Web Mercator / OSM tile Y)',
      },
      mosaicPlacement:
        'drawImage: dx=(tileX-xMin)*tileSize left→right; dy=(tileY-yMin)*tileSize top→down (canvas Y grows downward).',
      mercatorPixelY:
        'lonLatToWorldPixel y grows southward (larger y = more south), same as OSM tile Y direction.',
      bboxCrop: {
        cropSourceRect_mosaic: {
          left: d.cropLeft,
          top: d.cropTop,
          right: d.cropRight,
          bottom: d.cropBottom,
          w: d.cropW,
          h: d.cropH,
        },
        drawImageToBboxTexture:
          'bboxCtx.drawImage(mosaic, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH) — no extra flip; dest (0,0) is canvas2D top-left.',
      },
      flipOrMirrorInThisStage: {
        horizontal: false,
        vertical: false,
        note: 'No invertY / uScale here; flips are applied later on StandardMaterial.diffuseTexture.',
      },
      tileRange: { xMin: d.xMin, xMax: d.xMax, yMin: d.yMin, yMax: d.yMax, zoom: d.zoom },
    });
  }

  /**
   * Diagnosis only: geographic meaning of bbox DynamicTexture corners in **canvas2D** space after crop (before material UV transform).
   */
  private logMapPreviewImageCornerMeaning(
    bbox: GenBBox,
    crop: { cropW: number; cropH: number; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number }
  ): void {
    console.log('[MAP_PREVIEW][IMAGE_CORNER_MEANING]', {
      coordinateSpace: 'bbox_only_tex canvas after drawImage; first row/column (0,0) = 2D top-left.',
      derivation:
        'cropTop = min(nePx.y, swPx.y) − originY → northern edge in mercator pixels; cropLeft = min(swPx.x, nePx.x) − originX → western edge (typical positive lon bbox).',
      corners_geoTypicalBBox: {
        topLeft_image_canvas2D_0_0: 'NW (north lat, west lon)',
        topRight: 'NE',
        bottomLeft: 'SW',
        bottomRight: 'SE',
      },
      caveat:
        'If west>east or unusual bbox, swap labels; compare bbox.west/east/north/south to swPx/nePx ordering.',
      bbox,
      cropPixels: crop,
    });
  }

  /** Full diffuseTexture UV transform after Strategy A (rotation-only test). */
  private logMapPreviewGroundUvApplied(tex: Texture): void {
    console.log('[MAP_PREVIEW][GROUND_UV_MEANING]', {
      strategy: 'mesh_uv_u_v_swapped_texture_identity_no_wAng',
      materialTextureTransform_appliedAfterMeshUv: {
        uScale: tex.uScale,
        uOffset: tex.uOffset,
        vScale: tex.vScale,
        vOffset: tex.vOffset,
        uAng: tex.uAng,
        vAng: tex.vAng,
        wAng: tex.wAng,
        uRotationCenter: tex.uRotationCenter,
        vRotationCenter: tex.vRotationCenter,
        wRotationCenter: tex.wRotationCenter,
      },
      note: 'mapPreviewGround: per-vertex UV u and v swapped after CreateGround; diffuseTexture uses scale 1 / no rotation.',
    });
  }
}
