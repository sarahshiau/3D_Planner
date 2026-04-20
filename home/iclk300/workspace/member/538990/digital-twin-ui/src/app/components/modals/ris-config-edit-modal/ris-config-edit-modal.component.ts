import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { Subject, take, firstValueFrom } from 'rxjs';
import { RisProfileRow, RisRawDataApi, UpdateRisProfilePayload } from '../../../models/ris.model';
import { RisService } from '../../../services/ris.service';
import { RisProfileXlsxService } from '../../../services/ris-profile-xlsx.service';
import { AlertService } from 'src/app/services/alert.service';

@Component({
  selector: 'app-ris-config-edit-modal',
  templateUrl: './ris-config-edit-modal.component.html',
  styleUrls: ['./ris-config-edit-modal.component.scss'],
})
export class RisConfigEditModalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() zIndexBase = 3030;
  @Input() visible = false;
  @Input() row: any;
  @Input() risID = 0; // RIS ID for rawData lookup
  @Input() existingProfileNames: string[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<UpdateRisProfilePayload>();

  isLoading = false;
  errorMsg: string | null = null;
  rawData: RisRawDataApi | null = null;
  rowElement = 0;
  columnElement = 0;
  patternRaw: number[][] = [];
  radiationRaw: number[][] = [];

  // Excel parsing state (for new upload)
  pendingRawData: RisRawDataApi | null = null;
  pendingFileName: string | null = null;
  isParsing = false;
  parseError: string | null = null;

  private sha256sum: string | null = null;
  private selectedFile: File | null = null;

  // Form draft for editing profile metadata
  draft = {
    profileName: '',
    incHorizontalMin: 0,
    incHorizontalMax: 0,
    incVerticalMin: 0,
    incVerticalMax: 0,
    refHorizontal: 0,
    refVertical: 0,
    refCoefficient: 0,
  };

  private destroy$ = new Subject<void>();

  constructor(
    private readonly risService: RisService,
    private readonly risProfileXlsx: RisProfileXlsxService,
    private readonly alertService: AlertService
  ) {
    console.log('[RisConfigEditModal] constructor');
  }

  /**
   * Parse range text like "60~60" or "60 ~ 60" into [min, max]
   */
  private parseRangeText(s: any): [number, number] {
    const txt = String(s ?? '').trim();
    // accept "60~60" or "60 ~ 60"
    const parts = txt.split('~').map(x => x.trim()).filter(Boolean);
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    return [
      Number.isFinite(a) ? a : 0,
      Number.isFinite(b) ? b : (Number.isFinite(a) ? a : 0),
    ];
  }

  /**
   * Fill draft from row data, handling both ListRow and full Row shapes
   */
  private fillDraftFromRow(row: any): void {
    if (!row) return;

    console.log('[RisConfigEditModal][fillDraftFromRow] row=', row);

    // Case A: list row (name/incAzRange/...)
    const listName = row.name ?? '';
    const listIncAz = row.incAzRange;
    const listIncEl = row.incElRange;

    // Case B: full row (profileName/incHorizontalMin/...)
    const fullName = row.profileName ?? '';

    const profileName = (fullName || listName || '').trim();

    // ranges
    let incHMin = Number(row.incHorizontalMin);
    let incHMax = Number(row.incHorizontalMax);
    if (!Number.isFinite(incHMin) || !Number.isFinite(incHMax)) {
      const [a, b] = this.parseRangeText(listIncAz);
      incHMin = a;
      incHMax = b;
    }

    let incVMin = Number(row.incVerticalMin);
    let incVMax = Number(row.incVerticalMax);
    if (!Number.isFinite(incVMin) || !Number.isFinite(incVMax)) {
      const [a, b] = this.parseRangeText(listIncEl);
      incVMin = a;
      incVMax = b;
    }

    // ref angles
    const refH = Number(row.refHorizontal ?? row.refAz);
    const refV = Number(row.refVertical ?? row.refEl);

    // coefficient
    const coef = Number(row.refCoefficient ?? row.reflGainDb);

    this.draft = {
      profileName,
      incHorizontalMin: Number.isFinite(incHMin) ? incHMin : 0,
      incHorizontalMax: Number.isFinite(incHMax) ? incHMax : 0,
      incVerticalMin: Number.isFinite(incVMin) ? incVMin : 0,
      incVerticalMax: Number.isFinite(incVMax) ? incVMax : 0,
      refHorizontal: Number.isFinite(refH) ? refH : 0,
      refVertical: Number.isFinite(refV) ? refV : 0,
      refCoefficient: Number.isFinite(coef) ? coef : 0,
    };

    console.log('[RisConfigEditModal][fillDraftFromRow] draft filled=', this.draft);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const visibleChanged = 'visible' in changes;
    const rowChanged = 'row' in changes;

    if ((visibleChanged || rowChanged) && this.visible && this.row) {
      this.errorMsg = null;

      // 1) 先把表單 draft 填好（一定要先顯示 modal）
      console.log('[RisConfigEditModal] activate', { risID: this.risID, row: this.row });
      this.fillDraftFromRow(this.row);

      // 2) 再延後載入 rawData，避免同一個 tick 內拋錯影響渲染
      setTimeout(() => {
        try {
          const rid = Number(this.risID);
          const pid = Number(this.row?.profileID ?? 0);

          if (!Number.isFinite(rid) || rid <= 0) {
            this.errorMsg = '讀取場型失敗：risID 無效';
            return;
          }
          if (!Number.isFinite(pid) || pid <= 0) {
            this.errorMsg = '讀取場型失敗：profileID 無效';
            return;
          }

          this.loadRawData();
        } catch (e: any) {
          this.errorMsg = `讀取場型失敗：${e?.message || 'Unknown error'}`;
          console.error('[RisConfigEditModal] loadRawData failed', e);
        }
      }, 0);
    }
  }

  ngOnInit(): void {
    console.log('[RisConfigEditModal] ngOnInit');
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load raw data (pattern + radiation) for this profile.
   */
  private loadRawData(): void {
    this.isLoading = true;
    this.errorMsg = null;

    console.log('[RisConfigEditModal] loadRawData api', { risID: this.risID, profileID: this.row.profileID });

    this.risService
      .getRisRawDataOnApi(this.risID, this.row.profileID)
      .pipe(take(1))
      .subscribe({
        next: (rawData) => {
          this.rawData = rawData;
          this.rowElement = rawData.rowElement;
          this.columnElement = rawData.columnElement;

          // Convert normalized patternRaw object to 2D array
          const pattern: number[][] = [];
          for (const key in rawData.patternRaw) {
            pattern.push(rawData.patternRaw[key] || []);
          }
          this.patternRaw = pattern;

          // radiationRaw is already in array format
          this.radiationRaw = rawData.radiationRaw;

          console.log(`[RisConfigEditModal] rawData loaded: rows=${this.rowElement}, cols=${this.columnElement}`);
        },
        error: (err) => {
          this.errorMsg = `Failed to load profile data: ${err.message || 'Unknown error'}`;
          console.error('[RisConfigEditModal] loadRawData error:', err);
        },
        complete: () => {
          this.isLoading = false;
        },
      });
  }

  onBackdropClick(): void {
    console.log('[RisConfigEditModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisConfigEditModal] close clicked');
    this.close.emit();
  }

  onCancel(): void {
    console.log('[RisConfigEditModal] cancel clicked');
    this.close.emit();
  }

  helpOpen = false;
  helpTitle = '';

  openHelp(title: string): void {
    this.helpTitle = title;
    this.helpOpen = true;
    console.log('[RisConfigEditModal] open help:', title);
  }

  closeHelp(): void {
    console.log('[RisConfigEditModal] close help');
    this.helpOpen = false;
    this.helpTitle = '';
  }

  /**
   * Calculate SHA-256 hash of a file as hex string.
   */
  private async sha256Hex(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Handle Excel file upload (optional - only if user wants to update raw data).
   */
  async onFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.pendingRawData = null;
      this.pendingFileName = null;
      this.parseError = null;
      this.selectedFile = null;
      this.sha256sum = null;
      input.value = '';
      console.log('[RisConfigEditModal] invalid file type. Only .xlsx/.xls allowed.');
      return;
    }

    this.selectedFile = file;

    // Parse Excel to rawData
    this.isParsing = true;
    this.parseError = null;
    try {
      this.pendingRawData = await this.risProfileXlsx.parse(file);
      this.pendingFileName = file.name;
      console.log('[RisConfigEditModal] Excel parsed successfully:', this.pendingRawData);

      // Calculate sha256
      this.sha256sum = await this.sha256Hex(file);
      console.log('[RisConfigEditModal] sha256=', this.sha256sum);
    } catch (e: any) {
      this.pendingRawData = null;
      this.pendingFileName = null;
      this.parseError = `Excel 解析失敗: ${e.message || 'Unknown error'}`;
      this.selectedFile = null;
      this.sha256sum = null;
      console.error('[RisConfigEditModal] Excel parse error:', e);
    } finally {
      this.isParsing = false;
    }
  }

  async onConfirm(): Promise<void> {
    // Validate name
    const nextName = (this.draft.profileName ?? '').trim();
    if (!nextName) {
      this.alertService.info('請輸入配置名稱');
      return;
    }

    // Check for duplicates (excluding self)
    // Support both profileName (full row) and name (list row) for self-reference
    const selfName = (this.row?.profileName ?? this.row?.name ?? '').trim();
    const duplicated = (this.existingProfileNames ?? [])
      .some(n => n.trim() === nextName && n.trim() !== selfName);
    if (duplicated) {
      this.alertService.error('更新失敗：配置名稱重複');
      return;
    }

    // Emit payload with optional file/sha256
    const payload = {
      profileID: this.row.profileID,
      profileName: nextName,
      incHorizontal: [this.draft.incHorizontalMin, this.draft.incHorizontalMax] as [number, number],
      incVertical: [this.draft.incVerticalMin, this.draft.incVerticalMax] as [number, number],
      refHorizontal: this.draft.refHorizontal,
      refVertical: this.draft.refVertical,
      refCoefficient: this.draft.refCoefficient,
      file: this.selectedFile,
      sha256sum: this.selectedFile ? (this.sha256sum ?? undefined) : undefined,
    };

    console.log('[RisConfigEditModal] confirm clicked - payload=', payload);
    this.confirm.emit(payload);
  }
}
