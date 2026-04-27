import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { Subject, take, finalize, switchMap, takeUntil, firstValueFrom } from 'rxjs';
import { RisListRow } from '../../../models/ris.model';
import { RisService } from '../../../services/ris.service';
import { AlertService } from 'src/app/services/alert.service';
import { RisAddSubmitPayload } from '../ris-add-modal/ris-add-modal.component';

type PresetType = 'system' | 'custom';
type RisManageRow = RisListRow & {
  __uiKey?: string;
  __uiStatus?: 'ready' | 'uploading' | 'error' | 'deleting';
};


@Component({
  selector: 'app-ris-manage-modal',
  templateUrl: './ris-manage-modal.component.html',
  styleUrls: ['./ris-manage-modal.component.scss'],
})
export class RisManageModalComponent implements OnInit, OnDestroy {
  @Input() zIndexBase = 3000;
  @Output() close = new EventEmitter<void>();

  preset: PresetType = 'system';
  rows: RisManageRow[] = [];
  loadingList = false;
  errorMsg: string | null = null;

  // ===== [RIS][ADD][UI_STATE] =====
  adding = false;
  deleting = false;
  private __pendingKeySeq = 0;

  private destroy$ = new Subject<void>();

    // Add/Edit modal
  addOpen = false;
  editOpen = false;
  editTarget: RisManageRow | null = null;
  editingRow: any = null;

  openAdd(): void {
    if (!this.isCustom) return;
    console.log('[RisManageModal] add clicked -> open add modal');
    this.addOpen = true;
  }

  closeAdd(): void {
    console.log('[RisManageModal] close add modal');
    this.addOpen = false;
  }

  openEdit(row: RisListRow): void {
    if (!this.isCustom) return;
    console.log('[RisManageModal] edit clicked -> open edit modal', row);
    this.editTarget = row;
    this.editingRow = row;
    this.editOpen = true;
  }

  closeEdit(): void {
    console.log('[RisManageModal] close edit modal');
    this.editOpen = false;
    this.editTarget = null;
    this.editingRow = null;
  }

  // ===== [RIS][ADD][PENDING_ROW] =====
  private buildPendingRowFromDraft(draft: any): RisManageRow {
    const key = `__pending_ris_${Date.now()}_${++this.__pendingKeySeq}`;
    const frequency = Array.isArray(draft?.frequency) ? draft.frequency : [0, 0];
    const elementNumber = Array.isArray(draft?.elementNumber) ? draft.elementNumber : [0, 0];
    const elementSize = Array.isArray(draft?.elementSize) ? draft.elementSize : [0, 0];

    return {
      __uiKey: key,
      __uiStatus: 'uploading',
      id: -1,
      name: draft?.risName ?? '(pending)',
      type: draft?.type ?? '',
      freqMHz: `${frequency[0] ?? 0} ~ ${frequency[1] ?? 0}`,
      vendor: draft?.manufacturer ?? '',
      material: draft?.material ?? '',
      elementCount: Number(elementNumber[0] ?? 0) * Number(elementNumber[1] ?? 0),
      elementSizeMm: `${elementSize[0] ?? 0} x ${elementSize[1] ?? 0}`,
      avgPower: Number(draft?.risEnergy ?? 0),
      price: Number(draft?.risCost ?? 0),
      property: 'customized',
    };
  }

  private removePendingRow(key: string): void {
    this.rows = (this.rows ?? []).filter((r) => r?.__uiKey !== key);
  }

