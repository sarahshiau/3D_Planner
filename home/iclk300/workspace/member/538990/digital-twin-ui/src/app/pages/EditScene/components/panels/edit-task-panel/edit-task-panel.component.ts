import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { OverallAreaPlanningDialogComponent } from 'src/app/components/modals/overall-area-planning-dialog/overall-area-planning-dialog.component';
import { OverallQualityTargetDialogComponent } from 'src/app/components/modals/overall-quality-target-dialog/overall-quality-target-dialog.component';
import { OverallStrengthTargetDialogComponent } from 'src/app/components/modals/overall-strength-target-dialog/overall-strength-target-dialog.component';
import { OverallThroughputTargetDialogComponent } from 'src/app/components/modals/overall-throughput-target-dialog/overall-throughput-target-dialog.component';
import { AlertService } from 'src/app/services/alert.service';

/** Task Panel 內部用的型別 */
type PlanningModeType = 'current' | 'whole' | 'ue' | 'area';
type GoalMode = 'planning' | 'simulation';
type ObjectiveTargetState = {
  enabled: boolean;
  ratio: number;
  threshold?: number;
  ulMbps?: number;
  dlMbps?: number;
};

type WholeObjectivesState = {
  coverage: ObjectiveTargetState;
  sinr: ObjectiveTargetState;
  rsrp: ObjectiveTargetState;
  throughput: ObjectiveTargetState;
};

type UeObjectivesState = {
  coverage: ObjectiveTargetState;
  sinr: ObjectiveTargetState;
  throughput: ObjectiveTargetState;
};

export interface PlanningModeCommittedEvent {
  fromPlanningMode: PlanningModeType;
  toPlanningMode: PlanningModeType;
  fromGoalMode: GoalMode;
  toGoalMode: GoalMode;
}

@Component({
  selector: 'app-edit-task-panel',
  templateUrl: './edit-task-panel.component.html',
  styleUrls: ['./edit-task-panel.component.scss'],
})
export class EditTaskPanelComponent implements OnInit, OnChanges {
  /* -------------------- 規劃目標（task panel） -------------------- */
  constructor(
    private dialog: MatDialog,
    private alertService: AlertService,
  ) {
    this.lastCommittedPlanningMode = this.selectedPlanningMode;
  }

  @Input() initialPlanningSnapshot: any | null = null;
  @Output() planningModeCommitted = new EventEmitter<PlanningModeCommittedEvent>();
  @Output() planningSnapshotChange = new EventEmitter<any>();

  planningModes: { id: PlanningModeType; label: string }[] = [
    { id: 'current', label: '進行現有場域訊號模擬' },
    { id: 'whole', label: '以整體場域為主進行規劃' },
    { id: 'ue', label: '以行動終端為主進行規劃' },
    { id: 'area', label: '以觀測區域為主進行規劃' },
  ];

  selectedPlanningMode: PlanningModeType = this.planningModes[0].id;
  private lastCommittedPlanningMode: PlanningModeType = 'current';
  activeConfigTab: 'planning' | 'radio' = 'planning';

  maxUePerTx: number = 75;

  wholeAreaSettings = {
    cov: { enabled: true },
    qos: { enabled: false },
    power: { enabled: false },
    throughput: { enabled: false },
    txCountMode: 'manual' as 'auto' | 'manual',
    txCountManual: 0,
    risCountMode: 'manual' as 'auto' | 'manual',
    risCountManual: 0,
  };

  wholeObjectives: WholeObjectivesState = {
    coverage: { enabled: true, ratio: 0.95 },
    sinr: { enabled: false, ratio: 0.95, threshold: 15 },
    rsrp: { enabled: false, ratio: 0.95, threshold: -90 },
    throughput: { enabled: false, ratio: 0.95, ulMbps: 250, dlMbps: 350 },
  };

