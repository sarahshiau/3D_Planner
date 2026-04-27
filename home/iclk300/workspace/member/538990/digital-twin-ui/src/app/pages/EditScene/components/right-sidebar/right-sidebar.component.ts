// src/app/components/right-sidebar/right-sidebar.component.ts
import { AfterViewInit, Component, EventEmitter, Input, Output, computed, effect, inject, signal, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RightPanelType } from '../../EditScene.component';
import { HttpClient } from '@angular/common/http';

// Import ResultDataService and related types
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { ResultDataService, ResultApiResponse, BsDetail } from 'src/app/services/result-data.service';
import { FieldDomainStoreService } from 'src/app/services/field-domain-store.service';
import { RisService } from 'src/app/services/ris.service';
import type { RisApi } from 'src/app/models/ris.model';
import { ResultPanelVm } from '../../../../models/result-panel.model';
import { buildResultPanelVm } from '../../../../builders/result-panel.builder';
import { DEFAULT_EVALUATION_FUNC } from 'src/app/mocks/task-payload.mock';
import { SubfieldRow } from 'src/app/models/field-domain.model';
import type { ObservationAreaCountsVm, SubfieldAnalysisVm } from 'src/app/models/subfield-analysis.vm';
import { buildSubfieldAnalysisVms } from 'src/app/builders/subfield-analysis.builder';
import {
  buildObservationAreaCounts,
  finalizeSubfieldAnalysisVm,
  formatObservationAreaCountsLine,
  observationBadgeModifierClass,
  observationCardModifierClass,
  observationCardStatusLabel,
  observationPerCardEmptyHint,
  resolveObservationAreaSectionHint,
} from 'src/app/helpers/observation-area-status.helper';

declare const Plotly: any;

// ===== [A-FINAL][STEP1][TYPES] =====
type BsRowType = 'default' | 'candidate';

interface BsRowVM {
  type: BsRowType;          // default/candidate
  typeLabel: string;        // 既有/候選
  id: number;
  txPower: number;          // dBm
  coord: { x: number; y: number; z: number } | null;
  angle: { theta: number; phi: number } | null;
}

type ResultNavId = 'result' | 'analysis' | 'object' | 'setting';
type AnalysisTabId = 'field' | 'bs' | 'ue' | 'stats' | 'observe';

type AnalysisInfoItem = {
  label: string;
  value: string;
};

type AnalysisCardVm = {
  title: string;
  accent: boolean;
  items: AnalysisInfoItem[];
};

/** Phase 4-3: observation-area detail cards (status badge + metrics). */
type SubfieldObservationCardVm = {
  title: string;
  status: SubfieldAnalysisVm['status'];
  statusLabel: string;
  cardClass: string;
  badgeClass: string;
  /** Phase 4-4: subtle line when card has no metrics (not an error). */
  emptyHint: string | null;
  items: AnalysisInfoItem[];
};

/** 基站分析 tab：場域總和 + 各基地台卡片（舊系表格血統） */
type BsAnalysisCardVm = {
  title: string;
  accent: boolean;
  items: { label: string; value: string }[];
};

type BsTptRowVm = {
  siteLabel: string;
  bsName?: string | null;
  name?: string | null;
  ueCount: number;
  totalDl: string;
  totalUl: string;
  avgDl: string;
  avgUl: string;
};

type ObjectInfoItemVm = {
  label: string;
  value: string;
};

type BsObjectSummaryVm = {
  title: string;
  items: ObjectInfoItemVm[];
};

type BsObjectRowVm = {
  id: number;
  rowId?: string | null;
  title: string;
  type: 'default' | 'candidate';
  items: ObjectInfoItemVm[];
};

type RisObjectSummaryVm = {
  title: string;
  items: ObjectInfoItemVm[];
};

type RisObjectRowVm = {
  id: number;
  rowId?: string | null;
  title: string;
  type: 'default' | 'candidate';
  items: ObjectInfoItemVm[];
};

type TerminalObjectSummaryVm = {
  title: string;
  items: ObjectInfoItemVm[];
};

type TerminalObjectRowVm = {
  id: number;
  title: string;
  type: 'default' | 'candidate';
  items: ObjectInfoItemVm[];
};

type ObjectPanelCardItemVm = {
  label: string;
  value: string;
};

type ObjectCardSelectPayload = {
  objectKind: 'bs' | 'ris';
  sourceType: 'default' | 'candidate';
  displayTitle: string;
  backendId: number | null;
  rowId?: string | null;
  rowIndex?: number | null;
};

type ObjectPanelCardVm = {
  title: string;
  items: ObjectPanelCardItemVm[];
  withAccent: boolean;
  selectPayload?: ObjectCardSelectPayload | null;
  cardKey?: string | null;
};

type ObjectPanelSummaryVm = {
  title: string;
  items: ObjectPanelCardItemVm[];
};

type BsTptRow = [string, number, number, number, string, string];
type BsTptAvgRow = [string, number, number, number, string, string];

type StatsProtocol = '5G' | 'Wi-Fi';

interface LegacyStatsSource {
  zValue: string;
  ueCoordinate: string | any[];
  layeredModulationCount: number[][];
  layeredSignalLevelCount: number[][];
  ueModulationCount: number[];
  ueSignalLevelCount: number[];
  showProtocol: StatsProtocol;
}

interface StatsChartTextConfig {
  barTitle: string;
  cdfTitle: string;
  xAxisTitle: string;
  barYAxisTitle: string;
  cdfYAxisTitle: string;
}

type SettingInfoItemVm = {
  label: string;
  value: string;
};

type SettingSummaryVm = {
  title: string;
  items: SettingInfoItemVm[];
};

type SettingPathLossVm = {
  title: string;
  modelId: number | null;
  modelName: string;
  formulaText: string;
};

type SettingCostVm = {
  title: string;
  items: SettingInfoItemVm[];
};

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [CommonModule, MatExpansionModule],
  templateUrl: './right-sidebar.component.html',
  styleUrls: ['./right-sidebar.component.scss'],
})

export class RightSidebarComponent implements AfterViewInit, OnInit, OnChanges {
  @Input() showCustomZoneAnalysisTab = false;
  @Input() showObserveAnalysisTab = false;
  /** Phase 4-1: store subfields — single source for observation-area cards. */
  @Input() analysisSubfields: SubfieldRow[] = [];
  @Input() executionMode: 'planning' | 'simulation' | null = null;
  @Output() panelChange = new EventEmitter<RightPanelType>();
  // ===== [RESULT:A-FEATURE] save/export triggers =====
  @Output() saveProject = new EventEmitter<void>();
  @Output() exportProject = new EventEmitter<void>();
  @Output() openAnalysis = new EventEmitter<string>();
  @Output() objectCardSelect = new EventEmitter<ObjectCardSelectPayload>();

  active: RightPanelType = null;
  // ===== [RESULT:A-FEATURE] local success modal (no MatDialog) =====
  showSaveSuccess = false;
  showExportSuccess = false;

  buttons = [
    { id: 'file' as RightPanelType,  icon: 'assets/icons/file.svg',     title: '檔案' },
    { id: 'task' as RightPanelType,  icon: 'assets/icons/target.svg',   title: '規劃目標' },
    { id: 'field' as RightPanelType, icon: 'assets/icons/building.svg', title: '場域設定' },
  ];

  activeResult = signal<ResultNavId | null>(null);
  private readonly executionModeSignal = signal<'planning' | 'simulation' | null>(null);
  readonly isSimulationMode = computed(() => this.executionModeSignal() === 'simulation');
  readonly isSimulationModeEffective = computed(() => {
    const fromExecutionMode = this.executionModeSignal() === 'simulation';
    const fromResultInput = (this.resultService?.result?.() as any)?.input?.isSimulation === true;
    return fromExecutionMode || fromResultInput;
  });
  private readonly analysisSubfieldsSignal = signal<SubfieldRow[]>([]);
  activeAnalysisItem = signal<AnalysisTabId>('field');
  statsMetric = signal<'modulation' | 'sinr'>('modulation');

  private readonly statsDebugMockResult = {
    layeredModulationCount: [
      [120, 80, 30, 10],
      [100, 90, 50, 20],
      [60, 70, 80, 40],
    ],
    layeredSignalLevelCount: [
      [20, 40, 80, 120, 90, 50],
      [15, 35, 70, 130, 100, 60],
      [10, 25, 55, 110, 120, 80],
    ],
    ueCoordinate: [10, 20, 1.5],
  };

  bsAnalysisRows = [
    {
      siteLabel: '既有基地2',
      ueCount: 11,
      totalDl: '38.48 Mbps',
      totalUl: '11.94 Mbps',
      avgDl: '3.50 Mbps',
      avgUl: '1.09 Mbps',
    },
    {
      siteLabel: '既有基地1',
      ueCount: 63,
      totalDl: '38.67 Mbps',
      totalUl: '12.15 Mbps',
      avgDl: '0.61 Mbps',
      avgUl: '0.19 Mbps',
    },
  ];

  bsAnalysisSummary = {
    siteLabel: '場域總和',
    ueCount: 74,
    totalDl: '77.15 Mbps',
    totalUl: '24.09 Mbps',
    avgDl: '-',
    avgUl: '-',
  };

  get sortedBsAnalysisRows() {
    return this.sortBsTptRows(this.bsTptList());
  }

  ueAnalysisSummary = {
    coverage: '100%',
    signalQuality: '29.14 dB',
    signalStrength: '-78.94 dBm',
  };

