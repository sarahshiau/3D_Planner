import { Injectable } from '@angular/core';
import { PatternSheet } from './antenna-pattern.types';

/**
 * Options for creating an antenna pattern model
 */
export interface PatternModelOptions {
  /** Maximum attenuation in dB (default: 30) */
  aMax?: number;
  /** Override main gain in dBi (default: from sheet.meta.mainGainDbi or 0) */
  gainMaxDbi?: number;
}

/**
 * Statistics about the pattern model
 */
export interface PatternStats {
  /** Minimum gain in dBi */
  gMin: number;
  /** Maximum gain in dBi */
  gMax: number;
}

/**
 * Queryable antenna pattern model
 */
export interface PatternModel {
  /**
   * Get gain at specified angles
   * @param thetaDeg Elevation angle in degrees [0..360], typically [0..180] for rendering
   * @param phiDeg Azimuth angle in degrees [0..360]
   * @returns Gain in dBi
   */
  getGain(thetaDeg: number, phiDeg: number): number;
  
  /** Statistics about the pattern */
  stats: PatternStats;
}

/**
 * Service for creating queryable antenna pattern models
 * 
 * This service converts PatternSheet data (from XLSX) into a model
 * that can interpolate and synthesize gain values at any angle.
 * 
 * MVP synthesis strategy:
 * - Horizontal H(phi) and Vertical V(theta) are relative attenuation (dB)
 * - Attenuation A = clamp(H(phi) + V(theta), 0, aMax)
 * - Absolute gain G = gainMaxDbi - A
 */
@Injectable({
  providedIn: 'root'
})
export class AntennaPatternModelService {
  private readonly DEFAULT_A_MAX = 30; // dB
  private readonly SAMPLE_STEPS = 36; // For stats estimation (10° steps)

  /**
   * Create a queryable pattern model from sheet data
   * 
   * @param sheet Pattern data from XLSX
   * @param opts Optional parameters (aMax, gainMaxDbi)
   * @returns PatternModel with getGain() function and stats
   */
  createModel(sheet: PatternSheet, opts?: PatternModelOptions): PatternModel {
    const aMax = opts?.aMax ?? this.DEFAULT_A_MAX;
    const gainMaxDbi = opts?.gainMaxDbi ?? sheet.meta.mainGainDbi ?? 0;

    // Validate input data
    this.validateSheet(sheet);

    // Create interpolators for horizontal and vertical patterns
    const horizontalInterp = this.createLinearInterpolator(
      sheet.horizontal.phiDeg,
      sheet.horizontal.gainDb,
      true // Wrap at 360 degrees
    );

    const verticalInterp = this.createLinearInterpolator(
      sheet.vertical.thetaDeg,
      sheet.vertical.gainDb,
      true // Wrap at 360 degrees
    );

    // Debug: sample pattern at key angles (print once)
    console.log('[PatternModel] phiDeg head/tail', {
      head: sheet.horizontal.phiDeg.slice(0, 6),
      tail: sheet.horizontal.phiDeg.slice(-6),
    });

    console.log('[PatternModel] sanity', {
      gainMaxDbi,
      aMax,
      gH0: horizontalInterp(0),
      gH90: horizontalInterp(90),
      gH180: horizontalInterp(180),
      gH270: horizontalInterp(270),
      gV0: verticalInterp(0),
      gV90: verticalInterp(90),
      gV180: verticalInterp(180),
    });

    // Create getGain function
    const getGain = (thetaDeg: number, phiDeg: number): number => {
      // Get relative gain from horizontal and vertical patterns (Excel: 0..-30 dB)
      const gH = horizontalInterp(phiDeg);
      const gV = verticalInterp(thetaDeg);

      // Convert negative gain to positive attenuation
      // If gH = 0 (main lobe), attH = 0
      // If gH = -10 (side lobe), attH = 10
      const attH = Math.max(0, Math.min(aMax, -gH));
      const attV = Math.max(0, Math.min(aMax, -gV));

      // Synthesize total attenuation
      const att = Math.max(0, Math.min(aMax, attH + attV));

      // Convert to absolute gain: G = gainMaxDbi - attenuation
      const G = gainMaxDbi - att;

      return G;
    };

    // Calculate stats by sampling the pattern
    const stats = this.calculateStats(getGain, aMax, gainMaxDbi);

    return { getGain, stats };
  }

