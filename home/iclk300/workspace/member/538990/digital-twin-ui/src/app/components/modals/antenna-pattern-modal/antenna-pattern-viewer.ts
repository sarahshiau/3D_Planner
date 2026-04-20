// antenna-pattern-viewer.ts
// Purpose: Encapsulate Babylon.js 3D antenna pattern visualization logic
// Separates rendering concerns from Angular component lifecycle

import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  Color3,
  VertexBuffer,
  TransformNode,
  AbstractMesh,
  DynamicTexture,
} from '@babylonjs/core';
import { scaleLinear } from 'd3-scale';
import { interpolateRdYlBu } from 'd3-scale-chromatic';
import type { PatternSheet } from '../../../services/antenna-pattern/antenna-pattern.types';
import type { AngleChecklistReport } from '../../../services/antenna-pattern/antenna-pattern-model.service';
import type { PatternStats } from '../../../services/antenna-pattern/antenna-pattern-model.service';

// Theta mapping mode for angle transformation
type ThetaMapMode = 'identity' | 'flip180' | 'shift90minus' | 'shift90plus';

export class AntennaPatternViewer {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private mesh: Mesh | null = null;
  private debugSheet: PatternSheet | null = null;
  private debugModelService: any = null; // Will be injected

  // Phase 5A: Reference rings from Excel data
  private patternSheet: PatternSheet | null = null;
  private patternStats: PatternStats | null = null;
  private patternModel: any = null; // PatternModel instance for mode switching
  private ringRoot: TransformNode | null = null;
  private ringMarkers: AbstractMesh[] = [];
  private tooltipLabel: Mesh | null = null;
  private hoverHandlersInstalled = false;

  // Phase 5A-3: Theta mapping mode persistence
  private thetaMapMode: ThetaMapMode = 'identity';
  private currentGetGain: ((theta: number, phi: number) => number) | null = null;
  private currentStats: { gMin: number; gMax: number } | null = null;

  // Viewer rendering constants (must match buildFromGainFn)
  private readonly rMin = 0.3;
  private readonly rMax = 2.0;

  /**
   * Phase 5A-Fold: Normalize direction by folding theta>180 to [0,180] with phi compensation
   * 
   * Ensures all geometry (mesh + rings) use same direction canonicalization as getGain()
   * 
   * @param thetaDeg - Theta angle in degrees
   * @param phiDeg - Phi angle in degrees
   * @returns Normalized {thetaDeg, phiDeg} in canonical form
   */
  private normalizeDirection(thetaDeg: number, phiDeg: number): { thetaDeg: number; phiDeg: number } {
    // Normalize to [0, 360)
    let t = ((thetaDeg % 360) + 360) % 360;
    let p = ((phiDeg % 360) + 360) % 360;

    // Fold theta>180 to [0,180] with phi shift
    if (t > 180) {
      t = 360 - t;
      p = (p + 180) % 360;
    }

    return { thetaDeg: t, phiDeg: p };
  }

  /**
   * Unified spherical to Cartesian conversion (pure transformation)
   * 
   * Does NOT modify angles - performs direct conversion
   * Babylon: Y-up coordinate system
   * 
   * @param thetaDeg - Theta angle in degrees (used as-is)
   * @param phiDeg - Phi angle in degrees (used as-is)
   * @param r - Radius
   * @returns Vector3 position in Cartesian space
   */
  private sphericalToCartesian(thetaDeg: number, phiDeg: number, r: number): Vector3 {
    const th = (thetaDeg * Math.PI) / 180;
    const ph = (phiDeg * Math.PI) / 180;

    const sinT = Math.sin(th);
    const x = sinT * Math.cos(ph) * r;
    const y = Math.cos(th) * r;
    const z = sinT * Math.sin(ph) * r;
    return new Vector3(x, y, z);
  }

