import { Component, EventEmitter, Input, Output } from '@angular/core';
import * as XLSX from 'xlsx';
import { AlertService } from 'src/app/services/alert.service';

export interface RisAddDraft {
  name: string;
  type: '主動' | '被動';
  freqStartMHz: string;
  freqEndMHz: string;
  vendor: string;
  material: string;

  elemCountX: string;
  elemCountY: string;
  elemSizeX: string;
  elemSizeY: string;

  profileName: string;  // Step2 配置名稱
  incAzRange: string;
  incElRange: string;
  refAz: string;
  refEl: string;
  reflGainDb: string;  // 反射係數大小(dB)

  avgPower: number;
  price: number;

  // 檔案（前端暫存）
  fileName?: string;
  file?: File | null;
}

// 最終送出給 ManageModal 的 payload：同時包含 RIS 與 Profile
export interface RisAddSubmitPayload {
  ris: {
    risName: string;
    type: 'Active' | 'Passive';
    frequency: [number, number];
    material: string;
    manufacturer: string;
    elementNumber: [number, number];
    elementSize: [number, number];
    property: 'customized';
    risEnergy: number;
    risCost: number;
  };
  profile: {
    profileName: string;
    incHorizontal: [number, number];
    incVertical: [number, number];
    refHorizontal: number;
    refVertical: number;
    refCoefficient: number;
    file: File;
    sha256sum: string;
  };
}

@Component({
  selector: 'app-ris-add-modal',
  templateUrl: './ris-add-modal.component.html',
  styleUrls: ['./ris-add-modal.component.scss'],
})
export class RisAddModalComponent {
  @Input() zIndexBase = 3020;
  @Input() existingRisNames: string[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<RisAddSubmitPayload>();

  // 兩步驟：1=表單、2=上傳檔案
  step: 1 | 2 = 1;

  draft: RisAddDraft = {
    name: '',
    type: '主動',
    freqStartMHz: '',
    freqEndMHz: '',
    vendor: '',
    material: '',
    elemCountX: '',
    elemCountY: '',
    elemSizeX: '',
    elemSizeY: '',
    avgPower: 0,
    price: 0,
    fileName: '',
    file: null,
    profileName: '',
    incAzRange: '',
    incElRange: '',
    refAz: '',
    refEl: '',
    reflGainDb: '',
  };

  // 顯示用檔名
  selectedFileName = '';
  
  angleHelpOpen = false;

  // 暫存 File 物件（不需要後端）
  private selectedFile: File | null = null;

  constructor(private alertService: AlertService) {}

  ngOnInit(): void {}

  onBackdropClick(): void {
    console.log('[RisAddModal] backdrop clicked (blocked)');
    // 依你規格：不允許點背景關閉
  }

  onClose(): void {
    console.log('[RisAddModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[RisAddModal] cancel clicked');
    this.close.emit();
  }

  private readonly nameVendorRe = /^[A-Za-z0-9_\-一-龥]+$/;

  // ===== [RIS][MATERIAL][WHITELIST] =====
  // Backend only accepts these 2 exact strings.
  readonly materialOptions = [
    { label: 'PIN二極體', value: 'PIN-diode' },
    { label: '液晶', value: 'Crystal-Liquid' },
  ] as const;

  private readonly materialWhitelist = new Set<string>(
    this.materialOptions.map(x => x.value)
  );

  private isDupName(name: string): boolean {
    const key = name.trim().toLowerCase();
    return (this.existingRisNames || []).some(n => (n || '').trim().toLowerCase() === key);
  }

  private isPosIntStr(s: string): boolean {
    if (!s) return false;
    const n = Number(s);
    return Number.isInteger(n) && n > 0;
  }

  private isNumberUpTo2DecimalsStr(s: string): boolean {
    if (!s) return false;
    return /^(\d+)(\.\d{1,2})?$/.test(s.trim());
  }

  private validateStep1AndAlert(): boolean {
    const name = (this.draft.name || '').trim();
    if (!name) {
      this.alertService.info('請輸入名稱');
      return false;
    }
    if (name.length > 16) {
      this.alertService.info('名稱不可含空白或特殊字元，且須在16字以內!');
      return false;
    }
    if (!this.nameVendorRe.test(name)) {
      this.alertService.info('名稱不可含空白或特殊字元，且須在16字以內!');
      return false;
    }
    if (this.isDupName(name)) {
      this.alertService.info('名稱不可重複，請更換名稱');
      return false;
    }

    const f1 = (this.draft.freqStartMHz || '').trim();
    const f2 = (this.draft.freqEndMHz || '').trim();
    if (!this.isPosIntStr(f1) || !this.isPosIntStr(f2)) {
      this.alertService.info('運作頻段應為正整數，且後面的數字應大於等於前面的數字!');
      return false;
    }
    if (Number(f2) < Number(f1)) {
      this.alertService.info('運作頻段應為正整數，且後面的數字應大於等於前面的數字!');
      return false;
    }

    const vendor = (this.draft.vendor || '').trim();
    if (!vendor || vendor.length > 16 || !this.nameVendorRe.test(vendor)) {
      this.alertService.info('製造商不可含空白或特殊字元，且須在16字以內!');
      return false;
    }

    const material = (this.draft.material || '').trim();
    if (!material) {
      this.alertService.info('請選擇材質');
      return false;
    }
    if (!this.materialWhitelist.has(material)) {
      this.alertService.info('材質必須從清單選擇');
      return false;
    }
    this.draft.material = material;

    if (!this.isPosIntStr(this.draft.elemCountX) || !this.isPosIntStr(this.draft.elemCountY)) {
      this.alertService.info('元件數量應為正整數');
      return false;
    }

    if (!this.isNumberUpTo2DecimalsStr(this.draft.elemSizeX) || !this.isNumberUpTo2DecimalsStr(this.draft.elemSizeY)) {
      this.alertService.info('元件尺寸最多可輸至小數後二位');
      return false;
    }

    return true;
  }

  goNext(): void {
    if (!this.validateStep1AndAlert()) return;
    console.log('[RisAddModal] next step');
    this.step = 2;
  }

  goPrev(): void {
    console.log('[RisAddModal] prev step');
    this.step = 1;
  }

  downloadTemplate(): void {
    // 依你需求：assets/templates/ITRI_RIS_Profile_template.xlsx
    const url = 'assets/templates/ITRI_RIS_Profile_template.xlsx';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_RIS_Profile_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    console.log('[RisAddModal] template download clicked');
  }

  private resetImportState(input?: HTMLInputElement): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    if (input) input.value = '';
    // 清空 Step2 欄位
    this.draft.profileName = '';
    this.draft.incAzRange = '';
    this.draft.incElRange = '';
    this.draft.refAz = '';
    this.draft.refEl = '';
    this.draft.reflGainDb = '';
  }