  ueObjectives: UeObjectivesState = {
    coverage: { enabled: true, ratio: 0.95 },
    sinr: { enabled: false, ratio: 0.95, threshold: 15 },
    throughput: { enabled: false, ratio: 0.95, ulMbps: 250, dlMbps: 350 },
  };

  areaObjectives: WholeObjectivesState = {
    coverage: { enabled: true, ratio: 0.95 },
    sinr: { enabled: false, ratio: 0.95, threshold: 15 },
    rsrp: { enabled: false, ratio: 0.95, threshold: -90 },
    throughput: { enabled: false, ratio: 0.95, ulMbps: 250, dlMbps: 350 },
  };

  openFieldSections = {
    target: true,
  };

  toggleFieldSection(section: keyof typeof this.openFieldSections) {
    this.openFieldSections[section] = !this.openFieldSections[section];
  }

  get planningContextTitle(): string {
    switch (this.selectedPlanningMode) {
      case 'whole':
        return '以整體場域為主的詳細設定';
      case 'ue':
        return '以行動終端為主的詳細設定';
      case 'area':
        return '以觀測區域為主的詳細設定';
      default:
        return '';
    }
  }

  get currentObjectives(): WholeObjectivesState | UeObjectivesState {
    if (this.selectedPlanningMode === 'ue') {
      return this.ueObjectives;
    }

    if (this.selectedPlanningMode === 'area') {
      return this.areaObjectives;
    }

    return this.wholeObjectives;
  }

  getPlanningPayloadSnapshot() {
    return {
      selectedPlanningMode: this.selectedPlanningMode,
      maxUePerTx: this.maxUePerTx,
      txCountMode: this.wholeAreaSettings.txCountMode,
      txCountManual: this.wholeAreaSettings.txCountManual,
      risCountMode: this.wholeAreaSettings.risCountMode,
      risCountManual: this.wholeAreaSettings.risCountManual,
      wholeObjectives: JSON.parse(JSON.stringify(this.wholeObjectives)),
      ueObjectives: JSON.parse(JSON.stringify(this.ueObjectives)),
      areaObjectives: JSON.parse(JSON.stringify(this.areaObjectives)),
      duplexMode: this.tddConfig.duplexMode,
      tddConfig: JSON.parse(JSON.stringify(this.tddConfig)),
      fddConfig: JSON.parse(JSON.stringify(this.fddConfig)),
    };
  }

  private emitPlanningSnapshot(): void {
    const snapshot = this.getPlanningPayloadSnapshot();
    console.log('[TaskPanel][planningSnapshotChange]', snapshot);
    this.planningSnapshotChange.emit(snapshot);
  }

