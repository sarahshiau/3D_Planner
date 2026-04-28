import { Component, EventEmitter, Output, Input, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AntennaRow as AntennaRowModel } from '../../../models/antenna/antenna.ui.model';
import { AntennaUpsertDraft } from '../../../models/antenna/antenna.draft';
import { AntennaAddConfirmPayload } from '../antenna-add-modal/antenna-add-modal.component';
import { AlertService } from 'src/app/services/alert.service';
export type AntennaRow = Omit<AntennaRowModel, 'id' | 'property'> & {
  id?: number;
  property?: string;
  __uiStatus?: 'ready' | 'uploading' | 'error';
  __uiKey?: string;
  __uiError?: string;
};
import { AntennaService, AntennaUploadDomainError } from '../../../services/antenna.service';

type PresetType = 'system' | 'custom' ;

@Component({
  selector: 'app-antenna-manage-modal',
  templateUrl: './antenna-manage-modal.component.html',
  styleUrls: ['./antenna-manage-modal.component.scss'],
})
export class AntennaManageModalComponent implements OnInit {
  @Input() zIndexBase = 3000;
  @Output() close = new EventEmitter<void>();

  preset: 'system'| 'custom' = 'system';

  systemRows: AntennaRow[] = [];
  customRows: AntennaRow[] = [];

  patternOpen = false;
  patternAntenna: AntennaRow | null = null;

  // 編輯 modal 狀態
  editOpen = false;
  editTarget: AntennaRow | null = null;
  editTargetPatternFileName = '';
  
  addOpen = false;
  uploading = false;
  loadingList = false;


  get isCustom(): boolean {
  return this.preset === 'custom';
  }

  get currentRows(): AntennaRow[] {
    return this.isCustom ? this.customRows : this.systemRows;
  }

  
  constructor(private antennaService: AntennaService, private alertService: AlertService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loadingList = true;

    this.antennaService.getAntennas().subscribe({
      next: (list) => {
        const rows = (list ?? []).map((item: any) => {
          const row: AntennaRow = {
            id: item.id,
            name: item.name,
            type: item.type,
            freqMHz: item.freqMHz,
            network: item.network,
            count: item.count,
            model: item.model,
            vendor: item.vendor,
            property: item.property
          };
          return row;
        });

        this.systemRows = rows.filter(r => r.property === 'default');
        this.customRows = rows.filter(r => r.property === 'customized');
      },
      error: (err) => {
        console.error('[AntennaManageModal] refresh failed', err);
      },
      complete: () => {
        this.loadingList = false;
      }
    });
  }

