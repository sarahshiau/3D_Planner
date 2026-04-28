import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { PathLossModelService } from '../../../services/pathloss-model.service';
import { AlertService } from 'src/app/services/alert.service';
import {
  PathLossModelRow,
  UpdatePathLossModelPayload,
} from '../../../models/pathloss-model.model';
import type {
  PathlossManualPayload,
  PathlossImportPayload,
} from '../pathloss-model-add-modal/pathloss-model-add-modal.component';

type PresetType = 'system' | 'custom';

export type PathlossRow = PathLossModelRow & {
  __uiKey?: string;
  __uiStatus?: 'idle' | 'uploading' | 'error';
};

@Component({
  selector: 'app-pathloss-model-manage-modal',
  templateUrl: './pathloss-model-manage-modal.component.html',
  styleUrls: ['./pathloss-model-manage-modal.component.scss'],
})
export class PathlossModelManageModalComponent implements OnInit {
  @Input() zIndexBase = 3000;
  @Output() close = new EventEmitter<void>();

  preset: PresetType = 'system';

  systemRows: PathlossRow[] = [];
  customRows: PathlossRow[] = [];
  loadingList = false;
  uploading = false;
  updating = false;
  deleting = false;

  addOpen = false;

  editOpen = false;
  editTarget: PathlossRow | null = null;


  // ✅ system 分頁：第一頁 8 筆、第二頁 2 筆
  pageSizeSystem = 8;
  systemPage = 1;

  constructor(private pathlossService: PathLossModelService, private alertService: AlertService) {}

  get isCustom(): boolean {
    return this.preset === 'custom';
  }

  get systemTotalPages(): number {
    return Math.max(1, Math.ceil(this.systemRows.length / this.pageSizeSystem));
  }

  get systemPageRows(): PathlossRow[] {
    const start = (this.systemPage - 1) * this.pageSizeSystem;
    return this.systemRows.slice(start, start + this.pageSizeSystem);
  }

  get currentRows(): PathlossRow[] {
    return this.isCustom ? this.customRows : this.systemPageRows;
  }