  private readCell(sheet: XLSX.WorkSheet, addr: string): string {
    const v = (sheet as any)[addr]?.v;
    return v === null || v === undefined ? '' : String(v).trim();
  }

  private readCellNumber(sheet: XLSX.WorkSheet, addr: string): number | null {
    const raw = this.readCell(sheet, addr);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
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

  onFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.alertService.info('僅支援 .xlsx/.xls 檔案');
      this.resetImportState(input);
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;

    // 讀 excel + 驗證 + 回填
    file.arrayBuffer().then((buf) => {
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(buf, { type: 'array' });
      } catch {
        this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');
        this.resetImportState(input);
        return;
      }

      const sheetNames = wb.SheetNames || [];
      let sheet: XLSX.WorkSheet | null = null;
      for (const name of sheetNames) {
        const s = wb.Sheets[name];
        if (s && this.isValidRisProfileTemplate(s)) {
          sheet = s;
          break;
        }
      }
      if (!sheet) {
        this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');
        this.resetImportState(input);
        return;
      }

      // 讀值（依 template 固定位置）
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
        this.alertService.error('上傳的檔案內容不正確，請更正後重新上傳');
        this.resetImportState(input);
        return;
      }

      // 自動回填 Step2 欄位
      this.draft.profileName = profileName;
      this.draft.incAzRange = `${incAzMin} ~ ${incAzMax}`;
      this.draft.incElRange = `${incElMin} ~ ${incElMax}`;
      this.draft.refAz = String(refAz);
      this.draft.refEl = String(refEl);
      this.draft.reflGainDb = String(refl);

      const elemX = Number(this.draft.elemCountX);
      const elemY = Number(this.draft.elemCountY);
      const sheetRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rows = sheetRange.e.r - sheetRange.s.r;
      const cols = sheetRange.e.c - sheetRange.s.c;

      if (elemX > 0 && elemY > 0) {
        if (rows < elemY || cols < elemX) {
          this.alertService.error('場型數據與智慧反射面板元件數不符，請重新檢查');
          this.resetImportState(input);
          return;
        }
      }

      console.log('[RisAddModal] template validated & autofilled', {
        profileName, incAzMin, incAzMax, incElMin, incElMax, refAz, refEl, refl
      });
    });
  }


  // Helper: 解析範圍字串成 tuple
  private parseRangeToTuple(text: string): [number, number] | null {
    if (!text) return null;
    const match = text.match(/^(-?\d+(\.\d+)?)\s*[~, ]\s*(-?\d+(\.\d+)?)$/);
    if (!match) return null;
    const n1 = Number(match[1]);
    const n2 = Number(match[3]);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null;
    return [n1, n2];
  }

  // Helper: 計算檔案 SHA-256
  async sha256OfFile(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async onConfirm(): Promise<void> {
    if (this.step !== 2) return;

    if (!this.validateStep1AndAlert()) return;

    if (!this.selectedFile) {
      this.alertService.info('請上傳檔案');
      return;
    }
    if (!/\.(xlsx|xls)$/i.test(this.selectedFile.name)) {
      this.alertService.info('請選擇正確的 Excel 檔案 (.xlsx/.xls)');
      return;
    }
    if (!this.draft.profileName?.trim()) {
      this.alertService.info('請輸入配置名稱');
      return;
    }
    const incHorizontal = this.parseRangeToTuple(this.draft.incAzRange);
    const incVertical = this.parseRangeToTuple(this.draft.incElRange);
    if (!incHorizontal || !incVertical) {
      this.alertService.info('入射角範圍格式不正確，請輸入例如：0 ~ 360');
      return;
    }
    const refHorizontal = Number(this.draft.refAz);
    const refVertical = Number(this.draft.refEl);
    const refCoefficient = Number(this.draft.reflGainDb);
    if ([refHorizontal, refVertical, refCoefficient].some(v => isNaN(v))) {
      this.alertService.info('反射角或反射係數格式不正確');
      return;
    }
    const sha256sum = await this.sha256OfFile(this.selectedFile);
    const risSubmit = {
      risName: this.draft.name.trim(),
      type: (this.draft.type === '主動' ? 'Active' : 'Passive') as 'Active' | 'Passive',
      frequency: [Number(this.draft.freqStartMHz), Number(this.draft.freqEndMHz)] as [number, number],
      material: (this.draft.material || '').trim(),
      manufacturer: (this.draft.vendor || '').trim(),
      elementNumber: [Number(this.draft.elemCountX), Number(this.draft.elemCountY)] as [number, number],
      elementSize: [Number(this.draft.elemSizeX), Number(this.draft.elemSizeY)] as [number, number],
      property: 'customized' as const,
      risEnergy: Number(this.draft.avgPower) || 0,
      risCost: Number(this.draft.price) || 0,
    };

    const profileSubmit = {
      profileName: this.draft.profileName.trim(),
      incHorizontal,
      incVertical,
      refHorizontal,
      refVertical,
      refCoefficient,
      file: this.selectedFile,
      sha256sum,
    };

    const payload: RisAddSubmitPayload = {
      ris: risSubmit,
      profile: profileSubmit,
    };

    console.log('[RIS ADD PAYLOAD]', payload);
    console.log('[RisAddModal] confirm clicked - payload=', payload);
    this.confirm.emit(payload);
  }

  openAngleHelp(): void {
    this.angleHelpOpen = true;
    console.log('[RisAddModal] open angle help');
  }

  closeAngleHelp(): void {
    this.angleHelpOpen = false;
    console.log('[RisAddModal] close angle help');
  }

  openHelp(_topic?: string): void { this.openAngleHelp(); }

}