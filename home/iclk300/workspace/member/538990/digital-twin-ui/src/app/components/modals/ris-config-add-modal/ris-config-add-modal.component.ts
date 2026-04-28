import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { AddRisProfilePayload, RisRawDataApi } from '../../../models/ris.model';
import { RisService } from '../../../services/ris.service';
import { AlertService } from 'src/app/services/alert.service';
import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-ris-config-add-modal',
  templateUrl: './ris-config-add-modal.component.html',
  styleUrls: ['./ris-config-add-modal.component.scss'],
})
export class RisConfigAddModalComponent implements OnInit {
  @Input() zIndexBase = 3030;
  @Input() risID = 0; // RIS ID for profile creation
  @Input() existingProfileNames: string[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<AddRisProfilePayload>();

  isLoading = false;
  errorMsg: string | null = null;

  // Excel parsing state
  pendingRawData: RisRawDataApi | null = null;
  pendingFileName: string | null = null;
  isParsing = false;
  parseError: string | null = null;

  draft = {
    name: '',
    incAzRange: '',
    incElRange: '',
    refAz: null,
    refEl: null,
    reflGainDb: null,
  };

  selectedFileName = '';
  private selectedFile: File | null = null;
  private sha256sum: string | null = null;

  helpOpen = false;
  helpTitle = '';

  constructor(
    private readonly risService: RisService,
    private readonly alertService: AlertService
  ) {}

  ngOnInit(): void {
    this.draft = {
      name: '',
      incAzRange: '',
      incElRange: '',
      refAz: null,
      refEl: null,
      reflGainDb: null,
    };

    this.selectedFileName = '';
    this.pendingRawData = null;
    this.pendingFileName = null;
    this.isParsing = false;
    this.parseError = null;
    this.sha256sum = null;
    this.selectedFile = null;
  }

  onBackdropClick(): void {
    console.log('[RisConfigAddModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisConfigAddModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[RisConfigAddModal] cancel clicked');
    this.close.emit();
  }

  openHelp(title: string): void {
    this.helpTitle = title;
    this.helpOpen = true;
    console.log('[RisConfigAddModal] open help:', title);
  }

  closeHelp(): void {
    console.log('[RisConfigAddModal] close help');
    this.helpOpen = false;
    this.helpTitle = '';
  }

  private resetImportState(input?: HTMLInputElement): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.pendingRawData = null;
    this.pendingFileName = null;
    this.parseError = null;
    this.sha256sum = null;
    if (input) input.value = '';
    this.draft = {
      ...this.draft,
      name: '',
      incAzRange: '',
      incElRange: '',
      refAz: null,
      refEl: null,
      reflGainDb: null,
    };
  }

