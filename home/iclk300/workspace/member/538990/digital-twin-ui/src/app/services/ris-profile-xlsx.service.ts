import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { RisRawDataApi, RisPatternRaw } from '../models/ris.model';

@Injectable({ providedIn: 'root' })
export class RisProfileXlsxService {
  constructor() {}

  async parse(file: File): Promise<RisRawDataApi> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new Error('Invalid RIS Excel format: No sheets found');

    const sheet = wb.Sheets[sheetName];
    if (!sheet) throw new Error('Invalid RIS Excel format: Sheet is empty');

    const headerRow1 = this.findRowByAIncludes(sheet, '輻射場型');
    if (headerRow1 <= 0) {
      throw new Error('Invalid RIS Excel format: cannot find "輻射場型" row');
    }

    const meta = {
      profileName: this.getCellString(sheet, 2, 2),
      phiIncDeg: [this.getCellNumber(sheet, 3, 2), this.getCellNumber(sheet, 3, 3)] as [number, number],
      thetaIncDeg: [this.getCellNumber(sheet, 4, 2), this.getCellNumber(sheet, 4, 3)] as [number, number],
      phiRefDeg: this.getCellNumber(sheet, 5, 2),
      thetaRefDeg: this.getCellNumber(sheet, 6, 2),
      refCoefficientDb: this.getCellNumber(sheet, 7, 2),
    };

    const colStart = 3;
    const colCount = this.scanNumericRunRight(sheet, headerRow1, colStart);
    if (colCount <= 0) throw new Error('Invalid RIS Excel format: cannot determine column count');

    const rowStart = headerRow1 + 1;
    const rowIndexCol = 2;
    const rowCount = this.scanNumericRunDown(sheet, rowStart, rowIndexCol);
    if (rowCount <= 0) throw new Error('Invalid RIS Excel format: cannot determine row count');

    const patternRaw: RisPatternRaw = {};
    for (let r = 0; r < rowCount; r++) {
      const arr: number[] = [];
      for (let c = 0; c < colCount; c++) {
        const v = this.getCellNumber(sheet, rowStart + r, colStart + c);
        arr.push(Number.isFinite(v) ? v : 0);
      }
      patternRaw[String(r)] = arr;
    }

    const radiationRaw: [number, number, number][] = [];
    for (let deg = 0; deg < 360; deg++) radiationRaw.push([deg, 0, 0]);

    return {
      rowElement: rowCount,
      columnElement: colCount,
      patternRaw,
      radiationRaw,
      meta,
    };
  }

  private findRowByAIncludes(sheet: XLSX.WorkSheet, keyword: string): number {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const colA = 1;
    for (let r = range.s.r + 1; r <= range.e.r + 1; r++) {
      const s = this.getCellString(sheet, r, colA);
      if (s && s.includes(keyword)) return r;
    }
    return -1;
  }

  private getCellString(sheet: XLSX.WorkSheet, row1: number, col1: number): string {
    const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col1 - 1 });
    const cell = sheet[addr];
    const v = cell?.v;
    return v == null ? '' : String(v).trim();
  }

  private getCellNumber(sheet: XLSX.WorkSheet, row1: number, col1: number): number {
    const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col1 - 1 });
    const cell = sheet[addr];
    const v = cell?.v;
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  private scanNumericRunRight(sheet: XLSX.WorkSheet, row1: number, colStart1: number): number {
    let count = 0;
    for (let c = colStart1; c < colStart1 + 5000; c++) {
      const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: c - 1 });
      const cell = sheet[addr];
      const v = cell?.v;
      const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
      if (!Number.isFinite(n)) break;
      count++;
    }
    return count;
  }

  private scanNumericRunDown(sheet: XLSX.WorkSheet, rowStart1: number, col1: number): number {
    let count = 0;
    for (let r = rowStart1; r < rowStart1 + 50000; r++) {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c: col1 - 1 });
      const cell = sheet[addr];
      const v = cell?.v;
      const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
      if (!Number.isFinite(n)) break;
      count++;
    }
    return count;
  }
}
