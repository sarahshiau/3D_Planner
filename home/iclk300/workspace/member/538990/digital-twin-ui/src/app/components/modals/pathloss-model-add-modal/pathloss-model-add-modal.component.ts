import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService } from 'src/app/services/alert.service';

export type PathlossAddMode = 'manual' | 'import';

export interface PathlossAddPayload {
  mode: PathlossAddMode;
}

export interface PathlossManualPayload extends PathlossAddPayload {
  mode: 'manual';
  draft: {
    name: string;
    chineseName: string;
    distancePowerLoss: number;
    fieldLoss: number;
    property: 'customized';
  };
}

export interface PathlossImportPayload extends PathlossAddPayload {
  mode: 'import';
  name: string;
  file: File;
  sha256sum: string;
  property: 'customized';
}

@Component({
  selector: 'app-pathloss-model-add-modal',
  templateUrl: './pathloss-model-add-modal.component.html',
  styleUrls: ['./pathloss-model-add-modal.component.scss'],
})
export class PathlossModelAddModalComponent implements OnInit {
  @Input() zIndexBase = 3020;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<PathlossManualPayload | PathlossImportPayload>();

  form!: FormGroup;
  selectedFileName = '';
  private selectedFile: File | null = null;
  private selectedFileBuffer: ArrayBuffer | null = null;

  // Import mode: store Excel-extracted N/Lf separately (不放回 form control)
  importExcelN: number | null = null;
  importExcelLf: number | null = null;

  constructor(private fb: FormBuilder, private alertService: AlertService) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.fb.group({
      mode: ['manual', [Validators.required]],
      name: ['', [Validators.required]],
      distancePowerLoss: [0.1, [Validators.required]],
      fieldLoss: [0.1, [Validators.required]],
    });

    this.form.get('mode')!.valueChanges.subscribe((mode) => {
      this.applyModeFormState(mode as 'manual' | 'import');
    });

    // 初始化時也套用一次狀態
    this.applyModeFormState(this.form.get('mode')!.value as 'manual' | 'import');
  }

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  private applyModeFormState(mode: 'manual' | 'import'): void {
    const nCtrl = this.form.get('distancePowerLoss')!;
    const lfCtrl = this.form.get('fieldLoss')!;

    if (mode === 'manual') {
      nCtrl.enable({ emitEvent: false });
      lfCtrl.enable({ emitEvent: false });

      if (nCtrl.value === null || nCtrl.value === '') {
        nCtrl.setValue(0.1, { emitEvent: false });
      }
      if (lfCtrl.value === null || lfCtrl.value === '') {
        lfCtrl.setValue(0.1, { emitEvent: false });
      }
    } else {
      nCtrl.setValue(null, { emitEvent: false });
      lfCtrl.setValue(null, { emitEvent: false });
      nCtrl.disable({ emitEvent: false });
      lfCtrl.disable({ emitEvent: false });
    }
  }

  onFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.selectedFile = null;
      this.selectedFileName = '';
      this.selectedFileBuffer = null;
      this.importExcelN = null;
      this.importExcelLf = null;
      input.value = '';
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
    this.selectedFileBuffer = null;
    this.importExcelN = null;
    this.importExcelLf = null;
  }

  private async computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  private getCellText(sheet: any, addr: string): string {
    return String(sheet?.[addr]?.v ?? '').trim();
  }

  private async validateImportTemplate(buffer: ArrayBuffer): Promise<boolean> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) return false;

      const sheet = workbook.Sheets[firstSheetName];
      if (!sheet) return false;

      if (this.getCellText(sheet, 'A1') !== 'ITRI PathLoss Model Calculator') return false;

      if (this.getCellText(sheet, 'A4') !== '(1) Base station data') return false;
      if (this.getCellText(sheet, 'B4') !== 'bs_x') return false;
      if (this.getCellText(sheet, 'C4') !== 'bs_y') return false;
      if (this.getCellText(sheet, 'D4') !== 'bs_z') return false;
      if (this.getCellText(sheet, 'E4') !== 'Txpower (dbm)') return false;
      if (this.getCellText(sheet, 'F4') !== 'Frequency (MHz)') return false;

      if (this.getCellText(sheet, 'A7') !== '(2) Measurement point data') return false;
      if (this.getCellText(sheet, 'B7') !== 'x') return false;
      if (this.getCellText(sheet, 'C7') !== 'y') return false;
      if (this.getCellText(sheet, 'D7') !== 'z') return false;
      if (this.getCellText(sheet, 'E7') !== 'RxPower (dbm)') return false;

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
      let measureCount = 0;
      for (let rowIndex = 7; rowIndex < rows.length; rowIndex++) {
        const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
        const xValue = row[1];
        const xText = String(xValue ?? '').trim();
        if (xText !== '') {
          measureCount++;
        }
      }

      if (measureCount < 20) return false;

      // 驗證通過後嘗試讀取 N/Lf（來自 Excel 中的某個欄位或固定位置）
      // 這邊假設 Excel 中沒有直接欄位，保留以便日後擴展
      // this.importExcelN = ...
      // this.importExcelLf = ...

      return true;
    } catch {
      return false;
    }
  }

  downloadTemplate(): void {
    const url = 'assets/templates/ITRI_pathlossmodel_template.xlsx';

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_pathlossmodel_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async onConfirm(): Promise<void> {
    if (this.form.invalid) {
      this.alertService.info('請填寫所有必填欄位');
      return;
    }

    const formValue = this.form.getRawValue();
    const name = (formValue.name || '').trim() || `Custom_Pathloss_${Date.now()}`;
    const mode = formValue.mode as PathlossAddMode;

    if (mode === 'manual') {
      const payload: PathlossManualPayload = {
        mode: 'manual',
        draft: {
          name,
          chineseName: name,
          distancePowerLoss: Number(formValue.distancePowerLoss || 0),
          fieldLoss: Number(formValue.fieldLoss || 0),
          property: 'customized',
        },
      };
      this.confirm.emit(payload);
    } else if (mode === 'import') {
      if (!this.selectedFile) {
        this.alertService.info('請選擇檔案');
        return;
      }

      const fileBuffer = this.selectedFileBuffer ?? (await this.selectedFile.arrayBuffer());
      this.selectedFileBuffer = fileBuffer;

      const isValidTemplate = await this.validateImportTemplate(fileBuffer);
      if (!isValidTemplate) {
        this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');
        this.selectedFile = null;
        this.selectedFileName = '';
        this.selectedFileBuffer = null;
        this.importExcelN = null;
        this.importExcelLf = null;
        return;
      }

      const sha256sum = await this.computeSha256Hex(fileBuffer);

      const payload: PathlossImportPayload = {
        mode: 'import',
        name,
        file: this.selectedFile,
        sha256sum,
        property: 'customized',
      };
      this.confirm.emit(payload);
    }
  }
}
