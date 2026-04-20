/**
 * Antenna pattern data types
 * 
 * Used for parsing and storing antenna radiation pattern data
 * from XLSX templates (e.g., ITRI_antenna_template.xlsx)
 */

/**
 * Metadata extracted from the pattern sheet
 */
export interface PatternMeta {
  /** Antenna name (from A1 or similar) */
  name?: string;
  /** Frequency in MHz (from A2 or similar) */
  frequencyMHz?: number;
  /** Main gain in dBi (from A3 or similar) */
  mainGainDbi?: number;
  /** Name of the Excel sheet */
  sheetName: string;
}

/**
 * Horizontal pattern data (azimuth plane)
 */
export interface HorizontalPattern {
  /** Phi angles in degrees [0..359] */
  phiDeg: number[];
  /** Gain in dB at each phi angle */
  gainDb: number[];
}

/**
 * Vertical pattern data (elevation plane)
 */
export interface VerticalPattern {
  /** Theta angles in degrees [0..359] */
  thetaDeg: number[];
  /** Gain in dB at each theta angle */
  gainDb: number[];
}

/**
 * Complete antenna pattern sheet data
 */
export interface PatternSheet {
  /** Metadata from the sheet */
  meta: PatternMeta;
  /** Horizontal (azimuth) pattern data */
  horizontal: HorizontalPattern;
  /** Vertical (elevation) pattern data */
  vertical: VerticalPattern;
}
