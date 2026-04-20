import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { FieldDomainStoreService } from 'src/app/services/field-domain-store.service';
import { MaterialService } from 'src/app/services/material.service';
import { ExistingBsSettingsConfirmPayload } from 'src/app/components/modals/existing-bs-settings-modal/existing-bs-settings-modal.component';
import { IntelligentPanelSettingsConfirmPayload } from 'src/app/components/modals/intelligent-panel-settings-modal/intelligent-panel-settings-modal.component';
import { MaterialRow } from 'src/app/models/material.model';
import {
  FieldDomainState,
  ObstacleFieldRow,
  ExistingBsFieldRow,
  IntelligentPanelFieldRow,
  CandidateBsFieldRow,
  CandidateRisFieldRow,
  UeFieldRow,
  ZoneFieldRow,
  ObserveFieldRow,
} from 'src/app/models/field-domain.model';

/** 與 EditScene.fieldSettingsState 對齊；場域尺寸只讀，由父層 bbox / meta 寫入 */
export type EditFieldPanelFieldSettingsState = {
  projectName: string;
  length: number;
  width: number;
  height: number;
  networkType: '4G' | '5G';
  band: string;
  fieldMapSource: 'gis' | 'glb';
  rsrpThreshold: number;
  sinrThreshold: number;
  cutHeights: [string, string, string];
  heatmapGrid: string;
};

export type FieldCardSelectPayload = {
  kind:
    | 'obstacle'
    | 'existingBs'
    | 'candidateBs'
    | 'intelligentPanel'
    | 'candidateRis'
    | 'ue'
    | 'zone'
    | 'observe';
  rowId: string;
  sectionId: string;
};

