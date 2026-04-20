import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { RisRow } from '../../../models/ris.model';

@Component({
  selector: 'app-ris-edit-modal',
  templateUrl: './ris-edit-modal.component.html',
  styleUrls: ['./ris-edit-modal.component.scss'],
})
export class RisEditModalComponent implements OnChanges {
  @Input() zIndexBase = 3030;
  @Input() open = false;
  @Input() row: any = null;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<any>();

  // ===== [RIS][MATERIAL][WHITELIST] =====
  // Backend only accepts these 2 exact strings.
  readonly materialOptions = [
    { label: 'PIN二極體', value: 'PIN-diode' },
    { label: '液晶', value: 'Crystal-Liquid' },
  ] as const;

  private readonly materialWhitelist = new Set<string>(
    this.materialOptions.map(x => x.value)
  );

  step: 1 | 2 = 1;

  draft = {
    name: '',
    type: '主動' as '主動' | '被動',
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
  };

  // 顯示目前檔名（預設從 row 帶入）
  selectedFileName = '';

  // 只有使用者選新檔才會有值（未選就保持 null）
  private selectedFile: File | null = null;

  private fillDraftFromRow(row: any): void {
    if (!row) return;

    // NOTE: keep types/units as-is; this is just mapping row -> draft
    this.draft = this.draft ?? ({} as any);

    this.draft.name = row.name ?? row.risName ?? '';
    this.draft.type = (typeof row.type === 'string' && row.type.toLowerCase() === 'active' ? '主動' : '被動') as '主動' | '被動';

    // frequency: [start,end] or frequencyMin/frequencyMax
    const freqStart = Array.isArray(row.frequency) ? row.frequency[0] : (row.frequencyMin ?? row.frequencyStart ?? 0);
    const freqEnd = Array.isArray(row.frequency) ? row.frequency[1] : (row.frequencyMax ?? row.frequencyEnd ?? 0);
    this.draft.freqStartMHz = String(freqStart);
    this.draft.freqEndMHz = String(freqEnd);

    this.draft.vendor = row.manufacturer ?? row.vendor ?? row.vendorName ?? row.maker ?? '';
    this.draft.material = row.material ?? '';

    // Defensive normalize: ensure material is in whitelist
    if (!this.materialWhitelist.has(this.draft.material)) {
      this.draft.material = '';
    }

    // elementNumber / elementSize: [x,y] or individual props
    const elemCountX = Array.isArray(row.elementNumber) ? row.elementNumber[0] : (row.elementCols ?? row.elementCountX ?? 0);
    const elemCountY = Array.isArray(row.elementNumber) ? row.elementNumber[1] : (row.elementRows ?? row.elementCountY ?? 0);
    this.draft.elemCountX = String(elemCountX);
    this.draft.elemCountY = String(elemCountY);

    const elemSizeX = Array.isArray(row.elementSize) ? row.elementSize[0] : (row.elementWidth ?? row.elementSizeX ?? 0);
    const elemSizeY = Array.isArray(row.elementSize) ? row.elementSize[1] : (row.elementHeight ?? row.elementSizeY ?? 0);
    this.draft.elemSizeX = String(elemSizeX);
    this.draft.elemSizeY = String(elemSizeY);

    this.draft.avgPower = row.risEnergy ?? row.avgPower ?? 0;
    this.draft.price = row.risCost ?? row.price ?? 0;

    this.selectedFileName = '';
  }

  constructor() {
    console.log('[RisEditModal] constructor');
  }

  ngOnChanges(changes: SimpleChanges): void {
    const rowChanged = 'row' in changes;
    const openChanged = 'open' in changes;

    if ((rowChanged || openChanged) && this.open) {
      this.fillDraftFromRow(this.row);
    }
  }

  onBackdropClick(): void {
    console.log('[RisEditModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisEditModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[RisEditModal] cancel clicked');
    this.close.emit();
  }

  goNext(): void {
    console.log('[RisEditModal] next step');
    this.step = 2;
  }

  goPrev(): void {
    console.log('[RisEditModal] prev step');
    this.step = 1;
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

    console.log('[RisEditModal] template download clicked');
  }

  onFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.selectedFile = null;
      input.value = '';
      console.log('[RisEditModal] invalid file type. Only .xlsx/.xls allowed.');
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;

    console.log('[RisEditModal] file selected =', file.name, 'size=', file.size);
  }

  onConfirm(): void {
    // 只有選新檔才回傳 fileName/file，否則給空字串與 null，讓父層保留舊檔
    const payload = {
      ...this.draft,
      fileName: this.selectedFile ? this.selectedFileName : '',
      file: this.selectedFile,
    };

    console.log('[RisEditModal] confirm clicked - payload=', payload);
    this.confirm.emit(payload);
  }
}
