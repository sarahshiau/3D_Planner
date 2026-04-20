import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MaterialService } from 'src/app/services/material.service';
import { AddMaterialPayload, MaterialRow, UpdateMaterialPayload } from 'src/app/models/material.model';
import { AuthService } from 'src/app/services/auth.service';
import { AlertService } from 'src/app/services/alert.service';

type PresetType = 'system' | 'custom';

@Component({
  selector: 'app-material-manage-modal',
  templateUrl: './material-manage-modal.component.html',
  styleUrls: ['./material-manage-modal.component.scss'],
})
export class MaterialManageModalComponent implements OnInit {
  @Input() zIndexBase = 3000;
  @Output() close = new EventEmitter<void>();

  preset: PresetType = 'system';

  // ========== System / Custom ==========
  systemRows: MaterialRow[] = [];
  customRows: MaterialRow[] = [];

  addOpen = false;
  editOpen = false;
  editTarget: MaterialRow | null = null;
  loadingList = false;
  saving = false;

  // 分頁
  systemPageSize = 6; // 第一頁 6，第二頁 5
  customPageSize = 6; // 先用 6（之後你若要 3/頁也可改）
  page = 1;

  get isCustom(): boolean {
    return this.preset === 'custom';
  }

  get pageSize(): number {
    return this.isCustom ? this.customPageSize : this.systemPageSize;
  }

  get currentRowsAll(): MaterialRow[] {
    return this.isCustom ? this.customRows : this.systemRows;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.currentRowsAll.length / this.pageSize));
  }

  get currentRowsPage(): MaterialRow[] {
    const start = (this.page - 1) * this.pageSize;
    return this.currentRowsAll.slice(start, start + this.pageSize);
  }

  constructor(
    private materialService: MaterialService,
    private authService: AuthService,
    private alertService: AlertService
  ) {}

  ngOnInit(): void {
    void this.refresh();
  }

  private showSuccess(msg: string): void {
    this.alertService.success(msg);
  }

  private showError(msg: string): void {
    this.alertService.error(msg);
  }

  async refresh(): Promise<void> {
    if (this.loadingList) return;
    this.loadingList = true;

    try {
      const sessionToken = this.authService.getSessionInfo();
      if (!sessionToken) {
        throw new Error('missing session token');
      }

      const rows = await firstValueFrom(this.materialService.getMaterials());
      this.systemRows = rows.filter((r) => r.property === 'default');
      this.customRows = rows.filter((r) => r.property === 'customized');

      if (this.page > this.totalPages) this.page = this.totalPages;
    } catch (error) {
      console.error('[MaterialManageModal] refresh failed', error);
      this.showError('載入失敗，請稍後再試');
    } finally {
      this.loadingList = false;
    }
  }

  onBackdropClick(): void {
    // 依你的規格：不允許點背景關閉，只阻擋
  }

  onClose(): void {
    this.close.emit();
  }

  onPresetChange(next: PresetType): void {
    this.preset = next;
    this.page = 1; // 切 tab 回到第一頁
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page--;
  }

  nextPage(): void {
    if (this.page >= this.totalPages) return;
    this.page++;
  }

  // ===== custom actions（Step2/3 會接 Add/Edit modal）=====
  onAdd(): void {
    if (!this.isCustom) return;
    this.addOpen = true;
  }

  closeAdd(): void {
    this.addOpen = false;
  }

  async onAddConfirm(payload: AddMaterialPayload): Promise<void> {
    if (!this.isCustom) return;
    if (this.saving) return;

    this.saving = true;
    const uiKey = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pendingRow: MaterialRow = {
      id: -Date.now(),
      name: payload.name,
      decay: Number(payload.decayCoefficient),
      property: 'customized',
      __uiKey: uiKey,
      __uiStatus: 'uploading',
    };

    this.customRows = [pendingRow, ...this.customRows];
    this.page = 1;

    try {
      await firstValueFrom(this.materialService.addMaterial(payload));
      this.addOpen = false;
      this.showSuccess('新增成功');
      await this.refresh();
    } catch (error) {
      console.error('[MaterialManageModal] add failed', error);
      this.showError('新增失敗，請稍後再試');
    } finally {
      this.customRows = this.customRows.filter((row) => row.__uiKey !== uiKey);
      this.saving = false;
    }
  }

  onEdit(row: MaterialRow): void {
    if (!this.isCustom) return;

    this.editTarget = row;
    this.editOpen = true;
  }

  closeEdit(): void {
    this.editOpen = false;
    this.editTarget = null;
  }

  async onEditConfirm(payload: UpdateMaterialPayload): Promise<void> {
    if (!this.isCustom) return;
    if (this.saving) return;

    this.saving = true;

    try {
      await firstValueFrom(this.materialService.updateMaterial(payload));
      this.editOpen = false;
      this.editTarget = null;
      this.showSuccess('更新成功');
      await this.refresh();
    } catch (error) {
      console.error('[MaterialManageModal] update failed', error);
      this.showError('更新失敗，請稍後再試');
    } finally {
      this.saving = false;
    }
  }

  async onDelete(row: MaterialRow): Promise<void> {
    if (!this.isCustom) return;
    this.alertService.question('確定要刪除嗎？').subscribe(async ok => {
      if (!ok) return;
      if (this.saving) return;

      this.saving = true;

      try {
        await firstValueFrom(this.materialService.deleteMaterial(row.id, row.name));
        this.showSuccess('刪除成功');
        await this.refresh();
      } catch (error) {
        console.error('[MaterialManageModal] delete failed', error);
        this.showError('刪除失敗，請稍後再試');
      } finally {
        this.saving = false;
      }
    });
  }
}