  private buildPendingRowFromDraft(draft: any): AntennaRow {
    const freqStart = draft.freqStartMHz ?? 0;
    const freqEnd = draft.freqEndMHz ?? 0;
    const freqMHz = freqStart && freqEnd ? `${freqStart}~${freqEnd}` : '-';

    return {
      name: draft.name ?? '-',
      type: draft.type ?? '-',
      network: draft.protocol ?? draft.network ?? '5G',
      freqMHz,
      count: draft.port ?? 0,
      vendor: draft.manufactor ?? draft.vendor ?? '-',
      model: draft.model ?? '-',
      property: 'customized',
      __uiStatus: 'uploading',
      __uiKey: 'pending_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    };
  }

  private removePendingRow(uiKey: string): void {
    this.customRows = this.customRows.filter(r => r.__uiKey !== uiKey);
  }

  private isAntennaUploadDomainError(err: any): err is AntennaUploadDomainError {
    return !!err && typeof err === 'object' && typeof err.kind === 'string';
  }

  private applyUploadDomainErrorFix(draft: AntennaUpsertDraft, err: AntennaUploadDomainError): void {
    if (err.kind === 'band_invalid' || err.kind === 'band_and_port_invalid') {
      draft.freqStartMHz = 0;
      draft.freqEndMHz = 0;
    }

    if (err.kind === 'port_invalid' || err.kind === 'band_and_port_invalid') {
      draft.port = 1;
    }
  }

  onBackdropClick(): void {
    // 依你的需求：不能點窗外任何東西（包含關閉）
  }

  onClose(): void {
    this.close.emit();
  }

  onPresetChange(next: PresetType): void {
    this.preset = next;
  }

  onView(row: AntennaRow): void {
    console.log('[AntennaManageModal] view clicked', row);

    this.patternAntenna = row;
    this.patternOpen = true;

    console.log('[AntennaManageModal] open pattern modal, antenna=', row.name);
  }

  closePattern(): void {
    console.log('[AntennaManageModal] close pattern modal');
    this.patternOpen = false;
    this.patternAntenna = null;
  }

  closeAdd(): void {
    console.log('[AntennaManageModal] close add modal');
    this.addOpen = false;
  }

  async onAddConfirm(payload: AntennaAddConfirmPayload): Promise<void> {
    // [A] Close modal immediately for responsive UX
    this.addOpen = false;

    // [B] Guard against double-click during upload
    if (this.uploading) return;

    const session = 'son_session_c4e9d830-d01d-47fe-94bc-b491bc1009b3';
    const { draft, file, sha256sum } = payload;

    // [C] Build and insert pending row for optimistic UI
    const pending = this.buildPendingRowFromDraft(draft as any);
    const pendingKey = pending.__uiKey!;
    this.customRows = [pending, ...this.customRows];

    // [D] Set uploading flag
    this.uploading = true;

    // [E] Force customized property and upload
    const next: AntennaUpsertDraft = { ...draft, property: 'customized' };

    let pendingRemoved = false;

    try {
      await firstValueFrom(this.antennaService.uploadAntenna(session, next, file, sha256sum));
      console.log('[AntennaManageModal] upload success');

      this.alertService.success('新增成功');

      this.removePendingRow(pendingKey);
      pendingRemoved = true;
      this.refresh();
    } catch (err) {
      if (this.isAntennaUploadDomainError(err)) {
        this.applyUploadDomainErrorFix(next, err);

        if (err.kind === 'band_invalid') {
          this.alertService.error('上傳失敗：頻段資料無效，已清空頻段，請重新選擇後再試。');
        } else if (err.kind === 'port_invalid') {
          this.alertService.error('上傳失敗：埠數無效，已重設為 1，請確認後再試。');
        } else if (err.kind === 'band_and_port_invalid') {
          this.alertService.error('上傳失敗：頻段與埠數無效，已清空頻段並重設埠數為 1。');
        } else {
          this.alertService.error('上傳失敗，請檢查欄位與檔案格式。');
        }
      } else {
        console.error('[AntennaManageModal] upload failed', {
          status: (err as any)?.status,
          error: (err as any)?.error,
          message: (err as any)?.message
        });
        this.alertService.error('上傳失敗，請檢查欄位與檔案格式。');
      }
    } finally {
      if (!pendingRemoved) {
        this.removePendingRow(pendingKey);
      }
      this.uploading = false;
    }
  }

  onAdd(): void {
    if (!this.isCustom) return;
    if (this.uploading) return;

    console.log('[AntennaManageModal] add clicked -> open add modal');
    this.addOpen = true;
  }

  onEdit(row: AntennaRow): void {
    if (!this.isCustom) return;

    console.log('[AntennaManageModal] edit clicked -> open edit modal', row);

    this.editTarget = row;
    this.editTargetPatternFileName = (row as any).patternFileName || '';
    this.editOpen = true;
  }

  // ===== [Antenna][Delete][Flow] =====
  onDelete(row: AntennaRow): void {
    this.alertService.question(`確定要刪除天線「${row.name}」？`).subscribe(ok => {
      if (!ok) return;

      console.log('[Antenna][Delete] start', { id: row.id });

      this.antennaService.deleteAntenna(row.id!).subscribe({
      next: () => {
        console.log('[Antenna][Delete] success, refreshing list...');
        this.refresh();
      },
      error: (err) => {
        console.error('[Antenna][Delete] failed', err);
        this.alertService.error('刪除失敗，請稍後再試');
      }
    });
    });
  }

closeEditModal(): void {
  console.log('[AntennaManageModal] close edit modal');
  this.editOpen = false;
  this.editTarget = null;
  this.editTargetPatternFileName = '';
}

onEditConfirm(draft: AntennaUpsertDraft): void {
  console.log('[AntennaManageModal] edit confirm received', draft);

  if (draft?.antennaID == null) {
    console.error('[AntennaManageModal] edit failed: missing antennaID', draft);
    return;
  }

  const next: AntennaUpsertDraft = {
    ...draft,
    property: draft.property ?? 'customized',
  };

  this.onConfirmEdit(next);
  this.closeEditModal();
}

  onConfirmEdit(draft: AntennaUpsertDraft): void {
    this.antennaService.updateAntenna(draft).subscribe({
      next: () => this.refresh(),
      error: (error) => {
        console.error('[AntennaManageModal] edit failed', error);
        this.alertService.error('編輯失敗，請檢查欄位與檔案格式。');
      }
    });
  }

  onConfirmDelete(antennaID: number): void {
    this.antennaService.deleteAntenna(antennaID).subscribe({
      next: () => this.refresh(),
      error: (error) => {
        console.error('[AntennaManageModal] delete failed', error);
        this.alertService.error('刪除失敗，請稍後再試。');
      }
    });
  }

  trackByRow = (_: number, r: AntennaRow) => r.__uiKey ?? r.id ?? r.name;

  private parseFreqRange(freqMHz: string): [number, number] {
    if (!freqMHz) return [0, 0];
    const parts = freqMHz.split('~').map(part => Number(part.trim()));
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    if (parts.length === 1 && !Number.isNaN(parts[0])) {
      return [parts[0], parts[0]];
    }
    return [0, 0];
  }

}

