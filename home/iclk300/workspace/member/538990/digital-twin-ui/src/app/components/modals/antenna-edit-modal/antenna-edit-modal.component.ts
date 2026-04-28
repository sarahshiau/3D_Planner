import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AntennaRow } from '../antenna-manage-modal/antenna-manage-modal.component';
import { AntennaUpsertDraft } from '../../../models/antenna/antenna.draft';
import { AntennaService } from '../../../services/antenna.service';
import { finalize } from 'rxjs';

export interface AntennaEditDraft {
  name: string;
  type: '全向' | '指向';
  network: '5G' | 'Wi-Fi';
  freqStartMHz: string;
  freqEndMHz: string;
  count: number;
  vendor: string;
  model: string;

  // 檔案（前端暫存，不上傳）
  patternFileName?: string;
  patternFile?: File | null;
}

@Component({
  selector: 'app-antenna-edit-modal',
  templateUrl: './antenna-edit-modal.component.html',
  styleUrls: ['./antenna-edit-modal.component.scss'],
})
export class AntennaEditModalComponent {
  @Input() zIndexBase = 3020;

  // ✅ 必填：要編輯的那筆
  @Input() antenna!: AntennaRow;

  // ✅ 若你 row 有存 patternFileName，就可以顯示；沒有也不會壞
  @Input() patternFileName?: string;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<AntennaUpsertDraft>();

  // 顯示用：目前選到的檔名
  selectedFileName = '';
  private selectedFile: File | null = null;

  // ===== [WP1][RemoteXlsxLink] =====
  get remoteXlsxName(): string {
    const base = (this.draft?.name || this.antenna?.name || 'antenna').trim();
    return `${base}.xlsx`;
  }

  get canShowRemoteXlsxLink(): boolean {
    return !this.selectedFile;
  }

  downloadingRemoteXlsx = false;

  // 表單 draft
  draft: AntennaEditDraft = {
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

  constructor(private antennaService: AntennaService) {}

  ngOnInit(): void {
    // ✅ 由 AntennaRow 拆出起訖（支援 "3500 ~ 3700" 這種格式）
    const [start, end] = this.parseFreqRange(this.antenna?.freqMHz ?? '');

    this.draft = {
      name: this.antenna?.name ?? '',
      type: (this.antenna?.type as any) ?? '指向',
      network: (this.antenna?.network as any) ?? '5G',
      freqStartMHz: start,
      freqEndMHz: end,
      count: this.antenna?.count ?? 1,
      vendor: this.antenna?.vendor ?? '',
      model: this.antenna?.model ?? '',
      patternFileName: this.patternFileName ?? '',
      patternFile: null,
    };

    // WP1: 初始不要顯示「未選擇檔案」，由遠端 link 或新檔名決定
    this.selectedFileName = '';
  }

  onBackdropClick(): void {
    console.log('[AntennaEditModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[AntennaEditModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[AntennaEditModal] cancel clicked');
    this.close.emit();
  }

  onFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.selectedFile = null;
      this.selectedFileName = '';
      this.draft.patternFileName = this.patternFileName || '';
      this.draft.patternFile = null;

      input.value = '';
      console.log('[AntennaEditModal] invalid file type. Only .xlsx/.xls allowed.');
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;

    // ✅ 同步寫回 draft
    this.draft.patternFileName = this.selectedFileName;
    this.draft.patternFile = this.selectedFile;

    console.log('[AntennaEditModal] file selected =', this.selectedFileName, 'size=', file.size);
  }

  onConfirm(): void {
    const type = this.draft.type === '全向' ? 'Omnidirectional' : 'Directional';
    const payload: AntennaUpsertDraft = {
      antennaID: this.antenna?.id ?? 0,
      name: this.draft.name,
      type,
      freqStartMHz: Number(this.draft.freqStartMHz || 0),
      freqEndMHz: Number(this.draft.freqEndMHz || 0),
      protocol: this.draft.network,
      port: Number(this.draft.count || 0),
      model: this.draft.model,
      manufactor: this.draft.vendor,
      property: this.antenna?.property ?? 'customized',
    };

    console.log('[AntennaEditModal] confirm clicked - payload=', payload);
    this.confirm.emit(payload);
  }

  downloadTemplate(): void {
    const url = 'assets/templates/ITRI_antenna_template.xlsx';

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_antenna_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    console.log('[AntennaEditModal] template download clicked');
  }

  // ===== [WP2][RemoteXlsxClick] =====
  onDownloadRemoteXlsx(): void {
    if (this.downloadingRemoteXlsx) return;

    const antennaId = this.antenna?.id ?? 0;
    if (!antennaId) {
      console.warn('[AntennaEditModal][WP2] missing antennaId');
      return;
    }

    this.downloadingRemoteXlsx = true;

    this.antennaService
      .getAntennaRawData(antennaId)
      .pipe(finalize(() => (this.downloadingRemoteXlsx = false)))
      .subscribe({
        next: (data) => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);

          const base = (this.draft?.name || this.antenna?.name || 'antenna').trim();
          const a = document.createElement('a');
          a.href = url;
          a.download = `${base}.json`;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          console.log('[AntennaEditModal][WP2] rawData downloaded as JSON', { antennaId });
        },
        error: (err) => {
          console.error('[AntennaEditModal][WP2] rawData download failed', err);
        },
      });
  }

  private parseFreqRange(freqMHz: string): [string, string] {
    // 支援 "3500 ~ 3700" / "3500~3700" / "3500 - 3700"
    const cleaned = (freqMHz || '').replace(/\s+/g, '');
    const m = cleaned.match(/^(.+?)[~\-–—](.+)$/);
    if (!m) return ['', ''];
    return [m[1], m[2]];
  }
}