  observeAnalysisRows = [
    {
      title: '地圖切面高度 1.05 公尺｜觀測區域 1',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
    {
      title: '地圖切面高度 1.05 公尺｜觀測區域 2',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
    {
      title: '地圖切面高度 1.25 公尺｜觀測區域 1',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
    {
      title: '地圖切面高度 1.25 公尺｜觀測區域 2',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
    {
      title: '地圖切面高度 2 公尺｜觀測區域 1',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
    {
      title: '地圖切面高度 2 公尺｜觀測區域 2',
      coverage120: '100%',
      coverage90: '100%',
      coverageSinr: '100%',
      signalQuality: '29.14 dB',
      signalStrength: '-78.94 dBm',
      dlThroughput: '200 Mbps',
      ulThroughput: '150 Mbps',
    },
  ];
  
  // Object panel state management
  activeObjectTab = signal<'bs' | 'ris'>('bs');
  bsViewMode = signal<'existing' | 'planned'>('existing');
  readonly risViewMode = signal<'existing' | 'suggest'>('existing');
  readonly terminalViewMode = signal<'existing' | 'suggest'>('existing');

  readonly objectRawResult = computed<any>(() => {
    const signalData = this.resultService.result?.();
    return this._data ?? signalData ?? null;
  });

  readonly objectInput = computed<any>(() => {
    const raw = this.objectRawResult();
    return raw?.input ?? null;
  });

  readonly object5gOutput = computed<any>(() => {
    const raw = this.objectRawResult();
    return raw?.['5GOutput'] ?? null;
  });

  readonly objectInputDefaultBs = computed<any[]>(() => {
    return this.objectInput()?.bsList?.defaultBs ?? [];
  });

  readonly objectChosenDefaultBs = computed<any[]>(() => {
    return this.object5gOutput()?.chosenBsList?.defaultBs ?? [];
  });

  readonly objectChosenCandidateBs = computed<any[]>(() => {
    return this.object5gOutput()?.chosenBsList?.candidateBs ?? [];
  });

  readonly objectInputDefaultRis = computed<any[]>(() => {
    return this.objectInput()?.risList?.defaultRis ?? [];
  });

  readonly objectChosenDefaultRis = computed<any[]>(() => {
    return this.object5gOutput()?.chosenRisList?.defaultRis ?? [];
  });

  readonly objectChosenCandidateRis = computed<any[]>(() => {
    return this.object5gOutput()?.chosenRisList?.candidateRis ?? [];
  });

  readonly objectInputCandidateRis = computed<any[]>(() => {
    return this.objectInput()?.risList?.candidateRis ?? [];
  });

  readonly objectExistingTerminalRawRows = computed<any[]>(() => {
    const input = this.objectInput();
    const parsed = this.parsePipeCoordinateText(input?.ueCoordinate);
    if (!parsed.length) return [];

    // per-UE signal data not available from backend yet
    return parsed.map((p) => ({
      id: p.id,
      title: `終端 ${p.id}`,
      coordinate: p.coordinate,
      signalQuality: null,
      signalStrength: null,
    }));
  });

  /** 後端 / result 尚無建議規劃終端資料來源，先保留空陣列 */
  readonly objectSuggestTerminalRawRows = computed<any[]>(() => {
    return [];
  });

  private readonly resultButtonsBase = [
    { id: 'result' as ResultNavId,   icon: 'assets/icons/resultbtn.png',   title: '規劃結果' },
    { id: 'analysis' as ResultNavId, icon: 'assets/icons/analysisbtn.png', title: '深入分析' },
    { id: 'object' as ResultNavId,   icon: 'assets/icons/objectbtn.png',   title: '場域物件' },
    { id: 'setting' as ResultNavId,  icon: 'assets/icons/settingbtn.png',  title: '場域設定' },
  ];

  readonly visibleResultButtons = computed(() => {
    if (!this.isSimulationModeEffective()) return this.resultButtonsBase;
    return this.resultButtonsBase.filter(btn => btn.id !== 'result');
  });

  private readonly http = inject(HttpClient);
  private readonly fieldDomainStore = inject(FieldDomainStoreService);
  private readonly fieldDomainState = toSignal(this.fieldDomainStore.state$, {
    initialValue: this.fieldDomainStore.snapshot,
  });
  private readonly risService = inject(RisService);

  private getRisModelForId(risID: number): RisApi | null {
    return this.risService.risApiCatalog.find(r => r.risID === risID) ?? null;
  }

  readonly pathLossModelListSignal = signal<any[]>([]);

  constructor(public readonly resultService: ResultDataService) {
    effect(() => {
      const active = this.activeAnalysisItem();
      const allIds: AnalysisTabId[] = ['field', 'bs', 'ue', 'stats', 'observe'];

      if (!allIds.includes(active)) {
        this.activeAnalysisItem.set('field');
      }
    });

    effect(() => {
      const input = this.settingInput();
      const session = input?.sessionid;
      const modelId = input?.pathLossModelId;

      if (!session || !modelId) return;

      console.log('[PathLoss] fetching model list, session=', session, 'modelId=', modelId);

      this.http
        .get(`/son/getPathLossModel/${session}`)
        .subscribe({
          next: (res: any) => {
            console.log('[PathLoss] list result:', res);
            const list = Array.isArray(res) ? res : [];
            this.pathLossModelListSignal.set(list);
          },
          error: (err) => {
            console.error('[PathLoss] error:', err);
            this.pathLossModelListSignal.set([]);
          },
        });
    });

    effect(() => {
      console.log('[DEBUG FULL DATA]', this._data);
    });

    effect(() => {
      console.log('[RightSidebar][DEBUG][object-bs]', {
        input: this.objectInput(),
        output5G: this.object5gOutput(),
        summary: this.bsSummaryVm(),
        existingRows: this.existingBsObjectRows(),
        suggestRows: this.suggestBsObjectRows(),
        activeMode: this.bsViewMode(),
        activeRows: this.activeBsObjectRows(),
        emptyText: this.bsObjectEmptyText(),
      });
    });

    effect(() => {
      console.log('[RightSidebar][DEBUG][object-ris]', {
        input: this.objectInput(),
        output5G: this.object5gOutput(),
        inputDefaultRis: this.objectInputDefaultRis(),
        chosenDefaultRis: this.objectChosenDefaultRis(),
        chosenCandidateRis: this.objectChosenCandidateRis(),
        summary: this.risSummaryVm(),
        existingRows: this.existingRisObjectRows(),
        suggestRows: this.suggestRisObjectRows(),
        activeMode: this.risViewMode(),
        activeRows: this.activeRisObjectRows(),
        hasActiveRows: this.hasActiveRisObjectRows(),
        emptyText: this.risObjectEmptyText(),
      });
    });

    effect(() => {
      console.log('[RightSidebar][DEBUG][object-terminal]', {
        summary: this.terminalSummaryVm(),
        existingRows: this.existingTerminalObjectRows(),
        suggestRows: this.suggestTerminalObjectRows(),
        activeMode: this.terminalViewMode(),
        activeRows: this.activeTerminalObjectRows(),
        emptyText: this.terminalObjectEmptyText(),
      });
    });

    effect(() => {
      console.log('[RightSidebar][DEBUG][object-ris-rows]', {
        existing: this.existingRisObjectRows(),
        suggest: this.suggestRisObjectRows(),
        active: this.activeRisObjectRows(),
      });
    });

    effect(() => {
      console.log('[RIS_UI_TRACE_FULL]', {
        activeObjectTab: this.activeObjectTab(),
        risViewMode: this.risViewMode(),
        objectInputDefaultRis: this.objectInputDefaultRis(),
        objectChosenDefaultRis: this.objectChosenDefaultRis(),
        objectChosenCandidateRis: this.objectChosenCandidateRis(),
        existingRisObjectRows: this.existingRisObjectRows(),
        suggestRisObjectRows: this.suggestRisObjectRows(),
        activeRisObjectRows: this.activeRisObjectRows(),
        currentObjectCards: this.currentObjectCards(),
      });
    });

    effect(() => {
      console.log('[RightSidebar][DEBUG][object-ue-rows]', {
        inputUeCoordinate: this.objectInput()?.ueCoordinate,
        existingRaw: this.objectExistingTerminalRawRows(),
        existingVm: this.existingTerminalObjectRows(),
        active: this.activeTerminalObjectRows(),
      });
    });

    effect(() => {
      const activeResult = this.activeResult();
      const activeAnalysis = this.activeAnalysisItem();
      const metric = this.statsMetric();
      if (activeResult !== 'analysis' || activeAnalysis !== 'stats') return;
      const data = this.getActiveStatsSource();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.scheduleStatsRender(metric, data));
      });
    });

    // Step 3: simulation mode 時主動清掉 result panel
    effect(() => {
      if (this.isSimulationModeEffective() && this.activeResult() === 'result') {
        this.activeResult.set('analysis');
      }
    });

    // Step 4: simulation mode 時把「建議規劃基站」view 重設為「既有基站」
    effect(() => {
      if (this.isSimulationModeEffective() && this.bsViewMode() === 'planned') {
        this.bsViewMode.set('existing');
      }
    });

    effect(() => {
      console.log('[SIM_MODE_FINAL_FIX]', {
        executionModeInput: this.executionModeSignal?.(),
        fromExecutionMode: this.executionModeSignal?.() === 'simulation',
        fromResultInput: (this.resultService?.result?.() as any)?.input?.isSimulation === true,
        isSimulationModeEffective: this.isSimulationModeEffective?.(),
        activeObjectTab: this.activeObjectTab?.(),
        bsViewMode: this.bsViewMode?.(),
        activeResult: this.activeResult?.(),
        visibleResultButtonIds: this.visibleResultButtons?.()?.map?.((b: any) => b.id) ?? [],
        suggestBsObjectRowsCount: this.suggestBsObjectRows?.()?.length ?? 0,
        existingBsObjectRowsCount: this.existingBsObjectRows?.()?.length ?? 0,
        currentObjectCardsCount: this.currentObjectCards?.()?.length ?? 0,
      });
    });

    // DEBUG: API_ONLY 資料血統驗證
    effect(() => {
      console.log('[API_ONLY][field]', {
        resultOutput: this.resultOutput,
        fieldStatistics: this.resultOutput?.fieldStatistics,
        fieldSummaryCards: this.fieldSummaryCards(),
        fieldDetailCards: this.fieldDetailCards(),
      });
    });
    effect(() => {
      console.log('[API_ONLY][bs]', {
        resultOutput: this.resultOutput,
        bsTptList: this.bsTptList(),
        bsSummaryCards: this.bsSummaryCards(),
        bsDetailCards: this.bsDetailCards(),
      });
    });
    effect(() => {
      console.log('[API_ONLY][ue]', {
        coverage: this.resultOutput?.coverage,
        averageSinr: this.resultOutput?.averageSinr,
        averageRsrp: this.resultOutput?.averageRsrp,
        ueCoverage: this.resultOutput?.ueCoverage,
        ueAverageSinr: this.resultOutput?.ueAverageSinr,
        ueAverageRsrp: this.resultOutput?.ueAverageRsrp,
        evaluationResultUe: this.resultOutput?.evaluationResult?.ue,
        hasUeAnalysisData: this.hasUeAnalysisData(),
      });
    });
    effect(() => {
      console.log('[API_ONLY][observe]', {
        subfieldStatistics: this.resultOutput?.subfieldStatistics,
        observationAreaCounts: this.observationAreaCounts(),
        subfieldAnalysisVms: this.subfieldAnalysisVms(),
        subfieldObservationCards: this.subfieldObservationCards(),
        analysisSubfields: this.analysisSubfieldsSignal(),
      });
    });
  }

  ngAfterViewInit(): void {}

  ngOnInit(): void {
    console.log('[STORE_INSTANCE_SIDEBAR]', this.fieldDomainStore);
    this.analysisSubfieldsSignal.set(this.analysisSubfields ?? []);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['executionMode']) {
      this.executionModeSignal.set(this.executionMode);
    }
    if (changes['analysisSubfields']) {
      this.analysisSubfieldsSignal.set(this.analysisSubfields ?? []);
    }
  }

  onAnalysisItemClick(type: AnalysisTabId) {
    this.activeAnalysisItem.set(type);
  }

  // ===== [RESULT_PANEL][LEGACY_BS_FILTER_STATE] =====
  readonly BS_POWER_THRESHOLD = 20;
  readonly pageSize = 10;
  readonly currentFilter = signal<'all' | 'passed' | 'failed'>('all');
  readonly currentPage = signal<number>(1);

  readonly allFilteredRows = computed(() => {
    return [];
  });

  readonly pagedBsRows = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.allFilteredRows().slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() => {
    const total = Math.ceil(this.allFilteredRows().length / this.pageSize);
    return total > 0 ? total : 1;
  });

  get viewMode() {
    return this.resultService.viewMode;
  }

  get result() {
    return this.resultService.result;
  }

  get resultOutput(): any {
    const result = this.resultService.result?.() as any;
    if (!result) return null;
    return result?.output ?? result?.['5GOutput'] ?? null;
  }

  // DEBUG MODE:
  // Analysis panel is temporarily forced to use API-only completeCalcResult data.
  // Do not use MVP / local mock / fallback sources in this phase.

  /** API-only: fieldStatistics + subfieldStatistics for field analysis */
  private get fieldAnalysisApiSource(): any {
    const out = this.resultOutput;
    if (!out?.fieldStatistics && !out?.subfieldStatistics) return null;
    return out;
  }

  /** API-only: resultOutput for BS analysis (per-site data) */
  private get bsAnalysisApiSource(): any {
    return this.resultOutput ?? null;
  }

  /** API-only: resultOutput for UE analysis */
  private get ueAnalysisApiSource(): any {
    return this.resultOutput ?? null;
  }

  /** API-only: subfieldStatistics for observe analysis */
  private get observeAnalysisApiSource(): any {
    const out = this.resultOutput;
    return out?.subfieldStatistics ?? null;
  }