  // Add confirm：先 addRis 再 addProfile，成功後 refresh
  async onAddConfirm(payload: RisAddSubmitPayload): Promise<void> {
    this.closeAdd();

    if (this.adding) return;

    console.log('[RisManageModal] add confirm received', payload);

    const risPayload = payload?.ris;
    const profilePayload = payload?.profile;

    if (!risPayload) {
      this.alertService.error('新增失敗：RIS 資料缺失');
      return;
    }
    if (!profilePayload?.file) {
      this.alertService.error('新增失敗：Profile 檔案缺失');
      return;
    }

    const pending = this.buildPendingRowFromDraft(risPayload);
    const pendingKey = pending.__uiKey || '';
    this.rows = [pending, ...(this.rows ?? [])];

    this.adding = true;
    let pendingRemoved = false;
    let risID: number | null = null;

    try {
      const addResult = await firstValueFrom(this.risService.add(risPayload));
      risID = Number(addResult?.risID);

      if (!Number.isFinite(risID) || risID <= 0) {
        throw new Error('[RisManageModal] invalid risID from add response');
      }

      await firstValueFrom(this.risService.addRisProfile(risID, profilePayload));

      this.alertService.success('新增成功');

      this.removePendingRow(pendingKey);
      pendingRemoved = true;
      this.refreshList();
    } catch (err: any) {
      const status = err?.status;
      const message = err?.message || '';

      if (risID == null) {
        console.error('[RisManageModal] add RIS failed', { status, message, err });
        this.alertService.error('新增失敗：建立 RIS 未成功，請檢查欄位（尤其材質/頻段）或後端狀態。');
      } else {
        console.error('[RisManageModal] add profile failed', { risID, status, message, err });
        this.alertService.error(`RIS 已建立（risID=${risID}），但 Profile 上傳失敗。請稍後到列表重試上傳。`);
      }
    } finally {
      if (!pendingRemoved) {
        this.removePendingRow(pendingKey);
      }
      this.adding = false;
    }
  }

