// ris-pattern-viewer.ts
// Purpose: Encapsulate Babylon.js 3D RIS pattern visualization logic
// Data source: rawData.patternRaw (matrix), meta for angle info

import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  Mesh,
  Color4,
  Color3,
  StandardMaterial,
  AxesViewer,
} from '@babylonjs/core';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { scaleLinear } from 'd3-scale';
import { interpolateRdYlBu } from 'd3-scale-chromatic';
import type { RisRawDataApi } from '../../../models/ris.model';

export class RisPatternViewer {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private mesh: Mesh | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private rMin = 0.3;
  private rMax = 1.0;

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    // Camera 預設角度
    this.camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 3, Vector3.Zero(), this.scene);
    this.camera.attachControl(canvas, true);
    new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    // 加入 XYZ 軸
    new AxesViewer(this.scene, 1);
    this.engine.runRenderLoop(() => {
      if (this.scene) this.scene.render();
    });
  }

  buildFromRawData(rawData: RisRawDataApi) {
    if (!this.scene) return;
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }
    let matrix = this.getMatrix(rawData);
    let rowCount = rawData.rowElement;
    let colCount = rawData.columnElement;
    // 1. 角度範圍
    const phiRange = (rawData.meta?.phiIncDeg && rawData.meta.phiIncDeg.length === 2)
      ? rawData.meta.phiIncDeg : [0, 360];
    const thetaRange = (rawData.meta?.thetaIncDeg && rawData.meta.thetaIncDeg.length === 2)
      ? rawData.meta.thetaIncDeg : [0, 180];

    // 1.5 seam closure: phi 0..360 補一列
    let seam = false;
    if (Math.abs(phiRange[1] - phiRange[0] - 360) < 1e-3) {
      seam = true;
      // 補一欄到最後
      matrix = matrix.map(row => [...row, row[0]]);
      colCount += 1;
    }
    // 補齊每列長度
    const minPad = (matrix.flat().filter(v => typeof v === 'number' && isFinite(v)).length > 0)
      ? Math.min(...matrix.flat().filter(v => typeof v === 'number' && isFinite(v))) : 0;
    matrix = matrix.map(row => {
      const r = Array.isArray(row) ? row.slice(0, colCount) : [];
      while (r.length < colCount) r.push(minPad);
      return r;
    });

    // 2. theta/phi 映射
    // theta = thetaMin + (i/(row-1)) * (thetaMax-thetaMin)
    // phi = phiMin + (j/(col-1)) * (phiMax-phiMin)
    const thetaArr = [];
    for (let i = 0; i < rowCount; i++) {
      thetaArr.push(thetaRange[0] + (rowCount === 1 ? 0 : i / (rowCount - 1)) * (thetaRange[1] - thetaRange[0]));
    }
    const phiArr = [];
    for (let j = 0; j < colCount; j++) {
      phiArr.push(phiRange[0] + (colCount === 1 ? 0 : j / (colCount - 1)) * (phiRange[1] - phiRange[0]));
    }

    // 3. matrix value → 半徑 (antenna-style heatmap)
    const flat = matrix.flat().filter(v => typeof v === 'number' && isFinite(v));
    let min = flat.length > 0 ? Math.min(...flat) : 0;
    let max = flat.length > 0 ? Math.max(...flat) : 1;
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 1;
    if (max === min) max = min + 1; // 避免除以 0
    const scaleR = scaleLinear().domain([min, max]).range([this.rMin, this.rMax]);

    // 4. Ribbon path
    const paths: Vector3[][] = [];
    const vtxColors: number[] = [];
    let nanCount = 0;
    for (let i = 0; i < rowCount; i++) {
      const row: Vector3[] = [];
      for (let j = 0; j < colCount; j++) {
        const v0 = matrix[i]?.[j];
        const v = (typeof v0 === 'number' && isFinite(v0)) ? v0 : min;
        const theta = thetaArr[i] * Math.PI / 180;
        const phi = phiArr[j] * Math.PI / 180;
        const r = scaleR(v);
        let x = r * Math.sin(theta) * Math.cos(phi);
        let y = r * Math.cos(theta);
        let z = r * Math.sin(theta) * Math.sin(phi);
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
          nanCount++;
          console.warn('[RIS][NaN]', {i, j, v, x, y, z});
          x = 0; y = 0; z = 0;
        }
        row.push(new Vector3(x, y, z));
        // vertex color (antenna style)
        let t = (v - min) / (max - min);
        t = Math.max(0, Math.min(1, t));
        const css = interpolateRdYlBu(1 - t);
        const rgb = this.rgbStringToArray(css);
        vtxColors.push(rgb[0], rgb[1], rgb[2], 1);
      }
      paths.push(row);
    }
    if (nanCount > 0) {
      console.warn('[RIS][NaN] total:', nanCount);
    }
    this.mesh = MeshBuilder.CreateRibbon('risRibbon', { pathArray: paths, sideOrientation: Mesh.FRONTSIDE, updatable: false, closeArray: false, closePath: false }, this.scene);
    // 設定 vertex color
    this.mesh.hasVertexAlpha = true;
    this.mesh.useVertexColors = true;
    const vertexData = this.mesh.getVerticesData(VertexBuffer.PositionKind);
    const vertexCount = vertexData ? vertexData.length / 3 : 0;
    // color array 長度必須 vertexCount*4
    if (vertexCount * 4 !== vtxColors.length) {
      console.warn('[RIS][Color] vertexCount*4 != colorLen', {vertexCount, colorLen: vtxColors.length});
    }
    const colors = new Float32Array(vtxColors);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
    // 材質（與 antenna 相同，強化 vertex color 顯示）
    const mat = new StandardMaterial('mat', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.alpha = 1;
    this.mesh.material = mat;
    // Debug log
    console.log('[RIS][Color]', {min, max, vertexCount, colorLen: vtxColors.length});
  }

  resize() {
    if (this.engine) this.engine.resize();
  }

  dispose() {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.canvas = null;
  }

  // 工具
  private linspace(start: number, end: number, num: number): number[] {
    if (num === 1) return [start];
    const arr = [];
    const step = (end - start) / (num - 1);
    for (let i = 0; i < num; i++) arr.push(start + step * i);
    return arr;
  }
  private getMatrix(rawData: RisRawDataApi): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < rawData.rowElement; i++) {
      out.push(rawData.patternRaw[String(i)] || []);
    }
    return out;
  }
  private rgbStringToArray(rgb: string): [number, number, number] {
    // rgb = "rgb(r,g,b)" or hex
    if (rgb.startsWith('#')) {
      const bigint = parseInt(rgb.slice(1), 16);
      return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
    }
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return [1, 1, 1];
    return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255];
  }
}
