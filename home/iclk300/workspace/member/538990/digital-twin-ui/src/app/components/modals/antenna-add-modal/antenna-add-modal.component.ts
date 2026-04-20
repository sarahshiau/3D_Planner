import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AntennaUpsertDraft } from '../../../models/antenna/antenna.draft';
import { AlertService } from 'src/app/services/alert.service';

/** NOTE: sha256sum is computed from the uploaded file via WebCrypto and sent to backend */
export interface AntennaAddConfirmPayload {
  draft: AntennaUpsertDraft;
  file: File;
  sha256sum: string;
}

export interface AntennaExcelDetectResult {
  detectedPort: number | null;
  detectedBandStart: number | null;
  detectedBandEnd: number | null;
  source: 'sheetName' | 'cellB2' | 'none';
  sheetNamesSample: string[];
  reason?: string;
}

export interface AntennaAddDraft {
  name: string;
  type: '全向' | '指向';
  network: '5G' | 'Wi-Fi';
  freqStartMHz: string;
  freqEndMHz: string;
  count: number;
  vendor: string;
  model: string;

  // 檔案（先暫存，不上傳）
  patternFileName?: string;
  patternFile?: File | null;
}

@Component({
  selector: 'app-antenna-add-modal',
  templateUrl: './antenna-add-modal.component.html',
  styleUrls: ['./antenna-add-modal.component.scss'],
})
export class AntennaAddModalComponent {
  @Input() zIndexBase = 3020; // 預設比 antenna-manage 再高一層
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<AntennaAddConfirmPayload>();

  // Step2 才會把這些欄位串起來；Step1 先保留骨架
  draft: AntennaAddDraft = {
    name: '',
    type: '指向',
    network: '5G',
    freqStartMHz: '',
    freqEndMHz: '',
    count: 1,
    vendor: '',
    model: '',
    patternFileName: '',
    patternFile: null,
  };

  // 顯示用：目前選到的檔名
  selectedFileName = '';

  // 暫存：實際 File 物件 (WP5: public for template access)
  public selectedFile: File | null = null;

  // WP7: Cache file buffer and SHA256 to avoid recalc in onConfirm
  private selectedFileBuffer: ArrayBuffer | null = null;
  private selectedFileSha256sum: string | null = null;

  form!: FormGroup;
  submitting = false;

  errors: Record<string, string> = {};

  private parsedMeta: { portCount: number; band: [number, number] } | null = null;

  // WP3+WP4: Excel detection and mismatch tracking
  private __excelDetect: AntennaExcelDetectResult | null = null;

  public fileMismatch: {
    portMismatch: boolean;
    bandMismatch: boolean;
    details?: {
      inputPort: number | null;
      detectedPort: number | null;
      inputBand: [number | null, number | null];
      detectedBand: [number | null, number | null];
    };
  } | null = null;

  public get hasFileMismatch(): boolean {
    return !!this.fileMismatch && (this.fileMismatch.portMismatch || this.fileMismatch.bandMismatch);
  }

  // WP5: File validation state
  public fileValidated: boolean = false;

  // WP6: Touched-based validation
  public touched: Record<string, boolean> = {};
  public submitAttempted: boolean = false;

  get hasErrors(): boolean {
    return !!this.form && this.form.invalid;
  }

  private markExcelFormatInvalid(input?: HTMLInputElement, reason?: string, sheetNames?: string[]): void {
    console.log('[AntennaAddModal][ExcelValidation] invalid format', {
      reason,
      sheetNames: sheetNames ?? [],
    });

    this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');

    this.selectedFile = null;
    this.selectedFileName = '未選擇檔案';
    this.parsedMeta = null;
    this.fileValidated = false;
    this.selectedFileBuffer = null;
    this.selectedFileSha256sum = null;
    this.__excelDetect = null;
    this.fileMismatch = null;
    this.draft.patternFileName = '';
    this.draft.patternFile = null;

    if (input) {
      input.value = '';
    }

    if (this.form) {
      this.form.markAsDirty();
      this.form.updateValueAndValidity();
    }
  }