  /**
   * Validate sheet data
   * @throws Error if data is invalid
   */
  private validateSheet(sheet: PatternSheet): void {
    if (!sheet.horizontal?.phiDeg?.length || !sheet.horizontal?.gainDb?.length) {
      throw new Error('Invalid horizontal pattern: missing phiDeg or gainDb arrays');
    }

    if (!sheet.vertical?.thetaDeg?.length || !sheet.vertical?.gainDb?.length) {
      throw new Error('Invalid vertical pattern: missing thetaDeg or gainDb arrays');
    }

    if (sheet.horizontal.phiDeg.length !== sheet.horizontal.gainDb.length) {
      throw new Error('Horizontal pattern: phiDeg and gainDb arrays have different lengths');
    }

    if (sheet.vertical.thetaDeg.length !== sheet.vertical.gainDb.length) {
      throw new Error('Vertical pattern: thetaDeg and gainDb arrays have different lengths');
    }
  }

  /**
   * Create a linear interpolator for 1D data
   * 
   * @param xValues X coordinates (e.g., angles in degrees)
   * @param yValues Y coordinates (e.g., gain values)
   * @param wrap Whether to wrap at 360 degrees
   * @returns Interpolation function
   */
  private createLinearInterpolator(
    xValues: number[],
    yValues: number[],
    wrap: boolean
  ): (x: number) => number {
    if (xValues.length === 0) {
      return () => 0;
    }

    return (x: number): number => {
      // Wrap angle to [0, 360) if needed
      if (wrap) {
        x = ((x % 360) + 360) % 360;
      }

      // Find surrounding points
      let i0 = 0;
      let i1 = 0;

      // Binary search for efficiency with sorted data
      if (x <= xValues[0]) {
        // Before first point
        if (wrap && xValues[xValues.length - 1] < 360) {
          // Wrap: interpolate between last and first
          i0 = xValues.length - 1;
          i1 = 0;
          const x0 = xValues[i0] - 360;
          const x1 = xValues[i1];
          const t = (x - x0) / (x1 - x0);
          return yValues[i0] + t * (yValues[i1] - yValues[i0]);
        }
        return yValues[0];
      }

      if (x >= xValues[xValues.length - 1]) {
        // After last point
        if (wrap) {
          // Wrap: interpolate between last and first
          i0 = xValues.length - 1;
          i1 = 0;
          const x0 = xValues[i0];
          const x1 = xValues[i1] + 360;
          const t = (x - x0) / (x1 - x0);
          return yValues[i0] + t * (yValues[i1] - yValues[i0]);
        }
        return yValues[xValues.length - 1];
      }

      // Find bracketing indices
      for (let i = 0; i < xValues.length - 1; i++) {
        if (x >= xValues[i] && x <= xValues[i + 1]) {
          i0 = i;
          i1 = i + 1;
          break;
        }
      }

      // Linear interpolation
      const x0 = xValues[i0];
      const x1 = xValues[i1];
      const y0 = yValues[i0];
      const y1 = yValues[i1];

      if (x1 === x0) {
        return y0;
      }

      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    };
  }

  /**
   * Calculate pattern statistics by sampling
   * 
   * Samples the pattern at regular intervals to estimate min/max gain
   * 
   * @param getGain Gain function to sample
   * @param aMax Maximum attenuation (for theoretical bounds)
   * @param gainMaxDbi Maximum gain (for theoretical bounds)
   * @returns Pattern statistics
   */
  private calculateStats(
    getGain: (theta: number, phi: number) => number,
    aMax: number,
    gainMaxDbi: number
  ): PatternStats {
    let gMin = Infinity;
    let gMax = -Infinity;

    // Sample pattern at regular intervals
    const thetaStep = 180 / this.SAMPLE_STEPS;
    const phiStep = 360 / this.SAMPLE_STEPS;

    for (let theta = 0; theta <= 180; theta += thetaStep) {
      for (let phi = 0; phi < 360; phi += phiStep) {
        const g = getGain(theta, phi);
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
      }
    }

    // Fallback to theoretical bounds if sampling failed
    if (!isFinite(gMin) || !isFinite(gMax)) {
      gMin = gainMaxDbi - aMax;
      gMax = gainMaxDbi;
    }

    return { gMin, gMax };
  }