@Component({
  selector: 'app-edit-field-panel',
  templateUrl: './edit-field-panel.component.html',
  styleUrls: ['./edit-field-panel.component.scss'],
})
export class EditFieldPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() fieldSettingsState!: EditFieldPanelFieldSettingsState;
  /** 由右鍵選單導向時帶入的 field row id（EditScene.selectedContextRowId） */
  @Input() selectedContextRowId: string | null = null;
  /** 右鍵要求開 RIS / UE 設定時由 EditScene 傳入（消費後應請父層清 null） */
  @Input() pendingSettingsOpenAction: 'ris' | 'ue' | null = null;

  /** 已成功依 pending 開啟對應 modal 後通知父層將 pendingSettingsOpenAction 清為 null */
  @Output() settingsActionConsumed = new EventEmitter<void>();
  @Output() zonePathLossClick = new EventEmitter<string>();
  @Output() fieldCardSelect = new EventEmitter<FieldCardSelectPayload>();
  @Output() sectionCollapsed = new EventEmitter<string>();

  emitFieldCardSelect(kind: FieldCardSelectPayload['kind'], rowId: string, sectionId: string): void {
    if (!rowId) return;
    this.fieldCardSelect.emit({ kind, rowId, sectionId });
  }

  stopCardClickPropagation(event: Event): void {
    event.stopPropagation();
  }

  /** 避免同一組 (action, rowId) 在輸入反覆變更時重複 auto-open；pending 清空時會重設 */
  lastAutoOpenedRowId: string | null = null;
  lastAutoOpenedAction: 'ris' | 'ue' | null = null;

  /* -------------------- 場域設定 Accordion 區塊 -------------------- */

  fieldSettingSections = [
    { id: 'basic', title: '場域基本資訊', count: 0, opened: false },
    { id: 'obstacle', title: '場域障礙物資訊', count: 0, opened: false },
    { id: 'existingBs', title: '場域內既有基地站與天線位置', count: 0, opened: false },
    { id: 'availableBs', title: '場域內可安裝無線基地台位置', count: 0, opened: false },
    { id: 'intelligentPanel', title: '場域內既有智慧反射面板位置', count: 0, opened: false },
    { id: 'availablePanel', title: '場域內可安裝智慧反射面板位置', count: 0, opened: false },
    { id: 'ueDistribution', title: '場域內行動終端分佈資訊', count: 0, opened: false },
    { id: 'zone', title: '場域內自訂分區位置', count: 0, opened: false },
    { id: 'observe', title: '場域內觀測區域位置', count: 0, opened: false },
    { id: 'pathloss', title: '場域內無線訊號衰減模型', count: 0, opened: false, mode: 'dialog' as 'accordion' | 'dialog' },
  ];

  toggleFieldSettingSection(section: any) {
    if (section.mode === 'dialog') {
      this.openPathlossDialog();
      return;
    }

    const willClose = section.opened === true;

    section.opened = !section.opened;

    if (willClose) {
      this.onSectionCollapsed(section.id);
    }
  }

  onSectionCollapsed(sectionId: string): void {
    this.sectionCollapsed.emit(sectionId);
  }

  format2(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }

  showSectionCount(section: { id?: string }): boolean {
    const id = section?.id ?? '';
    return id !== 'basic' && id !== 'pathloss';
  }

  get basicFieldSizeText(): string {
    return `長 ${this.format2(this.fieldSettingsState.length)} × 寬 ${this.format2(this.fieldSettingsState.width)} × 高 ${this.format2(this.fieldSettingsState.height)}`;
  }

  networkTypeOptions = [
    { value: '4G', label: '4G' },
    { value: '5G', label: '5G' },
  ];

  bandOptions = [
    { value: 'n78', label: 'n78' },
    { value: 'n79', label: 'n79' },
  ];

  heatmapGridOptions = [
    { value: '1x1', label: '1 x 1 (公尺)' },
    { value: '2x2', label: '2 x 2 (公尺)' },
    { value: '4x4', label: '4 x 4 (公尺)' },
  ];

  /* -------------------- 障礙物資訊 -------------------- */

  /** 材質下拉：value = obstacle row 的 material（後端 name key），label = 顯示名；不暴露 materialId */
  obstacleMaterialOptions: Array<{ value: string; label: string }> = [];

  private obstacleMaterialOptionsReady = false;

  /* -------------------- 其它列表（基地台 / RIS / UE / 分區 / 觀測） -------------------- */

  obstacles: ObstacleFieldRow[] = [];
  existingBsList: ExistingBsFieldRow[] = [];
  availableBsList: CandidateBsFieldRow[] = [];
  intelligentPanelList: IntelligentPanelFieldRow[] = [];
  availablePanelList: CandidateRisFieldRow[] = [];
  ueDistributionList: UeFieldRow[] = [];
  zoneList: ZoneFieldRow[] = [];
  observeList: ObserveFieldRow[] = [];

  private stateSub?: Subscription;

  constructor(
    private readonly fieldDomainStore: FieldDomainStoreService,
    private readonly materialService: MaterialService,
  ) {}

  ngOnInit(): void {
    // Load obstacle material options from existing material service
    this.materialService.getMaterials().pipe(take(1)).subscribe({
      next: (rows: MaterialRow[]) => {
        this.obstacleMaterialOptions = (rows ?? []).map((row) => ({
          value: row.name,
          label: (row.chineseName || row.name).trim(),
        }));

        if (this.obstacleMaterialOptions.length === 0) {
          this.obstacleMaterialOptions = [
            { value: 'Wall', label: '牆壁' },
            { value: 'Wood', label: '木頭' },
          ];
          console.warn('[EditFieldPanel][ObstacleMaterial] empty options, using fallback');
        }

        this.obstacleMaterialOptionsReady = true;
        this.syncObstacleMaterialDefaultsFromStore();
      },
      error: (error) => {
        console.error('[EditFieldPanel][ObstacleMaterial] failed to load', error);
        this.obstacleMaterialOptions = [
          { value: 'Wall', label: '牆壁' },
          { value: 'Wood', label: '木頭' },
        ];
        this.obstacleMaterialOptionsReady = true;
        this.syncObstacleMaterialDefaultsFromStore();
      },
    });

    // Subscribe to store state
    this.stateSub = this.fieldDomainStore.state$.subscribe((state: FieldDomainState) => {
      this.obstacles = [...state.obstacles].sort((a, b) => a.seq - b.seq);
      this.existingBsList = [...state.existingBs].sort((a, b) => a.seq - b.seq);
      this.availableBsList = [...state.candidateBs].sort((a, b) => a.seq - b.seq);
      this.intelligentPanelList = [...state.intelligentPanels].sort((a, b) => a.seq - b.seq);
      this.availablePanelList = [...state.candidateRis].sort((a, b) => a.seq - b.seq);
      this.ueDistributionList = [...state.ueList].sort((a, b) => a.seq - b.seq);
      this.zoneList = [...state.zones].sort((a, b) => a.seq - b.seq);
      this.observeList = [...state.observes].sort((a, b) => a.seq - b.seq);

      this.syncFieldSettingCounts(state);
      this.syncObstacleMaterialDefaultsFromStore();
      // Inputs 可能早於列表載入；列表更新後再嘗試一次（dedup 避免重複開 modal）
      this.tryConsumePendingSettingsOpen();
    });
  }

  /**
   * 材質清單載入後或 obstacle 列表變更時：若 row.material 空白或不在選項內，改為第一筆（與 UI 預設一致）。
   * 只寫入 ObstacleFieldRow.material，與 applyObstacleRowToScene / payload 使用的欄位對齊。
   */
  private syncObstacleMaterialDefaultsFromStore(): void {
    if (!this.obstacleMaterialOptionsReady || this.obstacleMaterialOptions.length === 0) {
      return;
    }

    const valid = new Set(this.obstacleMaterialOptions.map((o) => o.value));
    const defaultMaterial = this.obstacleMaterialOptions[0].value;
    const rows = this.fieldDomainStore.snapshot.obstacles;

    for (const obs of rows) {
      const m = obs.material;
      if (m != null && m !== '' && valid.has(m)) {
        continue;
      }

      this.fieldDomainStore.updateObstacle(obs.id, { material: defaultMaterial });
      console.log('[FieldSettings][ObstacleForm] applied', {
        rowId: obs.id,
        startHeight: obs.startHeight,
        height: obs.height,
        material: defaultMaterial,
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['pendingSettingsOpenAction'] ||
      changes['selectedContextRowId']
    ) {
      this.tryConsumePendingSettingsOpen();
    }
  }

  /**
   * 父層右鍵帶入 pendingSettingsOpenAction + selectedContextRowId 時自動開啟對應 modal。
   * 與 lastAutoOpened* 搭配，避免同一組 (action, rowId) 重複開啟；pending 為 null 時重設。
   */
  private tryConsumePendingSettingsOpen(): void {
    const pending = this.pendingSettingsOpenAction;
    const rowId = this.selectedContextRowId;

    if (pending === null) {
      this.lastAutoOpenedAction = null;
      this.lastAutoOpenedRowId = null;
      return;
    }

    if (!rowId) {
      return;
    }

    if (
      pending === this.lastAutoOpenedAction &&
      rowId === this.lastAutoOpenedRowId
    ) {
      return;
    }

    if (pending === 'ris') {
      const row = this.intelligentPanelList.find((r) => r.id === rowId);
      if (row) {
        this.onOpenIntelligentPanelSettings(row);
        this.lastAutoOpenedAction = 'ris';
        this.lastAutoOpenedRowId = rowId;
        this.settingsActionConsumed.emit();
      }
      return;
    }

    if (pending === 'ue') {
      const row = this.ueDistributionList.find((r) => r.id === rowId);
      if (row) {
        this.onOpenUeSettings(row);
        this.lastAutoOpenedAction = 'ue';
        this.lastAutoOpenedRowId = rowId;
        this.settingsActionConsumed.emit();
      }
    }
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
  }

  private syncFieldSettingCounts(state: FieldDomainState): void {
    const counts = this.fieldDomainStore.getCounts();

    for (const section of this.fieldSettingSections) {
      switch (section.id) {
        case 'obstacle':
          section.count = counts.obstacle;
          break;
        case 'existingBs':
          section.count = counts.existingBs;
          break;
        case 'availableBs':
          section.count = counts.candidateBs;
          break;
        case 'intelligentPanel':
          section.count = counts.intelligentPanel;
          break;
        case 'availablePanel':
          section.count = counts.candidateRis;
          break;
        case 'ueDistribution':
          section.count = counts.ue;
          break;
        case 'zone':
          section.count = counts.zone;
          break;
        case 'observe':
          section.count = counts.observe;
          break;
        default:
          break;
      }
    }
  }

  /* -------------------- Row Action Wrapper Methods -------------------- */

  // Obstacle
  onClearObstacle(item: ObstacleFieldRow): void {
    this.fieldDomainStore.removeObstacle(item.id);
  }

  /** 場域障礙物表單套用（與 ObstacleFieldRow / scene sync 一致） */
  private logObstacleFormApplied(row: ObstacleFieldRow): void {
    console.log('[FieldSettings][ObstacleForm] applied', {
      rowId: row.id,
      startHeight: row.startHeight,
      height: row.height,
      material: row.material,
    });
  }

  onObstacleFieldChange(
    row: ObstacleFieldRow,
    key: keyof Pick<ObstacleFieldRow, 'x' | 'y' | 'startHeight' | 'height' | 'length' | 'width' | 'angle'>,
    value: number
  ): void {
    const nextNum = Number(value);
    this.fieldDomainStore.updateObstacle(row.id, {
      [key]: nextNum,
    } as Partial<ObstacleFieldRow>);

    this.logObstacleFormApplied({ ...row, [key]: nextNum } as ObstacleFieldRow);
  }

  /** 僅寫入 row.material（API name key）；不透過此表單寫入 materialId */
  onObstacleMaterialChange(row: ObstacleFieldRow, materialKey: string): void {
    const nextMaterial = (materialKey ?? '').trim();
    this.fieldDomainStore.updateObstacle(row.id, {
      material: nextMaterial,
    } as Partial<ObstacleFieldRow>);

    this.logObstacleFormApplied({ ...row, material: nextMaterial } as ObstacleFieldRow);
  }

  // Existing BS
  onClearExistingBs(item: ExistingBsFieldRow): void {
    this.fieldDomainStore.removeExistingBs(item.id);
  }

  // [Step3][ExistingBsSettingsConfirm] Modal-based settings
  existingBsSettingsOpen = false;
  existingBsSettingsTarget: ExistingBsFieldRow | null = null;

  antennaSettingsOpen = false;
  antennaSettingsTarget: ExistingBsFieldRow | null = null;

  intelligentPanelSettingsOpen = false;
  intelligentPanelSettingsTarget: IntelligentPanelFieldRow | null = null;

  ueSettingsOpen = false;
  ueSettingsTarget: UeFieldRow | null = null;

  onOpenExistingBsSettings(item: ExistingBsFieldRow): void {
    this.existingBsSettingsTarget = item;
    this.existingBsSettingsOpen = true;
  }

  closeExistingBsSettings(): void {
    this.existingBsSettingsOpen = false;
    this.existingBsSettingsTarget = null;
  }

  closeIntelligentPanelSettings(): void {
    this.intelligentPanelSettingsOpen = false;
    this.intelligentPanelSettingsTarget = null;
  }

  closeUeSettings(): void {
    this.ueSettingsOpen = false;
    this.ueSettingsTarget = null;
  }

  onConfirmExistingBsSettings(payload: ExistingBsSettingsConfirmPayload): void {
    console.log('[Step3][ExistingBsSettingsConfirm] confirm', payload);

    this.fieldDomainStore.updateExistingBs(payload.rowId, {
      txPower: payload.txPower,
      txPowerUnit: payload.txPowerUnit,

      centerFrequency: payload.centerFrequency,
      subcarrierSpacing: payload.subcarrierSpacing,
      bandwidth: payload.bandwidth,

      ulLayers: payload.ulLayers,
      dlLayers: payload.dlLayers,

      ulModulation: payload.ulModulation,
      dlModulation: payload.dlModulation,

      noiseFigure: payload.noiseFigure,

      antennaMode: payload.antennaMode,

      antennaId: payload.antennaId,
      antennaName: payload.antennaName,
      antennaTypeLabel: payload.antennaTypeLabel,
      manufacturer: payload.manufacturer,
    } as Partial<ExistingBsFieldRow>);

    const updatedRow = this.existingBsList.find(
      (item) => item.id === payload.rowId
    );
    console.log('[ExistingBsSettings][afterUpdate]', updatedRow);

    this.closeExistingBsSettings();
  }

  onOpenAntennaSettings(item: ExistingBsFieldRow): void {
    this.antennaSettingsTarget = item;
    this.antennaSettingsOpen = true;
  }

  closeAntennaSettings(): void {
    this.antennaSettingsOpen = false;
    this.antennaSettingsTarget = null;
  }

  onConfirmAntennaSettings(payload: any): void {
    console.log('[AntennaSettings][confirm]', payload);
    this.closeAntennaSettings();
  }

  onConfirmIntelligentPanelSettings(payload: IntelligentPanelSettingsConfirmPayload): void {
    console.log('[RIS][REAL_CONFIRM_ENTRY]', {
      source: 'edit-field-panel -> app-intelligent-panel-settings-modal(confirm)',
      payload,
    });

    const beforeRow = this.fieldDomainStore.snapshot.intelligentPanels.find((item) => item.id === payload.rowId) ?? null;
    console.log('[RIS][ANGLE_STORE_BEFORE_PATCH]', {
      rowId: payload.rowId,
      insHorizontal: (beforeRow as any)?.insHorizontal ?? (beforeRow as any)?.installHorizontalAngle ?? null,
      insVertical: (beforeRow as any)?.insVertical ?? (beforeRow as any)?.installVerticalAngle ?? null,
    });
    console.log('[RIS][STORE_BEFORE_PATCH]', {
      rowId: payload.rowId,
      row: beforeRow
        ? {
            id: beforeRow.id,
            risID: (beforeRow as any).risID ?? (beforeRow as any).risId ?? null,
            profileID: (beforeRow as any).profileID ?? (beforeRow as any).profileId ?? null,
            insHorizontal: (beforeRow as any).insHorizontal ?? (beforeRow as any).installHorizontalAngle ?? null,
            insVertical: (beforeRow as any).insVertical ?? (beforeRow as any).installVerticalAngle ?? null,
            position: (beforeRow as any).position ?? { x: (beforeRow as any).x, y: (beforeRow as any).y, z: (beforeRow as any).z },
          }
        : null,
    });

    const risID = payload?.risId == null ? null : Number(payload.risId);
    const profileID = payload?.profileId == null ? null : Number(payload.profileId);
    const insHorizontal = Number(payload?.installHorizontalAngle ?? 0);
    const insVertical = Number(payload?.installVerticalAngle ?? 0);
    console.log('[RIS][ANGLE_PATCH_INPUT]', {
      rowId: payload.rowId,
      payloadHorizontal: payload?.installHorizontalAngle,
      payloadVertical: payload?.installVerticalAngle,
      patchHorizontal: insHorizontal,
      patchVertical: insVertical,
    });

    this.fieldDomainStore.updateIntelligentPanel(payload.rowId, {
      risID,
      risId: risID,
      profileID,
      profileId: profileID,
      insHorizontal,
      installHorizontalAngle: insHorizontal,
      insVertical,
      installVerticalAngle: insVertical,
    } as Partial<IntelligentPanelFieldRow>);

    const afterRow = this.fieldDomainStore.snapshot.intelligentPanels.find((item) => item.id === payload.rowId) ?? null;
    console.log('[RIS][ANGLE_STORE_AFTER_PATCH]', {
      rowId: payload.rowId,
      insHorizontal: (afterRow as any)?.insHorizontal ?? (afterRow as any)?.installHorizontalAngle ?? null,
      insVertical: (afterRow as any)?.insVertical ?? (afterRow as any)?.installVerticalAngle ?? null,
    });
    console.log('[RIS][STORE_AFTER_PATCH]', {
      rowId: payload.rowId,
      row: afterRow
        ? {
            id: afterRow.id,
            risID: (afterRow as any).risID ?? (afterRow as any).risId ?? null,
            profileID: (afterRow as any).profileID ?? (afterRow as any).profileId ?? null,
            insHorizontal: (afterRow as any).insHorizontal ?? (afterRow as any).installHorizontalAngle ?? null,
            insVertical: (afterRow as any).insVertical ?? (afterRow as any).installVerticalAngle ?? null,
            position: (afterRow as any).position ?? { x: (afterRow as any).x, y: (afterRow as any).y, z: (afterRow as any).z },
          }
        : null,
    });

    this.closeIntelligentPanelSettings();
  }

  onConfirmUeSettings(payload: { rowId: string; rxGain: number | null }): void {
    console.log('[UE_SETTINGS][confirm]', payload);

    if (payload.rxGain !== null) {
      this.fieldDomainStore.updateUe(payload.rowId, {
        rxGain: payload.rxGain,
      } as Partial<UeFieldRow>);
    }

    this.closeUeSettings();
  }

  onExistingBsFieldChange(
    row: ExistingBsFieldRow,
    key: 'x' | 'y' | 'z',
    value: number
  ): void {
    this.fieldDomainStore.updateExistingBs(row.id, {
      [key]: Number(value)
    } as Partial<ExistingBsFieldRow>);
  }

  // Available BS
  onClearAvailableBs(item: CandidateBsFieldRow): void {
    this.fieldDomainStore.removeCandidateBs(item.id);
  }

  onCandidateBsFieldChange(
    row: CandidateBsFieldRow,
    key: 'x' | 'y' | 'z',
    value: number
  ): void {
    this.fieldDomainStore.updateCandidateBs(row.id, {
      [key]: Number(value)
    } as Partial<CandidateBsFieldRow>);
  }

  // Intelligent Panel
  onClearIntelligentPanel(item: IntelligentPanelFieldRow): void {
    this.fieldDomainStore.removeIntelligentPanel(item.id);
  }

  onOpenIntelligentPanelSettings(item: IntelligentPanelFieldRow): void {
    console.log('[RIS][REAL_SETTINGS_ENTRY]', {
      source: 'edit-field-panel list button -> onOpenIntelligentPanelSettings',
      row: {
        id: item.id,
        risID: (item as any).risID ?? (item as any).risId ?? null,
        profileID: (item as any).profileID ?? (item as any).profileId ?? null,
        insHorizontal: (item as any).insHorizontal ?? (item as any).installHorizontalAngle ?? null,
        insVertical: (item as any).insVertical ?? (item as any).installVerticalAngle ?? null,
        position: (item as any).position ?? { x: (item as any).x, y: (item as any).y, z: (item as any).z },
      },
    });
    this.intelligentPanelSettingsTarget = item;
    this.intelligentPanelSettingsOpen = true;
  }

  onRisFieldChange(
    row: IntelligentPanelFieldRow,
    key: 'x' | 'y' | 'z',
    value: number
  ): void {
    this.fieldDomainStore.updateIntelligentPanel(row.id, {
      [key]: Number(value)
    } as Partial<IntelligentPanelFieldRow>);
  }

  // Available Panel
  onClearAvailablePanel(item: CandidateRisFieldRow): void {
    this.fieldDomainStore.removeCandidateRis(item.id);
  }

  onCandidateRisFieldChange(
    row: CandidateRisFieldRow,
    key: 'x' | 'y' | 'z',
    value: number
  ): void {
    this.fieldDomainStore.updateCandidateRis(row.id, {
      [key]: Number(value)
    } as Partial<CandidateRisFieldRow>);
  }

  // UE Distribution
  onClearUe(item: UeFieldRow): void {
    this.fieldDomainStore.removeUe(item.id);
  }

  onOpenUeSettings(item: UeFieldRow): void {
    this.ueSettingsTarget = item;
    this.ueSettingsOpen = true;
  }

  onUeFieldChange(
    row: UeFieldRow,
    key: 'x' | 'y' | 'z',
    value: number
  ): void {
    this.fieldDomainStore.updateUe(row.id, {
      [key]: Number(value)
    } as Partial<UeFieldRow>);
  }

  // Zone
  onClearZone(item: ZoneFieldRow): void {
    this.fieldDomainStore.removeZone(item.id);
  }

  onZoneFieldChange(
    row: ZoneFieldRow,
    key: keyof Pick<ZoneFieldRow, 'x' | 'y' | 'length' | 'width' | 'angle'>,
    value: number
  ): void {
    this.fieldDomainStore.updateZone(row.id, {
      [key]: Number(value),
    } as Partial<ZoneFieldRow>);
  }

  openZonePathLossDialog(rowId: string): void {
    this.zonePathLossClick.emit(rowId);
  }

  // Observe
  onClearObserve(item: ObserveFieldRow): void {
    this.fieldDomainStore.removeObserve(item.id);
  }

  onObserveFieldChange(
    row: ObserveFieldRow,
    key: keyof Pick<ObserveFieldRow, 'x' | 'y'>,
    value: number
  ): void {
    this.fieldDomainStore.updateObserve(row.id, {
      [key]: Number(value),
    } as Partial<ObserveFieldRow>);
  }

  /* -------------------- Pathloss Modal -------------------- */

  pathlossDialogOpen = false;

  pathlossPresets = [
    {
      id: '78-304_5G_n79',
      name: '78-304_5G_n79_衰減',
      formula: 'L_total = 20 log10 f + 25.323 log10 d + (5.149) - 28',
    },
  ];

  selectedPathlossId: string = this.pathlossPresets[0].id;

  get selectedPathlossPreset() {
    return this.pathlossPresets.find(p => p.id === this.selectedPathlossId) || null;
  }

  openPathlossDialog() {
    this.pathlossDialogOpen = true;
  }

  closePathlossDialog() {
    this.pathlossDialogOpen = false;
  }

  savePathlossModel() {
    console.log('[Pathloss] 已選擇衰減模型：', this.selectedPathlossPreset);
    this.closePathlossDialog();
  }
}
