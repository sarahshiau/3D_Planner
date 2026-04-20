import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { Subject, take } from 'rxjs';
import { RisProfileRow, RisProfileListRow } from '../../../models/ris.model';
import { RisService } from '../../../services/ris.service';
import { AlertService } from 'src/app/services/alert.service';

export interface RisConfigRow {
  name: string;
  incAzRange: string;
  incElRange: string;
  refAz: string;
  refEl: string;
  reflGainDb: number;
  patternFileName?: string;
}

export interface PatternTarget {
  risID: number;
  profileID: number;
  name: string;
}

@Component({
  selector: 'app-ris-config-manage-modal',
  templateUrl: './ris-config-manage-modal.component.html',
  styleUrls: ['./ris-config-manage-modal.component.scss'],
})
export class RisConfigManageModalComponent implements OnInit, OnDestroy {
  @Input() zIndexBase = 3010;
  @Input() risName = '';
  @Input() risID = 0; // ✅ RIS ID for profile lookup
  @Input() isCustom = false; // ✅ 由上一層傳入決定權限

  @Output() close = new EventEmitter<void>();

  rows: RisProfileListRow[] = [];
  isLoading = false;
  errorMsg: string | null = null;

  patternOpen = false;
  patternTarget: PatternTarget | null = null;
  configAddOpen = false;
  configEditOpen = false;
  configEditTarget: RisProfileListRow | null = null;

  private destroy$ = new Subject<void>();

  constructor(private readonly risService: RisService, private readonly alertService: AlertService) {
    console.log('[RisConfigManageModal] constructor');
  }