  // Edit confirm：呼叫 service 更新，成功後 refresh
  onEditConfirm(payload: any): void {
    console.log('[RisManageModal] edit confirm received', payload);

    // Transform draft to UpdateRisPayload (RisApi structure)
    const transformedPayload: any = {
      risID: this.editTarget?.id || 0,
      risName: payload.name || '',
      type: payload.type === '主動' ? 'Active' : 'Passive',
      frequency: [
        Number(payload.freqStartMHz) || 0,
        Number(payload.freqEndMHz) || 0,
      ],
      material: payload.material || '',
      manufacturer: payload.vendor || '',
      elementNumber: [
        Number(payload.elemCountX) || 0,
        Number(payload.elemCountY) || 0,
      ],
      elementSize: [
        Number(payload.elemSizeX) || 0,
        Number(payload.elemSizeY) || 0,
      ],
      property: 'customized' as const,
      risEnergy: Number(payload.avgPower) || 0,
      risCost: Number(payload.price) || 0,
    };

    this.risService
      .updateRisOnApi(transformedPayload)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alertService.success('更新成功');
          this.closeEdit();
          this.refreshList(); // this will GET /son/getRis/{session}
        },
        error: (err) => {
          this.errorMsg = `Failed to update RIS: ${err?.message || 'Unknown error'}`;
          console.error('[RisManageModal] update error:', err);
          this.alertService.error('更新失敗，請檢查欄位（尤其材質/頻段）或後端狀態。');
        },
      });
  }


  // ===== [RIS][VIEW_PROFILES][STATE] =====
  viewProfilesOpen = false;
  viewProfilesTarget: any = null;
  profilesRows: any[] = [];
  profilesLoading = false;

  // 第二層：配置管理
  configManageOpen = false;
  configTarget: { risID: number; risName: string; isCustom: boolean } | null = null;

  get isCustom(): boolean {
    return this.preset === 'custom';
  }

  get currentRows(): RisManageRow[] {
    return this.rows;
  }

  // ===== [RIS][Derived] existing names for Add/Edit validation =====
  get existingRisNames(): string[] {
    // rows 是 RisListRow[]，name 已經是 UI 顯示用名稱
    return (this.rows ?? [])
      .map(r => (r?.name ?? '').trim())
      .filter(n => !!n);
  }

  constructor(private readonly risService: RisService, private readonly alertService: AlertService) {}

  ngOnInit(): void {
    this.refreshList();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Refresh the list from service based on current preset.
   * Now calls backend API first, then filters by preset.
   */
  private refreshList(): void {
    // ===== [API-TPL v1.1][List Guard] =====
    if (this.loadingList) return;

    this.loadingList = true;
    this.errorMsg = null;

    this.risService
      .loadRisListFromApi()
      .pipe(
        // 後端 list sync 到 service rows$ 後，再取出對應 preset rows
        switchMap(() => this.risService.getRisRows(this.preset)),
        take(1),
        finalize(() => {
          // ===== [API-TPL v1.1][List Finally] =====
          this.loadingList = false;
        })
      )
      .subscribe({
        next: (rows) => {
          this.rows = rows;
          console.log(`[RisManageModal] refreshList (${this.preset}): ${rows.length} rows`);
        },
        error: (err) => {
          // ===== [API-TPL v1.1][Alert Spec] =====
          this.errorMsg = err?.message ? `載入失敗：${err.message}` : '載入失敗，請稍後再試';
          console.error('[RisManageModal] refreshList error:', err);
        },
      });
  }

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onPresetChange(next: PresetType): void {
    this.preset = next;
    this.refreshList();
  }

  // 查看：開「配置管理」
  onView(row: RisListRow): void {
    console.log('[RisManageModal] view clicked', row);

    this.configTarget = {
      risID: row.id,
      risName: row.name,
      isCustom: this.isCustom, // 很重要：配置管理是否允許新增編輯刪除
    };
    this.configManageOpen = true;

    console.log('[RisManageModal] open config manage, ris=', row.name, 'isCustom=', this.isCustom);
  }

  closeConfigManage(): void {
    console.log('[RisManageModal] close config manage');
    this.configManageOpen = false;
    this.configTarget = null;
  }

  onAdd(): void {
    this.openAdd();
  }

  onEdit(row: RisListRow): void {
    this.openEdit(row);
  }

  openProfiles(row: any): void {
    const risID = Number(row?.risID);
    if (!Number.isFinite(risID) || risID <= 0) {
      this.alertService.error('查看失敗：找不到 risID');
      return;
    }

    this.viewProfilesTarget = row;
    this.viewProfilesOpen = true;

    this.profilesRows = [];
    this.profilesLoading = true;

    this.risService.getRisProfilesOnApi(risID)
      .pipe(take(1))
      .subscribe({
        next: (rows) => { this.profilesRows = Array.isArray(rows) ? rows : []; },
        error: (err) => {
          console.error('[RisManageModal] getRisProfiles failed', err);
          this.alertService.error('讀取 Profile 失敗，請稍後再試。');
          this.profilesRows = [];
          this.profilesLoading = false;
        },
        complete: () => { this.profilesLoading = false; }
      });
  }

  closeProfiles(): void {
    this.viewProfilesOpen = false;
    this.viewProfilesTarget = null;
    this.profilesRows = [];
    this.profilesLoading = false;
  }

  onDeleteClick(row: any): void {
    const risID = Number(row?.risID ?? row?.id);
    const name = row?.risName ?? row?.name ?? '';

    if (!Number.isFinite(risID) || risID <= 0) {
      this.alertService.error('刪除失敗：找不到 risID');
      return;
    }

    this.alertService.question(`確定要刪除 RIS「${name || risID}」嗎？此操作無法復原。`).subscribe(ok => {
      if (!ok) return;

      if (this.deleting) return;
    this.deleting = true;

    // Optional: mark row as deleting to disable buttons
    row.__uiStatus = 'deleting';

    this.risService
      .deleteRisOnApi(risID)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alertService.success('刪除成功');
          this.refreshList(); // triggers GET /son/getRis/{session}
        },
        error: (err) => {
          console.error('[RisManageModal] delete error', err);
          this.alertService.error('刪除失敗，請稍後再試或確認後端狀態。');
          // rollback UI state
          row.__uiStatus = undefined;
        },
        complete: () => {
          this.deleting = false;
        }
      });
    });
  }

  onDelete(row: RisListRow): void {
    if (!this.isCustom) return;
    this.onDeleteClick(row);
  }
}