  private formatPct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const pct = value <= 1 ? value * 100 : value;
    return `${pct.toFixed(2)}%`;
  }

  private formatDb(value: number | null | undefined, unit: string): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${Number(value).toFixed(2)} ${unit}`;
  }

  private formatMbps(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${Number(value).toFixed(2)} Mbps`;
  }

  get resultPanelVm(): ResultPanelVm {
    const result = this.resultService.result?.() as any;
    const evaluationFunc =
      result?.input?.evaluationFunc ??
      DEFAULT_EVALUATION_FUNC;
    return buildResultPanelVm(evaluationFunc, this.resultOutput);
  }

  // ===== [A-FINAL][STEP1][UI-MAPPING] =====
  private get _data(): ResultApiResponse | null {
    return this.resultService.result();
  }

  readonly settingInput = computed<any>(() => {
    return this.objectInput();
  });

  readonly settingOutput = computed<any>(() => {
    return this.object5gOutput();
  });

  private parseZValueText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '—';

    const normalized = value.trim();

    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = this.asFiniteNumber(parsed[0]);
        return first === null ? '—' : `${first} 公尺`;
      }
    } catch {
      // ignore parse error, fallback below
    }

    const cleaned = normalized.replace(/^\[/, '').replace(/\]$/, '').trim();
    const first = cleaned.split(',').map(v => v.trim()).find(Boolean);
    const num = this.asFiniteNumber(first);
    return num === null ? '—' : `${num} 公尺`;
  }

  private formatFieldDimensionText(width: unknown, height: unknown, altitude: unknown): string {
    const w = this.asFiniteNumber(width);
    const h = this.asFiniteNumber(height);
    const a = this.asFiniteNumber(altitude);

    if (w === null || h === null || a === null) return '—';
    return `長 ${w} / 寬 ${h} / 高 ${a}`;
  }

  private formatResolutionText(resolution: unknown): string {
    const r = this.asFiniteNumber(resolution);
    if (r === null) return '—';
    return `${r} x ${r} (公尺)`;
  }

  private formatSignedTerm(value: unknown): string {
    const n = this.asFiniteNumber(value);
    if (n === null) return '—';
    return n >= 0 ? `${n}` : `(${n})`;
  }

  private formatPathLossFormula(model: {
    distancePowerLoss?: unknown;
    fieldLoss?: unknown;
  } | null | undefined): string {
    if (!model) return '尚未載入模型公式';

    const dpl = this.asFiniteNumber(model.distancePowerLoss);
    const fl = this.asFiniteNumber(model.fieldLoss);

    const dplText = dpl === null ? 'N' : this.formatSignedTerm(dpl);
    const flText = fl === null ? 'Lf' : this.formatSignedTerm(fl);

    return `Ltotal = 20 log10 f + ${dplText} log10 d + ${flText} - 28`;
  }

  readonly pathLossModelRef = computed<any | null>(() => {
    const input = this.settingInput();
    const modelId = this.asFiniteNumber(input?.pathLossModelId);
    const list = this.pathLossModelListSignal();

    const found =
      modelId === null || !Array.isArray(list)
        ? null
        : list.find((item: any) => {
          const id =
            this.asFiniteNumber(item?.pathLossModelId) ??
            this.asFiniteNumber(item?.modelId) ??
            this.asFiniteNumber(item?.id);
          return id === modelId;
        }) ?? null;

    console.log('[PathLoss][RESOLVE]', {
      modelId,
      listSize: list?.length,
      found,
    });

    return found;
  });

  readonly settingSummaryVm = computed<SettingSummaryVm>(() => {
    const input = this.settingInput();

    return {
      title: '場域設定資訊',
      items: [
        { label: '專案名稱', value: this.safeText(input?.taskName) },
        { label: '建立時間', value: this.safeText(input?.createTime) },
        {
          label: '場域尺寸 (公尺)',
          value: this.formatFieldDimensionText(
            input?.width,
            input?.height,
            input?.altitude
          ),
        },
        { label: '切面高度', value: this.parseZValueText(input?.zValue) },
        {
          label: '每個發射源服務行動終端數量上限',
          value: this.safeText(input?.maxConnectionNum),
        },
        {
          label: '熱點圖網格大小',
          value: this.formatResolutionText(input?.resolution),
        },
      ],
    };
  });

  readonly settingPathLossVm = computed<SettingPathLossVm>(() => {
    const input = this.settingInput();
    const modelId = this.asFiniteNumber(input?.pathLossModelId);
    const ref = this.pathLossModelRef();

    return {
      title: '場域內無線訊號衰減模型',
      modelId,
      modelName: ref?.name ? String(ref.name) : `模型 ID：${modelId ?? '—'}`,
      formulaText: this.formatPathLossFormula(ref),
    };
  });

  readonly settingCostVm = computed<SettingCostVm>(() => {
    const output = this.settingOutput();

    return {
      title: '成本/功耗資訊',
      items: [
        {
          label: '總成本',
          value: `${this.safeText(output?.fieldCost, '0')} 元`,
        },
        {
          label: '總功耗',
          value: `${this.safeText(output?.fieldEnergy, '0')} W`,
        },
      ],
    };
  });

  select(id: RightPanelType) {
    this.active = this.active === id ? null : id;
    this.panelChange.emit(this.active);
  }

  selectResult(id: ResultNavId) {
    if (this.isSimulationModeEffective() && id === 'result') {
      return;
    }

    const cur = this.activeResult();
    this.activeResult.set(cur === id ? null : id);
  }

  closeResultPanel(): void {
    this.activeResult.set(null);
  }

  selectedObjectCardKey: string | null = null;

  private buildObjectCardKeyFromPayload(
    payload: ObjectCardSelectPayload | null | undefined,
    fallbackTitle: string,
  ): string {
    if (!payload) return fallbackTitle;
    return `${payload.objectKind}:${payload.sourceType}:${payload.rowId ?? payload.backendId ?? fallbackTitle}`;
  }

  onObjectCardClick(card: ObjectPanelCardVm): void {
    if (!card.selectPayload) return;

    const key = card.cardKey ?? card.title;

    if (this.selectedObjectCardKey === key) {
      this.selectedObjectCardKey = null;
    } else {
      this.selectedObjectCardKey = key;
    }

    console.log('[ObjectCardSelect][Sidebar]', card.selectPayload);
    this.objectCardSelect.emit(card.selectPayload);
  }

  setFilter(status: 'all' | 'passed' | 'failed'): void {
    this.currentFilter.set(status);
    this.currentPage.set(1);
  }

  changePage(delta: number): void {
    const next = this.currentPage() + delta;
    if (next >= 1 && next <= this.totalPages()) {
      this.currentPage.set(next);
    }
  }

  getResultPanelTitle(id: ResultNavId): string {
    switch (id) {
      case 'result':
        return '規劃結果';
      case 'analysis':
        return '深入分析';
      case 'object':
        return '場域物件';
      case 'setting':
        return '場域設定';
      default:
        return '';
    }
  }

  // ===== [RESULT:A-FEATURE] Save / Export buttons =====
  onSaveProject(): void {
    console.log('[RightSidebar] save project clicked');
    // 先觸發父層（未來可接 API）
    this.saveProject.emit();

    // MVP：直接顯示儲存成功，不等待 API
    this.showSaveSuccess = true;
  }

  onExportProject(): void {
    console.log('[RightSidebar] export project clicked');
    // 觸發父層執行 Babylon 匯出（RightSidebar 本身拿不到 scene）
    this.exportProject.emit();

    // MVP：顯示匯出成功提示
    this.showExportSuccess = true;
  }

  closeSaveSuccess(): void {
    this.showSaveSuccess = false;
  }

  closeExportSuccess(): void {
    this.showExportSuccess = false;
  }

  private asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private safeText(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : fallback;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : fallback;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return fallback;
  }

  private upperText(value: unknown): string {
    if (typeof value === 'string') return value.toUpperCase();
    return this.safeText(value);
  }

  private formatCount(value: unknown, unit: string): string {
    const count = this.asFiniteNumber(value);
    return count !== null ? `${count} ${unit}` : '—';
  }

  private formatRange(min: unknown, max: unknown, unit: string): string {
    const minVal = this.asFiniteNumber(min);
    const maxVal = this.asFiniteNumber(max);
    if (minVal === null || maxVal === null) return '—';
    return `${minVal} ~ ${maxVal} ${unit}`;
  }

  private formatWithUnit(value: unknown, unit: string, precision = 0): string {
    const num = this.asFiniteNumber(value);
    if (num === null) return '—';
    return `${num.toFixed(precision)} ${unit}`;
  }

  /** 依序取 id / ID / risID / bsID；皆無則 fallbackIndex+1（用於陣列列舉） */
  private pickNumericId(row: any, fallbackIndex?: number): number {
    if (row != null && typeof row === 'object') {
      for (const key of ['id', 'ID', 'risID', 'bsID'] as const) {
        const n = this.asFiniteNumber(row[key]);
        if (n !== null) return Math.trunc(n);
      }
    }
    return fallbackIndex !== undefined ? fallbackIndex + 1 : 1;
  }

  /** [x,y,z] 或 { coordinate: [x,y,z] } → "(x, y, z)"；其餘可讀字串則原樣；否則 "—" */
  private formatCoordinateText(value: any): string {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value) && value.length >= 3) {
      const x = this.asFiniteNumber(value[0]);
      const y = this.asFiniteNumber(value[1]);
      const z = this.asFiniteNumber(value[2]);
      if (x !== null && y !== null && z !== null) {
        return `(${x}, ${y}, ${z})`;
      }
      return '—';
    }
    if (typeof value === 'object' && value !== null && 'coordinate' in value) {
      return this.formatCoordinateText((value as { coordinate: unknown }).coordinate);
    }
    if (typeof value === 'string') {
      const t = value.trim();
      return t ? t : '—';
    }
    return '—';
  }

  /** { theta, phi } → "(theta: X, phi: Y)"；可讀字串原樣；否則 "—" */
  private formatAngleText(value: any): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object' && value !== null) {
      const theta = this.asFiniteNumber((value as { theta?: unknown }).theta);
      const phi = this.asFiniteNumber((value as { phi?: unknown }).phi);
      if (theta !== null && phi !== null) {
        return `(theta: ${theta}, phi: ${phi})`;
      }
    }
    if (typeof value === 'string') {
      const t = value.trim();
      return t ? t : '—';
    }
    return '—';
  }

  /**
   * 解析 "[x,y,z]|[x,y,z]|..." 形式之 ueCoordinate；格式錯誤的片段略過，若完全無有效列則 []。
   */
  private parsePipeCoordinateText(text: unknown): Array<{
    id: number;
    coordinate: [number, number, number] | null;
  }> {
    if (text === null || text === undefined) return [];
    const s = String(text).trim();
    if (!s) return [];
    const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
    const out: Array<{ id: number; coordinate: [number, number, number] | null }> = [];
    let segmentIndex = 0;
    for (const part of parts) {
      segmentIndex++;
      const m = part.match(/^\[\s*([^\]]*?)\s*\]$/);
      if (!m) continue;
      const nums = m[1]
        .split(',')
        .map((x) => this.asFiniteNumber(x.trim()))
        .filter((n): n is number => n !== null);
      if (nums.length >= 3) {
        out.push({
          id: segmentIndex,
          coordinate: [nums[0], nums[1], nums[2]],
        });
      } else {
        out.push({ id: segmentIndex, coordinate: null });
      }
    }
    return out;
  }

  private findInputDefaultBsById(id: number): any {
    return (
      this.objectInputDefaultBs().find((bs) => {
        const bid = this.asFiniteNumber(bs?.id);
        const bID = this.asFiniteNumber(bs?.ID);
        return bid === id || bID === id;
      }) ?? null
    );
  }

  /** input.risList.defaultRis：列上常以 risID 辨識，與 BS 相同需兼容 id / ID */
  private findInputDefaultRisByRisId(id: number): any {
    if (id == null || !Number.isFinite(id)) return null;
    return (
      this.objectInputDefaultRis().find((ris: any) => {
        const r1 = this.asFiniteNumber(ris?.risID ?? ris?.risId);
        const r2 = this.asFiniteNumber(ris?.id);
        const r3 = this.asFiniteNumber(ris?.ID);
        return r1 === id || r2 === id || r3 === id;
      }) ?? null
    );
  }

  private findInputCandidateRisByRisId(id: number): any {
    if (id == null || !Number.isFinite(id)) return null;
    return (
      this.objectInputCandidateRis().find((ris: any) => {
        const r1 = this.asFiniteNumber(ris?.risID ?? ris?.risId);
        const r2 = this.asFiniteNumber(ris?.id);
        const r3 = this.asFiniteNumber(ris?.ID);
        return r1 === id || r2 === id || r3 === id;
      }) ?? null
    );
  }

  /**
   * chosen 列優先，缺欄位由 input 同 risID 列補；巢狀 profile/params 等 shallow merge。
   */
  private mergeRisDisplaySource(primary: any, fallback: any): any {
    const a = primary && typeof primary === 'object' ? primary : {};
    const b = fallback && typeof fallback === 'object' ? fallback : {};
    const merged: any = { ...b, ...a };
    for (const key of ['profile', 'params', 'ris', 'meta', 'detail', 'spec'] as const) {
      const pb = b[key];
      const pa = a[key];
      if (
        pb &&
        pa &&
        typeof pb === 'object' &&
        typeof pa === 'object' &&
        !Array.isArray(pb) &&
        !Array.isArray(pa)
      ) {
        merged[key] = { ...pb, ...pa };
      } else if (pa) {
        merged[key] = pa;
      } else if (pb) {
        merged[key] = pb;
      }
    }
    return merged;
  }

  /** 由列本身與常見巢狀 bag 組成查找鏈（優先淺層 primary，已含在 row） */
  private risSpecObjects(row: any): any[] {
    if (!row || typeof row !== 'object') return [];
    const bags = [row, row.params, row.ris, row.profile, row.meta, row.detail, row.spec];
    const out: any[] = [];
    for (const x of bags) {
      if (x != null && typeof x === 'object') out.push(x);
    }
    return out;
  }

  private pickFirstScalarString(row: any, keys: string[]): string {
    for (const o of this.risSpecObjects(row)) {
      for (const k of keys) {
        const v = (o as any)[k];
        if (v === null || v === undefined) continue;
        if (typeof v === 'string') {
          const t = v.trim();
          if (t) return t;
        }
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        if (typeof v === 'boolean') return v ? 'true' : 'false';
      }
    }
    return '—';
  }

  /** 基地台列 id（chosen / input 列皆可能用 ID 大寫） */
  private resolveBsId(row: any): number | null {
    if (!row || typeof row !== 'object') return null;
    for (const key of ['seq', 'bsId', 'bsID', 'id', 'ID'] as const) {
      const n = this.asFiniteNumber(row[key]);
      if (n !== null) return Math.trunc(n);
    }
    return null;
  }

  private resolveBsTitle(row: any): string {
    const explicit = row?.title ?? row?.name;
    if (explicit != null && String(explicit).trim() !== '') {
      return String(explicit).trim();
    }
    const id = this.resolveBsId(row);
    return `基地台 ${id ?? '—'}`;
  }

  /**
   * 無線參數 duplex 來源：列上 params.duplex → input.defaultBs 同 id → bsSetting.duplex
   * （chosenBsList 列常缺完整 params，需回補 defaultBs）
   */
  private resolveBsRadioSource(row: any): any {
    const fromRow = row?.params?.duplex;
    if (fromRow && (fromRow.tddParam || fromRow.fddParam)) {
      return fromRow;
    }
    const id = this.resolveBsId(row);
    if (id != null) {
      const inputBs = this.findInputDefaultBsById(id);
      const fromInput = inputBs?.params?.duplex;
      if (fromInput && (fromInput.tddParam || fromInput.fddParam)) {
        return fromInput;
      }
    }
    return this.objectInput()?.bsSetting?.duplex ?? null;
  }

  private resolveBsTddDl(row: any): any {
    return this.resolveBsRadioSource(row)?.tddParam?.dl;
  }

  private resolveBsTddUl(row: any): any {
    return this.resolveBsRadioSource(row)?.tddParam?.ul;
  }

  private resolveBsCenterFrequency(row: any): string {
    const dl = this.resolveBsTddDl(row);
    const ul = this.resolveBsTddUl(row);
    const freq = dl?.frequency ?? ul?.frequency;
    const n = this.asFiniteNumber(freq);
    if (n !== null) return `${n} MHz`;
    if (typeof freq === 'string' && freq.trim() !== '') return `${freq.trim()} MHz`;
    return '—';
  }

  private resolveBsScs(row: any): string {
    const dl = this.resolveBsTddDl(row);
    const ul = this.resolveBsTddUl(row);
    const v = dl?.scs ?? ul?.scs;
    if (v === null || v === undefined || v === '') return '—';
    const n = this.asFiniteNumber(v);
    if (n !== null) return `${n} KHz`;
    return `${String(v).trim()} KHz`;
  }

  private resolveBsBandwidth(row: any): string {
    const dl = this.resolveBsTddDl(row);
    const ul = this.resolveBsTddUl(row);
    const v = dl?.bandwidth ?? ul?.bandwidth;
    if (v === null || v === undefined || v === '') return '—';
    const n = this.asFiniteNumber(v);
    if (n !== null) return `${n} MHz`;
    return `${String(v).trim()} MHz`;
  }

  private resolveBsUlMcs(row: any): string {
    return this.safeText(this.resolveBsTddUl(row)?.mcsTable, '—');
  }

  private resolveBsDlMcs(row: any): string {
    return this.safeText(this.resolveBsTddDl(row)?.mcsTable, '—');
  }

  private formatBsMimoLayer(value: unknown): string {
    const n = this.asFiniteNumber(value);
    if (n !== null) return String(Math.trunc(n));
    if (typeof value === 'string') {
      const t = value.trim();
      if (t) return t;
    }
    return '—';
  }

  /** row.txPower → row.params.txPower → input defaultBs 同 id 的 params.txPower */
  private resolveBsTxPower(row: any): unknown {
    const direct =
      row?.txPower ??
      row?.power ??
      row?.params?.txPower;

    if (direct != null && direct !== '') return direct;

    const id = this.resolveBsId(row);
    if (id != null) {
      const inputBs = this.findInputDefaultBsById(id);
      const p =
        inputBs?.txPower ??
        inputBs?.power ??
        inputBs?.params?.txPower;
      if (p != null && p !== '') return p;
    }

    const input = this.objectInput();
    const globalTxPower = input?.txPower;
    if (globalTxPower != null && globalTxPower !== '') return globalTxPower;

    return null;
  }

  // ----- RIS Object Panel（舊系主表欄位血統） -----
  private resolveRisId(row: any): number | null {
    if (!row || typeof row !== 'object') return null;
    for (const key of ['risID', 'id', 'ID'] as const) {
      const n = this.asFiniteNumber(row[key]);
      if (n !== null) return Math.trunc(n);
    }
    return null;
  }

  /** 標題：instance identity 優先；risID 只作最後 fallback（同型號多 instance 會重複）*/
  private resolveRisTitle(row: any, rowIndex?: number): string {
    for (const c of [
      row?.risName,
      row?.name,
      row?.title,
      row?.displayName,
      row?.label,
    ]) {
      if (c != null && String(c).trim() !== '') return String(c).trim();
    }
    // seq = instance 序號（若 API 有回傳）
    const seq = this.asFiniteNumber(row?.seq);
    if (seq !== null) return `RIS ${seq}`;
    // rowIndex = 在 chosen 陣列中的位置，作為穩定的 instance 顯示編號
    if (rowIndex !== undefined) return `RIS ${rowIndex + 1}`;

    // id/ID = API 分配的 per-instance 數字 ID（若存在且 > 0 才使用）
    const instId = this.asFiniteNumber(row?.id ?? row?.ID);
    if (instId !== null && instId > 0) return `RIS ${instId}`;
    // risID 為 model 型號 ID，多個 instance 會重複，僅作最後手段
    const rid = this.asFiniteNumber(row?.risID);
    if (rid !== null) return `RIS ${rid}`;
    return 'RIS —';
  }

  private resolveRisFrequencyText(row: any, inputLteBand?: string): string {
    for (const o of this.risSpecObjects(row)) {
      const raw = (o as any).frequency ?? (o as any).supportedFrequency ?? (o as any).freq;
      if (Array.isArray(raw) && raw.length >= 2) {
        const a = this.asFiniteNumber(raw[0]);
        const b = this.asFiniteNumber(raw[1]);
        if (a !== null && b !== null) return `${a} ~ ${b} MHz`;
        const sa = String(raw[0]).trim();
        const sb = String(raw[1]).trim();
        if (sa && sb) return `${sa} ~ ${sb} MHz`;
      }
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return `${raw} MHz`;
      }
      if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
      }
    }
    const bandStr = this.pickFirstScalarString(row, [
      'supportedBand',
      'band',
      'lteBand',
      'frequencyBand',
      'bandName',
    ]);
    if (bandStr !== '—') return bandStr;
    const lte = inputLteBand != null ? String(inputLteBand).trim() : '';
    if (lte) return lte;
    return '—';
  }

  private resolveRisElementNumberText(row: any): string {
    for (const o of this.risSpecObjects(row)) {
      const v =
        (o as any).elementNumber ?? (o as any).elementCount ?? (o as any).numberOfElements;
      if (Array.isArray(v) && v.length >= 2) {
        return `${v[0]} X ${v[1]}`;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const r = this.asFiniteNumber((v as any).rows ?? (v as any).row);
        const c = this.asFiniteNumber(
          (v as any).cols ?? (v as any).col ?? (v as any).columns
        );
        if (r !== null && c !== null) return `${r} X ${c}`;
      }
      const n = this.asFiniteNumber(v);
      if (n !== null) return String(Math.trunc(n));
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '—';
  }

  private resolveRisElementSizeText(row: any): string {
    for (const o of this.risSpecObjects(row)) {
      const v =
        (o as any).elementSize ??
        (o as any).elementDimension ??
        (o as any).unitSize ??
        (o as any).cellSize;
      if (Array.isArray(v) && v.length >= 2) {
        return `${v[0]} X ${v[1]}`;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const w = this.asFiniteNumber((v as any).width ?? (v as any).w);
        const h = this.asFiniteNumber((v as any).height ?? (v as any).h);
        if (w !== null && h !== null) return `${w} X ${h}`;
      }
      const n = this.asFiniteNumber(v);
      if (n !== null) return String(n);
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '—';
  }

  private resolveRisTypeText(row: any): string {
    const v = this.pickFirstScalarString(row, [
      'type',
      'risType',
      'ris_type',
      'category',
      'risCategory',
    ]);
    return v;
  }

  private resolveRisManufacturerText(row: any): string {
    return this.pickFirstScalarString(row, ['manufacturer', 'vendor', 'brand', 'maker']);
  }

  private resolveRisMaterialText(row: any): string {
    return this.pickFirstScalarString(row, ['material', 'substrate']);
  }

  private resolveRisEnergyText(row: any): string {
    const keys = ['risEnergy', 'energy', 'power', 'consumption', 'powerConsumption', 'watt'];
    for (const o of this.risSpecObjects(row)) {
      for (const k of keys) {
        const v = (o as any)[k];
        if (v === null || v === undefined || v === '') continue;
        const n = this.asFiniteNumber(v);
        if (n !== null) return String(n);
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return '—';
  }

  private resolveRisCostText(row: any): string {
    const keys = ['risCost', 'cost', 'price', 'totalCost'];
    for (const o of this.risSpecObjects(row)) {
      for (const k of keys) {
        const v = (o as any)[k];
        if (v === null || v === undefined || v === '') continue;
        const n = this.asFiniteNumber(v);
        if (n !== null) return String(n);
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return '—';
  }

  /** 場域物件卡片欄位中文（與舊系統用語一致；VM 組裝唯一來源） */
  private readonly objectPanelLabels = {
    bs: {
      bsId: '基站編號',
      power: '功率',
      centerFrequency: '中心頻率',
      scs: '子載波間距',
      bandwidth: '頻寬',
      ulMcs: '上行調變能力',
      dlMcs: '下行調變能力',
      ulMimo: '上行資料串流層數',
      dlMimo: '下行資料串流層數',
    },
    ris: {
      type: 'RIS 類型',
      frequencyBand: '支援頻段',
      manufacturer: '廠商',
      material: '材質',
      elementNumber: '元件數量',
      elementSize: '元件尺寸',
      energy: '功耗',
      cost: '成本',
    },
    ue: {
      signalQuality: '訊號品質',
      signalStrength: '訊號強度',
    },
  } as const;

  /** 歷史/外部資料若仍帶英文 label，於卡片 VM 層統一轉中文 */
  private normalizeObjectPanelFieldLabel(label: string): string {
    const bs = this.objectPanelLabels.bs;
    const map: Record<string, string> = {
      'Tx Power': bs.power,
      'DL Params': bs.dlMcs,
      'UL Params': bs.ulMcs,
      發射功率: bs.power,
      下行參數: bs.dlMcs,
      上行參數: bs.ulMcs,
      Position: this.objectPanelLabels.ris.type,
      Angle: this.objectPanelLabels.ris.frequencyBand,
      位置: this.objectPanelLabels.ris.type,
      角度: this.objectPanelLabels.ris.frequencyBand,
      'Signal Quality': this.objectPanelLabels.ue.signalQuality,
      'Signal Strength': this.objectPanelLabels.ue.signalStrength,
    };
    return map[label] ?? label;
  }

  private resolveBsCardTitle(row: BsObjectRowVm): string {
    const t = String(row.title ?? '').trim();
    if (!t || t === '—') {
      if (row.id != null && row.id >= 0) return `基地台 ${row.id}`;
      return '基地台 —';
    }
    return row.title;
  }

  private resolveRisCardTitle(row: RisObjectRowVm): string {
    const t = String(row.title ?? '').trim();
    if (!t || t === '—') {
      if (row.id != null && row.id >= 0) return `RIS ${row.id}`;
      return 'RIS —';
    }
    return row.title;
  }

  private resolveUeCardTitle(row: TerminalObjectRowVm): string {
    const t = String(row.title ?? '').trim();
    if (!t || t === '—') return `終端 ${row.id}`;
    return row.title;
  }

  private buildBsObjectRowVm(row: any, type: BsRowType): BsObjectRowVm | null {
    if (!row) return null;
    const idNum = this.resolveBsId(row) ?? -1;
    const L = this.objectPanelLabels.bs;
    const idShown = this.resolveBsId(row);

    return {
      id: idNum,
      rowId:
        row?.rowId != null ? String(row.rowId) :
        row?.fieldRowId != null ? String(row.fieldRowId) :
        row?.id != null ? String(row.id) :
        row?.ID != null ? String(row.ID) :
        row?.bsID != null ? String(row.bsID) :
        null,
      title: this.resolveBsTitle(row),
      type,
      items: [
        { label: L.bsId, value: idShown != null ? String(idShown) : '—' },
        { label: L.power, value: this.formatWithUnit(this.resolveBsTxPower(row), 'dBm') },
        { label: L.centerFrequency, value: this.resolveBsCenterFrequency(row) },
        { label: L.scs, value: this.resolveBsScs(row) },
        { label: L.bandwidth, value: this.resolveBsBandwidth(row) },
        { label: L.ulMcs, value: this.resolveBsUlMcs(row) },
        { label: L.dlMcs, value: this.resolveBsDlMcs(row) },
        { label: L.ulMimo, value: this.formatBsMimoLayer(this.resolveBsTddUl(row)?.mimo) },
        { label: L.dlMimo, value: this.formatBsMimoLayer(this.resolveBsTddDl(row)?.mimo) },
      ],
    };
  }

  private buildRisObjectRowVm(
    row: any,
    type: 'default' | 'candidate',
    rowIndex?: number,
  ): RisObjectRowVm | null {
    if (!row) return null;
    const L = this.objectPanelLabels.ris;
    const idNum = this.pickNumericId(row, rowIndex);
    const inputBand = this.objectInput()?.lteBand;

    const vm: RisObjectRowVm = {
      id: idNum,
      rowId:
        row?.rowId != null ? String(row.rowId) :
        row?.fieldRowId != null ? String(row.fieldRowId) :
        row?.id != null ? String(row.id) :
        row?.ID != null ? String(row.ID) :
        row?.risID != null ? String(row.risID) :
        null,
      title: this.resolveRisTitle(row, rowIndex),
      type,
      items: [
        { label: L.type, value: this.resolveRisTypeText(row) },
        { label: L.frequencyBand, value: this.resolveRisFrequencyText(row, inputBand) },
        { label: L.manufacturer, value: this.resolveRisManufacturerText(row) },
        { label: L.material, value: this.resolveRisMaterialText(row) },
        { label: L.elementNumber, value: this.resolveRisElementNumberText(row) },
        { label: L.elementSize, value: this.resolveRisElementSizeText(row) },
        { label: L.energy, value: this.resolveRisEnergyText(row) },
        { label: L.cost, value: this.resolveRisCostText(row) },
      ],
    };

    console.log('[RIS_ROW_MAPPING]', { rawRow: row, mappedVm: vm });
    return vm;
  }

  private buildTerminalObjectRowVm(
    row: any,
    type: 'default' | 'candidate',
    fallbackIndex?: number,
  ): TerminalObjectRowVm | null {
    if (!row) return null;
    const id = this.pickNumericId(row, fallbackIndex);
    const title = row?.title ?? row?.name ?? `終端 ${id}`;
    return {
      id,
      title,
      type,
      items: [
        {
          label: this.objectPanelLabels.ue.signalQuality,
          value: this.formatWithUnit(row.signalQuality, 'dB', 2),
        },
        {
          label: this.objectPanelLabels.ue.signalStrength,
          value: this.formatWithUnit(row.signalStrength, 'dBm', 2),
        },
      ],
    };
  }

  // BS Object VMs
  readonly bsSummaryVm = computed<BsObjectSummaryVm>(() => {
    const input = this.objectInput();
    const txRange = input?.bsSetting?.txPowerRange;

    const txMin =
      Array.isArray(txRange) ? txRange[0] : input?.powerMinRange;

    const txMax =
      Array.isArray(txRange) ? txRange[1] : input?.powerMaxRange;

    return {
      title: '基站資訊-規劃模式',
      items: [
        { label: '網路種類', value: this.safeText(input?.mapProtocol) },
        { label: '頻段', value: this.safeText(input?.lteBand) },
        { label: '雙工方式', value: this.upperText(input?.duplex) },
        { label: '可安裝無線基站位置', value: this.formatCount(input?.availableNewBsNumber, '處') },
        { label: '既有基站', value: this.formatCount(this.objectInputDefaultBs().length, '台') },
        { label: '發射功率範圍', value: this.formatRange(txMin, txMax, 'dBm') },
      ],
    };
  });

  readonly existingBsObjectRows = computed<BsObjectRowVm[]>(() => {
    const storeRows = this.fieldDomainState()?.existingBs ?? [];
    return storeRows
      .map(row => this.buildBsObjectRowVm(row, 'default'))
      .filter((row): row is BsObjectRowVm => !!row)
      .sort((a, b) => a.id - b.id);
  });

  readonly suggestBsObjectRows = computed<BsObjectRowVm[]>(() => {
    if (this.isSimulationModeEffective()) return [];
    const storeRows = this.fieldDomainState()?.candidateBs ?? [];
    return storeRows
      .map(row => this.buildBsObjectRowVm(row, 'candidate'))
      .filter((row): row is BsObjectRowVm => !!row)
      .sort((a, b) => a.id - b.id);
  });

  readonly activeBsObjectRows = computed<BsObjectRowVm[]>(() => {
    if (this.isSimulationModeEffective() || this.bsViewMode() !== 'planned') {
      return this.existingBsObjectRows();
    }
    return this.suggestBsObjectRows();
  });

  readonly hasActiveBsObjectRows = computed<boolean>(() => {
    return this.activeBsObjectRows().length > 0;
  });

  readonly bsObjectEmptyText = computed<string>(() => {
    return this.bsViewMode() === 'planned'
      ? '目前沒有建議規劃基站'
      : '目前沒有既有基站資料';
  });

  // RIS Object VMs
  readonly risSummaryVm = computed<RisObjectSummaryVm>(() => {
    const input = this.objectInput();
    const output = this.object5gOutput();

    const availableNewRisNumber =
      this.asFiniteNumber(input?.availableNewRisNumber) ?? 0;

    const defaultRisCount = this.objectInputDefaultRis().length;
    const suggestRisCount = this.objectChosenCandidateRis().length;

    return {
      title: 'RIS 資訊-規劃模式',
      items: [
        { label: '網路種類', value: this.safeText(input?.mapProtocol) },
        { label: '可安裝 RIS 位置', value: this.formatCount(availableNewRisNumber, '處') },
        { label: '既有 RIS', value: this.formatCount(defaultRisCount, '面') },
        { label: '建議 RIS', value: this.formatCount(suggestRisCount, '面') },
        { label: 'RIS 總成本', value: `${this.safeText(output?.fieldCost, '0')} 元` },
        { label: 'RIS 總功耗', value: `${this.safeText(output?.fieldEnergy, '0')} W` },
      ],
    };
  });

  readonly existingRisObjectRows = computed<RisObjectRowVm[]>(() => {
    const input = this.objectInputDefaultRis();
    if (!input.length) return [];
    const chosen = this.objectChosenDefaultRis();
    if (!chosen.length) return [];

    const built = chosen
      .map((row: any, idx: number) => {
        const rid = this.resolveRisId(row);
        const fb =
          (rid != null ? this.findInputDefaultRisByRisId(rid) : null) ??
          input[idx] ??
          null;
        // Attach RIS catalog model data under 'ris' key so risSpecObjects finds it
        // as a fallback without polluting top-level (avoids risName overriding title)
        const model = rid != null ? this.getRisModelForId(rid) : null;
        const fbWithModel = model
          ? { ...(fb ?? {}), ris: { ...model, ...(fb?.ris ?? {}) } }
          : fb;
        const merged = this.mergeRisDisplaySource(row, fbWithModel);
        return this.buildRisObjectRowVm(merged, 'default', idx);
      })
      .filter((row): row is RisObjectRowVm => row != null)
      .sort((a, b) => a.id - b.id);

    const seen = new Set<number>();
    return built.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });

  readonly suggestRisObjectRows = computed<RisObjectRowVm[]>(() => {
    const chosen = this.objectChosenCandidateRis();
    if (!chosen.length) return [];
    const input = this.objectInputCandidateRis();

    const built = chosen
      .map((row: any, idx: number) => {
        const rid = this.resolveRisId(row);
        const fb =
          (rid != null ? this.findInputCandidateRisByRisId(rid) : null) ??
          input[idx] ??
          null;
        const model = rid != null ? this.getRisModelForId(rid) : null;
        const fbWithModel = model
          ? { ...(fb ?? {}), ris: { ...model, ...(fb?.ris ?? {}) } }
          : fb;
        const merged = this.mergeRisDisplaySource(row, fbWithModel);
        return this.buildRisObjectRowVm(merged, 'candidate', idx);
      })
      .filter((row): row is RisObjectRowVm => row != null)
      .sort((a, b) => a.id - b.id);

    const seen = new Set<number>();
    return built.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });

  readonly activeRisObjectRows = computed<RisObjectRowVm[]>(() => {
    return this.risViewMode() === 'suggest'
      ? this.suggestRisObjectRows()
      : this.existingRisObjectRows();
  });

  readonly hasActiveRisObjectRows = computed<boolean>(() => {
    return this.activeRisObjectRows().length > 0;
  });

  readonly risObjectEmptyText = computed<string>(() => {
    return this.risViewMode() === 'suggest'
      ? '目前沒有建議規劃 RIS'
      : '目前沒有既有 RIS 資料';
  });

  // Terminal Object VMs
  readonly terminalSummaryVm = computed<TerminalObjectSummaryVm>(() => {
    const out = this.resultOutput;
    return {
      title: '終端資訊',
      items: [
        { label: '網路種類', value: this.safeText(this.objectInput()?.mapProtocol) },
        { label: '平均訊號品質', value: this.formatDb(out?.ueAverageSinr, 'dB') },
        { label: '平均訊號強度', value: this.formatDb(out?.ueAverageRsrp, 'dBm') },
      ],
    };
  });

  readonly existingTerminalObjectRows = computed<TerminalObjectRowVm[]>(() => {
    return this.objectExistingTerminalRawRows()
      .map((row: any) => this.buildTerminalObjectRowVm(row, 'default'))
      .filter((row): row is TerminalObjectRowVm => !!row)
      .sort((a, b) => a.id - b.id);
  });

  readonly suggestTerminalObjectRows = computed<TerminalObjectRowVm[]>(() => {
    return this.objectSuggestTerminalRawRows()
      .map((row: any) => this.buildTerminalObjectRowVm(row, 'candidate'))
      .filter((row): row is TerminalObjectRowVm => !!row)
      .sort((a, b) => a.id - b.id);
  });

  readonly activeTerminalObjectRows = computed<TerminalObjectRowVm[]>(() => {
    return this.terminalViewMode() === 'suggest'
      ? this.suggestTerminalObjectRows()
      : this.existingTerminalObjectRows();
  });

  readonly hasActiveTerminalObjectRows = computed<boolean>(() => {
    return this.activeTerminalObjectRows().length > 0;
  });

  readonly terminalObjectEmptyText = computed<string>(() => {
    return this.terminalViewMode() === 'suggest'
      ? '目前沒有建議規劃終端資料'
      : '目前沒有既有終端資料';
  });

  readonly hasPerUeTerminalMetrics = computed<boolean>(() => {
    const rows = this.activeTerminalObjectRows();
    return rows.some((row: any) =>
      row?.items?.some((item: any) => item?.value != null && item.value !== '—')
    );
  });
  // ===== [Object Panel] Unified VM (mock-first, API-later) =====
  private get mockBsCardRows(): BsObjectRowVm[] {
    const bs = this.objectPanelLabels.bs;
    const rowVm = (id: number, type: 'default' | 'candidate', power: string, bw: string) =>
      ({
        id,
        title: `基地台 ${id}`,
        type,
        items: [
          { label: bs.bsId, value: String(id) },
          { label: bs.power, value: power },
          { label: bs.centerFrequency, value: '4850 MHz' },
          { label: bs.scs, value: '30 KHz' },
          { label: bs.bandwidth, value: bw },
          { label: bs.ulMcs, value: '64QAM-table' },
          { label: bs.dlMcs, value: '256QAM-table' },
          { label: bs.ulMimo, value: '1' },
          { label: bs.dlMimo, value: '1' },
        ],
      }) satisfies BsObjectRowVm;

    return [
      rowVm(1, 'default', '24 dBm', '100 MHz'),
      rowVm(2, 'candidate', '27 dBm', '10 MHz'),
    ];
  }

  private get mockRisCardRows(): RisObjectRowVm[] {
    const r = this.objectPanelLabels.ris;
    return [
      {
        id: 1,
        title: '示範 RIS',
        type: 'default',
        items: [
          { label: r.type, value: 'Active' },
          { label: r.frequencyBand, value: '27500 ~ 28350 MHz' },
          { label: r.manufacturer, value: 'ITRI' },
          { label: r.material, value: 'Crystal-Liquid' },
          { label: r.elementNumber, value: '32 X 32' },
          { label: r.elementSize, value: '50 X 50' },
          { label: r.energy, value: '0' },
          { label: r.cost, value: '0' },
        ],
      },
    ];
  }

  private get mockUeCardRows(): TerminalObjectRowVm[] {
    const { ue } = this.objectPanelLabels;
    return [
      {
        id: 1,
        title: '終端 1',
        type: 'default',
        items: [
          { label: ue.signalQuality, value: '29.14 dB' },
          { label: ue.signalStrength, value: '-78.94 dBm' },
        ],
      },
      {
        id: 2,
        title: '終端 2',
        type: 'default',
        items: [
          { label: ue.signalQuality, value: '24.10 dB' },
          { label: ue.signalStrength, value: '-86.78 dBm' },
        ],
      },
    ];
  }

  private readonly mockObjectSummaryVm = {
    bs: {
      title: '基站資訊-規劃模式',
      items: [
        { label: '網路種類', value: '5G' },
        { label: '頻段', value: 'n79' },
        { label: '雙工方式', value: 'TDD' },
      ],
    } satisfies ObjectPanelSummaryVm,
    ris: {
      title: 'RIS 資訊-規劃模式',
      items: [
        { label: '網路種類', value: '5G' },
        { label: '可安裝 RIS 位置', value: '0 處' },
        { label: '既有 RIS', value: '1 面' },
      ],
    } satisfies ObjectPanelSummaryVm,
    ue: {
      title: '終端資訊-規劃模式',
      items: [
        { label: '網路種類', value: '5G' },
        { label: '平均訊號品質', value: '29.14 dB' },
        { label: '平均訊號強度', value: '-78.94 dBm' },
      ],
    } satisfies ObjectPanelSummaryVm,
  };

  // ===== build helpers (no template parsing) =====
  private buildBsCardVm(row: BsObjectRowVm): ObjectPanelCardVm {
    const payload: ObjectCardSelectPayload = {
      objectKind: 'bs',
      sourceType: row.type,
      displayTitle: this.resolveBsCardTitle(row),
      backendId: row.id ?? null,
      rowId: row.rowId != null ? String(row.rowId) : null,
      rowIndex: null,
    };
    return {
      title: this.resolveBsCardTitle(row),
      items: row.items.map(i => ({
        label: this.normalizeObjectPanelFieldLabel(i.label),
        value: i.value,
      })),
      withAccent: true,
      cardKey: this.buildObjectCardKeyFromPayload(payload, this.resolveBsCardTitle(row)),
      selectPayload: payload,
    };
  }

  private buildRisCardVm(row: RisObjectRowVm): ObjectPanelCardVm {
    const payload: ObjectCardSelectPayload = {
      objectKind: 'ris',
      sourceType: row.type,
      displayTitle: this.resolveRisCardTitle(row),
      backendId: row.id ?? null,
      rowId: row.rowId != null ? String(row.rowId) : null,
      rowIndex: row.id ?? null,
    };
    return {
      title: this.resolveRisCardTitle(row),
      items: row.items.map(i => ({
        label: this.normalizeObjectPanelFieldLabel(i.label),
        value: i.value,
      })),
      withAccent: true,
      cardKey: this.buildObjectCardKeyFromPayload(payload, this.resolveRisCardTitle(row)),
      selectPayload: payload,
    };
  }

  private buildUeCardVm(row: TerminalObjectRowVm): ObjectPanelCardVm {
    return {
      title: this.resolveUeCardTitle(row),
      items: row.items.map(i => ({
        label: this.normalizeObjectPanelFieldLabel(i.label),
        value: i.value,
      })),
      withAccent: true,
    };
  }

  readonly currentObjectSummaryVm = computed<ObjectPanelSummaryVm | null>(() => {
    const tab = this.activeObjectTab();
    if (tab === 'bs') return this.bsSummaryVm();
    if (tab === 'ris') return this.risSummaryVm();
    return null;
  });

  shouldShowObjectSummaryCard(): boolean {
    const tab = this.activeObjectTab();

    // BS / RIS 的 summary 在結果頁一律隱藏
    if (tab === 'bs' || tab === 'ris') {
      return false;
    }

    return true;
  }

  readonly currentObjectCards = computed<ObjectPanelCardVm[]>(() => {
    if (this.activeObjectTab() === 'bs') {
      const rows = this.activeBsObjectRows();
      const useRows = rows.length ? rows : (this.isSimulationModeEffective() ? [] : this.mockBsCardRows);
      return useRows.map(row => this.buildBsCardVm(row));
    }

    if (this.activeObjectTab() === 'ris') {
      const rows = this.activeRisObjectRows();
      if (!rows.length) return [];
      return rows.map(row => this.buildRisCardVm(row));
    }

    return [];
  });

  readonly currentObjectEmptyText = computed<string>(() => {
    if (this.activeObjectTab() === 'bs') return this.bsObjectEmptyText();
    if (this.activeObjectTab() === 'ris') return this.risObjectEmptyText();
    return '';
  });

  // ===== [Phase 6] Field analysis（舊系 5G 場域分析欄位血統；卡片式 UI） =====
  /** API-only：fieldStatistics.avg 存在或 fieldStatistics.data 長度 > 0 */
  readonly hasFieldAnalysisData = computed<boolean>(() => {
    const fs = this.resultOutput?.fieldStatistics;
    if (!fs) return false;
    if (fs.avg != null) return true;
    return Array.isArray(fs.data) && fs.data.length > 0;
  });

  readonly fieldAnalysisEmptyText = '尚無場域分析資料';

  /** 場域分析：每張 card 固定五欄（與舊系表格血統一致） */
  private buildFieldAnalysisFiveItems(args: {
    c: number | null;
    cSs: number | null;
    cSq: number | null;
    signalQualityAvg: number | null | undefined;
    signalStrengthAvg: number | null | undefined;
  }): AnalysisInfoItem[] {
    return [
      { label: 'RSRP ≥ -120 dBm 覆蓋率', value: this.formatPct(args.c) },
      { label: 'RSRP ≥ -90 dBm 覆蓋率', value: this.formatPct(args.cSs) },
      { label: 'SINR ≥ 15 dB 覆蓋率', value: this.formatPct(args.cSq) },
      { label: '平均訊號品質', value: this.formatDb(args.signalQualityAvg, 'dB') },
      { label: '平均訊號強度', value: this.formatDb(args.signalStrengthAvg, 'dBm') },
    ];
  }

  /** 場域平均 card：API-only，僅 resultOutput.fieldStatistics（avg 或 data[0]） */
  readonly fieldSummaryCards = computed<AnalysisCardVm[]>(() => {
    const src = this.fieldAnalysisApiSource;
    if (!src?.fieldStatistics) return [];

    const avg = src.fieldStatistics.avg;
    const data = src.fieldStatistics.data ?? [];
    const d0 = data[0];
    if (!avg && !d0) return [];

    const c = this.normalizePct(avg?.coverage ?? d0?.coverage);
    const cSs = this.normalizePct(
      avg?.coverageSignalStrength ??
        d0?.coverageSignalStrength ??
        avg?.coverageHigh ??
        d0?.coverageHigh,
    );
    const cSq = this.normalizePct(
      avg?.coverageSignalQuality ??
        d0?.coverageSignalQuality ??
        avg?.coverageQuality ??
        d0?.coverageQuality,
    );
    const sq =
      avg?.signalQualityAvg ??
      d0?.signalQualityAvg ??
      avg?.avgSinrDb ??
      d0?.avgSinrDb;
    const rsrp =
      avg?.signalStrengthAvg ??
      d0?.signalStrengthAvg ??
      avg?.rsrpAvg ??
      d0?.rsrpAvg ??
      avg?.avgRsrpDbm ??
      d0?.avgRsrpDbm;

    return [
      {
        title: '場域平均',
        accent: false,
        items: this.buildFieldAnalysisFiveItems({
          c,
          cSs,
          cSq,
          signalQualityAvg: sq,
          signalStrengthAvg: rsrp,
        }),
      },
    ];
  });

  /**
   * 各切面一張 card：API-only，僅 resultOutput.fieldStatistics.data，
   * 若為空則 fallback resultOutput.subfieldStatistics（皆為 API 資料）。
   */
  readonly fieldDetailCards = computed<AnalysisCardVm[]>(() => {
    const out = this.resultOutput;
    if (!out) return [];

    let subfields: any[] | undefined = out.fieldStatistics?.data;
    if (!Array.isArray(subfields) || subfields.length === 0) {
      subfields = out.subfieldStatistics;
    }
    if (!Array.isArray(subfields) || subfields.length === 0) return [];

    return subfields.map((sf: any) => {
      const zVal = sf.zValue;
      const title =
        zVal != null && zVal !== ''
          ? `切面高度 ${zVal} 公尺`
          : sf.ID != null && String(sf.ID).trim() !== ''
            ? `切面 ${sf.ID}`
            : '—';

      const c = this.normalizePct(sf.coverage);
      const cSs = this.normalizePct(sf.coverageSignalStrength ?? sf.coverageHigh);
      const cSq = this.normalizePct(sf.coverageSignalQuality ?? sf.coverageQuality);
      const sq = sf.signalQualityAvg;
      const rsrp = sf.signalStrengthAvg ?? sf.rsrpAvg;

      return {
        title,
        accent: true,
        items: this.buildFieldAnalysisFiveItems({
          c,
          cSs,
          cSq,
          signalQualityAvg: sq,
          signalStrengthAvg: rsrp,
        }),
      };
    });
  });

  private normalizePct(v: number | null | undefined): number | null {
    if (v == null || !Number.isFinite(v)) return null;
    return v <= 1 ? v * 100 : v;
  }

  // ===== [Phase 6] BS analysis（逐站效能；禁止 object panel 的 既有/建議規劃 群組字當站名） =====

  /** 不可作為基站分析 card title 的群組/分類字（非逐站名） */
  private isForbiddenBsAnalysisCardTitle(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    const block = new Set([
      '既有',
      '建議規劃',
      '建議',
      '候選',
      'default',
      'candidate',
      'planned',
      'existing',
    ]);
    const lower = t.toLowerCase();
    return block.has(t) || block.has(lower);
  }

  /** 舊 mock 名「既有基站-1」→ 與舊系示例一致的「既有基地1」 */
  private normalizeBsAnalysisSiteTitle(name: string): string {
    return name.replace(/^既有基站[\s\-]*(\d+)$/u, (_, n) => `既有基地${n}`);
  }

  /** MVP：用 existingComponents.bs 對齊 bsId，避免 bsName 被填成群組標籤 */
  private resolveMvpBsSiteTitleFromExisting(bsId: unknown): string | null {
    const mvp = this.resultService.resultMvp?.() as any;
    const id = bsId != null ? String(bsId).trim() : '';
    const list = mvp?.existingComponents?.bs;
    if (!id || !Array.isArray(list)) return null;
    const hit = list.find((r: any) => String(r?.id ?? '') === id);
    const nm = hit?.name != null ? String(hit.name).trim() : '';
    if (!nm || this.isForbiddenBsAnalysisCardTitle(nm)) return null;
    return this.normalizeBsAnalysisSiteTitle(nm);
  }

  /**
   * bsPerformance 單列 → 逐站顯示名（絕不把 type / default-candidate 當 title）
   */
  private resolveBsPerformanceRowSiteLabel(b: any, index: number): string {
    const fromExisting = this.resolveMvpBsSiteTitleFromExisting(b?.bsId);
    if (fromExisting) return fromExisting;

    for (const key of ['bsName', 'name'] as const) {
      const v = b?.[key];
      const s = v != null ? String(v).trim() : '';
      if (s && !this.isForbiddenBsAnalysisCardTitle(s)) return s;
    }

    return `既有基地${index + 1}`;
  }

  /** API-only：僅從 resultOutput 取逐站基站效能；無則回 [] */
  readonly bsTptList = computed((): BsTptRowVm[] => {
    const out = this.bsAnalysisApiSource;
    if (!out) return [];

    const raw =
      out.bsPerformanceList ??
      (Array.isArray(out.bsAnalysis) ? out.bsAnalysis : null) ??
      (Array.isArray(out.bsPerformance) ? out.bsPerformance : null);
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((b: any, i: number) => {
        const pick = (v: unknown) =>
          v != null && String(v).trim() !== '' ? String(v).trim() : '';
        let siteLabel =
          pick(b.siteLabel) || pick(b.bsName) || pick(b.name) || `基地台 ${i + 1}`;
        if (this.isForbiddenBsAnalysisCardTitle(siteLabel)) {
          siteLabel = `基地台 ${i + 1}`;
        }
        return {
          siteLabel,
          bsName: b.bsName ?? null,
          name: b.name ?? null,
          ueCount: this.asFiniteNumber(b.servedUe) ?? b.ueCount ?? 0,
          totalDl: b.dlTotalRateMbps != null ? `${b.dlTotalRateMbps} Mbps` : (b.totalDl ?? '—'),
          totalUl: b.ulTotalRateMbps != null ? `${b.ulTotalRateMbps} Mbps` : (b.totalUl ?? '—'),
          avgDl: b.dlAvgRateMbps != null ? `${b.dlAvgRateMbps} Mbps` : (b.avgDl ?? '—'),
          avgUl: b.ulAvgRateMbps != null ? `${b.ulAvgRateMbps} Mbps` : (b.avgUl ?? '—'),
        };
      });
    }

    const chosenBs = Array.isArray(out.chosenBsList?.defaultBs)
      ? out.chosenBsList.defaultBs
      : [];
    if (!chosenBs.length) return [];

    const perBsUe = Array.isArray(out.ueCon?.perBsUeConnection)
      ? out.ueCon.perBsUeConnection
      : [];
    const dlPerBs = Array.isArray(out.ueTpt?.dlTptIndividualBs)
      ? out.ueTpt.dlTptIndividualBs
      : [];
    const ulPerBs = Array.isArray(out.ueTpt?.ulTptIndividualBs)
      ? out.ueTpt.ulTptIndividualBs
      : [];

    const mappedRows: BsTptRowVm[] = chosenBs.map((bs: any, index: number) => {
      const id = this.asFiniteNumber(bs?.ID ?? bs?.id ?? bs?.bsID);
      const siteLabel = id != null ? `既有基地${Math.trunc(id)}` : `基地台 ${index + 1}`;

      const ueCount = this.asFiniteNumber(perBsUe[index]) ?? 0;
      const dlNum = this.asFiniteNumber(dlPerBs[index]);
      const ulNum = this.asFiniteNumber(ulPerBs[index]);

      const totalDl = dlNum != null ? `${dlNum} Mbps` : '—';
      const totalUl = ulNum != null ? `${ulNum} Mbps` : '—';
      const avgDl = ueCount > 0 && dlNum != null ? `${(dlNum / ueCount).toFixed(2)} Mbps` : '-';
      const avgUl = ueCount > 0 && ulNum != null ? `${(ulNum / ueCount).toFixed(2)} Mbps` : '-';

      return {
        siteLabel,
        bsName: bs?.bsName ?? bs?.name ?? null,
        name: bs?.name ?? bs?.bsName ?? null,
        ueCount,
        totalDl,
        totalUl,
        avgDl,
        avgUl,
      };
    });

    console.log('[API_ONLY][bs][fallback]', {
      chosenBs,
      perBsUe,
      dlPerBs,
      ulPerBs,
      mappedRows,
    });

    return mappedRows;
  });

  private sortBsTptRows(rows: BsTptRowVm[]): BsTptRowVm[] {
    return [...rows].sort((a, b) => {
      const getId = (label: string) => {
        const match = String(label).match(/(\d+)/);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
      };
      return getId(a.siteLabel) - getId(b.siteLabel);
    });
  }

  /** 從「xx Mbps」字串取出數值以便加總 */
  private parseMbpsNumeric(text: string | null | undefined): number {
    if (text == null || text === '' || text === '—') return 0;
    const m = String(text).match(/(-?[\d.]+(?:e[+-]?\d+)?)/i);
    return m ? Number(m[1]) || 0 : 0;
  }

  /** 基站分析卡片固定五欄（舊系效能分析血統） */
  private buildBsAnalysisFiveItems(args: {
    ue: string;
    totalDl: string;
    totalUl: string;
    avgDl: string;
    avgUl: string;
  }): { label: string; value: string }[] {
    return [
      { label: '服務行動終端數量', value: args.ue },
      { label: '服務行動終端總下行傳輸速率', value: args.totalDl },
      { label: '服務行動終端總上行傳輸速率', value: args.totalUl },
      { label: '服務行動終端平均下行傳輸速率', value: args.avgDl },
      { label: '服務行動終端平均上行傳輸速率', value: args.avgUl },
    ];
  }

  /** 第一張：場域總和；API-only，僅在 bsTptList 有資料時顯示 */
  readonly bsSummaryCards = computed<BsAnalysisCardVm[]>(() => {
    const list = this.bsTptList();
    if (!list.length) return [];

    let sumUe = 0;
    let sumDl = 0;
    let sumUl = 0;
    let hasDlData = false;
    let hasUlData = false;

    for (const r of list) {
      sumUe += Number(r.ueCount) || 0;
      if (r.totalDl && r.totalDl !== '—' && r.totalDl !== '-') {
        sumDl += this.parseMbpsNumeric(r.totalDl);
        hasDlData = true;
      }
      if (r.totalUl && r.totalUl !== '—' && r.totalUl !== '-') {
        sumUl += this.parseMbpsNumeric(r.totalUl);
        hasUlData = true;
      }
    }

    const totalDlText = hasDlData ? `${sumDl.toFixed(2)} Mbps` : '—';
    const totalUlText = hasUlData ? `${sumUl.toFixed(2)} Mbps` : '—';
    const avgDl = sumUe > 0 && hasDlData ? `${(sumDl / sumUe).toFixed(2)} Mbps` : '-';
    const avgUl = sumUe > 0 && hasUlData ? `${(sumUl / sumUe).toFixed(2)} Mbps` : '-';

    return [
      {
        title: '場域總和',
        accent: false,
        items: this.buildBsAnalysisFiveItems({
          ue: String(Math.trunc(sumUe)),
          totalDl: totalDlText,
          totalUl: totalUlText,
          avgDl,
          avgUl,
        }),
      },
    ];
  });

  /** 各基站一張 card（API-only，禁止群組 title） */
  readonly bsDetailCards = computed<BsAnalysisCardVm[]>(() => {
    const list = this.sortBsTptRows(this.bsTptList());
    return list.map((row, i) => {
      const pick = (v: unknown) =>
        v != null && String(v).trim() !== '' ? String(v).trim() : '';
      let title =
        pick(row.siteLabel) || pick(row.bsName) || pick(row.name) || `基地台 ${i + 1}`;
      if (this.isForbiddenBsAnalysisCardTitle(title)) {
        title = `基地台 ${i + 1}`;
      }
      return {
        title,
        accent: true,
        items: this.buildBsAnalysisFiveItems({
          ue: String(row.ueCount),
          totalDl: row.totalDl ?? '—',
          totalUl: row.totalUl ?? '—',
          avgDl: row.avgDl ?? '—',
          avgUl: row.avgUl ?? '—',
        }),
      };
    });
  });

  readonly hasBsAnalysisData = computed<boolean>(() => {
    return this.bsSummaryCards().length > 0 || this.bsDetailCards().length > 0;
  });

  // ===== [Phase 6] UE analysis (from resultMvp.analysis.ueAnalysis | legacy) =====
  readonly hasUeAnalysisData = computed<boolean>(() => {
    return (
      this.ueCoverageValue() !== '—' ||
      this.ueAverageSinrValue() !== '—' ||
      this.ueAverageRsrpValue() !== '—'
    );
  });

  hasUe(): boolean {
    const coords = this.parsePipeCoordinateText(this.objectInput()?.ueCoordinate);
    return Array.isArray(coords) && coords.length > 0;
  }

  ueCoverageValue(): string {
    const out = this.ueAnalysisApiSource;
    if (!out) return '—';
    const v = this.asFiniteNumber(out.ueCoverage);
    return v != null ? this.formatPct(v) : '—';
  }

  ueAverageSinrValue(): string {
    const out = this.ueAnalysisApiSource;
    if (!out) return '—';
    const v = this.asFiniteNumber(out.ueAverageSinr);
    return v != null ? this.formatDb(v, 'dB') : '—';
  }

  ueAverageRsrpValue(): string {
    const out = this.ueAnalysisApiSource;
    if (!out) return '—';
    const v = this.asFiniteNumber(out.ueAverageRsrp);
    return v != null ? this.formatDb(v, 'dBm') : '—';
  }

  // ===== [Phase 4-4] Observe / subfield: zh-TW labels + summary/detail layout + stable sort =====
  readonly observeHasSubfields = computed<boolean>(() => {
    return (this.analysisSubfieldsSignal()?.length ?? 0) > 0;
  });

  readonly subfieldAnalysisVms = computed<SubfieldAnalysisVm[]>(() => {
    const result = (this.resultService.result?.() as any) ?? null;
    const analysisSubfields = this.analysisSubfieldsSignal();

    // Resolve subfieldStatistics from all known result shapes.
    const rawStats: any =
      result?.['5GOutput']?.subfieldStatistics ??
      result?.output?.subfieldStatistics ??
      result?.subfieldStatistics ??
      null;
    const stats: any[] = Array.isArray(rawStats) ? rawStats : [];

    console.log('[OBS_DEBUG]', {
      result,
      stats,
      analysisSubfields,
      matched: analysisSubfields.map((s: any) => ({
        subfieldID: s.subfieldID,
        stat: stats.find((st: any) =>
          st.subfieldID === s.subfieldID ||
          st.subfieldId === s.subfieldID ||
          st.ID === s.subfieldID ||
          st.id === s.subfieldID
        ) ?? null,
      })),
    });

    // Merge resolved stats into a synthetic output the builder can consume.
    const syntheticOutput: any = result != null
      ? { ...(this.resultOutput ?? {}), subfieldStatistics: stats }
      : null;

    const raw = buildSubfieldAnalysisVms(analysisSubfields, syntheticOutput);
    return raw.map((vm) => finalizeSubfieldAnalysisVm(vm));
  });

  readonly observationAreaCounts = computed<ObservationAreaCountsVm>(() =>
    buildObservationAreaCounts(this.subfieldAnalysisVms()),
  );

  readonly observationAreaSummaryLine = computed<string>(() =>
    formatObservationAreaCountsLine(this.observationAreaCounts()),
  );

  readonly observationAreaSectionHint = computed<string | null>(() =>
    resolveObservationAreaSectionHint(this.observationAreaCounts()),
  );

  readonly subfieldObservationCards = computed<SubfieldObservationCardVm[]>(() => {
    return this.subfieldAnalysisVms().map((vm) => ({
      title: vm.title,
      status: vm.status,
      statusLabel: observationCardStatusLabel(vm.status),
      cardClass: observationCardModifierClass(vm.status),
      badgeClass: observationBadgeModifierClass(vm.status),
      emptyHint: observationPerCardEmptyHint(vm.status),
      items: [
        { label: '\u8986\u84cb\u7387', value: this.formatPct(vm.coverage ?? null) },
        { label: '\u5e73\u5747 SINR', value: this.formatDb(vm.avgSinr, 'dB') },
        { label: '\u5e73\u5747 RSRP', value: this.formatDb(vm.avgRsrp, 'dBm') },
        { label: '\u4e0b\u884c\u901f\u7387', value: this.formatMbps(vm.avgDlThroughput) },
        { label: '\u4e0a\u884c\u901f\u7387', value: this.formatMbps(vm.avgUlThroughput) },
      ] as AnalysisInfoItem[],
    }));
  });

  // ===== [Phase 2] Stats source resolver =====
  resolveStatsProtocol(data: any): StatsProtocol {
    if (!data) return '5G';
    const p = data.showProtocol ?? data.protocol;
    if (p === 'Wi-Fi' || p === 'WiFi') return 'Wi-Fi';
    return '5G';
  }

  private resolveLegacyStatsSource(): any {
    const out = this.resultOutput;
    if (!out) return null;
    if (out.layeredModulationCount && out.layeredSignalLevelCount) return out;
    return null;
  }

  /** API-only：僅 resolveLegacyStatsSource，不 fallback statsDebugMockResult */
  getActiveStatsSource(): any {
    return this.resolveLegacyStatsSource() ?? null;
  }

  hasUeCoordinate(data: any): boolean {
    if (!data) return false;
    const uc = data.ueCoordinate;
    if (Array.isArray(uc)) return true;
    if (typeof uc === 'string' && uc.trim() !== '') return true;
    return false;
  }

  // ===== [Phase 2] Stats chart data builders =====
  private parseZValues(data: any): number[] {
    const raw = data?.layeredCoverage ?? data?.layeredAverageSinr;
    if (Array.isArray(raw)) {
      return raw.map((v: any) => {
        const n = typeof v === 'string' ? parseFloat(v) : Number(v);
        return Number.isFinite(n) ? n : 0;
      });
    }
    return [0];
  }

  private transposeLegacyLayeredMatrix(matrix: number[][]): number[][] {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];
    const rows = matrix.length;
    const cols = Math.max(...matrix.map((r: number[]) => (Array.isArray(r) ? r.length : 0)));
    const out: number[][] = [];
    for (let j = 0; j < cols; j++) {
      const row: number[] = [];
      for (let i = 0; i < rows; i++) {
        row.push(Number(matrix[i]?.[j]) || 0);
      }
      out.push(row);
    }
    return out;
  }

  private normalizeRowsToPercent(rows: number[][]): number[][] {
    return rows.map(row => {
      const sum = row.reduce((a, b) => a + b, 0);
      if (sum <= 0) return row.map(() => 0);
      return row.map(v => (v / sum) * 100);
    });
  }

  private buildCdfRows(rows: number[][]): number[][] {
    return rows.map(row => {
      const cdf: number[] = [];
      let acc = 0;
      for (const v of row) {
        acc += v;
        cdf.push(acc);
      }
      return cdf;
    });
  }

  private resolveModulationLabels(_protocol: StatsProtocol): string[] {
    return ['QPSK', '16-QAM', '64-QAM', '256-QAM'];
  }

  private resolveSignalLevelLabels(_protocol: StatsProtocol): string[] {
    return ['0', '1', '2', '3', '4', '5'];
  }

  private resolveLayerTraceNames(zValues: number[]): string[] {
    return zValues.map((z, i) => `z=${z} m`);
  }

  private buildFieldChartData(
    data: any,
    metric: 'modulation' | 'sinr',
    protocol: StatsProtocol
  ): { bar: { labels: string[]; rows: number[][]; traceNames: string[] }; cdf: { labels: string[]; rows: number[][]; traceNames: string[] } } {
    const zValues = this.parseZValues(data);
    const raw = metric === 'modulation' ? data?.layeredModulationCount : data?.layeredSignalLevelCount;
    const matrix = Array.isArray(raw) ? raw : [];
    const transposed = this.transposeLegacyLayeredMatrix(matrix);
    const normBar = this.normalizeRowsToPercent(transposed);
    const cdfRows = this.buildCdfRows(normBar);
    const labels = metric === 'modulation' ? this.resolveModulationLabels(protocol) : this.resolveSignalLevelLabels(protocol);
    const traceNames = this.resolveLayerTraceNames(zValues);
    const actualLabels = labels.slice(0, normBar[0]?.length ?? 0).length > 0 ? labels.slice(0, normBar[0].length) : labels;
    return {
      bar: { labels: actualLabels, rows: normBar, traceNames },
      cdf: { labels: actualLabels, rows: cdfRows, traceNames },
    };
  }

  private normalizeArrayToPercent(arr: number[]): number[] {
    const a = Array.isArray(arr) ? arr.map(Number) : [];
    const sum = a.reduce((x, y) => x + y, 0);
    if (sum <= 0) return a.map(() => 0);
    return a.map(v => (v / sum) * 100);
  }

  private buildCdfArray(arr: number[]): number[] {
    const cdf: number[] = [];
    let acc = 0;
    for (const v of arr) {
      acc += v;
      cdf.push(acc);
    }
    return cdf;
  }

  private buildUeChartData(data: any, metric: 'modulation' | 'sinr', _protocol: StatsProtocol): { bar: { labels: string[]; values: number[] }; cdf: { labels: string[]; values: number[] } } {
    const raw = metric === 'modulation' ? data?.ueModulationCount : data?.ueSignalLevelCount;
    const arr = Array.isArray(raw) ? raw : [];
    const norm = this.normalizeArrayToPercent(arr);
    const cdf = this.buildCdfArray(norm);
    const labels = metric === 'modulation' ? this.resolveModulationLabels(_protocol) : this.resolveSignalLevelLabels(_protocol);
    const actualLabels = labels.slice(0, norm.length);
    return { bar: { labels: actualLabels, values: norm }, cdf: { labels: actualLabels, values: cdf } };
  }

  // ===== [Phase 2] Traces builders =====
  private buildFieldBarTraces(chartData: { labels: string[]; rows: number[][]; traceNames: string[] }, colors: string[]): any[] {
    const traces: any[] = [];
    const labels = chartData.labels;
    chartData.rows.forEach((row, zi) => {
      traces.push({
        x: labels,
        y: row,
        type: 'bar',
        name: chartData.traceNames[zi] ?? `Layer ${zi}`,
        marker: { color: colors[zi % colors.length] },
      });
    });
    return traces;
  }

  private buildFieldCdfTraces(chartData: { labels: string[]; rows: number[][]; traceNames: string[] }, colors: string[]): any[] {
    const traces: any[] = [];
    const labels = chartData.labels;
    chartData.rows.forEach((row, zi) => {
      traces.push({
        x: labels,
        y: row,
        type: 'scatter',
        mode: 'lines+markers',
        name: chartData.traceNames[zi] ?? `Layer ${zi}`,
        line: { color: colors[zi % colors.length] },
      });
    });
    return traces;
  }

  private buildUeBarTraces(chartData: { labels: string[]; values: number[] }): any[] {
    return [{
      x: chartData.labels,
      y: chartData.values,
      type: 'bar',
      name: 'UE',
      marker: { color: '#3b82f6' },
    }];
  }

  private buildUeCdfTraces(chartData: { labels: string[]; values: number[] }): any[] {
    return [{
      x: chartData.labels,
      y: chartData.values,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'UE',
      line: { color: '#3b82f6' },
    }];
  }

  // ===== [Phase 2] Render methods =====
  private getStatsChartTextConfig(metric: 'modulation' | 'sinr'): StatsChartTextConfig {
    if (metric === 'modulation') {
      return { barTitle: '調變分佈', cdfTitle: '調變 CDF', xAxisTitle: '調變方式', barYAxisTitle: '%', cdfYAxisTitle: 'CDF %' };
    }
    return { barTitle: 'SINR 分佈', cdfTitle: 'SINR CDF', xAxisTitle: 'SINR 等級', barYAxisTitle: '%', cdfYAxisTitle: 'CDF %' };
  }

  private readonly PLOTLY_DARK_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(255,255,255,0.05)',
    font: { color: '#e6e6e6', size: 11 },
    xaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)' },
    yaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)', range: [0, 100] },
    margin: { t: 24, r: 24, b: 40, l: 48 },
    showlegend: true,
  };

  private purgeChartIfExists(hostId: string): void {
    const el = document.getElementById(hostId);
    if (el && typeof (Plotly as any)?.purge === 'function') {
      (Plotly as any).purge(el);
    }
  }

  private renderBarChart(hostId: string, traces: any[], config: StatsChartTextConfig): void {
    const el = document.getElementById(hostId);
    if (!el || typeof (Plotly as any)?.newPlot !== 'function') return;
    const layout = {
      ...this.PLOTLY_DARK_LAYOUT,
      title: { text: config.barTitle, font: { size: 12 } },
      xaxis: { ...this.PLOTLY_DARK_LAYOUT.xaxis, title: config.xAxisTitle },
      yaxis: { ...this.PLOTLY_DARK_LAYOUT.yaxis, title: config.barYAxisTitle },
    };
    (Plotly as any).newPlot(el, traces, layout, { responsive: true, displayModeBar: false });
  }

  private renderCdfChart(hostId: string, traces: any[], config: StatsChartTextConfig): void {
    const el = document.getElementById(hostId);
    if (!el || typeof (Plotly as any)?.newPlot !== 'function') return;
    const layout = {
      ...this.PLOTLY_DARK_LAYOUT,
      title: { text: config.cdfTitle, font: { size: 12 } },
      xaxis: { ...this.PLOTLY_DARK_LAYOUT.xaxis, title: config.xAxisTitle },
      yaxis: { ...this.PLOTLY_DARK_LAYOUT.yaxis, title: config.cdfYAxisTitle },
    };
    (Plotly as any).newPlot(el, traces, layout, { responsive: true, displayModeBar: false });
  }

  private renderFieldCharts(metric: 'modulation' | 'sinr', data: any): void {
    const protocol = this.resolveStatsProtocol(data);
    const cfg = this.getStatsChartTextConfig(metric);
    const { bar, cdf } = this.buildFieldChartData(data, metric, protocol);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    const barTraces = this.buildFieldBarTraces(bar, colors);
    const cdfTraces = this.buildFieldCdfTraces(cdf, colors);
    this.purgeChartIfExists('field_bar_chart');
    this.purgeChartIfExists('field_cdf_chart');
    this.renderBarChart('field_bar_chart', barTraces, cfg);
    this.renderCdfChart('field_cdf_chart', cdfTraces, cfg);
  }

  private renderUeCharts(metric: 'modulation' | 'sinr', data: any): void {
    const protocol = this.resolveStatsProtocol(data);
    const cfg = this.getStatsChartTextConfig(metric);
    const { bar, cdf } = this.buildUeChartData(data, metric, protocol);
    this.purgeChartIfExists('ue_bar_chart');
    this.purgeChartIfExists('ue_cdf_chart');
    this.renderBarChart('ue_bar_chart', this.buildUeBarTraces(bar), cfg);
    this.renderCdfChart('ue_cdf_chart', this.buildUeCdfTraces(cdf), cfg);
  }

  refreshAllCharts(metric: 'modulation' | 'sinr', data: any): void {
    if (!data) {
      this.purgeChartIfExists('field_bar_chart');
      this.purgeChartIfExists('field_cdf_chart');
      this.purgeChartIfExists('ue_bar_chart');
      this.purgeChartIfExists('ue_cdf_chart');
      return;
    }
    this.renderFieldCharts(metric, data);
    if (this.hasUeCoordinate(data)) {
      this.renderUeCharts(metric, data);
    }
  }

  // ===== [Phase 2] Render scheduling =====
  private isChartHostReady(): boolean {
    return !!document.getElementById('field_bar_chart');
  }

  private scheduleStatsRender(metric: 'modulation' | 'sinr', data: any, retries = 0): void {
    const maxRetries = 20;
    if (this.isChartHostReady()) {
      this.refreshAllCharts(metric, data);
      return;
    }
    if (retries < maxRetries) {
      requestAnimationFrame(() => this.scheduleStatsRender(metric, data, retries + 1));
    }
  }
}