  /**
   * Generate angle checklist report for debugging Excel angle definitions
   * 
   * Analyzes horizontal/vertical patterns to find peaks, -3dB points,
   * and detect angle sequence issues.
   * 
   * @param sheet Pattern sheet data
   * @returns Checklist report object
   */
  generateAngleChecklist(sheet: PatternSheet): AngleChecklistReport {
    const hPhi = sheet.horizontal.phiDeg;
    const hGain = sheet.horizontal.gainDb;
    const vTheta = sheet.vertical.thetaDeg;
    const vGain = sheet.vertical.gainDb;

    // Find peaks (max gain)
    const phiPeakIdx = this.findMaxIndex(hGain);
    const thetaPeakIdx = this.findMaxIndex(vGain);

    const phiPeak = hPhi[phiPeakIdx];
    const thetaPeak = vTheta[thetaPeakIdx];
    const phiPeakGain = hGain[phiPeakIdx];
    const thetaPeakGain = vGain[thetaPeakIdx];

    // Find -3dB points
    const phiMinus3dB = this.find3dBPoints(hPhi, hGain, phiPeakGain);
    const thetaMinus3dB = this.find3dBPoints(vTheta, vGain, thetaPeakGain);

    // Detect angle breaks (non-monotonic sequences)
    const phiBreaks = this.detectAngleBreaks(hPhi);
    const thetaBreaks = this.detectAngleBreaks(vTheta);

    // Generate hints
    const hints = this.generateHints({
      phiPeak,
      thetaPeak,
      phiBreaks,
      thetaBreaks,
      phiRange: [Math.min(...hPhi), Math.max(...hPhi)],
      thetaRange: [Math.min(...vTheta), Math.max(...vTheta)],
    });

    return {
      phi: {
        peak: phiPeak,
        peakGain: phiPeakGain,
        minus3dB: phiMinus3dB,
        breaks: phiBreaks,
      },
      theta: {
        peak: thetaPeak,
        peakGain: thetaPeakGain,
        minus3dB: thetaMinus3dB,
        breaks: thetaBreaks,
      },
      hints,
    };
  }