  trackByRow = (_: number, row: PathlossRow): string | number => {
    return row.__uiKey ?? row.id;
  };

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.loadingList) return;
    this.loadingList = true;

    try {
      const session = 'son_session_8e1f1a2e-f3ff-43ed-bba8-9e60d26960ad';
      const list = await this.pathlossService.getList(session);
      const rows = list.map(dto => this.pathlossService.mapDtoToRow(dto));

      this.systemRows = rows.filter(r => r.property === 'default');
      this.customRows = rows.filter(r => r.property === 'customized');

      if (this.systemPage > this.systemTotalPages) {
        this.systemPage = this.systemTotalPages;
      }
    } catch (error) {
      console.error('[PathlossManageModal] refresh failed', error);
      this.alertService.error(this.pathlossService.formatError(error));
    } finally {
      this.loadingList = false;
    }
  }

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onPresetChange(next: PresetType): void {
    this.preset = next;
    if (this.preset === 'system') this.systemPage = 1;
  }

  prevSystemPage(): void {
    if (this.systemPage <= 1) return;
    this.systemPage--;
  }

  nextSystemPage(): void {
    if (this.systemPage >= this.systemTotalPages) return;
    this.systemPage++;
  }

  onAdd(): void {
    if (!this.isCustom) return;
    this.addOpen = true;
  }

  onEdit(row: PathlossRow): void {
    if (!this.isCustom) return;
    this.editTarget = row;
    this.editOpen = true;
  }

  closeEdit(): void {
    this.editOpen = false;
    this.editTarget = null;
  }

  async onEditConfirm(payload: UpdatePathLossModelPayload): Promise<void> {
    if (this.updating) return;
    this.updating = true;

    try {
      await this.pathlossService.updatePathLossModel({
        id: payload.id,
        name: payload.name,
        chineseName: payload.chineseName,
        distancePowerLoss: payload.distancePowerLoss,
        fieldLoss: payload.fieldLoss,
        property: payload.property === 'default' ? 'default' : 'customized',
      });
      await this.refresh();
      this.closeEdit();
    } catch (error) {
      console.error('[PathlossManageModal] update failed', error);
      this.alertService.error(this.pathlossService.formatError(error));
    } finally {
      this.updating = false;
    }
  }

  async onDelete(row: PathlossRow): Promise<void> {
    if (!this.isCustom) return;
    this.alertService.question(`確定要刪除路損模型「${row.name}」？`).subscribe(async ok => {
      if (!ok) return;
      if (this.deleting) return;

      this.deleting = true;
      try {
        await this.pathlossService.deletePathLossModel({
          id: row.id,
          name: row.name,
        });
        await this.refresh();
      } catch (error) {
        console.error('[PathlossManageModal] delete failed', error);
        this.alertService.error(this.pathlossService.formatError(error));
      } finally {
        this.deleting = false;
      }
    });
  }

  closeAdd(): void {
    this.addOpen = false;
  }

  private removePendingRow(uiKey: string): void {
    this.customRows = this.customRows.filter(row => row.__uiKey !== uiKey);
  }

  async onAddConfirm(payload: PathlossManualPayload | PathlossImportPayload): Promise<void> {
    if (this.uploading) return;

    this.addOpen = false;
    this.uploading = true;

    const pendingKey = `pending_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    try {
      if (payload.mode === 'manual') {
        // Manual mode: direct add
        const manualPayload = payload as PathlossManualPayload;
        const pendingRow: PathlossRow = {
          id: -1,
          name: manualPayload.draft.name,
          chineseName: manualPayload.draft.chineseName,
          distancePowerLoss: manualPayload.draft.distancePowerLoss,
          fieldLoss: manualPayload.draft.fieldLoss,
          property: 'customized',
          formula: `Ltotal = 20 log10 f + ${manualPayload.draft.distancePowerLoss} log10 d + ${manualPayload.draft.fieldLoss} - 28`,
          __uiKey: pendingKey,
          __uiStatus: 'uploading',
        };

        this.customRows = [pendingRow, ...this.customRows];

        const session = 'son_session_8e1f1a2e-f3ff-43ed-bba8-9e60d26960ad';
        await this.pathlossService.addPathLossModel(manualPayload.draft, session);

        this.removePendingRow(pendingKey);
        await this.refresh();

        this.alertService.success('新增成功');
      } else if (payload.mode === 'import') {
        // Import mode: file upload + polling
        const importPayload = payload as PathlossImportPayload;
        const pendingRow: PathlossRow = {
          id: -1,
          name: importPayload.name,
          chineseName: importPayload.name,
          distancePowerLoss: 0,
          fieldLoss: 0,
          property: 'customized',
          formula: 'Ltotal = (importing...)',
          __uiKey: pendingKey,
          __uiStatus: 'uploading',
        };

        this.customRows = [pendingRow, ...this.customRows];

        const session = 'son_session_8e1f1a2e-f3ff-43ed-bba8-9e60d26960ad';
        const calculateRes = await this.pathlossService.calculateFromFile(session, {
          file: importPayload.file,
          name: importPayload.name,
          sha256sum: importPayload.sha256sum,
          property: 'customized',
        });

        // Poll until complete and get result with N/Lf
        let pollingResult: any = null;
        try {
          pollingResult = await this.pathlossService.waitForPollComplete(session, calculateRes.id);
        } catch (pollErr) {
          // Polling failed or timeout
          this.removePendingRow(pendingKey);
          const pollErrMsg = (pollErr as any)?.message || String(pollErr);
          if (pollErrMsg.includes('timeout')) {
            // Timeout: offer manual refresh
            this.alertService.success('已上傳並開始計算，但尚未完成，請稍後刷新列表');
            await this.refresh();
          } else {
            // Direct polling error
            this.alertService.error(`計算失敗：${pollErrMsg}`);
          }
          return;
        }

        this.removePendingRow(pendingKey);
        await this.refresh();

        // Use polling result N/Lf directly (not dependent on refresh)
        if (pollingResult && pollingResult.distancePowerLoss !== undefined && pollingResult.fieldLoss !== undefined) {
          const N = pollingResult.distancePowerLoss;
          const Lf = pollingResult.fieldLoss;
          this.alertService.success(
            `無線訊號衰減模型新增成功!系統計算結果如下:\n\nLtotal = 20 log10 f + ${N} log10 d + ${Lf} - 28`
          );
        } else {
          // Fallback: try to find from refreshed list
          const created =
            this.customRows.find(row => row.id === calculateRes.id) ||
            this.customRows.find(
              row => row.name === importPayload.name && row.property === 'customized'
            );

          if (created) {
            const N = created.distancePowerLoss;
            const Lf = created.fieldLoss;
            this.alertService.success(
              `無線訊號衰減模型新增成功!系統計算結果如下:\n\nLtotal = 20 log10 f + ${N} log10 d + ${Lf} - 28`
            );
          } else {
            this.alertService.success('新增成功但尚未取得係數，請稍後 refresh');
          }
        }
      }
    } catch (error) {
      this.removePendingRow(pendingKey);
      console.error('[PathlossManageModal] add failed', error);
      this.alertService.error(this.pathlossService.formatError(error));
    } finally {
      this.uploading = false;
    }
  }
}