  private readCell(sheet: XLSX.WorkSheet, addr: string): string {
    const value = (sheet as any)[addr]?.v;
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private readCellNumber(sheet: XLSX.WorkSheet, addr: string): number | null {
    const raw = this.readCell(sheet, addr);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }

  private isValidRisProfileTemplate(sheet: XLSX.WorkSheet): boolean {
    const a2 = this.readCell(sheet, 'A2');
    const a3 = this.readCell(sheet, 'A3');
    const a4 = this.readCell(sheet, 'A4');
    const a5 = this.readCell(sheet, 'A5');
    const a6 = this.readCell(sheet, 'A6');
    const a7 = this.readCell(sheet, 'A7');
    const a8 = this.readCell(sheet, 'A8');
    return (
      a2.includes('配置名稱') &&
      a3.includes('水平入射角') &&
      a4.includes('垂直入射角') &&
      a5.includes('水平反射角') &&
      a6.includes('垂直反射角') &&
      a7.includes('反射係數') &&
      a8.includes('輻射場型')
    );
  }

  /**
   * Calculate SHA-256 hash of a file as hex string.
   */
  private async sha256OfFile(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  downloadTemplate(): void {
    const url = 'assets/templates/ITRI_RIS_Profile_template.xlsx';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_RIS_Profile_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log('[RisConfigAddModal] template download clicked');
  }

  async onFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    console.log('[RisConfigAddModal] ENTER onFileSelected', {
      fileName: file?.name ?? '',
      fileSize: file?.size ?? 0,
    });

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.alertService.info('僅支援 .xlsx/.xls 檔案');
      this.resetImportState(input);
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;

    this.isParsing = true;
    this.parseError = null;
    try {
      const buf = await file.arrayBuffer();
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(buf, { type: 'array' });
      } catch {
        throw new Error('上傳的檔案內容不正確，請更正後重新上傳');
      }

      const sheetNames = wb.SheetNames || [];
      let sheet: XLSX.WorkSheet | null = null;
      for (const name of sheetNames) {
        const current = wb.Sheets[name];
        if (current && this.isValidRisProfileTemplate(current)) {
          sheet = current;
          break;
        }
      }
      if (!sheet) {
        throw new Error('上傳的檔案內容不正確，請更正後重新上傳');
      }

      const profileName = this.readCell(sheet, 'B2');
      const incAzMin = this.readCellNumber(sheet, 'B3');
      const incAzMax = this.readCellNumber(sheet, 'C3');
      const incElMin = this.readCellNumber(sheet, 'B4');
      const incElMax = this.readCellNumber(sheet, 'C4');
      const refAz = this.readCellNumber(sheet, 'B5');
      const refEl = this.readCellNumber(sheet, 'B6');
      const refl = this.readCellNumber(sheet, 'B7');

      if (
        !profileName ||
        incAzMin === null || incAzMax === null ||
        incElMin === null || incElMax === null ||
        refAz === null || refEl === null ||
        refl === null
      ) {
        throw new Error('上傳的檔案內容不正確，請更正後重新上傳');
      }

      const incHorizontal: [number, number] = [incAzMin, incAzMax];
      const incVertical: [number, number] = [incElMin, incElMax];
      const refHorizontal = refAz;
      const refVertical = refEl;
      const refCoefficient = refl;

      console.log('[RisConfigAddModal] parse success', {
        profileName,
        incHorizontal,
        incVertical,
        refHorizontal,
        refVertical,
        refCoefficient,
      });

      this.draft = {
        ...this.draft,
        name: profileName,
        incAzRange: `${incAzMin} ~ ${incAzMax}`,
        incElRange: `${incElMin} ~ ${incElMax}`,
        refAz,
        refEl,
        reflGainDb: refl,
      };

      this.pendingFileName = file.name;

      console.log('[RisConfigAddModal] autofill applied', {
        draftSnapshot: { ...this.draft },
      });

    } catch (e: any) {
      const message = e?.message || 'Unknown error';
      this.pendingRawData = null;
      this.pendingFileName = null;
      this.sha256sum = null;
      this.parseError = `Excel 解析失敗: ${message}`;
      this.resetImportState(input);
      this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');
      console.error('[RisConfigAddModal] parse failed', { message });
    } finally {
      this.isParsing = false;
    }
  }

  async onConfirm(): Promise<void> {
    // Validate name
    const name = (this.draft.name ?? '').trim();
    if (!name) {
      this.alertService.info('請輸入配置名稱');
      return;
    }

    // Check for duplicates
    const exists = (this.existingProfileNames ?? []).some(n => n.trim() === name);
    if (exists) {
      this.alertService.error('新增失敗：配置名稱重複');
      return;
    }

    if (!this.selectedFile) {
      this.alertService.error('新增失敗：請選擇 Excel 檔');
      return;
    }

    // Parse range strings like "0 ~ 360" to [0, 360]
    const parseRange = (rangeStr: string): [number, number] => {
      const parts = rangeStr.split('~').map(s => Number(s.trim()));
      return [parts[0] || 0, parts[1] || 0];
    };

    const incHorizontal = parseRange(this.draft.incAzRange);
    const incVertical = parseRange(this.draft.incElRange);

    const sha256sum = await this.sha256OfFile(this.selectedFile);

    const payload = {
      profileName: name,
      incHorizontal,
      incVertical,
      refHorizontal: Number(this.draft.refAz),
      refVertical: Number(this.draft.refEl),
      refCoefficient: Number(this.draft.reflGainDb),
      file: this.selectedFile,
      sha256sum,
    };

    console.log('[RisConfigAddModal] confirm clicked - payload=', payload);
    this.confirm.emit(payload);
  }
}