  private restoreFromSnapshot(snapshot: any | null | undefined): void {
    if (!snapshot || typeof snapshot !== 'object') return;

    const clone = JSON.parse(JSON.stringify(snapshot));

    if (clone.selectedPlanningMode) {
      this.selectedPlanningMode = clone.selectedPlanningMode;
      this.lastCommittedPlanningMode = clone.selectedPlanningMode;
    }

    if (clone.maxUePerTx != null) {
      this.maxUePerTx = Number(clone.maxUePerTx);
    }

    this.wholeAreaSettings = {
      ...this.wholeAreaSettings,
      txCountMode: clone.txCountMode ?? this.wholeAreaSettings.txCountMode,
      txCountManual: clone.txCountManual ?? this.wholeAreaSettings.txCountManual,
      risCountMode: clone.risCountMode ?? this.wholeAreaSettings.risCountMode,
      risCountManual: clone.risCountManual ?? this.wholeAreaSettings.risCountManual,
    };

    if (clone.wholeObjectives) {
      this.wholeObjectives = {
        ...this.wholeObjectives,
        ...clone.wholeObjectives,
      };
    }

    if (clone.ueObjectives) {
      this.ueObjectives = {
        ...this.ueObjectives,
        ...clone.ueObjectives,
      };
    }

    if (clone.areaObjectives) {
      this.areaObjectives = {
        ...this.areaObjectives,
        ...clone.areaObjectives,
      };
    }

    if (clone.tddConfig) {
      this.tddConfig = {
        ...this.tddConfig,
        ...clone.tddConfig,
      };
    }

    if (clone.fddConfig) {
      this.fddConfig = {
        ...this.fddConfig,
        ...clone.fddConfig,
      };
    }

    if (clone.duplexMode) {
      this.tddConfig.duplexMode = clone.duplexMode;
    }

    if (this.selectedPlanningMode !== 'current' && !this.activeConfigTab) {
      this.activeConfigTab = 'planning';
    }

    // restore 後，重新同步 SCS 對應的頻寬候選
    this.onDuplexModeChange(this.tddConfig.duplexMode);

    console.log('[TaskPanel][restoreFromSnapshot]', clone);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialPlanningSnapshot'] && this.initialPlanningSnapshot) {
      this.restoreFromSnapshot(this.initialPlanningSnapshot);
    }
  }

  private toGoalMode(mode: PlanningModeType): GoalMode {
    return mode === 'current' ? 'simulation' : 'planning';
  }

  onPlanningModeChange(mode: PlanningModeType) {
    const prev = this.lastCommittedPlanningMode;
    const fromGoalMode = this.toGoalMode(prev);
    const toGoalMode = this.toGoalMode(mode);

    if (fromGoalMode === 'planning' && toGoalMode === 'simulation') {
      this.alertService.question('這個目標設定的改變，會刪除掉場域上所有的可安裝無線基站及可安裝智慧反射面板位置!是否繼續執行?').subscribe(ok => {
        if (!ok) {
          this.selectedPlanningMode = prev;
          return;
        }
        this.selectedPlanningMode = mode;
        this.lastCommittedPlanningMode = mode;

        if (mode !== 'current') {
          this.activeConfigTab = 'planning';
        }

        console.log('[TaskPanel] 規劃目標模式切換為：', mode);
        this.planningModeCommitted.emit({
          fromPlanningMode: prev,
          toPlanningMode: mode,
          fromGoalMode,
          toGoalMode,
        });
        console.log('[TaskPanel][PlanningSnapshot]', this.getPlanningPayloadSnapshot());
        this.emitPlanningSnapshot();
      });
      return;
    }

    this.selectedPlanningMode = mode;
    this.lastCommittedPlanningMode = mode;

    if (mode !== 'current') {
      this.activeConfigTab = 'planning';
    }

    console.log('[TaskPanel] 規劃目標模式切換為：', mode);
    this.planningModeCommitted.emit({
      fromPlanningMode: prev,
      toPlanningMode: mode,
      fromGoalMode,
      toGoalMode,
    });
    console.log('[TaskPanel][PlanningSnapshot]', this.getPlanningPayloadSnapshot());
    this.emitPlanningSnapshot();
  }

  setTxCountMode(mode: 'auto' | 'manual') {
    this.wholeAreaSettings.txCountMode = mode;
    this.emitPlanningSnapshot();
  }

  setRisCountMode(mode: 'auto' | 'manual') {
    this.wholeAreaSettings.risCountMode = mode;
    this.emitPlanningSnapshot();
  }

  onPlanningFieldChanged(): void {
    this.emitPlanningSnapshot();
  }

  /* -------------------- 5G TDD 基地台參數設定 -------------------- */

  tddConfig = {
    duplexMode: 'TDD' as 'TDD' | 'FDD',
    bsTypeDistributed: true,
    antenna: 'ITRI_omni_FR1',
    ulDlRatio: 'D:U=7:3',
    txPowerMin: 10,
    txPowerMax: 24,
    txPowerUnit: 'dBm' as 'dBm' | 'mW',
    centerFreqMHz: 3600,
    spreadFactor: 1,
    scsKHz: 30,
    bandwidthMHz: 100,
    ulLayers: 1,
    dlLayers: 1,
    ulMcsTable: '64QAM-table',
    dlMcsTable: '256QAM-table',
    noiseFigure: 0,
    txGain: 0,
    avgPowerW: 0,
    bsCost: 0,
  };

  fddConfig = {
    duplexMode: 'FDD' as 'TDD' | 'FDD',

    // 上下行中心頻率
    ulCenterFreqMHz: 3500,
    dlCenterFreqMHz: 3700,

    // 上下行各自的 SCS / BW
    ulScsKHz: 30,
    dlScsKHz: 30,
    ulBandwidthMHz: 100,
    dlBandwidthMHz: 100,

    // 其餘共用欄位
    antenna: 'ITRI_omni_FR1',
    txPowerMin: 10,
    txPowerMax: 24,
    txPowerUnit: 'dBm' as 'dBm' | 'mW',
    spreadFactor: 1,
    ulLayers: 1,
    dlLayers: 1,
    ulMcsTable: '64QAM-table',
    dlMcsTable: '256QAM-table',
    noiseFigure: 0,
    txGain: 0,
    avgPowerW: 0,
    bsCost: 0,
  };

  antennaOptions = [
    { value: 'ITRI_omni_FR1', label: 'ITRI_omnidirectional_antenna_FR1' },
    { value: 'ITRI_omni_FR2', label: 'ITRI_omnidirectional_antenna_FR2' },
    { value: 'ITRI_panel', label: 'ITRI_panel_antenna' },
  ];

  scsKHzOptions =[15, 30, 60];

  private readonly bandwidthByScs: Record<number, number[]> = {
    15: [5, 10, 15, 20, 25, 30, 40, 50],
    30: [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
    60: [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
  };

  bandwidthMHzOptionsFiltered: number[] = [];
  ulBandwidthMHzOptionsFiltered: number[] = [];
  dlBandwidthMHzOptionsFiltered: number[] = [];

  // bandwidthMHzOptions = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];

  ulDlRatioOptions = [
    { value: 'D:U=7:3', label: 'DDDDDDSUUU(D:U=7:3)' },
    { value: 'D:U=6:4', label: 'DDDDSUUUU(D:U=6:4)' },
  ];

  layerOptions = [1, 2, 3, 4, 5, 6, 7, 8];

  mcsTableOptions = [
    { value: '64QAM-table', label: '64QAM-table' },
    { value: '256QAM-table', label: '256QAM-table' },
    { value: '64QAM-table', label: '64QAM-table-lowSE' },
  ];


  ngOnInit(): void {
    if (this.initialPlanningSnapshot) {
      this.restoreFromSnapshot(this.initialPlanningSnapshot);
    } else {
      // 依目前 duplexMode 初始化對應的頻寬候選
      this.onDuplexModeChange(this.tddConfig.duplexMode);
    }

    this.emitPlanningSnapshot();
  }

  // SCS 變更處理
  onScsChange(scs: number): void {
  // 1) 更新頻寬候選清單
  this.bandwidthMHzOptionsFiltered = this.bandwidthByScs[scs] ?? [];

  console.log('[TDD] scs changed =', scs);
  console.log('[TDD] bandwidth options =', this.bandwidthMHzOptionsFiltered);

  // 2) 防呆：若目前頻寬不在新清單內，改成第一個合法值
  const currBw = this.tddConfig.bandwidthMHz;
  const ok = this.bandwidthMHzOptionsFiltered.includes(currBw);

  if (!ok) {
    const fallback = this.bandwidthMHzOptionsFiltered[0] ?? null;
    console.log('[TDD] bandwidth invalid -> fallback', { currBw, fallback });
    this.tddConfig.bandwidthMHz = fallback as any;
  }
}

  onDuplexModeChange(mode: 'TDD' | 'FDD'): void {
    console.log('[Duplex] changed =', mode);

    if (mode === 'TDD') {
      // 初始化/刷新 TDD 的頻寬候選
      this.onScsChange(this.tddConfig.scsKHz);
    } else {
      // 初始化/刷新 FDD 上下行的頻寬候選
      this.onUlScsChange(this.fddConfig.ulScsKHz);
      this.onDlScsChange(this.fddConfig.dlScsKHz);
    }
  }

  onUlScsChange(scs: number): void {
    this.ulBandwidthMHzOptionsFiltered = this.bandwidthByScs[scs] ?? [];

    console.log('[FDD][UL] scs changed =', scs);
    console.log('[FDD][UL] bandwidth options =', this.ulBandwidthMHzOptionsFiltered);

    const currBw = this.fddConfig.ulBandwidthMHz;
    const ok = this.ulBandwidthMHzOptionsFiltered.includes(currBw);

    if (!ok) {
      const fallback = this.ulBandwidthMHzOptionsFiltered[0] ?? null;
      console.log('[FDD][UL] bandwidth invalid -> fallback', { currBw, fallback });
      this.fddConfig.ulBandwidthMHz = fallback as any;
    }
  }

  onDlScsChange(scs: number): void {
    this.dlBandwidthMHzOptionsFiltered = this.bandwidthByScs[scs] ?? [];

    console.log('[FDD][DL] scs changed =', scs);
    console.log('[FDD][DL] bandwidth options =', this.dlBandwidthMHzOptionsFiltered);

    const currBw = this.fddConfig.dlBandwidthMHz;
    const ok = this.dlBandwidthMHzOptionsFiltered.includes(currBw);

    if (!ok) {
      const fallback = this.dlBandwidthMHzOptionsFiltered[0] ?? null;
      console.log('[FDD][DL] bandwidth invalid -> fallback', { currBw, fallback });
      this.fddConfig.dlBandwidthMHz = fallback as any;
    }
  }

  openOverallAreaPlanningDialog(): void {
    console.log('[EditTaskPanel] openOverallAreaPlanningDialog clicked');

    const dialogRef = this.dialog.open(OverallAreaPlanningDialogComponent, {
      width: '760px',
      disableClose: true,
      panelClass: 'dt-mat-dialog-panel',
      data: {
        coveragePct: 95,
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      console.log('[EditTaskPanel] overall area planning dialog closed result =', result);
      // TODO：之後你要把 result 寫回規劃目標表單/狀態 store 再做
    });
  }

  openOverallQualityDialog(): void {
    console.log('[EditTaskPanel] openOverallQualityDialog clicked');
    const ref = this.dialog.open(OverallQualityTargetDialogComponent, {
      width: '760px',
      disableClose: true,
      panelClass: 'dt-mat-dialog-panel',
      data: { rows: [{ areaPct: 95, op: '>=', qualityDb: 15 }] },
    });
    ref.afterClosed().subscribe(result => {
      console.log('[EditTaskPanel] overall quality dialog closed result =', result);
    });
  }

  openOverallStrengthDialog(): void {
    console.log('[EditTaskPanel] openOverallStrengthDialog clicked');
    const ref = this.dialog.open(OverallStrengthTargetDialogComponent, {
      width: '760px',
      disableClose: true,
      panelClass: 'dt-mat-dialog-panel',
      data: { rows: [{ areaPct: 95, op: '>=', strengthDbm: -110 }] },
    });
    ref.afterClosed().subscribe(result => {
      console.log('[EditTaskPanel] overall strength dialog closed result =', result);
    });
  }

  openOverallThroughputDialog(): void {
    console.log('[EditTaskPanel] openOverallThroughputDialog clicked');
    const ref = this.dialog.open(OverallThroughputTargetDialogComponent, {
      width: '760px',
      disableClose: true,
      panelClass: 'dt-mat-dialog-panel',
      data: {
        rows: [
          { areaPct: 95, ulDl: 'UL', op: '>=', mbps: 250 },
          { areaPct: 95, ulDl: 'DL', op: '>=', mbps: 350 },
        ],
      },
    });
    ref.afterClosed().subscribe(result => {
      console.log('[EditTaskPanel] overall throughput dialog closed result =', result);
    });
  }


}