  private findMaxIndex(values: number[]): number {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > maxVal) {
        maxVal = values[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  private find3dBPoints(
    angles: number[],
    gains: number[],
    peakGain: number
  ): { left?: number; right?: number } {
    const target = peakGain - 3;
    let leftAngle: number | undefined;
    let rightAngle: number | undefined;
    let leftDiff = Infinity;
    let rightDiff = Infinity;

    for (let i = 0; i < angles.length; i++) {
      const diff = Math.abs(gains[i] - target);
      const angle = angles[i];

      // Left side: angles < 180
      if (angle < 180 && diff < leftDiff) {
        leftDiff = diff;
        leftAngle = angle;
      }

      // Right side: angles >= 180
      if (angle >= 180 && diff < rightDiff) {
        rightDiff = diff;
        rightAngle = angle;
      }
    }

    return { left: leftAngle, right: rightAngle };
  }

  private detectAngleBreaks(angles: number[]): number[] {
    const breaks: number[] = [];
    for (let i = 1; i < angles.length; i++) {
      // Detect non-monotonic sequences (allowing wrap at 360)
      const diff = angles[i] - angles[i - 1];
      if (diff < -180 || (diff < 0 && Math.abs(diff) > 5)) {
        // Likely a break (wrapped or reversed)
        breaks.push(i);
      }
    }
    return breaks;
  }

  private generateHints(data: {
    phiPeak: number;
    thetaPeak: number;
    phiBreaks: number[];
    thetaBreaks: number[];
    phiRange: [number, number];
    thetaRange: [number, number];
  }): string[] {
    const hints: string[] = [];

    // Phi hints
    if (data.phiPeak < 45) {
      hints.push('φ_peak~0°: Excel φ=0 likely points to +X (viewer φ=0)');
    } else if (data.phiPeak > 45 && data.phiPeak < 135) {
      hints.push('φ_peak~90°: Excel φ=90 may point to +Z → needs -90° offset for viewer');
    } else if (data.phiPeak > 135 && data.phiPeak < 225) {
      hints.push('φ_peak~180°: Excel φ=180 may point to -X → check if mirrored');
    } else {
      hints.push('φ_peak~270°: Excel φ=270 may point to -Z → needs rotation/offset');
    }

    if (data.phiBreaks.length > 0) {
      hints.push(`⚠ φ has ${data.phiBreaks.length} break(s) at indices ${data.phiBreaks.join(',')} → needs sorting/unwrap`);
    }

    // Theta hints
    if (data.thetaPeak < 45) {
      hints.push('θ_peak~0°: likely colatitude (0=zenith/+Y) or elevation (+90=zenith)');
    } else if (data.thetaPeak > 45 && data.thetaPeak < 135) {
      hints.push('θ_peak~90°: likely horizon (colatitude 90=XZ plane)');
    } else {
      hints.push('θ_peak~180°: likely nadir (colatitude 180=-Y) or negative elevation');
    }

    if (data.thetaBreaks.length > 0) {
      hints.push(`⚠ θ has ${data.thetaBreaks.length} break(s) at indices ${data.thetaBreaks.join(',')} → needs sorting/unwrap`);
    }

    // Range hints
    hints.push(`φ range: [${data.phiRange[0].toFixed(1)}, ${data.phiRange[1].toFixed(1)}]`);
    hints.push(`θ range: [${data.thetaRange[0].toFixed(1)}, ${data.thetaRange[1].toFixed(1)}]`);

    // Viewer coordinate hints
    hints.push('Viewer: φ=0→+X, φ=90→+Z, θ=0→+Y, θ=90→XZ(horizon), θ=180→-Y');

    return hints;
  }

  // ==============================
  // Phase 1: Direction-domain adapter
  // ==============================

  normalizeDeg0to360(deg: number): number {
    // handles negative values too
    const v = deg % 360;
    return v < 0 ? v + 360 : v;
  }

  // ==============================
  // Truth API (WP3) - Direct XLSX to Truth Cuts (no canonicalization)
  // ============================================================================

  buildTruthCuts(sheet: PatternSheet): any {
    const H = sheet.horizontal.phiDeg.map((phi, i) => ({
      axis: phi,
      gainDb: sheet.horizontal.gainDb[i]
    }));

    const V = sheet.vertical.thetaDeg.map((theta, i) => ({
      axis: theta,
      gainDb: sheet.vertical.gainDb[i]
    }));

    return { H, V };
  }

  buildTruthHeatmap(sheet: PatternSheet, truth: any): any {
    const relPolicy = 'ABSOLUTE';
    const zMax = Math.max(
      ...sheet.horizontal.gainDb,
      ...sheet.vertical.gainDb
    );

    const H_rel = truth.H.map((pt: any) => pt.gainDb - zMax);
    const V_rel = truth.V.map((pt: any) => pt.gainDb - zMax);

    const phiAxis = truth.H.map((pt: any) => pt.axis);
    const thetaAxis = truth.V.map((pt: any) => pt.axis);

    const Z: number[][] = [];
    for (let ti = 0; ti < thetaAxis.length; ti++) {
      const row: number[] = [];
      for (let pi = 0; pi < phiAxis.length; pi++) {
        const gRel = V_rel[ti] + H_rel[pi];
        row.push(gRel);
      }
      Z.push(row);
    }

    return {
      phiAxis,
      thetaAxis,
      Z,
      H_rel,
      V_rel,
      meta: { relPolicy, zMax }
    };
  }

  getTruthGain(truth: any, thetaDeg: number, phiDeg: number): number {
    const wrap360 = (x: number) => ((x % 360) + 360) % 360;
    const thetaW = wrap360(thetaDeg);
    const phiW = wrap360(phiDeg);

    const thetaIdx = truth.V.findIndex((pt: any) => Math.abs(pt.axis - thetaW) < 0.5);
    const phiIdx = truth.H.findIndex((pt: any) => Math.abs(pt.axis - phiW) < 0.5);

    if (thetaIdx === -1 || phiIdx === -1) {
      return -999;
    }

    return truth.V[thetaIdx].gainDb;
  }

  findBoresight(truth: any): any {
    let maxGainDb = -Infinity;
    let boresight = { thetaMeas0: 0, phi0: 0, zMax: 0 };

    for (const vPt of truth.V) {
      if (vPt.gainDb > maxGainDb) {
        maxGainDb = vPt.gainDb;
        boresight = {
          thetaMeas0: vPt.axis,
          phi0: 0,
          zMax: vPt.gainDb
        };
      }
    }

    for (const hPt of truth.H) {
      if (hPt.gainDb > maxGainDb) {
        maxGainDb = hPt.gainDb;
        boresight = {
          thetaMeas0: 90,
          phi0: hPt.axis,
          zMax: hPt.gainDb
        };
      }
    }

    return boresight;
  }
}

/**
 * Angle checklist report structure
 */
export interface AngleChecklistReport {
  phi: {
    peak: number;
    peakGain: number;
    minus3dB: { left?: number; right?: number };
    breaks: number[];
  };
  theta: {
    peak: number;
    peakGain: number;
    minus3dB: { left?: number; right?: number };
    breaks: number[];
  };
  hints: string[];
}