  /**
   * Initialize Babylon engine, scene, camera, and lighting
   * @param canvas - HTMLCanvasElement to render into
   */
  init(canvas: HTMLCanvasElement): void {
    if (this.engine) {
      console.warn('[AntennaPatternViewer] already initialized');
      return;
    }

    // Phase 5A-3: Load theta mapping mode from global persistence
    const globalMode = (window as any).__apThetaMapMode;
    if (globalMode && typeof globalMode === 'string') {
      const validModes: ThetaMapMode[] = ['identity', 'flip180', 'shift90minus', 'shift90plus'];
      if (validModes.includes(globalMode as ThetaMapMode)) {
        this.thetaMapMode = globalMode as ThetaMapMode;
        console.log(`[AntennaPatternViewer] Loaded theta mapping mode from global: ${globalMode}`);
      }
    }

    // Create engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    // Create scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color3(0.05, 0.05, 0.08).toColor4();

    // Create camera
    this.camera = new ArcRotateCamera(
      'patternCamera',
      Math.PI / 4,
      Math.PI / 3,
      5,
      Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 2;
    this.camera.upperRadiusLimit = 10;

    // Create light
    const light = new HemisphericLight('patternLight', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.7;

    // Start render loop
    this.engine.runRenderLoop(() => {
      if (this.scene) {
        this.scene.render();
      }
    });

    console.log('[AntennaPatternViewer] initialized');
  }

  /**
   * Set debug data for angle checklist analysis
   * Call this before buildFromGainFn to enable debug features
   * 
   * @param sheet - Pattern sheet from Excel
   * @param modelService - Model service instance for analysis
   */
  setDebugData(sheet: PatternSheet, modelService: any): void {
    this.debugSheet = sheet;
    this.debugModelService = modelService;
  }

  /**
   * Set pattern sheet data and model for reference rings
   * Call this after creating the model
   * 
   * @param sheet - Pattern sheet from Excel (original angles and gains)
   * @param stats - Pattern statistics (gMin, gMax for radius mapping)
   * @param model - Pattern model instance (optional, for mode switching)
   */
  setPatternSheet(sheet: PatternSheet, stats: PatternStats, model?: any): void {
    this.patternSheet = sheet;
    this.patternStats = stats;
    this.patternModel = model || null;
    console.log('[AntennaPatternViewer] setPatternSheet', {
      horizontal: sheet.horizontal.phiDeg.length,
      vertical: sheet.vertical.thetaDeg.length,
      stats,
      hasModel: !!model,
    });
  }

  /**
   * Set theta mapping mode and rebuild mesh immediately
   * 
   * Usage in console:
   *   window.__apViewer.setThetaMapMode('flip180')
   *   // Mesh rebuilds automatically
   * 
   * @param mode - Theta mapping mode
   */
  setThetaMapMode(mode: string): void {
    if (!this.patternModel) {
      console.error('[AntennaPatternViewer] No pattern model available. Call setPatternSheet() with model first.');
      return;
    }

    if (!this.patternModel.setThetaMapMode) {
      console.error('[AntennaPatternViewer] Pattern model does not support setThetaMapMode()');
      return;
    }

    const validModes: ThetaMapMode[] = ['identity', 'flip180', 'shift90minus', 'shift90plus'];
    if (!validModes.includes(mode as ThetaMapMode)) {
      console.error(`[AntennaPatternViewer] Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
      return;
    }

    const oldMode = this.patternModel.getThetaMapMode ? this.patternModel.getThetaMapMode() : 'unknown';
    
    // Update model
    this.patternModel.setThetaMapMode(mode as ThetaMapMode);
    
    // Update viewer internal state
    this.thetaMapMode = mode as ThetaMapMode;
    
    // Persist to window for cross-modal consistency
    (window as any).__apThetaMapMode = mode;
    
    console.log(`[AntennaPatternViewer] Theta mapping mode changed: ${oldMode} ??${mode}`);
    console.log('[AntennaPatternViewer] ?? Rebuilding mesh with new mode...');
    
    // Rebuild mesh immediately
    this.rebuildMeshWithCurrentMode();
  }

  /**
   * Get current theta mapping mode
   * @returns Current theta mapping mode
   */
  getThetaMapMode(): ThetaMapMode {
    return this.thetaMapMode;
  }

  /**
   * Rebuild mesh and reference rings with current mode
   * Uses stored getGain function and stats
   */
  rebuildMeshWithCurrentMode(): void {
    if (!this.currentGetGain) {
      console.error('[AntennaPatternViewer] No getGain function available. Cannot rebuild.');
      return;
    }

    console.log('[AntennaPatternViewer] Rebuilding mesh with mode:', this.thetaMapMode);

    // Dispose old reference rings
    this.disposeReferenceRings();

    // Rebuild mesh using stored function
    this.buildFromGainFn(this.currentGetGain, this.currentStats || undefined);

    // Rebuild reference rings
    if (this.patternSheet && this.patternStats) {
      this.drawReferenceRingsFromSheet();
    }

    console.log('[AntennaPatternViewer] ??Mesh rebuild complete');
  }

  /**
   * Dispose reference rings (markers and root)
   */
  private disposeReferenceRings(): void {
    // Dispose markers
    this.ringMarkers.forEach(marker => {
      if (marker && !marker.isDisposed()) {
        marker.dispose();
      }
    });
    this.ringMarkers = [];

    // Dispose tooltip
    if (this.tooltipLabel && !this.tooltipLabel.isDisposed()) {
      this.tooltipLabel.dispose();
      this.tooltipLabel = null;
    }

    // Dispose ring root
    if (this.ringRoot && !this.ringRoot.isDisposed()) {
      this.ringRoot.dispose();
      this.ringRoot = null;
    }

    // Reset hover handlers flag
    this.hoverHandlersInstalled = false;
  }

  /**
   * Build antenna pattern mesh from gain function using ribbon geometry
   * with vertex color heatmap (red=strong, blue=weak)
   * 
   * @param getGain - Function to get gain in dBi at (thetaDeg, phiDeg)
   * @param stats - Optional statistics with gMin/gMax (will scan if not provided)
   */
  buildFromGainFn(
    getGain: (thetaDeg: number, phiDeg: number) => number,
    stats?: { gMin: number; gMax: number }
  ): void {
    if (!this.scene) {
      console.warn('[AntennaPatternViewer] cannot build pattern: scene not initialized');
      return;
    }

    // Phase 5A-3: Store getGain and stats for rebuild
    this.currentGetGain = getGain;
    this.currentStats = stats || null;

    // Clean up existing mesh if any
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }

    // Standard parametrization: theta [0, 180], phi [0, 360]
    const thetaSteps = 60;
    const phiSteps = 120;
    const rMin = 0.3;
    const rMax = 2.0;

    // Scan for min/max gain if not provided
    let gMin = stats?.gMin ?? Infinity;
    let gMax = stats?.gMax ?? -Infinity;

    if (!stats) {
      for (let i = 0; i <= thetaSteps; i++) {
        const thetaDeg = (i / thetaSteps) * 180;
        for (let j = 0; j <= phiSteps; j++) {
          const phiDeg = (j / phiSteps) * 360;
          const g = getGain(thetaDeg, phiDeg);
          if (g < gMin) gMin = g;
          if (g > gMax) gMax = g;
        }
      }
    }

    const gRange = gMax - gMin;

    // PASS A: Build base grid without closure
    const paths: Vector3[][] = [];
    const gainGrid: number[][] = [];

    for (let i = 0; i <= thetaSteps; i++) {
      const thetaDeg = (i / thetaSteps) * 180; // 0 to 180 degrees
      const rowPts: Vector3[] = [];
      const rowG: number[] = [];

      for (let j = 0; j <= phiSteps; j++) {
        const phiDeg = (j / phiSteps) * 360; // 0 to 360 degrees

        // Get gain and normalize to radius
        const g = getGain(thetaDeg, phiDeg);
        const t = gRange > 0 ? (g - gMin) / gRange : 0.5;
        const r = rMin + t * (rMax - rMin);

        // Spherical to Cartesian (pure conversion, no fold)
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const phiRad = (phiDeg * Math.PI) / 180;
        const x = r * Math.sin(thetaRad) * Math.cos(phiRad);
        const y = r * Math.cos(thetaRad);
        const z = r * Math.sin(thetaRad) * Math.sin(phiRad);

        rowPts.push(new Vector3(x, y, z));
        rowG.push(g);
      }

      paths.push(rowPts);
      gainGrid.push(rowG);
    }

    // Compute gainMin/gainMax from sampled grid
    let gainMin = Infinity;
    let gainMax = -Infinity;
    for (const row of gainGrid) {
      for (const g of row) {
        if (g < gainMin) gainMin = g;
        if (g > gainMax) gainMax = g;
      }
    }

    // Create color scale: range [1,0] makes maxGain->red, minGain->blue
    const gainRange = gainMax - gainMin;
    const edgeCase = Math.abs(gainRange) < 1e-9;
    const tScale = edgeCase ? null : scaleLinear().domain([gainMin, gainMax]).range([1, 0]).clamp(true);

    // Manual closure: duplicate seam and ring (MUST do for both points and gains)
    // A) closePath seam (phi direction)
    for (let i = 0; i < paths.length; i++) {
      paths[i].push(paths[i][0]);
      gainGrid[i].push(gainGrid[i][0]);
    }

    // B) closeArray ring (theta direction) - REMOVED
    // theta [0..180] is pole-to-pole, NOT cyclic - do not duplicate

    // Create ribbon mesh with NO auto-closure
    this.mesh = MeshBuilder.CreateRibbon('patternRibbon', {
      pathArray: paths,
      closeArray: false,  // theta [0..180] is NOT cyclic
      closePath: false,   // phi seam already manually closed
      sideOrientation: 2  // Mesh.DOUBLESIDE
    }, this.scene);

    // Flatten gainGrid to row-major array
    const gainFlat: number[] = [];
    for (const row of gainGrid) {
      gainFlat.push(...row);
    }

    // Get TRUE vertex count from mesh position buffer
    const pos = this.mesh.getVerticesData(VertexBuffer.PositionKind);
    const vtx = (pos?.length ?? 0) / 3;

    // Build colors for vtx vertices (repeat gainFlat for expanded vertices)
    const colors: number[] = new Array(vtx * 4);
    for (let k = 0; k < vtx; k++) {
      const g = gainFlat[k % gainFlat.length]; // Repeat for expanded vertices
      const t = edgeCase ? 0.5 : tScale!(g);
      const css = interpolateRdYlBu(t);
      
      if (k < 5) {
        console.log('[ColorDbg]', { k, gain: g, t, css });
      }
      
      const [r, gc, b] = cssToRgb01(css);
      
      if (k < 5) {
        console.log('[ColorDbgRGB]', { k, r, gChan: gc, b });
      }
      
      const base = k * 4;
      colors[base + 0] = r;
      colors[base + 1] = gc;
      colors[base + 2] = b;
      colors[base + 3] = 1.0;
    }

    // Validate
    console.log('[Pattern] vtx:', vtx, 'gainFlat:', gainFlat.length, 'col:', colors.length / 4, 'gainMin:', gainMin, 'gainMax:', gainMax);

    // Apply vertex colors
    this.mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);

    // Apply material configured to show vertex colors
    const mat = new StandardMaterial('patternMat', this.scene);
    mat.disableLighting = true; // Show raw vertex colors
    mat.emissiveColor = new Color3(1.0, 1.0, 1.0); // Emit vertex colors
    mat.diffuseColor = new Color3(1.0, 1.0, 1.0); // Avoid tinting vertex colors
    mat.specularColor = new Color3(0, 0, 0); // Remove highlights
    mat.backFaceCulling = false;
    mat.alpha = 1.0;
    this.mesh.material = mat;

    console.log('[AntennaPatternViewer] pattern built from gain function', { gMin, gMax, gainMin, gainMax });
  }

  /**
   * Build fake antenna pattern mesh for fallback/testing
   * Generates a simple cosine-based pattern with main lobe toward +Z
   */
  buildFakePattern(): void {
    // Fake gain function: cosine main lobe with side attenuation
    const fakeGainDb = (thetaDeg: number, phiDeg: number): number => {
      const thetaRad = (thetaDeg * Math.PI) / 180;
      const phiRad = (phiDeg * Math.PI) / 180;
      
      const mainLobe = Math.cos(thetaRad);
      const sideAttenuation = 1 - 0.3 * Math.abs(Math.sin(phiRad * 2));
      const gain = mainLobe * sideAttenuation;
      
      // Map to -30..0 dB range
      return -30 + 30 * Math.max(0, gain);
    };

    this.buildFromGainFn(fakeGainDb, { gMin: -30, gMax: 0 });
    console.log('[AntennaPatternViewer] fake pattern built');
  }

  /**
   * Phase 5A-1: Draw reference rings from Excel pattern data
   * Creates two rings:
   * - Phi ring: horizontal circle at theta=90° using horizontal pattern data
   * - Theta ring: vertical half-circle at phi=phi_peak using vertical pattern data
   */
  drawReferenceRingsFromSheet(): void {
    if (!this.scene || !this.patternSheet || !this.patternStats) {
      console.warn('[ReferenceRings] Cannot draw: missing scene, sheet, or stats');
      return;
    }

    // Dispose existing rings and markers
    if (this.ringRoot) {
      this.ringRoot.dispose();
      this.ringRoot = null;
    }
    this.ringMarkers.forEach(m => m.dispose());
    this.ringMarkers = [];

    // Create ring root at origin
    this.ringRoot = new TransformNode('ringRoot', this.scene);

    const sheet = this.patternSheet;
    const stats = this.patternStats;

    // Helper: convert Excel gainDb (relative attenuation) to absolute gain G
    const gainDbToAbsoluteG = (gainDb: number): number => {
      const aMax = 30; // Default max attenuation
      const att = Math.max(0, Math.min(aMax, -gainDb));
      return stats.gMax - att;
    };

    // Helper: normalize gain to radius [rMin, rMax]
    const normalizeToRadius = (G: number): number => {
      const gRange = stats.gMax - stats.gMin;
      if (gRange <= 0) return (this.rMin + this.rMax) / 2;
      const t = (G - stats.gMin) / gRange;
      return this.rMin + t * (this.rMax - this.rMin);
    };

    // Helper: spherical to Cartesian - USE CLASS METHOD for consistency
    const sphericalToCartesian = (thetaDeg: number, phiDeg: number, r: number): Vector3 => {
      return this.sphericalToCartesian(thetaDeg, phiDeg, r);
    };

    // ===== A) Phi Ring (horizontal at theta=90°) =====
    // Sort by phiDeg ascending to avoid wrap issues
    const phiData = sheet.horizontal.phiDeg.map((phi, i) => ({
      phiDeg: phi,
      gainDb: sheet.horizontal.gainDb[i]
    })).sort((a, b) => a.phiDeg - b.phiDeg);

    const phiPoints: Vector3[] = [];
    const markerStepDeg = 10; // Place marker every 10 degrees

    for (const { phiDeg, gainDb } of phiData) {
      const G = gainDbToAbsoluteG(gainDb);
      const r = normalizeToRadius(G);
      const pos = sphericalToCartesian(90, phiDeg, r); // theta=90 (horizontal)
      phiPoints.push(pos);

      // Place marker every markerStepDeg
      if (Math.abs(phiDeg % markerStepDeg) < 0.5) {
        this.createRingMarker('phiRing', pos, { phiDeg, thetaDeg: 90, gainDb });
      }
    }

    // Close the phi ring
    if (phiPoints.length > 0) {
      phiPoints.push(phiPoints[0]);
    }

    // Create phi ring line
    const phiRing = MeshBuilder.CreateLines('phiRingLine', {
      points: phiPoints
    }, this.scene);
    phiRing.color = new Color3(1, 1, 1); // White
    phiRing.isPickable = false;
    phiRing.parent = this.ringRoot;

    // ===== B) Theta Ring (vertical half-circle at phi=phi_peak) =====
    // Find phi_peak (phi with max horizontal gain)
    let phiPeakIdx = 0;
    let maxGain = -Infinity;
    for (let i = 0; i < sheet.horizontal.gainDb.length; i++) {
      if (sheet.horizontal.gainDb[i] > maxGain) {
        maxGain = sheet.horizontal.gainDb[i];
        phiPeakIdx = i;
      }
    }
    const phiPeak = sheet.horizontal.phiDeg[phiPeakIdx];

    // Sort by thetaDeg ascending
    const thetaData = sheet.vertical.thetaDeg.map((theta, i) => ({
      thetaDeg: theta,
      gainDb: sheet.vertical.gainDb[i]
    })).sort((a, b) => a.thetaDeg - b.thetaDeg);

    const thetaPoints: Vector3[] = [];

    for (const { thetaDeg, gainDb } of thetaData) {
      const G = gainDbToAbsoluteG(gainDb);
      const r = normalizeToRadius(G);
      const pos = sphericalToCartesian(thetaDeg, phiPeak, r);
      thetaPoints.push(pos);

      // Place marker every markerStepDeg
      if (Math.abs(thetaDeg % markerStepDeg) < 0.5) {
        this.createRingMarker('thetaRing', pos, { phiDeg: phiPeak, thetaDeg, gainDb });
      }
    }

    // Create theta ring line (no closure)
    const thetaRing = MeshBuilder.CreateLines('thetaRingLine', {
      points: thetaPoints
    }, this.scene);
    thetaRing.color = new Color3(0.5, 0.8, 1); // Light blue
    thetaRing.isPickable = false;
    thetaRing.parent = this.ringRoot;

    console.log('[ReferenceRings] Drawn:', {
      phiPoints: phiPoints.length,
      thetaPoints: thetaPoints.length,
      phiPeak,
      markers: this.ringMarkers.length
    });

    // Phase 5A-2: Install hover handlers (only once)
    if (!this.hoverHandlersInstalled) {
      this.installRingHoverHandlers();
      this.hoverHandlersInstalled = true;
    }
  }

  /**
   * Phase 5A-2: Create a pickable marker sphere on the ring
   */
  private createRingMarker(
    kind: 'phiRing' | 'thetaRing',
    pos: Vector3,
    angleData: { phiDeg: number; thetaDeg: number; gainDb: number }
  ): void {
    if (!this.scene || !this.ringRoot) return;

    const marker = MeshBuilder.CreateSphere(`marker_${kind}_${this.ringMarkers.length}`, {
      diameter: 0.05
    }, this.scene);

    marker.position.copyFrom(pos);
    marker.isPickable = true;
    marker.parent = this.ringRoot;

    // Store metadata for tooltip
    marker.metadata = {
      kind,
      phiDeg: angleData.phiDeg,
      thetaDeg: angleData.thetaDeg,
      gainDb: angleData.gainDb,
      pos: { x: pos.x, y: pos.y, z: pos.z }
    };

    // Make marker semi-transparent
    const mat = new StandardMaterial(`markerMat_${this.ringMarkers.length}`, this.scene);
    mat.emissiveColor = kind === 'phiRing' ? new Color3(1, 1, 1) : new Color3(0.5, 0.8, 1);
    mat.alpha = 0.6;
    marker.material = mat;

    this.ringMarkers.push(marker);
  }

  /**
   * Phase 5A-2: Install pointer move handlers for hover tooltips
   */
  private installRingHoverHandlers(): void {
    if (!this.scene) return;

    this.scene.onPointerMove = (evt) => {
      if (!this.scene) return;

      const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);

      if (pickResult?.hit && pickResult.pickedMesh?.metadata?.kind) {
        const meta = pickResult.pickedMesh.metadata;
        this.updateRingTooltip(meta);
      } else {
        this.hideRingTooltip();
      }
    };

    console.log('[ReferenceRings] Hover handlers installed');
  }

  /**
   * Phase 5A-2: Update tooltip with ring marker info
   */
  private updateRingTooltip(meta: any): void {
    if (!this.scene) return;

    // Create tooltip label if not exists
    if (!this.tooltipLabel) {
      this.tooltipLabel = MeshBuilder.CreatePlane('tooltipLabel', { size: 0.6 }, this.scene);
      this.tooltipLabel.billboardMode = Mesh.BILLBOARDMODE_ALL;
      this.tooltipLabel.isPickable = false;

      const dt = new DynamicTexture('tooltipTexture', { width: 512, height: 256 }, this.scene, false);
      dt.hasAlpha = true;

      const mat = new StandardMaterial('tooltipMat', this.scene);
      mat.diffuseTexture = dt;
      mat.emissiveColor = new Color3(1, 1, 1);
      mat.backFaceCulling = false;
      mat.useAlphaFromDiffuseTexture = true;

      this.tooltipLabel.material = mat;
    }

    // Update tooltip text
    const dt = (this.tooltipLabel.material as StandardMaterial).diffuseTexture as DynamicTexture;
    const ctx = dt.getContext() as CanvasRenderingContext2D;

    ctx.clearRect(0, 0, 512, 256);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 492, 236);

    // Text
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = [
      `Ring: ${meta.kind === 'phiRing' ? 'Phi@Theta90' : 'Theta@PhiPeak'}`,
      `?=${meta.phiDeg.toFixed(1)}°, θ=${meta.thetaDeg.toFixed(1)}°`,
      `Gain=${meta.gainDb.toFixed(2)}dB`,
      `XYZ=(${meta.pos.x.toFixed(2)}, ${meta.pos.y.toFixed(2)}, ${meta.pos.z.toFixed(2)})`
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, 20, 20 + i * 40);
    });

    dt.update();

    // Position tooltip slightly above the marker
    const worldPos = new Vector3(meta.pos.x, meta.pos.y, meta.pos.z);
    this.tooltipLabel.position.copyFrom(worldPos.add(new Vector3(0, 0.3, 0)));
    this.tooltipLabel.setEnabled(true);
  }

  /**
   * Phase 5A-2: Hide tooltip
   */
  private hideRingTooltip(): void {
    if (this.tooltipLabel) {
      this.tooltipLabel.setEnabled(false);
    }
  }

  /**
   * Debug: Print angle checklist report to console
   * Analyzes Excel angle definitions to help identify offset/mirror needs
   * 
   * Call from browser console: window.__apViewer?.dbgAngleChecklist()
   */
  dbgAngleChecklist(): void {
    if (!this.debugSheet || !this.debugModelService) {
      console.warn('[AngleChecklist] No debug data available. Call setDebugData() before buildFromGainFn()');
      return;
    }

    const report: AngleChecklistReport = this.debugModelService.generateAngleChecklist(this.debugSheet);

    console.log('\n========== ANGLE CHECKLIST ==========');
    console.log(`[AngleChecklist] phi_peak=${report.phi.peak.toFixed(1)}° (gain=${report.phi.peakGain.toFixed(2)}dB)`);
    console.log(`[AngleChecklist] theta_peak=${report.theta.peak.toFixed(1)}° (gain=${report.theta.peakGain.toFixed(2)}dB)`);
    
    console.log('\n--- -3dB Points ---');
    const phiLeft = report.phi.minus3dB.left;
    const phiRight = report.phi.minus3dB.right;
    const thetaLeft = report.theta.minus3dB.left;
    const thetaRight = report.theta.minus3dB.right;
    
    console.log(`[AngleChecklist] phi_-3dB_left=${phiLeft !== undefined ? phiLeft.toFixed(1) + '°' : 'N/A'}`);
    console.log(`[AngleChecklist] phi_-3dB_right=${phiRight !== undefined ? phiRight.toFixed(1) + '°' : 'N/A'}`);
    console.log(`[AngleChecklist] theta_-3dB_up=${thetaLeft !== undefined ? thetaLeft.toFixed(1) + '°' : 'N/A'}`);
    console.log(`[AngleChecklist] theta_-3dB_down=${thetaRight !== undefined ? thetaRight.toFixed(1) + '°' : 'N/A'}`);
    
    console.log('\n--- Angle Sequence Issues ---');
    console.log(`[AngleChecklist] phi_breaks=${JSON.stringify(report.phi.breaks)}`);
    console.log(`[AngleChecklist] theta_breaks=${JSON.stringify(report.theta.breaks)}`);
    
    console.log('\n--- Analysis Hints ---');
    report.hints.forEach(hint => {
      console.log(`[AngleChecklist] ${hint}`);
    });
    console.log('=====================================\n');
  }

  /**
   * ??Verification A: Compare Excel vs Model for Phi Ring at θ=90°
   * 
   * This creates a diagnostic slice to verify that model.getGain() 
   * correctly interpolates Excel horizontal pattern data.
   * 
   * Call from console: window.__apViewer?.verifyPhiRing()
   */
  verifyPhiRing(modelGetGain?: (theta: number, phi: number) => number): void {
    if (!this.patternSheet) {
      console.warn('[VerifyPhiRing] No pattern sheet available. Call setPatternSheet() first.');
      return;
    }

    // Show current theta mapping mode
    const currentMode = this.patternModel?.getThetaMapMode ? this.patternModel.getThetaMapMode() : 'unknown';
    
    console.log('\n========== PHI RING VERIFICATION (θ=90°) ==========');
    console.log(`Current theta mapping mode: ${currentMode}`);
    console.log('Comparing Excel horizontal pattern vs Model interpolation\n');

    const sheet = this.patternSheet;
    const thetaTest = 90; // Horizontal plane

    // Sample every 30 degrees for readability
    const testAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    console.log('?(deg) | Excel gainDb | Model G(θ=90,?) | ?');
    console.log('-------|--------------|-----------------|-------');

    for (const phiDeg of testAngles) {
      // Find Excel value (exact or nearest)
      let excelGain = 0;
      let exactMatch = false;

      const idx = sheet.horizontal.phiDeg.indexOf(phiDeg);
      if (idx >= 0) {
        excelGain = sheet.horizontal.gainDb[idx];
        exactMatch = true;
      } else {
        // Find nearest
        let minDiff = Infinity;
        let nearestIdx = 0;
        for (let i = 0; i < sheet.horizontal.phiDeg.length; i++) {
          const diff = Math.abs(sheet.horizontal.phiDeg[i] - phiDeg);
          if (diff < minDiff) {
            minDiff = diff;
            nearestIdx = i;
          }
        }
        excelGain = sheet.horizontal.gainDb[nearestIdx];
      }

      // Get model value if provided
      let modelG = 'N/A';
      let delta = 'N/A';

      if (modelGetGain) {
        const G = modelGetGain(thetaTest, phiDeg);
        modelG = G.toFixed(2);

        // Calculate difference (model returns absolute gain G, excel is relative gainDb)
        // To compare: need to convert both to same scale
        // Excel: 0 to -30 dB (relative)
        // Model: gainMaxDbi-att (absolute)
        // Direct comparison of the attenuation component:
        const excelAtt = -excelGain; // Excel: 0=best, -10=10dB down
        const modelAtt = this.patternStats ? (this.patternStats.gMax - G) : 0;
        delta = (modelAtt - excelAtt).toFixed(2);
      }

      const marker = exactMatch ? '' : '~';
      console.log(
        `${phiDeg.toString().padStart(6)} | ` +
        `${excelGain.toFixed(2).padStart(12)}${marker} | ` +
        `${modelG.toString().padStart(15)} | ` +
        `${delta.toString().padStart(6)}`
      );
    }

    console.log('\n?? Legend:');
    console.log('  ~ = nearest neighbor (no exact match at this angle)');
    console.log('  ? = Model attenuation - Excel attenuation (should be near 0)');
    console.log('  Excel gainDb: 0=best, negative=attenuation');
    console.log('  Model G: absolute gain in dBi');
    console.log('\n??If ? values are all near 0, interpolation is correct.');
    console.log('??If Model G shows all same value (e.g., -30), theta mapping is wrong.');
    console.log('===================================================\n');

    // Summary statistics
    console.log('?? Excel Pattern Summary:');
    console.log(`  Total points: ${sheet.horizontal.phiDeg.length}`);
    console.log(`  Phi range: [${Math.min(...sheet.horizontal.phiDeg).toFixed(1)}°, ${Math.max(...sheet.horizontal.phiDeg).toFixed(1)}°]`);
    console.log(`  Gain range: [${Math.min(...sheet.horizontal.gainDb).toFixed(2)}dB, ${Math.max(...sheet.horizontal.gainDb).toFixed(2)}dB]`);

    // Find phi at max gain
    let maxIdx = 0;
    for (let i = 1; i < sheet.horizontal.gainDb.length; i++) {
      if (sheet.horizontal.gainDb[i] > sheet.horizontal.gainDb[maxIdx]) {
        maxIdx = i;
      }
    }
    console.log(`  Peak gain at ?=${sheet.horizontal.phiDeg[maxIdx].toFixed(1)}° (${sheet.horizontal.gainDb[maxIdx].toFixed(2)}dB)`);
    
    console.log('\n?�� Debugging Tips:');
    console.log('  Horizontal (phi) verification:');
    console.log('    window.__apViewer.verifyPhiRing(window.__modelGetGain)');
    console.log('  Vertical (theta) verification:');
    console.log('    window.__apViewer.verifyThetaRing(window.__modelGetGain)');
    console.log('  Direction equivalence (theta>180 fold):');
    console.log('    window.__apViewer.verifyThetaFold(window.__modelGetGain)');
    console.log('  Change theta mapping mode (rebuilds immediately):');
    console.log('    window.__apViewer.setThetaMapMode("identity")     // No transformation');
    console.log('    window.__apViewer.setThetaMapMode("flip180")      // θ ??180-θ');
    console.log('    window.__apViewer.setThetaMapMode("shift90minus") // θ ??90-θ');
    console.log('    window.__apViewer.setThetaMapMode("shift90plus")  // θ ??θ-90');
    console.log('  Mode persists across modal reopening.');
  }

  /**
   * Phase 5A-Vert-1: Verify vertical theta mapping by comparing Excel vertical vs Model
   * 
   * Tests multiple theta mapping candidates to find which one matches Excel vertical data.
   * This diagnoses vertical mismatch without changing synthesis formula.
   * 
   * Usage: window.__apViewer.verifyThetaRing(window.__modelGetGain)
   */
  verifyThetaRing(modelGetGain?: (theta: number, phi: number) => number): void {
    if (!this.patternSheet) {
      console.warn('[VerifyThetaRing] No pattern sheet available. Call setPatternSheet() first.');
      return;
    }

    if (!modelGetGain) {
      console.error('[VerifyThetaRing] No modelGetGain function provided');
      return;
    }

    const sheet = this.patternSheet;
    const stats = this.patternStats;

    if (!stats) {
      console.error('[VerifyThetaRing] No pattern stats available');
      return;
    }

    // Find phi_peak from horizontal pattern
    let phiPeakIdx = 0;
    for (let i = 1; i < sheet.horizontal.gainDb.length; i++) {
      if (sheet.horizontal.gainDb[i] > sheet.horizontal.gainDb[phiPeakIdx]) {
        phiPeakIdx = i;
      }
    }
    const phiPeak = sheet.horizontal.phiDeg[phiPeakIdx];

    console.log('\n========== THETA RING VERIFICATION ==========');
    console.log(`Testing vertical pattern at ?_peak=${phiPeak.toFixed(1)}°`);
    console.log(`Excel vertical has ${sheet.vertical.thetaDeg.length} points`);
    console.log(`Pattern stats: gMin=${stats.gMin.toFixed(2)}, gMax=${stats.gMax.toFixed(2)}\n`);

    // Define theta mapping candidates
    const candidates = [
      { name: 'A: identity', map: (thetaE: number) => thetaE },
      { name: 'B: flip180', map: (thetaE: number) => 180 - thetaE },
      { name: 'C: shift+90', map: (thetaE: number) => (thetaE + 90) % 360 },
      { name: 'D: shift-90', map: (thetaE: number) => ((thetaE - 90) + 360) % 360 },
    ];

    // Sample every 10 degrees for readability
    const testAngles: number[] = [];
    for (let theta = 0; theta <= 180; theta += 10) {
      testAngles.push(theta);
    }

    // Test each candidate
    for (const candidate of candidates) {
      console.log(`\n--- Candidate ${candidate.name} ---`);
      console.log('θ_Excel | Excel gainDb | Model G | ?_att');
      console.log('--------|--------------|---------|-------');

      let sumAbsDelta = 0;
      let maxAbsDelta = 0;
      let clampCount = 0;
      let validCount = 0;

      for (const thetaExcel of testAngles) {
        // Find Excel vertical gain at this theta (exact or nearest)
        let excelGain = 0;
        let exactMatch = false;

        const idx = sheet.vertical.thetaDeg.indexOf(thetaExcel);
        if (idx >= 0) {
          excelGain = sheet.vertical.gainDb[idx];
          exactMatch = true;
        } else {
          // Find nearest
          let minDiff = Infinity;
          let nearestIdx = 0;
          for (let i = 0; i < sheet.vertical.thetaDeg.length; i++) {
            const diff = Math.abs(sheet.vertical.thetaDeg[i] - thetaExcel);
            if (diff < minDiff) {
              minDiff = diff;
              nearestIdx = i;
            }
          }
          excelGain = sheet.vertical.gainDb[nearestIdx];
        }

        // Map thetaExcel to thetaViewer using candidate mapping
        const thetaViewer = candidate.map(thetaExcel);

        // Get model gain
        const modelG = modelGetGain(thetaViewer, phiPeak);

        // Calculate attenuation delta
        // Excel: 0=best, negative=attenuation
        // Model: absolute gain in dBi
        const excelAtt = -excelGain; // Convert to attenuation (0=best, positive=worse)
        const modelAtt = stats.gMax - modelG; // Model attenuation from peak

        const delta = modelAtt - excelAtt;

        // Check if clamped to floor
        const isClamped = Math.abs(modelG - (stats.gMax - 30)) < 0.1; // Within 0.1 of floor

        const marker = exactMatch ? '' : '~';
        console.log(
          `${thetaExcel.toString().padStart(7)} | ` +
          `${excelGain.toFixed(2).padStart(12)}${marker} | ` +
          `${modelG.toFixed(2).padStart(7)} | ` +
          `${delta.toFixed(2).padStart(6)}${isClamped ? ' ?��?' : ''}`
        );

        sumAbsDelta += Math.abs(delta);
        maxAbsDelta = Math.max(maxAbsDelta, Math.abs(delta));
        if (isClamped) clampCount++;
        validCount++;
      }

      const meanAbsDelta = validCount > 0 ? sumAbsDelta / validCount : 0;

      console.log('\n?? Summary:');
      console.log(`  Mean |?|: ${meanAbsDelta.toFixed(2)} dB`);
      console.log(`  Max |?|: ${maxAbsDelta.toFixed(2)} dB`);
      console.log(`  Clamped points: ${clampCount}/${validCount} (?��? = at floor)`);
      
      if (clampCount > validCount * 0.5) {
        console.log('  ??Most points clamped - wrong mapping or vertical data issue');
      } else if (meanAbsDelta < 2.0) {
        console.log('  ??Good match! This mapping likely correct');
      } else if (meanAbsDelta < 5.0) {
        console.log('  ?��?  Moderate match - may need offset adjustment');
      } else {
        console.log('  ??Poor match - wrong mapping');
      }
    }

    console.log('\n?? Legend:');
    console.log('  ~ = nearest neighbor (no exact match)');
    console.log('  ?_att = Model attenuation - Excel attenuation');
    console.log('  ?��?  = Model gain clamped to floor (gMax - 30)');
    console.log('  Good match: Mean |?| < 2 dB, Max |?| < 5 dB, few clamped points');
    console.log('\n?�� If all candidates poor:');
    console.log('  - Check if Excel vertical is elevation (±90) vs colatitude (0-180)');
    console.log('  - Try: window.__apDbgTheta = true; then test modelGetGain manually');
    console.log('=============================================\n');
  }

  /**
   * Phase 5A-Fold: Verify theta>180 direction equivalence
   * 
   * Tests that G(theta>180, phi) != G(theta, phi) (no unwanted symmetry)
   * and that G(360-theta, phi) ??G(theta, phi+180) (correct direction equivalence)
   * 
   * Usage: window.__apViewer.verifyThetaFold(window.__modelGetGain)
   */
  verifyThetaFold(modelGetGain?: (theta: number, phi: number) => number): void {
    if (!modelGetGain) {
      console.error('[VerifyThetaFold] No modelGetGain function provided');
      return;
    }

    console.log('\n========== THETA>180 FOLD VERIFICATION ==========');
    console.log('Testing spherical direction equivalence:\n');
    console.log('??BAD (mirror bug): G(t,?) == G(360-t,?)');
    console.log('??GOOD (correct): G(360-t,?) ??G(t,?+180)\n');

    // Test at multiple phi angles
    const testPhis = [0, 90, 180, 270, 309];
    const testThetas = [10, 30, 60, 90, 120, 150, 170];

    console.log('Test 1: Check for unwanted mirror symmetry');
    console.log('θ | ? | G(θ,?) | G(360-θ,?) | ? (should be >0.1)');
    console.log('--|---|--------|------------|-------------------');

    let mirrorMatchCount = 0;
    let totalTests = 0;

    for (const theta of testThetas) {
      const phi = testPhis[0]; // Use first phi for this test
      const G1 = modelGetGain(theta, phi);
      const G2 = modelGetGain(360 - theta, phi);
      const delta = Math.abs(G1 - G2);

      console.log(
        `${theta.toString().padStart(2)} | ` +
        `${phi.toString().padStart(3)} | ` +
        `${G1.toFixed(2).padStart(6)} | ` +
        `${G2.toFixed(2).padStart(10)} | ` +
        `${delta.toFixed(2).padStart(4)} ${delta < 0.1 ? '✗MIRROR' : '✓'}`
      );

      if (delta < 0.1) mirrorMatchCount++;
      totalTests++;
    }

    console.log(`\nMirror matches: ${mirrorMatchCount}/${totalTests} (should be 0)`);

    console.log('\nTest 2: Check direction equivalence');
    console.log('θ | ? | G(360-θ,?) | G(θ,?+180) | ? (should be <0.5)');
    console.log('--|---|------------|------------|-------------------');

    let equivMatchCount = 0;
    totalTests = 0;

    for (const theta of testThetas) {
      for (const phi of testPhis) {
        const G1 = modelGetGain(360 - theta, phi);
        const G2 = modelGetGain(theta, (phi + 180) % 360);
        const delta = Math.abs(G1 - G2);

        if (totalTests < 7) { // Show first 7 for readability
          console.log(
            `${theta.toString().padStart(2)} | ` +
            `${phi.toString().padStart(3)} | ` +
            `${G1.toFixed(2).padStart(10)} | ` +
            `${G2.toFixed(2).padStart(10)} | ` +
            `${delta.toFixed(2).padStart(4)} ${delta < 0.5 ? '✓' : '✗'}`
          );
        }

        if (delta < 0.5) equivMatchCount++;
        totalTests++;
      }
    }

    console.log(`\nDirection equivalence: ${equivMatchCount}/${totalTests} (should be >${totalTests * 0.8})`);

    console.log('\n?? Summary:');
    if (mirrorMatchCount === 0 && equivMatchCount > totalTests * 0.8) {
      console.log('  ??Theta fold is working correctly!');
      console.log('  - No unwanted mirror symmetry');
      console.log('  - Direction equivalence holds');
    } else if (mirrorMatchCount > totalTests * 0.5) {
      console.log('  ??Mirror symmetry bug detected!');
      console.log('  - G(t,?) == G(360-t,?) indicates theta>180 not handled');
    } else {
      console.log('  ?��?  Partial fix or other issues');
      console.log(`  - Mirror matches: ${mirrorMatchCount} (should be 0)`);
      console.log(`  - Equiv matches: ${equivMatchCount} (should be >${totalTests * 0.8})`);
    }

    console.log('\n?�� Debug tip: window.__apDbgThetaFold = true; then call modelGetGain manually');
    console.log('=================================================\n');
  }

  /**
   * Phase 5A-Fold: Debug theta fold spatial plane mapping
   * 
   * Verifies that theta>180 points map to opposite azimuth (phi+180) in 3D space,
   * not to same azimuth plane (mirror bug).
   * 
   * Usage: window.__apViewer.debugThetaFoldPlane(309, 150, 210, 1)
   * 
   * @param phiDeg - Azimuth angle (default: phi_peak from horizontal pattern)
   * @param tA - Theta angle in front hemisphere (default: 150)
   * @param tB - Theta angle in back hemisphere (default: 210)
   * @param r - Radius for spatial calculation (default: 1)
   */
  debugThetaFoldPlane(phiDeg?: number, tA: number = 150, tB: number = 210, r: number = 1): void {
    // Find phi_peak if not provided
    if (phiDeg === undefined) {
      if (this.patternSheet) {
        let maxIdx = 0;
        for (let i = 1; i < this.patternSheet.horizontal.gainDb.length; i++) {
          if (this.patternSheet.horizontal.gainDb[i] > this.patternSheet.horizontal.gainDb[maxIdx]) {
            maxIdx = i;
          }
        }
        phiDeg = this.patternSheet.horizontal.phiDeg[maxIdx];
      } else {
        phiDeg = 0;
      }
    }

    console.log('\n========== THETA FOLD PLANE DEBUG ==========');
    console.log(`Testing spatial mapping: phi=${phiDeg.toFixed(1)}°, tA=${tA}°, tB=${tB}°, r=${r}\n`);

    // Helper: spherical to cartesian - USE CLASS METHOD
    const sphericalToCartesian = (thetaDeg: number, phiDeg: number, r: number): Vector3 => {
      return this.sphericalToCartesian(thetaDeg, phiDeg, r);
    };

    // Helper: get azimuth from XZ projection
    const getAzimuth = (v: Vector3): number => {
      let az = Math.atan2(v.z, v.x) * 180 / Math.PI;
      if (az < 0) az += 360;
      return az;
    };

    // WRONG behavior (no fold): both points use same phi
    const pA_wrong = sphericalToCartesian(tA, phiDeg, r);
    const pB_wrong = sphericalToCartesian(tB, phiDeg, r);
    const azA_wrong = getAzimuth(pA_wrong);
    const azB_wrong = getAzimuth(pB_wrong);
    const deltaAz_wrong = Math.abs(azA_wrong - azB_wrong);

    // CORRECT behavior (with fold): tB>180 maps to phi+180
    let thetaA = tA;
    let phiA = phiDeg;
    let thetaB = tB;
    let phiB = phiDeg;

    if (thetaB > 180) {
      thetaB = 360 - thetaB;
      phiB = (phiDeg + 180) % 360;
    }

    const pA_good = sphericalToCartesian(thetaA, phiA, r);
    const pB_good = sphericalToCartesian(thetaB, phiB, r);
    const azA_good = getAzimuth(pA_good);
    const azB_good = getAzimuth(pB_good);
    const deltaAz_good = Math.abs(azA_good - azB_good);

    console.log('--- WRONG (mirror bug): tB uses same phi ---');
    console.log(`  Point A (t=${tA}, ?=${phiDeg.toFixed(1)}°):`);
    console.log(`    xyz = (${pA_wrong.x.toFixed(3)}, ${pA_wrong.y.toFixed(3)}, ${pA_wrong.z.toFixed(3)})`);
    console.log(`    azimuth = ${azA_wrong.toFixed(1)}°`);
    console.log(`  Point B (t=${tB}, ?=${phiDeg.toFixed(1)}°):`);
    console.log(`    xyz = (${pB_wrong.x.toFixed(3)}, ${pB_wrong.y.toFixed(3)}, ${pB_wrong.z.toFixed(3)})`);
    console.log(`    azimuth = ${azB_wrong.toFixed(1)}°`);
    console.log(`  Azimuth delta: ${deltaAz_wrong.toFixed(1)}° (expect <20° if mirrored to same plane)`);

    console.log('\n--- CORRECT (with fold): tB uses phi+180 ---');
    console.log(`  Point A (t=${thetaA}, ?=${phiA.toFixed(1)}°):`);
    console.log(`    xyz = (${pA_good.x.toFixed(3)}, ${pA_good.y.toFixed(3)}, ${pA_good.z.toFixed(3)})`);
    console.log(`    azimuth = ${azA_good.toFixed(1)}°`);
    console.log(`  Point B (t=${thetaB}, ?=${phiB.toFixed(1)}°):`);
    console.log(`    xyz = (${pB_good.x.toFixed(3)}, ${pB_good.y.toFixed(3)}, ${pB_good.z.toFixed(3)})`);
    console.log(`    azimuth = ${azB_good.toFixed(1)}°`);
    console.log(`  Azimuth delta: ${deltaAz_good.toFixed(1)}° (expect ~180° if correctly flipped)`);

    console.log('\n?? Summary:');
    if (deltaAz_wrong < 20 && deltaAz_good > 160) {
      console.log('  ??Fold is working! Points map to opposite azimuth planes.');
    } else if (deltaAz_wrong < 20 && deltaAz_good < 20) {
      console.log('  ??Mirror bug! Both scenarios show same azimuth plane.');
    } else {
      console.log('  ?��?  Unexpected pattern. Check coordinates manually.');
    }
    console.log('============================================\n');
  }

  /**
   * Phase 5A-Fold: Verify theta fold direction equivalence with clamp detection
   * 
   * Tests that:
   * 1. G(t,phi) != G(360-t,phi) - no unwanted mirror symmetry
   * 2. G(360-t,phi) ??G(t,phi+180) - correct direction equivalence
   * 
   * Avoids false positives from clamped values (floor ??-30 dB).
   * 
   * Usage: window.__apViewer.verifyThetaFoldEquivalence(window.__modelGetGain)
   * 
   * @param modelGetGain - Model gain function
   * @param phiList - List of phi angles to test (default includes phi_peak)
   * @param tList - List of theta angles to test (default: 30-150)
   * @param clampFloor - Gain threshold for clamp detection (default: -29.9)
   */
  verifyThetaFoldEquivalence(
    modelGetGain?: (theta: number, phi: number) => number,
    phiList?: number[],
    tList?: number[],
    clampFloor: number = -29.9
  ): void {
    if (!modelGetGain) {
      console.error('[VerifyThetaFoldEquiv] No modelGetGain function provided');
      return;
    }

    // Default theta list
    if (!tList) {
      tList = [30, 60, 90, 120, 150];
    }

    // Default phi list (include phi_peak if available)
    if (!phiList) {
      phiList = [0, 90, 180, 270];
      if (this.patternSheet) {
        let maxIdx = 0;
        for (let i = 1; i < this.patternSheet.horizontal.gainDb.length; i++) {
          if (this.patternSheet.horizontal.gainDb[i] > this.patternSheet.horizontal.gainDb[maxIdx]) {
            maxIdx = i;
          }
        }
        const phiPeak = this.patternSheet.horizontal.phiDeg[maxIdx];
        phiList.push(phiPeak);
      }
    }

    console.log('\n========== THETA FOLD EQUIVALENCE VERIFICATION ==========');
    console.log('Testing direction equivalence with clamp detection\n');
    console.log('Legend:');
    console.log('  g1 = G(t, ?)');
    console.log('  g2 = G(360-t, ?)     [should differ from g1]');
    console.log('  g3 = G(t, ?+180)     [should match g2]');
    console.log('  d_mirror = |g1-g2|   [should be >0.1]');
    console.log('  d_equiv = |g2-g3|    [should be <0.5]');
    console.log('  (C) = clamped (near floor, excluded from stats)\n');

    let mirrorSuspects = 0;
    let equivOk = 0;
    let totalValid = 0;
    let totalClamped = 0;

    console.log('  θ |   ? |    g1 |    g2 |    g3 | d_mir | d_eqv | Status');
    console.log('----|-----|-------|-------|-------|-------|-------|--------');

    for (const phi of phiList) {
      for (const t of tList) {
        const g1 = modelGetGain(t, phi);
        const g2 = modelGetGain(360 - t, phi);
        const g3 = modelGetGain(t, (phi + 180) % 360);

        const d_mirror = Math.abs(g1 - g2);
        const d_equiv = Math.abs(g2 - g3);

        // Check if clamped
        const isClamped = (g1 <= clampFloor) || (g2 <= clampFloor) || (g3 <= clampFloor);

        let status = '';
        if (isClamped) {
          status = '(C)';
          totalClamped++;
        } else {
          totalValid++;
          
          // Check mirror (should NOT match)
          if (d_mirror < 0.1) {
            status += '?�MIR ';
            mirrorSuspects++;
          }
          
          // Check equivalence (should match)
          if (d_equiv < 0.5) {
            status += '?�EQV';
            equivOk++;
          } else {
            status += '?�EQV';
          }
        }

        console.log(
          `${t.toString().padStart(3)} | ` +
          `${phi.toFixed(0).padStart(3)} | ` +
          `${g1.toFixed(2).padStart(5)} | ` +
          `${g2.toFixed(2).padStart(5)} | ` +
          `${g3.toFixed(2).padStart(5)} | ` +
          `${d_mirror.toFixed(2).padStart(5)} | ` +
          `${d_equiv.toFixed(2).padStart(5)} | ` +
          status
        );
      }
    }

    console.log('\n?? Statistics:');
    console.log(`  Total tests: ${phiList.length * tList.length}`);
    console.log(`  Valid (non-clamped): ${totalValid}`);
    console.log(`  Clamped (excluded): ${totalClamped}`);
    console.log(`  Mirror suspects (d_mirror<0.1): ${mirrorSuspects}/${totalValid} (expect 0)`);
    console.log(`  Equiv OK (d_equiv<0.5): ${equivOk}/${totalValid} (expect >${Math.floor(totalValid * 0.8)})`);

    console.log('\n?? Assessment:');
    if (totalValid === 0) {
      console.log('  ?��?  All points clamped - cannot verify. Try different angles or check aMax setting.');
    } else if (mirrorSuspects === 0 && equivOk > totalValid * 0.8) {
      console.log('  ??Theta fold is working correctly!');
      console.log('     - No mirror symmetry detected');
      console.log('     - Direction equivalence holds');
    } else if (mirrorSuspects > totalValid * 0.5) {
      console.log('  ??Mirror symmetry bug detected!');
      console.log('     - Many points have G(t,?) ??G(360-t,?)');
      console.log('     - Theta>180 not being folded correctly');
    } else {
      console.log('  ?��?  Partial issues detected:');
      console.log(`     - Mirror suspects: ${mirrorSuspects} (should be 0)`);
      console.log(`     - Equiv matches: ${equivOk} (should be >${Math.floor(totalValid * 0.8)})`);
    }

    console.log('\n?�� Tips:');
    console.log('  - (C) marks clamped points excluded from statistics');
    console.log('  - Use different tList/phiList to test more angles');
    console.log('  - Lower clampFloor if your pattern has different floor');
    console.log('=========================================================\n');
  }

  /**
   * Phase 5A-5: Verify vertical pattern at phi_peak
   * Scans theta from 0 to 180 to check if theta=90 has best gain (not worst)
   * 
   * Usage: window.__apViewer.verifyVerticalAtPhiPeak(window.__modelGetGain, 309)
   */
  verifyVerticalAtPhiPeak(modelGetGain?: (theta: number, phi: number) => number, phiPeak?: number): void {
    if (!modelGetGain) {
      console.error('[VerifyVertical] No modelGetGain function provided');
      return;
    }

    // Use phi_peak from pattern sheet if available
    if (!phiPeak && this.patternSheet) {
      let maxIdx = 0;
      for (let i = 1; i < this.patternSheet.horizontal.gainDb.length; i++) {
        if (this.patternSheet.horizontal.gainDb[i] > this.patternSheet.horizontal.gainDb[maxIdx]) {
          maxIdx = i;
        }
      }
      phiPeak = this.patternSheet.horizontal.phiDeg[maxIdx];
    }

    if (!phiPeak) {
      console.error('[VerifyVertical] No phi_peak available. Provide as parameter.');
      return;
    }

    console.log(`\n========== VERTICAL SCAN at ?=${phiPeak.toFixed(1)}° ==========`);
    console.log('Checking if θ=90° (horizontal) has good gain (not clamped to -30)\n');

    console.log('θ(deg) | Model G(θ,?_peak)');
    console.log('-------|------------------');

    let maxG = -Infinity;
    let maxTheta = 0;

    for (let theta = 0; theta <= 180; theta += 10) {
      const G = modelGetGain(theta, phiPeak);
      console.log(`${theta.toString().padStart(6)} | ${G.toFixed(2).padStart(17)}`);
      
      if (G > maxG) {
        maxG = G;
        maxTheta = theta;
      }
    }

    console.log('\n?? Analysis:');
    console.log(`  Max gain: ${maxG.toFixed(2)} dB at θ=${maxTheta}°`);
    console.log(`  Gain at θ=90°: ${modelGetGain(90, phiPeak).toFixed(2)} dB`);
    
    if (maxTheta === 90) {
      console.log('  ??θ=90° has maximum gain (correct!)');
    } else if (Math.abs(maxTheta - 90) <= 10) {
      console.log(`  ?��?  θ=${maxTheta}° is close to 90° (acceptable)`);
    } else {
      console.log(`  ??θ=${maxTheta}° is far from 90° (theta mapping may be wrong)`);
    }

    const G90 = modelGetGain(90, phiPeak);
    if (G90 < -25) {
      console.log(`  ??θ=90° gain is very low (${G90.toFixed(2)}), likely clamped by attV`);
    }

    console.log('=============================================\n');
  }

  /**
   * Phase 5A-5: Find best phi at theta=90
   * Should be close to phi_peak from horizontal pattern
   * 
   * Usage: window.__apViewer.findBestPhiAtTheta90(window.__modelGetGain)
   */
  findBestPhiAtTheta90(modelGetGain?: (theta: number, phi: number) => number): void {
    if (!modelGetGain) {
      console.error('[FindBestPhi] No modelGetGain function provided');
      return;
    }

    console.log('\n========== BEST PHI SEARCH at θ=90° ==========');
    console.log('Finding phi with maximum gain at horizontal plane\n');

    let maxG = -Infinity;
    let maxPhi = 0;

    for (let phi = 0; phi < 360; phi += 10) {
      const G = modelGetGain(90, phi);
      if (G > maxG) {
        maxG = G;
        maxPhi = phi;
      }
    }

    console.log(`  Best phi: ${maxPhi}° (gain: ${maxG.toFixed(2)} dB)`);

    // Compare with Excel horizontal peak
    if (this.patternSheet) {
      let maxIdx = 0;
      for (let i = 1; i < this.patternSheet.horizontal.gainDb.length; i++) {
        if (this.patternSheet.horizontal.gainDb[i] > this.patternSheet.horizontal.gainDb[maxIdx]) {
          maxIdx = i;
        }
      }
      const excelPhiPeak = this.patternSheet.horizontal.phiDeg[maxIdx];
      const diff = Math.abs(maxPhi - excelPhiPeak);
      
      console.log(`  Excel phi_peak: ${excelPhiPeak.toFixed(1)}°`);
      console.log(`  Difference: ${diff.toFixed(1)}°`);
      
      if (diff <= 20) {
        console.log('  ??Model phi peak matches Excel (correct!)');
      } else {
        console.log('  ??Model phi peak differs from Excel (may indicate issue)');
      }
    }

    console.log('==============================================\n');
  }

  /**
   * Resize engine to match canvas dimensions
   * Call this when canvas size changes
   */
  resize(): void {
    if (this.engine) {
      this.engine.resize();
    }
  }

  /**
   * Clean up all Babylon resources
   * Must be called before viewer is destroyed
   */
  dispose(): void {
    try {
      // Dispose reference rings
      if (this.ringRoot) {
        this.ringRoot.dispose();
        this.ringRoot = null;
      }
      this.ringMarkers.forEach(m => m.dispose());
      this.ringMarkers = [];
      if (this.tooltipLabel) {
        this.tooltipLabel.dispose();
        this.tooltipLabel = null;
      }

      if (this.mesh) {
        this.mesh.dispose();
        this.mesh = null;
      }

      if (this.scene) {
        this.scene.dispose();
        this.scene = null;
      }

      if (this.engine) {
        this.engine.dispose();
        this.engine = null;
      }

      this.camera = null;

      console.log('[AntennaPatternViewer] disposed');
    } catch (err) {
      console.error('[AntennaPatternViewer] dispose error', err);
    }
  }
}

/**
 * Parse CSS color string to normalized RGB values [0, 1]
 * Supports "#rrggbb" and "rgb(r, g, b)" formats
 */
function cssToRgb01(css: string): [number, number, number] {
  let r = 255, g = 255, b = 255;

  if (css.startsWith('#')) {
    // Parse "#rrggbb" format
    r = parseInt(css.substring(1, 3), 16);
    g = parseInt(css.substring(3, 5), 16);
    b = parseInt(css.substring(5, 7), 16);
  } else if (css.startsWith('rgb')) {
    // Parse "rgb(r, g, b)" format
    const match = css.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10);
      g = parseInt(match[1], 10);
      b = parseInt(match[2], 10);
    }
  }

  return [r / 255, g / 255, b / 255];
}