  ngOnInit(): void {
    console.log('[RisConfigManageModal] ngOnInit ris=', this.risName, 'isCustom=', this.isCustom);
    console.log('[RisConfigManageModal] zIndexBase(overlay)=', this.zIndexBase);
    this.refreshProfiles();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Refresh profile list from service.
   */
  private refreshProfiles(): void {
    const risID = Number(this.risID);

    console.log('[RisConfigManageModal][DBG] refreshProfiles ENTER', {
      risID,
      risName: this.risName
    });

    if (!Number.isFinite(risID) || risID <= 0) {
      this.isLoading = false;
      this.errorMsg = '找不到 RIS ID（risID 無效），請關閉後重開再試。';
      console.error('[RisConfigManageModal] invalid risID input', { risID: this.risID });
      return;
    }

    this.isLoading = true;
    this.errorMsg = null;

    this.risService
      .getRisProfilesOnApi(risID)
      .pipe(take(1))
      .subscribe({
        next: (profiles: any[]) => {
          console.log('[RisConfigManageModal][DBG] profiles raw', {
            count: Array.isArray(profiles) ? profiles.length : -1,
            sample: Array.isArray(profiles) && profiles.length ? profiles[0] : null,
          });

          const list = Array.isArray(profiles) ? profiles : [];
          this.rows = list.map((p: any) => ({
            profileID: Number(p.profileID),
            name: String(p.profileName ?? ''),
            incAzRange: Array.isArray(p.incHorizontal) ? `${p.incHorizontal[0]}~${p.incHorizontal[1]}` : String(p.incHorizontal ?? ''),
            incElRange: Array.isArray(p.incVertical) ? `${p.incVertical[0]}~${p.incVertical[1]}` : String(p.incVertical ?? ''),
            refAz: String(p.refHorizontal ?? ''),
            refEl: String(p.refVertical ?? ''),
            reflGainDb: Number(p.refCoefficient ?? 0),
          })) as any;
        },
        error: (err) => {
          this.errorMsg = `Failed to load profiles: ${err?.message || 'Unknown error'}`;
          console.error('[RisConfigManageModal] refreshProfiles error:', err);
        },
        complete: () => {
          this.isLoading = false;
        },
      });
  }

  onBackdropClick(): void {
    console.log('[RisConfigManageModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisConfigManageModal] close clicked');
    this.close.emit();
  }

  onView(row: RisProfileListRow): void {
    console.log('[RisConfigManageModal] view pattern clicked', row);

    const risID = Number((this.risID || (row as any)?.risID) ?? 0);
    if (!Number.isFinite(risID) || risID <= 0) {
      this.alertService.error('查看失敗：找不到 risID');
      return;
    }

    const profileID = Number((row as any)?.profileID ?? 0);
    if (!Number.isFinite(profileID) || profileID <= 0) {
      this.alertService.error('查看失敗：找不到 profileID');
      return;
    }

    this.patternTarget = {
      risID,
      profileID,
      name: row.name,
    };

    this.patternOpen = true;
  }

  closePattern(): void {
    console.log('[RisConfigManageModal] close pattern modal');
    this.patternOpen = false;
    this.patternTarget = null;
  }

  onAdd(): void {
    this.openConfigAdd();
  }

  onEdit(row: any): void {
    if (!this.isCustom) return;
    console.log('[RisConfigManageModal] edit clicked -> open config edit modal', row);

    this.openConfigEdit(row);
  }

  onDelete(row: RisProfileListRow): void {
    if (!this.isCustom) return;

    const rid = Number(this.risID);
    const pid = Number(row?.profileID ?? 0);

    if (!Number.isFinite(rid) || rid <= 0) {
      this.alertService.error('刪除失敗：risID 無效');
      return;
    }
    if (!Number.isFinite(pid) || pid <= 0) {
      this.alertService.error('刪除失敗：profileID 無效');
      return;
    }

    this.alertService.question(`確定要刪除配置「${row?.name || pid}」嗎？此操作無法復原。`).subscribe(ok => {
      if (!ok) return;

      this.risService
      .deleteRisProfileOnApi(rid, pid)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alertService.success('刪除成功');
          this.refreshProfiles();
        },
        error: (err) => {
          this.errorMsg = `Failed to delete profile: ${err?.message || 'Unknown error'}`;
          console.error('[RisConfigManageModal] deleteRisProfileOnApi error:', err);
          this.alertService.error('刪除失敗，請稍後再試或確認後端狀態。');
        },
      });
    });
  }

  openConfigAdd(): void {
    if (!this.isCustom) return;
    console.log('[RisConfigManageModal] add clicked -> open config add modal');
    this.configAddOpen = true;
  }

  closeConfigAdd(): void {
    console.log('[RisConfigManageModal] close config add modal');
    this.configAddOpen = false;
  }

  openConfigEdit(row: RisProfileListRow): void {
    if (!this.isCustom) return;

    console.log('[RisConfigManageModal] edit clicked -> open config edit modal', row);

    this.configEditTarget = row;
    this.configEditOpen = true;

    console.log('[RisConfigManageModal] edit modal state', {
      configEditOpen: this.configEditOpen,
      configEditTarget: !!this.configEditTarget,
    });
  }

  closeConfigEdit(): void {
    console.log('[RisConfigManageModal] close config edit modal');

    this.configEditOpen = false;
    this.configEditTarget = null;
  }

  get existingProfileNames(): string[] {
    return (this.rows ?? []).map(x => (x?.name ?? '').trim()).filter(Boolean);
  }

  onConfigAddConfirm(payload: any): void {
    console.log('[RisConfigManageModal] config add confirm received (API)', payload);

    const rid = Number(this.risID);
    if (!Number.isFinite(rid) || rid <= 0) {
      this.alertService.error('新增失敗：risID 無效');
      return;
    }

    this.risService
      .addRisProfile(rid, payload)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alertService.success('新增成功');
          this.closeConfigAdd();
          this.refreshProfiles();
        },
        error: (err) => {
          this.errorMsg = `Failed to add profile: ${err?.message || 'Unknown error'}`;
          console.error('[RisConfigManageModal] addRisProfile error:', err);
          this.alertService.error('新增失敗，請檢查欄位或後端狀態。');
        },
      });
  }

  onConfigEditConfirm(payload: any): void {
    console.log('[RisConfigManageModal] config edit confirm received (API)', payload);

    const rid = Number(this.risID);
    if (!Number.isFinite(rid) || rid <= 0) {
      this.alertService.error('更新失敗：risID 無效');
      return;
    }

    this.risService
      .updateRisProfileOnApi(rid, payload)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alertService.success('更新成功');
          this.closeConfigEdit();
          this.refreshProfiles();
        },
        error: (err) => {
          this.errorMsg = `Failed to update profile: ${err?.message || 'Unknown error'}`;
          console.error('[RisConfigManageModal] updateRisProfileOnApi error:', err);
          this.alertService.error('更新失敗，請檢查欄位或後端狀態。');
        },
      });
  }
}
