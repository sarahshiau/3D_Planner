import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { PatternSheet, PatternMeta, HorizontalPattern, VerticalPattern } from './antenna-pattern.types';

/**
 * Service for loading and parsing antenna pattern XLSX files
 * 
 * This service reads XLSX templates (e.g., ITRI_antenna_template.xlsx)
 * and extracts horizontal/vertical radiation pattern data.
 */
@Injectable({
  providedIn: 'root'
})
export class AntennaPatternXlsxService {
  private readonly TEMPLATE_URL = 'assets/gltf/templates/UU_123.xlsx';
  //ITRI_template_omni_donut_fixed
  //UU_123
  private readonly EXPECTED_ROWS = 360; // 0..359 degrees

  constructor(private http: HttpClient) {}

  /**
   * Load and parse the default antenna pattern template
   * 
   * @returns Promise<PatternSheet> Parsed pattern data with meta, horizontal, and vertical patterns
   * @throws Error if file cannot be loaded or data is invalid
   */
  async loadDefaultTemplate(): Promise<PatternSheet> {
    const arrayBuffer = await firstValueFrom(
        this.http.get(this.TEMPLATE_URL, { responseType: 'arraybuffer' })
    );

    try {
      // Load XLSX file as ArrayBuffer
      const arrayBuffer = await firstValueFrom(
        this.http.get(this.TEMPLATE_URL, { responseType: 'arraybuffer' })
      );

      // Parse workbook
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Get first sheet (MVP: assume single sheet)
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('XLSX file has no sheets');
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      // Parse the sheet
      return this.parsePatternSheet(sheet, sheetName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load antenna pattern template: ${message}`);
    }
  }

  /**
   * Parse a single pattern sheet
   * 
   * Dynamically searches for header rows ('Phi (deg)' and 'Theta (deg)')
   * and reads 360 data rows following each header.
   * 
   * Expected format:
   * - Columns B/C: Horizontal pattern (Phi deg, Gain dB)
   * - Columns E/F: Vertical pattern (Theta deg, Gain dB)
   * - Headers are located by searching for 'Phi (deg)' in column B and 'Theta (deg)' in column E
   * - Cells A1/A2/A3: Optional metadata (name, frequency, gain)
   * 
   * @param sheet XLSX worksheet
   * @param sheetName Name of the sheet
   * @returns PatternSheet Parsed pattern data
   * @throws Error if data is invalid or insufficient
   */
  private parsePatternSheet(sheet: XLSX.WorkSheet, sheetName: string): PatternSheet {
    // Convert sheet to 2D array for easier searching
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

    // Parse metadata from A1, A2, A3
    const meta = this.parseMetadata(sheet, sheetName);

    // Find horizontal header (Phi in column B)
    const { rowIndex: hHeaderRow, colIndex: phiColIndex } = this.findHeaderRowAndCol(rows, 'Phi (deg)', 1);

    // Find vertical header (Theta anywhere in sheet)
    const { rowIndex: vHeaderRow, colIndex: thetaColIndex } = this.findHeaderRowAndCol(rows, 'Theta (deg)');

    // Parse horizontal pattern (phiCol, phiCol+1)
    const horizontal = this.parseHorizontalPattern(rows, hHeaderRow, phiColIndex);

    // Parse vertical pattern (thetaCol, thetaCol+1)
    const vertical = this.parseVerticalPattern(rows, vHeaderRow, thetaColIndex);

    return { meta, horizontal, vertical };
  }

  /**
   * Normalize cell value for header matching
   * Converts to lowercase, trims, normalizes spaces, and converts full-width parentheses
   */
  private norm(s: any): string {
    return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[（）]/g, '()');
  }

  /**
   * Find the row and column index where a specific header appears
   * 
   * @param rows 2D array of sheet data
   * @param headerText Expected header text (e.g., 'Phi (deg)', 'Theta (deg)')
   * @param preferredCol Optional preferred column index to check first
   * @returns Object with rowIndex and colIndex (both 0-based)
   * @throws Error if header not found
   */
  private findHeaderRowAndCol(rows: any[][], headerText: string, preferredCol?: number): { rowIndex: number; colIndex: number } {
    const normalizedHeader = this.norm(headerText);
    const headerKeyword = headerText.toLowerCase().includes('phi') ? 'phi' : 'theta';

    // First try preferred column if specified
    if (preferredCol !== undefined) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && row[preferredCol] !== undefined && row[preferredCol] !== null) {
          const cellNorm = this.norm(row[preferredCol]);
          if (cellNorm === normalizedHeader || 
              cellNorm === normalizedHeader.replace(/\s/g, '') ||
              (cellNorm.includes(headerKeyword) && cellNorm.includes('deg'))) {
            return { rowIndex: i, colIndex: preferredCol };
          }
        }
      }
    }

    // Scan all columns in all rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cell = row[colIndex];
        if (cell === undefined || cell === null) continue;

        const cellNorm = this.norm(cell);
        if (cellNorm === normalizedHeader || 
            cellNorm === normalizedHeader.replace(/\s/g, '') ||
            (cellNorm.includes(headerKeyword) && cellNorm.includes('deg'))) {
          return { rowIndex: i, colIndex };
        }
      }
    }

    throw new Error(`Header '${headerText}' not found anywhere in sheet (scanned all columns)`);
  }

  /**
   * Parse metadata from cells A1, A2, A3
   * 
   * Attempts to extract:
   * - A1: Antenna name
   * - A2: Frequency (MHz)
   * - A3: Main gain (dBi)
   */
  private parseMetadata(sheet: XLSX.WorkSheet, sheetName: string): PatternMeta {
    const meta: PatternMeta = { sheetName };

    try {
      // A1: Name
      const a1 = sheet['A1'];
      if (a1 && a1.v) {
        const val = String(a1.v).trim();
        if (val) {
          meta.name = val;
        }
      }

      // A2: Frequency (try to extract number)
      const a2 = sheet['A2'];
      if (a2 && a2.v) {
        const val = String(a2.v);
        const match = val.match(/(\d+\.?\d*)/);
        if (match) {
          const freq = parseFloat(match[1]);
          if (!isNaN(freq)) {
            meta.frequencyMHz = freq;
          }
        }
      }

      // A3: Main gain (try to extract number)
      const a3 = sheet['A3'];
      if (a3 && a3.v) {
        const val = String(a3.v);
        const match = val.match(/(-?\d+\.?\d*)/);
        if (match) {
          const gain = parseFloat(match[1]);
          if (!isNaN(gain)) {
            meta.mainGainDbi = gain;
          }
        }
      }
    } catch (error) {
      console.warn('[AntennaPatternXlsxService] Failed to parse metadata:', error);
      // Continue even if metadata parsing fails
    }

    return meta;
  }

  /**
   * Parse horizontal pattern from Phi and Gain columns
   * 
   * Reads 360 rows starting from the row after the header
   * 
   * @param rows 2D array of sheet data
   * @param hHeaderRow Row index where 'Phi (deg)' header is found
   * @param phiColIndex Column index for Phi values
   * @throws Error if insufficient data rows or invalid phi values
   */
  private parseHorizontalPattern(rows: any[][], hHeaderRow: number, phiColIndex: number): HorizontalPattern {
    const phiDeg: number[] = [];
    const gainDb: number[] = [];

    // Start from row after header, read 360 rows
    const startRow = hHeaderRow + 1;
    const endRow = startRow + this.EXPECTED_ROWS;
    const gainColIndex = phiColIndex + 1;

    for (let i = startRow; i < endRow && i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      // Phi column
      const phiValue = row[phiColIndex];
      if (phiValue === undefined || phiValue === null) {
        throw new Error(`Horizontal pattern: Missing Phi value at row ${i + 1}, column ${phiColIndex + 1}`);
      }

      const phi = this.parseNumber(phiValue, `Phi at row ${i + 1}, column ${phiColIndex + 1}`);
      phiDeg.push(phi);

      // Gain column (phiCol + 1)
      const gainValue = row[gainColIndex];
      let gain = 0;
      if (gainValue === undefined || gainValue === null || gainValue === '') {
        console.warn(`[XLSX] Horizontal pattern: Missing/empty Gain at row ${i + 1}, column ${gainColIndex + 1}, using 0`);
      } else {
        const parsed = typeof gainValue === 'number' ? gainValue : parseFloat(String(gainValue));
        if (isNaN(parsed)) {
          console.warn(`[XLSX] Horizontal pattern: Invalid Gain at row ${i + 1}, column ${gainColIndex + 1} ("${gainValue}"), using 0`);
        } else {
          gain = parsed;
        }
      }
      gainDb.push(gain);
    }

    if (phiDeg.length !== this.EXPECTED_ROWS) {
      throw new Error(
        `Horizontal pattern: Expected ${this.EXPECTED_ROWS} rows, got ${phiDeg.length} (header at row ${hHeaderRow + 1})`
      );
    }

    return { phiDeg, gainDb };
  }

  /**
   * Parse vertical pattern from Theta and Gain columns
   * 
   * Reads 360 rows starting from the row after the header
   * 
   * @param rows 2D array of sheet data
   * @param vHeaderRow Row index where 'Theta (deg)' header is found
   * @param thetaColIndex Column index for Theta values
   * @throws Error if insufficient data rows or invalid theta values
   */
  private parseVerticalPattern(rows: any[][], vHeaderRow: number, thetaColIndex: number): VerticalPattern {
    const thetaDeg: number[] = [];
    const gainDb: number[] = [];

    // Start from row after header, read 360 rows
    const startRow = vHeaderRow + 1;
    const endRow = startRow + this.EXPECTED_ROWS;
    const gainColIndex = thetaColIndex + 1;

    for (let i = startRow; i < endRow && i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      // Theta column
      const thetaValue = row[thetaColIndex];
      if (thetaValue === undefined || thetaValue === null) {
        throw new Error(`Vertical pattern: Missing Theta value at row ${i + 1}, column ${thetaColIndex + 1}`);
      }

      const theta = this.parseNumber(thetaValue, `Theta at row ${i + 1}, column ${thetaColIndex + 1}`);
      thetaDeg.push(theta);

      // Gain column (thetaCol + 1)
      const gainValue = row[gainColIndex];
      let gain = 0;
      if (gainValue === undefined || gainValue === null || gainValue === '') {
        console.warn(`[XLSX] Vertical pattern: Missing/empty Gain at row ${i + 1}, column ${gainColIndex + 1}, using 0`);
      } else {
        const parsed = typeof gainValue === 'number' ? gainValue : parseFloat(String(gainValue));
        if (isNaN(parsed)) {
          console.warn(`[XLSX] Vertical pattern: Invalid Gain at row ${i + 1}, column ${gainColIndex + 1} ("${gainValue}"), using 0`);
        } else {
          gain = parsed;
        }
      }
      gainDb.push(gain);
    }

    if (thetaDeg.length !== this.EXPECTED_ROWS) {
      throw new Error(
        `Vertical pattern: Expected ${this.EXPECTED_ROWS} rows, got ${thetaDeg.length} (header at row ${vHeaderRow + 1})`
      );
    }

    return { thetaDeg, gainDb };
  }

  /**
   * Parse a cell value as number
   * 
   * @throws Error if value cannot be parsed as number
   */
  private parseNumber(value: any, context: string): number {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    
    if (isNaN(num)) {
      throw new Error(`Invalid number at ${context}: "${value}"`);
    }

    return num;
  }
}