  private normalizeSignatureText(value: any): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private getSheetCellText(ws: any, addr: string): string {
    return this.normalizeSignatureText(ws?.[addr]?.v ?? ws?.[addr]?.w ?? '');
  }

  private getSheetCellRaw(ws: any, addr: string): any {
    return ws?.[addr]?.v ?? ws?.[addr]?.w ?? null;
  }

  private isAntennaSignatureSheet(ws: any): boolean {
    return (
      this.getSheetCellText(ws, 'A1') === 'name' &&
      this.getSheetCellText(ws, 'A2') === 'frequency (mhz)' &&
      this.getSheetCellText(ws, 'A3') === 'gain (dbi)' &&
      this.getSheetCellText(ws, 'A4') === 'planename' &&
      this.getSheetCellText(ws, 'B5') === 'phi (deg)' &&
      this.getSheetCellText(ws, 'C5') === 'gain(db)' &&
      this.getSheetCellText(ws, 'E5') === 'theta(deg)' &&
      this.getSheetCellText(ws, 'F5') === 'gain(db)'
    );
  }

  private validateAntennaWorkbookSignature(wb: any): { ok: boolean; reason?: string } {
    const sheetNames = wb?.SheetNames ?? [];
    if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
      return { ok: false, reason: 'workbook has no sheets' };
    }

    for (const sheetName of sheetNames) {
      const ws = wb.Sheets?.[sheetName];
      if (!ws) continue;
      if (this.isAntennaSignatureSheet(ws)) {
        return { ok: true };
      }
    }

    return { ok: false, reason: 'missing template headers' };
  }

  private getContentNameFromSheet(ws: any): string | null {
    const b1 = String(this.getSheetCellRaw(ws, 'B1') ?? '').trim();
    if (b1) return b1;
    return null;
  }

  private getContentFrequencyFromSheet(ws: any): number | null {
    const raw = this.getSheetCellRaw(ws, 'B2');
    const freq = Number(raw);
    if (!Number.isFinite(freq)) return null;
    return freq;
  }

  private parsePortFromName(name: string): number | null {
    const match = /port\s*(\d+)/i.exec(name);
    if (!match) return null;
    const port = Number(match[1]);
    return Number.isInteger(port) && port > 0 ? port : null;
  }

  async onFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    // 只允許 Excel（前端先擋）
    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.selectedFile = null;
      this.selectedFileName = '未選擇檔案';
      this.parsedMeta = null;
      this.fileValidated = false;
      this.selectedFileBuffer = null;
      this.selectedFileSha256sum = null;
      if (this.form) {
        this.form.markAsDirty();
        this.form.updateValueAndValidity();
      }
      // 清空 input，避免同一檔案重選不觸發 change
      input.value = '';
      console.log('[AntennaAddModal] invalid file type. Only .xlsx/.xls allowed.');
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;

    this.draft.patternFileName = this.selectedFileName;
    this.draft.patternFile = this.selectedFile;

    console.log('[AntennaAddModal] file selected =', this.selectedFileName, 'size=', file.size);

    // WP7: Cache file buffer and SHA256 to avoid recalc in onConfirm
    try {
      this.selectedFileBuffer = await file.arrayBuffer();
      this.selectedFileSha256sum = await this.computeSha256Hex(this.selectedFileBuffer);
      console.log('[AntennaAddModal] file cached - sha256=', this.selectedFileSha256sum);
    } catch (err) {
      console.error('[AntennaAddModal] failed to cache file buffer/sha256', err);
      this.selectedFileBuffer = null;
      this.selectedFileSha256sum = null;
    }

    // WP2+WP3+WP4+WP5: Parse Excel structure and detect mismatch
    const detect = await this.__dbgParseSelectedExcel(file, this.selectedFileBuffer || undefined);

    if (
      detect.source === 'none' ||
      detect.detectedPort == null ||
      detect.detectedBandStart == null ||
      detect.detectedBandEnd == null
    ) {
      this.markExcelFormatInvalid(input, detect.reason, detect.sheetNamesSample);
      return;
    }

    this.__excelDetect = detect;
    this.__computeFileMismatch(detect);

    // WP5: Set fileValidated based on mismatch result
    if (this.hasFileMismatch) {
  const before = this.fileMismatch?.details;

  this.__applyAutofixFromDetect(detect);
  this.__computeFileMismatch(detect);

  this.alertService.info(
    '系統已依據檔案內容自動修正埠數與運作頻段。\n\n' +
    (before
      ? `原輸入：埠數=${before.inputPort ?? '-'}，頻段=${before.inputBand?.[0] ?? '-'}~${before.inputBand?.[1] ?? '-'}\n`
      : '') +
    `檔案偵測：埠數=${detect.detectedPort ?? '-'}，頻段=${detect.detectedBandStart ?? '-'}~${detect.detectedBandEnd ?? '-'}`
    );
  }

    this.fileValidated = !this.hasFileMismatch;

    // Parse Excel metadata (non-blocking) - keep old logic for compatibility
    const parsed = await this.parsePatternMeta(this.selectedFile, this.selectedFileBuffer || undefined);
    this.parsedMeta = parsed;
    console.log('[AntennaAddModal] parsedMeta', this.parsedMeta);

    this.syncDraftFromForm();
    this.form.markAsDirty();
    this.form.updateValueAndValidity();
  }

  onDraftChanged(): void {
    if (!this.form) this.initForm();

    this.form.patchValue(
      {
        name: this.draft.name,
        type: this.draft.type,
        network: this.draft.network,
        freqStartMHz: this.draft.freqStartMHz,
        freqEndMHz: this.draft.freqEndMHz,
        count: this.draft.count,
        vendor: this.draft.vendor,
        model: this.draft.model,
      },
      { emitEvent: false }
    );
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.__excelDetect) {
      this.__computeFileMismatch(this.__excelDetect);
      this.fileValidated = !this.hasFileMismatch;
    }
  }

  /**
   * WP6: Mark field as touched for validation display
   */
  public markTouched(field: string): void {
    this.touched[field] = true;
  }

  /**
   * WP6: Determine if error should be shown (touched or submitted)
   */
  public showError(field: string, invalid: boolean): boolean {
    return (this.touched[field] || this.submitAttempted) && invalid;
  }

  /**
   * WP2+WP3: Parse Excel file to detect port count and frequency range from sheet names
   * Strategy A: Parse sheet names like "port1_4850" or "port1-4850"
   * Strategy B (fallback): Read cell B2 from each sheet
   */
  private async __dbgParseSelectedExcel(file: File, buf?: ArrayBuffer): Promise<AntennaExcelDetectResult> {
    try {
      const XLSX = await import('xlsx');
      const buffer = buf || (await file.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'array' });

      const sheetNames = wb.SheetNames || [];
      const signature = this.validateAntennaWorkbookSignature(wb);
      if (!signature.ok) {
        return {
          detectedPort: null,
          detectedBandStart: null,
          detectedBandEnd: null,
          source: 'none',
          sheetNamesSample: sheetNames.slice(0, 10),
          reason: signature.reason,
        };
      }

      let detectedPort: number | null = null;
      let detectedBandStart: number | null = null;
      let detectedBandEnd: number | null = null;
      let source: 'sheetName' | 'cellB2' | 'none' = 'none';

      const portFreqPairs: Array<{ port: number; freq: number }> = [];
      let hasSheetNameMatch = false;

      // Strategy A: parse from sheetName when matched
      // Strategy B: fallback from content (B1 name, B2 frequency)
      const sheetNamePattern = /^port(\d+)[_-](\d+)$/i;
      for (const sheetName of sheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws || !this.isAntennaSignatureSheet(ws)) continue;

        const match = sheetNamePattern.exec(sheetName);
        if (match) {
          const portNum = Number(match[1]);
          const freqNum = Number(match[2]);
          if (Number.isInteger(portNum) && Number.isFinite(freqNum) && freqNum > 0) {
            portFreqPairs.push({ port: portNum, freq: freqNum });
            hasSheetNameMatch = true;
            continue;
          }
        }

        const contentName = this.getContentNameFromSheet(ws);
        const contentFreq = this.getContentFrequencyFromSheet(ws);
        if (!contentName || !Number.isFinite(contentFreq) || Number(contentFreq) <= 0) {
          continue;
        }

        const portFromName = this.parsePortFromName(contentName);
        const fallbackPort = Number.isInteger(portFromName) ? Number(portFromName) : portFreqPairs.length + 1;
        if (Number.isInteger(fallbackPort) && fallbackPort > 0) {
          portFreqPairs.push({ port: fallbackPort, freq: Number(contentFreq) });
          source = 'cellB2';
        }
      }

      if (portFreqPairs.length > 0) {
        const ports = portFreqPairs.map(p => p.port);
        const freqs = portFreqPairs.map(p => p.freq);
        detectedPort = Math.max(...ports);
        detectedBandStart = Math.min(...freqs);
        detectedBandEnd = Math.max(...freqs);
        source = hasSheetNameMatch ? 'sheetName' : 'cellB2';
      } else {
        return {
          detectedPort: null,
          detectedBandStart: null,
          detectedBandEnd: null,
          source: 'none',
          sheetNamesSample: sheetNames.slice(0, 10),
          reason: 'missing name/frequency values',
        };
      }

      const result: AntennaExcelDetectResult = {
        detectedPort,
        detectedBandStart,
        detectedBandEnd,
        source,
        sheetNamesSample: sheetNames.slice(0, 10)
      };

      console.log('[AntennaAddModal][WP2][ExcelDetect]', result);
      return result;
    } catch (err) {
      console.warn('[AntennaAddModal][WP2] excel parse failed', err);
      return {
        detectedPort: null,
        detectedBandStart: null,
        detectedBandEnd: null,
        source: 'none',
        sheetNamesSample: [],
        reason: 'workbook parse failed',
      };
    }
  }

  /**
   * WP3: Compute mismatch between user input and detected Excel data
   */
  private __computeFileMismatch(detect: AntennaExcelDetectResult): void {
    const inputPort = this.__coerceInt(this.form?.get('count')?.value ?? (this.draft as any).count ?? (this.draft as any).port ?? null);
    const inputStart = this.__coerceInt(this.form?.get('freqStartMHz')?.value ?? (this.draft as any).freqStartMHz ?? null);
    const inputEnd = this.__coerceInt(this.form?.get('freqEndMHz')?.value ?? (this.draft as any).freqEndMHz ?? null);

    const detectedPort = detect.detectedPort;
    const detectedStart = detect.detectedBandStart;
    const detectedEnd = detect.detectedBandEnd;

    const portMismatch =
      detectedPort != null && inputPort != null && inputPort !== detectedPort;

    const bandMismatch =
      detectedStart != null && detectedEnd != null &&
      inputStart != null && inputEnd != null &&
      (inputStart !== detectedStart || inputEnd !== detectedEnd);

    this.fileMismatch = {
      portMismatch,
      bandMismatch,
      details: {
        inputPort,
        detectedPort,
        inputBand: [inputStart, inputEnd],
        detectedBand: [detectedStart, detectedEnd],
      }
    };

    console.log('[AntennaAddModal][WP3][Mismatch]', this.fileMismatch);
  }

  /**
   * WP4: Apply auto-fix from detected Excel data to draft
   */
  private __applyAutofixFromDetect(detect: AntennaExcelDetectResult): void {
    if (!this.form) this.initForm();

    this.form.patchValue({
      count: detect.detectedPort ?? this.form.get('count')?.value,
      freqStartMHz: String(detect.detectedBandStart ?? this.form.get('freqStartMHz')?.value ?? ''),
      freqEndMHz: String(detect.detectedBandEnd ?? this.form.get('freqEndMHz')?.value ?? ''),
    }, { emitEvent: true });

    this.form.updateValueAndValidity();
    this.syncDraftFromForm();
  }

  private __coerceInt(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  private async computeSha256Hex(buf: ArrayBuffer): Promise<string> {
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private snapshotDraftFromForm(): AntennaAddDraft {
    const v = this.form.getRawValue();
    return {
      name: String(v.name ?? '').trim(),
      type: String(v.type ?? '指向') as '全向' | '指向',
      network: String(v.network ?? '5G') as '5G' | 'Wi-Fi',
      freqStartMHz: String(v.freqStartMHz ?? ''),
      freqEndMHz: String(v.freqEndMHz ?? ''),
      count: Number(v.count ?? 1),
      vendor: String(v.vendor ?? '').trim(),
      model: String(v.model ?? '').trim(),
      patternFileName: this.selectedFileName || '',
      patternFile: this.selectedFile ?? null,
    };
  }

  private syncDraftFromForm(): void {
    if (!this.form) return;
    this.draft = this.snapshotDraftFromForm();
  }

// 在 confirm 時能把 File 一起帶出去
private buildPayload(): AntennaUpsertDraft {
  const d = this.snapshotDraftFromForm();
  const type = d.type === '全向' ? 'Omnidirectional' : 'Directional';

  return {
    name: d.name,
    type,
    freqStartMHz: Number(d.freqStartMHz || 0),
    freqEndMHz: Number(d.freqEndMHz || 0),
    protocol: d.network,
    port: Number(d.count || 0),
    model: d.model,
    manufactor: d.vendor,
    property: 'customized',
    sha256sum: undefined,
  };
}

  constructor(private fb: FormBuilder, private alertService: AlertService) {
    console.log('[AntennaAddModal] constructor');
  }

  ngOnInit(): void {
    this.initForm();
    console.log('[AntennaAddModal] ngOnInit');
  }

  private initForm(): void {
    this.form = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(16), Validators.pattern(this.NAME_RE)]],
        type: ['指向', [Validators.required]],
        network: ['5G', [Validators.required]],
        freqStartMHz: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
        freqEndMHz: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
        count: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
        vendor: ['', [Validators.required, Validators.maxLength(16), Validators.pattern(this.NAME_RE)]],
        model: ['', [Validators.required, Validators.maxLength(16), Validators.pattern(this.NAME_RE)]],
      },
      { validators: [this.bandRangeValidator] }
    );

    this.syncDraftFromForm();
  }

  private bandRangeValidator(group: AbstractControl): ValidationErrors | null {
    const s = Number(group.get('freqStartMHz')?.value);
    const e = Number(group.get('freqEndMHz')?.value);
    const isPosInt = (n: number) => Number.isInteger(n) && n > 0;
    if (!isPosInt(s) || !isPosInt(e) || e < s) return { bandRange: true };
    return null;
  }

  get f() { return this.form.controls; }

  onBackdropClick(): void {
    console.log('[AntennaAddModal] backdrop clicked (blocked)');
    // 依你規格：不允許點背景關閉
  }

  onClose(): void {
    console.log('[AntennaAddModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[AntennaAddModal] cancel clicked');
    this.close.emit();
  }

  async onConfirm(): Promise<void> {
    console.time('[Add] total');
    console.log('[AntennaAddModal] onConfirm ENTER', {
      formValid: this.form?.valid,
      selectedFile: !!this.selectedFile,
      fileValidated: this.fileValidated,
      hasFileMismatch: this.hasFileMismatch,
    });

    try {
      console.timeLog('[Add] total', 'step: enter');

      // WP6: Mark submit attempted
      this.submitAttempted = true;
      console.timeLog('[Add] total', 'step: submitAttempted set');

      if (!this.form) {
        this.initForm();
      }
      console.timeLog('[Add] total', 'step: form ensured');

      if (this.form.invalid) {
        this.form.markAllAsTouched();
        console.warn('[AntennaAddModal] form invalid', { errors: this.form.errors, value: this.form.value });
        console.timeLog('[Add] total', 'step: form invalid early-return');
        return;
      }

      // WP5: Check file validation state
      if (!this.fileValidated) {
        this.alertService.info('檔案內容與輸入數值不一致，請先修正後再送出。');
        console.timeLog('[Add] total', 'step: fileValidated false early-return');
        return;
      }

      if (this.hasFileMismatch) {
        this.alertService.info('請先解決檔案與輸入數值不一致的問題。');
        console.timeLog('[Add] total', 'step: fileMismatch true early-return');
        return;
      }

      if (!this.selectedFile) {
        this.form.markAllAsTouched();
        this.alertService.info('新增天線時，必須上傳場型數據檔案!');
        console.timeLog('[Add] total', 'step: no file early-return');
        return;
      }

      this.syncDraftFromForm();
      console.timeLog('[Add] total', 'step: draft snapshot done');

      // WP7: Use cached SHA256 instead of recalculating
      if (!this.selectedFileSha256sum) {
        this.alertService.error('檔案校驗碼計算失敗，請重新選擇檔案。');
        console.timeLog('[Add] total', 'step: no cached sha256 early-return');
        return;
      }

      const sha256sum = this.selectedFileSha256sum;
      console.timeLog('[Add] total', 'step: sha256 from cache');

      const draft = this.buildPayload();
      const file = this.selectedFile;
      console.log('[AntennaAddModal] confirm clicked - sha256sum=', sha256sum);
      this.confirm.emit({ draft, file, sha256sum });
      console.timeLog('[Add] total', 'step: confirm emitted');
    } finally {
      console.timeEnd('[Add] total');
    }
  }

  downloadTemplate(): void {
    // 從 assets 下載，並強制另存檔名
    const url = 'assets/templates/ITRI_antenna_template.xlsx';

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_antenna_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    console.log('[AntennaAddModal] template download clicked');
  }

  private readonly NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

  private async parsePatternMeta(file: File, buf?: ArrayBuffer): Promise<{ portCount: number; band: [number, number] } | null> {
    try {
      const XLSX = await import('xlsx');
      const buffer = buf || (await file.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'array' });

      const firstSheetName = wb.SheetNames?.[0];
      if (!firstSheetName) return null;
      const ws = wb.Sheets[firstSheetName];
      if (!ws) return null;

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
      if (!Array.isArray(rows) || rows.length === 0) return null;

      let portCount: number | null = null;
      let bandStart: number | null = null;
      let bandEnd: number | null = null;

      const toPosInt = (v: any): number | null => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        if (!Number.isInteger(n) || n <= 0) return null;
        return n;
      };

      const extractPosInts = (arr: any[]): number[] => {
        const out: number[] = [];
        for (const v of arr) {
          const n = toPosInt(v);
          if (n != null) out.push(n);
        }
        return out;
      };

      for (let r = 0; r < rows.length; r++) {
        const row = Array.isArray(rows[r]) ? rows[r] : [];
        for (let c = 0; c < row.length; c++) {
          const cellText = String(row[c] ?? '').trim().toLowerCase();

          if (portCount == null && (cellText.includes('port') || cellText.includes('埠'))) {
            const rightNums = extractPosInts(row.slice(c + 1));
            if (rightNums.length > 0) {
              portCount = rightNums[0];
            }
          }

          if ((bandStart == null || bandEnd == null) && (cellText.includes('band') || cellText.includes('頻段'))) {
            const rowNums = extractPosInts(row.slice(c + 1));
            if (rowNums.length >= 2) {
              bandStart = rowNums[0];
              bandEnd = rowNums[1];
            }
          }
        }
      }

      if (portCount == null || bandStart == null || bandEnd == null) {
        return null;
      }

      const start = Math.min(bandStart, bandEnd);
      const end = Math.max(bandStart, bandEnd);
      return { portCount, band: [start, end] };
    } catch (err) {
      return null;
    }
  }

}
