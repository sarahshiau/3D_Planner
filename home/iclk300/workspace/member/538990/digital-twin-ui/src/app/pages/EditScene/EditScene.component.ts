// EditScene.component.ts
// 其餘你既有邏輯（Leaflet、MapPreview、StageB runtime）保持不動。

import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  OnInit,
  effect, inject,
  isDevMode,
  signal,
  computed
} from '@angular/core';

import { Router } from '@angular/router';

import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  HemisphericLight,
  Vector3,
  SceneLoader,
  AbstractMesh,
  Color4,
  Viewport,
  TransformNode,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  PBRMaterial,
  FreeCameraMouseInput,
  Color3,
  FreeCamera,
  Camera,
  PointerEventTypes,
  Matrix,
  GizmoManager,
  DynamicTexture,
  Ray,
  Texture,
  Material,
  VertexBuffer,
  PointerDragBehavior,
} from '@babylonjs/core';

import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';

import '@babylonjs/loaders/glTF';
import { GLTF2Export } from '@babylonjs/serializers/glTF';
import earcut from 'earcut';

import { CreateGreasedLine } from '@babylonjs/core/Meshes/Builders/greasedLineBuilder';

import * as L from 'leaflet';
import * as Plotly from 'plotly.js-dist-min';

import { MapPreviewService } from '../../services/map-preview.service';
import { Renderer2 } from '@angular/core';
import { MapCoordinateService } from 'src/app/services/map-coordinate.service';
import { ProjectDraftService } from 'src/app/services/project-draft.service';
import { CommittedMapData } from 'src/app/models/committed-map-data.model';
import { ResultDataService, ResultApiResponse, ResultMvpData } from 'src/app/services/result-data.service';
import { createMapPin } from 'src/app/utils/map-pin.util';
import { sceneToMath, mathToScene } from 'src/app/utils/field-coordinate.util';
import { FieldDomainStoreService } from 'src/app/services/field-domain-store.service';
import {
  ObstacleFieldRow,
  ZoneFieldRow,
  ObserveFieldRow,
  FieldDomainState,
  FieldRowBase,
  ExistingBsFieldRow,
  IntelligentPanelFieldRow,
  CandidateBsFieldRow,
  CandidateRisFieldRow,
  UeFieldRow,
} from 'src/app/models/field-domain.model';
import { Subscription, firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { HttpClient } from '@angular/common/http';

// ===== [SIM_API_PHASE1] Imports =====
import { BaseTaskPayloadBuilder } from 'src/app/builders/base-task-payload.builder';
import { serializeSubfieldPayloadRows } from 'src/app/builders/subfield-payload.serializer';
import { TaskApiService } from 'src/app/services/task-api.service';
import { SimulationApiService } from 'src/app/services/simulation-api.service';
import { ResultApiService } from 'src/app/services/result-api.service';
import { AlertService } from 'src/app/services/alert.service';
import { BaseTaskPayloadBuilderInput } from 'src/app/models/task-payload.model';
import { TASK_PAYLOAD_MOCK_DEFAULTS } from 'src/app/mocks/task-payload.mock';
import { EditTaskPanelComponent } from './components/panels/edit-task-panel/edit-task-panel.component';
import {
  EditFieldPanelComponent,
  FieldCardSelectPayload,
} from './components/panels/edit-field-panel/edit-field-panel.component';
import { AntennaService } from 'src/app/services/antenna.service';
import { AntennaApiDto } from 'src/app/models/antenna/antenna.api.dto';
import {
  toBsSourceRows,
  serializeBsPositionsToLegacy,
  serializeBsAntennaToLegacy,
  buildBsListDefaultBsFromRows,
} from 'src/app/builders/bs-legacy-serializer';
import { getExistingBsFieldDefaults } from 'src/app/models/existing-bs-defaults.helper';

import { ViewFilters } from './components/banner/banner.component';

// 你原本的型別（此處維持）
export type RightPanelType = 'file' | 'task' | 'field' | null;
// 用途：左側工具（Edit + Result 共用同一個 leftToolType 來切換 panel）
export type LeftToolType =
  // ===== Result Mode =====
  | 'existing'
  | 'coverage'
  | 'bsPerf'
  | 'uePerf'
  | 'charts'
  // ===== Edit Mode =====
  | 'primitive'
  | 'marker'
  | 'antenna'
  | 'ris'
  | 'model'
  | 'landscape'
  | 'terminal'
  | 'observe'
  | 'zone'
  | null;

type DistributionMode = 'rsrp' | 'sinr' | 'ul_rate' | 'dl_rate' | 'coverage';
type CoverageFilter = 'rsrp_minus_120' | 'rsrp_minus_90' | 'sinr_15';

/** Phase 8: per-mode heatmap PNG + hover snapshot (keyed by buildHeatmapCacheKey) */
type CachedHeatmapRender = {
  /** Full PNG data URL from exportPlotlyToPngDataUrl */
  imageBase64: string;
  hoverZ: (number | null)[][];
  hoverMeta: any;
  unit: string;
  mode: DistributionMode;
  cellSize: number;
  sliceY: number;
  coverageThreshold?: string;
  dynamicRange?: { min: number; max: number };
};
type PlanningModeType = 'current' | 'whole' | 'ue' | 'area';
type GoalMode = 'planning' | 'simulation';

type ContextMenuKind =
  | 'obstacle'
  | 'existingBs'
  | 'ris'
  | 'ue'
  | 'observe'
  | 'zone';

type ContextMenuItem = {
  id: string;
  label: string;
};

type ContextMenuResolvedTarget = {
  rowId: string | null;
  kind: ContextMenuKind | null;
  seq: number | null;
  displayId: string;
  isBuildingObstacle?: boolean;
  row?: any | null;
};

type ObstacleRowResolveSource = 'fieldRowId' | 'registry' | 'osmId' | 'none';

/** 場域設定統一狀態（simulation payload 唯一來源；New Project 僅提供初始值） */
export type EditSceneFieldSettingsState = {
  projectName: string;
  networkType: '4G' | '5G';
  band: string;
  fieldMapSource: 'gis' | 'glb';
  length: number;
  width: number;
  height: number;
  cutHeights: [string, string, string];
  heatmapGrid: string;
  rsrpThreshold: number;
  sinrThreshold: number;
};

export type CommittedMapMeta = {
  bbox: { south: number; west: number; north: number; east: number };
  widthMeters: number;
  heightMeters: number;
  altitudeMeters: number;
  centerLatitude: number;
  centerLongitude: number;
};

const SIMULATION_SEED_FALLBACK = {
  objectiveIndex: 1,
  coverageRatio: 0.95,
  ueCoverageRatio: 0.95,
  sinrRatio: 5,
  throughputRatio: 5,
  ueAvgSinrRatio: 16,
  ueAvgThroughputRatio: 100,
  ueTpByDistanceRatio: 100,
  ueTpByRsrpRatio: 100,
  rsrpThreshold: -90,
  sinrThreshold: 15,
  rssiThreshold: -70,
  snrThreshold: 20,
  maxConnectionNum: 75,
  powerMinRange: 10,
  powerMaxRange: 24,
  tddFrameRatio: 70,
  mctsC: 1.2,
  mctsMimo: 2,
  mctsTemperature: 300,
  mctsTestTime: 300,
  mctsTime: 30,
  mctsTotalTime: 500,
  lteBand: 'n79',
  duplex: 'tdd',
  pathLossModelId: 12,
  useUeCoordinate: 1,
  resolution: 1,
};

const SIMULATION_REFERENCE_SEED = {
  addFixedBsNumber: 0,
  availableNewBsNumber: 2,
  availableNewRisNumber: 0,
  bandwidth: '[100,100]',
  bandwidthList: '[100,100]',
  beamId: '[,]',
  beamMaxId: 0,
  beamMinId: 0,
  bsNoiseFigure: '[0,0]',
  bsSetting: {
    isDAS: false,
    txPowerRange: [10, 24],
    powerUnit: 'dbm',
    txGain: 0,
    bsEnergy: 0,
    bsCost: 0,
    noiseFigure: 0,
    scalingFactor: 1,
    duplex: {
      isTdd: true,
      isFdd: false,
      tddParam: {
        frameRatio: 70,
        dl: { frequency: 4850, bandwidth: 10, scs: 15, mcsTable: '256QAM-table', mimo: 1 },
        ul: { frequency: 4850, bandwidth: 10, scs: 15, mcsTable: '64QAM-table', mimo: 1 },
      },
      fddParam: {
        dl: { frequency: 4900, bandwidth: 10, scs: 15, mcsTable: '256QAM-table', mimo: 1 },
        ul: { frequency: 4700, bandwidth: 10, scs: 15, mcsTable: '64QAM-table', mimo: 1 },
      },
    },
  },
  candidateBs: '',
  candidateBsAnt: '',
  candidateRis: null,
  candidateRisList: [],
  coverageRatio: 0.95,
  defaultRis: null,
  dlBandwidth: '[]',
  dlFrequency: '[]',
  dlMcsTable: '[256QAM-table,256QAM-table]',
  dlMimoLayer: '[1,1]',
  dlScs: '[]',
  duplex: 'tdd',
  evaluationFunc: {
    field: {
      sinr: { activate: false, ratio: [] },
      rsrp: { activate: false, ratio: [] },
      coverage: { activate: false, ratio: null },
      throughput: { activate: false, ratio: [] },
      subfield: [],
    },
    ue: {
      sinr: { activate: false, ratio: [] },
      coverage: { activate: false, ratio: null },
      throughput: { activate: false, ratio: [] },
      throughputByDistance: { activate: false, ratio: [] },
      throughputByRsrp: { activate: false, ratio: [] },
    },
    subfield: [],
  },
  field: {
    defaultPathLossModel: { '5g': 12, wifi: -1 },
    regionalDivision: [
      {
        regionID: 1,
        color: 'hsl(55,54%,40%)',
        pathLossModel: { ID: 1 },
        shape: {
          ID: 0,
          vertices: [[1.6, 18.4], [1.6, 19.4], [2.6, 19.4], [2.6, 18.4]],
          radius: 0,
          rotateAngle: 0,
          rotateCenter: [2.1, 18.9],
        },
      },
    ],
  },
  frequency: '[4850,4850]',
  frequencyList: '[4850,4850]',
  geographicalNorth: 0,
  guardInterval: '',
  isAverageSinr: false,
  isAvgThroughput: false,
  isBsNumberOptimization: false,
  isCoverage: false,
  isRisNumberOptimization: false,
  isSimulation: true,
  isUeAvgSinr: false,
  isUeAvgThroughput: false,
  isUeCoverage: false,
  isUeTpByDistance: false,
  isUeTpByRsrp: false,
  lteBand: 'n79',
  mapProtocol: '5G',
  maxConnectionNum: 75,
  mctsC: 1.2,
  mctsMimo: 2,
  mctsTemperature: 300,
  mctsTestTime: 300,
  mctsTime: 30,
  mctsTotalTime: 500,
  mimoNumber: '[]',
  objectiveIndex: 1,
  optInfo: {},
  pathLossModelId: 12,
  powerMaxRange: 24,
  powerMinRange: 10,
  resolution: 1,
  ris: [],
  risList: { defaultRis: [], candidateRis: [] },
  rsrpThreshold: -90,
  rssiThreshold: -70,
  scalingFactor: 1,
  scs: '[30,30]',
  sinrRatio: 5,
  sinrThreshold: 15,
  snrThreshold: 20,
  taskName: '78館304_期末',
  tddFrameRatio: 70,
  throughputRatio: 5,
  txPower: '[24,24]',
  ueAvgSinrRatio: 16,
  ueAvgThroughputRatio: 100,
  ueCoverageRatio: 0.95,
  ueRsrp: null,
  ueSignallevel: null,
  ueSinr: null,
  ueTpByDistanceRatio: 100,
  ueTpByRsrpRatio: 100,
  ulBandwidth: '[]',
  ulFrequency: '[]',
  ulMcsTable: '[64QAM-table,64QAM-table]',
  ulMimoLayer: '[1,1]',
  ulScs: '[]',
  useUeCoordinate: 1,
  wifiBand: '',
  wifiMimo: '',
  wifiProtocol: '',
};

interface PlanningModeCommittedEvent {
  fromPlanningMode: PlanningModeType;
  toPlanningMode: PlanningModeType;
  fromGoalMode: GoalMode;
  toGoalMode: GoalMode;
}

// ===== [A-FINAL][STEP1][RESULT-MVP-MOCK] =====
const RESULT_MVP_MOCK: ResultMvpData = {
  meta: {
    projectName: '工業技術研究院 中興院區',
    createdAt: '2026-01-11 15:30:45',
    siteSizeM: { length: 50, width: 30, height: 3.5 },
    sliceHeightM: 1.05,
    maxUePerTx: 32,
    gridM: { x: 0.5, y: 0.5 },
    pathLoss: {
      name: '3GPP TR 38.901 Indoor Open Office',
      formula: 'PL = 32.4 + 17.3 log10(d) + 20 log10(fc)',
    },
    goal: {
      title: '全場域 RSRP >= -95 dBm 且 覆蓋率達 95%',
      thresholdCoveragePct: 95,
      // siteMeta.actualResult.coverage = 0.972 -> 97.2%
      resultCoveragePct: 97.2,
      passed: true,
    },
  },

  bsSubmission: {
    networkType: '5G NR',
    band: 'n79',
    duplex: 'TDD',
    installableCount: 5,
    existingCount: 2,
    powerRangeDbm: { min: 15, max: 30 },
  },

  risSubmission: {
    existingCount: 1,
  },

  // 新假資料只有 count，這裡用占位資料補出清單（避免 UI 出現空）
  existingComponents: {
    bs: [
      { id: 'BS-001', name: '既有基站-1' },
      { id: 'BS-002', name: '既有基站-2' },
    ],
    ris: [{ id: 'RIS-001', name: '既有RIS-1' }],
  },

  analysis: {
    // coverageAnalysis: avgSignalStrength=-82.6, avgSignalQuality=19.4
    // coverage_rsrp_120=0.998 -> 99.8%
    overallCoverage: {
      coveragePct: 99.8,
      avgRsrpDbm: -82.6,
      avgSinrDb: 19.4,
    },

    // 由 output.bsPerformanceList 映射，並補齊 Phase4-3 的 9 欄位（功率/頻率/SCS/頻寬/調變/層數）
    bsPerformance: [
      {
        bsId: 'BS-001',
        bsName: '既有',
        servedUe: 18,
        avgThroughputMbps: 47.25,

        txPowerDbm: 23,
        centerFreqMhz: 4900,
        scsKhz: 30,
        bandwidthMhz: 100,
        ulModulation: '64QAM',
        dlModulation: '256QAM',
        ulLayers: 2,
        dlLayers: 4,

        dlTotalRateMbps: 850.5,
        ulTotalRateMbps: 210.3,
        dlAvgRateMbps: 47.25,
        ulAvgRateMbps: 11.68,
      },
      {
        bsId: 'BS-101',
        bsName: '建議規劃',
        servedUe: 14,
        avgThroughputMbps: 44.3,

        txPowerDbm: 27,
        centerFreqMhz: 4900,
        scsKhz: 30,
        bandwidthMhz: 100,
        ulModulation: '64QAM',
        dlModulation: '256QAM',
        ulLayers: 2,
        dlLayers: 4,

        dlTotalRateMbps: 620.2,
        ulTotalRateMbps: 180.5,
        dlAvgRateMbps: 44.3,
        ulAvgRateMbps: 12.89,
      },
    ],

    // uePerformance.ueCoverage = 0.945 -> 94.5%
    // 你目前系統需要 totalUe/coveredUe/avgThroughputMbps，我用 servedUe 總和當作 totalUe 的 MVP 近似
    ueAnalysis: {
      totalUe: 32,
      coveredUe: Math.round(32 * 0.945), // ≈ 30
      coveragePct: 94.5,
      avgThroughputMbps: 95.4,
    },

    // 用途：結果頁「統計資訊」四張圖（Modulation/Strength + CDF）與 RSRP 分布假資料
  charts: [
    // (1) 場域 Modulation 統計（Bar）
    {
      id: 'modulation_hist',
      title: '場域Modulation統計',
      type: 'bar',
      unit: '%',
      data: [
        { label: 'QPSK', value: 0 },
        { label: '16-QAM', value: 0 },
        { label: '64-QAM', value: 0 },
        { label: '256-QAM', value: 100 },
      ],
    },

    // (2) 場域 Modulation CDF（Line）
    {
      id: 'modulation_cdf',
      title: '場域Modulation CDF圖',
      type: 'line',
      unit: '%',
      data: [
        { label: 'QPSK', value: 0 },
        { label: '16-QAM', value: 0 },
        { label: '64-QAM', value: 0 },
        { label: '256-QAM', value: 100 },
      ],
    },

    // (3) 場域訊號強度統計（Bar）
    {
      id: 'strength_hist',
      title: '場域訊號強度統計',
      type: 'bar',
      unit: '%',
      data: [
        { label: '0', value: 0 },
        { label: '1', value: 0 },
        { label: '2', value: 0 },
        { label: '3', value: 21.67 },
        { label: '4', value: 76.97 },
        { label: '5', value: 1.36 },
      ],
    },

    // (4) 場域訊號強度 CDF（Line）
    {
      id: 'strength_cdf',
      title: '場域訊號強度CDF圖',
      type: 'line',
      unit: '%',
      data: [
        { label: '0', value: 0 },
        { label: '1', value: 0 },
        { label: '2', value: 0 },
        { label: '3', value: 21.67 },
        { label: '4', value: 98.64 },
        { label: '5', value: 100 },
      ],
    },

    // （保留）你原本 already 有的 RSRP 分布
    {
      id: 'rsrpDistribution',
      title: 'RSRP 分布',
      type: 'bar',
      unit: '%',
      data: [
        { label: '-80 ~ -70 dBm', value: 35 },
        { label: '-90 ~ -80 dBm', value: 45 },
        { label: '-100 ~ -90 dBm', value: 15 },
        { label: '< -100 dBm', value: 5 },
      ],
    },
  ],
  },
};

// ===== [A-FINAL][STEP1][RESULT-API-MOCK] =====
const RESULT_API_MOCK: ResultApiResponse = {
  taskId: 'task_2026_01',
  taskName: '新系統測試專案',
  output: {
    evaluationResult: {
      field: { coverage: 0.9916, sinr: 23.596, rsrp: -94.561, dlThroughput: 1200 },
    },
    chosenBsList: {
      defaultBs: [],
      candidateBs: [],
    },
    subfieldStatistics: [
      {
        ID: '1.05 公尺',
        coverage: 0.9916,
        coverageHigh: 0.3571,
        coverageQuality: 0.7969,
        signalQualityAvg: 23.596,
        rsrpAvg: -94.561,
      },
    ],
  },
};

type AntennaLabelVM = {
  id: number;
  ownerUniqueId: number;
  antennaNo: number;
  title: string;
  worldOffsetY: number;
  anchorWorldX: number;
  anchorWorldY: number;
  anchorWorldZ: number;
  anchorScreenX: number | null;
  anchorScreenY: number | null;
  screenX: number | null;
  screenY: number | null;
  cardOffsetPxX: number;
  cardOffsetPxY: number;
  stemHeightPx: number | null;
  isHovered: boolean;
  visible: boolean;
};

type UiKind = 'antenna' | 'ris' | 'terminal' | 'basic' | 'building';

type UiMeta = {
  kind: UiKind;
  seq?: number;
  title: string;
  subtitle?: string;
  pickable: true;
};

type InteractiveCardVM = {
  ownerUniqueId: number;
  kind: UiKind;
  title: string;
  subtitle?: string;
  worldOffsetY: number;
  anchorScreenX: number | null;
  anchorScreenY: number | null;
  screenX: number | null;
  screenY: number | null;
  cardW: number;
  cardH: number;
  stemHeightPx: number | null;
  visible: boolean;
  isPinned: boolean;
  isHovered: boolean;
};

// ========== [Step2A][Registry] Scene Object Registry Types ==========
/**
 * Registry categories for different scene object types
 */
export type RegistryCategory =
  | 'existingBs'
  | 'intelligentPanel'
  | 'candidateBs'
  | 'candidateRis'
  | 'ue'
  | 'observe'
  | 'zone'
  | 'obstacle';

/**
 * Entry for a scene object in the registry
 * Tracks relationships between field row IDs and scene nodes
 */
export interface SceneObjectRegistryEntry {
  rowId: string;
  category: RegistryCategory;
  ownerNode: TransformNode | AbstractMesh;
  rootMesh: AbstractMesh | null;
  childMeshIds: number[];
  metadataType?: string | null;
  itemId?: string | number | null;
}

@Component({
  selector: 'app-edit-scene',
  templateUrl: './EditScene.component.html',
  styleUrls: ['./EditScene.component.scss'],
  providers: [BaseTaskPayloadBuilder] // [SIM_API_PHASE1]
})
export class EditSceneComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('renderCanvas', { static: false })
  renderCanvas!: ElementRef<HTMLCanvasElement>;

  @ViewChild('babylonHost', { static: false }) babylonHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('babylonMountStageB', { static: false }) babylonMountStageBRef!: ElementRef<HTMLDivElement>;
  @ViewChild('plotlyHost', { static: false }) private plotlyHostRef?: ElementRef<HTMLDivElement>;
  @ViewChild('plotlyColorbarHost', { static: false }) plotlyColorbarHostRef?: ElementRef<HTMLElement>;
  @ViewChild('rightSidebarRef', { static: false }) rightSidebarRef?: any;
  @ViewChild(EditTaskPanelComponent) private editTaskPanel?: EditTaskPanelComponent;
  @ViewChild(EditFieldPanelComponent) private editFieldPanel?: EditFieldPanelComponent;

  /* ================== Services ================== */
  private readonly fieldDomainStore = inject(FieldDomainStoreService);
  private readonly antennaService = inject(AntennaService);
  private readonly http = inject(HttpClient);

  // ===== [Patch 1] Antenna Preload State =====
  antennaList: AntennaApiDto[] = [];
  defaultAntenna: AntennaApiDto | null = null;
  antennaLoaded = false;
  antennaLoadError: string | null = null;
  private antennaPreloadStarted = false;

  // ===== [SAVE_TASK] Save flow state =====
  saveConfirmOpen = false;
  saveSource: 'banner' | 'edit-file' | null = null;
  isSavingTask = false;
  saveErrorMsg = '';
  pendingSaveMeta: any = null;
  lastSavedAt: string | null = null;

  // ===== [SIM_API_PHASE1] Component State =====
  lastCompleteCalcResult: any = null;
  latestPlanningSnapshot: any = null;
  onPlanningSnapshotChange(snapshot: any): void {
    this.latestPlanningSnapshot = snapshot;
    console.log('[SIM_API_PHASE3][planningSnapshotChange][EditScene]', snapshot);
  }


  // ===== Simulation Result =====
  completeCalcResult: any = null; // 先用 any，之後再補 DTO
  sliceHeight = 1.5;
  sliceHeightOptions: number[] = [];

  private viewFilters: ViewFilters = {
    showTerminals: true,
    showObstacles: true,
    showAntennas: true,
    showObserveZones: true,
    showCustomRegions: true,
  };

  // ========================================================
  // ===== [SIM_API_PHASE3][TEMP_SESSION] ====================
  // TEMPORARY HARDCODED SESSION FOR DEVELOPMENT ONLY
  // TODO: TEMP_SESSION_REMOVE_AFTER_LOGIN_SYSTEM
  // ========================================================
  private readonly DEV_TEMP_SESSION =
    'son_session_8e1f1a2e-f3ff-43ed-bba8-9e60d26960ad';

  // ===== [Step2A][Registry] Scene Object Registry =====
  private sceneObjectRegistry = new Map<string, SceneObjectRegistryEntry>();

  // ===== [Patch 5A] Field Domain Store Sync =====
  private fieldSceneSyncSub?: Subscription;
  private isApplyingFieldStoreToScene = false;

  // ===== [Patch 6] Scene to Field Store Sync =====
  private isApplyingSceneToFieldStore = false;
  private positionDragEndObserver: any = null;
  private rotationDragEndObserver: any = null;
  private scaleDragEndObserver: any = null;

  // ===== [AntennaLabel][MVP] =====
  private antennaLabelSeq = 1;
  private antennaNoSeq = 1;
  private hoveredAntennaOwnerUniqueId: number | null = null;
  private hoveredOwnerUniqueId: number | null = null;
  private pinnedOwnerUniqueId: number | null = null;
  public activeCardVM: InteractiveCardVM | null = null;
  activeAnalysisTitle = signal<string | null>(null);
  readonly analysisData = computed(() => {
    return this.rightSidebarRef?.analysisData?.() ?? [];
  });
  readonly avgData = computed(() => {
    return this.rightSidebarRef?.avgData?.() ?? { coverage120: '—', coverage90: '—', coverageSinr: '—', signalQuality: '—', signalStrength: '—' };
  });
  get showCustomZoneAnalysisTab(): boolean {
    const snapshot = this.fieldDomainStore.snapshot;
    return (snapshot?.zones?.length ?? 0) > 0;
  }

  get showObserveAnalysisTab(): boolean {
    const snapshot = this.fieldDomainStore.snapshot;
    return (snapshot?.observes?.length ?? 0) > 0;
  }

  private hasRegistryCategory(category: RegistryCategory): boolean {
    for (const entry of this.sceneObjectRegistry.values()) {
      if (entry?.category === category) return true;
    }
    return false;
  }

  get hasTerminals(): boolean { return this.hasRegistryCategory('ue'); }
  get hasAntennas(): boolean  { return this.hasRegistryCategory('existingBs'); }
  get hasObserveZones(): boolean { return this.hasRegistryCategory('observe'); }
  get hasCustomRegions(): boolean { return this.hasRegistryCategory('zone'); }
  get hasObstacles(): boolean { return this.hasRegistryCategory('obstacle'); }

  get analysisSubfields(): any[] {
    return this.fieldDomainStore.snapshot?.subfields ?? [];
  }
  private highlightLayer: HighlightLayer | null = null;
  /** Owner root mesh for hover highlight (never a child pick target). */
  private hoveredPickMesh: AbstractMesh | null = null;
  /** Owner root mesh for pinned highlight (never a child pick target). */
  private pinnedPickMesh: AbstractMesh | null = null;
  private readonly HL_COLOR_HOVER = new Color3(0.5, 0.95, 1.0);
  private readonly HL_COLOR_PINNED = new Color3(1.0, 1.0, 0.45);
  antennaLabels: AntennaLabelVM[] = [];
  private antennaLabelBeforeRenderObserver: any = null;

  private ensureUiMeta(mesh: Mesh, meta: UiMeta): void {
    if (!mesh) return;

    const metadata = ((mesh as any).metadata = (mesh as any).metadata ?? {});
    const existing = metadata.__ui ?? null;

    if (!existing) {
      metadata.__ui = { ...meta };
      return;
    }

    metadata.__ui = {
      ...meta,
      ...existing,
      title: existing.title ?? meta.title,
      seq: existing.seq ?? meta.seq,
    };
  }

  private resolveOwnerMeshForInteraction(
    target: AbstractMesh | TransformNode | null | undefined
  ): AbstractMesh | TransformNode | null {
    if (!target) return null;

    const owner = this.resolveSceneObjectOwner(target as any) ?? target;

    if (!owner) return null;

    const meta = (owner as any).metadata ?? {};
    const type = meta.type ?? null;
    const name = (owner as any).name?.toLowerCase?.() ?? '';

    if (owner === this.floorMesh) return null;
    if (type === 'ground' || type === 'floor' || type === 'building') return null;
    if (
      name.includes('ground') ||
      name.includes('floor') ||
      name.includes('building') ||
      name.includes('bldg')
    ) {
      return null;
    }

    return owner as any;
  }

  private resolvePickTarget(
    picked: AbstractMesh | null | undefined
  ): AbstractMesh | null {
    if (!picked) return null;

    const owner = this.resolveOwnerMeshForInteraction(picked);
    if (!owner) return null;

    return owner instanceof AbstractMesh ? owner : null;
  }

  /** Owner-only pick mesh for hover/pin; never falls back to the raw picked child. */
  private resolvePickTargetMesh(picked: AbstractMesh | null | undefined): AbstractMesh | null {
    return this.resolvePickTarget(picked);
  }

  private getInteractionNodeByUniqueId(
    uid: number | null | undefined
  ): AbstractMesh | TransformNode | null {
    if (uid == null || !this.scene) return null;
    return (
      (this.scene.getMeshByUniqueId(uid) as AbstractMesh | null) ??
      (this.scene.getTransformNodeByUniqueId(uid) as TransformNode | null) ??
      null
    );
  }

  private isAntennaOwnerNode(node: AbstractMesh | TransformNode | null | undefined): boolean {
    if (!node) return false;
    const meta = (node as any).metadata ?? {};
    if (meta.type === 'antenna') return true;
    const n = (node as any).name?.toLowerCase?.() ?? '';
    return n.startsWith('antenna');
  }

  private ensureHighlightLayer(): void {
    if (!this.scene) return;
    if (this.highlightLayer) return;

    this.highlightLayer = new HighlightLayer('hl_main', this.scene);
    this.highlightLayer.outerGlow = true;
    this.highlightLayer.innerGlow = true;   // 原本 false，改 true 會更亮
    this.highlightLayer.blurHorizontalSize = 1.2;
    this.highlightLayer.blurVerticalSize = 1.2;
  }

  private isGlowExcluded(mesh: AbstractMesh | null | undefined): boolean {
    if (!mesh) return true;

    if (this.floorMesh && mesh === this.floorMesh) return true;

    const meshType = (mesh as any)?.metadata?.type ?? null;
    if (meshType === 'building' || meshType === 'ground' || meshType === 'floor') return true;

    const meshName = (mesh as any)?.name?.toLowerCase?.() ?? '';
    if (meshName.includes('building') || meshName.includes('bldg')) return true;
    if (meshName.includes('ground') || meshName.includes('floor')) return true;

    return false;
  }

  private isHighlightExcludedMesh(mesh: AbstractMesh | null | undefined): boolean {
    if (!mesh) return false;

    if (this.plotlyHeatmapPlane && mesh === this.plotlyHeatmapPlane) return true;

    const meshName = (mesh as any)?.name?.toLowerCase?.() ?? '';
    if (meshName === 'plotly_heatmap_plane' || meshName.includes('plotly_heatmap_plane')) return true;

    return false;
  }

  private isHighlightDisabledMesh(mesh: AbstractMesh | null | undefined): boolean {
    if (!mesh) return true;
    if (this.isGlowExcluded(mesh)) return true;
    if (this.isHighlightExcludedMesh(mesh)) return true;
    return false;
  }

  private recomputeActiveCardVM(): void {
    const targetId = this.hoveredOwnerUniqueId ?? this.pinnedOwnerUniqueId;
    if (targetId == null || !this.scene) {
      this.activeCardVM = null;
      return;
    }

    const ownerNode = this.getInteractionNodeByUniqueId(targetId);
    if (!ownerNode) {
      this.activeCardVM = null;
      return;
    }

    const meta = (ownerNode as any).metadata ?? {};
    const ui = meta.__ui as UiMeta | undefined;
    const kind: UiKind = ui?.kind ?? 'basic';
    const title = ui?.title ?? ownerNode.name ?? '物件';
    const subtitle = ui?.subtitle ?? (ui?.seq != null ? `#${ui.seq}` : undefined);

    this.activeCardVM = {
      ownerUniqueId: targetId,
      kind,
      title,
      subtitle,
      worldOffsetY: 0.5,
      anchorScreenX: null,
      anchorScreenY: null,
      screenX: null,
      screenY: null,
      cardW: 260,
      cardH: 140,
      stemHeightPx: null,
      visible: true,
      isPinned: targetId === this.pinnedOwnerUniqueId,
      isHovered: targetId === this.hoveredOwnerUniqueId,
    };
  }

  private updateHighlight(): void {
    if (!this.scene) return;
    this.ensureHighlightLayer();
    if (!this.highlightLayer) return;
    this.highlightLayer.removeAllMeshes();

    let pinnedOwner = this.resolveOwnerMeshForInteraction(this.pinnedPickMesh as any);
    if (!pinnedOwner && this.pinnedOwnerUniqueId != null) {
      pinnedOwner = this.resolveOwnerMeshForInteraction(
        this.getInteractionNodeByUniqueId(this.pinnedOwnerUniqueId) as any
      );
    }

    let hoveredOwner = this.resolveOwnerMeshForInteraction(this.hoveredPickMesh as any);
    if (!hoveredOwner && this.hoveredOwnerUniqueId != null) {
      hoveredOwner = this.resolveOwnerMeshForInteraction(
        this.getInteractionNodeByUniqueId(this.hoveredOwnerUniqueId) as any
      );
    }


    const addOwnerHierarchy = (
      owner: AbstractMesh | TransformNode | null | undefined,
      color: Color3
    ): void => {
      if (!owner || !this.highlightLayer) return;

      if (owner instanceof AbstractMesh && !this.isHighlightDisabledMesh(owner)) {
        this.highlightLayer.addMesh(owner as Mesh, color);
      }

      const children = owner.getChildMeshes?.(true) ?? [];
      for (const child of children) {
        if (this.isHighlightDisabledMesh(child)) continue;
        this.highlightLayer.addMesh(child as Mesh, color);
      }
    };

    if (pinnedOwner) {
      addOwnerHierarchy(pinnedOwner, this.HL_COLOR_PINNED);
    }

    if (
      hoveredOwner &&
      (!pinnedOwner || hoveredOwner.uniqueId !== pinnedOwner.uniqueId)
    ) {
      addOwnerHierarchy(hoveredOwner, this.HL_COLOR_HOVER);
    }
  }

  private applyPinnedHighlight(target: AbstractMesh | TransformNode | null): void {
    this.ensureHighlightLayer();
    if (!target) {
      this.pinnedPickMesh = null;
      this.pinnedOwnerUniqueId = null;
      this.updateHighlight();
      return;
    }

    const owner = this.resolveOwnerMeshForInteraction(target as any);
    if (!owner) {
      this.pinnedPickMesh = null;
      this.pinnedOwnerUniqueId = null;
      this.updateHighlight();
      return;
    }

    this.pinnedPickMesh = owner instanceof AbstractMesh ? owner : null;
    this.pinnedOwnerUniqueId = owner.uniqueId;
    this.updateHighlight();
  }

  private clearPinnedHighlight(): void {
    this.pinnedPickMesh = null;
    this.pinnedOwnerUniqueId = null;
    this.ensureHighlightLayer();
    this.updateHighlight();
  }

  // ===== [SAVE_TASK] Save flow methods =====

  openSaveConfirm(source: 'banner' | 'edit-file', meta?: any): void {
    if (this.isSavingTask) return;
    this.saveSource = source;
    this.pendingSaveMeta = meta ?? null;
    this.saveConfirmOpen = true;
    const message = source === 'banner' ? '是否要儲存目前規劃內容？' : '是否要儲存目前編輯檔案？';
    this.alertService.question(message).subscribe(confirmed => {
      this.saveConfirmOpen = false;
      if (confirmed) {
        this.onSaveConfirm();
      } else {
        this.closeSaveConfirm();
      }
    });
  }

  closeSaveConfirm(): void {
    this.saveConfirmOpen = false;
    this.saveSource = null;
    this.pendingSaveMeta = null;
  }

  onSaveConfirm(): void {
    this.saveCurrentTask();
  }

  async saveCurrentTask(): Promise<void> {
    if (this.isSavingTask) return;
    this.isSavingTask = true;
    this.saveErrorMsg = '';
    try {
      const payload = this.buildStoreTaskPayloadForSave();
      const resp = await firstValueFrom(this.taskApiService.postStoreTask(payload));
      this.closeSaveConfirm();
      this.lastSavedAt = new Date().toISOString();
      console.log('[SaveTask] success', { status: resp.status, lastSavedAt: this.lastSavedAt });
      this.alertService.success('儲存成功！');
    } catch (err) {
      this.saveErrorMsg = err instanceof Error ? err.message : '儲存失敗，請稍後再試';
      console.error('[SaveTask] error', err);
      this.alertService.error(this.saveErrorMsg);
    } finally {
      this.isSavingTask = false;
    }
  }

  buildStoreTaskPayloadForSave(): any {
    const input = this.collectExecutionInputs();
    const payload = this.baseTaskPayloadBuilder.build(input);
    console.log('[STORETASK_RESOLUTION_CHECK] heatmapGrid:', input.basicField.heatmapGrid, '-> resolution:', payload.resolution);
    return payload;
  }

    // ===== [RESULT:A-FEATURE] RightSidebar actions =====
  onRightSidebarSaveProject(): void {
    // MVP：目前只做 UI 成功提示（RightSidebar 已顯示），這裡保留 log 方便驗收
    console.log('[EditScene] onRightSidebarSaveProject()');
    // 未來若接 API：在此呼叫 save API，成功後再通知 sidebar 顯示成功
  }

  async onRightSidebarExportProject(): Promise<void> {
    console.log('[EditScene] onRightSidebarExportProject()');
    await this.exportProjectAsGlbAndJson();
  }

  handleOpenAnalysis(type: string): void {
    const titleMap: Record<string, string> = {
      field: '整體場域範圍分析',
      bs: '基站效能分析',
      ue: '行動終端效能分析',
      stats: '統計資訊',
    };
    this.activeAnalysisTitle.set(titleMap[type] ?? '分析內容');
  }

  private resolveContextMenuTarget(): ContextMenuResolvedTarget {
    let owner =
      this.getActiveSelectedOwner?.() ??
      this.selectedOwner ??
      (this.selectedMesh
        ? this.resolveSceneObjectOwner(this.selectedMesh as any) ?? this.selectedMesh
        : null) ??
      this.ctxMenuTargetMesh ??
      null;

    if (!owner && this.selectedMesh) {
      owner = this.findContextOwnerViaParentWalk(this.selectedMesh as any, 5);
    }

    if (!owner) {
      return {
        rowId: null,
        kind: null,
        seq: null,
        displayId: '未選取物件',
        isBuildingObstacle: false,
        row: null,
      };
    }

    owner = this.applyContextMenuOwnerParentFallback(owner);

    if (!owner) {
      return {
        rowId: null,
        kind: null,
        seq: null,
        displayId: '未選取物件',
        isBuildingObstacle: false,
        row: null,
      };
    }

    const meta = (owner as any).metadata ?? {};
    const type = meta.type ?? null;
    const entry = this.findRegistryEntryByTarget(owner as any);
    const baseRowId = meta.fieldRowId ?? entry?.rowId ?? null;
    let rowId = baseRowId;
    let resolvedRow: any | null = null;
    let resolvedRowResult: { rowId: string | null; row: any | null; source: ObstacleRowResolveSource; isBuildingObstacle: boolean } = {
      rowId: null,
      row: null,
      source: 'none',
      isBuildingObstacle: false,
    };

    let kind: ContextMenuKind | null = null;

    const isBuildingCandidate =
      type === 'building' ||
      meta?.osmId != null ||
      meta?.tags?.building != null ||
      false;

    // 建築物不開啟右鍵功能
    if (isBuildingCandidate) {
      return {
        rowId: null,
        kind: null,
        seq: null,
        displayId: '建築物不支援右鍵功能',
        isBuildingObstacle: false,
        row: null,
      };
    }

    const isObstacleRowId = typeof rowId === 'string' && rowId.startsWith('obs_');

    if (type === 'obstacle' || type === 'landscape' || isBuildingCandidate || isObstacleRowId) {
      resolvedRowResult = this.resolveObstacleRowForOwner(owner as any);
      rowId = resolvedRowResult.rowId ?? rowId;
      resolvedRow = resolvedRowResult.row;
      kind = 'obstacle';
    }
    else if (
      type === 'antenna' ||
      type === 'existingBs' ||
      type === 'antenna_placeable' ||
      type === 'candidateBs'
    ) {
      kind = 'existingBs';
    } else if (
      type === 'intelligentPanel' ||
      type === 'ris' ||
      type === 'ris_placeable' ||
      type === 'candidateRis'
    ) {
      kind = 'ris';
    } else if (type === 'terminal' || type === 'ue') kind = 'ue';
    else if (type === 'observeZone' || type === 'observe') kind = 'observe';
    else if (type === 'customZone' || type === 'zone') kind = 'zone';

    if (kind === null) {
      kind = this.inferContextMenuKindFallback(
        meta,
        rowId,
        entry,
        (owner as any)?.name ?? null,
        this.selectedMesh?.name ?? null
      );
    }

    if (
      kind === 'obstacle' &&
      resolvedRowResult.source === 'none' &&
      resolvedRow == null
    ) {
      resolvedRowResult = this.resolveObstacleRowForOwner(owner as any);
      rowId = resolvedRowResult.rowId ?? rowId;
      resolvedRow = resolvedRowResult.row;
    }

    if (kind === 'zone') {
      const zones = this.fieldDomainStore.snapshot.zones ?? [];
      const ownerUid = (owner as any)?.uniqueId;

      resolvedRow =
        (typeof rowId === 'string'
          ? zones.find((r: any) => r.id === rowId) ?? null
          : null) ??
        zones.find((r: any) => r.meshId === ownerUid || r.ownerMeshId === ownerUid) ??
        null;

      if (resolvedRow?.id) {
        rowId = resolvedRow.id;
      }
    }

    if (kind === 'observe') {
      const observes = this.fieldDomainStore.snapshot.observes ?? [];
      const ownerUid = (owner as any)?.uniqueId;

      resolvedRow =
        (typeof rowId === 'string'
          ? observes.find((r: any) => r.id === rowId) ?? null
          : null) ??
        observes.find((r: any) => r.meshId === ownerUid || r.ownerMeshId === ownerUid) ??
        resolvedRow;

      if (resolvedRow?.id) {
        rowId = resolvedRow.id;
      }
    }

    const seq =
      typeof resolvedRow?.seq === 'number'
        ? resolvedRow.seq
        : typeof meta.seq === 'number'
          ? meta.seq
          : null;
    const subtitleText =
      kind === 'obstacle' && (resolvedRowResult.isBuildingObstacle === true || String(resolvedRow?.shape ?? '').toLowerCase() === 'building')
        ? `建築物${seq ?? '—'}`
        : this.buildContextMenuDisplayId(kind, seq);

    console.log('[BuildingConsume][ResolvedTarget]', {
      rowId,
      kind,
      subtitle: subtitleText,
      isBuildingObstacle: resolvedRowResult.isBuildingObstacle === true,
      shape: resolvedRow?.shape ?? null,
    });

    const result: ContextMenuResolvedTarget = {
      rowId,
      kind,
      seq,
      displayId: subtitleText,
      isBuildingObstacle: resolvedRowResult.isBuildingObstacle === true,
      row: resolvedRow,
    };
    const storeRow =
      result.row?.id != null
        ? this.fieldDomainStore?.snapshot?.obstacles?.find((r: any) => r.id === result.row?.id) ?? null
        : null;
    console.log('[DEBUG][ResolvedTarget]', {
      rowId: result.row?.id ?? null,
      shape: result.row?.shape ?? null,
      isBuildingObstacle: result.isBuildingObstacle === true,
      metadata: result.row?.metadata ?? null,
      subtitle: result.displayId,
    });
    console.log('[DEBUG][StoreRow]', {
      rowId: storeRow?.id ?? null,
      shape: storeRow?.shape ?? null,
      isBuildingObstacle: (storeRow as any)?.isBuildingObstacle ?? null,
      metadata: (storeRow as any)?.metadata ?? null,
    });
    console.log('[CTX_KIND_RESOLVE]', {
      metadataType: meta?.type ?? null,
      metadataCategory: meta?.category ?? null,
      itemId: meta?.itemId ?? null,
      fieldRowId: meta?.fieldRowId ?? null,
      resolvedKind: result.kind,
      rowId: result.rowId,
    });
    console.log('[CTX_KIND_RESOLVE_DEEP]', {
      selectedMeshName: this.selectedMesh?.name ?? null,
      selectedMeshType: (this.selectedMesh as any)?.metadata?.type ?? null,
      selectedMeshItemId: (this.selectedMesh as any)?.metadata?.itemId ?? null,
      ownerName: (owner as any)?.name ?? null,
      metadataType: meta?.type ?? null,
      metadataCategory: meta?.category ?? null,
      itemId: meta?.itemId ?? null,
      fieldRowId: meta?.fieldRowId ?? null,
      entryCategory: entry?.category ?? null,
      resolvedKind: kind,
      rowId,
    });
    return result;
  }

  /** 從 picked mesh 往上最多 depth 層，找第一個帶有 type/category/fieldRowId/itemId 的節點並 resolve 成場景 owner */
  private findContextOwnerViaParentWalk(
    start: AbstractMesh | TransformNode | null | undefined,
    maxDepth: number
  ): TransformNode | AbstractMesh | null {
    if (!start) return null;
    let cur: any = start;
    let d = 0;
    while (cur && d < maxDepth) {
      const m = cur.metadata ?? {};
      const hasHint =
        !!m.type ||
        !!m.category ||
        !!m.fieldRowId ||
        (m.itemId != null && String(m.itemId).trim() !== '');
      if (hasHint) {
        return (this.resolveSceneObjectOwner(cur as any) ?? cur) as any;
      }
      cur = cur.parent ?? null;
      d += 1;
    }
    return null;
  }

  /**
   * 若目前 owner 的 metadata 過於空泛（常見於只點到 child），用 selectedMesh 往上找有提示的祖先。
   */
  private applyContextMenuOwnerParentFallback(
    owner: TransformNode | AbstractMesh | null
  ): TransformNode | AbstractMesh | null {
    if (!owner) return null;
    const om = (owner as any).metadata ?? {};
    const complete =
      !!om.type ||
      !!om.category ||
      !!om.fieldRowId ||
      (om.itemId != null && String(om.itemId).trim() !== '');
    if (complete) return owner;
    if (!this.selectedMesh) return owner;
    const alt = this.findContextOwnerViaParentWalk(this.selectedMesh as any, 5);
    return alt ?? owner;
  }

  /**
   * 當 metadata.type 未命中主鏈時，用 category / itemId / fieldRowId 前綴 / registry entry / mesh 名稱推斷 context menu kind。
   */
  private inferContextMenuKindFallback(
    meta: any,
    rowId: string | null,
    entry: SceneObjectRegistryEntry | null | undefined,
    ownerName: string | null | undefined,
    selectedMeshName: string | null | undefined
  ): ContextMenuKind | null {
    const cat = meta?.category ?? null;
    if (cat === 'existingBs' || cat === 'candidateBs') return 'existingBs';
    if (cat === 'intelligentPanel' || cat === 'candidateRis') return 'ris';
    if (cat === 'ue') return 'ue';
    if (cat === 'observe') return 'observe';
    if (cat === 'zone' || cat === 'regionalDivision') return 'zone';
    if (cat === 'obstacle' || cat === 'landscape') return 'obstacle';

    const itemId = meta?.itemId != null ? String(meta.itemId) : '';
    if (itemId === 'antenna_placeable' || itemId === 'das_antenna') return 'existingBs';
    if (itemId === 'ris_placeable') return 'ris';

    const ridRaw = typeof rowId === 'string' ? rowId : '';
    const rid = ridRaw.toLowerCase();
    if (rid.startsWith('bs_') || rid.startsWith('cbs_') || rid.startsWith('ant_')) {
      return 'existingBs';
    }
    if (rid.startsWith('ris_') || rid.startsWith('cris_')) return 'ris';
    if (rid.startsWith('ue_')) return 'ue';
    if (rid.startsWith('obs_')) return 'obstacle';
    if (rid.startsWith('obv_') || rid.startsWith('observe_')) return 'observe';
    if (rid.startsWith('zone_') || rid.startsWith('rdiv_') || rid.startsWith('region_')) {
      return 'zone';
    }

    const ec = entry?.category as string | null | undefined;
    if (ec === 'existingBs' || ec === 'candidateBs') return 'existingBs';
    if (ec === 'intelligentPanel' || ec === 'candidateRis') return 'ris';
    if (ec === 'ue') return 'ue';
    if (ec === 'obstacle' || ec === 'landscape') return 'obstacle';
    if (ec === 'observe') return 'observe';
    if (ec === 'zone' || ec === 'regionalDivision') return 'zone';

    const fromOwner = this.inferContextMenuKindFromMeshName(ownerName);
    if (fromOwner) return fromOwner;
    return this.inferContextMenuKindFromMeshName(selectedMeshName);
  }

  /** 最後手段：由 mesh 名稱推斷 kind（皆轉小寫比對） */
  private inferContextMenuKindFromMeshName(name: string | null | undefined): ContextMenuKind | null {
    if (!name) return null;
    const n = name.toLowerCase();

    if (
      n.includes('ris_panel') ||
      n.includes('ris-') ||
      n.includes('ris_') ||
      n.includes('panel_ris') ||
      n.includes('intelligentpanel')
    ) {
      return 'ris';
    }
    if (
      n.includes('antenna_panel') ||
      n.includes('antenna-') ||
      n.includes('antenna_') ||
      n.includes('bs_panel') ||
      n.includes('bs-') ||
      n.includes('bs_') ||
      n.includes('gnb') ||
      n.includes('existingbs')
    ) {
      return 'existingBs';
    }
    if (n.includes('ue_panel') || n.includes('ue-') || n.includes('ue_') || n.includes('terminal')) {
      return 'ue';
    }
    if (
      n.includes('obstacle') ||
      n.includes('building') ||
      n.includes('landscape') ||
      n.startsWith('obj_')
    ) {
      return 'obstacle';
    }
    if (
      n.includes('observezone') ||
      n.startsWith('obv_') ||
      n.includes('observe_') ||
      (n.includes('observe') && !n.includes('observer'))
    ) {
      return 'observe';
    }
    if (
      n.startsWith('rdiv_') ||
      n.includes('region_') ||
      n.includes('customzone') ||
      n.startsWith('zone_')
    ) {
      return 'zone';
    }

    return null;
  }

  private resolveObstacleRowForOwner(
    owner: AbstractMesh | TransformNode | null | undefined
  ): { rowId: string | null; row: any | null; source: ObstacleRowResolveSource; isBuildingObstacle: boolean } {
    if (!owner) return { rowId: null, row: null, source: 'none', isBuildingObstacle: false };
    const meta = (owner as any)?.metadata ?? {};
    const ownerBuildingCandidate =
      meta?.type === 'building' ||
      meta?.osmId != null ||
      meta?.tags?.building != null;
    const withBuildingIdentity = (row: any) => {
      if (!row) return row;
      if (!ownerBuildingCandidate) return row;
      return {
        ...row,
        isBuildingObstacle: true,
        shape: row.shape ?? 'building',
      };
    };

    const rowIdFromMeta = meta?.fieldRowId ?? null;
    if (rowIdFromMeta) {
      const rowFromMeta = this.fieldDomainStore.snapshot.obstacles.find((r: any) => r.id === rowIdFromMeta) ?? null;
      if (rowFromMeta) {
        const finalRow = withBuildingIdentity(rowFromMeta);
        return { rowId: finalRow.id, row: finalRow, source: 'fieldRowId', isBuildingObstacle: finalRow.isBuildingObstacle === true || String(finalRow.shape ?? '').toLowerCase() === 'building' };
      }
    }

    const entry = this.findRegistryEntryByTarget(owner as any);
    if (entry?.rowId) {
      const rowFromRegistry = this.fieldDomainStore.snapshot.obstacles.find((r: any) => r.id === entry.rowId) ?? null;
      if (rowFromRegistry) {
        this.attachFieldRowMetadata(owner as any, rowFromRegistry.id);
        const finalRow = withBuildingIdentity(rowFromRegistry);
        return { rowId: finalRow.id, row: finalRow, source: 'registry', isBuildingObstacle: finalRow.isBuildingObstacle === true || String(finalRow.shape ?? '').toLowerCase() === 'building' };
      }
    }

    const ownerOsmId = String(meta?.osmId ?? '').trim();
    if (ownerOsmId) {
      const rowFromOsm = this.fieldDomainStore.snapshot.obstacles.find((r: any) => {
        const rowMeta = (r as any)?.metadata ?? {};
        return (
          String(r?.id ?? '') === ownerOsmId ||
          String((r as any)?.osmId ?? '') === ownerOsmId ||
          String(rowMeta?.osmId ?? '') === ownerOsmId
        );
      }) ?? null;
      if (rowFromOsm?.id) {
        this.attachFieldRowMetadata(owner as any, rowFromOsm.id);
        const finalRow = withBuildingIdentity(rowFromOsm);
        return { rowId: finalRow.id, row: finalRow, source: 'osmId', isBuildingObstacle: true };
      }
    }

    return { rowId: null, row: null, source: 'none', isBuildingObstacle: false };
  }

  private buildContextMenuDisplayId(kind: ContextMenuKind | null, seq: number | null): string {
    const n = seq ?? '—';
    switch (kind) {
      case 'obstacle': return `障礙物${n}`;
      case 'existingBs': return `基地台${n}`;
      case 'ris': return `智慧反射面板${n}`;
      case 'ue': return `行動終端${n}`;
      case 'observe': return `觀測區域${n}`;
      case 'zone': return `自訂分區${n}`;
      default: return '未識別物件';
    }
  }

  getContextMenuItems(): ContextMenuItem[] {
    const resolved = this.resolveContextMenuTarget();
    if (!resolved.kind) {
      return [
        { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
        { id: 'delete', label: '刪除物件' },
        { id: 'duplicate', label: '複製物件' },
        { id: 'properties', label: '物件大小/位置設定' },
      ];
    }
    return this.contextMenuItemsByKind[resolved.kind] ?? [];
  }

  getContextMenuDisplayId(): string {
    const resolved = this.resolveContextMenuTarget();
    const inputSubtitle = resolved.displayId;
    const finalSubtitle = inputSubtitle;
    console.log('[DEBUG][FinalSubtitle]', {
      inputSubtitle,
      finalSubtitle,
      rowShape: resolved.row?.shape ?? null,
      isBuildingObstacle: resolved.isBuildingObstacle === true,
    });
    return finalSubtitle;
  }

  /** Field panel 已成功依 pending 開啟 RIS/UE modal 後呼叫，清除 pending 避免殘留重複開啟 */
  onFieldPanelSettingsActionConsumed(): void {
    this.pendingSettingsOpenAction = null;
  }

  onFieldCardSelect(payload: FieldCardSelectPayload): void {
    const { kind, rowId } = payload;

    if (
      this.selectedFieldCard &&
      this.selectedFieldCard.kind === kind &&
      this.selectedFieldCard.rowId === rowId
    ) {
      this.clearCurrentSelection();
      return;
    }

    const owner = this.findSceneOwnerByFieldRow(kind, rowId);
    if (!owner) {
      console.warn('[FieldCardSelect] owner not found', payload);
      return;
    }

    this.selectedFieldCard = payload;
    this.selectedContextRowId = rowId;
    this.attachGizmoToOwner(owner);
  }

  clearCurrentSelection(): void {
    this.detachGizmo();
    this.selectedFieldCard = null;
    this.selectedOwner = null;
    this.selectedContextRowId = null;
  }

  onObjectCardSelect(payload: any): void {
    const owner = this.findSceneOwnerByObjectCardPayload(payload);
    if (!owner) {
      console.warn('[ObjectCardSelect] owner not found', payload);
      return;
    }
    const isSame = this.pinnedOwnerUniqueId != null && owner.uniqueId === this.pinnedOwnerUniqueId;
    if (isSame) {
      this.clearPinnedHighlight();
      return;
    }
    this.applyPinnedHighlight(owner);
  }

  private findSceneOwnerByObjectCardPayload(payload: any): any | null {
    // object card kind -> field panel kind
    const fieldKind =
      payload.objectKind === 'bs'
        ? (payload.sourceType === 'candidate' ? 'candidateBs' : 'existingBs')
        : payload.objectKind === 'ris'
          ? (payload.sourceType === 'candidate' ? 'candidateRis' : 'intelligentPanel')
          : null;

    // A. rowId 優先：直接複用既有 field card 血統
    if (payload.rowId && fieldKind) {
      const owner = this.findSceneOwnerByFieldRow(fieldKind as any, payload.rowId);
      if (owner) return owner;
    }

    // B. backendId fallback（保留）
    if (payload.objectKind === 'bs') {
      const allBs = [
        ...(this.fieldDomainStore.snapshot.existingBs || []),
        ...(this.fieldDomainStore.snapshot.candidateBs || []),
      ];

      const row = allBs.find((r: any) => r.id === payload.backendId);

      if (row) {
        const target = this.getSceneTargetByFieldRow(row);
        if (target) return this.resolveSceneObjectOwner(target as any) ?? target;
      }
    }

    if (payload.objectKind === 'ris') {
      const allRis = [
        ...(this.fieldDomainStore.snapshot.intelligentPanels || []),
        ...(this.fieldDomainStore.snapshot.candidateRis || []),
      ];

      const row = allRis.find((r: any) => r.id === payload.backendId);

      if (row) {
        const target = this.getSceneTargetByFieldRow(row);
        if (target) return this.resolveSceneObjectOwner(target as any) ?? target;
      }
    }

    return null;
  }

  onSectionCollapsed(sectionId: string): void {
    if (!this.selectedFieldCard) return;

    if (this.selectedFieldCard.sectionId === sectionId) {
      this.clearCurrentSelection();
    }
  }

  openExistingBsSettings(row: ExistingBsFieldRow): void {
    this.existingBsSettingsTarget = row;
    this.existingBsSettingsOpen = true;
  }

  closeExistingBsSettings(): void {
    this.existingBsSettingsOpen = false;
    this.existingBsSettingsTarget = null;
  }

  onConfirmExistingBsSettings(payload: any): void {
    console.log('[ExistingBsSettings][confirm]', payload);

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
    } as any);

    this.closeExistingBsSettings();
  }

  openZonePathLoss(rowId?: string): void {
    const zones = this.fieldDomainStore.snapshot.zones ?? [];
    const defaultModelId = this.resolveDefaultPathLossModelId();
    this.zonePathLossDefaultModelId = defaultModelId;

    // Determine effective rowId: prefer explicit param, then selectedContextRowId
    const effectiveRowId = rowId ?? this.selectedContextRowId ?? null;

    const selectedRow = effectiveRowId
      ? zones.find((row) => row.id === effectiveRowId) ?? null
      : null;

    // If a specific zone was targeted but not found in store yet, use all zones as fallback
    this.zonePathLossRows = selectedRow ? [selectedRow] : [...zones];

    // Last resort: try resolveContextMenuTarget (right-click path)
    if (this.zonePathLossRows.length === 0) {
      const resolved = this.resolveContextMenuTarget();
      if (resolved.kind === 'zone' && resolved.row) {
        this.zonePathLossRows = [resolved.row as any];
      }
    }

    this.zonePathLossOpen = true;

    if (this.zonePathLossRows.length === 0) {
      console.warn('[ZonePathLoss] no zone rows available for modal', { effectiveRowId, zonesCount: zones.length });
    }
  }

  private resolveDefaultPathLossModelId(): number | null {
    const snapshotModelIdRaw = (this.fieldDomainStore.snapshot as any)?.pathLossModelId;
    const snapshotModelId = Number(snapshotModelIdRaw);
    if (Number.isFinite(snapshotModelId)) {
      return snapshotModelId;
    }

    const fieldDefault5g = Number((TASK_PAYLOAD_MOCK_DEFAULTS as any)?.field?.defaultPathLossModel?.['5g']);
    if (Number.isFinite(fieldDefault5g)) {
      return fieldDefault5g;
    }

    const fallback = Number(SIMULATION_SEED_FALLBACK.pathLossModelId);
    return Number.isFinite(fallback) ? fallback : null;
  }

  closeZonePathLoss(): void {
    this.zonePathLossOpen = false;
  }

  onConfirmZonePathLoss(payload: any[]): void {
    console.log('[ZonePathLoss][confirm]', payload);

    (payload || []).forEach((p) => {
      this.fieldDomainStore.updateZone(p.rowId, {
        pathLossModelId: p.pathLossModelId,
      } as any);
    });

    this.closeZonePathLoss();
  }

  openObjectSettings(row: any): void {
    const sceneTarget = this.getSceneTargetByFieldRow(row);
    const owner = this.resolveSceneObjectOwner(sceneTarget as any) ?? sceneTarget;
    const bounds = this.getWorldBoundsInfo(sceneTarget as any);
    const meshHeight = bounds?.sizeY;
    const targetMeta = (sceneTarget as any)?.metadata ?? {};
    const ownerMeta = (owner as any)?.metadata ?? {};
    const rowMeta = (row as any)?.metadata ?? {};
    const baseHeightM = Number(
      rowMeta?.baseHeightM ??
      ownerMeta?.baseHeightM ??
      targetMeta?.baseHeightM
    );
    const rowIsBuildingCandidate = this.isBuildingObstacle(row, sceneTarget, owner);

    console.log('[BuildingMode][OpenObjectSettings]', {
      rowId: row?.id ?? null,
      rowShape: row?.shape ?? null,
      rowMetadata: rowMeta,
      rowIsBuildingCandidate,
      sceneTargetName: (sceneTarget as any)?.name ?? null,
      sceneTargetMetadata: targetMeta,
      ownerName: (owner as any)?.name ?? null,
      ownerMetadata: ownerMeta,
    });

    this.objectSettingsTarget = {
      ...row,
      metadata: {
        ...ownerMeta,
        ...targetMeta,
        ...rowMeta,
      },
      baseHeightM: Number.isFinite(baseHeightM) ? baseHeightM : null,
      meshHeight: Number.isFinite(meshHeight) ? meshHeight : null,
      isBuildingObstacle: rowIsBuildingCandidate,
    };
    this.objectSettingsOpen = true;
  }

  closeObjectSettings(): void {
    this.objectSettingsOpen = false;
    this.objectSettingsTarget = null;
  }

  onConfirmObjectSettings(payload: any): void {
    console.log('[ObjectSettings][confirm]', payload);

    const target = this.objectSettingsTarget;
    if (!target) {
      this.closeObjectSettings();
      return;
    }
    const sceneTarget = this.getSceneTargetByFieldRow(target);
    const owner = this.resolveSceneObjectOwner(sceneTarget as any) ?? sceneTarget;
    const isBuilding = this.isBuildingObstacle(target, sceneTarget, owner);

    if (isBuilding) {
      const finalHeight = Number(payload.height);
      this.fieldDomainStore.updateObstacle(payload.rowId, {
        height: finalHeight,
      } as any);
      console.log('[BuildingHeight][Confirm]', {
        rowId: payload.rowId,
        inputHeight: payload.height,
        finalHeight,
      });
      this.closeObjectSettings();
      return;
    }

    const patch = {
      startHeight: payload.startHeight,
      height: payload.height,
      width: payload.width,
      length: payload.length,
      angle: payload.angle,
      shape: payload.shape || target.shape,
      color: payload.color || target.color,
      position: {
        x: target.x,
        y: target.y,
        z: payload.startHeight,
      },
      material: payload.materialName || target.material,
      materialId: payload.materialId,
      materialName: payload.materialName,
      materialDecay: payload.materialDecay,
    } as any;

    let updated = false;

    // 本專案目前只看到 updateObstacle；若未來新增 updateLandscape/updatePrimitive，
    // 這段可自然擴充。
    if (target.category === 'landscape') {
      if ((this.fieldDomainStore as any).updateLandscape) {
        (this.fieldDomainStore as any).updateLandscape(payload.rowId, patch);
        updated = true;
      }
    } else {
      if ((this.fieldDomainStore as any).updatePrimitive) {
        (this.fieldDomainStore as any).updatePrimitive(payload.rowId, patch);
        updated = true;
      }
    }

    if (!updated) {
      this.fieldDomainStore.updateObstacle(payload.rowId, patch);
    }

    console.log('[ObjectSettings][updated]', {
      rowId: payload.rowId,
      startHeight: payload.startHeight,
      height: payload.height,
      width: payload.width,
      length: payload.length,
      angle: payload.angle,
      shape: payload.shape,
      color: payload.color,
      materialId: payload.materialId,
      materialName: payload.materialName,
      materialDecay: payload.materialDecay,
    });
    const updatedRow = this.fieldDomainStore.snapshot?.obstacles?.find((r: any) => r.id === payload.rowId);
    console.log('[ObjectSettings][row-after-update]', {
      rowId: payload.rowId,
      row: updatedRow
        ? {
            x: updatedRow.x,
            y: updatedRow.y,
            startHeight: updatedRow.startHeight,
            width: updatedRow.width,
            length: updatedRow.length,
            height: updatedRow.height,
            angle: updatedRow.angle,
            material: updatedRow.material,
            shape: updatedRow.shape,
            color: updatedRow.color,
            position: updatedRow.position,
          }
        : null,
    });

    this.closeObjectSettings();
  }

  private isBuildingObstacle(
    row: any,
    sceneTarget?: AbstractMesh | TransformNode | null,
    ownerTarget?: AbstractMesh | TransformNode | null
  ): boolean {
    const rowMeta = (row as any)?.metadata ?? {};
    const sceneMeta = (sceneTarget as any)?.metadata ?? {};
    const ownerMeta = (ownerTarget as any)?.metadata ?? {};
    return (
      row?.isBuildingObstacle === true ||
      String(row?.shape ?? '').toLowerCase() === 'building' ||
      rowMeta?.osmId != null ||
      rowMeta?.tags?.building != null ||
      sceneMeta?.osmId != null ||
      sceneMeta?.tags?.building != null ||
      ownerMeta?.osmId != null ||
      ownerMeta?.tags?.building != null
    );
  }

  openAntennaSettings(row: ExistingBsFieldRow): void {
    this.antennaSettingsTarget = row;
    this.antennaSettingsOpen = true;
  }

  closeAntennaSettings(): void {
    this.antennaSettingsOpen = false;
    this.antennaSettingsTarget = null;
  }

  onConfirmAntennaSettings(payload: any): void {
    console.log('[AntennaSettings][confirm]', payload);

    this.fieldDomainStore.updateExistingBs(payload.rowId, {
      antennaInstallation: payload.installation,
      antennaTheta: payload.theta,
      antennaPhi: payload.phi,
      antennaGain: payload.gain,
    } as any);

    this.closeAntennaSettings();
  }

  risSettingsOpen = false;
  risSettingsTarget: IntelligentPanelFieldRow | null = null;

  openRisSettings(row: IntelligentPanelFieldRow): void {
    console.log('[RisSettings][open]', {
      rowId: row?.id,
      frontendRowId: row?.id,
      backendRisID: row?.risID ?? row?.risId ?? null,
      profileID: row?.profileID ?? row?.profileId ?? null,
      insHorizontal: row?.insHorizontal ?? row?.installHorizontalAngle ?? null,
      insVertical: row?.insVertical ?? row?.installVerticalAngle ?? null,
      position: row?.position ?? { x: row?.x, y: row?.y, z: row?.z },
    });
    this.risSettingsTarget = row;
    this.risSettingsOpen = true;
  }

  closeRisSettings(): void {
    this.risSettingsOpen = false;
    this.risSettingsTarget = null;
  }

  onConfirmRisSettings(payload: any): void {
    console.log('[RIS][REAL_CONFIRM_ENTRY]', {
      source: 'app-intelligent-panel-settings-modal(confirm)',
      payload,
    });
    console.log('[RisSettings][confirm]', payload);
    const beforeRow = this.fieldDomainStore.snapshot?.intelligentPanels?.find((r: any) => r.id === payload.rowId) as any;
    console.log('[RIS][STORE_BEFORE_PATCH]', {
      rowId: payload?.rowId,
      row: beforeRow
        ? {
            id: beforeRow.id,
            risID: beforeRow.risID ?? beforeRow.risId ?? null,
            profileID: beforeRow.profileID ?? beforeRow.profileId ?? null,
            insHorizontal: beforeRow.insHorizontal ?? beforeRow.installHorizontalAngle ?? null,
            insVertical: beforeRow.insVertical ?? beforeRow.installVerticalAngle ?? null,
            position: beforeRow.position ?? { x: beforeRow.x, y: beforeRow.y, z: beforeRow.z },
          }
        : null,
    });
    console.log('[RisSettings][row-before-update][store-bound]', {
      rowId: payload?.rowId,
      frontendRowId: beforeRow?.id ?? payload?.rowId,
      backendRisID: beforeRow?.risID ?? beforeRow?.risId ?? null,
      profileID: beforeRow?.profileID ?? beforeRow?.profileId ?? null,
      insHorizontal: beforeRow?.insHorizontal ?? beforeRow?.installHorizontalAngle ?? null,
      insVertical: beforeRow?.insVertical ?? beforeRow?.installVerticalAngle ?? null,
      position: beforeRow?.position ?? (beforeRow ? { x: beforeRow.x, y: beforeRow.y, z: beforeRow.z } : null),
    });

    const risID = payload?.risId == null ? null : Number(payload.risId);
    const profileID = payload?.profileId == null ? null : Number(payload.profileId);
    const insHorizontal = Number(payload?.installHorizontalAngle ?? 0);
    const insVertical = Number(payload?.installVerticalAngle ?? 0);

    this.fieldDomainStore.updateIntelligentPanel(payload.rowId, {
      risID,
      risId: risID,
      profileID,
      profileId: profileID,
      insHorizontal,
      installHorizontalAngle: insHorizontal,
      insVertical,
      installVerticalAngle: insVertical,
    } as any);
    const updatedRow = this.fieldDomainStore.snapshot?.intelligentPanels?.find((r: any) => r.id === payload.rowId) as any;
    console.log('[RIS][STORE_AFTER_PATCH]', {
      rowId: payload?.rowId,
      row: updatedRow
        ? {
            id: updatedRow.id,
            risID: updatedRow.risID ?? updatedRow.risId ?? null,
            profileID: updatedRow.profileID ?? updatedRow.profileId ?? null,
            insHorizontal: updatedRow.insHorizontal ?? updatedRow.installHorizontalAngle ?? null,
            insVertical: updatedRow.insVertical ?? updatedRow.installVerticalAngle ?? null,
            position: updatedRow.position ?? { x: updatedRow.x, y: updatedRow.y, z: updatedRow.z },
          }
        : null,
    });
    console.log('[RisSettings][row-after-update][store-bound]', {
      rowId: payload.rowId,
      frontendRowId: updatedRow?.id ?? payload.rowId,
      backendRisID: updatedRow?.risID ?? updatedRow?.risId ?? null,
      profileID: updatedRow?.profileID ?? updatedRow?.profileId ?? null,
      insHorizontal: updatedRow?.insHorizontal ?? updatedRow?.installHorizontalAngle ?? null,
      insVertical: updatedRow?.insVertical ?? updatedRow?.installVerticalAngle ?? null,
      row: updatedRow
        ? {
            id: updatedRow.id,
            risID: updatedRow.risID ?? updatedRow.risId,
            risId: updatedRow.risId ?? updatedRow.risID,
            profileID: updatedRow.profileID ?? updatedRow.profileId,
            profileId: updatedRow.profileId ?? updatedRow.profileID,
            insHorizontal: updatedRow.insHorizontal ?? updatedRow.installHorizontalAngle,
            insVertical: updatedRow.insVertical ?? updatedRow.installVerticalAngle,
            installHorizontalAngle: updatedRow.installHorizontalAngle ?? updatedRow.insHorizontal,
            installVerticalAngle: updatedRow.installVerticalAngle ?? updatedRow.insVertical,
            position: updatedRow.position ?? { x: updatedRow.x, y: updatedRow.y, z: updatedRow.z },
            x: updatedRow.x,
            y: updatedRow.y,
            z: updatedRow.z,
          }
        : null,
    });

    this.closeRisSettings();
  }

  // ===== [RIGHT_CLICK_MENU:ACTIONS] =====
  // Purpose: Handle context menu actions
  // ======================================
  onMenuAction(action: string): void {
    if (!this.guardEditWrite('onMenuAction')) return;
    this.isMenuVisible = false; // Close menu after action
    
    if (!this.selectedMesh && action !== 'delete') {
      console.warn('[RightClickMenu] No mesh selected');
      return;
    }

    console.log('[RightClickMenu] Action:', action, 'on mesh:', this.selectedMesh?.name ?? null);

    switch (action) {
      case 'enterScaleEdit': {
        if (this.stage !== 'edit') break;
        console.log('[CTX][GIZMO] clicked');

        const target = this.ctxMenuTargetMesh;
        console.log('[CTX][GIZMO] target=', target?.name, target?.uniqueId);

        if (!target) {
          console.warn('[CTX][GIZMO] abort: missing ctxMenuTargetMesh');
          return;
        }

        console.log('[CTX][GIZMO] entering Gizmo Mode...');
        this.enterGizmoMode(target);
        break;
      }
      case 'delete':
        {
          const activeTarget =
            this.getActiveSelectedOwner() ??
            this.selectedOwner ??
            this.ctxMenuTargetMesh ??
            this.selectedMesh;

          if (!activeTarget) {
            console.warn('[Delete] abort: no active target');
            break;
          }

          const owner =
            this.resolveSceneObjectOwner(activeTarget as any) ??
            (activeTarget as any);
          const ownerName = (owner as any)?.name ?? '未命名物件';

          if (confirm(`確定要刪除「${ownerName}」嗎？`)) {
            this.deleteSceneObjectByOwner(owner as any);
          }
          break;
        }
      
      case 'duplicate':
        // Clone the selected mesh
        const cloned = this.selectedMesh.clone(`${this.selectedMesh.name}_copy`, null);
        if (cloned) {
          cloned.position.x += 2; // Offset slightly
          console.log('[RightClickMenu] Mesh duplicated:', cloned.name);
        }
        break;

      case 'bsParams': {
        const resolved = this.resolveContextMenuTarget();
        const rowId = resolved.rowId;
        const row = rowId
          ? (this.fieldDomainStore.snapshot.existingBs.find((r) => r.id === rowId) ??
             (this.fieldDomainStore.snapshot.candidateBs as any[])?.find((r: any) => r.id === rowId) ??
             null)
          : null;

        console.log('[PARAM_ACTION_ENTER]', { action: 'bsParams', resolved });
        console.log('[PARAM_ROW_RESOLVE]', { action: 'bsParams', rowId, row });

        if (!row) {
          console.warn('[bsParams] row not found');
          return;
        }

        this.openExistingBsSettings(row);

        return;
      }

      case 'antennaParams': {
        const resolved = this.resolveContextMenuTarget();
        const rowId = resolved.rowId;
        const row = rowId
          ? (this.fieldDomainStore.snapshot.existingBs.find((r) => r.id === rowId) ??
             (this.fieldDomainStore.snapshot.candidateBs as any[])?.find((r: any) => r.id === rowId) ??
             null)
          : null;

        console.log('[PARAM_ACTION_ENTER]', { action: 'antennaParams', resolved });
        console.log('[PARAM_ROW_RESOLVE]', { action: 'antennaParams', rowId, row });

        if (!row) {
          console.warn('[antennaParams] row not found');
          return;
        }

        this.openAntennaSettings(row);

        return;
      }

      case 'risParams': {
        const resolved = this.resolveContextMenuTarget();
        const rowId = resolved.rowId;
        const row = rowId
          ? (this.fieldDomainStore.snapshot.intelligentPanels.find((r) => r.id === rowId) ??
             (this.fieldDomainStore.snapshot.candidateRis as any[])?.find((r: any) => r.id === rowId) ??
             null)
          : null;

        console.log('[PARAM_ACTION_ENTER]', { action: 'risParams', resolved });
        console.log('[PARAM_ROW_RESOLVE]', { action: 'risParams', rowId, row });

        if (!row) {
          console.warn('[risParams] row not found');
          return;
        }

        console.log('[RIS][REAL_SETTINGS_ENTRY]', {
          source: 'onMenuAction:risParams',
          action: 'risParams',
          resolved,
          row: {
            id: row.id,
            risID: (row as any).risID ?? (row as any).risId ?? null,
            profileID: (row as any).profileID ?? (row as any).profileId ?? null,
            insHorizontal: (row as any).insHorizontal ?? (row as any).installHorizontalAngle ?? null,
            insVertical: (row as any).insVertical ?? (row as any).installVerticalAngle ?? null,
            position: (row as any).position ?? { x: (row as any).x, y: (row as any).y, z: (row as any).z },
          },
        });
        this.openRisSettings(row);
        return;
      }

      case 'rxPower': {
        const resolved = this.resolveContextMenuTarget();
        this.rightPanelType = 'field';
        this.selectedContextRowId = resolved.rowId;
        this.pendingSettingsOpenAction = 'ue';
        console.log('[CTX][OPEN_UE_SETTINGS]', resolved);
        return;
      }

      case 'zonePathLossModel': {
        const resolved = this.resolveContextMenuTarget();
        this.selectedContextRowId = resolved.rowId;
        this.openZonePathLoss(resolved.rowId ?? undefined);
        return;
      }

      case 'material': {
        const resolved = this.resolveContextMenuTarget?.();

        const row = resolved?.row ?? (
          resolved?.rowId != null
            ? this.fieldDomainStore.snapshot.obstacles.find((r: any) => r.id === resolved.rowId) ?? null
            : null
        );

        if (!row) {
          console.warn('[ObjectSettings] row not found', resolved);
          return;
        }

        const rowForModal =
          resolved?.isBuildingObstacle === true
            ? {
                ...row,
                isBuildingObstacle: true,
                shape: row.shape ?? 'building',
              }
            : row;

        console.log('[BuildingConsume][BeforeOpenModal]', {
          rowId: rowForModal?.id ?? null,
          isBuildingObstacle: rowForModal?.isBuildingObstacle === true,
          shape: rowForModal?.shape ?? null,
          subtitle: resolved?.displayId ?? null,
        });
        console.log('[DEBUG][BeforeOpenModal]', {
          rowId: rowForModal?.id ?? null,
          shape: rowForModal?.shape ?? null,
          isBuildingObstacle: rowForModal?.isBuildingObstacle === true,
        });

        this.openObjectSettings(rowForModal);
        return;
      }
      
      case 'properties':
        // ✅ [FIX] Enter properties editing mode instead of showing alert
        this.isPropertiesMode = true;
        this.isMenuVisible = true; // Explicitly keep menu visible
        this.isCurrentlyRightClick = true; // Lock state to prevent accidental closure
        
        // ✅ [POSITION] Move menu to screen center when entering properties mode
        this.menuPosition.y = window.innerHeight / 2 - 150;
        console.log('[RightClickMenu] Menu repositioned to center:', this.menuPosition);
        
        // ✅ [SNAPSHOT] Capture initial transform state for cancel operation
        if (this.selectedMesh) {
          this.initialTransform = {
            position: this.selectedMesh.position.clone(),
            rotation: this.selectedMesh.rotation.clone(),
            scaling: this.selectedMesh.scaling.clone(),
          };
          console.log('[RightClickMenu] Initial transform captured:', this.initialTransform);
        }
        
        // Ensure Gizmo is not attached during properties view
        if (this.gizmoManager?.attachedMesh) {
          console.log('[RightClickMenu] Properties: Clearing Gizmo for clean view');
          this.gizmoManager.attachToMesh(null);
          this.phase2AttachGizmo(null);
        }
        
        console.log('[RightClickMenu] Mode switched to Properties');
        console.log('[RightClickMenu] Properties mode enabled for:', {
          name: this.selectedMesh.name,
          scaling: this.selectedMesh.scaling,
          position: this.selectedMesh.position,
          rotation: this.selectedMesh.rotation
        });
        
        // ✅ [CRITICAL FIX] Return early to keep menu visible and persistent
        // Do NOT call closeContextMenu() when entering properties mode
        return;
    }
    
    // ✅ [FIX] Clear state after action (only for delete/duplicate)
    this.closeContextMenu();
  }

  // ===== [TEMPLATE_HELPER:NUMBER_CONVERSION] =====
  // Purpose: Safe number conversion for Angular templates
  // ==========================================
  toNum(val: any): number {
    return parseFloat(val) || 0;
  }

  // ===== [RIGHT_CLICK_MENU:DRAGGING] =====
  // Purpose: Allow floating menu to be dragged by header
  // ==========================================
  onMenuHeaderMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingMenu = true;
    this.menuDragOffset = {
      x: event.clientX - this.menuPosition.x,
      y: event.clientY - this.menuPosition.y,
    };
    document.addEventListener('mousemove', this.menuMouseMoveListener);
    document.addEventListener('mouseup', this.menuMouseUpListener);
  }

  private onMenuMouseMove(event: MouseEvent): void {
    if (!this.isDraggingMenu) return;
    event.preventDefault();
    this.menuPosition = {
      x: event.clientX - this.menuDragOffset.x,
      y: event.clientY - this.menuDragOffset.y,
    };
  }

  private onMenuMouseUp(event: MouseEvent): void {
    if (!this.isDraggingMenu) return;
    event.preventDefault();
    this.isDraggingMenu = false;
    this.teardownMenuDragListeners();
  }

  private logCameraHeight(tag: string, camera: Camera | null | undefined): void {
    if (!camera) {
      console.log('[CameraHeight]', { tag, camera: null });
      return;
    }

    const cameraAny = camera as any;
    const positionY = typeof cameraAny?.position?.y === 'number' ? cameraAny.position.y : null;

    let targetY: number | null = null;
    try {
      const target = typeof cameraAny?.getTarget === 'function' ? cameraAny.getTarget() : null;
      targetY = typeof target?.y === 'number' ? target.y : null;
    } catch {
      targetY = null;
    }

    console.log('[CameraHeight]', {
      tag,
      name: camera.name,
      type: (camera as any)?.getClassName?.() ?? camera.constructor?.name ?? 'Camera',
      positionY,
      targetY,
    });
  }

  onMenuHeaderClose(event: MouseEvent): void {
    event.stopPropagation();
    this.closeContextMenu();
  }

  private teardownMenuDragListeners(): void {
    document.removeEventListener('mousemove', this.menuMouseMoveListener);
    document.removeEventListener('mouseup', this.menuMouseUpListener);
  }

  // ===== [RIGHT_CLICK_MENU:STATE_CLEANUP] =====
  // Purpose: Close menu and sync Gizmo state
  // ==========================================
  closeContextMenu(): void {
    this.isMenuVisible = false;
    this.isPropertiesMode = false;
    this.isCurrentlyRightClick = false; // ✅ [FIX] Reset right-click lock
    this.selectedMesh = null;
    this.selectedOwner = null;
    this.isDraggingMenu = false;
    this.initialTransform = null; // Clear snapshot
    this.teardownMenuDragListeners();
    console.log('[RightClickMenu] Menu closed, all state flags reset');
  }

  // ===== [Selection][OwnerOnly] helpers =====
  private setSelectedSceneObject(
    picked: AbstractMesh | null | undefined
  ): void {
    const pickedMesh = picked ?? null;
    const owner = this.resolveSceneObjectOwner(pickedMesh as any);

    this.selectedMesh = pickedMesh;
    this.selectedOwner = owner;

    console.log('[Selection][OwnerOnly]', {
      picked: pickedMesh?.name ?? null,
      pickedUid: pickedMesh?.uniqueId ?? null,
      owner: owner?.name ?? null,
      ownerUid: (owner as any)?.uniqueId ?? null,
    });
  }

  private getActiveSelectedOwner(): TransformNode | AbstractMesh | null {
    if (this.selectedOwner) return this.selectedOwner;
    if (this.phase2EditingOwner) return this.phase2EditingOwner;
    if (this.phase2SelectedOwner) return this.phase2SelectedOwner;
    if (this.selectedMesh) {
      return this.resolveSceneObjectOwner(this.selectedMesh as any) ?? this.selectedMesh;
    }
    return null;
  }

  // ===== [Delete][OwnerOnly] helpers =====
  private getRegistryEntryByOwner(
    owner: TransformNode | AbstractMesh | null | undefined
  ): SceneObjectRegistryEntry | null {
    if (!owner) return null;

    for (const entry of this.sceneObjectRegistry.values()) {
      if (entry?.ownerNode?.uniqueId === owner.uniqueId) {
        return entry;
      }
    }

    return null;
  }

  private unregisterSceneObjectByRowId(
    rowId: string | null | undefined
  ): void {
    if (!rowId) return;

    if (this.sceneObjectRegistry.has(rowId)) {
      this.sceneObjectRegistry.delete(rowId);
      console.log('[Delete][Registry]', {
        rowId,
        action: 'deleted',
      });
    }
  }

  private removeFieldRowByRegistryEntry(
    entry: SceneObjectRegistryEntry | null
  ): void {
    if (!entry?.rowId) return;

    const rowId = entry.rowId;
    const category = entry.category;

    try {
      switch (category) {
        case 'existingBs':
          this.fieldDomainStore.removeExistingBs?.(rowId);
          break;
        case 'intelligentPanel':
          this.fieldDomainStore.removeIntelligentPanel?.(rowId);
          break;
        case 'candidateBs':
          this.fieldDomainStore.removeCandidateBs?.(rowId);
          break;
        case 'candidateRis':
          this.fieldDomainStore.removeCandidateRis?.(rowId);
          break;
        case 'ue':
          this.fieldDomainStore.removeUe?.(rowId);
          break;
        default:
          console.warn('[Delete][FieldStore] unsupported registry category', {
            rowId,
            category,
          });
          break;
      }

      console.log('[Delete][FieldStore]', {
        rowId,
        category,
        action: 'removed',
      });
    } catch (err) {
      console.error('[Delete][FieldStore] failed', {
        rowId,
        category,
        err,
      });
    }
  }

  private removeFieldRowByOwnerFallback(
    owner: TransformNode | AbstractMesh | null | undefined
  ): void {
    if (!owner) return;

    const meta = (owner as any).metadata ?? {};
    const rowId = meta.fieldRowId ?? null;
    const type = meta.type ?? null;

    if (!rowId) return;

    try {
      if (type === 'obstacle' || type === 'landscape') {
        this.fieldDomainStore.removeObstacle?.(rowId);
      } else if (type === 'customZone') {
        this.fieldDomainStore.removeZone?.(rowId);
      } else if (type === 'observeZone' || type === 'observe') {
        this.fieldDomainStore.removeObserve?.(rowId);
      }

      console.log('[Delete][FieldStoreFallback]', {
        rowId,
        type,
        action: 'removed',
      });
    } catch (err) {
      console.error('[Delete][FieldStoreFallback] failed', {
        rowId,
        type,
        err,
      });
    }
  }

  private clearOwnerInteractionState(
    owner: TransformNode | AbstractMesh | null | undefined
  ): void {
    const ownerUid = owner?.uniqueId ?? null;

    if (this.gizmoManager?.attachedMesh && ownerUid != null) {
      const attachedUid = (this.gizmoManager.attachedMesh as any)?.uniqueId ?? null;
      if (attachedUid === ownerUid) {
        this.gizmoManager.attachToMesh(null);
        console.log('[Delete][State] gizmo detached');
      }
    }

    if (this.selectedOwner?.uniqueId === ownerUid) {
      this.selectedOwner = null;
    }

    if (this.selectedMesh) {
      const selectedOwner = this.resolveSceneObjectOwner(this.selectedMesh as any);
      if (selectedOwner?.uniqueId === ownerUid) {
        this.selectedMesh = null;
      }
    }

    if (this.phase2EditingOwner?.uniqueId === ownerUid) {
      this.phase2EditingOwner = null;
    }

    if (this.phase2EditingMesh) {
      const editingOwner = this.resolveSceneObjectOwner(this.phase2EditingMesh as any);
      if (editingOwner?.uniqueId === ownerUid) {
        this.phase2EditingMesh = null;
      }
    }

    if (this.phase2SelectedOwner?.uniqueId === ownerUid) {
      this.phase2SelectedOwner = null;
    }

    if (this.ctxMenuTargetMesh) {
      const ctxOwner = this.resolveSceneObjectOwner(this.ctxMenuTargetMesh as any);
      if (ctxOwner?.uniqueId === ownerUid) {
        this.ctxMenuTargetMesh = null;
        this.ctxMenuTargetUniqueId = null;
      }
    }

    if (this.pinnedPickMesh) {
      const pinnedOwner = this.resolveSceneObjectOwner(this.pinnedPickMesh as any);
      if (pinnedOwner?.uniqueId === ownerUid) {
        this.pinnedPickMesh = null;
      }
    }

    if (this.hoveredPickMesh) {
      const hoveredOwner = this.resolveSceneObjectOwner(this.hoveredPickMesh as any);
      if (hoveredOwner?.uniqueId === ownerUid) {
        this.hoveredPickMesh = null;
      }
    }

    if (this.pinnedOwnerUniqueId === ownerUid) {
      this.pinnedOwnerUniqueId = null;
    }

    if (this.hoveredOwnerUniqueId === ownerUid) {
      this.hoveredOwnerUniqueId = null;
    }

    if (this.hoveredAntennaOwnerUniqueId === ownerUid) {
      this.hoveredAntennaOwnerUniqueId = null;
    }

    for (const vm of this.antennaLabels) {
      vm.isHovered = false;
      vm.visible = false;
    }

    this.activeCardVM = null;
    this.updateHighlight?.();

    console.log('[Delete][State]', {
      ownerUid,
      action: 'cleared',
    });
  }

  private deleteSceneObjectByOwner(
    target: TransformNode | AbstractMesh | null | undefined
  ): void {
    if (!this.guardEditWrite('deleteSceneObjectByOwner')) return;
    if (!target) return;

    const owner =
      this.resolveSceneObjectOwner(target as any) ?? (target as any);
    if (!owner) return;

    const entry = this.getRegistryEntryByOwner(owner as any);

    console.log('[Delete][Owner]', {
      targetName: (target as any)?.name ?? null,
      ownerName: (owner as any)?.name ?? null,
      ownerUid: (owner as any)?.uniqueId ?? null,
      rowId: entry?.rowId ?? (owner as any)?.metadata?.fieldRowId ?? null,
      category: entry?.category ?? (owner as any)?.metadata?.category ?? null,
      type: (owner as any)?.metadata?.type ?? null,
    });

    // 1) clear UI / interaction first
    this.clearOwnerInteractionState(owner as any);

    // 2) remove field store row
    if (entry) {
      this.removeFieldRowByRegistryEntry(entry);
    } else {
      this.removeFieldRowByOwnerFallback(owner as any);
    }

    // 3) unregister registry
    const rowId = entry?.rowId ?? (owner as any)?.metadata?.fieldRowId ?? null;
    this.unregisterSceneObjectByRowId(rowId);

    // 4) dispose owner hierarchy
    try {
      const childMeshes: AbstractMesh[] =
        (owner as any)?.getChildMeshes?.(false) ?? [];

      for (const child of childMeshes) {
        try {
          child.dispose(false, true);
        } catch (err) {
          console.warn('[Delete][DisposeChild] failed', {
            child: child?.name,
            err,
          });
        }
      }

      if ((owner as any).dispose) {
        (owner as any).dispose(false, true);
      }

      console.log('[Delete][Dispose]', {
        owner: (owner as any)?.name ?? null,
        ownerUid: (owner as any)?.uniqueId ?? null,
        childCount: childMeshes.length,
      });
    } catch (err) {
      console.error('[Delete][Dispose] failed', err);
    }

    // 5) close menu / properties mode
    this.isMenuVisible = false;
    this.isPropertiesMode = false;
  }

  // ===== [PROPERTIES:MODE_CONTROL] =====
  // Purpose: Enter/exit properties editing mode
  // ==========================================
  closePropertiesMode(): void {
    console.log('[RightClickMenu] Exiting properties mode');
    this.isPropertiesMode = false;
    // Keep menu visible but switch back to action buttons
  }

  // ===== [PROPERTIES:TRANSACTION] =====
  // Purpose: Confirm or cancel property changes
  // ==========================================
  confirmChanges(): void {
    if (!this.guardEditWrite('confirmChanges')) return;
    console.log('[RightClickMenu] Changes confirmed');
    // Changes are already applied in real-time via updateMeshTransform
    // Just clear snapshot and close
    this.initialTransform = null;
    this.closeContextMenu();
  }

  cancelChanges(): void {
    if (!this.guardEditWrite('cancelChanges')) return;
    console.log('[RightClickMenu] Changes cancelled, restoring initial transform');
    
    if (this.selectedMesh && this.initialTransform) {
      // Restore mesh to initial state
      this.selectedMesh.position.copyFrom(this.initialTransform.position);
      this.selectedMesh.rotation.copyFrom(this.initialTransform.rotation);
      this.selectedMesh.scaling.copyFrom(this.initialTransform.scaling);
      
      console.log('[RightClickMenu] Transform restored:', {
        position: this.selectedMesh.position,
        rotation: this.selectedMesh.rotation,
        scaling: this.selectedMesh.scaling
      });
    }
    
    this.initialTransform = null;
    this.closeContextMenu();
  }

  // ===== [PROPERTIES:ROTATION_GETTER] =====
  // Purpose: Get current rotation in degrees from radians
  // ==========================================
  getCurrentRotationDegrees(axis: 'x' | 'y' | 'z'): number {
    if (!this.selectedMesh) return 0;
    
    // ✅ Get transform from owner mesh if it's a GLB child
    const targetMesh = this.getTransformTargetMesh(this.selectedMesh);
    
    const rotationRad = axis === 'x' ? targetMesh.rotation.x :
                       axis === 'y' ? targetMesh.rotation.y :
                       targetMesh.rotation.z;
    
    // Convert radians to degrees
    const degrees = rotationRad * (180 / Math.PI);
    return Math.round(degrees * 10) / 10; // Round to 1 decimal place
  }

  // ===== [PROPERTIES:SCALE_GETTER] =====
  // Purpose: Get current scale for individual axes
  // ==========================================
  getCurrentScale(axis: 'x' | 'y' | 'z'): number {
    if (!this.selectedMesh) return 1;
    
    const targetMesh = this.getTransformTargetMesh(this.selectedMesh);
    
    const scale = axis === 'x' ? targetMesh.scaling.x :
                  axis === 'y' ? targetMesh.scaling.y :
                  targetMesh.scaling.z;
    
    return Math.round(scale * 100) / 100; // Round to 2 decimal places
  }

  // ===== [PROPERTIES:OWNER_RESOLUTION] =====
  // Purpose: Resolve transform target (owner mesh for GLB children)
  // ==========================================
  private getTransformTargetMesh(mesh: AbstractMesh): AbstractMesh {
    const meta = (mesh as any)?.metadata;

    const debugOwnerUid = meta?.ownerMeshUniqueId ?? meta?.ownerMeshId;
    const debugOwner = (typeof debugOwnerUid === 'number' && this.scene)
      ? this.scene.getMeshByUniqueId(debugOwnerUid)
      : null;


    const ownerUid = meta?.ownerMeshUniqueId;

    if (typeof ownerUid === 'number' && this.scene) {
      const ownerMesh = this.scene.getMeshByUniqueId(ownerUid);
      if (ownerMesh) {
        console.log('[getTransformTargetMesh] Using owner mesh:', ownerMesh.name);
        return ownerMesh;
      }
    }

  
    
    return mesh;
  }

  // ===== [PROPERTIES:GROUND_ALIGNMENT] =====
  // Purpose: Align object bottom to ground surface after scaling
  // ==========================================
  private alignToGround(target: AbstractMesh, surfaceY: number = 0): void {
    if (!target) return;
    
    try {
      // Ensure world matrix is up to date
      target.computeWorldMatrix(true);
      
      // Get bounding box in world coordinates
      const boundingVectors = target.getHierarchyBoundingVectors();
      const minBoundY = boundingVectors.min.y;
      
      // Calculate difference between current bottom and surface
      const diff = surfaceY - minBoundY;
      
      // Compensate position to align bottom to surface
      target.position.y += diff;
      
      console.log('[alignToGround] Aligned to ground:', {
        meshName: target.name,
        minBoundY,
        surfaceY,
        diff,
        newPositionY: target.position.y
      });
    } catch (error) {
      console.error('[alignToGround] Error aligning mesh:', error);
    }
  }

  // ===== [PROPERTIES:MESH_TRANSFORM_UPDATE] =====
  // Purpose: Update mesh properties in real-time
  // ==========================================
  updateMeshTransform(
    property: 'scale' | 'scaleX' | 'scaleY' | 'scaleZ' | 'height' | 'rotationX' | 'rotationY' | 'rotationZ',
    value: number,
    _unused1?: any,
    _unused2?: any
  ): void {
    if (!this.guardEditWrite('updateMeshTransform')) return;
    if (!this.selectedMesh) {
      console.warn('[updateMeshTransform] No mesh selected');
      return;
    }

    // ✅ [OWNER_RESOLUTION] Get transform target (owner for GLB children)
    const targetMesh = this.getTransformTargetMesh(this.selectedMesh);
    
    console.log('[updateMeshTransform] Updating', property, 'to', value, 'on mesh:', targetMesh.name);

    try {
      switch (property) {
        case 'scale':
          // Update all axes uniformly
          targetMesh.scaling.x = Math.max(0.1, value);
          targetMesh.scaling.y = Math.max(0.1, value);
          targetMesh.scaling.z = Math.max(0.1, value);
          console.log('[updateMeshTransform] Uniform scale updated to:', value);
          // ✅ Align to ground after scaling
          this.alignToGround(targetMesh, 0);
          break;

        case 'scaleX':
          // Update only X axis (長)
          targetMesh.scaling.x = Math.max(0.1, value);
          console.log('[updateMeshTransform] Scale X updated to:', value);
          // ✅ Align to ground after X scaling
          this.alignToGround(targetMesh, 0);
          break;

        case 'scaleY':
          // Update only Y axis (高)
          targetMesh.scaling.y = Math.max(0.1, value);
          console.log('[updateMeshTransform] Scale Y updated to:', value);
          // ✅ Align to ground after Y scaling
          this.alignToGround(targetMesh, 0);
          break;

        case 'scaleZ':
          // Update only Z axis (寬)
          targetMesh.scaling.z = Math.max(0.1, value);
          console.log('[updateMeshTransform] Scale Z updated to:', value);
          // ✅ Align to ground after Z scaling
          this.alignToGround(targetMesh, 0);
          break;

        case 'height':
          // ✅ Treat value as relative height offset from ground
          // First align to ground, then apply offset
          this.alignToGround(targetMesh, 0);
          targetMesh.position.y += Math.max(0, value);
          console.log('[updateMeshTransform] Height offset applied:', value);
          break;

        case 'rotationX':
          // Convert degrees to radians
          const radX = value * (Math.PI / 180);
          targetMesh.rotation.x = radX;
          console.log('[updateMeshTransform] Rotation X updated to:', value, 'degrees (', radX, 'radians)');
          break;

        case 'rotationY':
          // Convert degrees to radians
          const radY = value * (Math.PI / 180);
          targetMesh.rotation.y = radY;
          console.log('[updateMeshTransform] Rotation Y updated to:', value, 'degrees (', radY, 'radians)');
          break;

        case 'rotationZ':
          // Convert degrees to radians
          const radZ = value * (Math.PI / 180);
          targetMesh.rotation.z = radZ;
          console.log('[updateMeshTransform] Rotation Z updated to:', value, 'degrees (', radZ, 'radians)');
          break;
      }

      // ===== [Patch 6] Sync to field store after transform =====
      this.syncSelectedSceneObjectToFieldStore('manual');

    } catch (error) {
      console.error('[updateMeshTransform] Error updating mesh:', error);
    }
  }

  // ===== [CANVAS_CLICK:HANDLER] =====
  // Purpose: Close menu when clicking outside (disabled in properties mode)
  // ====================================
  onCanvasClick(): void {
    if (!this.isEditMode()) return;
    // ✅ [LOCK] Completely block any action when properties mode is active
    if (this.isPropertiesMode) {
      console.log('[CanvasClick] Blocked - properties mode active');
      return;
    }
    
    // ✅ [TRANSACTION] Do NOT auto-close when in properties editing mode
    // User must explicitly click Confirm or Cancel buttons
    if (this.isMenuVisible && !this.isPropertiesMode) {
      this.closeContextMenu();
    }
  }

  // -------------------- Phase 4: Left Sidebar → Placement Mode (Shape Buttons) --------------------
  // Template 會呼叫 onShapeButtonClick(shapeId)。
  // 這裡：基本物件(box/sphere/cylinder) + 觀測區域 + 自訂分區 + 天線(antenna/das_antenna)
  onShapeButtonClick(shapeId: string): void {
    if (!this.guardEditWrite('onShapeButtonClick')) return;
    // Stage gate
    if (this.stage !== 'edit') {
      console.log('[Phase4][PlacementMode][Shape] ignored (not in edit stage)', {
        stage: this.stage,
        shapeId,
      });
      return;
    }

    // Toggle: clicking the active button again cancels placement mode
    if (this.phase4PendingItemId === shapeId && this.placementMode !== 'none') {
      this.placementMode = 'none';
      this.phase4PendingItemId = null;
      this.phase4SingleShot = null;
      return;
    }

    // Phase 2：進入放置前先退出 gizmo（避免 click-chain 殘留）
    if (this.phase2EditingOwner) {
      this.phase2ExitEditing();
    }

    // Single-shot safety: changing mode cancels any pending click intent
    this.phase4SingleShot = null;

    // 記住使用者點的 item
    this.phase4PendingItemId = shapeId;

    // 分流：你若有更精準的 id 規則，可之後再改（目前用命名包含判斷，最不侵入）
    const id = (shapeId || '').toLowerCase();

    // DAS 天線
    if (id === 'das_antenna') {
      this.placementMode = 'antenna';
      this.phase4PendingItemId = 'das_antenna';
    }
    // 標準天線與可放置基站位置
    else if (id === 'antenna_1' || id === 'antenna_placeable') {
      this.placementMode = 'antenna';
    }
    // RIS 智慧反射面板與可放置RIS位置
    else if (id === 'ris_panel' || id === 'ris_placeable') {
      this.placementMode = 'ris';
    }
    // 終端
    else if (id.includes('phone') || id.includes('terminal')) {
      this.placementMode = 'terminal';
    }
    // observe / observation 走觀測區域
    else if (id.includes('observe') || id.includes('observation')) {
      this.placementMode = 'observeZone';
    }
    // zone / partition 走自訂分區
    else if (id.includes('zone') || id.includes('partition')) {
      this.placementMode = 'customZone';
    }
    // 景觀（樹木等）
    else if (id.includes('tree') || id.includes('landscape')) {
      this.placementMode = 'landscape';
    }
    // 其餘視為 primitive：box/sphere/cylinder
    else {
      this.placementMode = 'obstacle';
    }

    console.log('[ShapeSelect][Mode]', {
      shapeId,
      placementMode: this.placementMode,
    });

    console.log('[Phase4][PlacementMode][Shape]', {
      stage: this.stage,
      shapeId,
      placementMode: this.placementMode,
      pendingItemId: this.phase4PendingItemId,
    });

    // Entering placement mode should cancel Phase 2 click-chain
    this.phase2LastClickAt = 0;
    this.phase2LastClickPickId = null;
    this.phase2SelectedOwner = null;
  }

  // -------------------- End Phase 4: Shape Buttons --------------------
  // ===== [EXPORT] GLB + Project JSON (recommended) =====
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private buildProjectMetaJson(): any {
    const scene = this.scene;
    if (!scene) return null;

    // 只序列化你關心的「可恢復功能」資料：
    // - 元件：antenna / terminal / ris / obstacle ...
    // - 建築：building（含 OSM id/高度/自訂參數）
    // - 地圖：bbox / reference point（若你有 commit）
    const meshes = (scene.meshes ?? [])
      .filter((m: any) => !!m && !m.isDisposed?.())
      .map((m: any) => ({
        uniqueId: m.uniqueId,
        name: m.name,
        position: m.position ? { x: m.position.x, y: m.position.y, z: m.position.z } : null,
        rotation: m.rotation ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z } : null,
        scaling: m.scaling ? { x: m.scaling.x, y: m.scaling.y, z: m.scaling.z } : null,
        metadata: m.metadata ?? null,
      }));

    return {
      version: 1,
      exportedAtISO: new Date().toISOString(),
      projectName: this.sceneName ?? 'project',
      meshes,
      // TODO: 若你有 committed bbox/referencePoint，應該也一起存：
      // map: { bbox: ..., referencePoint: ... }
    };
  }

  private shouldExportNode(node: any): boolean {
    const name = (node?.name ?? '') as string;

    // 避免把「射線」也匯出進 GLB（不影響 B1-7）
    if (name.includes('signal_heat_ray')) return false;

    // 避免把 gizmo / helper 匯出
    if (name.toLowerCase().includes('gizmo')) return false;

    return true;
  }

  async exportProjectAsGlbAndJson(): Promise<void> {
    const scene = this.scene;
    if (!scene) {
      console.warn('[Export] abort: this.scene is null');
      return;
    }

    const baseName = (this.sceneName || 'project').replace(/\s+/g, '_');

    // 1) Export GLB
    console.log('[Export] GLBAsync start');
    const glb = await GLTF2Export.GLBAsync(scene, baseName, {
      shouldExportNode: (node: any) => this.shouldExportNode(node),
    });

    // Babylon exporter returns a dict of files
    const glbBlob = glb.glTFFiles[`${baseName}.glb`] as Blob;
    this.downloadBlob(glbBlob, `${baseName}.glb`);
    console.log('[Export] GLB download ready', { file: `${baseName}.glb` });

    // 2) Export Project JSON (planner state)
    const meta = this.buildProjectMetaJson();
    const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    this.downloadBlob(metaBlob, `${baseName}.project.json`);
    console.log('[Export] project json download ready', { file: `${baseName}.project.json` });
  }

  // =====================
  // DEBUG Flag
  // =====================
  private readonly DEBUG_STAY_IN_EDITSCENE = true;
  private readonly DEBUG_HEATMAP = false;


  // --- loading overlay ---
  private setLoading(on: boolean, message = '載入中...'): void {
    this.loading = on;
    this.loadingMessage = message || '載入中...';

    if (on) {
      this.loadingError = false;
      this.loadingErrorMessage = '';
    }
  }

  // --- 新增：左側面板所需的按鈕清單 ---
  public primitiveShapes = [
    { id: 'box', label: '立方體', icon: 'assets/icons/square3Dbtn.png' },
    { id: 'sphere', label: '球體', icon: 'assets/icons/circle3Dbtn.png' }
  ];

  public landscapeShapes = [
    { id: 'tree', label: '樹木', icon: 'assets/icons/tree3Dbtn.png' },
  ];

  public antennaShapes = [
    { id: 'antenna_1', label: '基地台', icon: 'assets/icons/basestation3Dbtn.png' },
    { id: 'ris_panel', label: '智慧反射面板', icon: 'assets/icons/ris3Dbtn.png' },
    { id: 'antenna_placeable', label: '可放置基站位置', icon: 'assets/icons/candidateBs3Dbtn.png' },
    { id: 'ris_placeable', label: '可放置RIS位置', icon: 'assets/icons/candidateRis3Dbtn.png' }
  ];
  
  public goalMode: GoalMode = 'simulation';
  
  public get visibleAntennaShapes() {
    if (this.goalMode === 'planning') {
      return this.antennaShapes;
    }
    return this.antennaShapes.filter(
      (shape) => shape.id !== 'antenna_placeable' && shape.id !== 'ris_placeable'
    );
  }

  public terminalShapes = [{ id: 'phone', label: '行動終端', icon: 'assets/icons/phone3Dbtn.png' }];
  public observeShapes = [{ id: 'observe_rect', label: '觀測區', icon: 'assets/icons/observe.svg' }];
  public zoneShapes = [{ id: 'zone_rect', label: '自訂分區', icon: 'assets/icons/area.svg' }];

  // ===== [B1:RESULT_SERVICE] =====
  public readonly resultService = inject(ResultDataService);

  private isEditMode(): boolean {
    return this.resultService.viewMode() === 'edit';
  }

  private guardEditWrite(op: string): boolean {
    if (this.isEditMode()) return true;
    console.log('[ResultMode][WRITE-BLOCK]', op);
    return false;
  }

  // ===== [B1:SIGRAY_MESH_CACHE] =====
  // Cache GreasedLine meshes created by drawSignalRays() so we can dispose them when back to edit.
  private __signalRayMeshes: any[] = [];

  // ===== [SIGRAY:P4.3:STATE] =====
  // Purpose: Keep references to last rendered ray lines for cleanup.
  // =================================
  private __sigRayLineMeshes: Mesh[] = [];

  // ===== [RIGHT_CLICK_MENU:STATE] =====
  // Purpose: Manage context menu visibility and position
  // ====================================
  isMenuVisible: boolean = false;
  menuPosition = { x: 0, y: 0 };
  selectedMesh: AbstractMesh | null = null;
  /** Scene root for gizmo / picking; shared with phase2 gizmo flow (do not add a second owner ref). */
  selectedOwner: TransformNode | AbstractMesh | null = null;
  /** Field panel card selection; cleared when gizmo detaches. */
  private selectedFieldCard: FieldCardSelectPayload | null = null;
  private ctxMenuTargetMesh: import('@babylonjs/core').AbstractMesh | null = null;
  private ctxMenuTargetUniqueId: number | null = null;
  isCurrentlyRightClick: boolean = false; // Track right-click state globally
  isPropertiesMode: boolean = false; // Track if we're in properties editing mode
  isDraggingMenu: boolean = false;
  menuDragOffset = { x: 0, y: 0 };
  private menuMouseMoveListener = (event: MouseEvent) => this.onMenuMouseMove(event);
  private menuMouseUpListener = (event: MouseEvent) => this.onMenuMouseUp(event);

  private readonly contextMenuItemsByKind: Record<ContextMenuKind, ContextMenuItem[]> = {
    obstacle: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
      { id: 'material', label: '材質設定' },
    ],
    existingBs: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
      { id: 'bsParams', label: '基地台參數' },
      // { id: 'antennaParams', label: '天線參數' },
      // { id: 'addAntenna', label: '新增天線' },
    ],
    ris: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
      { id: 'risParams', label: 'RIS參數' },
    ],
    ue: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
      { id: 'rxPower', label: '接收功率' },
    ],
    observe: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
    ],
    zone: [
      { id: 'enterScaleEdit', label: '進入縮放/編輯（Gizmo）' },
      { id: 'delete', label: '刪除物件' },
      { id: 'duplicate', label: '複製物件' },
      { id: 'properties', label: '物件大小/位置設定' },
      { id: 'zonePathLossModel', label: '分區衰減模型設定' },
    ],
  };
  
  // ===== [PROPERTIES:SNAPSHOT] =====
  // Purpose: Store initial transform state for cancel operation
  // ====================================
  private initialTransform: {
    position: Vector3;
    rotation: Vector3;
    scaling: Vector3;
  } | null = null;

  // ===== [SIMULATION:STATE] =====
  // Purpose: Track simulation progress and results
  // ====================================
  isSimulationDone: boolean = false;                    // 熱力圖控制工具列顯示標誌
  simulationGrid: Vector3[] = [];                       // 空間格點座標
  gridDataBuffer: Float32Array | null = null;          // SINR 運算結果
  private readonly GRID_MAX_POINTS = 50000;             // 性能限制：最多 50,000 個格點

  // ===== [HEATMAP:PLANE_MANAGEMENT] =====
  // Purpose: Manage heatmap plane rendering and interaction
  // ============================================
  private heatmapPlane: Mesh | null = null;            // 熱力圖平面 Mesh
  private heatmapTexture: DynamicTexture | null = null;// 動態紋理
  private heatmapDynTexture?: DynamicTexture;          // ✅ 新增：獨立的 DynamicTexture 參考
  private heatmapTexW = 512;                            // ✅ 新增：紋理寬度
  private heatmapTexH = 512;                            // ✅ 新增：紋理高度
  heatmapSliceHeight: number = 1.5;                     // 切片高度（預設 1.5m）
  heatmapMinValue: number = 0;                         // 色階最小值（SINR 預設 0dB）
  heatmapMaxValue: number = 30;                        // 色階最大值（SINR 預設 30dB）
  heatmapCurrentMode: string = 'sinr';                  // 當前顯示模式：'sinr' | 'rsrp' | 'coverage'

  // ✅ 目前 heatmap 模式（與 banner 同步）
  heatmapMode: DistributionMode = 'sinr';

  private distMode: DistributionMode = 'rsrp';

  private committedRangeByMode: Record<'rsrp' | 'sinr' | 'ul_rate' | 'dl_rate', { min: number; max: number }> = {
    rsrp: { min: -120, max: -60 },
    sinr: { min: 0, max: 30 },
    ul_rate: { min: 0, max: 200 },
    dl_rate: { min: 0, max: 1000 },
  };

  /** Phase 8: skip Plotly/PNG when switching back to same mode + range + slice */
  private heatmapRenderCache = new Map<string, CachedHeatmapRender>();

  /** Last heatmap that actually succeeded (colorbar matches this, not transient distMode) */
  private currentRenderedColorbarState: {
    mode: DistributionMode;
    min: number;
    max: number;
    title: string;
    unit: string;
    colorscale?: any;
  } | null = null;

  /** Binary coverage heatmap: 0 = uncovered, 1 = covered (Plotly z) */
  private readonly HM_COLORSCALE_COVERAGE_BINARY: any[] = [
    [0.0, '#8c1d18'],
    [1.0, '#34c759'],
  ];

  private readonly HM_COLORSCALE_STRONG_RED: any = [
    [0.0, '#1f3cff'],
    [0.1, '#0080ff'],
    [0.2, '#00c8ff'],
    [0.3, '#00ff88'],
    [0.4, '#7fff00'],
    [0.5, '#ffff00'],
    [0.6, '#ffc800'],
    [0.7, '#ff9800'],
    [0.8, '#ff6600'],
    [0.9, '#ff3300'],
    [1.0, '#ff0000'],
  ];

  private readonly DIST_MODE_META = {
    rsrp: { title: 'RSRP (dBm)', unit: 'dBm', colorscale: this.HM_COLORSCALE_STRONG_RED },
    sinr: { title: 'SINR (dB)', unit: 'dB', colorscale: this.HM_COLORSCALE_STRONG_RED },
    ul_rate: { title: 'UL Rate (Mbps)', unit: 'Mbps', colorscale: this.HM_COLORSCALE_STRONG_RED },
    dl_rate: { title: 'DL Rate (Mbps)', unit: 'Mbps', colorscale: this.HM_COLORSCALE_STRONG_RED },
  } as const;

  private logHeatmapModeSourceAndRange(
    distributionMode: DistributionMode,
    zmin: number,
    zmax: number,
    actualSource: string
  ): void {
    const out = this.lastCompleteCalcResult?.['5GOutput'];
    const modeForLog = distributionMode;

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][MODE_SOURCE]', {
        mode: modeForLog,
        hasSinrMap: !!out?.sinrMap,
        hasRsrpMap: !!out?.rsrpMap,
        hasThroughputMap: !!out?.throughputMap,
        hasUlThroughputMap: !!out?.ulThroughputMap,
        actualSource,
      });
    }

    const rangeUnit =
      distributionMode === 'coverage'
        ? 'state'
        : distributionMode === 'rsrp'
          ? 'dBm'
          : distributionMode === 'sinr'
            ? 'dB'
            : distributionMode === 'ul_rate' || distributionMode === 'dl_rate'
              ? 'Mbps'
              : '';

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][RANGE]', {
        mode: modeForLog,
        zmin,
        zmax,
        unit: rangeUnit || undefined,
      });
    }
  }

  private debugHeatmapMatrix(tag: string, matrix: number[][]): void {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][MATRIX_DEBUG]', { tag, empty: true }); }
      return;
    }

    const flat = matrix.flat().filter((v) => Number.isFinite(v));
    const sorted = [...flat].sort((a, b) => a - b);

    const pick = (p: number) => {
      if (!sorted.length) return null;
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
      return sorted[idx];
    };

    const headRows = matrix.slice(0, 3).map((row) => row.slice(0, 8));
    const midStart = Math.max(0, Math.floor(matrix.length / 2) - 1);
    const midRows = matrix.slice(midStart, midStart + 3).map((row) => row.slice(0, 8));
    const tailRows = matrix.slice(-3).map((row) => row.slice(0, 8));

    const mean = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null;
    const variance = flat.length
      ? flat.reduce((a, b) => a + Math.pow(b - (mean ?? 0), 2), 0) / flat.length
      : null;
    const std = variance != null ? Math.sqrt(variance) : null;

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][MATRIX_DEBUG]', {
        tag,
        rows: matrix.length,
        cols: matrix[0]?.length ?? 0,
        count: flat.length,
        min: flat.length ? sorted[0] : null,
        max: flat.length ? sorted[sorted.length - 1] : null,
        mean,
        std,
        p10: pick(0.10),
        p50: pick(0.50),
        p90: pick(0.90),
        uniqueApprox: new Set(flat.map((v) => Number(v).toFixed(2))).size,
        headRows,
        midRows,
        tailRows,
      });
    }
  }

  private coverageThreshold: CoverageFilter = 'rsrp_minus_120';
  private coverageOverlayMap = new Map<string, { mesh: AbstractMesh; rsrpRep: number; sinrRep: number }>();
  private coverageOverlayRoot: TransformNode | null = null;
  
  // ===== [HEATMAP:TOOLTIP] =====
  // Purpose: Interactive tooltip display
  // ============================================
  tooltipPosition = { x: 0, y: 0 };                     // Tooltip 螢幕座標
  tooltipVisible: boolean = false;                      // Tooltip 顯示狀態
  tooltipData = {
    positionX: 0,
    positionZ: 0,
    value: 0,
    unit: 'dB',
    valueLabel: '訊號強度',
    connectionTarget: ''
  };                                                    // Tooltip 數值內容
  
  // ===== [HEATMAP:HOVER_TRACKING] =====
  // Purpose: Track hover position and manage 1.5-second delay before showing tooltip
  // ====================================================
  private hoverTimer: any = null;                       // 延遲顯示 Tooltip 的計時器
  private lastHoverPoint: Vector3 | null = null;        // 上次懸停位置
  private lastHoverGridIndex: number = -1;              // 上次懸停的格點索引
  private lastMouseClient = { x: 0, y: 0 };             // 目前滑鼠的 viewport 座標（clientX/Y）
  private readonly HOVER_DISTANCE_THRESHOLD = 0.2;      // 移動距離門檻（0.2m，更敏感）
  private readonly HOVER_DELAY_MS = 500;                // Tooltip 顯示延遲（0.5 秒）

  // ===== [PLOTLY_HEATMAP:STATE] =====
  // Purpose: Plotly-based heatmap pipeline state (dedicated, not reusing legacy fields)
  // ===================================================
  private plotlyHeatmapPlane: Mesh | null = null;       // Plotly heatmap plane Mesh
  private plotlyHeatmapTexture: DynamicTexture | null = null; // Plotly heatmap texture
  private plotlyHeatmapImageBase64: string | null = null;    // Base64 encoded heatmap image from Plotly
  private plotlyHeatmapCellSize = 1.0;                  // meters
  private plotlyHeatmapSliceHeight = 1.5;               // meters
  private heatmapMat?: StandardMaterial;                // Phase 5.1: Plotly heatmap material

  // ===== [PLOTLY_HEATMAP:HOVER_STATE] =====
  // Purpose: Provide world->grid mapping for tooltip on the baked PNG plane
  private plotlyHoverMeta: {
    min: Vector3;
    max: Vector3;
    nx: number;
    nz: number;
    cellSize: number;      // backend resolution (= input.resolution), kept for debug
    cellSizeX: number;     // backend resolution per cell, X axis (prioritized over floorWidth/nx)
    cellSizeZ: number;     // backend resolution per cell, Z axis (prioritized over floorDepth/nz)
    sliceY: number;
  } | null = null;

  private plotlyHoverZ: number[][] | null = null;
  private plotlyHoverUnit: 'dBm' | 'dB' | 'Mbps' | '' = 'dBm';
  private coverageHoverWinnerIdx: number[][] | null = null;
  private coverageHoverWinnerIdxAll: number[][] | null = null;
  private coverageWinnerOwnerUniqueIdGrid: Array<Array<number | null>> | null = null;
  private coverageHoverOwners: { name: string; uniqueId: number }[] = [];

  // ===== [PLOTLY_HEATMAP:HOVER_DELAY] =====
  private readonly PLOTLY_HOVER_DELAY_MS = 500;

  /** Phase 2: cap Plotly heatmap cell count; full-resolution z stays in plotlyHoverZ / cache. */
  private readonly MAX_PLOTLY_HEATMAP_CELLS = 100_000;

  private plotlyHoverTimer: any = null;
  private plotlyPendingHoverIndex: number | null = null;
  private plotlyPendingClientXY: { x: number; y: number } | null = null;

  // ===== [HEATMAP_PHASE5.X:DBG_MARKERS] =====
  // Purpose: Dev-only debug markers for strongest point and antenna cell
  // ====================================
  private heatmapDbgStrongestMarker?: Mesh;             // Phase 5.4A: Strongest RSRP point marker
  private heatmapDbgAntennaCellMarker?: Mesh;           // Phase 5.4B: Antenna cell center marker
  private dbgAltStrongestMarker?: Mesh;

  // ===== [DEBUG:GRIDBUILDER] =====
  // Purpose: Quick toggle for debug visualization
  // ====================================
  private DEBUG_HEATMAP_GRID = false;

  // ===== [COMPUTE_MODE:GATE] =====
  // Purpose: Route onStartCompute() to either SignalHeatRay or Plotly heatmap flow
  // ====================================
  private computeMode: 'signal-heat-ray' | 'plotly-heatmap' = 'plotly-heatmap';

  // ===== [HEATMAP_RESOLUTION:STRATEGY] =====
  // Purpose: Resolution mode for Plotly heatmap pipeline (Phase 0)
  // ====================================
  private heatmapResolutionMode: 'preview' | 'standard' | 'detail' = 'preview';

  // ===== [DEV:DEBUG_CONTROLS] =====
  // Purpose: Dev-only keyboard handler for resolution mode switching
  // ====================================
  private devHeatmapKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // ===== [UI][StartCompute:CAN_START] =====
  // Used by template: disable "Start Compute" when it cannot run.
  public canStartCompute(): boolean {
    // Only allow in edit mode
    try {
      if (this.resultService?.viewMode && this.resultService.viewMode() !== 'edit') return false;
    } catch {}

    // Prevent click during loading
    if ((this as any).computeLoading === true) return false;

    // If scene not ready, disable
    const scene = (this as any).scene;
    if (!scene) return false;

    // Gate by "has at least 1 base station / antenna"
    // Prefer using existing collector if available; otherwise fall back to a safe heuristic.
    try {
      if (typeof (this as any).p2_collectSignalNodes === 'function') {
        const { antennas } = (this as any).p2_collectSignalNodes(scene);
        return Array.isArray(antennas) && antennas.length > 0;
      }
    } catch {}

    // Fallback (do not block UI if collector fails):
    return true;
  }

  // -------------------- 開始運算 --------------------
  // async onStartCompute(): Promise<void> {
  //   console.log('[UI][StartCompute] ENTER onStartCompute', {
  //     time: new Date().toISOString(),
  //     viewMode: this.resultService.viewMode(),
  //     computeMode: this.computeMode,
  //   });

  //   if (!this.guardEditWrite('onStartCompute')) return;

  //   this.distMode = 'sinr';

  //   // ===== [SIM_API_PHASE3] API flow gate =====
  //   console.log('[SIM_API_PHASE3] Gate triggered, entering API flow');
  //   return this.runSimulationApiFlow();

  //   // ===== [COMPUTEMODE:OVERRIDE] =====
  //   // Allow runtime override via window.__computeModeOverride
    
  //   // ===== [WP6][ANCHOR:START_COMPUTE_LOADING] =====
  //   this.computeLoading = true;
  //   this.startComputeProgressTicker();

  //   const scene = this.scene;
  //   if (!scene) {
  //     console.warn('[SignalHeatRay][P1] abort: this.scene is null/undefined');
  //     return;
  //   }

  //   try {
  //     const forced = (window as any).__computeModeOverride;
  //     if (forced === 'plotly-heatmap' || forced === 'signal-heat-ray') {
  //       this.computeMode = forced;
  //     }

  //     console.log('[StartCompute] gate check', { computeMode: this.computeMode, heatmapResolutionMode: this.heatmapResolutionMode });
  //     console.log('[ComputeMode][DBG]', {
  //       computeMode: this.computeMode,
  //       override: (window as any).__computeModeOverride,
  //       enableRayOverlay: (window as any).__enableRayOverlay,
  //     });
  //     console.log('[HM][DEBUG] after gate check', {
  //       computeMode: this.computeMode,
  //     });

  //     // ===== [COMPUTE_MODE:GATE] =====
  //     // Route to Plotly heatmap flow if in plotly-heatmap mode
  //     if (this.computeMode === 'plotly-heatmap') {
  //       console.log('[HM][CHK] ENTER heatmap branch');
  //       // Phase 5.4C: Dev-only batch mode (3x resolution modes)
  //       const batch = (window as any).__hmBatch === true;
  //       if (batch) {
  //         const originalMode = this.heatmapResolutionMode;
  //         // Run preview (10m)
  //         this.heatmapResolutionMode = 'preview';
  //         console.log('[HM][CHK] BEFORE heatmap render');
  //         await this.runPlotlyHeatmapFlow();
  //         console.log('[HM][CHK] AFTER heatmap render');
  //         await new Promise(r => setTimeout(r, 50));

  //         // Run standard (5m)
  //         this.heatmapResolutionMode = 'standard';
  //         console.log('[HM][CHK] BEFORE heatmap render');
  //         await this.runPlotlyHeatmapFlow();
  //         console.log('[HM][CHK] AFTER heatmap render');
  //         await new Promise(r => setTimeout(r, 50));

  //         // Run detail (3m)
  //         this.heatmapResolutionMode = 'detail';
  //         console.log('[HM][CHK] BEFORE heatmap render');
  //         await this.runPlotlyHeatmapFlow();
  //         console.log('[HM][CHK] AFTER heatmap render');
  //         // ===== [SIGRAY:OVERLAY_AFTER_HEATMAP:CALL] =====
  //         // Overlay rays ONLY after the final (detail) heatmap render in batch mode
  //         this.overlaySignalRaysAfterHeatmap(scene, 'plotly-heatmap/batch/detail');
  //         // ===============================================
  //         await new Promise(r => setTimeout(r, 50));

  //         // Restore original mode
  //         this.heatmapResolutionMode = originalMode;
  //         console.log('[Heatmap][DBG] batch mode complete', { restoredMode: this.heatmapResolutionMode });
  //       } else {
  //         console.log('[HM][CHK] BEFORE heatmap render');
  //         await this.runPlotlyHeatmapFlow();
  //         console.log('[HM][CHK] AFTER heatmap render');
  //         // ===== [SIGRAY:OVERLAY_AFTER_HEATMAP:CALL] =====
  //         // Overlay rays after single heatmap render in non-batch mode
  //         this.overlaySignalRaysAfterHeatmap(scene, 'plotly-heatmap/single');
  //         // ===============================================
  //       }

  //       this.resultService.setResultData(RESULT_API_MOCK);
  //       this.resultService.setResultMvp(RESULT_MVP_MOCK);
  //       this.rightPanelType = null;
  //       console.log('[SignalHeatRay][Overlay] done (if enabled) before entering result mode');
  //       console.log('[Phase1] enter result mode after plotly heatmap');
  //       return;
  //     }

  //     console.log('[SignalHeatRay][P1] StartCompute clicked', {
  //       time: new Date().toISOString(),
  //     });

  //     // ✅ [Commit -1.2] 清理 legacy heatmap 資源
  //     this.disposeLegacyHeatmapAssets();

  //     // ✅ 清理舊有射線數據，確保乾淨狀態
  //     this.clearSignalRays();

  //     console.log('[SignalHeatRay][P1] scene ok', {
  //       meshCount: scene.meshes?.length ?? -1,
  //     });

  //     // Phase 1: mesh role scan (by metadata.type)
  //     let antenna = 0;
  //     let terminal = 0;
  //     let blocker = 0;

  //     for (const m of scene.meshes) {
  //       const t = (m as any)?.metadata?.type;
  //       if (t === 'antenna') antenna++;
  //       else if (t === 'terminal') terminal++;
  //       else if (t === 'building' || t === 'obstacle') blocker++;
  //     }

  //     console.log('[SignalHeatRay][P1] scan result', { antenna, terminal, blocker });

  //     // Phase 1: still do NOT compute rays, do NOT render
  //     // Phase 0：結果頁跳轉維持停用
  //     // this.router.navigate(['/result']);
    
  //     // ===== [SIGRAY:P2:LINK_GEOMETRY] =====
  //     // Purpose: Build a single link (A0 -> T0). Terminal determines ray direction.
  //     // Inputs: scene.meshes, metadata.type, mesh absolute positions
  //     // Outputs: from/to/distance/dir logs
  //     // Exit: return if missing antenna/terminal or invalid positions
  //     // Rollback: comment this block to keep only Phase 1 logs.
  //     // ====================================
  //     const { antennas, terminals, blockers } = this.p2_collectSignalNodes(scene);

  //     console.log('[SignalHeatRay][P2] nodes', {
  //       antenna: antennas.length,
  //       terminal: terminals.length,
  //       blocker: blockers.length,
  //     });

  //     // ✅ 檢查是否有基地台（終端不是必需的，熱力圖模擬只需要基地台）
  //     if (antennas.length === 0) {
  //       console.warn('[SignalHeatRay][P2] abort: need at least 1 antenna');
  //       return;
  //     }

  //     // ✅ 條件判斷：僅當同時有終端時才計算 Phase 2 link 資料
  //     if (antennas.length > 0 && terminals.length > 0) {
  //       const a0 = antennas[0];
  //       const t0 = terminals[0];

  //       const from = a0.getAbsolutePosition?.()?.clone?.() ?? a0.position?.clone?.();
  //       const to = t0.getAbsolutePosition?.()?.clone?.() ?? t0.position?.clone?.();

  //       if (!from || !to) {
  //         console.warn('[SignalHeatRay][P2] abort: cannot read positions', { from, to });
  //         return;
  //       }

  //       const vec = to.subtract(from);
  //       const distanceM = vec.length();
  //       const dir = vec.normalize();

  //       console.log('[SignalHeatRay][P2] link(A0->T0)', {
  //         antennaId: a0.uniqueId,
  //         terminalId: t0.uniqueId,
  //         from: from.toString?.() ?? from,
  //         to: to.toString?.() ?? to,
  //         distanceM,
  //         dir: dir.toString?.() ?? dir,
  //       });
  //     } else {
  //       console.log('[SignalHeatRay][P2] skip link calculation: no terminal available');
  //     }

  //   // ===== [SIGRAY:P4.4:FANOUT_ALL_ANTENNAS] =====
  //   // Purpose: render rays for ALL antennas (v1 multi-BS support)
  //   // Rollback: comment this block to disable ray fanout.
  //   // =============================================
  //   if (terminals.length === 0) {
  //     console.warn('[SignalHeatRay][P4.4] skip: no terminals -> no rays rendered');
  //   } else {
  //     this.p4_computeFanoutFromAntennas(scene, antennas, terminals, blockers);
  //   }

  //   // ✅ [Commit -1.1] 停用 legacy heatmap pipeline 入口
  //   console.log('[Heatmap][Plotly] start compute (legacy heatmap disabled)');
  //   // this.runHeatmapSimulation(scene, antennas, blockers);

  //   // ===== [GRIDBUILDER:PHASE1.3] =====
  //   // Purpose: Validate grid metadata and sample points (world grid verification)
  //   // ====================================
  //   if (this.floorMesh) {
  //     const gridMeta = this.buildHeatmapGridMeta(this.floorMesh, this.plotlyHeatmapCellSize);

  //     // Heatmap corner world points (for explicit (i,j)->(x,z) mapping)
  //     const nx = gridMeta.nx;
  //     const nz = gridMeta.nz;
  //     const p00 = this.getHeatmapSamplePoint(gridMeta.min, 0, 0, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight);
  //     const p10 = this.getHeatmapSamplePoint(gridMeta.min, nx - 1, 0, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight);
  //     const p01 = this.getHeatmapSamplePoint(gridMeta.min, 0, nz - 1, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight);
  //     const p11 = this.getHeatmapSamplePoint(gridMeta.min, nx - 1, nz - 1, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight);

  //     console.log('[DBG][HeatmapCorners]', {
  //       nx,
  //       nz,
  //       corner_00: { i: 0, j: 0, x: p00.x, z: p00.z },
  //       corner_10: { i: nx - 1, j: 0, x: p10.x, z: p10.z },
  //       corner_01: { i: 0, j: nz - 1, x: p01.x, z: p01.z },
  //       corner_11: { i: nx - 1, j: nz - 1, x: p11.x, z: p11.z },
  //     });

  //     // Sample three reference points: (0,0), (nx/2, nz/2), (nx-1, nz-1)
  //     const pMid = this.getHeatmapSamplePoint(
  //       gridMeta.min,
  //       Math.floor(nx / 2),
  //       Math.floor(nz / 2),
  //       this.plotlyHeatmapCellSize,
  //       this.plotlyHeatmapSliceHeight
  //     );

  //     console.log('[Heatmap][Grid] sample points', {
  //       p00_0_0: p00.toString?.() ?? p00,
  //       pMid: pMid.toString?.() ?? pMid,
  //       p11_max: p11.toString?.() ?? p11,
  //     });

  //     // Optional: antenna world -> heatmap grid index debug
  //     try {
  //       if ((window as any).__hmDebugWorldToIndex === true && scene) {
  //         const { antennas } = this.p2_collectSignalNodes(scene);
  //         const a0 = antennas[0] ?? null;
  //         if (a0 && typeof a0.getAbsolutePosition === 'function') {
  //           const pos = a0.getAbsolutePosition();
  //           const idx = this.hmDbgWorldToGridIndex(gridMeta.min, this.plotlyHeatmapCellSize, gridMeta.nx, gridMeta.nz, pos.x, pos.z);
  //           console.log('[DBG][WorldToHeatmapIndex]', {
  //             antennaName: a0.name,
  //             worldX: pos.x,
  //             worldZ: pos.z,
  //             i: idx.i,
  //             j: idx.j,
  //             nx,
  //             nz,
  //           });
  //         }
  //       }
  //     } catch (e) {
  //       console.warn('[DBG][WorldToHeatmapIndex] failed', e);
  //     }

  //     // ===== [DEBUG:GRIDBUILDER] =====
  //     // Purpose: Visualize grid sample points with debug spheres
  //     // ====================================
  //     const enableMarkers = (window as any).__hmDebugMarkers === true;
  //     if ((this.DEBUG_HEATMAP_GRID || enableMarkers) && scene) {
  //       const debugSpheres = [
  //         { pos: p00, name: '[DBG-HM-CORNER] 00', color: new Color3(1, 0, 0) }, // red
  //         { pos: p10, name: '[DBG-HM-CORNER] 10', color: new Color3(0, 1, 0) }, // green
  //         { pos: p01, name: '[DBG-HM-CORNER] 01', color: new Color3(0, 0, 1) }, // blue
  //         { pos: p11, name: '[DBG-HM-CORNER] 11', color: new Color3(1, 1, 0) }, // yellow
  //       ];

  //       for (const { pos, name, color } of debugSpheres) {
  //         const sphere = MeshBuilder.CreateSphere(name, { diameter: 0.3 }, scene);
  //         sphere.position = pos;
  //         sphere.material = new StandardMaterial(name + '_mat', scene);
  //         (sphere.material as StandardMaterial).emissiveColor = color;
  //       }

  //       console.log('[Heatmap][Grid] debug corner markers created', { nx, nz });
  //     }
  //   } else {
  //       console.warn('[Heatmap][Grid] abort: no floorMesh');
  //     }

  //     // ✅ 標記模擬完成，啟用 Banner 熱力圖控制工具列
  //     this.isSimulationDone = true;

  //     console.log('[SignalHeatRay][A-final] setResultMvp -> result mode');

  //     this.resultService.setResultData(RESULT_API_MOCK);
  //     this.resultService.setResultMvp(RESULT_MVP_MOCK);
  //   } finally {
  //     this.stopComputeProgressTicker();
  //     this.computeProgressPercent = 100;
  //     await new Promise(res => setTimeout(res, 120));

  //       this.computeLoading = false;
  //     }
  // }

  async onStartCompute(): Promise<void> {
    console.log('[DBG] onStartCompute click');

    if (!this.guardEditWrite('onStartCompute')) return;

    this.distMode = 'sinr';

    this.openComputeLoading();

    try {
      console.log('[SIM_API] start runSimulationApiFlow');

      await this.runSimulationApiFlow();

      console.log('[SIM_API] flow success');

      this.closeComputeLoading();

      } catch (e: any) {
        console.error('[SIM_API] flow failed', e);

        this.showComputeFailure(this.getComputeFailureMessage(e));
      }
  }

  // ===== [SIGRAY:OVERLAY_AFTER_HEATMAP:HELPER] =====
  // Purpose: Overlay signal rays on top of Plotly heatmap without switching computeMode.
  // Behavior:
  // - Clears previous rays to avoid duplicates
  // - Collects antennas/terminals/blockers
  // - Renders fanout rays if antennas+terminals exist
  // Toggle: window.__enableRayOverlay !== false (default ON)
  // Rollback: remove this helper and the call sites in onStartCompute().
  // ==================================================
  private overlaySignalRaysAfterHeatmap(scene: Scene, source: string): void {
    try {
      const enable = (window as any).__enableRayOverlay !== false; // default ON
      console.log('[SignalHeatRay][Overlay] enable?', enable, { source });

      if (!enable) return;

      // Avoid stacking duplicate rays across multiple computes / batch steps
      this.clearSignalRays();
      console.log('[SignalHeatRay][Overlay] cleared previous rays', { source });

      const { antennas, terminals, blockers } = this.p2_collectSignalNodes(scene);
      console.log('[SignalHeatRay][Overlay] nodes', {
        antenna: antennas.length,
        terminal: terminals.length,
        blocker: blockers.length,
        source,
      });

      if (antennas.length > 0 && terminals.length > 0) {
        this.p4_computeFanoutFromAntennas(scene, antennas, terminals, blockers);
        console.log('[SignalHeatRay][Overlay] fanout called', { source });
      } else {
        console.warn('[SignalHeatRay][Overlay] skip: need antenna+terminal', { source });
      }
    } catch (e) {
      console.warn('[SignalHeatRay][Overlay] failed', { source, e });
    }
  }

  // ===== [CLEANUP:LEGACY_HEATMAP] =====
  // 目的：清理 legacy heatmap 場景資源（plane、texture、material）
  // 呼叫時機：onStartCompute() 開頭，在新運算開始前
  // ====================================
  private disposeLegacyHeatmapAssets(): void {
    if (!this.guardEditWrite('disposeLegacyHeatmapAssets')) return;
    // ✅ 清理 legacy plane
    this.heatmapPlane?.dispose();
    this.heatmapPlane = null;

    // ✅ 清理 legacy texture（舊欄位）
    this.heatmapTexture?.dispose();
    this.heatmapTexture = null;

    // ✅ 清理 new DynamicTexture
    this.heatmapDynTexture?.dispose();
    this.heatmapDynTexture = undefined;

    console.log('[Heatmap][Legacy] disposed');
  }

// 用途：從 resultMvp.analysis.charts 取得指定 id 的圖表資料
private getMvpChart(id: string): { title: string; unit: string; data: { label: string; value: number }[] } | null {
  const mvp: any = this.resultService.resultMvp?.() ?? null;
  const charts = mvp?.analysis?.charts ?? [];
  const found = charts.find((c: any) => c.id === id);
  return found ? { title: found.title, unit: found.unit, data: found.data } : null;
}

// 用途：建立 Bar 圖 option
private buildBarOption(title: string, labels: string[], values: number[]): any {
  return {
    backgroundColor: 'transparent',
    title: { text: title, left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
    grid: { left: 40, right: 20, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#fff' },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#fff', formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 90,
        label: { show: true, position: 'top', color: '#fff', formatter: (p: any) => `${Number(p.value).toFixed(2)}%` },
      },
    ],
  };
}

// 用途：建立 Line 圖 option（CDF 用）
private buildLineOption(title: string, labels: string[], values: number[]): any {
  return {
    backgroundColor: 'transparent',
    title: { text: title, left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
    grid: { left: 40, right: 20, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#fff' },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#fff', formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        label: { show: true, position: 'top', color: '#fff', formatter: (p: any) => `${Number(p.value).toFixed(2)}%` },
      },
    ],
  };
}

// 用途：從 resultMvp 建立四張圖表 options（你現在 NULL 的原因就是沒跑這個）
private buildStatsChartsFromMvp(): void {
  const mvp: any = this.resultService.resultMvp?.() ?? null;
  const ids = (mvp?.analysis?.charts ?? []).map((c: any) => c.id);
  console.log('[StatsCharts] build enter', { hasMvp: !!mvp, chartIds: ids });

  const modHist = this.getMvpChart('modulation_hist');
  const modCdf = this.getMvpChart('modulation_cdf');
  const stHist = this.getMvpChart('strength_hist');
  const stCdf = this.getMvpChart('strength_cdf');

  if (!modHist || !modCdf || !stHist || !stCdf) {
    console.warn('[StatsCharts] missing chart data', { modHist, modCdf, stHist, stCdf });
    this.chartOptModHist = null;
    this.chartOptModCdf = null;
    this.chartOptStrengthHist = null;
    this.chartOptStrengthCdf = null;
    return;
  }

  this.chartOptModHist = this.buildBarOption(modHist.title, modHist.data.map(d => d.label), modHist.data.map(d => d.value));
  this.chartOptModCdf = this.buildLineOption(modCdf.title, modCdf.data.map(d => d.label), modCdf.data.map(d => d.value));
  this.chartOptStrengthHist = this.buildBarOption(stHist.title, stHist.data.map(d => d.label), stHist.data.map(d => d.value));
  this.chartOptStrengthCdf = this.buildLineOption(stCdf.title, stCdf.data.map(d => d.label), stCdf.data.map(d => d.value));

  console.log('[StatsCharts] options ready', {
    modHist: !!this.chartOptModHist,
    modCdf: !!this.chartOptModCdf,
    strHist: !!this.chartOptStrengthHist,
    strCdf: !!this.chartOptStrengthCdf,
  });
}

// 用途：保存 echarts 實例並在 panel 顯示/切換後強制 resize，避免空白
private _echartsInstances: any[] = [];

onChartInit(ec: any): void {
  console.log('[ECharts] chartInit', ec);
  this._echartsInstances.push(ec);

  // 初次 init 後延遲一次 resize（確保 DOM layout 已完成）
  setTimeout(() => {
    try { ec.resize(); } catch {}
  }, 0);
}

private resizeAllCharts(): void {
  setTimeout(() => {
    for (const ec of this._echartsInstances) {
      try { ec.resize(); } catch {}
    }
  }, 0);
}

// ===== [SIGRAY:B1.7:CLEANUP_BRIDGE] =====
// Purpose: Dispose all rendered GreasedLine rays when returning to edit mode.
// Notes:
// - Real ray meshes are stored in __sigRayLineMeshes (p4_renderSingleRay pushes into it).
// - __signalRayMeshes is legacy/extra cache; keep best-effort cleanup but prioritize __sigRayLineMeshes.
// ========================================
private clearSignalRays(): void {
  if (!this.guardEditWrite('clearSignalRays')) return;
  const nGreased = this.__sigRayLineMeshes?.length ?? 0;
  const nLegacy = this.__signalRayMeshes?.length ?? 0;

  if (nGreased === 0 && nLegacy === 0) {
    console.log('[SignalHeatRay][B1.7] cleanup: no rays to dispose');
    return;
  }

  // 1) Primary: dispose GreasedLine meshes (actual rays)
  if (nGreased > 0) {
    try {
      console.log('[SignalHeatRay][B1.7.2] cleanup snapshot', {
        cachedGreased: this.__sigRayLineMeshes.length,
      });

      console.log('[SignalHeatRay][B1.7.3] before dispose', {
        cachedGreased: this.__sigRayLineMeshes.length,
      });

      this.p4_clearPreviousRay(); // already disposes + clears __sigRayLineMeshes

      console.log('[SignalHeatRay][B1.7.3] after dispose', {
        cachedGreased: this.__sigRayLineMeshes.length,
      });

    } catch {}
  }

  // 2) Best-effort: dispose any legacy cached meshes (if any)
  if (nLegacy > 0) {
    for (const m of this.__signalRayMeshes) {
      try { m?.dispose?.(false, true); } catch {}
    }
    this.__signalRayMeshes = [];
  }

  console.log('[SignalHeatRay][B1.7] rays disposed', { disposedGreased: nGreased, disposedLegacy: nLegacy });
}

  // ===== [SIGRAY:P2:NODE_COLLECTOR] =====
  // Purpose: Collect antennas/terminals/blockers from scene.meshes by metadata.type,
  //          but dedupe by top-level root mesh to avoid counting multi-mesh models.
  // =======================================
private p2_collectSignalNodes(scene: any): {
  antennas: any[];
  terminals: any[];
  blockers: any[];
} {
  const antennas: any[] = [];
  const terminals: any[] = [];
  const blockers: any[] = [];

  const seenA = new Set<number>();
  const seenT = new Set<number>();
  const seenB = new Set<number>();

  const findTypeUp = (m: any): string | null => {
    let cur = m;
    while (cur) {
      const t = (cur as any)?.metadata?.type;
      if (t) return t;
      cur = cur.parent;
    }
    return null;
  };

  const getTopRoot = (m: any): any => {
    let cur = m;
    while (cur?.parent) cur = cur.parent;
    return cur ?? m;
  };

  // 代表 mesh：用來取 position（root 可能是 TransformNode/空節點時，改用原 mesh）
  const pickRepresentative = (root: any, leaf: any): any => {
    const canPos = typeof root?.getAbsolutePosition === 'function' || root?.position;
    return canPos ? root : leaf;
  };

  for (const m of scene.meshes ?? []) {
    const type = findTypeUp(m);
    if (!type) continue;

    if (type === 'antenna') {
      const root = getTopRoot(m);
      const key = root.uniqueId;
      if (!seenA.has(key)) {
        seenA.add(key);
        antennas.push(pickRepresentative(root, m));
      }
    } else if (type === 'terminal') {
      const root = getTopRoot(m);
      const key = root.uniqueId;
      if (!seenT.has(key)) {
        seenT.add(key);
        terminals.push(pickRepresentative(root, m));
      }
    } else if (type === 'building' || type === 'obstacle') {
      // ✅ blocker：用建築 id 去重，但實際 push 的仍是 leaf mesh（確保只有 AbstractMesh）
      const root = getTopRoot(m);
      const key = m.metadata?.buildingId ?? root.uniqueId ?? m.name ?? m.uniqueId;
      if (!seenB.has(key)) {
        seenB.add(key);
        blockers.push(m); // ✅ 只 push leaf mesh，避免 TransformNode 進入 ray test
      }
    }
  }

  return { antennas, terminals, blockers };
}

// ===== [SIGRAY:P3:LINK_BUDGET] =====
// Purpose: Compute one link budget for A0->T0 with FSPL + penetration penalties.
// Inputs: scene, antenna mesh, terminal mesh, blockers (meshes)
// Outputs: console logs (hits/fspl/rxDbm)
// Notes: v1 uses per-hit fixed penalties and may over-count if a building has multiple meshes.
// ===================================
private p3_computeSingleLinkBudget(
  scene: any,
  antennaMesh: any,
  terminalMesh: any,
  blockers: any[]
): void {
  const from = antennaMesh.getAbsolutePosition?.()?.clone?.() ?? antennaMesh.position?.clone?.();
  const to = terminalMesh.getAbsolutePosition?.()?.clone?.() ?? terminalMesh.position?.clone?.();

  if (!from || !to) {
    console.warn('[SignalHeatRay][P3] abort: cannot read A/T positions');
    return;
  }

  const vec = to.subtract(from);
  const distanceM = vec.length();
  const dir = vec.normalize();

  // ---- v1 hardcode parameters ----
  const TX_DBM = 30;           // hardcode
  const FREQ_MHZ = 3500;       // hardcode
  const LOSS_DB_BUILDING = 15; // hardcode
  const LOSS_DB_OBSTACLE = 5;  // hardcode
  // --------------------------------

  // Ray length equals A->T distance (terminal decides direction)
  const ray = new Ray(from, dir, distanceM);

  // If you don't expose BABYLON to window, use imported Ray (recommended).
  // We'll assume you will import Ray from @babylonjs/core and replace the above with:
  // const ray = new Ray(from, dir, distanceM);

  if (!ray) {
    console.warn('[SignalHeatRay][P3] abort: Ray class not available. Import Ray from @babylonjs/core.');
    return;
  }

  // Build a quick lookup set for blocker ids to filter picks
  const blockerIdSet = new Set<number>((blockers ?? []).map((b: any) => b.uniqueId));

  const picks = scene.multiPickWithRay(ray, (m: any) => {
    if (!m || !m.isPickable) return false;
    return blockerIdSet.has(m.uniqueId);
  }) ?? [];

  const hits = picks
    .filter((p: any) => p?.hit && p?.pickedMesh && p?.pickedPoint)
    .sort((a: any, b: any) => (a.distance ?? 0) - (b.distance ?? 0))
    .map((p: any) => {
      const mesh = p.pickedMesh;
      // metadata might be on mesh itself; if not, treat unknown as obstacle for v1
      const t = (mesh as any)?.metadata?.type;
      const penaltyDb = (t === 'building') ? LOSS_DB_BUILDING : LOSS_DB_OBSTACLE;
      return {
        meshId: mesh.uniqueId,
        meshName: mesh.name,
        type: t ?? 'obstacle',
        distanceM: p.distance ?? 0,
        penaltyDb,
      };
    });

  // ----- [SIGRAY:P3.1:DEDUPE_HITS] -----
  // Dedupe hits by top root to avoid multi-mesh building over-penalization.
  const getTopRoot = (m: any) => {
    let cur = m;
    while (cur?.parent) cur = cur.parent;
    return cur ?? m;
  };

  const seenHitRoot = new Set<number>();
  const dedupedHits: any[] = [];

  for (const h of hits) {
    const root = getTopRoot(scene.getMeshByUniqueId?.(h.meshId) ?? null);
    const key = root?.uniqueId ?? h.meshId;
    if (seenHitRoot.has(key)) continue;
    seenHitRoot.add(key);
    dedupedHits.push(h);
  }

  // ===== [SIGRAY:P3:LOSS_ACCUM] =====
  // Purpose: Accumulate penetration loss from all hits (v1 = sum of per-hit penalty).
  // =================================
  const penalties = dedupedHits.map((h: any) => Number(h.penaltyDb ?? 0));
  const penetrationLossDb = penalties.reduce((sum: number, v: number) => sum + v, 0);

  console.log('[SignalHeatRay][P3] penalty check', {
    hitCount: hits.length,
    penalties,
    penetrationLossDb,
  });

  // FSPL(dB)=32.44 + 20log10(f_MHz) + 20log10(d_km)
  const dKm = Math.max(distanceM / 1000, 0.001);
  const fsplDb = 32.44 + 20 * Math.log10(Math.max(FREQ_MHZ, 1)) + 20 * Math.log10(dKm);

  const rxDbm = TX_DBM - fsplDb - penetrationLossDb;

  // ===== [SIGRAY:P4:CALL_RENDER] =====
  this.p4_renderSingleRay(scene, from, to, rxDbm);

  console.log('[SignalHeatRay][P3] link budget (A0->T0)', {
    antennaId: antennaMesh.uniqueId,
    terminalId: terminalMesh.uniqueId,
    distanceM,
    txDbm: TX_DBM,
    freqMHz: FREQ_MHZ,
    fsplDb,
    penetrationLossDb,
    hitCount: hits.length,
    rxDbm,
  });

  // Optional: print first few hits to validate ordering & penalty
  console.log('[SignalHeatRay][P3] hits summary', {
    hitsLen: hits.length,
    first: hits[0] ?? null,
  });

  if (hits.length > 0) {
    console.table(
      hits.slice(0, 10).map((h: any, idx: number) => ({
        idx,
        type: h.type,
        meshId: h.meshId,
        meshName: h.meshName,
        distanceM: Number(h.distanceM?.toFixed?.(2) ?? h.distanceM),
        penaltyDb: h.penaltyDb,
      }))
    );
  }
}

// ===== [SIGRAY:P4.4:FANOUT_ALL_ANTENNAS] =====
// Purpose: Multi-antenna fanout (each antenna -> all terminals)
// Notes:
// - Clears previous rays ONCE per run
// - Reuses existing single-antenna fanout logic
// - Does NOT change ray math / rendering / cache behavior
// =============================================
private p4_computeFanoutFromAntennas(
  scene: Scene,
  antennas: AbstractMesh[],
  terminals: AbstractMesh[],
  blockers: AbstractMesh[]
): void {
  if (!antennas.length || !terminals.length) {
    console.warn('[SignalHeatRay][P4.4] abort: no antennas or terminals');
    return;
  }

  // 清一次就好，讓多基地台結果累積
  this.p4_clearPreviousRay();

  console.log('[SignalHeatRay][P4.4] fanout-all start', {
    antennaCount: antennas.length,
    terminalCount: terminals.length,
    blockerCount: blockers.length,
  });

  const before = this.__sigRayLineMeshes.length;

  antennas.forEach((antenna, ai) => {
    console.log('[SignalHeatRay][P4.4] antenna start', {
      ai,
      antennaId: antenna.uniqueId,
    });

    for (let ti = 0; ti < terminals.length; ti++) {
      const t = terminals[ti];

      // 重用你既有的「單一 A->T 計算 + 渲染」方法（不要改它的內容）
      this.p3_computeSingleLinkBudget(scene, antenna, t, blockers);

      // v1 guardrail：每台基地台最多畫 50 條（沿用你原本 fanout 的規則）
      if (ti >= 49) {
        console.warn('[SignalHeatRay][P4.4] stop after 50 terminals (v1 guardrail)', {
          ai,
          antennaId: antenna?.uniqueId,
        });
        break;
      }
    }


    console.log('[SignalHeatRay][P4.4] antenna done', {
      ai,
      antennaId: antenna.uniqueId,
      cachedLines: this.__sigRayLineMeshes.length,
    });
  });

  console.log('[SignalHeatRay][P4.4] fanout-all done', {
    addedThisRun: this.__sigRayLineMeshes.length - before,
    totalCached: this.__sigRayLineMeshes.length,
  });
}

// ===== [SIGRAY:P4:CLEAR] =====
// Purpose: Remove previously rendered ray line (so we don't accumulate lines).
// =================================
private p4_clearPreviousRay(): void {
  if (!this.guardEditWrite('p4_clearPreviousRay')) return;
  for (const m of this.__sigRayLineMeshes) {
    try { m.dispose(false, true); } catch {}
  }
  this.__sigRayLineMeshes = [];
}


// ===== [SIGRAY:P4:COLOR_MAP] =====
// Purpose: Map rx dBm to heat buckets required by spec.
// Spec: strong(red)=-1.0, mid(yellow/green)=-0.5, weak(blue)=0.0
// =================================
// ===== [SIGRAY:P4.2:COLOR_BUCKETS] =====
// Purpose: Discrete single-color buckets (no gradient).
// Strong -> Weak: Red -> Orange -> Yellow -> Green
// ======================================
private p4_mapRxToHeat(rxDbm: number): {
  bucket: 'red' | 'orange' | 'yellow' | 'green';
  label: 'strong' | 'good' | 'mid' | 'weak';
} {
  // v1 thresholds (hardcode, easy to tune)
  if (rxDbm >= -55) return { bucket: 'red', label: 'strong' };
  if (rxDbm >= -65) return { bucket: 'orange', label: 'good' };
  if (rxDbm >= -75) return { bucket: 'yellow', label: 'mid' };
  return { bucket: 'green', label: 'weak' };
}


private p4_bucketToColor3(bucket: 'red' | 'orange' | 'yellow' | 'green'): Color3 {
  switch (bucket) {
    case 'red': return new Color3(1, 0, 0);
    case 'orange': return new Color3(1, 0.5, 0);
    case 'yellow': return new Color3(1, 1, 0);
    case 'green': return new Color3(0, 1, 0);
  }
}


// ===== [SIGRAY:P4:RENDER_SINGLE] =====
// Purpose: Render one ray (A->T) as GreasedLine, colored by rxDbm.
// =================================
private p4_renderSingleRay(scene: any, from: any, to: any, rxDbm: number): void {
  if (!this.guardEditWrite('p4_renderSingleRay')) return;
  const { bucket, label } = this.p4_mapRxToHeat(rxDbm);
  const color = this.p4_bucketToColor3(bucket);

  console.log('[SignalHeatRay][P4] render', { rxDbm, bucket, label });


  const points = [from, to];
  const line = CreateGreasedLine('signal_heat_ray', { points }, scene) as any;

  // Configure via plugin material on the mesh (no GreasedLineMaterial import needed)
  const grlMat = line.greasedLineMaterial;
  if (!grlMat) {
    console.warn('[SignalHeatRay][P4] greasedLineMaterial not available on line mesh');
  } else {
    grlMat.width = 0.5;       // start a bit thicker for visibility; you can reduce later
    grlMat.setColor(color);
  }

  this.__sigRayLineMeshes.push(line);

  console.log('[SignalHeatRay][B1.7.2] cached line', {
    cached: this.__sigRayLineMeshes.length,
    meshName: line?.name,
    meshId: line?.uniqueId,
  });

}

  // -------------------- loading overlay --------------------
  loading = false;
  loadingMessage = '';

  loadingError = false;
  loadingErrorMessage = '';
  // ===== [SIM_API_PHASE5][COMPUTE_LOADING_STATE] =====
  computeLoading = false;
  computeLoadingError = false;
  computeLoadingErrorMessage = '';

  // [WP6][ANCHOR:T1] Compute loading state (separate from map/building loading)
  computeProgressPercent = 0;

  private openComputeLoading(): void {
    this.computeLoading = true;
    this.computeLoadingError = false;
    this.computeLoadingErrorMessage = '';
  }

  private closeComputeLoading(): void {
    this.computeLoading = false;
    this.computeLoadingError = false;
    this.computeLoadingErrorMessage = '';
  }

  private showComputeFailure(message = '運算失敗，請再試一次'): void {
    this.stopComputeProgressTicker();

    this.computeLoading = true;
    this.computeLoadingError = true;
    this.computeLoadingErrorMessage = message;
  }

  private getComputeFailureMessage(err: any): string {
  const status = Number(err?.status);

  if (status === 504) {
    return '運算逾時，請再試一次';
  }

  if (err instanceof TimeoutError || err?.name === 'TimeoutError') {
    return '運算逾時，請再試一次';
  }

  const message = String(err?.message ?? '').trim();

  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    message.includes('progress polling timeout')
  ) {
    return '運算逾時，請再試一次';
  }

  return '運算失敗，請再試一次';
}

  private __computeProgressTimer: any = null;

  // [WP6][ANCHOR:T2] Start/stop lightweight progress ticker (0 -> 95, finalize to 100)
  private startComputeProgressTicker(): void {
    this.computeProgressPercent = 0;

    if (this.__computeProgressTimer) {
      clearInterval(this.__computeProgressTimer);
      this.__computeProgressTimer = null;
    }

    this.__computeProgressTimer = setInterval(() => {
      if (!this.computeLoading) return;
      if (this.computeProgressPercent >= 95) return;

      const inc = 1 + Math.floor(Math.random() * 3); // 1~3
      this.computeProgressPercent = Math.min(95, this.computeProgressPercent + inc);
    }, 120);
  }

  private stopComputeProgressTicker(): void {
    if (this.__computeProgressTimer) {
      clearInterval(this.__computeProgressTimer);
      this.__computeProgressTimer = null;
    }
  }

  // ===== [SIM_API_PHASE5][COMPUTE_LOADING_PROGRESS] =====
 retryStartCompute(): void {
    this.computeLoadingError = false;
    this.computeLoadingErrorMessage = '';
    this.computeLoading = false;

    queueMicrotask(() => {
      void this.onStartCompute();
    });
  }

  // -------------------- Two-stage workflow state --------------------
  stage: 'edit' = 'edit';

  committedMapData: any | null = null; // GeneratedSceneAssets

  sceneName: string = '工研院'; 
  location: string = '戶外';

  /** MapPicker bbox 推導之場域尺寸與中心（Web Mercator m） */
  committedMapMeta: CommittedMapMeta | null = null;

  /** 場域設定：UI 與 /son/simulation 共用此狀態 */
  fieldSettingsState: EditSceneFieldSettingsState = {
    projectName: '',
    networkType: '5G',
    band: '',
    fieldMapSource: 'gis',
    length: 0,
    width: 0,
    height: 0,
    cutHeights: ['1.05', '', ''],
    //解析度調整
    heatmapGrid: '4x4',
    rsrpThreshold: SIMULATION_SEED_FALLBACK.rsrpThreshold,
    sinrThreshold: SIMULATION_SEED_FALLBACK.sinrThreshold,
  };

  private readonly R_EARTH_META = 6378137;

  //---------------------左右工具欄--------------------
  // 用途：接收 LeftSidebar 的 toolChange（Edit/Result 共用），並在 charts 時生成圖表 options
  handleLeftToolChange(tool: LeftToolType): void {
    console.log('原本的值:', this.leftToolType, '傳入的值:', tool);

    console.log('左側工具切換:', tool);
    this.leftToolType = tool; // 更新後 *ngIf / ngSwitch 才會過關

    // 只在打開「統計資訊」時生成（避免時序問題導致 options 永遠是 null）
    if (tool === 'charts') {
      this.buildStatsChartsFromMvp();
    }

    console.log('更新後的值:', this.leftToolType);
  }


  handleRightPanelChange(panel: RightPanelType): void {
    console.log('右側面板切換:', panel);
    this.rightPanelType = panel;
  }

  // -------------------- Babylon --------------------
  engine: Engine | null = null;
  scene: Scene | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private windowResizeHandler: (() => void) | null = null;
  private resizeRafId: number | null = null;
  private lastResizeW = 0;
  private lastResizeH = 0;

  fpsCamera: UniversalCamera | null = null;

  light: HemisphericLight | null = null;

  // -------------------- Phase 4: Placement Mode --------------------
  // Stage B 放置系統的「放置模式」狀態。
  // - none: 不進入放置流程（點擊只做一般選取）
  // - antenna: 放置基地台（src/assets/models/antenna.glb）
  // - terminal: 放置行動終端（src/assets/models/phone.glb）
  // - obstacle: 放置障礙物（primitive：box/sphere/...）
  // - landscape: 景觀物件（tree）
  // - observeZone/customZone: 區域框選（半透明、穿牆、非障礙）
  placementMode:
    | 'none'
    | 'antenna'
    | 'terminal'
    | 'obstacle'
    | 'landscape'
    | 'observeZone'
    | 'customZone'
    | 'ris' = 'none';


    /**
   * Phase 4: pending placement item id（由左側按鈕決定）
   * - obstacle: 'box' | 'sphere' | 'cylinder'
   * - landscape: 'tree'
   * - observeZone/customZone: 你按鈕的 id（用於 debug）
   */
  phase4PendingItemId: string | null = null;

  // Phase 2: double-click to edit (gizmo)
  private phase2LastClickAt = 0;
  private phase2LastClickPickId: number | null = null;
  private readonly PHASE2_DBLCLICK_MS = 280; // 可微調，但先固定

  private phase2EditingMesh: AbstractMesh | null = null;

  // -------------------- Phase 2.2: selection / editing state --------------------
  private phase2SelectedOwner: AbstractMesh | null = null;
  private phase2EditingOwner: AbstractMesh | null = null;
  // -------------------- End Phase 2.2 --------------------

  /** XZ-plane drag behavior attached to the currently-editing mesh. Null when nothing is editing. */
  private movePointerDragBehavior: PointerDragBehavior | null = null;
  /** Mesh that currently owns movePointerDragBehavior; used for reliable detach without relying on Babylon private _attachedNode. */
  private movePointerDragOwner: AbstractMesh | null = null;

  /** Mutual-exclusion mode: 'drag' = PointerDragBehavior only; 'gizmo' = gizmo only; null = nothing selected. */
  private transformControlMode: 'drag' | 'gizmo' | null = null;

  // -------------------- Spawn defaults (Phase 4/5) --------------------
  // 先 hardcode，之後再參數化
  private readonly DEFAULT_ANTENNA_HEIGHT_M = 5;   // 你可調：6~15；GLB 天線 spawnAntennaAt 依此縮到目標高度
  /** 程序化標準天線（spawnStandardAntennaProceduralAt）整體視覺縮放；buildOutdoorStandardAntennaModel 為 1:1 幾何時用此放大 */
  private readonly STANDARD_ANTENNA_VISUAL_SCALE = 2.0;
  private readonly DEFAULT_TERMINAL_HEIGHT_M = 4; // 手機/終端高度只是示意

  // 角度校正（若模型倒下，常見是 X 軸 +90°）
  // 若你調完發現反而更怪，把 X 改回 0 即可
  private readonly DEFAULT_ANTENNA_ROT = new Vector3(-Math.PI / 2, 0, 0);
  private readonly DEFAULT_TERMINAL_ROT = new Vector3(-Math.PI / 2, 0, 0);
  // -------------------- End defaults --------------------

/**
 * Phase 4: Single-shot placement guard.
 * When a placement click happens we store intent here so async template loading
 * (antenna/terminal) won't be canceled by immediately resetting placementMode to 'none'.
 */
private phase4SingleShot: null | {
  mode: 'antenna' | 'terminal' | 'obstacle' | 'landscape' | 'observeZone' | 'customZone' | 'ris';
  itemId: string | null;
  point: Vector3;
  placedOn: 'ground' | 'building';
} = null;

private __antennaPlaceableSeq = 0;
  private __placeableSeq = 0;

  private spawnPlaceablePinMarkerAt(
    markerType: 'antenna_placeable' | 'ris_placeable',
    color: Color3,
    point: Vector3,
    placedOn: 'ground' | 'building'
  ): void {
    if (!this.scene) return;

    const seq = ++this.__placeableSeq;

    // Root
    const root = new TransformNode(`${markerType}_root_${seq}`, this.scene);
    root.position.copyFrom(point);

    // Dimensions (meters) — 你之後要更大/更高就改這裡
    const headRadius = 0.45;     // 頭大小
    const stemHeight = 2.2;      // 柱子高度
    const stemRadius = 0.06;     // 柱子粗細
    const baseRadius = 0.9;      // 底部貼地圓

    // Material
    const mat = new StandardMaterial(`${markerType}_mat_${seq}`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.15);
    mat.specularColor = new Color3(0.25, 0.25, 0.25);
    mat.specularPower = 64;

    // Head (sphere) — 永遠是正圓
    const head = MeshBuilder.CreateSphere(
      `${markerType}_head_${seq}`,
      { diameter: headRadius * 2, segments: 48 },
      this.scene
    );
    head.parent = root;
    head.material = mat;
    head.position.y = stemHeight + headRadius * 0.55;
    head.isPickable = true;

    // Stem
    const stem = MeshBuilder.CreateCylinder(
      `${markerType}_stem_${seq}`,
      { height: stemHeight, diameter: stemRadius * 2, tessellation: 24 },
      this.scene
    );
    stem.parent = root;
    stem.material = mat;
    stem.position.y = stemHeight * 0.5;
    stem.isPickable = true;

    // Base disc (shadow)
    const baseDisc = MeshBuilder.CreateDisc(
      `${markerType}_base_${seq}`,
      { radius: baseRadius, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
      this.scene
    );
    baseDisc.parent = root;
    baseDisc.rotation.x = Math.PI / 2;
    baseDisc.position.y = 0.01;

    const baseMat = new StandardMaterial(`${markerType}_base_mat_${seq}`, this.scene);
    baseMat.diffuseColor = color.scale(0.35);
    baseMat.emissiveColor = color.scale(0.05);
    baseMat.alpha = 0.85;
    baseDisc.material = baseMat;
    baseDisc.isPickable = true;

    // Metadata (put on all pickable meshes)
    const md = {
      type: markerType,
      itemId: markerType,
      placedOn,
    };

    head.metadata = { ...(head.metadata ?? {}), ...md };
    stem.metadata = { ...(stem.metadata ?? {}), ...md };
    baseDisc.metadata = { ...(baseDisc.metadata ?? {}), ...md };
    this.attachMeshesToOwner(root, [head, stem, baseDisc]);

    // Snap whole hierarchy to ground AFTER placement (prevents floating)
    root.computeWorldMatrix(true);
    const hv = root.getHierarchyBoundingVectors(true);
    root.position.y += (0 - hv.min.y);
    root.computeWorldMatrix(true);

    // ===== Store Integration =====
    const scenePos = {
      x: root.position.x,
      y: root.position.y,
      z: root.position.z,
    };
    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);
    
    if (markerType === 'antenna_placeable') {
      const candidateBsRow = this.fieldDomainStore.addCandidateBs({
        x: mathPos.x,
        y: mathPos.y,
        z: mathPos.z,
        ownerMeshId: root.uniqueId,
      });
      // [Step2A][CandidateBsRegistry] Attach metadata and register
      this.attachFieldRowMetadata(root, candidateBsRow.id);
      const childMeshes = root.getChildMeshes ? root.getChildMeshes(false) : [];
      for (const m of childMeshes) {
        this.attachFieldRowMetadata(m, candidateBsRow.id);
      }
      console.log('[FieldStore][CandidateBs] added row', candidateBsRow);
      this.registerSceneObjectForFieldRow(
        candidateBsRow.id,
        'candidateBs',
        root,
        childMeshes[0] ?? null,
        'candidateBs',
        'antenna_placeable'
      );
      this.finalizeOwnerHierarchy(
        root,
        candidateBsRow.id,
        'candidateBs',
        markerType,
        'spawnPlaceablePinMarkerAt'
      );

      console.log('[COORD][Spawn->Row]', {
        type: 'candidate-bs',
        scenePosition: scenePos,
        mathPosition: {
          x: candidateBsRow.x,
          y: candidateBsRow.y,
          z: candidateBsRow.z,
        },
      });
      this.debugFieldStore('CandidateBs');
    } else if (markerType === 'ris_placeable') {
      const candidateRisRow = this.fieldDomainStore.addCandidateRis({
        x: mathPos.x,
        y: mathPos.y,
        z: mathPos.z,
        ownerMeshId: root.uniqueId,
      });
      // [Step2A][CandidateRisRegistry] Attach metadata and register
      this.attachFieldRowMetadata(root, candidateRisRow.id);
      const childMeshes = root.getChildMeshes ? root.getChildMeshes(false) : [];
      for (const m of childMeshes) {
        this.attachFieldRowMetadata(m, candidateRisRow.id);
      }
      console.log('[FieldStore][CandidateRis] added row', candidateRisRow);
      this.registerSceneObjectForFieldRow(
        candidateRisRow.id,
        'candidateRis',
        root,
        childMeshes[0] ?? null,
        'candidateRis',
        'ris_placeable'
      );
      this.finalizeOwnerHierarchy(
        root,
        candidateRisRow.id,
        'candidateRis',
        markerType,
        'spawnPlaceablePinMarkerAt'
      );

      console.log('[COORD][Spawn->Row]', {
        type: 'ris',
        scenePosition: scenePos,
        mathPosition: {
          x: candidateRisRow.x,
          y: candidateRisRow.y,
          z: candidateRisRow.z,
        },
      });
      this.debugFieldStore('CandidateRis');
    }

    console.log('[PlaceablePin] spawned', { markerType, placedOn, seq, pos: root.position });
  }

  // -------------------- Phase 4: Antenna GLB cache (Stage B spawn) --------------------
  // 用於快取載入後的天線模板（避免每次放置都重新 load glb）
  private antennaTemplateRoot: any | null = null;
  private isLoadingAntennaTemplate = false;
  // -------------------- Phase 4: DAS Antenna GLB cache (Stage B spawn) --------------------
  // DAS 天線模板快取（分開管理以支援多種天線類型）
  private dasAntennaTemplateRoot: any | null = null;
  private isLoadingDasAntennaTemplate = false;
  // -------------------- Phase 4: Terminal(Phone) GLB cache (Stage B spawn) --------------------
  private terminalTemplateRoot: any | null = null;
  private isLoadingTerminalTemplate = false;
  // -------------------- Landscape template (jungle_tree.glb) --------------------
  private mapleTreeTemplateRoot: TransformNode | null = null;
  private mapleTreeTemplatePromise: Promise<void> | null = null;

  // Stage B runtime
  gizmoManager: GizmoManager | null = null;
  floorMesh: Mesh | null = null;

  /** Debug-only marker meshes for building payload reprojection check. Cleared each run. */
  private buildingReprojectDebugMeshes: AbstractMesh[] = [];

  // 你原本既有狀態（保留）
  /** Phase 5: leaving field panel (rightPanelType !== 'field') clears card/gizmo via setter. */
  private _rightPanelType: RightPanelType = null;
  get rightPanelType(): RightPanelType {
    return this._rightPanelType;
  }
  set rightPanelType(value: RightPanelType) {
    const wasFieldPanel = this._rightPanelType === 'field';
    this._rightPanelType = value;
    if (wasFieldPanel && value !== 'field') {
      this.clearCurrentSelection();
    }
  }
  /** 右鍵選單導向場域 panel 時，帶入的 field row id（供 field panel 當 selected item） */
  selectedContextRowId: string | null = null;
  /** 右鍵要求開 RIS / UE 設定時，由 EditScene 記錄、由 EditFieldPanel 消費（不直接開 modal） */
  pendingSettingsOpenAction: 'ris' | 'ue' | null = null;
  existingBsSettingsOpen = false;
  existingBsSettingsTarget: ExistingBsFieldRow | null = null;
  antennaSettingsOpen = false;
  antennaSettingsTarget: ExistingBsFieldRow | null = null;
  zonePathLossOpen = false;
  zonePathLossRows: any[] = [];
  zonePathLossDefaultModelId: number | null = null;
  objectSettingsOpen = false;
  objectSettingsTarget: any | null = null;
  leftToolType: LeftToolType = null;
  editorMode: 'view' | 'placing' | 'editing' = 'view';
  isPlacingObject = false;
  isGizmoDragging = false;

  cityRoot: TransformNode | null = null;
  sceneScale = 100;
  verticalSpeed = 2;

  // 用途：ECharts 四張圖的 options（charts panel 使用）
  public chartOptModHist: any = null;
  public chartOptModCdf: any = null;
  public chartOptStrengthHist: any = null;
  public chartOptStrengthCdf: any = null;

  // -------------------- Stage B Camera Input (Keyboard State) --------------------
  private stageBKeyState: Record<string, boolean> = {};
  private stageBInputBound = false;

  private stageBKeyboardObserver?: any;
  private stageBBeforeRenderObserver?: any;

  // -------------------- Stage B Mouse Look --------------------
  private stageBMouseDown = false;
  private stageBLastMouseX = 0;
  private stageBLastMouseY = 0;

  // sensitivity（之後可調，不在本次驗收範圍）
  private stageBMouseSensitivity = 0.01;
  
  // -------------------- Stage B Wheel Zoom (FOV) --------------------
  private stageBWheelMoveStep = 5;
  // -------------------- Leaflet --------------------

  /* ===== [Patch 5A] Field Domain Store → Scene Sync ===== */

  private syncFieldRowsToScene(state: FieldDomainState): void {
    this.isApplyingFieldStoreToScene = true;

    try {
      // [Step2A][ClearPipeline] Remove scene objects whose rows were deleted from store
      this.reconcileRemovedRegisteredSceneObjects(state);

      const storeReadyForReconcile =
        !!state &&
        (
          (state.obstacles?.length ?? 0) > 0 ||
          (state.existingBs?.length ?? 0) > 0 ||
          (state.intelligentPanels?.length ?? 0) > 0 ||
          (state.ueList?.length ?? 0) > 0
        );
      if (storeReadyForReconcile) {
        this.reconcileRemovedObstacleSceneObjects(state);
      }

      // Obstacle
      for (const row of state.obstacles) {
        this.applyObstacleRowToScene(row);
      }

      // Zone
      for (const row of state.zones) {
        this.applyZoneRowToScene(row);
      }

      // Observe
      const observeRows = (state as any).observePoints ?? state.observes;
      for (const row of observeRows) {
        this.applyObserveRowToScene(row);
      }

      // existing BS
      for (const row of state.existingBs) {
        this.applyExistingBsRowToScene(row);
      }

      // RIS
      for (const row of state.intelligentPanels) {
        this.applyRisRowToScene(row);
      }

      // candidate BS
      for (const row of state.candidateBs) {
        this.applyCandidateBsRowToScene(row);
      }

      // candidate RIS
      for (const row of state.candidateRis) {
        this.applyPositionRowToScene(row);
      }

      // UE
      for (const row of state.ueList) {
        this.applyPositionRowToScene(row);
      }

    } finally {
      this.isApplyingFieldStoreToScene = false;
    }
  }

  // ===== [Patch 6.2] Attach row.id as metadata.fieldRowId for unified lookup =====
  private attachFieldRowMetadata(target: any, rowId: string): void {
    if (!target) return;

    if (!target.metadata) {
      target.metadata = {};
    }

    target.metadata.fieldRowId = rowId;
  }

  private debugOwnerHierarchy(
    owner: TransformNode | AbstractMesh | null | undefined,
    tag: string = 'debugOwnerHierarchy'
  ): void {
    if (!owner) {
      console.warn('[HierarchyCheck] no owner', { tag });
      return;
    }

    const children = owner.getChildMeshes?.(false) ?? [];

    console.log('[HierarchyCheck]', {
      tag,
      owner: (owner as any).name ?? null,
      ownerUid: (owner as any).uniqueId ?? null,
      ownerType: (owner as any)?.metadata?.type ?? null,
      childCount: children.length,
      children: children.map((m: any) => ({
        name: m.name,
        uid: m.uniqueId,
        parent: m.parent?.name ?? null,
        parentUid: m.parent?.uniqueId ?? null,
        type: m.metadata?.type ?? null,
        ownerMeshUniqueId: m.metadata?.ownerMeshUniqueId ?? null,
        fieldRowId: m.metadata?.fieldRowId ?? null,
      })),
    });
  }

  private debugOwnerTransform(
    owner: TransformNode | AbstractMesh | null | undefined,
    tag: string = 'debugOwnerTransform'
  ): void {
    if (!owner) {
      console.warn('[TransformDebug] no owner', { tag });
      return;
    }

    const ownerAny: any = owner;
    owner.computeWorldMatrix?.(true);

    const children = owner.getChildMeshes?.(false) ?? [];

    console.log('[TransformDebug][Owner]', {
      tag,
      ownerName: ownerAny.name ?? null,
      ownerUid: ownerAny.uniqueId ?? null,
      ownerType: ownerAny.metadata?.type ?? null,
      ownerPosition: ownerAny.position
        ? { x: ownerAny.position.x, y: ownerAny.position.y, z: ownerAny.position.z }
        : null,
      ownerRotation: ownerAny.rotation
        ? { x: ownerAny.rotation.x, y: ownerAny.rotation.y, z: ownerAny.rotation.z }
        : null,
      ownerScaling: ownerAny.scaling
        ? { x: ownerAny.scaling.x, y: ownerAny.scaling.y, z: ownerAny.scaling.z }
        : null,
      childCount: children.length,
    });

    console.log(
      '[TransformDebug][Children]',
      children.map((m: any) => ({
        name: m.name,
        uid: m.uniqueId,
        parent: m.parent?.name ?? null,
        type: m.metadata?.type ?? null,
        ownerMeshUniqueId: m.metadata?.ownerMeshUniqueId ?? null,
        position: m.position
          ? { x: m.position.x, y: m.position.y, z: m.position.z }
          : null,
        rotation: m.rotation
          ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z }
          : null,
        scaling: m.scaling
          ? { x: m.scaling.x, y: m.scaling.y, z: m.scaling.z }
          : null,
      }))
    );

    try {
      const hv = owner.getHierarchyBoundingVectors?.(true);
      if (hv) {
        console.log('[TransformDebug][Bounds]', {
          tag,
          min: { x: hv.min.x, y: hv.min.y, z: hv.min.z },
          max: { x: hv.max.x, y: hv.max.y, z: hv.max.z },
          size: {
            x: hv.max.x - hv.min.x,
            y: hv.max.y - hv.min.y,
            z: hv.max.z - hv.min.z,
          },
        });
      }
    } catch (err) {
      console.warn('[TransformDebug][Bounds] failed', { tag, err });
    }
  }

  private attachMeshesToOwner(
    owner: TransformNode | AbstractMesh,
    meshes: Array<AbstractMesh | null | undefined>
  ): void {
    if (!owner) return;

    for (const mesh of meshes) {
      if (!mesh) continue;
      if (mesh === owner) continue;
      mesh.parent = owner as any;
    }
  }

  private reparentLooseChildrenToOwner(
    owner: TransformNode | AbstractMesh,
    predicate: (mesh: AbstractMesh) => boolean
  ): void {
    if (!owner || !this.scene) return;

    const ownerUid = owner.uniqueId;

    for (const mesh of this.scene.meshes) {
      if (!mesh) continue;
      if (mesh === owner) continue;
      if (mesh.parent === owner) continue;
      if (
        mesh.parent &&
        this.resolveSceneObjectOwner(mesh.parent as any)?.uniqueId === ownerUid
      ) {
        continue;
      }

      if (predicate(mesh)) {
        mesh.parent = owner as any;

        console.log('[HierarchyRepair][Reparent]', {
          mesh: mesh.name,
          meshUid: mesh.uniqueId,
          owner: (owner as any).name ?? null,
          ownerUid,
        });
      }
    }
  }

  private bindSceneObjectOwner(
    owner: TransformNode | AbstractMesh,
    rowId: string,
    category: string,
    type: string
  ): void {
    if (!owner) return;

    (owner as any).metadata = {
      ...((owner as any).metadata ?? {}),
      isSceneObjectOwner: true,
      type: type ?? (owner as any)?.metadata?.type ?? null,
      category,
      ownerMeshUniqueId: owner.uniqueId,
      fieldRowId: rowId || ((owner as any)?.metadata?.fieldRowId ?? null),
    };

    if (rowId) {
      this.attachFieldRowMetadata(owner as any, rowId);
    }

    const childMeshes = owner.getChildMeshes?.(false) ?? [];
    for (const child of childMeshes) {
      child.metadata = {
        ...(child.metadata ?? {}),
        type: type ?? child.metadata?.type ?? null,
        category,
        ownerMeshUniqueId: owner.uniqueId,
      };
      if (rowId) {
        this.attachFieldRowMetadata(child, rowId);
      }
    }
  }

  private validateOwnerHierarchy(
    owner: TransformNode | AbstractMesh
  ): void {
    if (!owner) return;

    const ownerUid = owner.uniqueId;
    const children = owner.getChildMeshes?.(false) ?? [];

    for (const child of children) {
      const meta = (child as any).metadata ?? {};
      if (
        meta.ownerMeshUniqueId != null &&
        meta.ownerMeshUniqueId !== ownerUid
      ) {
        console.warn('[HierarchyValidate] owner uid mismatch', {
          owner: (owner as any).name ?? null,
          ownerUid,
          child: child.name,
          childUid: child.uniqueId,
          childOwnerMeshUniqueId: meta.ownerMeshUniqueId,
        });
      }
    }
  }

  private finalizeOwnerHierarchy(
    owner: TransformNode | AbstractMesh,
    rowId: string,
    category: string,
    type: string,
    tag: string
  ): void {
    if (!owner) return;

    this.bindSceneObjectOwner(owner as any, rowId, category, type);
    this.debugOwnerHierarchy(owner, tag);
    this.validateOwnerHierarchy(owner);
  }

  // ===== [Patch 6.2] Find scene node by rowId =====
  private findSceneNodeByFieldRowId(rowId: string): any {
    if (!this.scene) return null;

    for (const mesh of this.scene.meshes) {
      if (mesh?.metadata?.fieldRowId === rowId) {
        return mesh;
      }
    }

    for (const node of this.scene.transformNodes) {
      if (node?.metadata?.fieldRowId === rowId) {
        return node;
      }
    }

    return null;
  }

  private findFieldRowSnapshotByCardKind(
    kind: FieldCardSelectPayload['kind'],
    rowId: string
  ): FieldRowBase | null {
    const snap = this.fieldDomainStore.snapshot;
    if (!snap) return null;
    const pick = <T extends { id: string }>(rows: T[] | undefined) =>
      rows?.find((r) => r.id === rowId) ?? null;
    switch (kind) {
      case 'obstacle':
        return pick(snap.obstacles);
      case 'existingBs':
        return pick(snap.existingBs);
      case 'candidateBs':
        return pick(snap.candidateBs);
      case 'intelligentPanel':
        return pick(snap.intelligentPanels);
      case 'candidateRis':
        return pick(snap.candidateRis);
      case 'ue':
        return pick(snap.ueList);
      case 'zone':
        return pick(snap.zones);
      case 'observe':
        return pick(snap.observes);
      default:
        return null;
    }
  }

  /** Resolve scene owner root for gizmo (never a child mesh). */
  private findSceneOwnerByFieldRow(
    kind: FieldCardSelectPayload['kind'],
    rowId: string
  ): TransformNode | AbstractMesh | null {
    const row = this.findFieldRowSnapshotByCardKind(kind, rowId);
    let target: AbstractMesh | TransformNode | null = row
      ? this.getSceneTargetByFieldRow(row)
      : null;
    if (!target) {
      target = this.findSceneNodeByFieldRowId(rowId) ?? null;
    }
    if (!target) return null;
    return this.resolveSceneObjectOwner(target as any) ?? target;
  }

  private getSceneTargetByFieldRow(row: { id?: string; meshId?: number; ownerMeshId?: number }): AbstractMesh | TransformNode | null {
    const sceneAny = this.scene as any;
    if (!sceneAny) return null;

    // ===== [Patch 6.2] Metadata lookup takes priority =====
    if (row.id != null) {
      const byMetadata = this.findSceneNodeByFieldRowId(row.id);
      if (byMetadata) return byMetadata;
    }

    if (row.ownerMeshId != null) {
      // Try mesh first
      if (typeof sceneAny.getMeshByUniqueId === 'function') {
        const owner = sceneAny.getMeshByUniqueId(row.ownerMeshId);
        if (owner) return owner;
      }
      // Fallback to TransformNode
      if (typeof sceneAny.getTransformNodeByUniqueId === 'function') {
        const ownerNode = sceneAny.getTransformNodeByUniqueId(row.ownerMeshId);
        if (ownerNode) return ownerNode;
      }
    }

    if (row.meshId != null && typeof sceneAny.getMeshByUniqueId === 'function') {
      const mesh = sceneAny.getMeshByUniqueId(row.meshId);
      if (mesh) return mesh;
    }

    return null;
  }

  private applyObstacleRowToScene(row: ObstacleFieldRow): void {
    const target: any = this.getSceneTargetByFieldRow(row);
    if (!target) return;

    const isLandscape = this.isLandscapeFieldRowTarget(target);

    // [Step2A][MaterialSync] Keep row.material identity attached on scene node metadata
    if (!target.metadata) {
      target.metadata = {};
    }
    target.metadata.material = row.material;
    const obstacleChildMeshes = target.getChildMeshes ? target.getChildMeshes(false) : [];
    for (const child of obstacleChildMeshes) {
      child.metadata = {
        ...(child.metadata ?? {}),
        material: row.material,
      };
    }

    this.applySimpleFieldPosition(target, row);
    const obstacleMathPos = {
      x: row.x,
      y: row.y,
      z: row.startHeight ?? 0,
    };
    const obstacleScenePos = this.toScenePositionFromMath(obstacleMathPos);
    console.log('[COORD][Row->Scene][Object]', {
      kind: isLandscape ? 'landscape-object' : 'basic-object',
      mathPosition: obstacleMathPos,
      scenePosition: obstacleScenePos,
    });

    // [Patch1][ObstacleAngle] Apply row angle to scene: convert degree -> radian
    if (typeof row.angle === 'number' && target.rotation) {
      const angleRadians = (row.angle * Math.PI) / 180;
      target.rotation.y = angleRadians;
      console.log('[ObstacleAngle][SceneApply]', {
        rowId: row.id,
        angle: row.angle,
        radians: angleRadians,
      });
    }

    if (!isLandscape) {
      const bounds = this.getWorldBoundsInfo(target);

      const currentSizeX = bounds.sizeX || 1;
      const currentSizeY = bounds.sizeY || 1;
      const currentSizeZ = bounds.sizeZ || 1;

      const nextScaleX = target.scaling.x * (row.length / currentSizeX);
      const nextScaleY = target.scaling.y * (row.height / currentSizeY);
      const nextScaleZ = target.scaling.z * (row.width / currentSizeZ);

      target.scaling.x = Number.isFinite(nextScaleX) ? nextScaleX : target.scaling.x;
      target.scaling.y = Number.isFinite(nextScaleY) ? nextScaleY : target.scaling.y;
      target.scaling.z = Number.isFinite(nextScaleZ) ? nextScaleZ : target.scaling.z;

      this.alignToGround(target);

      if (typeof row.startHeight === 'number') {
        const afterBounds = this.getWorldBoundsInfo(target);
        const currentMinY = afterBounds.minY;
        const deltaY = row.startHeight - currentMinY;
        target.position.y += deltaY;
      }
    }

    if (isLandscape) {
      console.log('[FieldSceneSync][Obstacle->Landscape] skip scale sync', {
        rowId: row.id,
        seq: row.seq,
        mesh: target.name,
        x: row.x,
        y: row.y,
        startHeight: row.startHeight,
        angle: row.angle,
      });
    }

    console.log('[FieldSceneSync][Obstacle] applied', {
      rowId: row.id,
      seq: row.seq,
      mesh: target.name,
      isLandscape,
      material: row.material,
      x: row.x,
      y: row.y,
      startHeight: row.startHeight,
      height: row.height,
      length: row.length,
      width: row.width,
      angle: row.angle,
    });
  }

  private applyZoneRowToScene(row: ZoneFieldRow): void {
    const target = this.getSceneTargetByFieldRow(row);
    if (!target || !(target instanceof AbstractMesh)) return;

    const rowX = Number(row.x);
    const rowY = Number(row.y);
    const rowZ = target.position.y;
    const scenePos = this.floorRowToSceneWorld(rowX, rowY, rowZ);
    target.position.x = scenePos.x;
    target.position.z = scenePos.z;

    const bounds = this.getWorldBoundsInfo(target);
    const currentSizeX = bounds.sizeX || 1;
    const currentSizeZ = bounds.sizeZ || 1;

    const nextScaleX = target.scaling.x * (row.length / currentSizeX);
    const nextScaleZ = target.scaling.z * (row.width / currentSizeZ);

    target.scaling.x = Number.isFinite(nextScaleX) ? nextScaleX : target.scaling.x;
    target.scaling.z = Number.isFinite(nextScaleZ) ? nextScaleZ : target.scaling.z;

    target.rotation.y = (row.angle * Math.PI) / 180;

    console.log('[FieldSceneSync][Zone] applied', {
      rowId: row.id,
      seq: row.seq,
      mesh: target.name,
      x: row.x,
      y: row.y,
      length: row.length,
      width: row.width,
      angle: row.angle,
    });

    console.log('[COORD][Row->Scene][Area]', {
      kind: 'custom-zone',
      mathData: { x: row.x, y: row.y },
      sceneData: { x: scenePos.x, y: target.position.y, z: scenePos.z },
    });
  }

  private applyObserveRowToScene(row: ObserveFieldRow): void {
    const target = this.getSceneTargetByFieldRow(row);
    if (!target) return;

    const zHeight =
      (row as any).z ?? (row as any).height ?? target.position.y;
    const rowX = Number(row.x);
    const rowY = Number(row.y);
    const rowZ = Number(zHeight);

    const scenePos = this.floorRowToSceneWorld(rowX, rowY, rowZ);
    target.position.copyFrom(
      new Vector3(scenePos.x, scenePos.y, scenePos.z)
    );

    console.log('[COORD][Row->Scene][Area]', {
      kind: 'observe-zone',
      mathData: { x: row.x, y: row.y, z: zHeight },
      sceneData: { x: scenePos.x, y: scenePos.y, z: scenePos.z },
    });

    console.log('[FieldSceneSync][Observe] applied', {
      rowId: row.id,
      seq: row.seq,
      mesh: target.name,
      x: row.x,
      y: row.y,
    });
  }

  private applyExistingBsRowToScene(row: any): void {
    // [Step2A][ExistingBsRegistry] Try registry lookup first
    let target = this.getOwnerNodeByFieldRowId(row.id);
    if (!target) {
      // Fallback to legacy lookup
      target = this.getSceneTargetByFieldRow(row);
    }
    if (!target) return;

    // [Step2A][ExistingBsSync] Apply position.
    // Rows written after the floor-local fix have x/y in [0, floorW/D].
    // Rows written before (center-origin math) have x/y ≈ worldCoord ± width/2 (large values).
    // Detect which format and use the matching inverse formula.
    const z = row.z ?? row.height ?? 0;
    const floorBBRead = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
    const floorMinRead = floorBBRead?.minimumWorld ?? null;
    let scenePos: Vector3;
    let readPath: string;
    if (floorMinRead != null) {
      const floorMaxRead = floorBBRead!.maximumWorld;
      const floorW = floorMaxRead.x - floorMinRead.x;
      const floorD = floorMaxRead.z - floorMinRead.z;
      const tol = 50;
      const isFloorLocal = row.x >= -tol && row.x <= floorW + tol
        && row.y >= -tol && row.y <= floorD + tol;
      if (isFloorLocal) {
        // New floor-local format: restore world coords
        scenePos = new Vector3(floorMinRead.x + row.x, z, floorMinRead.z + row.y);
        readPath = 'floor-local';
      } else {
        // Legacy center-origin math format
        const scenePosition = this.toScenePositionFromMath({ x: row.x, y: row.y, z });
        scenePos = new Vector3(scenePosition.x, scenePosition.y, scenePosition.z);
        readPath = 'legacy-mathToScene';
      }
    } else {
      // No floor mesh yet — center-origin fallback
      const scenePosition = this.toScenePositionFromMath({ x: row.x, y: row.y, z });
      scenePos = new Vector3(scenePosition.x, scenePosition.y, scenePosition.z);
      readPath = 'fallback-noFloor';
    }
    console.log('[COORD][Row->Scene]', {
      type: 'existing-bs',
      rowXY: { x: row.x, y: row.y, z },
      floorMinRead: floorMinRead ? { x: floorMinRead.x, z: floorMinRead.z } : null,
      scenePos: { x: scenePos.x, y: scenePos.y, z: scenePos.z },
      path: readPath,
    });
    target.position.copyFrom(scenePos);

    console.log('[FieldSceneSync][ExistingBS]', {
      id: row.id,
      mesh: (target as any).name,
      x: row.x,
      y: row.y,
      z,
    });

    // [BS_ROW_NORMALIZE_AFTER_APPLY] — convert legacy center-origin math rows to floor-local
    // Only fires when the row was in legacy format (readPath !== 'floor-local').
    // Guard prevents re-entry: after normalization the row is floor-local → next call skips.
    if (floorMinRead != null && readPath !== 'floor-local') {
      target.computeWorldMatrix(true);
      const absPos = target.getAbsolutePosition();
      const floorMaxRead = floorBBRead!.maximumWorld;
      const floorW = floorMaxRead.x - floorMinRead.x;
      const floorD = floorMaxRead.z - floorMinRead.z;
      const normalizedX = absPos.x - floorMinRead.x;
      const normalizedY = absPos.z - floorMinRead.z;
      const inBounds = normalizedX >= 0 && normalizedX <= floorW
        && normalizedY >= 0 && normalizedY <= floorD;
      console.log('[BS_ROW_NORMALIZE_AFTER_APPLY]', {
        rowId: row.id,
        oldRowXY: { x: row.x, y: row.y },
        meshAbsPos: { x: absPos.x, y: absPos.y, z: absPos.z },
        floorMin: { x: floorMinRead.x, z: floorMinRead.z },
        normalizedRowXY: { x: normalizedX, y: normalizedY },
        inBounds,
        reason: 'after applyExistingBsRowToScene',
      });
      if (inBounds) {
        // [Patch 2] Disabled: Row->Scene must not secretly mutate store data.
        // this.fieldDomainStore.updateExistingBs(row.id, { x: normalizedX, y: normalizedY });
      }
    }

  }

  private applyRisRowToScene(row: any): void {
    // [Step2A][RisRegistry] Try registry lookup first
    let target = this.getOwnerNodeByFieldRowId(row.id);
    if (!target) {
      // Fallback to legacy lookup
      target = this.getSceneTargetByFieldRow(row);
    }
    if (!target) return;

    // [RowRead] Prefer floor-local row.x/row.y, legacy fallback supported.
    const rowX = Number(row.x);
    const rowY = Number(row.y);
    const rowZ = Number(row.z ?? row.height ?? 0);

    const scenePos = this.floorRowToSceneWorld(rowX, rowY, rowZ);
    target.position.copyFrom(new Vector3(scenePos.x, scenePos.y, scenePos.z));

    console.log('[COORD][Row->Scene]', {
      type: 'ris-or-ue',
      rowId: row.id,
      rowXY: { x: rowX, y: rowY },
      scenePos,
      path: scenePos.path,
      inBounds: scenePos.inBounds,
    });

    console.log('[FieldSceneSync][RIS]', {
      id: row.id,
      mesh: (target as any).name,
      x: row.x,
      y: row.y,
      height: row.height ?? row.z
    });

  }

  private applyCandidateBsRowToScene(row: any): void {
    // [Step2A][CandidateBsRegistry] Try registry lookup first
    let target = this.getOwnerNodeByFieldRowId(row.id);
    if (!target) {
      // Fallback to legacy lookup
      target = this.getSceneTargetByFieldRow(row);
    }
    if (!target) return;

    // [Step2A][CandidateBsSync] Apply position (row.position is Math/canonical)
    const z = row.height ?? row.z ?? 0;
    const mathPosition = { x: row.x, y: row.y, z };
    const scenePosition = this.toScenePositionFromMath(mathPosition);
    const scenePos = new Vector3(scenePosition.x, scenePosition.y, scenePosition.z);
    console.log('[COORD][Row->Scene]', {
      type: 'candidate-bs',
      mathPosition,
      scenePosition,
    });
    target.position.copyFrom(scenePos);

    console.log('[FieldSceneSync][CandidateBS]', {
      id: row.id,
      mesh: (target as any).name,
      x: row.x,
      y: row.y,
      height: row.height ?? row.z
    });

  }

  private applyPositionRowToScene(
    row:
      | ExistingBsFieldRow
      | IntelligentPanelFieldRow
      | CandidateBsFieldRow
      | CandidateRisFieldRow
      | UeFieldRow
  ): void {
    // [Step2A][CandidateRisSync][UeSync] Try registry lookup first
    let target = this.getOwnerNodeByFieldRowId(row.id);
    if (!target) {
      // Fallback to legacy lookup
      target = this.getSceneTargetByFieldRow(row);
    }

    /* ---------- fallback for candidate objects ---------- */
    if (!target && this.scene) {
      const meshes = this.scene.meshes;
      for (const m of meshes) {
        const meta: any = (m as any)?.metadata;
        if (!meta) continue;
        if (
          meta.itemId === 'antenna_placeable' &&
          row.category === 'candidateBs'
        ) {
          target = m;
          break;
        }
        if (
          meta.itemId === 'ris_placeable' &&
          row.category === 'candidateRis'
        ) {
          target = m;
          break;
        }
      }
    }
    /* ---------------------------------------------------- */

    if (!target) return;

    // [RowRead] Prefer floor-local row.x/row.y, legacy fallback supported.
    const rowX = Number((row as any).x);
    const rowY = Number((row as any).y);
    const rowZ = Number((row as any).z ?? (row as any).height ?? 0);

    const scenePos = this.floorRowToSceneWorld(rowX, rowY, rowZ);
    target.position.copyFrom(new Vector3(scenePos.x, scenePos.y, scenePos.z));

    console.log('[COORD][Row->Scene]', {
      type: 'ris-or-ue',
      rowId: row.id,
      rowXY: { x: rowX, y: rowY },
      scenePos,
      path: scenePos.path,
      inBounds: scenePos.inBounds,
    });

    console.log('[FieldSceneSync][Position]', {
      rowId: row.id,
      seq: row.seq,
      mesh: target.name,
      x: row.x,
      y: row.y,
      z: row.z,
    });
  }

  /* ===== End Patch 5A ===== */

  /* ===== [Patch 6] Scene to Field Store Sync ===== */

  private bindFieldStoreSyncToGizmos(): void {
    if (!this.gizmoManager) return;

    const posGizmo: any = this.gizmoManager.gizmos?.positionGizmo;
    const rotGizmo: any = this.gizmoManager.gizmos?.rotationGizmo;
    const scaleGizmo: any = this.gizmoManager.gizmos?.scaleGizmo;

    if (posGizmo?.onDragEndObservable) {
      this.positionDragEndObserver = posGizmo.onDragEndObservable.add(() => {
        this.syncSelectedSceneObjectToFieldStore('position');
      });
    }

    if (rotGizmo?.onDragEndObservable) {
      this.rotationDragEndObserver = rotGizmo.onDragEndObservable.add(() => {
        this.syncSelectedSceneObjectToFieldStore('rotation');
      });
    }

    if (scaleGizmo?.onDragEndObservable) {
      this.scaleDragEndObserver = scaleGizmo.onDragEndObservable.add(() => {
        this.syncSelectedSceneObjectToFieldStore('scale');
      });
    }
  }

  private syncSelectedSceneObjectToFieldStore(reason: 'position' | 'rotation' | 'scale' | 'manual'): void {
    if (this.isApplyingFieldStoreToScene) return;
    if (this.isApplyingSceneToFieldStore) return;
    if (!this.scene) return;

    const selected =
      this.getActiveSelectedOwner() ??
      this.selectedMesh ??
      this.phase2EditingOwner ??
      this.phase2SelectedOwner;
    if (!selected) return;

    const owner = this.resolveSceneObjectOwner(selected as any) ?? selected;

    // Phase 1.5: debug probe (do not change behavior)
    const probeOwner = this.resolveSceneObjectOwner(owner as any);


    const target =
      owner instanceof AbstractMesh
        ? this.getTransformTargetMesh(owner)
        : (this.selectedMesh ?? this.phase2EditingOwner ?? this.phase2SelectedOwner);
    if (!target) return;

    this.isApplyingSceneToFieldStore = true;
    try {
      this.syncSceneObjectToFieldStoreByTarget(target, reason);
    } finally {
      this.isApplyingSceneToFieldStore = false;
    }
  }

  private syncSceneObjectToFieldStoreByTarget(
    target: AbstractMesh,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    const meta = (target as any)?.metadata || {};
    const snapshot = this.fieldDomainStore.snapshot;

    // ===== [Patch 6.2] Metadata rowId lookup takes priority =====
    const metaRowId = meta?.fieldRowId;
    if (metaRowId) {
      const obstacle = snapshot.obstacles.find(r => r.id === metaRowId);
      if (obstacle) {
        this.updateObstacleRowFromScene(target, obstacle, reason);
        return;
      }

      const zone = snapshot.zones.find(r => r.id === metaRowId);
      if (zone) {
        this.updateZoneRowFromScene(target, zone, reason);
        return;
      }

      const observe = snapshot.observes.find(r => r.id === metaRowId);
      if (observe) {
        this.updateObserveRowFromScene(target, observe, reason);
        return;
      }

      const bs = snapshot.existingBs.find(r => r.id === metaRowId);
      if (bs) {
        this.updateExistingBsRowFromScene(target, bs, reason);
        return;
      }

      const ris = snapshot.intelligentPanels.find(r => r.id === metaRowId);
      if (ris) {
        this.updateIntelligentPanelRowFromScene(target, ris, reason);
        return;
      }

      const cbs = snapshot.candidateBs.find(r => r.id === metaRowId);
      if (cbs) {
        this.updateCandidateBsRowFromScene(target, cbs, reason);
        return;
      }

      const cris = snapshot.candidateRis.find(r => r.id === metaRowId);
      if (cris) {
        this.updateCandidateRisRowFromScene(target, cris, reason);
        return;
      }

      const ue = snapshot.ueList.find(r => r.id === metaRowId);
      if (ue) {
        this.updateUeRowFromScene(target, ue, reason);
        return;
      }
    }

    // 先從 metadata.type 判斷類型（fallback）
    const type = meta?.type;
    const uid = target.uniqueId;

    // obstacle
    if (type === 'obstacle' || type === 'landscape') {
      const row = snapshot.obstacles.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateObstacleRowFromScene(target, row, reason);
        return;
      }
    }

    // zone
    if (type === 'customZone' || meta?.regionKind === 'customZone') {
      const row = snapshot.zones.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateZoneRowFromScene(target, row, reason);
        return;
      }
    }

    // observe
    if (type === 'observeZone' || meta?.regionKind === 'observeZone' || type === 'observe') {
      const row = snapshot.observes.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateObserveRowFromScene(target, row, reason);
        return;
      }
    }

    // existingBs
    if (type === 'antenna' || type === 'existingBs') {
      const row = snapshot.existingBs.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateExistingBsRowFromScene(target, row, reason);
        return;
      }
    }

    // RIS
    if (type === 'ris' || type === 'intelligentPanel') {
      const row = snapshot.intelligentPanels.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateIntelligentPanelRowFromScene(target, row, reason);
        return;
      }
    }

    // candidateBs
    if (type === 'candidateBs' || meta?.itemId === 'antenna_placeable') {
      const row = snapshot.candidateBs.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateCandidateBsRowFromScene(target, row, reason);
        return;
      }
    }

    // candidateRis
    if (type === 'candidateRis' || meta?.itemId === 'ris_placeable') {
      const row = snapshot.candidateRis.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateCandidateRisRowFromScene(target, row, reason);
        return;
      }
    }

    // UE
    if (type === 'terminal' || type === 'ue') {
      const row = snapshot.ueList.find(r => r.meshId === uid || r.ownerMeshId === uid);
      if (row) {
        this.updateUeRowFromScene(target, row, reason);
        return;
      }
    }
  }

  private updateObstacleRowFromScene(
    target: any,
    row: ObstacleFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    const bounds = this.getWorldBoundsInfo(target);
    const isLandscape = this.isLandscapeFieldRowTarget(target);

    // [Patch1][ObstacleAngle] Read scene rotation and convert to degree
    const angleDeg = this.getObstacleAngleDeg(target);

    const scenePos = {
      x: bounds.centerX,
      y: bounds.minY,
      z: bounds.centerZ,
    };
    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);

    const floorBBWrite = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
    const floorMinWrite = floorBBWrite?.minimumWorld ?? null;

    const fieldX = this.roundFieldNum(
      floorMinWrite ? scenePos.x - floorMinWrite.x : mathPos.x
    );
    const fieldY = this.roundFieldNum(
      floorMinWrite ? scenePos.z - floorMinWrite.z : mathPos.y
    );
    const fieldZ = this.roundFieldNum(scenePos.y);

    this.fieldDomainStore.updateObstacle(row.id, {
      x: fieldX,
      y: fieldY,
      startHeight: fieldZ,
      position: {
        x: fieldX,
        y: fieldY,
        z: fieldZ,
      },
      height: this.roundFieldNum(bounds.sizeY),
      length: this.roundFieldNum(bounds.sizeX),
      width: this.roundFieldNum(bounds.sizeZ),
      angle: angleDeg,
    });

    console.log('[COORD][Scene->Row][Object]', {
      kind: isLandscape ? 'landscape-object' : 'basic-object',
      scenePosition: scenePos,
      mathPosition: {
        x: this.roundFieldNum(mathPos.x),
        y: this.roundFieldNum(mathPos.y),
        z: this.roundFieldNum(mathPos.z),
      },
    });

    console.log('[FieldStore][Scene->Obstacle]', {
      rowId: row.id,
      seq: row.seq,
      reason,
      isLandscape,
      x: mathPos.x,
      y: mathPos.y,
      startHeight: mathPos.z,
      height: bounds.sizeY,
      length: bounds.sizeX,
      width: bounds.sizeZ,
      angle: angleDeg,
    });
  }

  private updateZoneRowFromScene(
    target: AbstractMesh,
    row: ZoneFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    const bounds = this.getWorldBoundsInfo(target);

    console.log('[FieldStore][Scene->Zone]', { rowId: row.id, seq: row.seq, reason });
  }

  private updateObserveRowFromScene(
    target: AbstractMesh,
    row: ObserveFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    const bounds = this.getWorldBoundsInfo(target);

    const scenePos = {
      x: bounds.centerX,
      y: target.position.y,
      z: bounds.centerZ,
    };
    const local = this.sceneWorldToFloorLocalRow(scenePos.x, scenePos.z);

    this.fieldDomainStore.updateObserve(row.id, {
      x: this.roundFieldNum(local.x),
      y: this.roundFieldNum(local.y),
      z: this.roundFieldNum(scenePos.y),
    });

    console.log('[COORD][Scene->Row][Area]', {
      kind: 'observe-zone',
      sceneData: scenePos,
      rowXY: { x: local.x, y: local.y },
      path: local.path,
    });

    console.log('[FieldStore][Scene->Observe]', { rowId: row.id, seq: row.seq, reason });
  }

  private updateExistingBsRowFromScene(
    target: AbstractMesh,
    row: ExistingBsFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    // [Step2A][ExistingBsRegistry] Verify registry association
    const registeredRowId = this.getFieldRowIdFromSceneNode(target);
    if (registeredRowId && registeredRowId !== row.id) {
      console.warn('[Step2A][ExistingBsRegistry] node registered to different row', { 
        nodeRegistered: registeredRowId, 
        rowId: row.id 
      });
    }

    const scenePos = {
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    };

    console.log('[BS_POLLUTION][updateExistingBsRowFromScene][beforeMath]', {
      rowId: row?.id,
      meshName: target?.name,
      reason,
      rawScenePosition: scenePos,
      fieldSettingsState: {
        width: this.fieldSettingsState?.width,
        length: this.fieldSettingsState?.length,
        height: this.fieldSettingsState?.height,
      },
    });

    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);

    console.log('[BS_POLLUTION][updateExistingBsRowFromScene][afterMath]', {
      rowId: row?.id,
      reason,
      mathPos,
    });

    // Floor-local write: row.x/y = offset from floorMin (MathCoord3D spec: left-bottom origin).
    // The old sceneToMath(center-origin) was broken when the floor is far from world origin.
    const absPos = target.getAbsolutePosition();
    const floorBBWrite = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
    const floorMinWrite = floorBBWrite?.minimumWorld ?? null;
    const localX = floorMinWrite != null ? absPos.x - floorMinWrite.x : mathPos.x;
    const localY = floorMinWrite != null ? absPos.z - floorMinWrite.z : mathPos.y;
    const heightZ = absPos.y;

    this.fieldDomainStore.updateExistingBs(row.id, {
      x: localX,
      y: localY,
      z: heightZ,
    });

    // [BS_STORE_WRITE_TRACE] — verify floor-local coord write (rowX in [0,W], rowY in [0,D])
    if (floorMinWrite != null) {
      const floorMaxWrite = floorBBWrite!.maximumWorld;
      const floorWW = floorMaxWrite.x - floorMinWrite.x;
      const floorDW = floorMaxWrite.z - floorMinWrite.z;
      const inLocalX = localX >= -1 && localX <= floorWW + 1;
      const inLocalY = localY >= -1 && localY <= floorDW + 1;
      console.log('[BS_STORE_WRITE_TRACE]', {
        rowId: row.id,
        meshName: target.name,
        meshUniqueId: target.uniqueId,
        reason,
        worldPosition: { x: absPos.x, y: absPos.y, z: absPos.z },
        rowWritten: { x: localX, y: localY, z: heightZ },
        floorMin: { x: floorMinWrite.x, z: floorMinWrite.z },
        floorMax: { x: floorMaxWrite.x, z: floorMaxWrite.z },
        floorSize: { w: floorWW, d: floorDW },
        coordSpaceGuess: (inLocalX && inLocalY) ? 'local' : 'out_of_range',
        rowX_in_0_W: localX >= 0 && localX <= floorWW,
        rowY_in_0_D: localY >= 0 && localY <= floorDW,
      });
    } else {
      console.warn('[BS_STORE_WRITE_TRACE] floorMesh null — stored mathPos fallback', { rowId: row.id, mathPos });
    }

    console.log('[COORD][Scene->Row]', {
      type: 'existing-bs',
      scenePosition: scenePos,
      mathPosition: {
        x: mathPos.x,
        y: mathPos.y,
        z: mathPos.z,
      },
    });
    console.log('[FieldStore][Scene->ExistingBs]', { rowId: row.id, seq: row.seq, reason });
  }

  private updateIntelligentPanelRowFromScene(
    target: AbstractMesh,
    row: IntelligentPanelFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    // [Step2A][RisRegistry] Verify registry association
    const registeredRowId = this.getFieldRowIdFromSceneNode(target);
    if (registeredRowId && registeredRowId !== row.id) {
      console.warn('[Step2A][RisRegistry] node registered to different row', { 
        nodeRegistered: registeredRowId, 
        rowId: row.id 
      });
    }

    // [RowWrite] Store row.x/row.y are floor-local first.
    const absPos = target.getAbsolutePosition
      ? target.getAbsolutePosition()
      : target.position;
    const local = this.sceneWorldToFloorLocalRow(absPos.x, absPos.z);

    this.fieldDomainStore.updateIntelligentPanel(row.id, {
      x: local.x,
      y: local.y,
      z: absPos.y,
      position: { x: local.x, y: local.y, z: absPos.y },
    });

    console.log('[COORD][Scene->Row]', {
      type: 'ris-or-ue',
      rowId: row.id,
      world: { x: absPos.x, z: absPos.z },
      rowXY: { x: local.x, y: local.y },
      path: local.path,
    });
    console.log('[FieldStore][Scene->RIS]', { rowId: row.id, seq: row.seq, reason });
    const updatedRow = this.fieldDomainStore.snapshot?.intelligentPanels?.find((r: any) => r.id === row.id) as any;
    console.log('[FieldStore][Scene->RIS][store-snapshot]', {
      rowId: row.id,
      frontendRowId: updatedRow?.id ?? row.id,
      backendRisID: updatedRow?.risID ?? updatedRow?.risId ?? null,
      profileID: updatedRow?.profileID ?? updatedRow?.profileId ?? null,
      insHorizontal: updatedRow?.insHorizontal ?? updatedRow?.installHorizontalAngle ?? null,
      insVertical: updatedRow?.insVertical ?? updatedRow?.installVerticalAngle ?? null,
      position: updatedRow?.position ?? { x: updatedRow?.x, y: updatedRow?.y, z: updatedRow?.z },
    });
  }

  private updateCandidateBsRowFromScene(
    target: AbstractMesh,
    row: CandidateBsFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    // [Step2A][CandidateBsRegistry] Verify registry association
    const registeredRowId = this.getFieldRowIdFromSceneNode(target);
    if (registeredRowId && registeredRowId !== row.id) {
      console.warn('[Step2A][CandidateBsRegistry] node registered to different row', { 
        nodeRegistered: registeredRowId, 
        rowId: row.id 
      });
    }

    // [Step2A][CandidateBsSync] Scene -> Math (canonical backend-facing)
    const scenePos = {
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    };
    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);

    this.fieldDomainStore.updateCandidateBs(row.id, {
      x: mathPos.x,
      y: mathPos.y,
      z: mathPos.z,
    });

    console.log('[COORD][Scene->Row]', {
      type: 'candidate-bs',
      scenePosition: scenePos,
      mathPosition: {
        x: mathPos.x,
        y: mathPos.y,
        z: mathPos.z,
      },
    });
    console.log('[FieldStore][Scene->CandidateBs]', { rowId: row.id, seq: row.seq, reason });
  }

  private updateCandidateRisRowFromScene(
    target: AbstractMesh,
    row: CandidateRisFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    // [Step2A][CandidateRisRegistry] Verify registry association
    const registeredRowId = this.getFieldRowIdFromSceneNode(target);
    if (registeredRowId && registeredRowId !== row.id) {
      console.warn('[Step2A][CandidateRisRegistry] node registered to different row', { 
        nodeRegistered: registeredRowId, 
        rowId: row.id 
      });
    }

    // [Step2A][CandidateRisSync] Scene -> Math (canonical backend-facing)
    const scenePos = {
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    };
    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);

    this.fieldDomainStore.updateCandidateRis(row.id, {
      x: mathPos.x,
      y: mathPos.y,
      z: mathPos.z,
    });

    console.log('[COORD][Scene->Row]', {
      type: 'ris',
      scenePosition: scenePos,
      mathPosition: {
        x: mathPos.x,
        y: mathPos.y,
        z: mathPos.z,
      },
    });
    console.log('[FieldStore][Scene->CandidateRis]', { rowId: row.id, seq: row.seq, reason });
  }

  private updateUeRowFromScene(
    target: AbstractMesh,
    row: UeFieldRow,
    reason: 'position' | 'rotation' | 'scale' | 'manual'
  ): void {
    // [Step2A][UeRegistry] Verify registry association
    const registeredRowId = this.getFieldRowIdFromSceneNode(target);
    if (registeredRowId && registeredRowId !== row.id) {
      console.warn('[Step2A][UeRegistry] node registered to different row', { 
        nodeRegistered: registeredRowId, 
        rowId: row.id 
      });
    }

    // [RowWrite] Store row.x/row.y are floor-local first.
    const absPos = target.getAbsolutePosition
      ? target.getAbsolutePosition()
      : target.position;
    const local = this.sceneWorldToFloorLocalRow(absPos.x, absPos.z);

    this.fieldDomainStore.updateUe(row.id, {
      x: local.x,
      y: local.y,
      z: absPos.y,
    });

    console.log('[COORD][Scene->Row]', {
      type: 'ris-or-ue',
      rowId: row.id,
      world: { x: absPos.x, z: absPos.z },
      rowXY: { x: local.x, y: local.y },
      path: local.path,
    });
    console.log('[FieldStore][Scene->UE]', { rowId: row.id, seq: row.seq, reason });
  }

  /* ===== End Patch 6 ===== */

  constructor(
    private mapPreview: MapPreviewService,
    private coord: MapCoordinateService,
    private renderer: Renderer2,
    private router: Router,
    private draft: ProjectDraftService,
    // ===== [SIM_API_PHASE1] Service Injections =====
    private baseTaskPayloadBuilder: BaseTaskPayloadBuilder,
    private taskApiService: TaskApiService,
    private simulationApiService: SimulationApiService,
    private resultApiService: ResultApiService,
    private alertService: AlertService
    ) {
      console.log('[DBG] EditScene constructor fired', new Date().toISOString());
      console.log('[DBG] mapPreview injected?', !!this.mapPreview);

      // ===== [B1:VIEWMODE_EFFECT] =====
      effect(() => {
        const mode = this.resultService.viewMode();
        if (mode === 'edit') {
          console.log('[EditScene][B1] mode=edit -> clear signal rays and heatmap');
          this.clearSignalRays();
          
          // ✅ 清理熱力圖相關資源
          this.isSimulationDone = false;
          
          if (this.heatmapPlane) {
            this.heatmapPlane.dispose();
            this.heatmapPlane = null;
          }
          
          if (this.heatmapTexture) {
            this.heatmapTexture.dispose();
            this.heatmapTexture = null;
          }
          
          this.clearHoverTimer();
        }
      });

    }

  ngOnInit(): void {
    console.log('[DEBUG][StoreCheck]', {
      hasStore: !!this.fieldDomainStore,
      obstacleCount: this.fieldDomainStore?.snapshot?.obstacles?.length ?? 0,
    });
    this.ensureAntennaPreloadOnce('ngOnInit');
  }

  ngAfterViewInit(): void {
    // Subscribe to field domain store for panel→scene sync
    this.fieldSceneSyncSub = this.fieldDomainStore.state$.subscribe((state: FieldDomainState) => {
      if (this.isApplyingFieldStoreToScene) return;
      if (this.isGizmoDragging) return;

      this.syncFieldRowsToScene(state);
    });

    setTimeout(() => {
      this.ensureBabylonReady('ngAfterViewInit');
      this.setupEngineResizeObserver();
      this.stage = 'edit';
      this.mountBabylonHostToCurrentStage();

      // 只需要單純呼叫即可，內部的 bootstrapCommittedMapIntoStageB 
      // 已經寫好 setLoading(true) 和 setLoading(false) 了。
      void this.bootstrapCommittedMapIntoStageB();
    }, 0);

    // [Patch 1] Preload antenna list (non-blocking, guard against duplicate)
    this.ensureAntennaPreloadOnce('ngAfterViewInit');

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isEditMode()) return;
      if (e.key === 'Escape') {
        // ✅ [LOCK] Do NOT close properties panel with Escape
        if (this.isPropertiesMode) {
          console.log('[Escape] Blocked - properties mode active, use Confirm/Cancel buttons');
          return;
        }
        
        // ✅ [FIX] Close context menu first if visible
        if (this.isMenuVisible) {
          this.closeContextMenu();
          return; // Don't propagate to Phase 2 exit
        }
        
        if (this.phase2EditingOwner) {
          this.phase2ExitEditing();
        }
      }
    });

    // ===== [DEV] Attach instance to window for debugging
    if (isDevMode()) {
      (window as any).__editScene = this;
      console.log('[DEV] window.__editScene attached');
      this.setupDevHeatmapDebugControls();

      // ===== Phase 1 debug helpers (window.__es) =====
      const w = window as any;
      w.__es = w.__es ?? {};
      w.__es.debugRegistry = () => {
        const entries = Array.from(this.sceneObjectRegistry.entries()).map(([rowId, entry]) => ({
          rowId,
          category: entry.category,
          ownerName: entry.ownerNode?.name ?? null,
          rootName: entry.rootMesh?.name ?? null,
          childMeshCount: entry.childMeshIds?.length ?? 0,
        }));
        console.log('[DBG][Registry]', {
          size: this.sceneObjectRegistry.size,
          entries,
        });
        return entries;
      };
      w.__es.debugFieldStoreCounts = () => {
        const s = this.fieldDomainStore.snapshot;
        const counts = {
          obstacles: s.obstacles?.length ?? 0,
          existingBs: s.existingBs?.length ?? 0,
          intelligentPanels: s.intelligentPanels?.length ?? 0,
          ueList: s.ueList?.length ?? 0,
          observes: s.observes?.length ?? 0,
          zones: s.zones?.length ?? 0,
          candidateBs: s.candidateBs?.length ?? 0,
          candidateRis: s.candidateRis?.length ?? 0,
        };
        console.log('[DBG][FieldStoreCounts]', counts);
        return counts;
      };
      w.__es.debugFieldRow = (rowId: string) => {
        const s = this.fieldDomainStore.snapshot;
        const pools = [
          ...(s.existingBs ?? []),
          ...(s.intelligentPanels ?? []),
          ...(s.ueList ?? []),
          ...(s.obstacles ?? []),
          ...(s.observes ?? []),
          ...(s.zones ?? []),
        ];
        const row = pools.find((r: any) => r.id === rowId) ?? null;
        console.log('[DBG][FieldRow]', { rowId, row });
        return row;
      };
      w.__es.debugFieldRowId = (meshName: string) => {
        const mesh = this.scene?.getMeshByName?.(meshName) ?? null;
        const meta = (mesh as any)?.metadata ?? null;
        const rowId = meta?.fieldRowId ?? null;
        console.log('[DBG][FieldRowId]', {
          meshName,
          found: !!mesh,
          rowId,
          metadata: meta,
        });
        return rowId;
      };
    }

  }

  ngOnDestroy(): void {
    this.fieldSceneSyncSub?.unsubscribe();
    this.detachMovePointerDragBehavior();

    // ===== [Patch 6] Cleanup gizmo observers =====
    const posGizmo: any = this.gizmoManager?.gizmos?.positionGizmo;
    const rotGizmo: any = this.gizmoManager?.gizmos?.rotationGizmo;
    const scaleGizmo: any = this.gizmoManager?.gizmos?.scaleGizmo;

    if (this.positionDragEndObserver && posGizmo?.onDragEndObservable) {
      posGizmo.onDragEndObservable.remove(this.positionDragEndObserver);
    }
    if (this.rotationDragEndObserver && rotGizmo?.onDragEndObservable) {
      rotGizmo.onDragEndObservable.remove(this.rotationDragEndObserver);
    }
    if (this.scaleDragEndObserver && scaleGizmo?.onDragEndObservable) {
      scaleGizmo.onDragEndObservable.remove(this.scaleDragEndObserver);
    }

    try {
      if (this.antennaLabelBeforeRenderObserver && this.scene) {
        this.scene.onBeforeRenderObservable.remove(this.antennaLabelBeforeRenderObserver);
        this.antennaLabelBeforeRenderObserver = null;
      }
    } catch {}

    this.antennaLabels = [];

    try {
      if (this.engine) {
        this.engine.stopRenderLoop();
      }
    } catch {}

    this.teardownEngineResizeObserver();

    try {
      this.highlightLayer?.dispose();
    } catch {}
    this.highlightLayer = null;

    try {
      this.scene?.dispose();
    } catch {}

    try {
      this.engine?.dispose();
    } catch {}

    this.scene = null;
    this.engine = null;
    this.unbindStageBInput();
    this.teardownMenuDragListeners();

    // ===== [DEV] Cleanup heatmap debug controls
    if (this.devHeatmapKeydownHandler) {
      window.removeEventListener('keydown', this.devHeatmapKeydownHandler, true);
      this.devHeatmapKeydownHandler = null;
    }

    // ===== [DEV] Cleanup coordinate debug overlays
    this.dbgDisposeRoot(this.dbgGeoCornerRoot);
    this.dbgDisposeRoot(this.dbgWorldAxisRoot);
    this.dbgDisposeRoot(this.dbgHeatmapAxisRoot);
    this.dbgDisposeRoot(this.dbgFloorMinAxisRoot);
    this.dbgDisposeRoot(this.dbgHeatmapPointRoot);
    this.dbgGeoCornerRoot = null;
    this.dbgWorldAxisRoot = null;
    this.dbgHeatmapAxisRoot = null;
    this.dbgFloorMinAxisRoot = null;
    this.dbgHeatmapPointRoot = null;

    // [BS_POLLUTION_FIX][Patch2] Safety reset: clear existingBs on component destroy
    // so that if this component is re-created (e.g. route re-entry without full
    // bootstrapCommittedMapIntoStageB), the store never carries stale rows.
    console.log('[BS_POLLUTION][reset][ngOnDestroy] reset FieldDomainStore on EditScene destroy');
    this.fieldDomainStore.reset();
  }

  /**
   * [Patch 1] Ensure antenna preload runs at most once. Safe to call from ngOnInit and ngAfterViewInit.
   */
  private ensureAntennaPreloadOnce(source: string): void {
    if (this.antennaPreloadStarted) {
      return;
    }
    this.antennaPreloadStarted = true;
    this.loadAntennaState();
  }

  /**
   * [Patch 2] Returns a deep clone of defaultAntenna for BS placement.
   * Each BS gets its own copy; modifying one does not affect another.
   * If defaultAntenna not yet loaded: returns null and logs. Placement still proceeds.
   */
  private getClonedDefaultAntennaForPlacement(): AntennaApiDto | null {
    if (this.defaultAntenna) {
      return typeof structuredClone === 'function'
        ? structuredClone(this.defaultAntenna)
        : JSON.parse(JSON.stringify(this.defaultAntenna));
    }
    console.log('[Patch2][BSPlacement] defaultAntenna not loaded yet; placing BS with antenna=null');
    return null;
  }

  /**
   * [Patch 1] Load antenna list on init.
   * Non-blocking: does not prevent EditScene from loading.
   * Sets antennaList, defaultAntenna (first or first with property==='default'), antennaLoaded, antennaLoadError.
   */
  private loadAntennaState(): void {
    const session = this.resolvePhase1SessionId();
    console.log('[Patch1][AntennaPreload] loadAntennaState started', { sessionExists: !!session, sessionLength: (session ?? '').length });

    if (!session || String(session).trim() === '') {
      this.antennaList = [];
      this.defaultAntenna = null;
      this.antennaLoaded = true;
      this.antennaLoadError = 'missing session';
      console.warn('[Patch1][AntennaPreload] skip: session is empty');
      return;
    }

    this.antennaService.getAntennasAsDto(session).subscribe({
      next: (list) => {
        this.antennaList = list ?? [];
        this.antennaLoaded = true;
        this.antennaLoadError = null;

        const defaultFirst = this.antennaList.find((a) => (a?.property ?? '').toLowerCase() === 'default');
        this.defaultAntenna = defaultFirst ?? this.antennaList[0] ?? null;

        console.log('[Patch1][AntennaPreload] antenna list length:', this.antennaList.length);
        if (this.defaultAntenna) {
          console.log('[Patch1][AntennaPreload] default antenna:', {
            id: this.defaultAntenna.antennaID,
            name: this.defaultAntenna.antennaName,
          });
        } else {
          console.log('[Patch1][AntennaPreload] no default antenna (list empty)');
        }
      },
      error: (err) => {
        this.antennaList = [];
        this.defaultAntenna = null;
        this.antennaLoaded = true;
        this.antennaLoadError = err?.message ?? String(err);
        console.warn('[Patch1][AntennaPreload] getAntenna failed (non-blocking):', {
          error: this.antennaLoadError,
          session,
        });
      },
    });
  }

  private setupEngineResizeObserver(): void {
    if (this.resizeObserver || this.windowResizeHandler) return;

    const hostEl = this.babylonHostRef?.nativeElement;
    if (!hostEl) return;

    const win = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (!win) return;

    if (typeof win.ResizeObserver === 'function') {
      this.resizeObserver = new win.ResizeObserver(() => {
        this.scheduleEngineResize('ResizeObserver');
      });
      this.resizeObserver.observe(hostEl);
    } else {
      this.windowResizeHandler = () => this.scheduleEngineResize('window');
      win.addEventListener?.('resize', this.windowResizeHandler, { passive: true });
    }

    this.scheduleEngineResize('setup');
  }

  private teardownEngineResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.windowResizeHandler) {
      const win = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
      win?.removeEventListener?.('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }

    if (this.resizeRafId != null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
  }

  private scheduleEngineResize(reason: string): void {
    void reason;
    if (!this.engine) return;
    if (this.resizeRafId != null) return;

    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      const canvas = this.renderCanvas?.nativeElement;
      const hostEl = this.babylonHostRef?.nativeElement;
      if (!canvas || !hostEl) return;

      const w = hostEl.clientWidth || canvas.clientWidth;
      const h = hostEl.clientHeight || canvas.clientHeight;
      if (w <= 2 || h <= 2) return;
      if (w === this.lastResizeW && h === this.lastResizeH) return;

      this.lastResizeW = w;
      this.lastResizeH = h;
      try {
        this.engine?.resize();
      } catch {}
    });
  }

  private mountBabylonHostToCurrentStage(): void {
    const target = this.babylonMountStageBRef?.nativeElement;
    if (!target) return;

    const host = this.babylonHostRef?.nativeElement;
    if (!host) return;

    // 把常駐 canvas host 移到 StageB mount
    target.appendChild(host);
    this.engine?.resize();
    this.scheduleEngineResize('mount');
  }

  // -------------------- Babylon Init --------------------
  private ensureBabylonReady(tag: string): void {
    const canvas = this.renderCanvas?.nativeElement;

    if (!canvas) {
      console.warn('[CHK][BabylonReady] no canvas yet', { tag });
      return;
    }

    if (!this.engine) {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    }

    if (!this.scene) {
      this.scene = new Scene(this.engine);
      this.scene.clearColor = new Color4(0, 0, 0, 1);

      this.ensureHighlightLayer();

      this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
      this.light.intensity = 0.9;

      // [FIX][Babylon] Bootstrap camera so the render loop never starts with `No camera defined`.
      // StageA will switch to previewCamera; StageB will switch to fpsCamera.
      if (this.scene && !this.scene.activeCamera) {
        const bootstrapCamera = new ArcRotateCamera(
          'bootstrapCamera',
          Math.PI / 4 + Math.PI,
          Math.PI / 3,
          300,
          Vector3.Zero(),
          this.scene
        );

        // 這裡用同一個 canvas（#renderCanvas）
        bootstrapCamera.attachControl(canvas, true);
        this.logCameraHeight('bootstrapCamera-created', bootstrapCamera);


        console.log('[FIX][Babylon] bootstrapCamera created (inactive)', {
          cams: this.scene.cameras.map(c => c.name),
          active: this.scene.activeCamera?.name ?? null,
        });
      }

      if (this.scene && !this.antennaLabelBeforeRenderObserver) {
        this.antennaLabelBeforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
          if (this.stage !== 'edit') return;
          this.updateAntennaLabelScreenPositions();
        });
      }

      console.log('[CHK][BabylonInit] about to start renderloop', {
        hasEngine: !!this.engine,
        hasScene: !!this.scene,
        activeCamera: this.scene?.activeCamera?.name ?? null,
      });

      console.log('[CHK][Scene@RenderLoop]', {
        sceneRef: this.scene,
        cameraNames: this.scene?.cameras?.map(c => c.name),
        activeCamera: this.scene?.activeCamera?.name ?? null,
      });

      this.ensureHighlightLayer();

      // ===== [RIGHT_CLICK_MENU:LISTENER] =====
      // Purpose: Detect right-click on meshes and show context menu
      // Note: RIGHT-CLICK must ONLY show menu, NOT trigger Gizmo or Phase 2 editing
      // Debug Strategy: Log all pointer events to diagnose flow
      // ==========================================
      
      this.scene.onPointerObservable.add((pointerInfo) => {
        // ✅ [GLOBAL_LOCK] Block ALL pointer events when properties mode is active
        if (this.isPropertiesMode) {
          console.log('[PointerObservable] Blocked - properties mode active');
          return;
        }
        
        // ✅ [DIAGNOSTICS] Log all pointer events
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
          const buttonName = pointerInfo.event.button === 2 ? 'RIGHT' : 'LEFT';
          console.log('[PointerObservable] POINTERDOWN Event:', {
            button: pointerInfo.event.button,
            buttonName,
            pointerX: this.scene.pointerX,
            pointerY: this.scene.pointerY,
            timestamp: new Date().toISOString()
          });
        }
        
        // ✅ RIGHT-CLICK HANDLER (button === 2)
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN && 
          pointerInfo.event.button === 2) {
          
          console.log('[RightClickMenu] RIGHT-CLICK detected, processing...');
          
          // [CRITICAL] Clear any existing Gizmo IMMEDIATELY
          if (this.gizmoManager?.attachedMesh) {
            if (!this.guardEditWrite('pointer:right-click detach gizmo')) return;
            console.log('[RightClickMenu] Clearing existing Gizmo:', this.gizmoManager.attachedMesh.name);
            this.gizmoManager.attachToMesh(null);
            this.phase2AttachGizmo(null);
          }
          
          // Perform pick to show menu for clicked mesh
          const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
          
          // ✅ [DIAGNOSTICS] Log pick result
          console.log('[RightClickMenu] Pick Result:', {
            hit: pickResult.hit,
            pickedMesh: pickResult.pickedMesh?.name ?? 'null',
            pickedPoint: pickResult.pickedPoint?.toString() ?? 'null',
            metadata: (pickResult.pickedMesh as any)?.metadata
          });
          
          if (pickResult.hit && pickResult.pickedMesh) {
            // Phase 1.5: debug probe (do not change behavior)
            const probeOwner = this.resolveSceneObjectOwner(pickResult.pickedMesh as any);


            const meshType = (pickResult.pickedMesh as any)?.metadata?.type;
            if (meshType === 'ground' || meshType === 'floor' || pickResult.pickedMesh.name.toLowerCase().includes('ground')) {
              console.log('[RightClickMenu] ⚠️  Ground mesh detected - ignoring right-click', {
                meshName: pickResult.pickedMesh.name,
                meshType
              });
              return;
            }

            const pickedMesh = pickResult.pickedMesh as AbstractMesh;
            const owner = this.resolveSceneObjectOwner(pickedMesh as any);

            const ownerMeta = (owner as any)?.metadata ?? {};
            const ownerType = ownerMeta.type ?? null;
            const isBuildingCandidate =
              ownerType === 'building' ||
              ownerMeta?.osmId != null ||
              ownerMeta?.tags?.building != null ||
              false;

            if (isBuildingCandidate) {
              console.log('[RightClickMenu] blocked for building', {
                picked: pickedMesh?.name ?? null,
                owner: (owner as any)?.name ?? null,
                ownerType,
                ownerMeta,
              });

              this.isMenuVisible = false;
              this.isCurrentlyRightClick = false;
              this.ctxMenuTargetMesh = null;
              this.ctxMenuTargetUniqueId = null;
              return;
            }

            this.setSelectedSceneObject(pickedMesh);
            this.ctxMenuTargetMesh = owner as any;
            this.ctxMenuTargetUniqueId = owner?.uniqueId ?? null;

            console.log('[CTX][OwnerOnly]', {
              picked: pickedMesh?.name ?? null,
              owner: owner?.name ?? null,
              ownerUid: (owner as any)?.uniqueId ?? null,
            });
            this.menuPosition = { 
              x: this.scene.pointerX + 10, 
              y: this.scene.pointerY
            };
            this.isMenuVisible = true;
            this.isCurrentlyRightClick = true;
            
            console.log('[RightClickMenu] ✅ Menu should be visible now', {
              visible: this.isMenuVisible,
              mesh: this.selectedMesh.name,
              position: this.menuPosition
            });
          } else {
            console.log('[RightClickMenu] ⚠️  No mesh picked - right-click on empty space');
            this.ctxMenuTargetMesh = null;
            this.ctxMenuTargetUniqueId = null;
          }
          
          // 🔒 CRITICAL: Return immediately to prevent Phase 2 processing
          return;
        }
        
        // ✅ LEFT-CLICK HANDLER (button === 0)
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN && 
            pointerInfo.event.button === 0) {
          const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
          const probeOwner = this.resolveSceneObjectOwner(pick?.pickedMesh as any);


          // Pin/toggle：在 edit+stageB 由 Phase2 observer 處理，避免同一點擊重複 toggle
          const inEditStage = this.isEditMode() && this.stage === 'edit';
          if (!inEditStage) {
            const pickedMesh = pick?.pickedMesh as AbstractMesh | null;
            const ownerNode = this.resolveOwnerMeshForInteraction(pickedMesh);

            if (!ownerNode) {
              this.clearPinnedHighlight();
              console.log('[Pinned][OwnerOnly]', {
                picked: pickedMesh?.name ?? null,
                owner: null,
                ownerUid: null,
                action: 'clear',
              });
            } else if (this.pinnedOwnerUniqueId === ownerNode.uniqueId) {
              this.clearPinnedHighlight();
              console.log('[Pinned][OwnerOnly]', {
                picked: pickedMesh?.name ?? null,
                owner: (ownerNode as any)?.name ?? null,
                ownerUid: ownerNode.uniqueId,
                action: 'toggle-off',
              });
            } else {
              this.applyPinnedHighlight(ownerNode as any);
              console.log('[Pinned][OwnerOnly]', {
                picked: pickedMesh?.name ?? null,
                owner: (ownerNode as any)?.name ?? null,
                ownerUid: ownerNode.uniqueId,
                action: 'set',
              });
            }

            this.recomputeActiveCardVM();
          }

          console.log('[LeftClickMenu] LEFT-CLICK detected');

          if (this.isMenuVisible) {
            console.log('[LeftClickMenu] Closing right-click menu');
            this.closeContextMenu();
          }

          return;
        }

        if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
          const hoverPick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
          const pickedMesh = hoverPick?.hit
            ? (hoverPick.pickedMesh as AbstractMesh | null)
            : null;
          const owner = this.resolveOwnerMeshForInteraction(pickedMesh);


          const nextUid = owner?.uniqueId ?? null;
          const nextHoveredMesh = owner instanceof AbstractMesh ? owner : null;
          const uidChanged = nextUid !== this.hoveredOwnerUniqueId;
          const meshChanged = nextHoveredMesh !== this.hoveredPickMesh;

          this.hoveredOwnerUniqueId = nextUid;
          this.hoveredAntennaOwnerUniqueId = this.isAntennaOwnerNode(owner)
            ? nextUid
            : null;

          for (const vm of this.antennaLabels) {
            vm.isHovered = vm.ownerUniqueId === this.hoveredAntennaOwnerUniqueId;
            vm.visible = vm.isHovered;
          }

          this.hoveredPickMesh = nextHoveredMesh;
          this.recomputeActiveCardVM();

          if (uidChanged || meshChanged) {
            this.ensureHighlightLayer();
            this.updateHighlight();
          }
        }
      });

      // Prevent default browser context menu
      canvas.oncontextmenu = (e: MouseEvent) => {
        console.log('[Canvas] Context menu prevented');
        e.preventDefault();
      };


      // Render Loop
      this.engine.runRenderLoop(() => {
        // RenderLoop 不負責 camera owner，只在有 activeCamera 時 render
        if (!this.scene.activeCamera) {
          return;
        }
        this.scene.render();
      });
    }
    console.log('[CHK][BeforeRenderLoop]', {
      cameras: this.scene.cameras.map(c => c.name),
      active: this.scene.activeCamera?.name ?? null,
    });
  }

  private registerAntennaLabelForOwner(owner: Mesh, title: string = '基地台'): void {
    if (!owner) return;

    const ownerUniqueId = owner.uniqueId;
    const exists = this.antennaLabels.some(vm => vm.ownerUniqueId === ownerUniqueId);
    if (exists) return;

    const vm: AntennaLabelVM = {
      id: this.antennaLabelSeq++,
      ownerUniqueId,
      antennaNo: this.antennaNoSeq++,
      title: title ?? '基地台',
      worldOffsetY: 0.5,
      anchorWorldX: 0,
      anchorWorldY: 0,
      anchorWorldZ: 0,
      anchorScreenX: null,
      anchorScreenY: null,
      screenX: null,
      screenY: null,
      cardOffsetPxX: 0,
      cardOffsetPxY: -16,
      stemHeightPx: null,
      isHovered: false,
      visible: false,
    };

    this.antennaLabels.push(vm);
  }

  private getMeshTopWorldY(owner: any): number | null {
    if (!owner) return null;

    const node: any = owner;

    if (node.computeWorldMatrix) node.computeWorldMatrix(true);

    if (node.refreshBoundingInfo) node.refreshBoundingInfo(true);
    if (node.thinInstanceRefreshBoundingInfo && node.thinInstanceCount > 0) {
      node.thinInstanceRefreshBoundingInfo(true);
    }

    if (node.getHierarchyBoundingVectors) {
      const hv = node.getHierarchyBoundingVectors(true);
      return hv?.max?.y ?? null;
    }

    const bi = node.getBoundingInfo?.();
    if (!bi) return null;
    return bi.boundingBox.maximumWorld.y;
  }

  private updateAntennaLabelScreenPositions(): void {
    if (!this.scene || !this.engine || !this.scene.activeCamera) return;

    const renderWidth = this.engine.getRenderWidth(true);
    const renderHeight = this.engine.getRenderHeight(true);
    const viewport = new Viewport(0, 0, renderWidth, renderHeight);
    for (const vm of this.antennaLabels) {
      if (!vm.isHovered) {
        vm.visible = false;
        vm.anchorScreenX = null;
        vm.anchorScreenY = null;
        vm.screenX = null;
        vm.screenY = null;
        vm.stemHeightPx = null;
        continue;
      }

      const owner = this.scene.getMeshByUniqueId(vm.ownerUniqueId) as Mesh | null;
      if (!owner || (owner as any).isDisposed?.()) {
        vm.isHovered = false;
        vm.visible = false;
        vm.anchorScreenX = null;
        vm.anchorScreenY = null;
        vm.screenX = null;
        vm.screenY = null;
        vm.stemHeightPx = null;
        continue;
      }

      const anchorMesh = owner.getChildMeshes?.(false)?.find((m: any) => m?.metadata?.anchorRole === 'antennaTop') ?? null;
      const anchorNode = anchorMesh ?? owner;
      anchorNode.computeWorldMatrix?.(true);

      const abs = anchorNode.getAbsolutePosition();
      const anchorWorld = new Vector3(abs.x, abs.y + vm.worldOffsetY, abs.z);
      vm.anchorWorldX = anchorWorld.x;
      vm.anchorWorldY = anchorWorld.y;
      vm.anchorWorldZ = anchorWorld.z;

      const anchorProj = Vector3.Project(
        anchorWorld,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport
      );

      const isValid = Number.isFinite(anchorProj.x)
        && Number.isFinite(anchorProj.y)
        && Number.isFinite(anchorProj.z)
        && anchorProj.z >= 0
        && anchorProj.x >= 0
        && anchorProj.x <= renderWidth
        && anchorProj.y >= 0
        && anchorProj.y <= renderHeight;

      if (!isValid) {
        vm.visible = false;
        vm.anchorScreenX = null;
        vm.anchorScreenY = null;
        vm.screenX = null;
        vm.screenY = null;
        vm.stemHeightPx = null;
        continue;
      }

      const x = anchorProj.x + vm.cardOffsetPxX;
      const y = anchorProj.y + vm.cardOffsetPxY;

      vm.anchorScreenX = anchorProj.x;
      vm.anchorScreenY = anchorProj.y;
      vm.screenX = x;
      vm.screenY = y;
      vm.stemHeightPx = Math.max(0, y - anchorProj.y);
      vm.visible = vm.isHovered;
    }
  }

  private async bootstrapCommittedMapIntoStageB(): Promise<void> {
    console.log('[EditScene][DBG] bootstrap enter');

    // [BS_POLLUTION_FIX][Patch1] Reset FieldDomainStore before new Stage B scene.
    // FieldDomainStore is a root singleton; existingBs rows from previous sessions
    // survive navigation. Reset here ensures every new committed map starts clean.
    // Safe because: (a) called once from ngAfterViewInit before any BS placement,
    // (b) retry path (retryBootstrapLoading) only fires after a failed load where
    //     no BSes could have been placed.
    console.log('[BS_POLLUTION][reset][bootstrapCommittedMapIntoStageB] reset FieldDomainStore before new Stage B scene');
    this.fieldDomainStore.reset();

    const existingBsCount =
      this.fieldDomainStore.snapshot?.existingBs?.length ?? 0;
    const obstaclesCount =
      this.fieldDomainStore.snapshot?.obstacles?.length ?? 0;
    const risCount =
      this.fieldDomainStore.snapshot?.intelligentPanels?.length ?? 0;
    const ueCount = this.fieldDomainStore.snapshot?.ueList?.length ?? 0;

    console.log('[DOMAIN_STORE_RESET_TRACE]', {
      where: 'bootstrapCommittedMapIntoStageB:afterReset',
      snapshot: { existingBsCount, obstaclesCount, risCount, ueCount },
    });

    let meta = this.draft.consumeProjectMeta?.() ?? null;
    let committed = this.draft.consumeCommittedMap?.() ?? null;

    if (this.DEBUG_STAY_IN_EDITSCENE) {
      if (!meta) {
        const debugMeta = {
          projectName: 'DEBUG_Project',
          fieldMapSource: 'gis',
          networkType: '5G',
          band: 'n78',
          fieldSize: { length: 0, width: 0, height: 3.5 },
          createdAtISO: new Date().toISOString(),
        };
        this.draft.setProjectMeta?.(debugMeta);
        meta = debugMeta;
      }

      if (!committed) {
        const debugCommitted = {
          provider: 'osm' as const,
          zoom: 17,
          committedAtISO: new Date().toISOString(),
          bbox: {
            south: 24.773470,
            west: 121.043763,
            north: 24.775722,
            east: 121.046243,
          },
        };
        this.draft.setCommittedMap?.(debugCommitted);
        committed = debugCommitted;
      }
    }

    if (!committed?.bbox) {
      console.warn('[EditScene][Phase3] no committed bbox -> redirect to /project/new');
      this.router.navigate(['/project/new']);
      return;
    }

    this.initFieldSettingsFromProjectMeta(meta);

    if (
      !this.fieldSettingsState.cutHeights ||
      this.fieldSettingsState.cutHeights.every(v => v == null || String(v).trim() === '')
    ) {
      this.fieldSettingsState.cutHeights = ['1.05', '', ''];
    }

    this.applyCommittedMapMeta(committed);

    if (
      !this.fieldSettingsState.cutHeights ||
      this.fieldSettingsState.cutHeights.every(v => v == null || String(v).trim() === '')
    ) {
      this.fieldSettingsState.cutHeights = ['1.05', '', ''];
    }

    this.sceneName = this.fieldSettingsState.projectName || this.sceneName;

    this.setLoading(true, '載入中...');

    try {
      const { south, west, north, east } = committed.bbox;
      const bounds = (L as any).latLngBounds(
        (L as any).latLng(south, west),
        (L as any).latLng(north, east)
      );

      const assets = await this.mapPreview.generate(
        this.scene!,
        bounds,
        committed.zoom ?? 17
      );

      if (!assets?.ground) {
        throw new Error('地圖或建築生成失敗：缺少 ground mesh');
      }

      this.committedMapData = assets;
      this.floorMesh = assets.ground;

      try { this.coord.commitAnchor?.(committed.bbox); } catch {}
      try { this.empowerCommittedMapMeshes?.(); } catch {}

      const canvas = this.renderCanvas?.nativeElement;
      if (!canvas || !this.floorMesh) {
        throw new Error('場景初始化失敗：缺少 canvas 或 floorMesh');
      }

    await this.initEditStageRuntime(this.floorMesh, canvas);
    this.setLoading(false);

    } catch (e: any) {
      console.error('[EditScene] bootstrap failed', e);

      this.loading = true;
      this.loadingError = true;
      this.loadingMessage = '載入中...';
      this.loadingErrorMessage =
        e?.message?.trim()
          ? e.message
          : '地圖載入失敗，請再試一次';
    }
  }

  retryBootstrapLoading(): void {
    this.loadingError = false;
    this.loadingErrorMessage = '';
    this.loading = false;

    queueMicrotask(() => {
      void this.bootstrapCommittedMapIntoStageB();
    });
  }

  // -------------------- Stage B Enter --------------------
  private bindStageBInput(): void {
    if (!this.scene || this.stageBInputBound) return;

    this.stageBKeyState = {};
    this.stageBInputBound = true;

    // Keyboard down/up tracking
    this.stageBKeyboardObserver = this.scene.onKeyboardObservable.add((kbInfo: any) => {
      const evt = kbInfo?.event as KeyboardEvent | undefined;
      if (!evt) return;

      const key = (evt.key || '').toLowerCase();
      if (!key) return;

      // Babylon: 1 = KEYDOWN, 2 = KEYUP (avoid importing enums to keep this incremental)
      if (kbInfo.type === 1) this.stageBKeyState[key] = true;
      if (kbInfo.type === 2) this.stageBKeyState[key] = false;
    });

    // Per-frame hook (we'll implement actual movement/rotation in later increments)
    this.stageBBeforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (this.stage !== 'edit') return;
      if (!this.fpsCamera) return;

      const deltaMs = this.engine?.getDeltaTime?.() ?? 16.67;
      const dt = deltaMs / 16.67;

      const moveForward = this.stageBKeyState['w'] ? 1 : 0;
      const moveBackward = this.stageBKeyState['s'] ? 1 : 0;
      const moveLeft = this.stageBKeyState['a'] ? 1 : 0;
      const moveRight = this.stageBKeyState['d'] ? 1 : 0;

      const forwardInput = moveForward - moveBackward;
      const strafeInput = moveRight - moveLeft;

      if (forwardInput !== 0 || strafeInput !== 0) {
        const yaw = this.fpsCamera.rotation.y;
        const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new Vector3(forward.z, 0, -forward.x);

        const move = forward.scale(forwardInput).add(right.scale(strafeInput));
        if (move.lengthSquared() > 1e-6) {
          move.normalize();
          //水平移動速度與場景大小成正比，確保大場景也能快速移動，小場景又不會太快失控
          //參數意義：
          // - this.sceneScale: 根據場景大小自動調整速度，確保大場景能快速移動，小場景不會太快
          // - 0.001: 經過測試的調整係數，確保在常見場景大小下有良好體驗
          // - Math.max(0.1, ...): 設置最低速度為 0.1，避免極小場景移動過慢
          //參數調整方式:
          // - 如果發現大場景移動仍然過慢，可以增加係數（如 0.002）；如果小場景移動過快，可以減少係數（如 0.0005）
          const horizontalSpeed = Math.max(0.1, this.sceneScale * 0.001);
          this.fpsCamera.cameraDirection.addInPlace(move.scale(horizontalSpeed * dt));
        }
      }

      const upPressed = this.stageBKeyState[' '] || this.stageBKeyState['space'];
      const downPressed = this.stageBKeyState['shift'];
      let direction = 0;

      if (upPressed) direction += 1;
      if (downPressed) direction -= 1;

      if (direction === 0) return;

      const step = this.verticalSpeed * dt;

      this.fpsCamera.position.y += direction * step;
    });

    console.log('[StageB][Input] bound');
  }

  private unbindStageBInput(): void {
    if (!this.scene || !this.stageBInputBound) return;

    if (this.stageBKeyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.stageBKeyboardObserver);
      this.stageBKeyboardObserver = undefined;
    }

    if (this.stageBBeforeRenderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.stageBBeforeRenderObserver);
      this.stageBBeforeRenderObserver = undefined;
    }

    this.stageBKeyState = {};
    this.stageBInputBound = false;

    console.log('[StageB][Input] unbound');

    // -------------------- Remove mouse look handlers --------------------
    const canvas = this.renderCanvas?.nativeElement;
    const handlers = (this as any)._stageBMouseHandlers;
    if (canvas && handlers) {
      canvas.removeEventListener('mousedown', handlers.onMouseDown);
      window.removeEventListener('mouseup', handlers.onMouseUp);
      window.removeEventListener('mousemove', handlers.onMouseMove);
      (this as any)._stageBMouseHandlers = null;
    }

    // -------------------- Remove wheel zoom handler --------------------
    const wheelHandler = (this as any)._stageBWheelHandler;
    if (canvas && wheelHandler) {
      canvas.removeEventListener('wheel', wheelHandler);
      (this as any)._stageBWheelHandler = null;
    }
  }

  // -------------------- Stage B Runtime Init --------------------
  private async initEditStageRuntime(groundMesh: Mesh, canvas: HTMLCanvasElement): Promise<void> {
    this.scene.activeCamera = this.fpsCamera;
    (this.scene as any).cameraToUseForPointers = this.fpsCamera;
    this.scene.activeCameras = [this.fpsCamera];

    console.log('[StageB][Init] enter initEditStageRuntime', {
      hasScene: !!this.scene,
      hasEngine: !!this.engine,
      ground: groundMesh?.name,
    });

    if (!this.scene) return;

    // 1) floorMesh
    this.floorMesh = groundMesh;
    this.floorMesh.isPickable = true;
    console.log('[StageB][Init] floorMesh set =', this.floorMesh.name);
    // ✅ StageB DOM（*ngIf）需要一個 tick 才會出現 mount 點
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.mountBabylonHostToCurrentStage();
        resolve();
      }, 0);
    });


    // 2) fpsCamera
    const bi = groundMesh.getBoundingInfo();
    const bb = bi.boundingBox;
    const center = bb.centerWorld;
    const size = bb.maximumWorld.subtract(bb.minimumWorld);
    const maxDim = Math.max(size.x, size.z);

    this.sceneScale = maxDim;

    const eyeHeight = Math.max(12, maxDim * 0.5);
    const edgeInset = Math.max(1, size.z * 0.05);
    const startZ = bb.maximumWorld.z - edgeInset;
    // Mirror camera XZ through map center so initial view is from the opposite side (same target, distance, height).
    const initialEye = new Vector3(center.x, center.y + eyeHeight, startZ);
    const mirroredEye = new Vector3(
      2 * center.x - initialEye.x,
      initialEye.y,
      2 * center.z - initialEye.z
    );

    if (this.fpsCamera) {
      try { this.fpsCamera.dispose(); } catch {}
    }

    this.fpsCamera = new UniversalCamera(
      'fpsCamera',
      mirroredEye,
      this.scene
    );
    this.fpsCamera.setTarget(new Vector3(center.x, center.y, center.z));
    this.fpsCamera.attachControl(canvas, true);
    this.logCameraHeight('fpsCamera-created', this.fpsCamera);

    this.bindStageBInput();

    // WASD handled manually in StageB key-state loop (horizontal plane only)
    this.fpsCamera.keysUp = [];
    this.fpsCamera.keysDown = [];
    this.fpsCamera.keysLeft = [];
    this.fpsCamera.keysRight = [];

    this.fpsCamera.minZ = 0.1;
    this.fpsCamera.maxZ = this.sceneScale * 200;

    this.scene.collisionsEnabled = true;
    this.fpsCamera.checkCollisions = true;
    this.fpsCamera.applyGravity = false;
    this.fpsCamera.ellipsoid = new Vector3(1, 1.8, 1);

    // -------------------- Mouse look (drag to rotate) --------------------
    
    if (canvas) {
      const onMouseDown = (e: MouseEvent) => {
        if (this.stage !== 'edit') return;
        if (e.button !== 0) return; // left button only
        this.stageBMouseDown = true;
        this.stageBLastMouseX = e.clientX;
        this.stageBLastMouseY = e.clientY;
      };

      const onMouseUp = () => {
        this.stageBMouseDown = false;
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!this.stageBMouseDown) return;
        if (this.stage !== 'edit') return;
        if (!this.fpsCamera) return;

        const dx = e.clientX - this.stageBLastMouseX;
        const dy = e.clientY - this.stageBLastMouseY;

        this.stageBLastMouseX = e.clientX;
        this.stageBLastMouseY = e.clientY;

        // Yaw (左右)
        this.fpsCamera.rotation.y -= dx * this.stageBMouseSensitivity;

        // Pitch (上下)，限制角度避免翻轉
        const nextPitch = this.fpsCamera.rotation.x - dy * this.stageBMouseSensitivity;
        const maxPitch = Math.PI / 2 - 0.01;
        this.fpsCamera.rotation.x = Math.max(
          -maxPitch,
          Math.min(maxPitch, nextPitch)
        );
      };

      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('mousemove', onMouseMove);

      // 存起來，unbind 時移除
      (this as any)._stageBMouseHandlers = {
        onMouseDown,
        onMouseUp,
        onMouseMove,
      };
    }

    // -------------------- Wheel zoom (FOV) --------------------
    const onWheel = (e: WheelEvent) => {
      if (this.stage !== 'edit') return;
      if (!this.fpsCamera) return;

      e.preventDefault();
      e.stopPropagation();

      // deltaY < 0: zoom in, deltaY > 0: zoom out
      const zoomStep = 0.03;
      const minFov = 0.35;
      const maxFov = 1.2;
      const dir = e.deltaY < 0 ? -1 : 1;

      const nextFov = this.fpsCamera.fov + dir * zoomStep;
      this.fpsCamera.fov = Math.min(maxFov, Math.max(minFov, nextFov));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    (this as any)._stageBWheelHandler = onWheel;


    // 3) gizmo (Phase 2 safe init)
    if (!this.gizmoManager) {
      this.gizmoManager = new GizmoManager(this.scene);
      
      // ✅ [FIX] Disable automatic pointer-based Gizmo attachment
      // We'll handle Gizmo attachment manually to avoid right-click interference
      (this.gizmoManager as any).usePointerToAttachGizmos = false;
    }

    // Phase 2: enable all (Phase 3 will apply scale policy)
    this.gizmoManager.positionGizmoEnabled = true;
    this.gizmoManager.rotationGizmoEnabled = true;
    this.gizmoManager.scaleGizmoEnabled = true;
    this.gizmoManager.clearGizmoOnEmptyPointerEvent = false;
    this.gizmoManager.attachToMesh(null);

    // ===== [Patch 6] Bind field store sync to gizmos =====
    this.bindFieldStoreSyncToGizmos();

    // Phase 3: reset gizmo flags on detach (safe defaults)
    this.gizmoManager.positionGizmoEnabled = false;
    this.gizmoManager.rotationGizmoEnabled = false;
    this.gizmoManager.scaleGizmoEnabled = false;

    // utility layer camera follows Stage B camera
    this.gizmoManager.utilityLayer.utilityLayerScene.activeCamera = this.fpsCamera;

    // 4) speed
    this.verticalSpeed = Math.max(1, this.sceneScale * 0.002);

    // 5) active camera (Stage B)
    this.scene.activeCameras = [this.fpsCamera];
    this.scene.activeCamera = this.fpsCamera;
    (this.scene as any).cameraToUseForPointers = this.fpsCamera;
    this.logCameraHeight('stageB-activeCamera', this.scene.activeCamera);

    console.log('[StageB][Init] done initEditStageRuntime', {
      sceneScale: this.sceneScale,
      verticalSpeed: this.verticalSpeed,
      activeCamera: this.scene.activeCamera?.name,
    });

    // resize
    if (this.engine) {
      const c = this.renderCanvas?.nativeElement;
      this.engine.resize();
      console.log('[DBG][Size] after StageB initEditStageRuntime', {
        renderW: this.engine.getRenderWidth(),
        renderH: this.engine.getRenderHeight(),
        canvasClientW: c?.clientWidth ?? null,
        canvasClientH: c?.clientHeight ?? null,
        canvasOffsetW: c?.offsetWidth ?? null,
        canvasOffsetH: c?.offsetHeight ?? null,
      });
    }

    // pointer handlers（你後續要整理 lifecycle；但與黑屏無關）
    console.log('[StageB][Init] register pointer handlers');

    // -------------------- Phase 2: Stage B Editing (double-click to open gizmo) --------------------
    // 規則：
    // - placementMode === 'none' 時才處理 editing
    // - 單擊：只選取
    // - 雙擊同一 owner：開 gizmo
    // - editing 中單擊另一 owner：切換 gizmo
    // - 單擊地面/空白：關閉 gizmo

    // 避免重複綁定
    if ((this as any)._phase2EditObserver) {
      try {
        this.scene.onPointerObservable.remove((this as any)._phase2EditObserver);
      } catch {}
      (this as any)._phase2EditObserver = null;
    }

    (this as any)._phase2EditObserver = this.scene.onPointerObservable.add((pi) => {
      if (!this.isEditMode()) return;

      if (pi.type !== PointerEventTypes.POINTERDOWN) return;
      if (this.stage !== 'edit') return;
      
      // ✅ [CRITICAL FIX] Only allow LEFT-CLICK for Phase 2 editing
      // RIGHT-CLICK is handled by the RIGHT_CLICK_MENU listener above and returns early
      if (pi.event.button !== 0) {
        console.log('[Phase2][EditObserver] Ignoring non-left-click button:', pi.event.button);
        return;
      }

      // ✅ HARD GATE: Phase 2 editing must NOT run during placement
      if (this.placementMode !== 'none') return;

      const pick = this.scene!.pick(this.scene!.pointerX, this.scene!.pointerY);
      const pickedMesh = pick?.pickedMesh ?? null;
      const ownerNode = this.resolveOwnerMeshForInteraction(pickedMesh as any);

      // owner-only selection state (picked mesh kept for debug)
      this.setSelectedSceneObject(pickedMesh as any);

      // Blank / non-interactive pick: clear drag + mode, keep gizmo & field-card selection
      if (!ownerNode) {
        this.detachMovePointerDragBehavior();
        // Do NOT clear gizmo mode on blank click — gizmo stays open until explicitly closed
        if (this.transformControlMode !== 'gizmo') {
          this.transformControlMode = null;
        }
        this.clearPinnedHighlight();
        this.recomputeActiveCardVM();
        this.phase2LastClickAt = 0;
        this.phase2LastClickPickId = null;
        return;
      }

      // In gizmo mode, do NOT exit editing on object click — gizmo must stay attached
      if (this.transformControlMode !== 'gizmo' && (this.gizmoManager?.attachedMesh || this.phase2EditingOwner)) {
        this.phase2ExitEditing();
      }

      if (this.pinnedOwnerUniqueId === ownerNode.uniqueId) {
        this.clearPinnedHighlight();
        console.log('[Pinned][OwnerOnly]', {
          picked: (pickedMesh as any)?.name ?? null,
          owner: (ownerNode as any)?.name ?? null,
          ownerUid: ownerNode.uniqueId,
          action: 'toggle-off',
        });
      } else {
        this.applyPinnedHighlight(ownerNode as any);
        console.log('[Pinned][OwnerOnly]', {
          picked: (pickedMesh as any)?.name ?? null,
          owner: (ownerNode as any)?.name ?? null,
          ownerUid: ownerNode.uniqueId,
          action: 'set',
        });
      }

      this.recomputeActiveCardVM();
      this.phase2LastClickAt = 0;
      this.phase2LastClickPickId = null;
      return;

      console.log('[DBG][P2-Observer-A][enter]', {
        type: pi.type,
        placementMode: this.placementMode,
      });

      const gizmoAttached = !!this.gizmoManager?.attachedMesh;

      // (1) 點空白/地面：若 gizmo 開著就關閉，並重置 double-click 狀態
      if (!ownerNode) {
        if (this.phase2EditingOwner) {
          this.phase2ExitEditing();
        }
        // 點空白也視為中斷雙擊鏈
        this.phase2LastClickAt = 0;
        this.phase2LastClickPickId = null;
        return;
      }

      // (2) editing 中：單擊另一個 owner -> 直接切換 gizmo（UX case A）
      if (gizmoAttached) {
        const current = this.phase2EditingOwner;
        // editing 模式下不走 double-click
        this.phase2LastClickAt = 0;
        this.phase2LastClickPickId = null;
        return;
      }

      // (3) 非 editing：單擊只選取，並「立刻 return」，避免落入同次事件的雙擊判斷
      this.phase2SelectedOwner = ownerNode as any;

      // -------------------- Phase 2: single-click select ONLY --------------------
      this.phase2SelectedOwner = ownerNode as any;

      // 記錄第一次點擊，供 double-click 使用
      this.phase2LastClickAt = performance.now();
      this.phase2LastClickPickId = ownerNode.uniqueId;

      // ❗❗關鍵：單擊一定要在這裡結束
      // 絕對不允許落入後面的 attach / double-click 區段
      return;
      // -------------------- END single-click select --------------------

      const now = performance.now();
      const withinWindow = (now - this.phase2LastClickAt) <= this.PHASE2_DBLCLICK_MS;
      const sameTarget = (this.phase2LastClickPickId !== null) && (ownerNode.uniqueId === this.phase2LastClickPickId);

      if (withinWindow && sameTarget) {
        // 雙擊成立：開 gizmo
        this.phase2AttachGizmo(ownerNode as any);

        // reset double-click state
        this.phase2LastClickAt = 0;
        this.phase2LastClickPickId = null;
        return;
      }

      // 記錄「第一次點擊」
      this.phase2LastClickAt = now;
      this.phase2LastClickPickId = ownerNode.uniqueId;
      return;
    });
    // -------------------- End Phase 2: Stage B Editing --------------------

  // -------------------- Phase 4: Stage B Pointer Routing (Pick only; no spawn) --------------------
  // 本增量只做：點擊 → scene.pick → 辨識 surface(type) + pickedPoint → console log
  // 不生成模型、不改既有 placing/selection 行為（僅新增一個 guarded 的 pointer handler）。

  // 避免重複綁定：若你有重進 initEditStageRuntime 的情境，先清掉舊的 observer
  if ((this as any)._phase4PickObserver) {
    try {
      this.scene.onPointerObservable.remove((this as any)._phase4PickObserver);
    } catch {}
    (this as any)._phase4PickObserver = null;
  }

  // 使用 Babylon 的 PointerObservable：只在 Stage B + placementMode != none 時攔截記錄
  (this as any)._phase4PickObserver = this.scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERDOWN) return;
    
    // Stage gate
    if (this.stage !== 'edit') return;

    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
    const mesh: any = pick?.pickedMesh;

    // 放置模式下：只 pick 到 ground/building/obstacle，避免被其他已放置物件（含 region / tree）擋住
    const surfacePick =
      this.placementMode !== 'none'
        ? this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            (m: any) => {
              const t = m?.metadata?.type ?? null;
              return t === 'ground' || t === 'building' || t === 'obstacle';
            }
          )
        : pick;

    // 之後 Phase4 放置判斷都用 surfacePick / surfaceMesh
    const surfaceMesh: any = surfacePick?.pickedMesh ?? null;

  // -------------------- Phase 2.2: single-click switch editing target --------------------
  if (!this.phase4SingleShot) {
    const hitMesh = (mesh as AbstractMesh) ?? null;

    // Ignore gizmo handles
    if (this.isPhase2GizmoHandleMesh(hitMesh)) {
      return;
    }

    const owner = this.resolvePhase2EditableOwner(hitMesh);

    // Case: currently editing, and user single-clicks another editable owner
    if (this.phase2EditingOwner && owner && owner !== this.phase2EditingOwner) {
      if (!this.guardEditWrite('pointer:phase2AttachGizmo switch')) return;
      this.phase2SelectedOwner = owner;
      this.phase2EditingOwner = owner;
      this.phase2AttachGizmo(owner);

      // reset click timing to avoid double-click confusion
      this.phase2LastClickAt = 0;
      this.phase2LastClickPickId = null;
      return;
    }

    // Case: single-click editable owner (selection only, no gizmo yet)
    const gizmoAttached = !!this.gizmoManager?.attachedMesh;

    console.log('[DBG][EditingState]', {
      gizmoAttached,
      editingOwner: this.phase2EditingOwner?.name ?? null,
      editingMesh: this.phase2EditingMesh?.name ?? null,
    });

    // Blank / ground: keep gizmo & field-card selection (no phase2ExitEditing)
    if (!owner && gizmoAttached) {
      return;
    }
  }
  // -------------------- End Phase 2.2 (single-click switch) --------------------

  // -------------------- Phase 2.1: stable double click -> gizmo attach (owner based; ignore gizmo handles) --------------------
  if (!this.phase4SingleShot && this.placementMode === 'none') {
    const now = performance.now();

    const hitMesh = (mesh as AbstractMesh) ?? null;

    // Ignore gizmo handles clicks entirely (do not affect click timing / switching)
    if (this.isPhase2GizmoHandleMesh(hitMesh)) {
      return;
    }

    const owner = this.resolvePhase2EditableOwner(hitMesh);

    // -------------------- Phase 2 (converged): click state machine --------------------
    // Rules:
    // - If gizmo is attached: single-click on another owner switches; click ground/empty closes.
    // - If gizmo is NOT attached: single-click selects; double-click on same owner opens.
    // - After closing, MUST return to "double-click to open".

    const gizmoAttached = !!this.gizmoManager?.attachedMesh;

    // 1) Click ground/empty: reset double-click chain only (keep gizmo / card selection)
    if (!owner) {
      this.phase2LastClickAt = 0;
      this.phase2LastClickPickId = null;
      return;
    }

    // 2) Gizmo already open: single-click switches target (Case A)
    if (gizmoAttached) {
      const cur = this.phase2EditingOwner;
      if (!cur || cur.uniqueId !== owner.uniqueId) {
        if (!this.guardEditWrite('pointer:phase2AttachGizmo switch')) return;
        this.phase2AttachGizmo(owner);
      }
      // When editing, do not keep dblclick chain
      this.phase2LastClickAt = 0;
      this.phase2LastClickPickId = null;
      return;
    }

    // 3) Single click: Drag Mode only — blocked while gizmo is active
    console.log('[TransformMode][Click3]', { transformControlMode: this.transformControlMode, owner: owner?.name ?? null });
    if (this.transformControlMode === 'gizmo') {
      // Gizmo is open; keep drag disabled until user explicitly closes gizmo
      console.log('[TransformMode][Click3] blocked — gizmo mode active');
      return;
    }
    this.phase2SelectedOwner = owner;
    if (!this.guardEditWrite('pointer:enterDragMode singleclick')) return;
    this.enterDragMode(owner);
    this.phase2LastClickAt = 0;
    this.phase2LastClickPickId = null;
    return;
    // -------------------- End Phase 2 (converged) --------------------

  }
  // -------------------- End Phase 2.1 --------------------
    // [DBG][ExitGate] place right before Phase4 PickSurface log (stable anchor)
    const __dbgOwner = this.resolvePhase2EditableOwner((mesh as any) ?? null);
    console.log('[DBG][ExitGate]', {
      hit: !!pick?.hit,
      mesh: (mesh as any)?.name ?? null,
      meshType: (mesh as any)?.metadata?.type ?? null,
      resolvedOwner: __dbgOwner?.name ?? null,
      resolvedOwnerType: (__dbgOwner as any)?.metadata?.type ?? null,
      phase2EditingOwner: this.phase2EditingOwner?.name ?? null,
      phase2EditingMesh: this.phase2EditingMesh?.name ?? null,
      gizmoAttached: this.gizmoManager?.attachedMesh?.name ?? null,
    });
    
    // -------------------- Phase 2.2: highest priority exit editing --------------------
    if (!this.phase4SingleShot && this.phase2EditingOwner) {
      const hitMesh = (mesh as AbstractMesh) ?? null;

      // Ignore gizmo handles
      if (!this.isPhase2GizmoHandleMesh(hitMesh)) {
        const owner = this.resolvePhase2EditableOwner(hitMesh);

        // Ground / empty: keep gizmo & field-card selection
        if (!owner) {
          return;
        }
      }
    }
    // -------------------- End Phase 2.2 priority exit --------------------

  // -------------------- Phase 4: Single-shot capture (use surfacePick) --------------------
  const surfaceType: string | null = surfaceMesh?.metadata?.type ?? null;
  const allowed =
    surfacePick?.hit === true &&
    (surfaceType === 'ground' || surfaceType === 'building' || surfaceType === 'obstacle');

  const capturedMode = this.placementMode;

  // capture placement intent
  if (capturedMode !== 'none' && allowed && surfacePick?.pickedPoint) {
    if (!this.guardEditWrite('pointer:placement capture')) return;
    const placedOn: 'ground' | 'building' = surfaceType === 'building' ? 'building' : 'ground';

    // ✅ 修正放置偏移：使用 surfacePick.pickedPoint 原始座標（未經偏移補償）
    // Store this click's intent so async template loading can still spawn.
    this.phase4SingleShot = {
      mode: capturedMode as any,
      itemId: this.phase4PendingItemId ?? null,
      point: surfacePick.pickedPoint.clone(),
      placedOn,
    };

    // Exit placement mode immediately (single-shot)
    this.placementMode = 'none';
    this.phase4PendingItemId = null;

    console.log('[Phase4][PlacementMode] single-shot auto-exit', {
      from: capturedMode,
      to: 'none',
      shot: this.phase4SingleShot,
    });
  }

    // Spawn by the captured single-shot intent (NOT by placementMode, which is now 'none')
    const shot = this.phase4SingleShot;

    if (shot?.mode === 'antenna' && shot?.itemId === 'antenna_placeable') {
      if (!this.guardEditWrite('pointer:spawn antenna_placeable')) return;
      this.spawnBaseStationPlaceableMarkerAt(shot.point, shot.placedOn);
      this.phase4SingleShot = null;
      return;
    }

    if (shot?.mode === 'ris' && shot?.itemId === 'ris_placeable') {
      if (!this.guardEditWrite('pointer:spawn ris_placeable')) return;
      this.spawnRisPlaceableMarkerAt(shot.point, shot.placedOn);
      this.phase4SingleShot = null;
      return;
    }

    if (shot?.mode === 'antenna' && shot?.itemId === 'antenna_1') {
      if (!this.guardEditWrite('pointer:spawn antenna_1')) return;
      this.spawnStandardAntennaProceduralAt(shot.point, shot.placedOn);
      this.phase4SingleShot = null;
      return;
    }

    // Antenna (glb) - 包含標準天線與 RIS
    if (shot?.mode === 'antenna' && shot?.itemId !== 'das_antenna') {
      if (!this.guardEditWrite('pointer:spawn antenna')) return;
      this.ensureAntennaTemplateLoaded()
        .then(() => {
          if (this.stage !== 'edit') return;

          const s = this.phase4SingleShot;
          if (!s || s.mode !== 'antenna') return;

          this.spawnAntennaAt(s.point, s.placedOn);
          this.phase4SingleShot = null;
        })
        .catch((e) => console.error('[Phase4][Antenna] ensure template failed', e));
    }

    // DAS Antenna (glb) - ✅ 新增 DAS 天線生成邏輯
    if (shot?.mode === 'antenna' && shot?.itemId === 'das_antenna') {
      if (!this.guardEditWrite('pointer:spawn das_antenna')) return;
      this.ensureDasAntennaTemplateLoaded()
        .then(() => {
          if (this.stage !== 'edit') return;

          const s = this.phase4SingleShot;
          if (!s || s.mode !== 'antenna' || s.itemId !== 'das_antenna') return;

          this.spawnDasAntennaAt(s.point, s.placedOn);
          this.phase4SingleShot = null;
        })
        .catch((e) => console.error('[Phase4][DasAntenna] ensure template failed', e));
    }

    // Terminal (glb)
    if (shot?.mode === 'terminal') {
      if (!this.guardEditWrite('pointer:spawn terminal')) return;
      this.ensureTerminalTemplateLoaded()
        .then(() => {
          if (this.stage !== 'edit') return;

          const s = this.phase4SingleShot;
          if (!s || s.mode !== 'terminal') return;

          this.spawnTerminalAt(s.point, s.placedOn);
          this.phase4SingleShot = null;
        })
        .catch((e) => console.error('[Phase4][Terminal] ensure template failed', e));
    }

    // Obstacle (primitive - by itemId: box/sphere/cylinder)
    if (shot?.mode === 'obstacle') {
      if (!this.guardEditWrite('pointer:spawn obstacle')) return;
      this.spawnObstaclePrimitiveAt(shot.itemId ?? 'box', shot.point, shot.placedOn);
      this.phase4SingleShot = null;
    }

// Landscape (MVP: tree)
if (shot?.mode === 'landscape') {
  if (!this.guardEditWrite('pointer:spawn landscape')) return;

  this.spawnLandscapeAt(shot.itemId ?? 'tree', shot.point, shot.placedOn);

  // [Patch1][Landscape] Single-shot cleanup: prevent continuous placement
  this.phase4SingleShot = null;
  this.placementMode = 'none';
  this.phase4PendingItemId = null;

  return;
}

// RIS (Smart Reflective Surface Panel)
if (shot?.mode === 'ris') {
  if (!this.guardEditWrite('pointer:spawn ris')) return;
  this.spawnRISAt(shot.point, shot.placedOn);
  this.phase4SingleShot = null;
}

// Regions: observeZone / customZone (semi-transparent + x-ray + NOT obstacle)
if (shot?.mode === 'observeZone' || shot?.mode === 'customZone') {
  if (!this.guardEditWrite('pointer:spawn region')) return;
  this.spawnRegionBoxAt(shot.mode, shot.point, shot.placedOn);
  this.phase4SingleShot = null;
}

  });
  // -------------------- End Phase 4: Stage B Pointer Routing --------------------

  }

  // -------------------- Phase 2: Gizmo helpers (stable owner + ignore gizmo handles) --------------------

  /** return true if the picked mesh belongs to Gizmo utility layer (handles, planes, etc.) */
  private isPhase2GizmoHandleMesh(mesh: AbstractMesh | null | undefined): boolean {
    if (!mesh || !this.gizmoManager) return false;
    // Gizmo meshes live in utilityLayerScene
    return mesh.getScene() === this.gizmoManager.utilityLayer.utilityLayerScene;
  }

  /**
   * Resolve "editable owner" for a picked mesh.
   * - Many GLBs (antenna/phone) have metadata on the root, while geometry is in child meshes.
   * - We climb up parents to find the first node with metadata.type in editable set.
   */
  private resolvePhase2EditableOwner(picked: AbstractMesh | null | undefined): AbstractMesh | null {
    if (!picked) return null;

    // Phase 1.5: debug probe (do not change behavior)
    const probeOwner = this.resolveSceneObjectOwner(picked as any);


    // If user clicks gizmo handles, ignore (do not treat as object pick)
    if (this.isPhase2GizmoHandleMesh(picked)) return null;

    const editableTypes = new Set(['obstacle', 'antenna', 'terminal', 'landscape', 'observeZone', 'customZone']);
    const resolvedOwner = this.resolveSceneObjectOwner(picked as any);

    const t = (resolvedOwner as any)?.metadata?.type ?? null;
    if (t && editableTypes.has(t)) {
      return resolvedOwner instanceof AbstractMesh ? (resolvedOwner as AbstractMesh) : null;
    }

    return null;
  }


  private isPhase2EditableOwner(owner: AbstractMesh | null | undefined): boolean {
    if (!owner) return false;
    const t = (owner as any)?.metadata?.type ?? null;
    return t === 'obstacle' || t === 'antenna' || t === 'terminal'
        || t === 'landscape' || t === 'observeZone' || t === 'customZone';
  }

  /** Attach gizmo at resolved scene owner root (same path as phase2). */
  private attachGizmoToOwner(owner: TransformNode | AbstractMesh): void {
    const root = this.resolveSceneObjectOwner(owner as any) ?? owner;
    this.phase2AttachGizmo(root as any);
  }

  private detachGizmo(): void {
    this.phase2AttachGizmo(null);
  }

  private phase2AttachGizmo(
    target: AbstractMesh | TransformNode | null
  ): void {
    if (!this.guardEditWrite('phase2AttachGizmo')) return;
    if (!this.gizmoManager) return;

    if (!target) {
      this.detachMovePointerDragBehavior();
      this.transformControlMode = null;
      this.gizmoManager.attachToMesh(null);
      this.phase2EditingMesh = null;
      this.phase2EditingOwner = null;
      this.selectedOwner = null;
      this.selectedFieldCard = null;
      this.selectedContextRowId = null;
      console.log('[Phase2][Gizmo] detached');
      return;
    }

    const resolvedOwner = this.resolveSceneObjectOwner(target as any) ?? target;
    const owner = resolvedOwner instanceof AbstractMesh ? resolvedOwner : null;
    if (!owner) {
      this.detachMovePointerDragBehavior();
      this.transformControlMode = null;
      this.gizmoManager.attachToMesh(null);
      this.phase2EditingMesh = null;
      this.phase2EditingOwner = null;
      this.selectedOwner = null;
      this.selectedFieldCard = null;
      this.selectedContextRowId = null;
      console.log('[Gizmo][OwnerAttach] detached (non-AbstractMesh owner)');
      return;
    }

    // Ensure drag is fully detached before gizmo takes control
    this.detachMovePointerDragBehavior();
    this.gizmoManager.attachToMesh(owner);

    // -------------------- Phase 3: Gizmo scale policy --------------------
    const t = (owner as any)?.metadata?.type ?? null;

    // Rotate: always enabled. Position (move) gizmo is intentionally OFF — movement is handled by Drag Mode (PointerDragBehavior) exclusively.
    this.gizmoManager.positionGizmoEnabled = false;
    this.gizmoManager.rotationGizmoEnabled = true;

    // Scale: disabled for antenna / terminal; enabled for others
    const allowScale = (t !== 'antenna' && t !== 'terminal');
    this.gizmoManager.scaleGizmoEnabled = allowScale;

    console.log('[Phase3][GizmoPolicy]', { type: t, allowScale });
    // -------------------- End Phase 3 --------------------

    // Re-bind rotation drag observers on the new gizmo instance created by rotationGizmoEnabled = true.
    // The instance from init-time bindFieldStoreSyncToGizmos() was disposed when rotationGizmoEnabled = false ran during init.
    const rotGizmoNew: any = this.gizmoManager.gizmos?.rotationGizmo;
    if (rotGizmoNew) {
      if (this.rotationDragEndObserver && rotGizmoNew.onDragEndObservable) {
        rotGizmoNew.onDragEndObservable.remove(this.rotationDragEndObserver);
      }
      if (rotGizmoNew.onDragStartObservable) {
        rotGizmoNew.onDragStartObservable.add(() => { this.isGizmoDragging = true; });
      }
      if (rotGizmoNew.onDragEndObservable) {
        this.rotationDragEndObserver = rotGizmoNew.onDragEndObservable.add(() => {
          this.isGizmoDragging = false;
          this.syncSelectedSceneObjectToFieldStore('rotation');
        });
      }
    }

    this.phase2EditingOwner = owner;
    this.phase2EditingMesh = owner;
    this.selectedOwner = owner;
    // NOTE: intentionally no attachMovePointerDragBehavior here — gizmo mode is exclusive

    console.log('[Gizmo][OwnerAttach]', {
      target: (target as any)?.name ?? null,
      owner: owner?.name ?? null,
      ownerUid: owner?.uniqueId ?? null,
    });

    console.log('[Phase2][Gizmo] attached', {
      name: owner.name,
      type: (owner as any)?.metadata?.type ?? null,
      id: owner.uniqueId,
    });

  console.log('[DBG][GizmoState]', {
    editingOwner: this.phase2EditingOwner?.name ?? null,
    editingMesh: this.phase2EditingMesh?.name ?? null,
    gizmoAttached: this.gizmoManager?.attachedMesh?.name ?? null,
  });

  console.log('[DBG][AttachCalled]', { owner: owner?.name ?? null });

  }


  // -------------------- End Phase 2 --------------------

  // -------------------- PointerDragBehavior helpers (XZ mesh-body drag) --------------------

  private detachMovePointerDragBehavior(): void {
    if (this.movePointerDragBehavior) {
      try {
        // Use tracked owner instead of private Babylon _attachedNode for reliability
        const host = this.movePointerDragOwner;
        if (host && typeof host.removeBehavior === 'function') {
          host.removeBehavior(this.movePointerDragBehavior);
        }
      } catch { /* ignore disposal errors */ }
      console.log('[TransformMode][Drag] detachMovePointerDragBehavior', { owner: this.movePointerDragOwner?.name ?? null });
      this.movePointerDragBehavior = null;
      this.movePointerDragOwner = null;
    }
  }

  private attachMovePointerDragBehavior(owner: AbstractMesh): void {
    this.detachMovePointerDragBehavior();

    const drag = new PointerDragBehavior({ dragPlaneNormal: new Vector3(0, 1, 0) });
    drag.detachCameraControls = true;

    drag.onDragEndObservable.add(() => {
      this.syncSelectedSceneObjectToFieldStore('position');
    });

    owner.addBehavior(drag);
    this.movePointerDragBehavior = drag;
    this.movePointerDragOwner = owner;
    console.log('[TransformMode][Drag] attachMovePointerDragBehavior', { owner: owner.name });
  }

  // -------------------- Transform control mode (mutual exclusion) --------------------

  /** Single-click: select + XZ drag only. No gizmo. */
  private enterDragMode(owner: AbstractMesh): void {
    if (this.transformControlMode === 'gizmo') {
      console.log('[TransformMode] enterDragMode blocked — gizmo mode is active', { owner: owner.name });
      return;
    }
    console.log('[TransformMode] enterDragMode → start', { owner: owner.name, prevMode: this.transformControlMode });
    this.transformControlMode = 'drag';
    this.detachMovePointerDragBehavior();
    if (this.gizmoManager) {
      this.gizmoManager.attachToMesh(null);
    }
    this.phase2EditingOwner = owner;
    this.phase2EditingMesh = owner;
    this.selectedOwner = owner;
    this.attachMovePointerDragBehavior(owner);
    console.log('[TransformMode] enterDragMode → done', { owner: owner.name, mode: this.transformControlMode });
  }

  /** Right-click menu: open gizmo (rotate+scale only), detach drag. Delegates to phase2AttachGizmo for gizmo policy. */
  private enterGizmoMode(owner: AbstractMesh): void {
    console.log('[TransformMode] enterGizmoMode → start', { owner: owner.name, prevMode: this.transformControlMode });
    this.transformControlMode = 'gizmo';
    this.detachMovePointerDragBehavior();
    this.phase2AttachGizmo(owner);
    console.log('[TransformMode] enterGizmoMode → done', { owner: owner.name, mode: this.transformControlMode, positionGizmo: this.gizmoManager?.positionGizmoEnabled ?? null });
  }

  // -------------------- End Transform control mode --------------------

  // -------------------- End PointerDragBehavior helpers --------------------

  // -------------------- Phase 2.2: exit editing --------------------
  private phase2ExitEditing(): void {
    if (!this.guardEditWrite('phase2ExitEditing')) return;
    const exitingOwnerUid = this.phase2EditingOwner?.uniqueId ?? null;

    this.phase2EditingOwner = null;
    this.phase2SelectedOwner = null;
    this.selectedOwner = null;
    this.phase2AttachGizmo(null);

    // Keep selectedOwner/selectedMesh consistent with phase2 exit
    if (exitingOwnerUid != null && this.selectedMesh) {
      const selOwner = this.resolveSceneObjectOwner(this.selectedMesh as any);
      if (selOwner?.uniqueId === exitingOwnerUid) {
        this.selectedMesh = null;
      }
    }

    this.phase2LastClickAt = 0;
    this.phase2LastClickPickId = null;

    console.log('[Phase2][Gizmo] exit editing');
  }
  // -------------------- End Phase 2.2 --------------------

// -------------------- Phase 4: Antenna spawn helpers --------------------
private async ensureAntennaTemplateLoaded(): Promise<void> {
  if (!this.guardEditWrite('ensureAntennaTemplateLoaded')) return;
  if (this.antennaTemplateRoot) return;
  if (this.isLoadingAntennaTemplate) return;

  this.isLoadingAntennaTemplate = true;

  try {
    // 注意：assets 路徑要與你專案一致。這裡依你需求使用 src/assets/models/antenna.glb
    const result = await SceneLoader.ImportMeshAsync(
      '',
      'assets/models/',
      'antenna.glb',
      this.scene
    );

    // 把載入的 meshes 收到一個 root，方便之後 clone
    const root = new TransformNode('antenna_template_root', this.scene);
    for (const mesh of result.meshes) {
      // 避免把 scene 本身 root mesh 也掛進來（通常 meshes[0] 可能是 __root__）
      if (!mesh) continue;
      if (mesh === this.scene.meshes[0]) continue;

      // 將模板藏起來，不要干擾使用者視覺與 pick
      mesh.setEnabled(false);
      mesh.isPickable = false;
      mesh.parent = root;
    }

    this.antennaTemplateRoot = root;

    console.log('[Phase4][Antenna] template loaded', {
      meshes: result.meshes.length,
    });
  } catch (e) {
    console.error('[Phase4][Antenna] template load failed', e);
    this.antennaTemplateRoot = null;
  } finally {
    this.isLoadingAntennaTemplate = false;
  }
}

  // ================== DAS Antenna Template Loader ==================
  private async ensureDasAntennaTemplateLoaded(): Promise<void> {
    if (!this.guardEditWrite('ensureDasAntennaTemplateLoaded')) return;
    if (this.dasAntennaTemplateRoot) return;
    if (this.isLoadingDasAntennaTemplate) return;

    this.isLoadingDasAntennaTemplate = true;

    try {
      // 載入 DAS 天線模型：assets/models/das_antenna.glb
      const result = await SceneLoader.ImportMeshAsync(
        '',
        'assets/models/',
        'das_antenna.glb',
        this.scene
      );

      // 將所有載入的 meshes 組織到模板根節點下
      const root = new TransformNode('das_antenna_template_root', this.scene);
      for (const mesh of result.meshes) {
        // 避免把 scene root mesh 也掛進來
        if (!mesh) continue;
        if (mesh === this.scene.meshes[0]) continue;

        // 隱藏模板，不干擾使用者視覺與 pick
        mesh.setEnabled(false);
        mesh.isPickable = false;
        mesh.parent = root;
      }

      this.dasAntennaTemplateRoot = root;

      console.log('[Phase4][DasAntenna] 模板已載入', {
        meshes: result.meshes.length,
      });
    } catch (e) {
      console.error('[Phase4][DasAntenna] 模板載入失敗', e);
      this.dasAntennaTemplateRoot = null;
    } finally {
      this.isLoadingDasAntennaTemplate = false;
    }
  }

  private spawnAntennaAt(point: any, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnAntennaAt')) return;
    if (!this.antennaTemplateRoot) {
      console.warn('[Phase4][Antenna] spawn aborted: template not loaded');
      return;
    }

    const instanceRoot = this.antennaTemplateRoot.clone('antenna_instance_root');
    if (!instanceRoot) {
      console.warn('[Phase4][Antenna] clone failed');
      return;
    }

    instanceRoot.setEnabled(true);

    const owner = MeshBuilder.CreateBox('antenna_owner', { size: 0.01 }, this.scene);
    owner.isVisible = false;
    owner.isPickable = false;
    owner.position = point.clone ? point.clone() : point;
    const getAntennaChildRotations = () =>
      ((instanceRoot as any)?.getChildMeshes?.() ?? []).map((m: any) => ({
        name: m?.name ?? null,
        uid: m?.uniqueId ?? null,
        rotation: m?.rotation
          ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z }
          : null,
      }));
    console.log('[AntennaRotation][BeforeApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationBefore: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsBefore: getAntennaChildRotations(),
    });
    owner.rotation = this.DEFAULT_ANTENNA_ROT.clone();
    console.log('[AntennaRotation][AfterApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationAfter: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsAfter: getAntennaChildRotations(),
    });

    (instanceRoot as any).parent = owner;
    instanceRoot.position = Vector3.Zero();

    const childMeshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes() : [];
    for (const m of childMeshes) {
      m.setEnabled(true);
      m.isPickable = true;
      m.metadata = {
        ...(m.metadata ?? {}),
        type: 'antenna',
        itemId: 'antenna',
        placedOn,
        ownerMeshUniqueId: owner.uniqueId,
      };
    }
    this.attachMeshesToOwner(instanceRoot as any, childMeshes);
    this.reparentLooseChildrenToOwner(owner, (mesh) => {
      const meta = (mesh as any)?.metadata ?? {};
      return meta.ownerMeshUniqueId === owner.uniqueId;
    });
    this.attachMeshesToOwner(instanceRoot as any, childMeshes);
    this.reparentLooseChildrenToOwner(owner, (mesh) => {
      const meta = (mesh as any)?.metadata ?? {};
      return meta.ownerMeshUniqueId === owner.uniqueId;
    });
    this.attachMeshesToOwner(instanceRoot as any, childMeshes);
    this.reparentLooseChildrenToOwner(owner, (mesh) => {
      const meta = (mesh as any)?.metadata ?? {};
      return meta.ownerMeshUniqueId === owner.uniqueId;
    });

    (owner as any).metadata = {
      ...((owner as any).metadata ?? {}),
      type: 'antenna',
      itemId: 'antenna',
      placedOn,
    };

    this.registerAntennaLabelForOwner(owner);

    let minY = Infinity;
    let maxY = -Infinity;

    for (const cm of childMeshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
      maxY = Math.max(maxY, bb.maximumWorld.y);
    }

    const height = Math.max(0.001, maxY - minY);
    const s = this.DEFAULT_ANTENNA_HEIGHT_M / height;
    owner.scaling = new Vector3(s, s, s);

    minY = Infinity;
    for (const cm of childMeshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
    }
    owner.position.y += ((point.y ?? owner.position.y) - minY);

    // ===== Store Integration =====
    console.log('[BS_POLLUTION][STORE_WRITE_BS][beforeAdd]', {
      ownerName: owner?.name,
      ownerUniqueId: owner?.uniqueId,
      rawScenePosition: {
        x: owner?.position?.x,
        y: owner?.position?.y,
        z: owner?.position?.z,
      },
      fieldSettingsState: {
        width: this.fieldSettingsState?.width,
        length: this.fieldSettingsState?.length,
        height: this.fieldSettingsState?.height,
      },
    });
    
    const scenePos = {
      x: owner.position.x,
      y: owner.position.y,
      z: owner.position.z,
    };

    console.log('[BS_POLLUTION][STORE_WRITE_BS][beforeAdd]', {
      label: 'AntennaPlacement', // 第二處可改成 'StandardAntennaPlacement'
      ownerName: owner?.name,
      ownerUniqueId: owner?.uniqueId,
      rawScenePosition: scenePos,
      fieldSettingsState: {
        width: this.fieldSettingsState?.width,
        length: this.fieldSettingsState?.length,
        height: this.fieldSettingsState?.height,
      },
    });

    const mathPos = this.toMathPositionFromSceneXYZ(scenePos.x, scenePos.y, scenePos.z);
    const floorBB = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
    const floorMin = floorBB?.minimumWorld ?? null;

    // BS store always uses floor-local coords (row.x/row.y = world - floorMin).
    // Keep mathPos as fallback for legacy format.
    const bsRowX = floorMin ? owner.position.x - floorMin.x : mathPos.x;
    const bsRowY = floorMin ? owner.position.z - floorMin.z : mathPos.y;
    const bsRowZ = owner.position.y;
    const antennaForBs = this.getClonedDefaultAntennaForPlacement();
    const defaults = getExistingBsFieldDefaults(antennaForBs);
    const existingBsRow = this.fieldDomainStore.addExistingBs({
      x: bsRowX,
      y: bsRowY,
      z: bsRowZ,
      rxGain: 0,
      ownerMeshId: owner.uniqueId,
      antenna: antennaForBs,
      ...defaults,
    });

    console.log('[BS_POLLUTION][STORE_WRITE_BS][afterAdd]', {
      label: 'AntennaPlacement', // 第二處可改成 'StandardAntennaPlacement'
      row: {
        id: existingBsRow?.id,
        x: existingBsRow?.x,
        y: existingBsRow?.y,
        z: existingBsRow?.z,
      },
    });

    console.log('[BS_POLLUTION][snapshotAfterAdd]', {
      existingBsCount: this.fieldDomainStore.snapshot?.existingBs?.length ?? 0,
      rows: (this.fieldDomainStore.snapshot?.existingBs ?? []).map((r: any) => ({
        id: r?.id,
        x: r?.x,
        y: r?.y,
        z: r?.z,
        ownerMeshId: r?.ownerMeshId,
      })),
    });

    // [Step2A][ExistingBsRegistry] Register scene object for row tracking
    this.attachFieldRowMetadata(owner, existingBsRow.id);
    if (childMeshes.length > 0) {
      for (const m of childMeshes) {
        this.attachFieldRowMetadata(m, existingBsRow.id);
      }
    }
    console.log('[FieldStore][ExistingBs][Antenna] added row', existingBsRow);
    this.registerSceneObjectForFieldRow(
      existingBsRow.id,
      'existingBs',
      owner,
      childMeshes[0] ?? null,
      'antenna',
      'antenna'
    );
    this.finalizeOwnerHierarchy(
      owner,
      existingBsRow.id,
      'existingBs',
      'antenna',
      'spawnAntennaAt'
    );
    this.debugOwnerTransform(owner, 'spawnAntennaAt:final');

    console.log('[Patch2][BSPlacement] position:', { x: scenePos.x, y: scenePos.y, z: scenePos.z }, 'mathPosition:', mathPos, 'antenna:', antennaForBs ? { id: antennaForBs.antennaID, name: antennaForBs.antennaName } : null);
    this.debugFieldStore('ExistingBs-Antenna');
  }

  private spawnStandardAntennaProceduralAt(point: Vector3, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnStandardAntennaProceduralAt')) return;
    if (!this.scene) return;

    const owner = MeshBuilder.CreateBox('antenna_std_owner', { width: 0.25, height: 0.25, depth: 0.25 }, this.scene);
    owner.isVisible = false;
    owner.isPickable = true;
    owner.position.copyFrom(point);
    const yaw = this.DEFAULT_ANTENNA_ROT?.y ?? 0;
    const getStdAntennaChildRotations = () =>
      ((owner as any)?.getChildMeshes?.() ?? []).map((m: any) => ({
        name: m?.name ?? null,
        uid: m?.uniqueId ?? null,
        rotation: m?.rotation
          ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z }
          : null,
      }));
    console.log('[AntennaRotation][BeforeApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationBefore: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsBefore: [],
    });
    owner.rotation = new Vector3(0, yaw, 0);
    console.log('[AntennaRotation][AfterApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationAfter: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsAfter: [],
    });

    owner.metadata = owner.metadata ?? {};
    owner.metadata.type = 'antenna';
    owner.metadata.itemId = 'antenna_1';
    this.registerAntennaLabelForOwner(owner);

    const root = new TransformNode('antenna_std_root', this.scene);
    root.parent = owner;

    this.buildOutdoorStandardAntennaModel(root, owner.uniqueId);
    const meshes = root.getChildMeshes(false);
    const poleMeshes = meshes.filter((m) => (m as any)?.metadata?.role === 'pole');
    const topMeshes = meshes.filter((m) => (m as any)?.metadata?.role !== 'pole');
    console.log('[ALIGN][roles]', {
      total: meshes.length,
      poleCount: poleMeshes.length,
      topCount: topMeshes.length,
    });

    let poleTopY = -Infinity;
    for (const m of poleMeshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      poleTopY = Math.max(poleTopY, b.maximumWorld.y);
    }

    let topMinY = Infinity;
    for (const m of topMeshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      topMinY = Math.min(topMinY, b.minimumWorld.y);
    }

    if (Number.isFinite(poleTopY) && Number.isFinite(topMinY)) {
      const deltaY = poleTopY - topMinY;
      const topNode = root
        .getChildTransformNodes(false)
        .find((n) => n.name === 'antenna_std_top');
      if (topNode) {
        topNode.position.y += deltaY;
      } else {
        // Fallback: shift all non-pole meshes if top transform cannot be found.
        for (const m of topMeshes) {
          m.position.y += deltaY;
        }
      }
      let alignedTopMinY = Infinity;
      for (const m of topMeshes) {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        alignedTopMinY = Math.min(alignedTopMinY, b.minimumWorld.y);
      }
      console.log('[ALIGN]', {
        poleTopY,
        topMinYBefore: topMinY,
        deltaY,
        topNodeFound: !!topNode,
        topNodeY: topNode ? topNode.position.y : null,
        topMinYAfter: alignedTopMinY,
        alignError: Number.isFinite(alignedTopMinY) ? poleTopY - alignedTopMinY : null,
      });
    } else {
      console.warn('[ALIGN] invalid bounds', {
        poleTopY,
        topMinY,
        poleCount: poleMeshes.length,
        topCount: topMeshes.length,
      });
    }

    console.log('[AntennaRotation][BeforeApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationBefore: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsBefore: getStdAntennaChildRotations(),
    });
    owner.rotation.x = 0;
    owner.rotation.z = 0;
    console.log('[AntennaRotation][AfterApply]', {
      defaultAntennaRot: this.DEFAULT_ANTENNA_ROT,
      ownerRotationAfter: owner.rotation
        ? { x: owner.rotation.x, y: owner.rotation.y, z: owner.rotation.z }
        : null,
      childRotationsAfter: getStdAntennaChildRotations(),
    });

    const childMeshes = root.getChildMeshes ? root.getChildMeshes() : [];
    for (const m of childMeshes) {
      m.isPickable = true;
      m.metadata = {
        ...(m.metadata ?? {}),
        type: 'antenna',
        itemId: 'antenna_1',
        placedOn,
        ownerMeshUniqueId: owner.uniqueId,
      };
    }
    this.attachMeshesToOwner(root, childMeshes);
    this.reparentLooseChildrenToOwner(owner, (mesh) => {
      const meta = (mesh as any)?.metadata ?? {};
      return meta.ownerMeshUniqueId === owner.uniqueId;
    });

    // Re-align after hierarchy normalization, because parent changes may alter local transforms.
    const poleMeshesAfter = childMeshes.filter((m) => (m as any)?.metadata?.role === 'pole');
    const topMeshesAfter = childMeshes.filter((m) => (m as any)?.metadata?.role !== 'pole');
    let poleTopYAfter = -Infinity;
    for (const m of poleMeshesAfter) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      poleTopYAfter = Math.max(poleTopYAfter, b.maximumWorld.y);
    }
    let topMinYAfterHierarchy = Infinity;
    for (const m of topMeshesAfter) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      topMinYAfterHierarchy = Math.min(topMinYAfterHierarchy, b.minimumWorld.y);
    }
    if (Number.isFinite(poleTopYAfter) && Number.isFinite(topMinYAfterHierarchy)) {
      const deltaYAfterHierarchy = poleTopYAfter - topMinYAfterHierarchy;
      if (Math.abs(deltaYAfterHierarchy) > 1e-6) {
        for (const m of topMeshesAfter) {
          m.position.y += deltaYAfterHierarchy;
        }
      }
      console.log('[ALIGN][postHierarchy]', {
        poleTopY: poleTopYAfter,
        topMinYBefore: topMinYAfterHierarchy,
        deltaY: deltaYAfterHierarchy,
      });
    }

    let minY = Infinity;
    let maxY = -Infinity;
    for (const cm of childMeshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
      maxY = Math.max(maxY, bb.maximumWorld.y);
    }

    const scale = this.STANDARD_ANTENNA_VISUAL_SCALE;
    owner.scaling = new Vector3(scale, scale, scale);

    minY = Infinity;
    for (const cm of childMeshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
    }
    owner.position.y += ((point.y ?? owner.position.y) - minY);

    // ===== Store Integration =====
    console.log('[BS_POLLUTION][STORE_WRITE_BS][beforeAdd]', {
      ownerName: owner?.name,
      ownerUniqueId: owner?.uniqueId,
      rawScenePosition: {
        x: owner?.position?.x,
        y: owner?.position?.y,
        z: owner?.position?.z,
      },
      fieldSettingsState: {
        width: this.fieldSettingsState?.width,
        length: this.fieldSettingsState?.length,
        height: this.fieldSettingsState?.height,
      },
    });

    const scenePos = {
      x: owner.position.x,
      y: owner.position.y,
      z: owner.position.z,
    };

    console.log('[BS_POLLUTION][STORE_WRITE_BS][beforeAdd]', {
      label: 'StandardAntennaPlacement',
      ownerName: owner?.name,
      ownerUniqueId: owner?.uniqueId,
      rawScenePosition: scenePos,
      fieldSettingsState: {
        width: this.fieldSettingsState?.width,
        length: this.fieldSettingsState?.length,
        height: this.fieldSettingsState?.height,
      },
    });

    const mathPos = this.toMathPositionFromSceneXYZ(
      scenePos.x,
      scenePos.y,
      scenePos.z
    );

    console.log('[BS_POLLUTION][STORE_WRITE_BS][mathPosBeforeAdd]', {
      label: 'StandardAntennaPlacement',
      scenePos,
      mathPos,
    });

    const floorBB = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
    const floorMin = floorBB?.minimumWorld ?? null;

    // BS store always uses floor-local coords (row.x/row.y = world - floorMin).
    // Keep mathPos as fallback for legacy format.
    const bsRowX = floorMin ? owner.position.x - floorMin.x : mathPos.x;
    const bsRowY = floorMin ? owner.position.z - floorMin.z : mathPos.y;
    const bsRowZ = owner.position.y;

    const antennaForBs = this.getClonedDefaultAntennaForPlacement();
    const defaults = getExistingBsFieldDefaults(antennaForBs);

    const existingBsRow = this.fieldDomainStore.addExistingBs({
      x: bsRowX,
      y: bsRowY,
      z: bsRowZ,
      rxGain: 0,
      ownerMeshId: owner.uniqueId,
      antenna: antennaForBs,
      ...defaults,
    });

    console.log('[BS_POLLUTION][STORE_WRITE_BS][afterAdd]', {
      label: 'StandardAntennaPlacement',
      row: {
        id: existingBsRow?.id,
        x: existingBsRow?.x,
        y: existingBsRow?.y,
        z: existingBsRow?.z,
      },
    });


    console.log('[BS_POLLUTION][snapshotAfterAdd]', {
      existingBsCount: this.fieldDomainStore.snapshot?.existingBs?.length ?? 0,
      rows: (this.fieldDomainStore.snapshot?.existingBs ?? []).map((r: any) => ({
        id: r?.id,
        x: r?.x,
        y: r?.y,
        z: r?.z,
        ownerMeshId: r?.ownerMeshId,
      })),
    });
    
    // [Step2A][ExistingBsRegistry] Attach metadata and register
    this.attachFieldRowMetadata(owner, existingBsRow.id);
    if (childMeshes.length > 0) {
      for (const m of childMeshes) {
        this.attachFieldRowMetadata(m, existingBsRow.id);
      }
    }
    console.log('[FieldStore][ExistingBs][StandardAntenna] added row', existingBsRow);
    this.registerSceneObjectForFieldRow(
      existingBsRow.id,
      'existingBs',
      owner,
      root,
      'antenna',
      'antenna_1'
    );
    this.finalizeOwnerHierarchy(
      owner,
      existingBsRow.id,
      'existingBs',
      'antenna',
      'spawnStandardAntennaProceduralAt'
    );
    this.debugOwnerTransform(owner, 'spawnStandardAntennaProceduralAt:final');

    console.log('[Patch2][BSPlacement] position:', { x: scenePos.x, y: scenePos.y, z: scenePos.z }, 'mathPosition:', mathPos, 'antenna:', antennaForBs ? { id: antennaForBs.antennaID, name: antennaForBs.antennaName } : null);
    this.debugFieldStore('ExistingBs-StandardAntenna');

    console.log('[Phase4][Antenna][Procedural] spawned standard antenna', { placedOn });
  }

  private spawnBaseStationPlaceableMarkerAt(point: Vector3, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnBaseStationPlaceableMarkerAt')) return;
    this.spawnPlaceablePinMarkerAt('antenna_placeable', new Color3(1, 0, 0), point, placedOn);
  }

  private spawnRisPlaceableMarkerAt(point: Vector3, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnRisPlaceableMarkerAt')) return;
    // Blue
    this.spawnPlaceablePinMarkerAt('ris_placeable', new Color3(0.12, 0.53, 0.95), point, placedOn);
  }

  private buildOutdoorStandardAntennaModel(parent: TransformNode, ownerUniqueId: number): void {
    if (!this.guardEditWrite('buildOutdoorStandardAntennaModel')) return;
    if (!this.scene) return;

    const poleMat = new StandardMaterial('antenna_std_pole_mat', this.scene);
    poleMat.diffuseColor = new Color3(0.25, 0.25, 0.25);

    const frameMat = new StandardMaterial('antenna_std_frame_mat', this.scene);
    frameMat.diffuseColor = new Color3(0.2, 0.2, 0.2);

    const panelMat = new StandardMaterial('antenna_std_panel_mat', this.scene);
    panelMat.diffuseColor = new Color3(0.95, 0.95, 0.95);

    const poleHeight0 = 6.5;
    const poleHeight = poleHeight0 * (2 / 3);
    const pole = MeshBuilder.CreateCylinder('antenna_std_pole', { height: poleHeight, diameter: 0.12 }, this.scene);
    pole.parent = parent;
    pole.position = new Vector3(0, poleHeight / 2, 0);
    pole.material = poleMat;
    pole.isPickable = true;
    pole.metadata = { ...(pole.metadata ?? {}), ownerMeshUniqueId: ownerUniqueId, role: 'pole' };

    const top = new TransformNode('antenna_std_top', this.scene);
    top.parent = parent;
    top.position.set(0, poleHeight, 0);

    const R = 0.38;
    const y0 = -0.55;
    const y1 = 0.55;
    const tubeRadius = 0.018;
    const sqrt3 = Math.sqrt(3);

    const V0 = new Vector3(R, y0, 0);
    const V1 = new Vector3(-R / 2, y0, (R * sqrt3) / 2);
    const V2 = new Vector3(-R / 2, y0, -(R * sqrt3) / 2);

    const T0 = V0.add(new Vector3(0, y1 - y0, 0));
    const T1 = V1.add(new Vector3(0, y1 - y0, 0));
    const T2 = V2.add(new Vector3(0, y1 - y0, 0));

    const createTube = (name: string, path: Vector3[]) => {
      const tube = MeshBuilder.CreateTube(name, { path, radius: tubeRadius, updatable: false }, this.scene);
      tube.parent = top;
      tube.material = frameMat;
      tube.isPickable = true;
      tube.metadata = { ...(tube.metadata ?? {}), ownerMeshUniqueId: ownerUniqueId, role: 'frame' };
      return tube;
    };

    createTube('antenna_std_frame_v0v1', [V0, V1]);
    createTube('antenna_std_frame_v1v2', [V1, V2]);
    createTube('antenna_std_frame_v2v0', [V2, V0]);

    createTube('antenna_std_frame_t0t1', [T0, T1]);
    createTube('antenna_std_frame_t1t2', [T1, T2]);
    createTube('antenna_std_frame_t2t0', [T2, T0]);

    createTube('antenna_std_frame_v0t0', [V0, T0]);
    createTube('antenna_std_frame_v1t1', [V1, T1]);
    createTube('antenna_std_frame_v2t2', [V2, T2]);

    const panelW = 0.22;
    const panelH = 1.05;
    const panelD = 0.06;
    const yPanel = 0;
    const offset = 0.20;
    const offsetVertex = 0.25;
    const edgeMargin = 0.18;
    const edgeGap = 0.18;
    const centerXZ = new Vector3(0, 0, 0);

    const computeEdgeOutwardNormal = (A: Vector3, B: Vector3, center: Vector3): Vector3 => {
      const e = B.subtract(A);
      e.y = 0;
      if (e.length() < 1e-6) return Vector3.Zero();
      e.normalize();
      let n = Vector3.Cross(Vector3.Up(), e).normalize();
      const M = A.add(B).scale(0.5);
      if (Vector3.Dot(n, M.subtract(center)) < 0) {
        n = n.scale(-1);
      }
      return n.normalize();
    };

    const createPanelAt = (name: string, pos: Vector3, normal: Vector3) => {
      const panel = MeshBuilder.CreateBox(name, { width: panelW, height: panelH, depth: panelD }, this.scene);
      panel.parent = top;
      panel.position = pos;
      panel.material = panelMat;
      panel.isPickable = true;
      panel.metadata = { ...(panel.metadata ?? {}), ownerMeshUniqueId: ownerUniqueId, role: 'panel' };

      panel.lookAt(pos.add(normal));
      panel.rotation.x = 0;
      panel.rotation.z = 0;

      return panel;
    };

    const n01 = computeEdgeOutwardNormal(V0, V1, centerXZ);
    const n12 = computeEdgeOutwardNormal(V1, V2, centerXZ);
    const n20 = computeEdgeOutwardNormal(V2, V0, centerXZ);

    const mid = 0.5;
    const halfSpan = Math.min(0.5 - edgeMargin, 0.5 - edgeGap * 0.5);
    const t1 = mid - halfSpan * 0.55;
    const t2 = mid + halfSpan * 0.55;

    const edgeTs = [t1, t2];

    for (const t of edgeTs) {
      const p01 = Vector3.Lerp(V0, V1, t);
      p01.y = yPanel;
      createPanelAt(`antenna_std_panel_v0v1_${t}`, p01.add(n01.scale(offset)), n01);

      const p12 = Vector3.Lerp(V1, V2, t);
      p12.y = yPanel;
      createPanelAt(`antenna_std_panel_v1v2_${t}`, p12.add(n12.scale(offset)), n12);

      const p20 = Vector3.Lerp(V2, V0, t);
      p20.y = yPanel;
      createPanelAt(`antenna_std_panel_v2v0_${t}`, p20.add(n20.scale(offset)), n20);
    }

    const nb0 = n01.add(n20).normalize();
    const nb1 = n01.add(n12).normalize();

    const pT0 = T0.add(nb0.scale(offsetVertex));
    pT0.y = yPanel;
    createPanelAt('antenna_std_panel_T0', pT0, nb0);

    const pT1 = T1.add(nb1.scale(offsetVertex));
    pT1.y = yPanel;
    createPanelAt('antenna_std_panel_T1', pT1, nb1);

    const topAntennaHeight = 1.2;
    const topAntennaDiameter = 0.02;
    const topY = y1 + 0.25;

    const antenna1 = MeshBuilder.CreateCylinder('antenna_std_top_1', { height: topAntennaHeight, diameter: topAntennaDiameter }, this.scene);
    antenna1.parent = top;
    antenna1.position = T0.add(nb0.scale(0.06));
    antenna1.position.y = topY;
    antenna1.material = frameMat;
    antenna1.isPickable = true;
    antenna1.metadata = { ...(antenna1.metadata ?? {}), ownerMeshUniqueId: ownerUniqueId, role: 'rod' };
    antenna1.metadata = antenna1.metadata ?? {};
    antenna1.metadata.anchorRole = 'antennaTop';

    const antenna2 = MeshBuilder.CreateCylinder('antenna_std_top_2', { height: topAntennaHeight, diameter: topAntennaDiameter }, this.scene);
    antenna2.parent = top;
    antenna2.position = T1.add(nb1.scale(0.06));
    antenna2.position.y = topY;
    antenna2.material = frameMat;
    antenna2.isPickable = true;
    antenna2.metadata = { ...(antenna2.metadata ?? {}), ownerMeshUniqueId: ownerUniqueId, role: 'rod' };

    const DBG_DRAW = (window as any).__hmDbgFrame === true;
    if (DBG_DRAW) {
      const drawLine = (name: string, a: Vector3, b: Vector3) => {
        const line = MeshBuilder.CreateLines(name, { points: [a, b] }, this.scene);
        line.parent = top;
        line.isPickable = false;
      };

      const m01 = V0.add(V1).scale(0.5);
      const m12 = V1.add(V2).scale(0.5);
      const m20 = V2.add(V0).scale(0.5);

      drawLine('antenna_dbg_edge_n01', m01, m01.add(n01.scale(0.3)));
      drawLine('antenna_dbg_edge_n12', m12, m12.add(n12.scale(0.3)));
      drawLine('antenna_dbg_edge_n20', m20, m20.add(n20.scale(0.3)));

      drawLine('antenna_dbg_nb0', T0, T0.add(nb0.scale(0.3)));
      drawLine('antenna_dbg_nb1', T1, T1.add(nb1.scale(0.3)));
    }
  }
  // -------------------- End Phase 4: Antenna spawn helpers --------------------

  // ================== DAS Antenna Spawn Helper ==================
  private spawnDasAntennaAt(point: any, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnDasAntennaAt')) return;
    if (!this.dasAntennaTemplateRoot) {
      console.warn('[Phase4][DasAntenna] 生成中止：模板未載入');
      return;
    }

    // 複製 DAS 模板
    const instanceRoot = this.dasAntennaTemplateRoot.clone('das_antenna_instance_root');
    if (!instanceRoot) {
      console.warn('[Phase4][DasAntenna] 複製失敗');
      return;
    }

    instanceRoot.setEnabled(true);

    // 建立隱形代理 Mesh（用於 Gizmo 和變換控制）
    const owner = MeshBuilder.CreateBox('das_antenna_owner', { size: 0.01 }, this.scene);
    owner.isVisible = false;
    owner.isPickable = false; // 使用者選擇子 mesh，透過 metadata.ownerMeshUniqueId 解析回 owner
    owner.position = point.clone ? point.clone() : point;
    owner.rotation = new Vector3(0, 0, 0); // DAS 天線通常直立，旋轉為零

    // 將 GLB 實例掛在 owner 下；重置本地位置
    (instanceRoot as any).parent = owner;
    instanceRoot.position = Vector3.Zero();

    // 啟用子 meshes 並設定可拾取
    const childMeshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes() : [];
    for (const m of childMeshes) {
      m.setEnabled(true);
      m.isPickable = true;
      m.metadata = {
        ...(m.metadata ?? {}),
        type: 'antenna',           // ✅ 類型標記為 antenna（供第二階段運算識別）
        itemId: 'das_antenna',     // ✅ 明確標記為 DAS 類型
        placedOn,
        ownerMeshUniqueId: owner.uniqueId,
      };
    }

    // Owner 也寫入 metadata（方便後續直接選擇 owner）
    (owner as any).metadata = {
      ...((owner as any).metadata ?? {}),
      type: 'antenna',
      itemId: 'das_antenna',
      placedOn,
    };

    // 預設尺度：根據目標高度縮放 + 地面對齐
    const meshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes() : [];
    let minY = Infinity;
    let maxY = -Infinity;

    // 計算邊界框以確定高度
    for (const cm of meshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
      maxY = Math.max(maxY, bb.maximumWorld.y);
    }

    const height = Math.max(0.001, maxY - minY);
    const dasDefaultHeightM = 2; // DAS 天線通常比標準天線更矮
    const s = dasDefaultHeightM / height;
    // ✅ 等比縮放：確保 X、Y、Z 軸使用同一縮放係數
    owner.scaling = new Vector3(s, s, s);

    // 重新計算後對齐底部到表面
    minY = Infinity;
    for (const cm of meshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
    }
    owner.position.y += ((point.y ?? owner.position.y) - minY);

    console.log('[Phase4][DasAntenna] 已生成', {
      itemId: 'das_antenna',
      placedOn,
      position: {
        x: owner.position.x,
        y: owner.position.y,
        z: owner.position.z,
      },
      scale: s,
    });
    this.finalizeOwnerHierarchy(
      owner,
      '',
      'existingBs',
      'antenna',
      'spawnDasAntennaAt'
    );
  }
  // ================== End DAS Antenna Spawn ==================

  // -------------------- Phase 4: Terminal(Phone) spawn helpers --------------------
  private async ensureTerminalTemplateLoaded(): Promise<void> {
    if (!this.guardEditWrite('ensureTerminalTemplateLoaded')) return;
    if (this.terminalTemplateRoot) return;
    if (this.isLoadingTerminalTemplate) return;

    this.isLoadingTerminalTemplate = true;

    try {
      const result = await SceneLoader.ImportMeshAsync(
        '',
        'assets/models/',
        'phone.glb',
        this.scene
      );

      const root = new TransformNode('terminal_template_root', this.scene);
      for (const mesh of result.meshes) {
        if (!mesh) continue;
        if (mesh === this.scene.meshes[0]) continue;

        mesh.setEnabled(false);
        mesh.isPickable = false;
        mesh.parent = root;
      }

      this.terminalTemplateRoot = root;

      console.log('[Phase4][Terminal] template loaded', {
        meshes: result.meshes.length,
      });
    } catch (e) {
      console.error('[Phase4][Terminal] template load failed', e);
      this.terminalTemplateRoot = null;
    } finally {
      this.isLoadingTerminalTemplate = false;
    }
  }

  /**
   * Load jungle_tree.glb once and keep a disabled template root for cloning.
   * Path: assets/models/jungle_tree.glb
   */
  private ensureMapleTreeTemplateLoaded(): Promise<void> {
    if (!this.guardEditWrite('ensureMapleTreeTemplateLoaded')) return Promise.resolve();
    // Already loaded
    if (this.mapleTreeTemplateRoot) return Promise.resolve();

    // Loading in progress
    if (this.mapleTreeTemplatePromise) return this.mapleTreeTemplatePromise;

    this.mapleTreeTemplatePromise = SceneLoader.ImportMeshAsync(
      '',
      'assets/models/',
      'jungle_tree.glb',
      this.scene
    )
      .then((res) => {
        const root = new TransformNode('maple_tree_template_root', this.scene);

        // Attach all loaded meshes under root and disable them (template)
        for (const m of res.meshes) {
          // ImportMeshAsync 常會回傳一個 __root__ 的 TransformNode 或 mesh，統一掛到 root 下
          (m as any).parent = root;

          // Template should not be pickable / visible in scene
          if ((m as any).isEnabled) (m as any).setEnabled(false);
          if ((m as any).isPickable !== undefined) (m as any).isPickable = false;
        }

        // Keep root disabled as template
        root.setEnabled(false);

        this.mapleTreeTemplateRoot = root;

        console.log('[Landscape] maple_tree template loaded', {
          meshes: res.meshes?.length ?? 0,
        });
      })
      .finally(() => {
        // allow retries only if failed and root still null
        if (!this.mapleTreeTemplateRoot) {
          this.mapleTreeTemplatePromise = null;
        }
      });

    return this.mapleTreeTemplatePromise;
  }

  private spawnTerminalAt(point: any, placedOn: 'ground' | 'building'): void {
    if (!this.guardEditWrite('spawnTerminalAt')) return;
    if (!this.terminalTemplateRoot) {
      console.warn('[Phase4][Terminal] spawn aborted: template not loaded');
      return;
    }

    const instanceRoot = this.terminalTemplateRoot.clone('terminal_instance_root');
    if (!instanceRoot) {
      console.warn('[Phase4][Terminal] clone failed');
      return;
    }

    instanceRoot.setEnabled(true);
    // Phase 2.1.1: create an invisible owner proxy mesh so gizmo moves the whole GLB together
    const owner = MeshBuilder.CreateBox('terminal_owner', { size: 0.01 }, this.scene);
    owner.isVisible = false;
    owner.isPickable = false; // user picks child meshes; we resolve back to owner via metadata.ownerMeshUniqueId
    owner.position = point.clone ? point.clone() : point;
    owner.rotation = this.DEFAULT_TERMINAL_ROT.clone();

    // Parent the GLB instance under owner; reset local position
    (instanceRoot as any).parent = owner;
    instanceRoot.position = Vector3.Zero();

    const childMeshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes() : [];
    for (const m of childMeshes) {
      m.setEnabled(true);
      m.isPickable = true;
      m.metadata = {
        ...(m.metadata ?? {}),
        type: 'terminal',
        placedOn,
        ownerMeshUniqueId: owner.uniqueId,
      };
    }

    (owner as any).metadata = {
      ...((owner as any).metadata ?? {}),
      type: 'terminal',
      placedOn,
    };

    // Phase 5 (hardcode first): default scale by target height + ground alignment
    const meshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes() : [];
    let minY = Infinity;
    let maxY = -Infinity;

    for (const cm of meshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
      maxY = Math.max(maxY, bb.maximumWorld.y);
    }

    const height = Math.max(0.001, maxY - minY);
    const s = this.DEFAULT_TERMINAL_HEIGHT_M / height;
    owner.scaling = new Vector3(s, s, s);

    // Recompute after scaling to align base to surface point.y
    minY = Infinity;
    for (const cm of meshes) {
      cm.computeWorldMatrix(true);
      const bb = cm.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
    }
    owner.position.y += ((point.y ?? owner.position.y) - minY);

    // ===== Store Integration =====
    const scenePos = {
      x: owner.position.x,
      y: owner.position.y,
      z: owner.position.z,
    };
    const local = this.sceneWorldToFloorLocalRow(scenePos.x, scenePos.z);
    const ueRow = this.fieldDomainStore.addUe({
      x: local.x,
      y: local.y,
      z: scenePos.y,
      type: 'terminal',
      rxGain: 0,
      ownerMeshId: owner.uniqueId,
    });
    console.log('[COORD][Scene->Row]', {
      type: 'ris-or-ue',
      rowId: ueRow.id,
      world: { x: scenePos.x, z: scenePos.z },
      rowXY: { x: local.x, y: local.y },
      path: local.path,
    });

    console.log('[UE_CREATE][ROW]', {
      id: ueRow.id,
      x: ueRow.x,
      y: ueRow.y,
      z: ueRow.z,
      rxGain: ueRow.rxGain,
      ownerMeshId: ueRow.ownerMeshId,
    });
    console.log('[COORD][Spawn->Row]', {
      type: 'ue',
      scenePosition: scenePos,
      mathPosition: {
        x: ueRow.x,
        y: ueRow.y,
        z: ueRow.z,
      },
    });
    // [Step2A][UeRegistry] Attach metadata and register
    this.attachFieldRowMetadata(owner, ueRow.id);
    const ueChildMeshes = instanceRoot.getChildMeshes ? instanceRoot.getChildMeshes(false) : [];
    for (const m of ueChildMeshes) {
      this.attachFieldRowMetadata(m, ueRow.id);
    }
    console.log('[FieldStore][UE][Terminal] added row', ueRow);
    this.registerSceneObjectForFieldRow(
      ueRow.id,
      'ue',
      owner,
      ueChildMeshes[0] ?? null,
      'terminal',
      'terminal'
    );
    this.finalizeOwnerHierarchy(
      owner,
      ueRow.id,
      'ue',
      'terminal',
      'spawnTerminalAt'
    );
    this.debugFieldStore('UE-Terminal');

    console.log('[Phase4][Terminal] spawned', {
      placedOn,
      x: instanceRoot.position.x,
      y: instanceRoot.position.y,
      z: instanceRoot.position.z,
    });
  }
  // -------------------- End Phase 4: Terminal(Phone) spawn helpers --------------------

  /* ================== Field Domain Store Helpers ================== */

  private toFieldXY(position: Vector3 | { x: number; y: number; z?: number }) {
    return {
      x: Number(position?.x ?? 0),
      y: Number((position as any)?.z ?? 0),
    };
  }

  private toFieldZ(position: Vector3 | { x: number; y: number; z?: number }): number {
    return Number(position?.y ?? 0);
  }

  private getFieldDimensionsForCoordinateTransform(): { width: number; height: number } {
    // Use one consistent field-plane dimension source for coordinate conversion only.
    // - util.sceneToMath shifts scene.x by `width/2`
    // - util.sceneToMath shifts scene.z by `height/2`
    return {
      width: Number(this.fieldSettingsState.length),
      height: Number(this.fieldSettingsState.width),
    };
  }

  private toMathPositionFromSceneXYZ(
    sceneX: number,
    sceneY: number,
    sceneZ: number
  ) {
    const { width, height } = this.getFieldDimensionsForCoordinateTransform();
    return sceneToMath({ x: sceneX, y: sceneY, z: sceneZ }, width, height);
  }

  private toScenePositionFromMath(mathPos: { x: number; y: number; z: number }) {
    const { width, height } = this.getFieldDimensionsForCoordinateTransform();
    return mathToScene(mathPos, width, height);
  }

  private toSceneVector3FromMath(mathPos: { x: number; y: number; z: number }): Vector3 {
    const scenePos = this.toScenePositionFromMath(mathPos);
    return new Vector3(scenePos.x, scenePos.y, scenePos.z);
  }

  private getFloorBoundsForFieldRows(): {
    floorMin: Vector3;
    floorMax: Vector3;
    floorW: number;
    floorD: number;
  } | null {
    const floorBB = this.floorMesh?.getBoundingInfo()?.boundingBox ?? null;
    if (!floorBB) return null;

    const floorMin = floorBB.minimumWorld;
    const floorMax = floorBB.maximumWorld;

    return {
      floorMin,
      floorMax,
      floorW: floorMax.x - floorMin.x,
      floorD: floorMax.z - floorMin.z,
    };
  }

  private sceneWorldToFloorLocalRow(
    worldX: number,
    worldZ: number
  ): { x: number; y: number; path: 'floor-local' | 'legacy-fallback' } {
    const bounds = this.getFloorBoundsForFieldRows();

    if (bounds) {
      return {
        x: worldX - bounds.floorMin.x,
        y: worldZ - bounds.floorMin.z,
        path: 'floor-local',
      };
    }

    const fallback = this.toMathPositionFromSceneXYZ(worldX, 0, worldZ);
    return {
      x: fallback.x,
      y: fallback.y,
      path: 'legacy-fallback',
    };
  }

  private floorRowToSceneWorld(
    rowX: number,
    rowY: number,
    rowZ = 0
  ): {
    x: number;
    y: number;
    z: number;
    path: 'floor-local' | 'legacy-mathToScene';
    inBounds: boolean;
  } {
    const bounds = this.getFloorBoundsForFieldRows();
    const tol = 50;

    if (bounds) {
      const isFloorLocal =
        rowX >= -tol &&
        rowX <= bounds.floorW + tol &&
        rowY >= -tol &&
        rowY <= bounds.floorD + tol;

      if (isFloorLocal) {
        const x = bounds.floorMin.x + rowX;
        const z = bounds.floorMin.z + rowY;

        return {
          x,
          y: rowZ,
          z,
          path: 'floor-local',
          inBounds:
            x >= bounds.floorMin.x - tol &&
            x <= bounds.floorMax.x + tol &&
            z >= bounds.floorMin.z - tol &&
            z <= bounds.floorMax.z + tol,
        };
      }
    }

    const legacy = this.toScenePositionFromMath({
      x: rowX,
      y: rowY,
      z: rowZ,
    });

    return {
      x: legacy.x,
      y: legacy.y,
      z: legacy.z,
      path: 'legacy-mathToScene',
      inBounds: false,
    };
  }

  // ========== [Step2A][PositionHelper] Position conversion helpers ==========

  /**
   * Convert field row position (x, y, z) to scene world position (Vector3)
   * Field: x/y in horizontal plane, z is height (Y in world)
   * Scene: x/z in horizontal plane, y is height (Y in world)
   */
  private rowPositionToSceneVector(rowX: number, rowY: number, rowZ: number): Vector3 {
    return new Vector3(rowX, rowZ, rowY);
  }

  /**
   * Convert scene world position (Vector3) to field row position (x, y, z)
   * Inverse of rowPositionToSceneVector
   */
  private sceneVectorToRowPosition(scenePos: Vector3 | { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    return {
      x: this.roundFieldNum(scenePos.x),
      y: this.roundFieldNum(scenePos.z),
      z: this.roundFieldNum(scenePos.y),
    };
  }

  private degFromRad(rad: number | undefined | null): number {
    return Number((((rad ?? 0) * 180) / Math.PI).toFixed(2));
  }

  private buildRectangleVertices(cx: number, cy: number, width: number, length: number, angleDeg: number): [number, number][] {
    const hw = width / 2;
    const hl = length / 2;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const localCorners: [number, number][] = [
      [-hw, -hl],
      [hw, -hl],
      [hw, hl],
      [-hw, hl],
    ];
    return localCorners.map(([lx, ly]) => [
      Number((cx + lx * cos - ly * sin).toFixed(4)),
      Number((cy + lx * sin + ly * cos).toFixed(4)),
    ]);
  }

  private debugFieldStore(tag: string): void {
    const snapshot = this.fieldDomainStore.snapshot;
    console.log(`[FieldStore][${tag}] snapshot`, snapshot);
    console.log(`[FieldStore][${tag}] counts`, this.fieldDomainStore.getCounts(snapshot));
  }

  public debugExistingBsStore(): void {
    const snapshot = this.fieldDomainStore.snapshot;
    console.log('[DEBUG][existingBs]', snapshot?.existingBs ?? []);
  }

  public debugExistingBsRich(): void {
    const rows = this.fieldDomainStore.snapshot?.existingBs ?? [];

    console.log('[DEBUG][ExistingBs][Rich]', rows.map((r: any) => ({
      id: r.id,
      pos: [r.x, r.y, r.z],
      antennaId: r.antenna?.antennaID,

      freq: r.antennaRuntime?.selectedFrequency,
      port: r.antennaRuntime?.selectedPortId,
      gain: r.antennaRuntime?.selectedPortGain,

      txPower: r.radioConfig?.txPower,
      band: r.radioConfig?.band,

      install: r.placementConfig?.installation,
      angle: r.placementConfig?.angle,

      color: r.displayConfig?.color,
    })));
  }

  private getWorldBoundsInfo(target: AbstractMesh | null | undefined) {
    if (!target) {
      return {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        minZ: 0,
        maxZ: 0,
        sizeX: 0,
        sizeY: 0,
        sizeZ: 0,
        centerX: 0,
        centerY: 0,
        centerZ: 0,
      };
    }

    const meshes: AbstractMesh[] =
      typeof (target as any).getChildMeshes === 'function'
        ? [target, ...(target as any).getChildMeshes(false)]
        : [target];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const mesh of meshes) {
      if (!mesh || typeof mesh.getBoundingInfo !== 'function') continue;

      const info = mesh.getBoundingInfo();
      const bb = info?.boundingBox;
      if (!bb) continue;

      const min = bb.minimumWorld;
      const max = bb.maximumWorld;

      minX = Math.min(minX, min.x);
      minY = Math.min(minY, min.y);
      minZ = Math.min(minZ, min.z);
      maxX = Math.max(maxX, max.x);
      maxY = Math.max(maxY, max.y);
      maxZ = Math.max(maxZ, max.z);
    }

    if (!isFinite(minX) || !isFinite(maxX)) {
      const pos = target.position ?? Vector3.Zero();
      return {
        minX: pos.x,
        maxX: pos.x,
        minY: pos.y,
        maxY: pos.y,
        minZ: pos.z,
        maxZ: pos.z,
        sizeX: 0,
        sizeY: 0,
        sizeZ: 0,
        centerX: pos.x,
        centerY: pos.y,
        centerZ: pos.z,
      };
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      sizeX: Number((maxX - minX).toFixed(4)),
      sizeY: Number((maxY - minY).toFixed(4)),
      sizeZ: Number((maxZ - minZ).toFixed(4)),
      centerX: Number(((minX + maxX) / 2).toFixed(4)),
      centerY: Number(((minY + maxY) / 2).toFixed(4)),
      centerZ: Number(((minZ + maxZ) / 2).toFixed(4)),
    };
  }

  private roundFieldNum(value: number, digits = 4): number {
    return Number((value ?? 0).toFixed(digits));
  }

  private clearBuildingReprojectDebug(): void {
    console.log('[Building][ReprojectDebug][Clear]', {
      count: this.buildingReprojectDebugMeshes.length,
    });
    for (const m of this.buildingReprojectDebugMeshes) {
      try { m.dispose(); } catch { /* ignore if already disposed */ }
    }
    this.buildingReprojectDebugMeshes = [];
  }

  private renderBuildingReprojectDebug(args: {
    bboxCenterWorldX: number;
    bboxCenterWorldZ: number;
    floorMinWorldX: number;
    floorMinWorldZ: number;
    finalX: number;
    finalZ: number;
    worldY: number;
    meshName: string;
    osmId: string;
  }): void {
    console.log('[Building][ReprojectDebug][Enter]', {
      enabled: (window as any).__dbgBuildingReproject,
      limit: (window as any).__dbgBuildingReprojectLimit,
    });
    if (!this.scene) return;
    const { bboxCenterWorldX, bboxCenterWorldZ, floorMinWorldX, floorMinWorldZ,
            finalX, finalZ, worldY, meshName, osmId } = args;

    const reprojectedSceneX = floorMinWorldX + finalX;
    const reprojectedSceneZ = floorMinWorldZ + finalZ;
    const markerY = 20;

    // Green sphere: actual bbox centerWorld position
    const greenSphere = MeshBuilder.CreateSphere(
      `__dbg_bldg_green_${meshName}`, { diameter: 4.0 }, this.scene
    );
    greenSphere.position = new Vector3(bboxCenterWorldX, markerY, bboxCenterWorldZ);
    const greenMat = new StandardMaterial(`__dbg_bldg_gmat_${meshName}`, this.scene);
    greenMat.emissiveColor = new Color3(0, 1, 0);
    greenMat.disableLighting = true;
    greenSphere.material = greenMat;
    this.buildingReprojectDebugMeshes.push(greenSphere);

    // Red sphere: payload x/y reprojected back to scene space
    const redSphere = MeshBuilder.CreateSphere(
      `__dbg_bldg_red_${meshName}`, { diameter: 4.0 }, this.scene
    );
    redSphere.position = new Vector3(reprojectedSceneX, markerY + 0.5, reprojectedSceneZ);
    const redMat = new StandardMaterial(`__dbg_bldg_rmat_${meshName}`, this.scene);
    redMat.emissiveColor = new Color3(1, 0, 0);
    redMat.disableLighting = true;
    redSphere.material = redMat;
    this.buildingReprojectDebugMeshes.push(redSphere);

    console.log('[Building][ReprojectDebug][Created]', {
      meshName,
      total: this.buildingReprojectDebugMeshes.length,
    });

    console.log('[Building][ReprojectCheck]', {
      meshName,
      osmId,
      bboxCenterWorld: { x: bboxCenterWorldX, z: bboxCenterWorldZ },
      payloadLocal: { x: finalX, y: finalZ },
      reprojectedScene: { x: reprojectedSceneX, z: reprojectedSceneZ },
      delta: {
        dx: reprojectedSceneX - bboxCenterWorldX,
        dz: reprojectedSceneZ - bboxCenterWorldZ,
      },
    });
  }

  private getDefaultObstacleMaterial(kind: 'primitive' | 'landscape'): string {
    return kind === 'landscape' ? 'Wood' : '304牆壁_殼';
  }

  // [Step2A][ClearPipeline] Build active row-id set for registry-managed categories
  private getActiveRegistryRowIds(state: FieldDomainState): Set<string> {
    const activeRowIds = new Set<string>();

    for (const row of state.existingBs) activeRowIds.add(row.id);
    for (const row of state.intelligentPanels) activeRowIds.add(row.id);
    for (const row of state.candidateBs) activeRowIds.add(row.id);
    for (const row of state.candidateRis) activeRowIds.add(row.id);
    for (const row of state.ueList) activeRowIds.add(row.id);
    for (const row of state.observes) activeRowIds.add(row.id);
    for (const row of state.zones) activeRowIds.add(row.id);
    for (const row of state.obstacles) activeRowIds.add(row.id);

    return activeRowIds;
  }

  // [Step2A][ObstacleClear] Build active obstacle row-id set
  private getActiveObstacleRowIds(state: FieldDomainState): Set<string> {
    const activeObstacleRowIds = new Set<string>();
    for (const row of state.obstacles) activeObstacleRowIds.add(row.id);
    for (const row of state.observes) activeObstacleRowIds.add(row.id);
    for (const row of state.zones) activeObstacleRowIds.add(row.id);
    return activeObstacleRowIds;
  }

  // [Step2A][ObstacleClear] Detect removed obstacle rows and dispose linked scene objects by metadata rowId
  private reconcileRemovedObstacleSceneObjects(state: FieldDomainState): void {
    if (!this.scene) return;

    const activeObstacleRowIds = this.getActiveObstacleRowIds(state);
    const removedObstacleRowIds = new Set<string>();

    for (const mesh of this.scene.meshes) {
      const rowId = mesh?.metadata?.fieldRowId;
      const isNonRegistryFieldRow =
        typeof rowId === 'string' &&
        (rowId.startsWith('obs_') || rowId.startsWith('obv_') || rowId.startsWith('zone_'));

      if (isNonRegistryFieldRow && !activeObstacleRowIds.has(rowId)) {
        removedObstacleRowIds.add(rowId);
      }
    }

    for (const node of this.scene.transformNodes) {
      const rowId = node?.metadata?.fieldRowId;
      const isNonRegistryFieldRow =
        typeof rowId === 'string' &&
        (rowId.startsWith('obs_') || rowId.startsWith('obv_') || rowId.startsWith('zone_'));

      if (isNonRegistryFieldRow && !activeObstacleRowIds.has(rowId)) {
        removedObstacleRowIds.add(rowId);
      }
    }

    for (const rowId of removedObstacleRowIds) {
      this.disposeSceneObjectByFieldRowId(rowId);
    }
  }

  // [Step2A][ObstacleClear] Dispose obstacle/landscape scene hierarchy by rowId metadata lookup
  private disposeObstacleSceneObjectByRowId(rowId: string): void {
    if (!this.scene || !rowId) return;

    const target = this.findSceneNodeByFieldRowId(rowId) as any;
    if (!target) return;

    const ownerMeshUniqueId = target?.metadata?.ownerMeshUniqueId;
    let owner: any = target;

    if (ownerMeshUniqueId != null) {
      const ownerMesh = (this.scene as any)?.getMeshByUniqueId?.(ownerMeshUniqueId);
      const ownerNode = (this.scene as any)?.getTransformNodeByUniqueId?.(ownerMeshUniqueId);
      owner = ownerMesh ?? ownerNode ?? target;
    }

    const selectedUid = (this.selectedMesh as any)?.uniqueId;
    const ownerUid = owner?.uniqueId;
    const targetUid = target?.uniqueId;
    if (selectedUid != null && (selectedUid === ownerUid || selectedUid === targetUid)) {
      this.phase2AttachGizmo(null);
      this.selectedMesh = null;
    }

    const childMeshes = owner?.getChildMeshes?.(false) ?? [];
    const childTransformNodes = owner?.getChildTransformNodes?.(false) ?? [];

    for (const mesh of childMeshes) {
      if (mesh && mesh !== owner && !mesh.isDisposed?.()) {
        mesh.dispose(false, true);
      }
    }

    for (const node of childTransformNodes) {
      if (node && node !== owner && !node.isDisposed?.()) {
        node.dispose(false);
      }
    }

    if (owner && !owner.isDisposed?.()) {
      if (owner instanceof AbstractMesh) {
        owner.dispose(false, true);
      } else {
        owner.dispose(false);
      }
    }

    console.log('[Step2A][ObstacleClear]', {
      rowId,
      target: target?.name,
      owner: owner?.name,
      childMeshCount: childMeshes.length,
      childTransformCount: childTransformNodes.length,
    });
  }

  // [Step2A][ClearPipeline] Dispose obstacle/observe/zone (non-registry categories)
  private disposeNonRegistrySceneObjectByFieldRowId(rowId: string): void {
    console.log('[Step2A][ClearPipeline][NON_REGISTRY][START]', { rowId });

    try {
      // Keep obstacle disposal semantics/logs centralized.
      if (rowId?.startsWith('obs_')) {
        this.disposeObstacleSceneObjectByRowId(rowId);
        return;
      }

      const target = this.findSceneNodeByFieldRowId(rowId) as any;
      if (!target) return;

      const ownerMeshUniqueId = target?.metadata?.ownerMeshUniqueId;
      let owner: any = target;
      if (ownerMeshUniqueId != null) {
        const ownerMesh = (this.scene as any)?.getMeshByUniqueId?.(ownerMeshUniqueId);
        const ownerNode = (this.scene as any)?.getTransformNodeByUniqueId?.(ownerMeshUniqueId);
        owner = ownerMesh ?? ownerNode ?? target;
      }

      const selectedUid = (this.selectedMesh as any)?.uniqueId;
      const ownerUid = owner?.uniqueId;
      const targetUid = target?.uniqueId;
      if (selectedUid != null && (selectedUid === ownerUid || selectedUid === targetUid)) {
        this.phase2AttachGizmo(null);
        this.selectedMesh = null;
      }

      const childMeshes = owner?.getChildMeshes?.(false) ?? [];
      const childTransformNodes = owner?.getChildTransformNodes?.(false) ?? [];

      for (const mesh of childMeshes) {
        if (mesh && mesh !== owner && !mesh.isDisposed?.()) {
          mesh.dispose(false, true);
        }
      }

      for (const node of childTransformNodes) {
        if (node && node !== owner && !node.isDisposed?.()) {
          node.dispose(false);
        }
      }

      if (owner && !owner.isDisposed?.()) {
        if (owner instanceof AbstractMesh) {
          owner.dispose(false, true);
        } else {
          owner.dispose(false);
        }
      }
    } finally {
      console.log('[Step2A][ClearPipeline][NON_REGISTRY][DONE]', { rowId });
    }
  }

  // [Step2A][ClearPipeline] Unified dispose entry (registry vs non-registry)
  private disposeSceneObjectByFieldRowId(rowId: string): void {
    if (this.sceneObjectRegistry?.has(rowId)) {
      this.disposeRegisteredSceneObject(rowId);
      return;
    }
    this.disposeNonRegistrySceneObjectByFieldRowId(rowId);
  }

  // [Step2A][ClearPipeline] Detect removed rows and dispose linked scene objects via registry
  private reconcileRemovedRegisteredSceneObjects(state: FieldDomainState): void {
    if (!this.sceneObjectRegistry?.size) return;

    console.log('[Step2A][Registry][STATE]', {
      registrySize: this.sceneObjectRegistry.size,
      registryKeys: Array.from(this.sceneObjectRegistry.keys()),
    });

    const activeRowIds = this.getActiveRegistryRowIds(state);
    const removedRowIds: string[] = [];

    for (const [rowId] of this.sceneObjectRegistry) {
      if (!activeRowIds.has(rowId)) {
        removedRowIds.push(rowId);
      }
    }

    for (const rowId of removedRowIds) {
      this.disposeSceneObjectByFieldRowId(rowId);
    }
  }

  // [Step2A][ClearPipeline] Dispose owner/root/children and unregister row registry mapping
  private disposeRegisteredSceneObject(rowId: string): void {
    console.log('[Step2A][ClearPipeline][START]', {
      rowId,
      entry: this.getRegistryEntryByRowId(rowId),
    });

    const entry = this.getRegistryEntryByRowId(rowId);
    if (!entry) return;

    const ownerNode = entry.ownerNode as any;
    const rootMesh = entry.rootMesh as any;
    const fallback = this.findSceneNodeByFieldRowId(rowId);

    console.log('[Step2A][ClearPipeline][METADATA]', {
      rowId,
      fallbackNode: fallback?.name,
    });

    const selectedUid = (this.selectedMesh as any)?.uniqueId;
    const ownerUid = ownerNode?.uniqueId;
    const rootUid = rootMesh?.uniqueId;

    if (selectedUid != null && (selectedUid === ownerUid || selectedUid === rootUid)) {
      this.phase2AttachGizmo(null);
      this.selectedMesh = null;
    }

    const childMeshes =
      ownerNode?.getChildMeshes?.(false) ??
      rootMesh?.getChildMeshes?.(false) ??
      [];

    const childTransformNodes =
      ownerNode?.getChildTransformNodes?.(false) ??
      [];

    for (const mesh of childMeshes) {
      if (mesh && !mesh.isDisposed?.()) {
        mesh.dispose(false, true);
      }
    }

    for (const node of childTransformNodes) {
      if (node && node !== ownerNode && !node.isDisposed?.()) {
        node.dispose(false);
      }
    }

    if (rootMesh && rootMesh !== ownerNode && !rootMesh.isDisposed?.()) {
      rootMesh.dispose(false, true);
    }

    if (ownerNode && !ownerNode.isDisposed?.()) {
      if (ownerNode instanceof AbstractMesh) {
        ownerNode.dispose(false, true);
      } else {
        ownerNode.dispose(false);
      }
    }

    this.unregisterSceneObjectForFieldRow(rowId);
    console.log('[Step2A][ClearPipeline] unregistered', {
      rowId,
      category: entry.category,
    });

    console.log('[Step2A][ClearPipeline] disposed registry scene object', {
      rowId,
      category: entry.category,
      owner: ownerNode?.name,
      root: rootMesh?.name,
      childMeshCount: childMeshes.length,
      childTransformCount: childTransformNodes.length,
    });
  }

  // [Patch1][ObstacleAngle] Convert Babylon rotation (radian) to field storage (degree)
  private getObstacleAngleDeg(target: { rotation?: Vector3 | null } | null | undefined): number {
    return this.roundFieldNum(((target?.rotation?.y ?? 0) * 180) / Math.PI, 2);
  }

  private isLandscapeFieldRowTarget(target: any): boolean {
    const meta = target?.metadata || {};
    return meta?.type === 'landscape' || meta?.itemId === 'tree' || meta?.itemId?.includes?.('tree');
  }

  // ========== [Step2A][Registry] Scene Object Registry Helpers ==========

  // [Step2A][Registry] Register scene object hierarchy for field row
  private registerSceneObjectForFieldRow(
    rowId: string,
    category: RegistryCategory,
    ownerNode: TransformNode | AbstractMesh,
    rootMesh: AbstractMesh | TransformNode | null,
    metadataType?: string | null,
    itemId?: string | number | null
  ): void {
    if (!rowId) return;

    const actualRootMesh = (rootMesh instanceof AbstractMesh ? rootMesh : null) as AbstractMesh | null;

    const childMeshesFromOwner =
      (ownerNode as any)?.getChildMeshes?.(false) ??
      actualRootMesh?.getChildMeshes?.(false) ??
      [];

    const childMeshIds = childMeshesFromOwner.map((m: AbstractMesh) => m.uniqueId);

    const entry: SceneObjectRegistryEntry = {
      rowId,
      category,
      ownerNode,
      rootMesh: actualRootMesh,
      childMeshIds,
      metadataType,
      itemId,
    };

    this.sceneObjectRegistry.set(rowId, entry);

    console.log('[Step2A][Registry] registered', {
      rowId,
      category,
      owner: (ownerNode as any)?.name,
      rootMesh: actualRootMesh?.name,
      childMeshCount: childMeshIds.length,
    });

    console.log('[Step2A][Registry][REGISTER]', {
      rowId,
      category,
      owner: (ownerNode as any)?.name,
      ownerUid: (ownerNode as any)?.uniqueId,
      root: (actualRootMesh as any)?.name,
      rootUid: (actualRootMesh as any)?.uniqueId,
      childMeshCount: childMeshIds.length,
    });
  }

  /**
   * Unregister a scene object from the registry
   */
  private unregisterSceneObjectForFieldRow(rowId: string): void {
    if (!rowId) return;

    const entry = this.sceneObjectRegistry.get(rowId);
    if (entry) {
      this.sceneObjectRegistry.delete(rowId);
      console.log('[Step2A][Registry] unregistered', { rowId, category: entry.category });
    }
  }

  /**
   * Get registry entry by row ID
   */
  private getRegistryEntryByRowId(rowId: string): SceneObjectRegistryEntry | undefined {
    return this.sceneObjectRegistry.get(rowId);
  }

  /**
   * Get owner node by field row ID
   */
  private getOwnerNodeByFieldRowId(rowId: string): TransformNode | AbstractMesh | null {
    const entry = this.sceneObjectRegistry.get(rowId);
    return entry?.ownerNode ?? null;
  }

  /**
   * Get root mesh by field row ID
   */
  private getRootMeshByFieldRowId(rowId: string): AbstractMesh | null {
    const entry = this.sceneObjectRegistry.get(rowId);
    return entry?.rootMesh ?? null;
  }

  /**
   * Get field row ID from a scene node by searching registry
   */
  private getFieldRowIdFromSceneNode(node: TransformNode | AbstractMesh | null | undefined): string | null {
    if (!node) return null;

    for (const [rowId, entry] of this.sceneObjectRegistry) {
      if (entry.ownerNode === node || entry.rootMesh === node) {
        return rowId;
      }
      if (entry.childMeshIds.includes(node.uniqueId)) {
        return rowId;
      }
    }

    return null;
  }

  // ================= Phase 1.5: Owner-based parsing core =================
  private findRegistryEntryByOwnerUniqueId(
    ownerUniqueId: number
  ): SceneObjectRegistryEntry | null {
    for (const entry of this.sceneObjectRegistry.values()) {
      if (entry?.ownerNode?.uniqueId === ownerUniqueId) {
        return entry;
      }
    }
    return null;
  }

  private findRegistryEntryByTarget(
    target: TransformNode | AbstractMesh | null | undefined
  ): SceneObjectRegistryEntry | null {
    if (!target) return null;

    const meta = (target as any).metadata ?? {};
    const rowId = meta.fieldRowId;
    if (rowId && this.sceneObjectRegistry.has(rowId)) {
      return this.sceneObjectRegistry.get(rowId) ?? null;
    }

    const ownerUid = meta.ownerMeshUniqueId;
    if (typeof ownerUid === 'number') {
      return this.findRegistryEntryByOwnerUniqueId(ownerUid);
    }

    for (const entry of this.sceneObjectRegistry.values()) {
      if (entry?.ownerNode?.uniqueId === target.uniqueId) return entry;
      if (entry?.rootMesh?.uniqueId === target.uniqueId) return entry;
      if (entry?.childMeshIds?.includes?.(target.uniqueId)) return entry;
    }

    return null;
  }

  private resolveSceneObjectOwner(
    target: TransformNode | AbstractMesh | null | undefined
  ): TransformNode | AbstractMesh | null {
    if (!target || !this.scene) return null;

    let cur: any = target;
    let depth = 0;

    while (cur && depth < 20) {
      const meta = cur.metadata ?? {};

      // A. self is owner
      if (meta.isSceneObjectOwner === true) {

        return cur as any;
      }

      // B. child has ownerMeshUniqueId
      if (typeof meta.ownerMeshUniqueId === 'number') {
        const sceneAny = this.scene as any;
        const ownerByUid =
          sceneAny?.getMeshByUniqueId?.(meta.ownerMeshUniqueId) ??
          sceneAny?.getTransformNodeByUniqueId?.(meta.ownerMeshUniqueId) ??
          null;

        if (ownerByUid) {

          return ownerByUid as any;
        }
      }

      // C. fieldRowId -> registry owner
      if (meta.fieldRowId) {
        const entry = this.sceneObjectRegistry.get(meta.fieldRowId);
        if (entry?.ownerNode) {

          return entry.ownerNode;
        }
      }

      // D. registry target lookup
      const entry = this.findRegistryEntryByTarget(cur);
      if (entry?.ownerNode) {

        return entry.ownerNode;
      }

      cur = cur.parent ?? null;
      depth += 1;
    }

    // E. fallback

    return target as any;
  }

  private resolveSceneObjectOwnerOrSelf(
    target: TransformNode | AbstractMesh | null | undefined
  ): TransformNode | AbstractMesh | null {
    return this.resolveSceneObjectOwner(target) ?? target ?? null;
  }

  private debugResolvedOwner(
    target: TransformNode | AbstractMesh | null | undefined,
    tag: string = 'debugResolvedOwner'
  ): void {
    const owner = this.resolveSceneObjectOwner(target);

  }

  private applySimpleFieldPosition(
    target: any,
    row: { x?: number; y?: number; startHeight?: number }
  ): void {
    if (!target?.position) return;

    if (typeof row.x === 'number' && typeof row.y === 'number') {
      const rowX = Number(row.x);
      const rowY = Number(row.y);
      const rowZ = typeof row.startHeight === 'number' ? row.startHeight : 0;

      const scenePos = this.floorRowToSceneWorld(rowX, rowY, rowZ);

      target.position.x = scenePos.x;
      target.position.z = scenePos.z;

      console.log('[COORD][GenericRow->Scene]', {
        rowId: (row as any)?.id ?? null,
        rowXY: { x: rowX, y: rowY },
        scenePos,
        path: scenePos.path,
        inBounds: scenePos.inBounds,
        meshName: target.name,
      });
    } else {
      if (typeof row.x === 'number') {
        target.position.x = row.x;
      }
      if (typeof row.y === 'number') {
        target.position.z = row.y;
      }
    }

    if (typeof row.startHeight === 'number') {
      const bounds = this.getWorldBoundsInfo(target);
      const deltaY = row.startHeight - bounds.minY;
      target.position.y += deltaY;
    }
  }

  private applySimplePosition(
    target: any,
    row: { x?: number; y?: number; height?: number }
  ): void {
    if (!target?.position) return;

    if (typeof row.x === 'number') {
      target.position.x = row.x;
    }

    if (typeof row.y === 'number') {
      target.position.z = row.y;
    }

    if (typeof row.height === 'number') {
      target.position.y = row.height;
    }
  }

// -------------------- Phase 4: Obstacle (primitive) spawn helpers --------------------
private spawnObstacleBoxAt(point: any, placedOn: 'ground' | 'building'): void {
  if (!this.guardEditWrite('spawnObstacleBoxAt')) return;
  // backward-compatible wrapper
  this.spawnObstaclePrimitiveAt('box', point, placedOn);
}

/**
 * Spawn an obstacle primitive by kind.
 * - kind: 'box' | 'sphere' | 'cylinder'
 * Obstacles will be treated as blockers (metadata.type='obstacle').
 */
private spawnObstaclePrimitiveAt(kind: string, point: any, placedOn: 'ground' | 'building'): void {
  if (!this.guardEditWrite('spawnObstaclePrimitiveAt')) return;
  const k = (kind || 'box').toLowerCase();

  // Default initial size: 10x scale-up from original (2 → 20)
  const size = 20;
  const height = 20;

  let mesh: Mesh;

  if (k === 'sphere') {
    mesh = MeshBuilder.CreateSphere(`obstacle_sphere_${Date.now()}`, { diameter: size }, this.scene);
    mesh.position = point.clone ? point.clone() : point;
    mesh.position.y += size / 2;
  } else if (k === 'cylinder') {
    mesh = MeshBuilder.CreateCylinder(`obstacle_cylinder_${Date.now()}`, { height, diameter: size }, this.scene);
    mesh.position = point.clone ? point.clone() : point;
    mesh.position.y += height / 2;
  } else {
    mesh = MeshBuilder.CreateBox(`obstacle_box_${Date.now()}`, { size }, this.scene);
    mesh.position = point.clone ? point.clone() : point;
    mesh.position.y += size / 2;
  }

  mesh.isPickable = true;
  mesh.metadata = {
    ...(mesh.metadata ?? {}),
    type: 'obstacle',
    obstacleKind: k,
    placedOn,
  };

  // ===== Store Integration =====
  mesh.computeWorldMatrix(true);
  const bounds = this.getWorldBoundsInfo(mesh);
  const spawnScenePos = {
    x: bounds.centerX,
    y: bounds.minY,
    z: bounds.centerZ,
  };
  const spawnMathPos = this.toMathPositionFromSceneXYZ(
    spawnScenePos.x,
    spawnScenePos.y,
    spawnScenePos.z
  );

  const floorBB = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
  const floorMin = floorBB?.minimumWorld ?? null;

  const fieldX = this.roundFieldNum(
    floorMin ? spawnScenePos.x - floorMin.x : spawnMathPos.x
  );
  const fieldY = this.roundFieldNum(
    floorMin ? spawnScenePos.z - floorMin.z : spawnMathPos.y
  );
  const startHeight = this.roundFieldNum(spawnScenePos.y);
  const obstacleHeight = this.roundFieldNum(bounds.sizeY);
  const obstacleLength = this.roundFieldNum(bounds.sizeX);
  const obstacleWidth = this.roundFieldNum(bounds.sizeZ);
  const angleDeg = this.getObstacleAngleDeg(mesh);
  const material = this.getDefaultObstacleMaterial('primitive');
  const color = '#73805c';
  
  const obstacleRow = this.fieldDomainStore.addObstacle({
    x: fieldX,
    y: fieldY,
    startHeight,
    height: obstacleHeight,
    length: obstacleLength,
    width: obstacleWidth,
    angle: angleDeg,
    material,
    shape: k,
    color,
    position: { x: fieldX, y: fieldY, z: startHeight },
    meshId: mesh.uniqueId,
  });
  this.attachFieldRowMetadata(mesh, obstacleRow.id);
  this.registerSceneObjectForFieldRow(obstacleRow.id, 'obstacle', mesh, mesh, k);
  console.log('[FieldStore][Obstacle] added row', obstacleRow);
  console.log('[COORD][Spawn->Row][Object]', {
    kind: 'basic-object',
    scenePosition: spawnScenePos,
    mathPosition: {
      x: obstacleRow.x,
      y: obstacleRow.y,
      z: obstacleRow.startHeight,
    },
  });
  console.log('[FieldStore][Obstacle][Bounds]', bounds);
  this.debugFieldStore('Obstacle');

  console.log('[Phase4][Obstacle] spawned', { kind: k, placedOn, name: mesh.name });
}

/**
 * Spawn a landscape object (tree).
 * Implementation: clone jungle_tree.glb template and parent under an invisible owner proxy.
 */
private spawnLandscapeAt(itemId: string, point: any, placedOn: 'ground' | 'building'): void {
  if (!this.guardEditWrite('spawnLandscapeAt')) return;
  // Ensure template loaded then spawn
  this.ensureMapleTreeTemplateLoaded()
    .then(() => {
      if (!this.mapleTreeTemplateRoot) {
        console.warn('[Landscape] spawn aborted: no mapleTreeTemplateRoot');
        return;
      }

      const id = (itemId || 'tree').toLowerCase();
      const name = `landscape_${id}_${Date.now()}`;
      // Unity baseline for measuring raw model height (no pre-shrink); final scale is applied to `owner` below.
      const TREE_BASE_SCALE = 1;
      const TREE_TARGET_HEIGHT_M = 14.5;

      // Owner proxy for stable selection / gizmo (we attach clone under owner)
      const owner = MeshBuilder.CreateBox(`${name}_owner`, { size: 0.1 }, this.scene);
      owner.isVisible = false;
      owner.isPickable = true;

      owner.position = point.clone ? point.clone() : point;
      owner.scaling = new Vector3(TREE_BASE_SCALE, TREE_BASE_SCALE, TREE_BASE_SCALE);

      owner.metadata = {
        ...(owner.metadata ?? {}),
        type: 'landscape',
        itemId: id,
        placedOn,
        blocksSignal: false, // 預設不當遮蔽物；未來若要算遮蔽再調整
      };

      // Clone template root
      const instanceRoot = this.mapleTreeTemplateRoot!.clone(`${name}_root`, null) as TransformNode;
      instanceRoot.setEnabled(true);
      instanceRoot.parent = owner;
      instanceRoot.scaling = new Vector3(TREE_BASE_SCALE, TREE_BASE_SCALE, TREE_BASE_SCALE);

      owner.computeWorldMatrix(true);
      instanceRoot.computeWorldMatrix(true);
      const childMeshes = instanceRoot.getChildMeshes?.(false) ?? [];
      for (const m of childMeshes) {
        m.computeWorldMatrix(true);
      }

      // Make child meshes pickable and link back to owner
      for (const m of childMeshes) {
        m.setEnabled(true);
        m.isPickable = true;
        m.metadata = {
          ...(m.metadata ?? {}),
          type: 'landscape',
          itemId: id,
          ownerMeshUniqueId: owner.uniqueId,
          placedOn,
          blocksSignal: false,
        };
      }
      this.attachMeshesToOwner(instanceRoot, childMeshes);
      this.reparentLooseChildrenToOwner(owner, (mesh) => {
        const meta = (mesh as any)?.metadata ?? {};
        return meta.ownerMeshUniqueId === owner.uniqueId;
      });

      // Scale must apply to `owner`: reparentLooseChildrenToOwner moves meshes with ownerMeshUniqueId
      // directly under `owner`, so `instanceRoot.scaling` no longer affects visible tree geometry.
      const meshesForBounds = owner.getChildMeshes?.(true) ?? [];
      let rawMinY = Infinity;
      let rawMaxY = -Infinity;
      for (const m of meshesForBounds) {
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        rawMinY = Math.min(rawMinY, bb.minimumWorld.y);
        rawMaxY = Math.max(rawMaxY, bb.maximumWorld.y);
      }
      const rawHeight = Math.max(0.001, rawMaxY - rawMinY);
      const finalUniformScale = TREE_TARGET_HEIGHT_M / rawHeight;
      owner.scaling = new Vector3(finalUniformScale, finalUniformScale, finalUniformScale);
      owner.computeWorldMatrix(true);
      for (const m of meshesForBounds) {
        m.computeWorldMatrix(true);
      }

      console.log('[TREE_SCALE_DEBUG]', {
        TREE_BASE_SCALE,
        TREE_TARGET_HEIGHT_M,
        // Effective scale is on `owner` (meshes are reparented under owner, not under instanceRoot).
        finalScaling: owner.scaling,
      });

      // ===== compute world bounds for landscape =====
      const bounds = this.getWorldBoundsInfo(owner);

      console.log('[Landscape][SpawnPoint]', {
        clickX: point?.x,
        clickY: point?.y,
        clickZ: point?.z,
        ownerX: owner.position.x,
        ownerY: owner.position.y,
        ownerZ: owner.position.z,
      });

      console.log('[Landscape][SpawnBounds]', {
        centerX: bounds.centerX,
        centerZ: bounds.centerZ,
        minY: bounds.minY,
        sizeX: bounds.sizeX,
        sizeY: bounds.sizeY,
        sizeZ: bounds.sizeZ,
      });
      
      // ===== Landscape → FieldStore integration =====
      const spawnScenePos = {
        x: owner.position.x,
        y: bounds.minY,
        z: owner.position.z,
      };
      const spawnMathPos = this.toMathPositionFromSceneXYZ(
        spawnScenePos.x,
        spawnScenePos.y,
        spawnScenePos.z
      );
      const fieldX = this.roundFieldNum(spawnMathPos.x);
      const fieldY = this.roundFieldNum(spawnMathPos.y);
      const startHeight = this.roundFieldNum(spawnMathPos.z);
      const obstacleHeight = this.roundFieldNum(bounds.sizeY);
      const obstacleLength = this.roundFieldNum(bounds.sizeX);
      const obstacleWidth = this.roundFieldNum(bounds.sizeZ);
      const angleDeg = this.getObstacleAngleDeg(owner);
      // [Patch1][Landscape] Default material for landscape/tree
      const material = 'Wood';
      const shape = id || 'landscape';
      const color = '#73805c';
      
      const obstacleRow = this.fieldDomainStore.addObstacle({
        x: fieldX,
        y: fieldY,
        startHeight,
        height: obstacleHeight,
        length: obstacleLength,
        width: obstacleWidth,
        angle: angleDeg,
        material,
        shape,
        color,
        position: { x: fieldX, y: fieldY, z: startHeight },
        ownerMeshId: owner.uniqueId,
      });
      this.attachFieldRowMetadata(owner, obstacleRow.id);
      this.attachFieldRowMetadata(instanceRoot, obstacleRow.id);
      const meshesAfterScale = owner.getChildMeshes?.(true) ?? [];
      for (const m of meshesAfterScale) {
        this.attachFieldRowMetadata(m, obstacleRow.id);
      }
      this.finalizeOwnerHierarchy(
        owner,
        obstacleRow.id,
        'obstacle',
        'landscape',
        'spawnLandscapeAt'
      );
      this.registerSceneObjectForFieldRow(obstacleRow.id, 'obstacle', owner, owner, shape);

      console.log('[FieldStore][Landscape->Obstacle] added row', obstacleRow);
      console.log('[COORD][Spawn->Row][Object]', {
        kind: 'landscape-object',
        scenePosition: spawnScenePos,
        mathPosition: {
          x: obstacleRow.x,
          y: obstacleRow.y,
          z: obstacleRow.startHeight,
        },
      });
      console.log('[FieldStore][Landscape][Bounds]', bounds);
      console.log('[Phase4][Landscape] spawned', {
        itemId: id,
        owner: owner.name,
        x: fieldX,
        y: fieldY,
        scale: finalUniformScale,
        material,
        children: meshesAfterScale.length,
      });
    })
    .catch((err) => {
      console.error('[Landscape] maple_tree spawn failed', err);
    });
}

/**
 * Spawn a region selection box.
 * Requirements:
 * - semi-transparent
 * - x-ray (always visible through buildings)
 * - NOT treated as obstacle
 */
//自訂分區與觀測區域大小調整
private spawnRegionBoxAt(regionType: 'observeZone' | 'customZone', point: any, placedOn: 'ground' | 'building'): void {
  console.log('[OBS_CREATE_ENTER][v1]');
  if (!this.guardEditWrite('spawnRegionBoxAt')) return;
  const name = `${regionType}_${Date.now()}`;
  let rowId: string | null = null;
  let rowCategory: string = regionType;

  // Default initial size: 5x scale-up from original (10→50, 3→15)
  const box = MeshBuilder.CreateBox(name, { width: 50, depth: 50, height: 15 }, this.scene);
  box.position = point.clone ? point.clone() : point;
  box.position.y += 15 / 2;

  // semi-transparent material — observeZone gets its own orange mat; customZone stays default grey
  const mat = new StandardMaterial(`${name}_mat`, this.scene);
  if (regionType === 'observeZone') {
    mat.diffuseColor = new Color3(1, 0.6, 0.2);   // translucent light-orange for observation area
    mat.alpha = 0.25;
  } else {
    mat.alpha = 0.3;  // customZone: keep original grey appearance
  }
  mat.backFaceCulling = false;
  box.material = mat;

  // x-ray rendering: render last + force depth test ALWAYS for this mesh only
  box.renderingGroupId = 3;

  const eng = this.engine as any;
  box.onBeforeRenderObservable.add(() => {
    eng?.setDepthFunctionToAlways?.();
  });
  box.onAfterRenderObservable.add(() => {
    eng?.setDepthFunctionToLessOrEqual?.();
  });

  box.isPickable = true;
  box.metadata = {
    ...(box.metadata ?? {}),
    type: regionType,       // NOTE: NOT 'obstacle'
    regionKind: regionType,
    placedOn,
    blocksSignal: false,
  };

  // ===== Store Integration =====
  const scenePos = { x: box.position.x, y: box.position.y, z: box.position.z };
  const local = this.sceneWorldToFloorLocalRow(scenePos.x, scenePos.z);
  
  if (regionType === 'customZone') {
    const zoneRow = this.fieldDomainStore.addZone({
      x: this.roundFieldNum(local.x),
      y: this.roundFieldNum(local.y),
      length: 50,  // 5x from original 10
      width: 50,   // 5x from original 10
      angle: this.degFromRad(box.rotation?.y ?? 0),
      meshId: box.uniqueId,
    });
    this.attachFieldRowMetadata(box, zoneRow.id);
    rowId = zoneRow.id;
    rowCategory = 'zone';
    console.log('[FieldStore][Zone][CustomZone] added row', zoneRow);

  } else if (regionType === 'observeZone') {
    console.log('[OBS_CREATE_CASE][observeZone][v1]');
    const observeRow = this.fieldDomainStore.addObserve({
      x: this.roundFieldNum(local.x),
      y: this.roundFieldNum(local.y),
      z: this.roundFieldNum(scenePos.y),
      meshId: box.uniqueId,
    });
    console.log('[OBS_CREATE_AFTER_ADD_OBSERVE][v1]', {
      observes: this.fieldDomainStore.snapshot?.observes ?? [],
      subfields: this.fieldDomainStore.snapshot?.subfields ?? [],
    });
    console.log('[OBS_CREATE_BEFORE_ADD_SUBFIELD][v1]');

    // Compute real rectangle geometry from mesh bounding box
    box.computeWorldMatrix(true);
    const _obsBbox = box.getBoundingInfo()?.boundingBox ?? null;
    const obsWidth = _obsBbox ? (_obsBbox.maximumWorld.x - _obsBbox.minimumWorld.x) : 50;
    const obsLength = _obsBbox ? (_obsBbox.maximumWorld.z - _obsBbox.minimumWorld.z) : 50;
    const obsAngleDeg = this.degFromRad(box.rotation?.y ?? 0);
    const obsCx = observeRow.x;
    const obsCy = observeRow.y;
    const obsVertices = this.buildRectangleVertices(obsCx, obsCy, obsWidth, obsLength, obsAngleDeg);

    const subfieldRow = this.fieldDomainStore.addSubfield({
      name: `觀測區域 ${observeRow.seq}`,
      shapeType: 'rectangle',
      radius: 0,
      rotateAngle: obsAngleDeg,
      rotateCenter: [Number(obsCx.toFixed(4)), Number(obsCy.toFixed(4))],
      vertices: obsVertices,
      visible: true,
      sceneObjectId: String(observeRow.meshId ?? box?.uniqueId ?? ''),
    });
    console.log('[SUBFIELD_STORE_AFTER_CREATE]', {
      observeRow,
      width: obsWidth,
      length: obsLength,
      angleDeg: obsAngleDeg,
      vertices: obsVertices,
      snapshotSubfields: this.fieldDomainStore.snapshot?.subfields,
    });
    console.log('[OBS_CREATE_AFTER_ADD_SUBFIELD][v1]', {
      subfields: this.fieldDomainStore.snapshot?.subfields ?? [],
    });
    this.attachFieldRowMetadata(box, observeRow.id);
    rowId = observeRow.id;
    rowCategory = 'observe';
    console.log('[FieldStore][Observe][ObserveZone] added row', observeRow);
    console.log('[FieldStore][Subfield][ObserveZone] added row', subfieldRow);
    console.log('[COORD][Spawn->Row][Area]', {
      kind: 'observe-zone',
      sceneData: scenePos,
      mathData: { x: observeRow.x, y: observeRow.y, z: observeRow.z },
    });
  }
  if (rowId) {
    this.registerSceneObjectForFieldRow(
      rowId,
      rowCategory as RegistryCategory,
      box,
      box,
      regionType
    );
    this.finalizeOwnerHierarchy(
      box,
      rowId,
      rowCategory,
      regionType,
      'spawnRegionBoxAt'
    );
  }

  this.debugFieldStore(`Region-${regionType}`);

  console.log('[Phase4][Region] spawned', { regionType, placedOn, name: box.name });
}

  // -------------------- Phase 4: RIS (Smart Reflective Surface) spawn helpers --------------------
  /**
   * ===== [RIS:HELPER] =====
   * Purpose: Create a realistic RIS mesh with PBR glass material, grid texture, and support structure.
   * Spec:
   * - Main panel: 6 (length) × 4 (height) × 0.5 (thickness) 公尺，Y軸直立
   * - Material: PBRMaterial with yellow glass effect (alpha ~0.5, metallic 0.1, roughness 0.3)
   * - Grid texture: Green micro-unit grid on front face (模擬 RIS 反射單元)
   * - Border: Dark gray/silver frame around edges
   * - Support: Cylindrical base stand
   * - Emissive: Green glow lines on front face (運作中效果)
   * =========================
   */
  private createRISMesh(name: string): TransformNode {
    if (!this.guardEditWrite('createRISMesh')) {
      return new TransformNode(`${name}_disabled`, this.scene);
    }
    const ris = new TransformNode(name, this.scene);
    
    // ===== [RIS:PANEL] Main panel body =====
    // Dimension: 6 (X) × 4 (Y) × 0.5 (Z) - reduced thickness by another 1/2, adjusted aspect ratio to 6:4
    const panel = MeshBuilder.CreateBox(`${name}_panel`, 
      { width: 6, height: 4, depth: 0.5 }, 
      this.scene
    );
    panel.parent = ris;
    
    // ===== [RIS:MATERIAL] PBR Glass Material =====
    const pbr = new PBRMaterial(`${name}_pbr`, this.scene);
    
    // Glass effect parameters with yellow base
    pbr.albedoColor = new Color3(1.0, 1.0, 0.0);  // Bright yellow
    pbr.alpha = 0.5;                                 // Transparency
    pbr.transparencyMode = 2;                        // MATERIAL_ALPHABLEND
    
    // PBR metallic & roughness for glass-like reflection
    pbr.metallic = 0.1;
    pbr.roughness = 0.3;
    
    // Refractive effect (simulating glass refraction)
    pbr.directIntensity = 1.2;  // Increase edge highlight for depth perception
    pbr.environmentIntensity = 0.8;
    
    // Emissive: subtle glow to simulate operational state
    pbr.emissiveColor = new Color3(0.0, 1.0, 0.0);  // Green glow
    pbr.emissiveIntensity = 0.15;
    
    panel.material = pbr;
    panel.isPickable = true;
    panel.metadata = {
      ...(panel.metadata ?? {}),
      type: 'ris',
      risComponent: 'main_panel',
    };
    
    // ===== [RIS:GRID_TEXTURE] Grid detail on front face =====
    // We'll use a simple approach: create a thin plane with grid-like lines
    const gridPlane = MeshBuilder.CreatePlane(`${name}_grid`, 
      { width: 6, height: 4 }, 
      this.scene
    );
    gridPlane.parent = panel;
    gridPlane.position.z = 0.3;  // Slightly offset in front of main panel (thickness/2 + 0.05)
    gridPlane.isPickable = false;
    
    // Grid-like material using StandardMaterial with custom emissive
    const gridMat = new StandardMaterial(`${name}_grid_mat`, this.scene);
    gridMat.emissiveColor = new Color3(0.0, 1.0, 0.0);  // Green lines
    gridMat.backFaceCulling = false;
    gridMat.alpha = 0.4;                 // Semi-transparent grid overlay
    
    gridPlane.material = gridMat;
    
    // Create visual grid lines using thin cylinders to simulate micro-unit grid
    const gridCellSize = 2;  // 2m x 2m grid cells
    const gridColor = new Color3(0.0, 1.0, 0.0);  // Green
    
    // Vertical lines (X-axis division)
    for (let x = -3; x <= 3; x += gridCellSize) {
      const vLine = MeshBuilder.CreateTube(`${name}_vline_${x}`, 
        {
          path: [
            new Vector3(x, -2, 0.3),
            new Vector3(x, 2, 0.3)
          ],
          radius: 0.06,
          updatable: false,
        },
        this.scene
      );
      vLine.parent = panel;
      vLine.isPickable = false;
      
      const lineMat = new StandardMaterial(`${name}_vline_mat_${x}`, this.scene);
      lineMat.emissiveColor = gridColor;
      lineMat.alpha = 0.6;
      vLine.material = lineMat;
    }
    
    // Horizontal lines (Y-axis division)
    for (let y = -2; y <= 2; y += 1) {
      const hLine = MeshBuilder.CreateTube(`${name}_hline_${y}`, 
        {
          path: [
            new Vector3(-3, y, 0.3),
            new Vector3(3, y, 0.3)
          ],
          radius: 0.06,
          updatable: false,
        },
        this.scene
      );
      hLine.parent = panel;
      hLine.isPickable = false;
      
      const lineMat = new StandardMaterial(`${name}_hline_mat_${y}`, this.scene);
      lineMat.emissiveColor = gridColor;
      lineMat.alpha = 0.6;
      hLine.material = lineMat;
    }
    
    // ===== [RIS:EMISSIVE_LINES] Emissive glow lines on front =====
    // Create subtle horizontal lines to simulate operational state
    for (let i = 0; i < 5; i++) {
      const yOffset = -2 + (i * 1);  // Distribute 5 lines vertically
      const line = MeshBuilder.CreateTube(`${name}_emissive_line_${i}`, 
        {
          path: [
            new Vector3(-3, yOffset, 0.3),
            new Vector3(3, yOffset, 0.3)
          ],
          radius: 0.08,
          updatable: false,
        },
        this.scene
      );
      line.parent = panel;
      line.isPickable = false;
      
      // Emissive line material (glowing green)
      const emissiveMat = new StandardMaterial(`${name}_emissive_line_mat_${i}`, this.scene);
      emissiveMat.emissiveColor = new Color3(0.0, 1.0, 0.0);  // Bright green
      emissiveMat.alpha = 0.7;
      line.material = emissiveMat;
    }
    
    // ===== [RIS:FRAME] Dark border/frame around edges =====
    // Top frame
    const frameTop = MeshBuilder.CreateBox(`${name}_frame_top`, 
      { width: 6.5, height: 0.2, depth: 0.65 }, 
      this.scene
    );
    frameTop.parent = panel;
    frameTop.position.y = 2.1;
    frameTop.isPickable = false;
    
    // Bottom frame
    const frameBottom = MeshBuilder.CreateBox(`${name}_frame_bottom`, 
      { width: 6.5, height: 0.2, depth: 0.65 }, 
      this.scene
    );
    frameBottom.parent = panel;
    frameBottom.position.y = -2.1;
    frameBottom.isPickable = false;
    
    // Frame material: dark gray/silver
    const frameMat = new StandardMaterial(`${name}_frame_mat`, this.scene);
    frameMat.emissiveColor = new Color3(0.3, 0.3, 0.35);   // Dark gray
    frameMat.specularColor = new Color3(0.6, 0.6, 0.6);  // Silver specular
    frameTop.material = frameMat;
    frameBottom.material = frameMat.clone(`${name}_frame_mat_bottom`);
    
    // ===== [RIS:SUPPORT] Base stand (cylindrical support) =====
    const support = MeshBuilder.CreateCylinder(`${name}_support`, 
      { height: 0.5, diameter: 1.2 }, 
      this.scene
    );
    support.parent = ris;
    support.position.y = -2.25;  // Below the panel
    support.isPickable = false;
    
    // Support material: metallic gray
    const supportMat = new StandardMaterial(`${name}_support_mat`, this.scene);
    supportMat.emissiveColor = new Color3(0.4, 0.4, 0.4);
    supportMat.specularColor = new Color3(0.8, 0.8, 0.8);
    supportMat.specularPower = 32;
    support.material = supportMat;
    
    // Small base footprint
    const basePlate = MeshBuilder.CreateCylinder(`${name}_base_plate`, 
      { height: 0.1, diameter: 1.5 }, 
      this.scene
    );
    basePlate.parent = ris;
    basePlate.position.y = -2.55;
    basePlate.isPickable = false;
    basePlate.material = supportMat.clone(`${name}_base_mat`);
    
    // ===== [RIS:METADATA] =====
    ris.metadata = {
      type: 'ris',
      risType: 'panel_assembly',
      blocksSignal: true,  // RIS acts as potential blocker depending on configuration
    };
    
    console.log('[RIS][Create] mesh created', {
      name,
      panelSize: '6×4×0.5',
      hasGrid: true,
      hasFrame: true,
      hasSupport: true,
      hasEmissive: true,
    });
    
    return ris;
  }

  /**
   * ===== [RIS:SPAWN] =====
   * Purpose: Spawn a RIS panel at a specific point on the ground or building.
   * Steps:
   * 1. Create RIS mesh via createRISMesh()
   * 2. Position at picked point
   * 3. Create invisible owner proxy for gizmo manipulation
   * 4. Register metadata for signal ray computation
   */
  private async spawnRISAt(point: any, placedOn: 'ground' | 'building'): Promise<void> {
    if (!this.guardEditWrite('spawnRISAt')) return;
    if (!this.scene) {
      console.warn('[RIS][Spawn] aborted: no scene');
      return;
    }

    const timestamp = Date.now();
    const risMesh = this.createRISMesh(`ris_panel_${timestamp}`);
    
    // Owner proxy for stable gizmo control
    const owner = MeshBuilder.CreateBox(`ris_owner_${timestamp}`, { size: 0.01 }, this.scene);
    owner.isVisible = false;
    owner.isPickable = true;
    owner.position = point.clone ? point.clone() : point;
    
    // Parent RIS under owner
    risMesh.parent = owner;
    risMesh.position = Vector3.Zero();
    
    // Owner metadata (for selection/gizmo)
    owner.metadata = {
      type: 'ris',
      risId: timestamp,
      placedOn,
      blocksSignal: true,
    };
    
    // Align bottom of RIS panel to ground/building surface
    const childMeshes = risMesh.getChildMeshes ? risMesh.getChildMeshes() : [];
    this.attachMeshesToOwner(risMesh, childMeshes);
    this.reparentLooseChildrenToOwner(owner, (mesh) => {
      const meta = (mesh as any)?.metadata ?? {};
      const meshName = (mesh?.name ?? '').toLowerCase();
      return (
        meta.ownerMeshUniqueId === owner.uniqueId ||
        meshName.includes(`ris_panel_${timestamp}`.toLowerCase())
      );
    });
    let minY = Infinity;
    
    for (const m of childMeshes) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bb.minimumWorld.y);
    }
    
    if (minY !== Infinity) {
      owner.position.y += (point.y ?? owner.position.y) - minY;
    }
    
    // ===== Store Integration =====
    const scenePos = {
      x: owner.position.x,
      y: owner.position.y,
      z: owner.position.z,
    };
    const local = this.sceneWorldToFloorLocalRow(scenePos.x, scenePos.z);
    const defaultRisInit = await this.resolveDefaultRisInitForSpawn();
    const risRow = this.fieldDomainStore.addIntelligentPanel({
      x: local.x,
      y: local.y,
      z: scenePos.y,
      position: { x: local.x, y: local.y, z: scenePos.y },
      risID: defaultRisInit.risID,
      risId: defaultRisInit.risID,
      profileID: defaultRisInit.profileID,
      profileId: defaultRisInit.profileID,
      insHorizontal: 0,
      installHorizontalAngle: 0,
      insVertical: 0,
      installVerticalAngle: 0,
      rxGain: 0,
      ownerMeshId: owner.uniqueId,
    });
    console.log('[COORD][Scene->Row]', {
      type: 'ris-or-ue',
      rowId: risRow.id,
      world: { x: scenePos.x, z: scenePos.z },
      rowXY: { x: local.x, y: local.y },
      path: local.path,
    });
    console.log('[RIS][DEFAULT_INIT]', {
      rowId: risRow.id,
      defaultRisID: defaultRisInit.risID,
      defaultProfileID: defaultRisInit.profileID,
    });

    console.log('[COORD][Spawn->Row]', {
      type: 'ris',
      scenePosition: scenePos,
      mathPosition: {
        x: risRow.x,
        y: risRow.y,
        z: risRow.z,
      },
    });
    
    // [Step2A][RisRegistry] Attach metadata and register
    this.attachFieldRowMetadata(owner, risRow.id);
    for (const m of childMeshes) {
      this.attachFieldRowMetadata(m, risRow.id);
    }
    console.log('[FieldStore][IntelligentPanel][RIS] added row', risRow);
    this.registerSceneObjectForFieldRow(
      risRow.id,
      'intelligentPanel',
      owner,
      risMesh as any,  // risMesh is TransformNode, cast to work with helper
      'ris',
      'ris_panel'
    );

    
    this.finalizeOwnerHierarchy(
      owner,
      risRow.id,
      'intelligentPanel',
      'ris',
      'spawnRISAt'
    );

    // ✅ ✅ ✅ 就加在這裡（最尾端）
    for (const m of owner.getChildMeshes(false)) {
      m.scaling.set(1, 1, 1);
    }

    owner.scaling.set(0.5, 0.5, 0.5); // ← 你調大小的地方
    
    this.debugFieldStore('IntelligentPanel-RIS');
    
    console.log('[RIS][Spawn] completed', {
      placedOn,
      x: owner.position.x,
      y: owner.position.y,
      z: owner.position.z,
      panelSize: '6×4×0.5',
    });
  }

  private async resolveDefaultRisInitForSpawn(): Promise<{
    risID: number | null;
    profileID: number | null;
  }> {
    const session = this.resolvePhase1SessionId();
    if (!session) {
      console.warn('[RIS][DEFAULT_INIT] missing session, keep null defaults');
      return { risID: null, profileID: null };
    }

    try {
      const risRows = await firstValueFrom(
        this.http.get<any[]>(`/son/getRis/${session}`)
      );
      const firstRis = (risRows ?? [])[0];
      const risIDRaw = firstRis?.risID;
      const risID = Number.isFinite(Number(risIDRaw)) ? Number(risIDRaw) : null;
      if (risID == null) {
        console.warn('[RIS][DEFAULT_INIT] no available RIS, keep null defaults');
        return { risID: null, profileID: null };
      }

      const profileRows = await firstValueFrom(
        this.http.get<any[]>(`/son/getRisProfiles/${risID}/${session}`)
      );
      const firstProfile = (profileRows ?? [])[0];
      const profileIDRaw = firstProfile?.profileID;
      const profileID = Number.isFinite(Number(profileIDRaw)) ? Number(profileIDRaw) : null;
      if (profileID == null) {
        console.warn('[RIS][DEFAULT_INIT] no available profile for RIS, keep profileID null', { risID });
      }

      return { risID, profileID };
    } catch (err) {
      console.warn('[RIS][DEFAULT_INIT] failed to resolve defaults, keep null defaults', err);
      return { risID: null, profileID: null };
    }
  }

  // -------------------- End Phase 4: RIS spawn helpers --------------------


  // -------------------- Phase 4.3: Mesh Empowerment (Pick + Minimal Metadata) --------------------
  private empowerCommittedMapMeshes(): void {
    if (!this.committedMapData) {
      console.warn('[Phase4.3] empower aborted: no committedMapData');
      return;
    }

    // 1) Ground
    const ground = this.committedMapData.ground as any;
    if (ground) {
      ground.isPickable = true;
      ground.metadata = {
        ...(ground.metadata ?? {}),
        type: 'ground',
        stageBase: 'committed',
      };
    }

    // 2) Buildings
    const buildingsRoot = this.committedMapData.buildingsRoot as any;
    if (!buildingsRoot) {
      console.warn('[Phase4.3] empower: no buildingsRoot in committedMapData');
      return;
    }

    // Traverse children meshes under buildingsRoot
    const children = buildingsRoot.getChildMeshes ? buildingsRoot.getChildMeshes() : [];
    for (const m of children) {
      // 不在 Phase 4 改材質/渲染，只開 pick 與 metadata
      m.isPickable = true;

    // -------------------- Phase 4 Mesh Empowerment (Buildings) --------------------
    // 1) Ensure material renders both sides for later ray exit detection (Phase 5)
    const mat: any = (m as any).material;
    if (mat) {
      // MultiMaterial case (array-like) or single material
      if (Array.isArray(mat)) {
        for (const subMat of mat) {
          if (subMat && typeof subMat.backFaceCulling === 'boolean') {
            subMat.backFaceCulling = false;
          }
        }
      } else {
        if (typeof mat.backFaceCulling === 'boolean') {
          mat.backFaceCulling = false;
        }
      }
    }

    // 2) Preserve existing metadata; only default missing fields
    const existingMeta: any = (m as any).metadata ?? {};

    // Try to keep any existing height key that generator already provided
    const heightCandidate =
      existingMeta.height ??
      existingMeta.osmHeight ??
      existingMeta.buildingHeight ??
      existingMeta.h ??
      null;

    // Default attenuationDB to 0 only if not set
    const attenuation =
      typeof existingMeta.attenuationDB === 'number' ? existingMeta.attenuationDB : 0;

    // Preserve original type for debugging / tracing
    const originalType = existingMeta.type ?? null;

    // Normalize to Phase 4 spec: building meshes must use type='building'
    (m as any).metadata = {
      ...existingMeta,
      originalType,              // 新增：保留來源 type（例如 'osm_building'）
      type: 'building',          // 修改：強制規格化
      height: heightCandidate,
      attenuationDB: attenuation,
      stageBase: existingMeta.stageBase ?? 'committed',
    };
    
    }

    console.log('[Phase4.3] empowered committed meshes', {
      groundPickable: !!ground?.isPickable,
      buildingsCount: children.length,
    });
  }

onModelButtonClick(shape: any): void {
  // Phase 2.2: entering placement closes editing
  if (this.phase2EditingOwner) {
    this.phase2ExitEditing();
  }

  // Single-shot safety: changing mode cancels any pending click intent
  this.phase4SingleShot = null;

  if (this.stage !== 'edit') {
    console.log('[Phase4][PlacementMode][Model] ignored (not in edit stage)', {
      stage: this.stage,
      shape,
    });
    return;
  }

  // -------------------- Phase 4: Identify model key --------------------
  const key =
    typeof shape === 'string'
      ? shape
      : (
          shape?.id ??
          shape?.type ??
          shape?.key ??
          shape?.name ??
          shape?.value ??
          shape?.modelId ??
          shape?.modelKey ??
          shape?.kind ??
          shape?.code ??
          ''
        );

  const resolvedKey = (key ?? '').toString().trim();
  
  if (
    this.goalMode === 'simulation' &&
    (resolvedKey === 'antenna_placeable' || resolvedKey === 'ris_placeable')
  ) {
    console.warn('[Phase4][PlacementMode][Model] blocked in simulation', {
      resolvedKey,
      goalMode: this.goalMode,
    });
    return;
  }

  // Toggle: clicking the active button again cancels placement mode
  if (this.phase4PendingItemId === resolvedKey && this.placementMode !== 'none') {
    this.placementMode = 'none';
    this.phase4PendingItemId = null;
    this.phase4SingleShot = null;
    return;
  }

  // 記住 pending item id（景觀物件會用到；其他也留作 debug）
  this.phase4PendingItemId = resolvedKey;

  // 規則：
  // - das_antenna  → antenna（優先級高）
  // - antenna_*  → antenna
  // - terminal_* / phone_* → terminal
  // - tree / landscape_* → landscape
  // - ris_* → ris
  if (resolvedKey === 'das_antenna' || resolvedKey.startsWith('das_antenna')) {
    this.placementMode = 'antenna';
    this.phase4PendingItemId = 'das_antenna';
  } else if (resolvedKey.startsWith('antenna')) {
    this.placementMode = 'antenna';
  } else if (resolvedKey.startsWith('terminal') || resolvedKey.startsWith('phone')) {
    this.placementMode = 'terminal';
  } else if (resolvedKey === 'tree' || resolvedKey.startsWith('landscape')) {
    this.placementMode = 'landscape';
  } else if (resolvedKey.startsWith('ris')) {
    // RIS panel and placeable markers all use 'ris' mode
    this.placementMode = 'ris';
  } else {
    // unknown：仍保留完整 log，方便未來擴充
    try {
      console.warn('[Phase4][PlacementMode][Model] unknown model key', {
        resolvedKey,
        rawShapeType: typeof shape,
        rawShape: shape,
        rawShapeJSON: JSON.stringify(shape),
      });
    } catch {
      console.warn('[Phase4][PlacementMode][Model] unknown model key (json failed)', {
        resolvedKey,
        rawShapeType: typeof shape,
        rawShape: shape,
      });
    }
    this.phase4PendingItemId = null;
    return;
  }

  console.log('[Phase4][PlacementMode][Model]', {
    stage: this.stage,
    resolvedKey,
    placementMode: this.placementMode,
    pendingItemId: this.phase4PendingItemId,
  });

  // Entering placement mode should cancel Phase 2 click-chain
  this.phase2LastClickAt = 0;
  this.phase2LastClickPickId = null;
  this.phase2SelectedOwner = null;

  // -------------------- End Phase 4: Placement Mode mapping --------------------
}
  
  public onPlanningModeCommitted(evt: PlanningModeCommittedEvent): void {
    this.goalMode = evt.toGoalMode;
  
    if (this.goalMode === 'simulation') {
      if (this.phase2EditingOwner) {
        this.phase2ExitEditing();
      }
  
      this.placementMode = 'none';
      this.phase4PendingItemId = null;
      this.phase4SingleShot = null;
      this.clearPlaceableInstallLocations('goal-mode-switch');
    }
  }
  
  private clearPlaceableInstallLocations(reason: string): void {
    if (!this.scene) return;
    const meshes = this.scene.meshes.slice();
    let disposed = 0;
  
    for (const mesh of meshes) {
      const meshType = (mesh as any)?.metadata?.type;
      const name = mesh?.name ?? '';
      const isPlaceableType = meshType === 'antenna_placeable' || meshType === 'ris_placeable';
      const isPlaceableName =
        name.startsWith('antenna_placeable') || name.startsWith('ris_placeable');
  
      if (isPlaceableType || isPlaceableName) {
        try {
          mesh.dispose(false, true);
        } catch {
          try {
            mesh.dispose();
          } catch {}
        }
        disposed += 1;
      }
    }
  
    console.log('[GoalMode][Cleanup] cleared placeable install locations', { reason, disposed });
  }

// ===== [PHASE4][STEP4-2A][BS-PERF-HELPERS] =====
get bsPerfTotalUe(): number {
  const rows = this.resultService.resultMvp()?.analysis?.bsPerformance ?? [];
  return rows.reduce((sum, r) => sum + (r.servedUe ?? 0), 0);
}

get bsPerfAvgDl(): number | null {
  const rows = this.resultService.resultMvp()?.analysis?.bsPerformance ?? [];
  if (!rows.length) return null;

  const sum = rows.reduce((acc, r) => acc + (r.avgThroughputMbps ?? 0), 0);
  return sum / rows.length;
}

// ===== [PHASE4][STEP4-2B][BS-PERF-TOTALS] =====

// Estimated total DL = sum(servedUe * avgThroughputMbps)
get bsPerfTotalDlMbps(): number | null {
  const rows = this.resultService.resultMvp()?.analysis?.bsPerformance ?? [];
  if (!rows.length) return null;

  const total = rows.reduce((sum, r) => {
    const ue = r.servedUe ?? 0;
    const avg = r.avgThroughputMbps ?? 0;
    return sum + ue * avg;
  }, 0);

  return total;
}

// Weighted avg DL by servedUe = sum(ue * avg) / sum(ue)
get bsPerfWeightedAvgDlMbps(): number | null {
  const rows = this.resultService.resultMvp()?.analysis?.bsPerformance ?? [];
  if (!rows.length) return null;

  const totalUe = rows.reduce((sum, r) => sum + (r.servedUe ?? 0), 0);
  if (!totalUe) return null;

  const totalDl = rows.reduce((sum, r) => {
    const ue = r.servedUe ?? 0;
    const avg = r.avgThroughputMbps ?? 0;
    return sum + ue * avg;
  }, 0);

  return totalDl / totalUe;
}

  // ===== [BANNER_TOOLBAR] 熱力圖控制工具列事件處理 =====
  // 目的：接收 Banner 組件的工具列事件並更新 3D 場景
  // =====================================================

  // ===== [RESULT->EDIT] Back to edit mode (UI + scene cleanup) =====
  public onBackToEditMode(): void {
    console.log('[BackToEditMode]');

    // ★ 正確方式：呼叫 service 提供的 reset
    this.resultService.resetToEdit();

    // 關閉左右 panel（你需求說要關）
    this.leftToolType = null;
    this.rightPanelType = null;

    // UI 清理（避免殘留）
    this.tooltipVisible = false;
    this.isMenuVisible = false;
    this.isPropertiesMode = false;

    // editor state reset
    this.editorMode = 'view';
    this.isPlacingObject = false;
    this.isGizmoDragging = false;

    // 解除 gizmo attach
    try {
      this.gizmoManager?.attachToMesh(null as any);
    } catch {}

    console.log('[BackToEditMode] done');
  }


  private parseSliceHeightOptionsFromCompleteCalcResult(result: any): number[] {
    const candidates: number[] = [];

    const rawInputZ = result?.input?.zValue;
    if (typeof rawInputZ === 'string' && rawInputZ.trim() !== '') {
      try {
        const parsed = JSON.parse(rawInputZ);
        if (Array.isArray(parsed)) {
          for (const v of parsed) {
            const n = Number(v);
            if (Number.isFinite(n)) candidates.push(n);
          }
        }
      } catch (err) {
        console.warn('[SliceHeight] failed to parse input.zValue', rawInputZ, err);
      }
    }

    const fieldStats = result?.['5GOutput']?.fieldStatistics?.data;
    if (Array.isArray(fieldStats)) {
      for (const row of fieldStats) {
        const n = Number(row?.zValue);
        if (Number.isFinite(n)) candidates.push(n);
      }
    }

    const subStats = result?.['5GOutput']?.subfieldStatistics;
    if (Array.isArray(subStats)) {
      for (const row of subStats) {
        const n = Number(row?.zValue);
        if (Number.isFinite(n)) candidates.push(n);
      }
    }

    return Array.from(new Set(candidates)).sort((a, b) => a - b);
  }

  onSliceHeightChange(nextHeight: number): void {
    this.sliceHeight = Number(nextHeight);
    this.heatmapSliceHeight = this.sliceHeight;
    console.log('[Heatmap][SliceHeight] changed', this.sliceHeight);

    if (!this.completeCalcResult) {
      console.warn('[Heatmap][SliceHeight] completeCalcResult not ready');
      return;
    }

    this.rerenderHeatmapByCurrentControls();
  }


  onHeatmapModeChange(mode: string): void {
    const normalizedMode: DistributionMode =
      mode === 'rsrp' ||
      mode === 'sinr' ||
      mode === 'ul_rate' ||
      mode === 'dl_rate' ||
      mode === 'coverage'
        ? mode
        : 'rsrp';

    this.distMode = normalizedMode;
    this.heatmapMode = normalizedMode;
    this.heatmapCurrentMode = normalizedMode;

    if (this.distMode === 'coverage') {
      this.showPlotlyHeatmapPlaneAndColorbar();
      this.hidePlotlyColorbarOnly();
      this.rerenderHeatmapByCurrentControls();
      return;
    }

    this.showPlotlyHeatmapPlaneAndColorbar();
    this.showPlotlyColorbarHost();
    this.disposeCoverageOverlay();
    this.rerenderHeatmapByCurrentControls();
  }

  onViewFiltersChange(filters: any): void {
    console.log('[ViewFilter][Incoming]', filters);
    this.viewFilters = { ...this.viewFilters, ...filters };
    this.applyViewFiltersToScene();
  }

  private applyViewFiltersToScene(): void {
    console.log('[ViewFilter][Apply]', this.viewFilters);
    this.setUeVisible(this.viewFilters.showTerminals);
    this.setObstaclesVisible(this.viewFilters.showObstacles);
    this.setExistingBsVisible(this.viewFilters.showAntennas);
    this.setObserveZonesVisible(this.viewFilters.showObserveZones);
    this.setCustomRegionsVisible(this.viewFilters.showCustomRegions);
  }

  private setRegistryCategoryVisible(category: RegistryCategory, visible: boolean): void {
    let matchedCount = 0;
    for (const entry of this.sceneObjectRegistry.values()) {
      if (entry?.category !== category) continue;
      matchedCount += 1;
      try {
        entry.ownerNode?.setEnabled?.(visible);
      } catch {}
    }
    console.log('[ViewFilter][RegistryCategoryToggle]', { category, visible, matchedCount });
  }

  private setUeVisible(visible: boolean): void {
    this.setRegistryCategoryVisible('ue', visible);
  }

  private setExistingBsVisible(visible: boolean): void {
    this.setRegistryCategoryVisible('existingBs', visible);
  }

  private setObserveZonesVisible(visible: boolean): void {
    this.setRegistryCategoryVisible('observe', visible);
  }

  private setCustomRegionsVisible(visible: boolean): void {
    this.setRegistryCategoryVisible('zone', visible);
  }

  private setObstaclesVisible(visible: boolean): void {
    this.setRegistryCategoryVisible('obstacle', visible);
  }

  onCoverageThresholdChange(threshold: string): void {
    console.log('[Banner] 覆蓋圖閾值已變更:', threshold);
    const normalizedThreshold: CoverageFilter =
      threshold === 'rsrp_minus_120' || threshold === 'rsrp_minus_90' || threshold === 'sinr_15'
        ? threshold
        : 'rsrp_minus_120';

    this.coverageThreshold = normalizedThreshold;

    if (this.distMode !== 'coverage') {
      return;
    }

    this.rerenderHeatmapByCurrentControls();
  }

  private ensureCoverageOverlayRoot(): TransformNode {
    if (!this.coverageOverlayRoot) {
      this.coverageOverlayRoot = new TransformNode('coverage_overlay_root', this.scene);
    }
    return this.coverageOverlayRoot;
  }

  private disposeCoverageOverlay(): void {
    for (const entry of this.coverageOverlayMap.values()) {
      entry.mesh.dispose(false, true);
    }
    this.coverageOverlayMap.clear();

    if (this.coverageOverlayRoot) {
      this.coverageOverlayRoot.dispose(false, true);
      this.coverageOverlayRoot = null;
    }
  }

  private rebuildCoverageOverlay(): void {
    if (!this.scene) {
      return;
    }

    this.disposeCoverageOverlay();
    const root = this.ensureCoverageOverlayRoot();

    const antennas = this.scene.meshes.filter(mesh => mesh.metadata?.type === 'antenna');
    if (antennas.length === 0) {
      console.warn('[Coverage] no antennas for overlay');
      return;
    }

    const palette = ['#ff5f5f', '#5fd1ff', '#7bff7b', '#ffd45f', '#b48bff', '#ff8bd1'];

    const noiseAt = (seed: number): number => {
      const value = Math.sin(seed * 12.9898) * 43758.5453;
      const frac = value - Math.floor(value);
      return (frac - 0.5) * 2.0;
    };

    antennas.forEach((antenna, idx) => {
      console.log('[Coverage][DBG] antenna', {
        idx,
        name: antenna.name,
        uniqueId: antenna.uniqueId,
        pos: antenna.getAbsolutePosition().toString?.() ?? antenna.getAbsolutePosition(),
      });

      const antennaPos = antenna.getAbsolutePosition();
      const disc = MeshBuilder.CreateDisc(
        `coverage_overlay_${antenna.uniqueId}`,
        { radius: 1, tessellation: 48 },
        this.scene
      );

      console.log('[Coverage][DBG] disc created (pre-transform)', {
        discName: disc.name,
        pos: disc.position.toString?.() ?? disc.position,
        y: disc.position.y,
        enabled: disc.isEnabled(),
        scaling: disc.scaling.toString?.() ?? disc.scaling,
        mat: disc.material ? disc.material.name : null,
      });

      disc.parent = root;
      // 不要設定 rotation，CreateDisc 預設就是 XZ 平面
      disc.rotation.set(0, 0, 0);

      disc.position.set(antennaPos.x, (this.floorMesh?.getAbsolutePosition().y ?? 0) + 0.08, antennaPos.z);
      disc.isPickable = false;
      disc.renderingGroupId = 2;
      disc.alwaysSelectAsActiveMesh = true;

      console.log('[Coverage][DBG] disc positioned', {
        discName: disc.name,
        pos: disc.position.toString?.() ?? disc.position,
        y: disc.position.y,
        rotation: disc.rotation.toString?.() ?? disc.rotation,
        scaling: disc.scaling.toString?.() ?? disc.scaling,
      });

      disc.metadata = { ...(disc.metadata ?? {}), type: 'coverage_overlay' };

      const material = new StandardMaterial(`coverage_overlay_mat_${antenna.uniqueId}`, this.scene);
      material.disableLighting = true;
      material.alpha = 0.28;
      material.backFaceCulling = false;
      material.diffuseColor = Color3.FromHexString(palette[idx % palette.length]);
      material.emissiveColor = Color3.FromHexString(palette[idx % palette.length]);
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.zOffset = -2;
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.zOffset = -4;                 // 更強的「浮到前面」
      material.forceDepthWrite = false;      // 不要寫 depth（避免把自己或別人吃掉）


      disc.material = material;
      disc.renderingGroupId = 2;             // 確保比地面晚畫
      disc.alwaysSelectAsActiveMesh = true;  // 避免被 cull

      const floorY = this.floorMesh?.getAbsolutePosition().y ?? 0;
      disc.position.y = floorY + 0.15;  // 0.08 -> 0.15 (更保險)

      console.log('[Coverage][DBG] disc material ready', {
        discName: disc.name,
        mat: disc.material?.name ?? null,
        alpha: (disc.material as StandardMaterial)?.alpha,
      });

      const noiseSeed = antenna.uniqueId || idx + 1;
      const rsrpRep = -80 - idx * 12 + noiseAt(noiseSeed) * 1.5;
      const sinrRep = 22 - idx * 4 + noiseAt(noiseSeed + 31) * 0.8;

      this.coverageOverlayMap.set(String(antenna.uniqueId), { mesh: disc, rsrpRep, sinrRep });
    });
  }

  private applyCoverageThreshold(): void {
    const threshold = this.coverageThreshold;
    let radius = 350;

    if (threshold === 'rsrp_minus_90') {
      radius = 220;
    }

    if (threshold === 'sinr_15') {
      radius = 140;
    }

    for (const entry of this.coverageOverlayMap.values()) {
      const meetsRsrp120 = entry.rsrpRep >= -120;
      const meetsRsrp90 = entry.rsrpRep >= -90;
      const meetsSinr15 = entry.sinrRep >= 15;

      let visible = meetsRsrp120;
      if (threshold === 'rsrp_minus_90') {
        visible = meetsRsrp90;
      }
      if (threshold === 'sinr_15') {
        visible = meetsSinr15;
      }

      entry.mesh.scaling.x = radius;
      entry.mesh.scaling.z = radius;
      entry.mesh.setEnabled(visible);
    }

    console.log('[Coverage][DBG] apply threshold', {
      threshold: this.coverageThreshold,
    });

    this.coverageOverlayMap.forEach((entry, key) => {
      console.log('[Coverage][DBG] overlay before scale', {
        key,
        enabled: entry.mesh.isEnabled(),
        scaling: entry.mesh.scaling.toString?.() ?? entry.mesh.scaling,
      });
    });

  }

  onDynamicRangeChange(range: any): void {
    console.log('[Banner] 動態範圍已確認:', range);
    if (this.distMode === 'coverage') {
      return;
    }

    const min = Number(range?.min);
    const max = Number(range?.max);

    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      console.warn('[Banner] 動態範圍參數無效:', range);
      return;
    }

    this.committedRangeByMode[this.distMode] = { min, max };
    this.rerenderHeatmapByCurrentControls();
  }

  private rerenderHeatmapByCurrentControls(): void {
    if (!this.completeCalcResult) return;

    const matrix = this.resolveHeatmapMatrixByModeAndHeight(
      this.completeCalcResult,
      this.distMode,
      this.sliceHeight
    );

    if (!matrix) {
      console.warn('[Heatmap][Render] matrix not found', {
        mode: this.distMode,
        sliceHeight: this.sliceHeight,
      });
      return;
    }

    console.log('[Heatmap][Rerender]', {
      mode: this.distMode,
      sliceHeight: this.sliceHeight,
    });

    // 接回你原本既有的 Plotly render 流程
    void this.requestHeatmapRerender('mode');
  }

  private async requestHeatmapRerender(reason: 'mode' | 'confirm' | 'coverage-threshold'): Promise<void> {
    void reason;
    this.showPlotlyHeatmapPlaneAndColorbar();
    if (this.distMode === 'coverage') {
      this.hidePlotlyColorbarOnly();
    }

    if (this.distMode === 'coverage') {
      this.heatmapMinValue = 0;
      this.heatmapMaxValue = 1;
    } else {
      const range = this.committedRangeByMode[this.distMode] ?? this.committedRangeByMode.rsrp;
      this.heatmapMinValue = range.min;
      this.heatmapMaxValue = range.max;
    }

    await this.runPlotlyHeatmapFlow();
    // Colorbar updates only from commitColorbarSnapshotForMode after heatmap/cache success
  }

  // ===== [HEATMAP:PLANE_CREATION] =====
  // 目的：建立與管理熱力圖平面 Mesh
  // 邏輯：
  //   1. 建立平面大小與 floorMesh 一致
  //   2. 設定 metadata.type = 'heatmap' 以供識別
  //   3. 設定 isPickable = false 防止干擾滑鼠點擊
  //   4. 位置設定在 sliceHeight 高度
  //   5. 建立半透明材質（alpha = 0.7）
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private ensureHeatmapPlane(): void {
    const scene = this.scene;
    if (!scene || !this.floorMesh) {
      console.warn('[HeatmapPlane] abort: scene or floorMesh missing');
      return;
    }

    // ✅ 取得 floorMesh 的 world space 邊界資訊，以確定平面大小
    const bb = this.floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const max = bb.maximumWorld;
    
    const sizeX = Math.abs(max.x - min.x);
    const sizeZ = Math.abs(max.z - min.z);

    // ✅ 若平面不存在，才建立一次；存在則只更新位置和尺寸
    if (!this.heatmapPlane) {
      this.heatmapPlane = MeshBuilder.CreateGround(
        'heatmap_plane',
        { width: sizeX, height: sizeZ, subdivisions: 10 },
        scene
      );

      // ✅ 安全設定 2：設定 metadata，以供後續識別
      (this.heatmapPlane as any).metadata = {
        type: 'heatmap',
        purpose: 'signal_visualization',
        isPickable: false
      };

      // ✅ 安全設定 3：防止平面干擾滑鼠點擊（關鍵！）
      this.heatmapPlane.isPickable = false;

      // ✅ 避免深度遮擋：提高渲染順序
      this.heatmapPlane.renderingGroupId = 2;

      // ✅ 建立材質並設定為純發射光模式（避免白色過曝和網格線）
      const heatmapMaterial = new StandardMaterial('heatmap_material', scene);
      
      // 設定顏色為純黑（由紋理完全控制）
      heatmapMaterial.diffuseColor = Color3.Black();
      heatmapMaterial.emissiveColor = Color3.Black();
      heatmapMaterial.specularColor = Color3.Black();  // 禁用鏡面反射
      heatmapMaterial.ambientColor = Color3.Black();   // 禁用環境光反射
      
      // 禁用照明，避免環境光干擾
      heatmapMaterial.disableLighting = true;
      
      // 移除網格線
      heatmapMaterial.wireframe = false;
      
      // 雙面渲染
      heatmapMaterial.backFaceCulling = false;
      
      // 半透明
      heatmapMaterial.alpha = 0.85;
      
      // ✅ 禁用深度寫入以確保可見性
      (heatmapMaterial as any).disableDepthWrite = true;
      
      // ✅ 確保只用一張 DynamicTexture（首次建立）
      if (!this.heatmapDynTexture) {
        this.heatmapDynTexture = new DynamicTexture(`heatmap_dyn_tex`, this.heatmapTexW, scene);
      }
      heatmapMaterial.emissiveTexture = this.heatmapDynTexture;
      
      this.heatmapPlane.material = heatmapMaterial;
    } else {
      // ✅ 平面已存在，只更新位置和尺寸（重用模式）
      this.heatmapPlane.scaling.x = sizeX / 1; // normalize to 1
      this.heatmapPlane.scaling.z = sizeZ / 1;
    }

    // ✅ 安全設定 1：設定中心位置與地面一致（每次都更新，確保跟隨切面高度）
    this.heatmapPlane.position.x = (min.x + max.x) / 2;
    this.heatmapPlane.position.z = (min.z + max.z) / 2;
    this.heatmapPlane.position.y = this.heatmapSliceHeight;

    console.log('[HeatmapPlane] 平面已確保 ✓', {
      位置_X: this.heatmapPlane.position.x,
      位置_Z: this.heatmapPlane.position.z,
      高度_Y: this.heatmapPlane.position.y,
      大小_X: sizeX,
      大小_Z: sizeZ,
      renderingGroupId: this.heatmapPlane.renderingGroupId,
      isPickable: this.heatmapPlane.isPickable,
      disableLighting: (this.heatmapPlane.material as any)?.disableLighting,
      emissiveTexture: !!(this.heatmapPlane.material as any)?.emissiveTexture
    });
  }

  private hidePlotlyHeatmapPlaneAndColorbar(): void {
    if (!this.heatmapPlane && this.scene) {
      const existing = this.scene.getMeshByName('plotly_heatmap_plane');
      if (existing) {
        this.heatmapPlane = existing as Mesh;
      }
    }

    if (this.heatmapPlane) {
      this.heatmapPlane.setEnabled(false);
    }

    const host = this.plotlyColorbarHostRef?.nativeElement;
    if (host) {
      host.style.display = 'none';
    }
  }

  private hidePlotlyColorbarOnly(): void {
    console.log('[COLORBAR_TRACE][2026-04-02-B] hidePlotlyColorbarOnly entered', {
      distMode: this.distMode,
      displayBefore: this.plotlyColorbarHostRef?.nativeElement?.style?.display,
    });
    const host = this.plotlyColorbarHostRef?.nativeElement as HTMLElement | undefined;
    if (!host) return;
    host.style.display = 'none';
    host.innerHTML = '';
  }

  private showPlotlyHeatmapPlaneAndColorbar(): void {
    if (!this.heatmapPlane && this.scene) {
      const existing = this.scene.getMeshByName('plotly_heatmap_plane');
      if (existing) {
        this.heatmapPlane = existing as Mesh;
      }
    }

    if (this.heatmapPlane) {
      this.heatmapPlane.setEnabled(true);
    }

    const host = this.plotlyColorbarHostRef?.nativeElement;
    if (host) {
      console.log('[COLORBAR_TRACE][2026-04-02-B] showPlotlyHeatmapPlaneAndColorbar -> show colorbar host', {
        distMode: this.distMode,
        displayBefore: this.plotlyColorbarHostRef?.nativeElement?.style?.display,
      });
      host.style.display = 'block';
    }
  }

  private showPlotlyColorbarHost(): void {
    console.log('[COLORBAR_PATCH_ACTIVE_FILE][2026-04-02-A] showPlotlyColorbarHost entered');
    const host = this.plotlyColorbarHostRef?.nativeElement as HTMLElement | undefined;
    if (!host) return;
    host.style.display = 'block';
  }

  private renderPlotlyColorbar(): void {
    console.log('[COLORBAR_PATCH_ACTIVE_FILE][2026-04-02-A] renderPlotlyColorbar entered');
    const host = this.plotlyColorbarHostRef?.nativeElement;
    if (!host) {
      return;
    }

    if (this.distMode === 'coverage') {
      console.log('[COLORBAR_TRACE][2026-04-02-B] renderPlotlyColorbar coverage branch -> hide host', {
        distMode: this.distMode,
        displayBefore: host.style.display,
      });
      host.style.display = 'none';
      return;
    }

    this.showPlotlyColorbarHost();

    let min: number;
    let max: number;
    let title: string;
    let colorscale: any;

    if (this.currentRenderedColorbarState) {
      const s = this.currentRenderedColorbarState;
      min = s.min;
      max = s.max;
      title = s.title;
      colorscale =
        s.colorscale ??
        this.DIST_MODE_META[s.mode as keyof typeof this.DIST_MODE_META]?.colorscale;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][COLORBAR] render from snapshot', {
          mode: s.mode,
          min,
          max,
          unit: s.unit,
        });
      }
    } else {
      const meta = this.DIST_MODE_META[this.distMode];
      const range = this.committedRangeByMode[this.distMode];
      if (!meta || !range) {
        console.warn('[HEATMAP][COLORBAR] fallback aborted: missing meta/range', {
          distMode: this.distMode,
        });
        return;
      }
      min = range.min;
      max = range.max;
      title = meta.title;
      colorscale = meta.colorscale;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][COLORBAR] fallback to live state', {
          mode: this.distMode,
          min,
          max,
          unit: meta.unit,
        });
      }
    }

    const trace: any = {
      type: 'scatter',
      mode: 'markers',
      x: [0],
      y: [0],
      marker: {
        size: 0.001,
        color: [min],
        cmin: min,
        cmax: max,
        colorscale,
        showscale: true,
        colorbar: {
          thickness: 18, // 色條本體寬度（px），調大會更粗
          len: 0.6, // 色條佔容器高度比例（0~1）
          x: 0.55, // 色條在容器內的水平位置（0=最左，1=最右）
          xanchor: 'center', // x 的對齊基準：left | center | right
          y: 0.5, // 垂直置中（0=最下，1=最上）
          yanchor: 'middle',
          outlinewidth: 0, // 色條外框（0=不顯示外框）
          title: {
            text: title,
            font: { size: 10, color: '#ffffff' },
            side: 'right',
          },
          tickfont: { size: 8, color: '#ffffff' }, // 刻度文字大小（px）// 刻度文字顏色（白色，適合深色背景）
        }
      },
      hoverinfo: 'skip',
    };

    const layout: any = {
      margin: { l: 8, r: 8, t: 8, b: 8 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      xaxis: { visible: false, fixedrange: true },
      yaxis: { visible: false, fixedrange: true },
      showlegend: false,
    };

    const config: any = {
      staticPlot: true,
      displayModeBar: false,
      responsive: true,
    };

    const plotly = Plotly as any;
    if (!plotly?.newPlot) {
      return;
    }

    host.style.display = 'block';
    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][COLORBAR] host forced visible', {
        distMode: this.distMode,
        display: host.style.display,
      });
      console.log('[COLORBAR_TRACE][2026-04-02-B] renderPlotlyColorbar non-coverage branch -> about to newPlot', {
        distMode: this.distMode,
        displayBefore: host.style.display,
      });
    }

    if (typeof plotly.purge === 'function') {
      plotly.purge(host);
    }
    host.innerHTML = '';

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][COLORBAR] rebuild with newPlot', {
        distMode: this.distMode,
      });
    }

    const plotResult = plotly.newPlot(host, [trace], layout, config);

    const scheduleResize = (): void => {
      requestAnimationFrame(() => {
        if (plotly.Plots?.resize) {
          plotly.Plots.resize(host);
        }
      });
    };

    if (plotResult && typeof plotResult.then === 'function') {
      void plotResult.then(scheduleResize);
    } else {
      scheduleResize();
    }
  }

  private refreshColorbarFromHeatmapState(): void {
    if (!this.isSimulationDone) return;
    this.renderPlotlyColorbar();
  }

  // ===== [HEATMAP:TEXTURE_RENDERING] =====
  // 目的：更新熱力圖紋理，將 gridDataBuffer 數值轉換為顏色
  // 邏輯：
  //   1. 建立黑色背景動態紋理
  //   2. 遍歷 gridDataBuffer 取得 SINR/RSRP 值
  //   3. 使用精確座標對齊：(point - floorMin) / floorSize
  //   4. 使用 context.fillRect 繪製像素
  //   5. 套用紋理到發射貼圖（禁用照明）
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private updateHeatmapTexture(): void {
    if (!this.heatmapPlane || !this.gridDataBuffer || !this.simulationGrid.length) {
      console.warn('[HeatmapTexture] abort: missing plane, buffer, or grid');
      return;
    }

    const scene = this.scene;
    if (!scene) return;

    // ✅ 確保 DynamicTexture 已建立
    if (!this.heatmapDynTexture) {
      this.ensureHeatmapPlane();
    }

    if (!this.heatmapDynTexture) {
      console.error('[HeatmapTexture] abort: cannot ensure heatmapDynTexture');
      return;
    }

    const dyn = this.heatmapDynTexture;
    const texW = this.heatmapTexW;
    const texH = this.heatmapTexH;
    const ctx = dyn.getContext();

    // ✅ 每次更新都先清空 canvas
    ctx.clearRect(0, 0, texW, texH);

    // 步驟 1：計算本次 values 的 min/max
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;

    for (const val of this.gridDataBuffer) {
      if (val > -Infinity && !isNaN(val)) {
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
      }
    }

    // ✅ 動態值域映射，加 clamp 以避免極端值
    const clampMin = -140;
    const clampMax = -30;

    minVal = Math.max(minVal, clampMin);
    maxVal = Math.min(maxVal, clampMax);

    // 若 maxVal - minVal 太小，fallback 到預設範圍
    if (maxVal - minVal < 1e-6) {
      minVal = clampMin;
      maxVal = clampMax;
    }

    console.log('[HeatmapTexture] 紋理更新開始', {
      模式: this.heatmapCurrentMode,
      色階最小值: minVal.toFixed(2),
      色階最大值: maxVal.toFixed(2),
      色階範圍: `動態 (${(maxVal - minVal).toFixed(2)} dB)`,
      格點總數: this.gridDataBuffer.length,
      紋理解析度: `${texW}x${texH}`
    });

    // 步驟 2：取得地板邊界，確保座標對齐
    // ✅ 使用 world space bounding box 確保座標一致
    const bb = this.floorMesh!.getBoundingInfo().boundingBox;
    const floorMinX = bb.minimumWorld.x;
    const floorMinZ = bb.minimumWorld.z;
    const floorMaxX = bb.maximumWorld.x;
    const floorMaxZ = bb.maximumWorld.z;
    
    const sizeX = floorMaxX - floorMinX;
    const sizeZ = floorMaxZ - floorMinZ;

    console.log('[HeatmapTexture] 地板邊界', {
      minX: floorMinX.toFixed(2),
      minZ: floorMinZ.toFixed(2),
      maxX: floorMaxX.toFixed(2),
      maxZ: floorMaxZ.toFixed(2),
      sizeX: sizeX.toFixed(2),
      sizeZ: sizeZ.toFixed(2)
    });

    // 步驟 4：遍歷 gridDataBuffer 並繪製顏色
    let coloredPixels = 0;
    let firstGridPoint: { index: number; worldCoord: Vector3; texCoord: { x: number; y: number }; color: string } | null = null;

    // --- DBG-HM: strongest point tracking ---
    let dbgStrongestValue = Number.NEGATIVE_INFINITY;
    let dbgStrongestPoint: Vector3 | null = null;
    // --- end DBG ---

    for (let i = 0; i < this.gridDataBuffer.length; i++) {
      const point = this.simulationGrid[i];
      const value = this.gridDataBuffer[i];

      // 跳過無效值
      if (value <= -Infinity || isNaN(value)) {
        continue;
      }

      // --- DBG-HM: track strongest point ---
      if (value > dbgStrongestValue) {
        dbgStrongestValue = value;
        dbgStrongestPoint = point.clone();
      }
      // --- end DBG ---

      // 正規化到 [0, 1]
      let normalized = (value - minVal) / (maxVal - minVal);
      normalized = Math.max(0, Math.min(1, normalized)); // 夾限到 [0, 1]

      // 取得顏色（藍→紅 漸層）
      const color = this.getHeatmapColor(normalized);

      // ✅ 驗證顏色格式
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        console.warn('[HeatmapTexture] 無效顏色代碼:', color, '在格點', i);
        continue;
      }

      // ✅ 精確座標對齊：使用 (point - floorMin) / floorSize
      // 這確保世界座標與紋理像素精確對應
      const normX = (point.x - floorMinX) / sizeX;
      const normZ = (point.z - floorMinZ) / sizeZ;

      // 轉換為紋理像素座標
      const texX = Math.round(normX * (texW - 1));
      const texY = Math.round(normZ * (texH - 1));

      // 邊界檢查
      if (texX < 0 || texX >= texW || texY < 0 || texY >= texH) {
        continue;
      }

      // ✅ 記錄第一個格點以供調試
      if (!firstGridPoint) {
        firstGridPoint = {
          index: i,
          worldCoord: point.clone(),
          texCoord: { x: texX, y: texY },
          color: color
        };
      }

      // ✅ 繪製像素：使用 5x5 區域以完全填滿格點間隙，呈現平滑漸層
      // 注意：fillRect(x, y, w, h) 中 x,y 為左上角，w,h 為寬度和高度
      // 為了在座標附近繪製，我們偏移 -2 使點成為中心
      ctx.fillStyle = color;
      ctx.fillRect(texX - 2, texY - 2, 5, 5);
      coloredPixels++;
    }

    // ✅ 輸出第一個格點的調試信息
    if (firstGridPoint) {
      console.log('[HeatmapTexture] 第一個格點對應關係', {
        格點索引: firstGridPoint.index,
        世界座標: `(${firstGridPoint.worldCoord.x.toFixed(2)}, ${firstGridPoint.worldCoord.z.toFixed(2)})`,
        紋理像素: `(${firstGridPoint.texCoord.x}, ${firstGridPoint.texCoord.y})`,
        顏色: firstGridPoint.color
      });
    }

    console.log('[HeatmapTexture] 已繪製顏色像素:', coloredPixels, '個');

    // --- DBG-HM: 繪製最強點標記 (ENHANCED VISIBILITY) ---
    try {
      if (dbgStrongestPoint && this.floorMesh) {
        const bb = this.floorMesh.getBoundingInfo().boundingBox;
        const min = bb.minimumWorld;
        const max = bb.maximumWorld;

        const sizeX = Math.max(1e-6, max.x - min.x);
        const sizeZ = Math.max(1e-6, max.z - min.z);

        const nx = (dbgStrongestPoint.x - min.x) / sizeX;
        const nz = (dbgStrongestPoint.z - min.z) / sizeZ;

        const tx = Math.round(nx * (texW - 1));
        const ty = Math.round(nz * (texH - 1));

        // 先繪製黑色十字（底層，更寬更長以確保可見）
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fillRect(tx - 13, ty - 2, 25, 5);  // 水平線：長 25px，寬 5px
        ctx.fillRect(tx - 2, ty - 13, 5, 25);  // 垂直線：長 25px，寬 5px

        // 再繪製紫色十字（頂層，相同位置覆蓋，但顏色明亮）
        ctx.fillStyle = 'rgba(180, 0, 255, 1.0)';
        ctx.fillRect(tx - 13, ty - 2, 25, 5);
        ctx.fillRect(tx - 2, ty - 13, 5, 25);

        console.log('[DBG-HM] 最強點標記已繪製', {
          value: dbgStrongestValue.toFixed(2),
          world: dbgStrongestPoint,
          tx, ty
        });
      }
    } catch (e) {
      console.warn('[DBG-HM] 最強點標記繪製失敗', e);
    }
    // --- end DBG ---

    // --- DBG-HM: mark antenna projection on heatmap texture (temporary) ---
    try {
      const scene = this.scene;
      if (scene) {
        const nodes = this.p2_collectSignalNodes(scene);
        const antenna = nodes?.antennas?.[0] ?? null;

        if (antenna && this.floorMesh) {
          const bb = this.floorMesh.getBoundingInfo().boundingBox;
          const min = bb.minimumWorld;
          const max = bb.maximumWorld;

          const sizeX = Math.max(1e-6, max.x - min.x);
          const sizeZ = Math.max(1e-6, max.z - min.z);

          const ap = antenna.getAbsolutePosition?.() ?? antenna.position;

          const nx = (ap.x - min.x) / sizeX;
          const nz = (ap.z - min.z) / sizeZ;

          const tx = Math.round(nx * (texW - 1));
          const ty = Math.round(nz * (texH - 1));

          // draw white cross
          ctx.fillStyle = 'rgba(255,255,255,1.0)';
          ctx.fillRect(tx - 6, ty - 1, 13, 3);
          ctx.fillRect(tx - 1, ty - 6, 3, 13);

          console.log('[DBG-HM] antenna->texture', {
            world: ap,
            nx, nz,
            tx, ty,
            textureWidth: texW,
            textureHeight: texH
          });
        }
      }
    } catch (e) {
      console.warn('[DBG-HM] antenna mark failed', e);
    }
    // --- end DBG-HM ---

    // ✅ 步驟 4.5：明確刷新紋理（force = true 強制更新）
    this.heatmapDynTexture.update(true);

    // 步驟 5：套用紋理到平面材質（發射光模式）
    const heatmapMaterial = this.heatmapPlane.material as StandardMaterial;
    if (heatmapMaterial) {
      // ✅ 確保顏色完全由紋理控制（不受光線影響）
      heatmapMaterial.emissiveTexture = this.heatmapDynTexture;
      heatmapMaterial.emissiveColor = Color3.Black();
      heatmapMaterial.diffuseColor = Color3.Black();
      heatmapMaterial.specularColor = Color3.Black();
      heatmapMaterial.ambientColor = Color3.Black();
      heatmapMaterial.disableLighting = true;
      heatmapMaterial.wireframe = false;
      heatmapMaterial.alpha = 0.85;
      
      console.log('[HeatmapTexture] 材質設定完成', {
        紋理: 'heatmapDynTexture',
        wireframe: false,
        disableLighting: true,
        alpha: 0.85
      });
    }

    console.log('[HeatmapTexture] 紋理更新完成 ✓');
  }

  // ===== [HEATMAP:COLOR_MAPPING] =====
  // 目的：根據正規化值或 RSRP 取得顏色（藍→紅 漸層）
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private getHeatmapColor(rsrp: number, minVal: number, maxVal: number): { r: number; g: number; b: number };
  private getHeatmapColor(normalized: number): string;
  private getHeatmapColor(valueOrNormalized: number, minVal?: number, maxVal?: number): { r: number; g: number; b: number } | string {
    // 若傳入 3 個參數，進行重載：計算 normalized 後轉換為 RGB
    if (minVal !== undefined && maxVal !== undefined) {
      const normalized = (valueOrNormalized - minVal) / (maxVal - minVal);
      const clamped = Math.max(0, Math.min(1, normalized));

      // 藍 → 綠 → 紅 漸層
      let r = 0, g = 0, b = 0;
      if (clamped < 0.5) {
        // 藍 → 綠
        b = 255 * (1 - clamped * 2);
        g = 255 * (clamped * 2);
      } else {
        // 綠 → 紅
        g = 255 * (1 - (clamped - 0.5) * 2);
        r = 255 * ((clamped - 0.5) * 2);
      }

      return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    }

    // 單參數：原有邏輯，返回 hex 字符串
    const normalized = valueOrNormalized;
    // 藍 → 綠 → 紅 漸層
    // 0.0: 藍色 (#0000FF)
    // 0.5: 綠色 (#00FF00)  
    // 1.0: 紅色 (#FF0000)
    
    let r = 0;
    let g = 0;
    let b = 0;

    if (normalized < 0.5) {
      // 藍 → 綠
      const t = normalized * 2; // 0-1
      r = 0;
      g = Math.round(t * 255);
      b = Math.round((1 - t) * 255);
    } else {
      // 綠 → 紅
      const t = (normalized - 0.5) * 2; // 0-1
      r = Math.round(t * 255);
      g = Math.round((1 - t) * 255);
      b = 0;
    }

    // 轉換為十六進制顏色字串
    const toHex = (val: number) => val.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // ===== [HEATMAP:POINTER_TRACKING] =====
  // 目的：處理滑鼠移動時的 Tooltip 更新，並支援 2 秒 Hover 延遲
  // 邏輯：
  //   1. 監聽 scene.onPointerObservable 的 POINTERMOVE
  //   2. 計算滑鼠在世界座標中的射線
  //   3. 投影到 simulationGrid，找出最近的格點
  //   4. 若滑鼠位置變化 < 0.5m，啟動 2 秒延遲計時器
  //   5. 延遲後才顯示 Tooltip，移動則立即隱藏
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private setupHeatmapPointerTracking(): void {
    const scene = this.scene;
    if (!scene) {
      console.warn('[HeatmapPointer] abort: scene missing');
      return;
    }

    // 移除舊的觀察者（若存在）
    if ((this as any).__heatmapPointerObserver) {
      scene.onPointerObservable.remove((this as any).__heatmapPointerObserver);
    }

    // 新增 POINTERMOVE 觀察者
    (this as any).__heatmapPointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERMOVE) return;

      const ev = pointerInfo.event as PointerEvent;
      this.lastMouseClient = { x: ev.clientX, y: ev.clientY };

      const camera = scene.activeCamera;
      if (!camera) return;

      const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), camera);

      const t = (this.heatmapSliceHeight - ray.origin.y) / ray.direction.y;
      if (t < 0) {
        // 交點在射線反向，隱藏 Tooltip
        this.clearHoverTimer();
        this.tooltipVisible = false;
        return;
      }

      const intersectionPoint = ray.origin.add(ray.direction.scale(t));

      // 尋找最近的格點
      let closestIndex = -1;
      let closestDistance = Infinity;

      for (let i = 0; i < this.simulationGrid.length; i++) {
        const gridPoint = this.simulationGrid[i];
        // 只比較 X-Z 平面距離（忽略 Y）
        const dx = gridPoint.x - intersectionPoint.x;
        const dz = gridPoint.z - intersectionPoint.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }

      // 若找到格點且距離合理（1m 內）
      if (closestIndex >= 0 && closestDistance < 1.0) {
        const gridPoint = this.simulationGrid[closestIndex];

        // ✅ 檢查滑鼠是否移動超過門檻（0.2m）
        if (this.lastHoverPoint && this.lastHoverGridIndex === closestIndex) {
          const hoverDistance = Vector3.Distance(this.lastHoverPoint, intersectionPoint);
          
          if (hoverDistance > this.HOVER_DISTANCE_THRESHOLD) {
            // 移動超過門檻，清空計時器並重設位置
            this.clearHoverTimer();
            this.lastHoverPoint = intersectionPoint.clone();
            this.lastHoverGridIndex = closestIndex;
            this.tooltipVisible = false;
            
            // 啟動新的計時器
            this.startHoverTimer(closestIndex, intersectionPoint);
          }
          // 否則繼續等待計時器完成
        } else if (this.lastHoverGridIndex !== closestIndex) {
          // 懸停的格點改變了，重設計時器
          this.clearHoverTimer();
          this.lastHoverPoint = intersectionPoint.clone();
          this.lastHoverGridIndex = closestIndex;
          this.tooltipVisible = false;
          
          // 啟動新的計時器
          this.startHoverTimer(closestIndex, intersectionPoint);
        } else {
          // 首次進入該位置，記錄位置並啟動計時器
          this.lastHoverPoint = intersectionPoint.clone();
          this.lastHoverGridIndex = closestIndex;
          this.startHoverTimer(closestIndex, intersectionPoint);
        }

        const maxX = window.innerWidth - 260;
        const maxY = window.innerHeight - 160;

        this.tooltipPosition = {
          x: Math.min(this.lastMouseClient.x, maxX),
          y: Math.min(this.lastMouseClient.y, maxY)
        };
      } else {
        // 無有效格點，隱藏 Tooltip 並清空計時器
        this.clearHoverTimer();
        this.tooltipVisible = false;
        this.lastHoverPoint = null;
        this.lastHoverGridIndex = -1;
      }
    });

    console.log('[HeatmapPointer] 指標追蹤已啟用（1.5秒延遲）✓');
  }

  // ===== [PLOTLY_HEATMAP:POINTER_TRACKING] =====
  // Purpose: Hover tooltip on baked PNG heatmap plane (world -> grid -> z[][])
  private setupPlotlyHeatmapPointerTracking(): void {
    const scene = this.scene;
    if (!scene) return;

    // Remove old observer if exists
    if ((this as any).__plotlyHeatmapPointerObserver) {
      scene.onPointerObservable.remove((this as any).__plotlyHeatmapPointerObserver);
      (this as any).__plotlyHeatmapPointerObserver = null;
    }

    (this as any).__plotlyHeatmapPointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERMOVE) return;

      const plane = this.heatmapPlane;
      const meta = this.plotlyHoverMeta;
      const zmat = this.plotlyHoverZ;
      if (!plane || !meta || !zmat) return;

      const pick = scene.pick(scene.pointerX, scene.pointerY, m => m === plane);
      if (!pick?.hit || !pick.pickedPoint) {
        this.tooltipVisible = false;
        this.plotlyPendingHoverIndex = null;
        this.plotlyPendingClientXY = null;
        this.lastHoverGridIndex = -1;

        if (this.plotlyHoverTimer) {
          clearTimeout(this.plotlyHoverTimer);
          this.plotlyHoverTimer = null;
        }
        return;
      }

      const p = pick.pickedPoint;

      // Must be inside bbox (so we only show tooltip when actually over heatmap footprint)
      if (p.x < meta.min.x || p.x > meta.max.x || p.z < meta.min.z || p.z > meta.max.z) {
        this.tooltipVisible = false;
        this.plotlyPendingHoverIndex = null;
        this.plotlyPendingClientXY = null;
        this.lastHoverGridIndex = -1;

        if (this.plotlyHoverTimer) {
          clearTimeout(this.plotlyHoverTimer);
          this.plotlyHoverTimer = null;
        }
        return;
      }

      // World -> grid index
      const cellSizeX = (meta as any).cellSizeX ?? meta.cellSize;
      const cellSizeZ = (meta as any).cellSizeZ ?? meta.cellSize;

      const rawI = Math.floor((p.x - meta.min.x) / cellSizeX);
      const rawJ = Math.floor((p.z - meta.min.z) / cellSizeZ);

      const i = Math.max(0, Math.min(meta.nx - 1, rawI));
      let j = Math.max(0, Math.min(meta.nz - 1, rawJ));

      // Keep hover consistent with your Plotly reverseY setting
      const reverseY = (window as any).__hmPlotlyReverseY ?? true;
      if (!reverseY) {
        j = (meta.nz - 1) - j;
      }

      const rawValue = zmat[j]?.[i];
      const hasNumber = typeof rawValue === 'number' && !Number.isNaN(rawValue);
      if (!hasNumber) {
        if (this.distMode === 'coverage') {
          this.clearHoverTimer();
          this.tooltipVisible = false;
          return;
        }
        this.clearHoverTimer();
        this.tooltipVisible = false;
        return;
      }

      const value = rawValue as number;

      const linearIndex = j * meta.nx + i;
      // If hover moved to a different cell → reset everything
      if (this.lastHoverGridIndex !== linearIndex) {
        this.lastHoverGridIndex = linearIndex;

        // ✅ 立刻隱藏（delay 期間不應該看到舊 tooltip）
        this.tooltipVisible = false;

        // cancel pending
        if (this.plotlyHoverTimer) {
          clearTimeout(this.plotlyHoverTimer);
          this.plotlyHoverTimer = null;
        }

        this.plotlyPendingHoverIndex = linearIndex;

        // ✅ 用 viewport 座標（因為 tooltip 是 position: fixed）
        const ev = pointerInfo.event as PointerEvent;
        this.plotlyPendingClientXY = { x: ev.clientX, y: ev.clientY };

        // start delay
        this.plotlyHoverTimer = setTimeout(() => {
          if (this.plotlyPendingHoverIndex !== linearIndex) return;

          const xy = this.plotlyPendingClientXY;
          if (!xy) return;

          // ✅ 只在這裡設定 tooltipPosition（永遠用 clientX/Y）
          this.tooltipPosition = {
            x: Math.min(xy.x, window.innerWidth - 260),
            y: Math.min(xy.y, window.innerHeight - 160),
          };

          // data
          const valueLabel = this.getTooltipValueLabelByMode(this.distMode);
          let connectionTarget = '';
          if (this.distMode === 'coverage') {
            const th = this.coverageThreshold;
            connectionTarget =
              value >= 1
                ? `已覆蓋 (${th})`
                : value <= 0
                  ? `未覆蓋 (${th})`
                  : '';
          }

          
          const cellSizeX = (meta as any).cellSizeX ?? meta.cellSize;
          const cellSizeZ = (meta as any).cellSizeZ ?? meta.cellSize;

          this.tooltipData = {
            ...(this.tooltipData as any),
            positionX: meta.min.x + (i + 0.5) * cellSizeX,
            positionZ: meta.min.z + (rawJ + 0.5) * cellSizeZ,
            value,
            unit: this.plotlyHoverUnit,
            valueLabel,
            connectionTarget,
          };

          this.tooltipVisible = true;
          this.plotlyHoverTimer = null;
        }, this.PLOTLY_HOVER_DELAY_MS);
      }
    });

    console.log('[PlotlyHeatmapPointer] enabled ✓');
  }

  private getCoverageWinnerOwnerAt(i: number, j: number): { name: string; uniqueId: number } | null {
    const grid = this.coverageHoverWinnerIdxAll;
    if (!grid) return null;
    if (j < 0 || j >= grid.length) return null;
    const row = grid[j];
    if (!row || i < 0 || i >= row.length) return null;

    const idx = row[i];
    if (!Number.isFinite(idx) || idx < 0) return null;

    const owners = this.coverageHoverOwners ?? [];
    if (idx >= owners.length) return null;
    return owners[idx] ?? null;
  }

  private getTooltipValueLabelByMode(mode: string): string {
    if (mode === 'sinr') return '訊號品質';
    if (mode === 'coverage') return '覆蓋狀態';
    if (mode === 'ul_rate' || mode === 'dl_rate') return '傳輸速率';
    return '訊號強度';
  }

  private debugLogHoverVsTooltip(pointerInfo: any, scene: Scene, tag: string): void {
    const ev = pointerInfo?.event as PointerEvent | undefined;
    const canvas = scene.getEngine().getRenderingCanvas();
    const rect = canvas?.getBoundingClientRect();

    const clientX = ev?.clientX ?? -1;
    const clientY = ev?.clientY ?? -1;

    const pointerX = scene.pointerX ?? -1; // canvas-relative
    const pointerY = scene.pointerY ?? -1;

    const tooltipX = this.tooltipPosition?.x ?? -1;
    const tooltipY = this.tooltipPosition?.y ?? -1;

    const dx = (tooltipX >= 0 && clientX >= 0) ? (tooltipX - clientX) : NaN;
    const dy = (tooltipY >= 0 && clientY >= 0) ? (tooltipY - clientY) : NaN;

    console.log(`[HM][POS][${tag}]`, {
      client: { x: clientX, y: clientY },
      canvasPointer: { x: pointerX, y: pointerY },
      tooltip: { x: tooltipX, y: tooltipY },
      delta_tooltip_minus_client: { dx, dy },
      canvasRect: rect ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
    });
  }

  private showPlotlyHoverTooltipAtCell(worldPos: Vector3, value: number, ev: PointerEvent): void {
    this.tooltipData = {
      ...(this.tooltipData as any),
      positionX: Math.round(worldPos.x * 10) / 10,
      positionY: Math.round(worldPos.y * 100) / 100,
      positionZ: Math.round(worldPos.z * 10) / 10,
      value: Math.round(value * 10) / 10,
      unit: this.plotlyHoverUnit,
      valueLabel: this.getTooltipValueLabelByMode(this.distMode),
      connectionTarget: '',
    };

    this.tooltipPosition = {
      x: Math.min(ev.clientX + 12, window.innerWidth - 240),
      y: Math.min(ev.clientY + 12, window.innerHeight - 140),
    };

    this.debugLogHoverVsTooltip({ event: ev }, this.scene as Scene, 'after-set');

    this.tooltipVisible = true;
  }

  private startPlotlyHoverTimer(worldPos: Vector3, value: number, camera: Camera): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverTimer = setTimeout(() => {
      // Update tooltip data after 0.5s delay
      this.tooltipData = {
        ...(this.tooltipData as any),
        positionX: Math.round(worldPos.x * 10) / 10,
        positionY: Math.round(worldPos.y * 100) / 100,
        positionZ: Math.round(worldPos.z * 10) / 10,
        value: Math.round(value * 10) / 10,
        unit: this.plotlyHoverUnit,
        valueLabel: this.getTooltipValueLabelByMode(this.distMode),
        connectionTarget: '',
      };

      // Tooltip position: computed once per “generated cell”, not following mouse
      const screen = Vector3.Project(
        worldPos,
        Matrix.Identity(),
        camera.getProjectionMatrix(true),
        new Viewport(0, 0, window.innerWidth, window.innerHeight)
      );

      // Small offset so it doesn't overlap the point; tweak if needed
      const tooltipX = Math.round(screen.x) + 10;
      const tooltipY = Math.round(screen.y) + 10;

      this.tooltipPosition = {
        x: Math.min(tooltipX, window.innerWidth - 240),
        y: Math.min(tooltipY, window.innerHeight - 140),
      };

      this.tooltipVisible = true;
      this.hoverTimer = null;
    }, 500);
  }

  // ===== [HEATMAP:HOVER_TIMER_MANAGEMENT] =====
  // 目的：管理 Tooltip 顯示延遲計時器，並使用精準座標轉換
  // =====================================================
  private startHoverTimer(gridIndex: number, hoverPoint: Vector3): void {
    // 若計時器已存在，先清除
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }

    // 啟動新計時器（延遲 1.5 秒後顯示）
    this.hoverTimer = setTimeout(() => {
      if (gridIndex >= 0 && gridIndex < this.simulationGrid.length && this.gridDataBuffer) {
        const gridPoint = this.simulationGrid[gridIndex];
        const value = this.gridDataBuffer[gridIndex];

        // ✅ 更新 Tooltip 數據
        this.tooltipData = {
          positionX: Math.round(gridPoint.x * 10) / 10,
          positionZ: Math.round(gridPoint.z * 10) / 10,
          value: Math.round(value * 10) / 10,
          unit: this.plotlyHoverUnit,
          valueLabel: this.getTooltipValueLabelByMode(this.distMode),
          connectionTarget: '',
        };

        const maxX = window.innerWidth - 260;
        const maxY = window.innerHeight - 160;

        this.tooltipPosition = {
          x: Math.min(this.lastMouseClient.x, maxX),
          y: Math.min(this.lastMouseClient.y, maxY),
        };

        // 顯示 Tooltip
        this.tooltipVisible = true;
        
        console.log('[HeatmapPointer] Tooltip 已顯示 (1.5秒後)', {
          位置: `(${this.tooltipData.positionX}, ${this.tooltipData.positionZ})`,
          訊號值: `${this.tooltipData.value} ${this.tooltipData.unit}`
        });
      }
      
      this.hoverTimer = null;
    }, this.HOVER_DELAY_MS);
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  // ===== [SIMULATION:GRID_GENERATION] =====
  // 目的：生成空間格點，用於熱力圖運算
  // 邏輯：
  //   1. 讀取 floorMesh 的 BoundingBox
  //   2. 根據解析度（默認 1m）切割網格
  //   3. 限制總格點數 ≤ 50,000
  //   4. 自動降採樣若超出限制
  // ⚠️ 重點：此方法僅作為運算參考，產生的 Vector3[] 不得渲染成實體 Mesh
  // ✅ 安全性保證：不修改 floorMesh 的 scaling、position、rotation
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private generateSimulationGrid(floorMesh: Mesh, resolution: number = 1.0): Vector3[] {
    // ✅ 禁止動動地表：只讀取邊界，不修改任何屬性
    // ✅ 使用 world space bounding box 確保座標一致
    const bb = floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const max = bb.maximumWorld;
    
    const sizeX = max.x - min.x;
    const sizeZ = max.z - min.z;
    
    let gridX = Math.ceil(sizeX / resolution);
    let gridZ = Math.ceil(sizeZ / resolution);
    let totalPoints = gridX * gridZ;
    
    // 性能防守：若超過限制，自動降採樣
    if (totalPoints > this.GRID_MAX_POINTS) {
      const scale = Math.sqrt(this.GRID_MAX_POINTS / totalPoints);
      resolution /= scale;
      gridX = Math.ceil(sizeX / resolution);
      gridZ = Math.ceil(sizeZ / resolution);
      totalPoints = gridX * gridZ;
      
      console.log('[Simulation] 自動降採樣', {
        原始點數: gridX * gridZ,
        新解析度_m: resolution.toFixed(2),
        新點數: totalPoints,
      });
    }
    
    const grid: Vector3[] = [];
    
    for (let zi = 0; zi < gridZ; zi++) {
      for (let xi = 0; xi < gridX; xi++) {
        const x = min.x + xi * resolution;
        const z = min.z + zi * resolution;
        const y = this.heatmapSliceHeight; // ✅ 使用既有的 slice 高度變數（world space）

        grid.push(new Vector3(x, y, z));
      }
    }
    
    console.log('[Simulation] 格點生成完成', {
      格點數: grid.length,
      網格大小_X: gridX,
      網格大小_Z: gridZ,
      解析度_m: resolution.toFixed(2),
    });
    
    return grid;
  }

  // ===== [SIMULATION:SINR_COMPUTATION] =====
  // 目的：計算單一格點的 SINR 值
  // 邏輯：
  //   1. 找出最強訊號基站（含 DAS）
  //   2. 計算路徑損耗
  //   3. 使用射線檢查遮蔽，套用衰減
  //   4. ✅ 簡化為僅回傳 maxRsrp（RSRP 模式專用）
  // =====================================================
  private computeSignalAtPoint(
    point: Vector3,
    antennas: AbstractMesh[],
    blockers: AbstractMesh[],
    scene: Scene
  ): number {
    // --- DBG-HM: blockers sanity check ---
    try {
      if (blockers?.length) {
        const hasFloor = this.floorMesh
          ? blockers.includes(this.floorMesh as any)
          : false;

        const hasHeatmapPlane = this.heatmapPlane
          ? blockers.includes(this.heatmapPlane as any)
          : false;

        if (hasFloor || hasHeatmapPlane) {
          console.warn('[DBG-HM] blockers include forbidden mesh', {
            hasFloor,
            hasHeatmapPlane
          });
        }
      }
    } catch {}
    // --- end DBG-HM ---

    // ✅ TX 功率與頻率參數（固定）
    const TX_DBM = 43;
    const FREQ_MHZ = 3500;
    
    let maxRsrp = -Infinity;
    
    for (const antenna of antennas) {
      const antennaPos = antenna.getAbsolutePosition?.() ?? antenna.position;
      const distanceM = Vector3.Distance(point, antennaPos);
      const distanceKm = distanceM / 1000;
      
      // ✅ FSPL 模型（Free Space Path Loss）
      // FSPL(dB) = 32.44 + 20*log10(freq_MHz) + 20*log10(distance_km)
      const fspl_db = 32.44 + 20 * Math.log10(FREQ_MHZ) + 20 * Math.log10(Math.max(distanceKm, 0.001));
      
      // ✅ 計算 RSRP（dBm）
      let rsrp = TX_DBM - fspl_db;
      
      // ✅ 檢查遮蔽（使用 dedupe 邏輯，同一建築只計算一次）
      const hitBuildingsSet = new Set<AbstractMesh>();
      
      const direction = point.subtract(antennaPos).normalize();
      const rayLength = distanceM;
      const ray = new Ray(antennaPos, direction, rayLength);
      
      for (const blocker of blockers) {
        // 遮蔽邏輯安全性：排除地板本身
        if (this.phase4SingleShot && blocker === this.floorMesh) {
          continue;
        }
        
        const hit = ray.intersectsMesh(blocker, false);
        if (hit && hit.hit) {
          // ✅ 同一建築只記錄一次，避免重複累加
          if (!hitBuildingsSet.has(blocker)) {
            hitBuildingsSet.add(blocker);
          }
        }
      }
      
      // ✅ 計算衰減：優先使用 metadata.penaltyDb，否則使用預設值
      let totalAttenuation = 0;
      for (const building of hitBuildingsSet) {
        const penalty = (building as any)?.metadata?.penaltyDb ?? 15;
        totalAttenuation += penalty;
      }
      
      rsrp -= totalAttenuation;
      
      // ✅ 追蹤最強訊號
      if (rsrp > maxRsrp) {
        maxRsrp = rsrp;
      }
    }
    
    // 無基站覆蓋時回傳最弱值
    if (maxRsrp === -Infinity) return -120;
    
    return maxRsrp;
  }

  // ===== [SIMULATION:HEATMAP_MAIN] =====
  // 目的：執行完整的熱力圖模擬
  // 邏輯：
  //   1. 生成空間格點
  //   2. 對每個格點計算 SINR
  //   3. 儲存結果到 gridDataBuffer
  // =====================================================
  // @deprecated Legacy heatmap pipeline (DynamicTexture-based)
  // Do not use in Plotly-based heatmap flow.
  private runHeatmapSimulation(scene: Scene, antennas: AbstractMesh[], blockers: AbstractMesh[]): void {
    console.log('[Simulation] 開始熱力圖模擬…');
    
    // 步驟 1：生成格點
    if (!this.floorMesh) {
      console.error('[Simulation] floorMesh 未找到');
      return;
    }
    
    const gridMeters = this.parseGrid(this.fieldSettingsState?.heatmapGrid ?? '1x1');
    this.simulationGrid = this.generateSimulationGrid(this.floorMesh, gridMeters > 0 ? gridMeters : 1);
    
    if (this.simulationGrid.length === 0) {
      console.error('[Simulation] 格點生成失敗');
      return;
    }
    
    // 初始化結果緩衝區
    this.gridDataBuffer = new Float32Array(this.simulationGrid.length);
    
    console.log('[Simulation] 開始 SINR 運算…', {
      總格點數: this.simulationGrid.length,
      基站數: antennas.length,
      障礙物數: blockers.length,
    });

    // --- DBG-HM: sample near vs far signal values ---
    try {
      const nodes = this.p2_collectSignalNodes(scene);
      const antenna = nodes?.antennas?.[0] ?? null;

      if (antenna && this.simulationGrid.length) {
        const ap = antenna.getAbsolutePosition?.() ?? antenna.position;

        const near1 = new Vector3(ap.x + 1, this.heatmapSliceHeight, ap.z);
        const near2 = new Vector3(ap.x, this.heatmapSliceHeight, ap.z + 1);
        const far = this.simulationGrid[this.simulationGrid.length - 1];

        const v1 = this.computeSignalAtPoint(near1, antennas, blockers, scene);
        const v2 = this.computeSignalAtPoint(near2, antennas, blockers, scene);
        const vf = this.computeSignalAtPoint(far, antennas, blockers, scene);

        console.log('[DBG-HM] signal sample', {
          antenna: ap,
          near1, v1,
          near2, v2,
          far, vf
        });
      }
    } catch (e) {
      console.warn('[DBG-HM] signal sample failed', e);
    }
    // --- end DBG-HM ---

    // --- DBG-HM: global min/max (temporary) ---
    let dbgMin = Number.POSITIVE_INFINITY;
    let dbgMax = Number.NEGATIVE_INFINITY;
    // --- end DBG ---
    
    // 步驟 2：對每個格點計算 SINR
    for (let i = 0; i < this.simulationGrid.length; i++) {
      const point = this.simulationGrid[i];
      const sinr = this.computeSignalAtPoint(point, antennas, blockers, scene);
      this.gridDataBuffer[i] = sinr;

      // --- DBG-HM: update global min/max ---
      dbgMin = Math.min(dbgMin, sinr);
      dbgMax = Math.max(dbgMax, sinr);
      // --- end DBG ---
      
      // 每 1000 個點打印一次進度
      if ((i + 1) % 1000 === 0) {
        console.log('[Simulation] 運算進度', {
          完成點數: i + 1,
          總點數: this.simulationGrid.length,
          百分比: ((i + 1) / this.simulationGrid.length * 100).toFixed(1) + '%',
        });
      }
    }

    // --- DBG-HM: log global min/max ---
    console.log('[DBG-HM] heatmap global range', {
      min: dbgMin,
      max: dbgMax
    });
    // --- end DBG ---
    
    // 統計結果
    const minVal = Math.min(...this.gridDataBuffer);
    const maxVal = Math.max(...this.gridDataBuffer);
    const avgVal = this.gridDataBuffer.reduce((a, b) => a + b, 0) / this.gridDataBuffer.length;
    
    console.log('[Simulation] 熱力圖模擬完成 ✓', {
      總格點數: this.simulationGrid.length,
      最小_SINR_dB: minVal.toFixed(2),
      最大_SINR_dB: maxVal.toFixed(2),
      平均_SINR_dB: avgVal.toFixed(2),
      非零點數: this.gridDataBuffer.filter(v => v > -Infinity).length,
    });

    // ✅ 步驟 3：渲染熱力圖
    console.log('[Simulation] 開始渲染熱力圖…');
    this.ensureHeatmapPlane();      // 建立或更新平面
    this.updateHeatmapTexture();    // 更新紋理顏色映射
    this.setupHeatmapPointerTracking(); // 啟用 Tooltip 互動

    console.log('[Simulation] 熱力圖渲染完成 ✓');
  }

  // ===== [HEATMAP_PHASE3:DEBUG_SOLVER] =====
  // Purpose: Debug RSRP computation at antenna cell
  // ====================================
  private debugComputeRsrpAtAntennaCell(
    meta: any,
    cellSize: number,
    antennaMesh: AbstractMesh,
    blockers: AbstractMesh[]
  ): void {
    const antennaPos = antennaMesh.getAbsolutePosition();

    // Calculate antenna grid indices
    let antennaI = Math.floor((antennaPos.x - meta.min.x) / cellSize);
    let antennaJ = Math.floor((antennaPos.z - meta.min.z) / cellSize);

    // Clamp to valid range
    antennaI = Math.max(0, Math.min(antennaI, meta.nx - 1));
    antennaJ = Math.max(0, Math.min(antennaJ, meta.nz - 1));

    // Get sample point at antenna cell
    const samplePos = this.getHeatmapSamplePoint(meta.min, antennaI, antennaJ, cellSize, this.plotlyHeatmapSliceHeight);

    // Compute distance
    const d = Vector3.Distance(antennaPos, samplePos);

    // Phase 5.4B: Dev-only antenna cell marker
    const dbg = (window as any).__hmDbgMarker ?? true;
    if (dbg) {
      this.upsertHeatmapAntennaCellMarker(samplePos);

      const dx = antennaPos.x - samplePos.x;
      const dz = antennaPos.z - samplePos.z;
      const d2 = Math.sqrt(dx * dx + dz * dz);
      console.log('[Heatmap][DBG] antennaCell check', {
        antennaI,
        antennaJ,
        cellSize,
        dXZ: d2.toFixed(2),
        antenna: `{X:${antennaPos.x.toFixed(2)} Z:${antennaPos.z.toFixed(2)}}`,
        cell: `{X:${samplePos.x.toFixed(2)} Z:${samplePos.z.toFixed(2)}}`,
      });
    }

    console.log('[RSRP][DBG][AntennaCell]', {
      antennaName: antennaMesh.name,
      antennaI,
      antennaJ,
      antennaPos: antennaPos.toString?.() ?? antennaPos,
      samplePos: samplePos.toString?.() ?? samplePos,
      d: d.toFixed(2),
      blockersCount: blockers.length,
      cellSize,
    });
  }

  // ===== [PLOTLY_HEATMAP:FLOW] =====
  // Purpose: Dedicated Plotly heatmap compute flow (Phase 1.3 grid verification only)
  // ====================================
  private async runPlotlyHeatmapFlow(): Promise<void> {
    console.log('[Heatmap][Plotly] start compute (plotly mode)');

    // Clean up legacy heatmap assets if method exists
    this.disposeLegacyHeatmapAssets?.();

    // Check if floor mesh exists
    if (!this.floorMesh) {
      console.warn('[Heatmap][Grid] abort: no floorMesh');
      return;
    }

    // ===== [SIM_API_PHASE4–7][BACKEND_HEATMAP] sinr / rsrp / dl / ul / coverage =====
    if (this.lastCompleteCalcResult) {
      if (
        this.distMode === 'sinr' ||
        this.distMode === 'rsrp' ||
        this.distMode === 'dl_rate' ||
        this.distMode === 'ul_rate' ||
        this.distMode === 'coverage'
      ) {
        const rendered = await this.renderBackendHeatmapFromCompleteCalcResult(
          this.distMode
        );
        if (rendered) return;
      }
    }

    // Get cellSize from resolution mode
    const cellSize = this.resolveHeatmapCellSize();
    console.log('[Heatmap][Res] using cellSize', { mode: this.heatmapResolutionMode, cellSize });

    // Build grid metadata
    const meta = this.buildHeatmapGridMeta(this.floorMesh, cellSize);

    // ===== [HEATMAP_RESOLUTION:PHASE0.4] =====
    // Safeguard: Abort if grid is too large to avoid UI freeze
    // ====================================
    const total = meta.nx * meta.nz;
    if (total > 200_000) {
      console.warn('[Heatmap][Res] grid too large, abort', { total, nx: meta.nx, nz: meta.nz, cellSize });
      return;
    }

    // Phase 7: coverage 改由 renderBackendHeatmapFromCompleteCalcResult('coverage') 處理（見 buildCoverageHeatmapMatrix）。
    // 舊 demo：owners / fake rsrp 網格已自 runPlotlyHeatmapFlow 移除（disc overlay 仍保留於檔案底層、未再接回主路徑）。

    if (this.distMode === 'coverage') {
      console.warn(
        '[Heatmap][Plotly] coverage: no backend matrix (need lastCompleteCalcResult + rsrp/sinr maps)'
      );
      return;
    }

    // ===== [PHASE2] Scan antennas and blockers for heatmap
    this.debugScanAntennaAndBlockersForHeatmap();

    // Sample three points: (0,0), (nx/2, nz/2), (nx-1, nz-1)
    const p1 = this.getHeatmapSamplePoint(meta.min, 0, 0, cellSize, this.plotlyHeatmapSliceHeight);
    const p2 = this.getHeatmapSamplePoint(meta.min, Math.floor(meta.nx / 2), Math.floor(meta.nz / 2), cellSize, this.plotlyHeatmapSliceHeight);
    const p3 = this.getHeatmapSamplePoint(meta.min, meta.nx - 1, meta.nz - 1, cellSize, this.plotlyHeatmapSliceHeight);

    console.log('[Heatmap][Grid] sample points', {
      p1_0_0: p1.toString?.() ?? p1,
      p2_mid: p2.toString?.() ?? p2,
      p3_max: p3.toString?.() ?? p3,
    });

    // [DBG] Heatmap axis sanity (no rendering)
    console.log('[Heatmap][AxisDBG]', {
      minZ: meta.min.z,
      maxZ: meta.max.z,
      p1_z: p1.z,
      p3_z: p3.z,
      cellSize,
      expect: 'p1_z ~= minZ + 0.5*cellSize; p3_z ~= maxZ - 0.5*cellSize',
    });

    console.log('[Heatmap][Plotly] Phase1 grid ok');

    // ===== [PHASE3] RSRP Solver
    // Collect antenna (deduped) and blockers
    const allAntennaMeshes: AbstractMesh[] = [];
    const blockers: AbstractMesh[] = [];

    if (this.scene) {
      for (const mesh of this.scene.meshes) {
        // Collect antenna
        if (mesh.metadata?.type === 'antenna') {
          allAntennaMeshes.push(mesh);
        }

        // Collect blockers
        const isBlockerByMeta = mesh.metadata?.attenuationDB != null || mesh.metadata?.type === 'building' || mesh.metadata?.type === 'blocker';
        const isBlockerByName = /building|osm|extrude/i.test(mesh.name);
        if (isBlockerByMeta || isBlockerByName) {
          blockers.push(mesh);
        }
      }
    }

    // Antenna deduplication
    let antennaMesh: AbstractMesh | null = null;
    if (allAntennaMeshes.length > 0) {
      antennaMesh = allAntennaMeshes.find(a => a.name === 'antenna_owner')
        ?? allAntennaMeshes.find(a => a.name.includes('__root__'))
        ?? allAntennaMeshes[0];
    }

    if (!antennaMesh) {
      console.warn('[RSRP] abort: no antenna');
      return;
    }

    // Invoke RSRP solver
    this.debugComputeRsrpAtAntennaCell(meta, cellSize, antennaMesh, blockers);

    // ===== [DBG] Before/After building comparison
    if (blockers.length > 0) {
      const antennaPos = antennaMesh.getAbsolutePosition();
      const building = blockers[0];
      const bb = building.getBoundingInfo().boundingBox;
      const buildingCenter = bb.centerWorld;
      const dir = buildingCenter.subtract(antennaPos);
      const dirLen = dir.length();
      
      if (dirLen > 1e-3) {
        const dirN = dir.scale(1 / dirLen);
        const extent = bb.extendSizeWorld.length();
        const margin = 2;
        
        const beforePos = buildingCenter.subtract(dirN.scale(extent + margin));
        const afterPos = buildingCenter.add(dirN.scale(extent + margin));

        const baseBefore = this.computeRSRP_NoBlocker(antennaPos, beforePos);
        const attBefore = this.computeAttenuationMultiRay(antennaPos, beforePos, blockers);
        const finalBefore = baseBefore - attBefore.att;

        const baseAfter = this.computeRSRP_NoBlocker(antennaPos, afterPos);
        const attAfter = this.computeAttenuationMultiRay(antennaPos, afterPos, blockers);
        const finalAfter = baseAfter - attAfter.att;

        const fmtVec3 = (v: Vector3) => v.toString?.() ?? v;
        console.log('[RSRP][DBG][BeforeAfterBuilding]', {
          buildingName: building.name,
          buildingCenter: fmtVec3(buildingCenter),
          before: {
            pos: fmtVec3(beforePos),
            baseRsrp: baseBefore.toFixed(2),
            att: attBefore.att.toFixed(2),
            hitCount: attBefore.hitCount,
            hitNames: attBefore.hitNames,
            rsrp: finalBefore.toFixed(2),
          },
          after: {
            pos: fmtVec3(afterPos),
            baseRsrp: baseAfter.toFixed(2),
            att: attAfter.att.toFixed(2),
            hitCount: attAfter.hitCount,
            hitNames: attAfter.hitNames,
            rsrp: finalAfter.toFixed(2),
          },
          diff_dB: (finalAfter - finalBefore).toFixed(2),
        });
      }
    }

    // ===== [PHASE4.3] Build RSRP z-matrix
    const heatmapAntennaPos = antennaMesh?.getAbsolutePosition?.() ?? null;

    const dbgNodes = this.p2_collectSignalNodes?.(this.scene);
    const dbgBs = dbgNodes?.antennas?.[0] ?? null;
    const dbgBsPos =
      dbgBs?.getAbsolutePosition?.()?.clone?.() ??
      dbgBs?.position?.clone?.() ??
      null;

    if (this.DEBUG_HEATMAP) {
      console.log('[DBG][HEATMAP_ANTENNA_SOURCE][PATCH_V2][HIT]');
      console.log('[DBG][HEATMAP_ANTENNA_SOURCE][PATCH_V2]', {
        pickedAntennaMeshName: antennaMesh?.name ?? null,
        pickedAntennaMeshUid: antennaMesh?.uniqueId ?? null,
        heatmapAntennaPos: heatmapAntennaPos
          ? {
              x: heatmapAntennaPos.x,
              y: heatmapAntennaPos.y,
              z: heatmapAntennaPos.z,
            }
          : null,

        dbgBsName: dbgBs?.name ?? null,
        dbgBsUid: dbgBs?.uniqueId ?? null,
        dbgBsPos: dbgBsPos
          ? {
              x: dbgBsPos.x,
              y: dbgBsPos.y,
              z: dbgBsPos.z,
            }
          : null,

        delta:
          heatmapAntennaPos && dbgBsPos
            ? {
                dx: heatmapAntennaPos.x - dbgBsPos.x,
                dy: heatmapAntennaPos.y - dbgBsPos.y,
                dz: heatmapAntennaPos.z - dbgBsPos.z,
              }
            : null,

        note: 'Compare heatmap source antenna position vs debug BS world position',
      });
    }

    const zMatrixResult = this.buildRsrpMatrixForHeatmap(
      {
        nx: meta.nx,
        nz: meta.nz,
        min: meta.min,
        cellSize,
        sliceY: this.plotlyHeatmapSliceHeight,
      },
      antennaMesh.getAbsolutePosition(),
      blockers
    );

    const zRsrp = zMatrixResult.z;
    const modeMeta = this.DIST_MODE_META[this.distMode] ?? this.DIST_MODE_META.rsrp;

    if (this.DEBUG_HEATMAP) {
      console.log('[Heatmap][Z] built', {
        nx: meta.nx,
        nz: meta.nz,
        min: zMatrixResult.min.toFixed(2),
        max: zMatrixResult.max.toFixed(2),
        strongest: {
          i: zMatrixResult.strongest.i,
          j: zMatrixResult.strongest.j,
          value: zMatrixResult.strongest.value.toFixed(2),
          pos: zMatrixResult.strongest.pos.toString?.() ?? zMatrixResult.strongest.pos,
        },
      });
    }

    // ===== [PLOTLY_HEATMAP:HOVER_CACHE] =====
    // Cache meta + z for Babylon hover tooltip (Plotly DOM is not interactive after toImage)
    // Always rebuild from current floorMesh meta — never reuse stale plotlyHoverMeta min/max/cellSize
    this.plotlyHoverMeta = {
      min: meta.min.clone(),
      max: meta.max.clone(),
      nx: meta.nx,
      nz: meta.nz,
      cellSize,
      cellSizeX: cellSize,
      cellSizeZ: cellSize,
      sliceY: this.plotlyHeatmapSliceHeight,
    };
    this.plotlyHoverZ = zRsrp;
    this.plotlyHoverUnit = modeMeta.unit;

    // Ensure Banner (tooltip host) is visible in plotly mode
    this.isSimulationDone = true;

    // Phase 5.4A: Dev-only strongest marker
    const dbg = (window as any).__hmDbgMarker ?? true;
    if (dbg && zMatrixResult.strongest?.pos) {
      this.upsertHeatmapStrongestMarker(zMatrixResult.strongest.pos);
    }

    // ===== [HEATMAP_DBG] Optional z-matrix override (no-op unless enabled) =====
    const DBG_FLAGS = (window as any).__hmDbgFlags === true;
    if (DBG_FLAGS) {
      console.log('[Heatmap][DBG] flags snapshot', {
        __hmPlotlyReverseY: (window as any).__hmPlotlyReverseY,
        __hmFlipV: (window as any).__hmFlipV,
        __hmDbgPattern: (window as any).__hmDbgPattern,
        __hmDbgUV: (window as any).__hmDbgUV,
        cellSize,
        nx: meta.nx,
        nz: meta.nz,
      });
    }

    const dbgPattern = (window as any).__hmDbgPattern as ('corners' | 'gradJ' | 'gradI' | 'singleHot' | undefined);
    const zBase = dbgPattern
      ? this.hmDbgBuildPatternZ(meta.nx, meta.nz, dbgPattern)
      : zRsrp;

    const zFinal = this.transformRsrpToModeZ(zBase, this.distMode);
    // zFinal layout: zFinal[j][i]  (outer=j/Z-axis, inner=i/X-axis)
    // Plotly expects z[row][col] = z[j][i], so NO transpose needed.
    // Previous code read zFinal[i][j] which swapped X/Z axes on the heatmap.
    const zForPlotly = Array.from({ length: meta.nz }, (_, j) =>
      Array.from({ length: meta.nx }, (_, i) => zFinal[j][i])
    );

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][PLOTLY_TRANSPOSE]', {
        canonicalShape: {
          outer: zFinal.length,
          inner: zFinal[0]?.length ?? 0,
        },
        plotlyShape: {
          outer: zForPlotly.length,
          inner: zForPlotly[0]?.length ?? 0,
        },
        note: 'zFinal[j][i]: outer=j/Z, inner=i/X. Plotly z[row][col]=z[j][i]. No transpose.',
      });
    }

    if (dbgPattern) {
      console.warn('[Heatmap][DBG] using debug z-pattern (override RSRP)', { dbgPattern });
    }

    // ===== [PHASE4.4] Render Plotly heatmap
    const range = this.committedRangeByMode[this.distMode] ?? this.committedRangeByMode.rsrp;
    const actualSourceName = `scene RSRP matrix -> transformRsrpToModeZ(${this.distMode})`;
    this.logHeatmapModeSourceAndRange(this.distMode, range.min, range.max, actualSourceName);

    if (this.distMode === 'sinr') {
      this.debugHeatmapMatrix('legacy-sinr-before-plotly', zFinal as any);
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][MODE_SOURCE]', { mode: 'sinr', actualSource: 'legacy sinr path' }); }
    }

    await this.renderPlotlyHeatmap(
      zForPlotly,
      meta.nx,
      meta.nz,
      cellSize,
      { zmin: range.min, zmax: range.max }
    );

    this.plotlyHoverZ = zFinal;
    this.plotlyHoverUnit = modeMeta.unit;
    this.dbgCompareZMatrixWithWorld();

    // ===== [PHASE4.5] Export to PNG dataURL
    const pngUrl = await this.exportPlotlyToPngDataUrl();

    // ===== [PHASE5.1] Apply to Babylon overlay plane
    if (pngUrl && this.floorMesh) {
      this.ensureHeatmapPlaneForPlotly(this.floorMesh, this.plotlyHeatmapSliceHeight);
      this.applyPngDataUrlToHeatmap(pngUrl);

      if (this.DEBUG_HEATMAP) { console.log('[Heatmap][Babylon] applied', { plane: this.heatmapPlane?.name, y: this.heatmapPlane?.position.y, pngLen: pngUrl.length }); }

      // Enable hover tooltip for plotly baked heatmap
      this.setupPlotlyHeatmapPointerTracking();

      this.commitColorbarSnapshotForMode(this.distMode);
    }

    if (this.DEBUG_HEATMAP) {
      console.log('[Heatmap][DBG] batch summary', {
        mode: this.heatmapResolutionMode,
        cellSize,
        nx: meta.nx,
        nz: meta.nz,
        min: zMatrixResult.min.toFixed(2),
        max: zMatrixResult.max.toFixed(2),
        strongest: {
          value: zMatrixResult.strongest.value.toFixed(2),
          pos: zMatrixResult.strongest.pos.toString?.() ?? zMatrixResult.strongest.pos,
        },
      });
    }
  }

  private buildDiscreteColorscale(colors: string[]): any[] {
    if (!colors || colors.length === 0) return [];

    const scale: any[] = [];
    const k = colors.length;
    for (let i = 0; i < k; i++) {
      const a = i / k;
      const b = (i + 1) / k;
      scale.push([a, colors[i]]);
      scale.push([Math.max(a, b - 1e-6), colors[i]]);
    }
    return scale;
  }

  private fakeSinrFromRsrp(rsrp: number, seed: number): number {
    const base = (rsrp + 120) * 0.5;
    const raw = Math.sin((seed || 1) * 12.9898) * 43758.5453;
    const frac = raw - Math.floor(raw);
    const bias = frac * 2 - 1;
    const value = base + bias * 1.0;
    return Math.max(-5, Math.min(35, value));
  }

  private demoCoverageNoise(seed: number, a: number, b: number): number {
    const s = Math.sin(seed * 12.9898 + a * 0.01 + b * 0.02) * 43758.5453;
    const frac = s - Math.floor(s);
    return (frac - 0.5) * 2;
  }

  private demoCoverageRsrp(bsPos: Vector3, samplePos: Vector3, seed: number): number {
    const dx = samplePos.x - bsPos.x;
    const dz = samplePos.z - bsPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const base = -75 - 0.11 * d;
    const n = this.demoCoverageNoise(seed, samplePos.x, samplePos.z) * 2.0;
    return base + n;
  }

  private demoCoverageSinrFromRsrp(rsrp: number, seed: number): number {
    const raw = (rsrp + 120) * 0.5;
    const n = this.demoCoverageNoise(seed + 31, rsrp, seed) * 1.0;
    return raw + n;
  }

  // ===== [HEATMAP_PHASE2:DEBUG_SCAN] =====
  // Purpose: Scan antennas and blockers for heatmap (debug only, no state changes)
  // ====================================
  private debugScanAntennaAndBlockersForHeatmap(): void {
    const allAntennaMeshes: AbstractMesh[] = [];
    const blockers: AbstractMesh[] = [];

    if (!this.scene) return;

    // First pass: collect all antenna and blocker candidates
    for (const mesh of this.scene.meshes) {
      // Collect all antenna meshes
      if (mesh.metadata?.type === 'antenna') {
        allAntennaMeshes.push(mesh);
      }

      // Collect blockers with flexible criteria
      const isBlockerByMeta = mesh.metadata?.attenuationDB != null || mesh.metadata?.type === 'building' || mesh.metadata?.type === 'blocker';
      const isBlockerByName = /building|osm|extrude/i.test(mesh.name);
      
      if (isBlockerByMeta || isBlockerByName) {
        blockers.push(mesh);
      }
    }

    // Antenna deduplication: select single owner antenna
    let antennas: AbstractMesh[] = [];
    
    if (allAntennaMeshes.length > 0) {
      // Priority 1: find antenna_owner
      let ownerAntenna = allAntennaMeshes.find(a => a.name === 'antenna_owner');
      
      // Priority 2: find __root__ antenna
      if (!ownerAntenna) {
        ownerAntenna = allAntennaMeshes.find(a => a.name.includes('__root__'));
      }
      
      // Priority 3: fallback to first antenna
      if (!ownerAntenna) {
        ownerAntenna = allAntennaMeshes[0];
      }
      
      if (ownerAntenna) {
        antennas.push(ownerAntenna);
      }
    }

    // Log antennas (deduped)
    console.log('[Heatmap][Scan] antennas (deduped)', antennas.map(a => ({
      name: a.name,
      pos: a.getAbsolutePosition(),
      metaType: a.metadata?.type,
    })));

    // Log blockers summary with fallback
    console.log('[Heatmap][Scan] blockers summary', {
      count: blockers.length,
      sample: blockers.slice(0, 3).map(b => ({
        name: b.name,
        attenuationDB: b.metadata?.attenuationDB ?? 15,
        hasAttenuationDB: b.metadata?.attenuationDB != null,
        isPickable: b.isPickable,
        metaType: b.metadata?.type ?? null,
      })),
    });
  }

  // ===== [HEATMAP_PHASE3.1:RSRP_NO_BLOCKER] =====
  // Purpose: Compute single-point RSRP without ray/blocker (distance attenuation only)
  // ====================================
  private computeRSRP_NoBlocker(
    antennaPos: Vector3,
    samplePos: Vector3
  ): number {
    const d = Vector3.Distance(antennaPos, samplePos);
    
    // Avoid log(0)
    if (d < 0.01) {
      return -70; // Near antenna
    }

    const txPower = 43; // dBm
    const freqMHz = 3500; // 3.5 GHz
    
    // FSPL: PL = 32.44 + 20*log10(d_km) + 20*log10(f_MHz)
    // Convert d (meters) to km: d_km = d / 1000
    const d_km = d / 1000;
    const fspl = 32.44 + 20 * Math.log10(d_km) + 20 * Math.log10(freqMHz);
    const rsrp = txPower - fspl;

    return rsrp;
  }

  // ===== [HEATMAP_PHASE4.3:Z_MATRIX_BUILD] =====
  // Purpose: Build RSRP z-matrix for Plotly heatmap
  // ====================================
  private buildRsrpMatrixForHeatmap(
    meta: { nx: number; nz: number; min: Vector3; cellSize: number; sliceY: number },
    antennaPos: Vector3,
    blockers: AbstractMesh[]
  ): { z: number[][]; min: number; max: number; strongest: { i: number; j: number; value: number; pos: Vector3 } } {
    const z: number[][] = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let strongest = { i: 0, j: 0, value: -Infinity, pos: new Vector3(0, 0, 0) };

    for (let j = 0; j < meta.nz; j++) {
      z[j] = [];
      for (let i = 0; i < meta.nx; i++) {
        const samplePos = new Vector3(
          meta.min.x + (i + 0.5) * meta.cellSize,
          meta.sliceY,
          meta.min.z + (j + 0.5) * meta.cellSize
        );

        const baseRsrp = this.computeRSRP_NoBlocker(antennaPos, samplePos);
        const attInfo = this.computeAttenuationMultiRay(antennaPos, samplePos, blockers);
        const finalRsrp = baseRsrp - attInfo.att;

        z[j][i] = finalRsrp;

        if (finalRsrp < globalMin) globalMin = finalRsrp;
        if (finalRsrp > globalMax) globalMax = finalRsrp;

        if (finalRsrp > strongest.value) {
          strongest = { i, j, value: finalRsrp, pos: samplePos };
        }
      }
    }

    return {
      z,
      min: globalMin,
      max: globalMax,
      strongest,
    };
  }

  private transformRsrpToModeZ(zRsrp: number[][], mode: DistributionMode): number[][] {
  // Safety: keep shape
  const nz = zRsrp.length;
  const nx = nz > 0 ? zRsrp[0].length : 0;
  if (nx <= 0 || nz <= 0) return zRsrp;

  // RSRP: do not alter at all (must stay truthful to your current solver)
  if (mode === 'rsrp') return zRsrp;

  // Deterministic hash-based pseudo random in [0, 1)
  const prand01 = (i: number, j: number, seed = 1337): number => {
    // A tiny integer hash → float
    let x = (i * 374761393 + j * 668265263 + seed * 1442695040888963407) | 0;
    x ^= x >>> 13;
    x = Math.imul(x, 1274126177);
    x ^= x >>> 16;
    // Convert to [0,1)
    return ((x >>> 0) % 1000000) / 1000000;
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // --- Demo mapping knobs (tune if you want more/less difference) ---
  // Base mapping: RSRP(-120..-60) -> p(0..1)
  // Using a fixed "truth" range keeps SINR/UL/DL stable across dynamic range changes.
  // (Dynamic range still affects Plotly zmin/zmax and colorbar; the underlying field stays consistent.)
  const RSRP_LO = -120;
  const RSRP_HI = -60;

  // SINR target range (demo)
  const SINR_LO = -10;
  const SINR_HI = 30;

  // Interference field strength (bigger => more distortion vs RSRP)
  const INTERF_DB = 18; // 12~22 is reasonable for demo

  // Local ripple strength (adds "texture" so contours don't look identical)
  const RIPPLE_DB = 6;  // 3~8

  // Small deterministic noise (+/-) to break symmetry but not flicker
  const NOISE_DB = 1.2; // 0.5~2

  // UL/DL caps (demo)
  const UL_MAX = 200;
  const DL_MAX = 1000;

  // Build an "interference field" in [-1, 1] that depends on (i,j) only
  // This is what makes SINR not look like a simple rescale of RSRP.
  const interferenceField = (i: number, j: number): number => {
    // Normalize indices to roughly -1..1
    const u = (i / Math.max(1, nx - 1)) * 2 - 1;
    const v = (j / Math.max(1, nz - 1)) * 2 - 1;

    // Two large-scale waves + a diagonal gradient: looks like multi-source interference
    const w1 = Math.sin(u * 3.2 + v * 1.6);
    const w2 = Math.cos(u * 1.7 - v * 2.9);
    const grad = (u * 0.6 + v * 0.4);

    // Combine then clamp to [-1,1]
    const mix = 0.55 * w1 + 0.35 * w2 + 0.25 * grad;
    return clamp(mix, -1, 1);
  };

  // Add small-scale ripples (also deterministic)
  const rippleField = (i: number, j: number): number => {
    const u = i / Math.max(1, nx - 1);
    const v = j / Math.max(1, nz - 1);
    const r = Math.sin(u * 18.0) * Math.cos(v * 14.0); // [-1,1]
    return r;
  };

  // deterministic noise in [-1,1]
  const noiseSigned = (i: number, j: number): number => (prand01(i, j, 99173) * 2 - 1);

  // Prepare output
  const out: number[][] = new Array(nz);
  for (let j = 0; j < nz; j++) {
    const rowOut = new Array(nx);
    for (let i = 0; i < nx; i++) {
      const rsrp = zRsrp[j][i];

      // 1) Base normalized strength p in [0,1]
      const p = clamp((rsrp - RSRP_LO) / (RSRP_HI - RSRP_LO), 0, 1);

      // 2) Base SINR from p (monotonic)
      let sinrBase = lerp(SINR_LO, SINR_HI, p);

      // 3) Subtract interference (makes shape different from RSRP)
      const interf = interferenceField(i, j); // [-1,1]
      sinrBase -= interf * INTERF_DB;

      // 4) Add ripples + tiny noise
      const rip = rippleField(i, j);          // [-1,1]
      const n = noiseSigned(i, j);            // [-1,1]
      let sinr = sinrBase + rip * RIPPLE_DB + n * NOISE_DB;

      // Clamp SINR to demo bounds to avoid ridiculous spikes
      sinr = clamp(sinr, SINR_LO - 8, SINR_HI + 8);

      // Output per mode
      if (mode === 'sinr') {
        rowOut[i] = sinr;
        continue;
      }

      // UL/DL: non-linear mapping from SINR to Mbps (demo)
      // Use max(sinr,0) for throughput and log curve; add tiny deterministic wiggle.
      const sinrPos = Math.max(0, sinr);
      const spectral = Math.log2(1 + sinrPos); // grows slowly with SINR
      const wiggle = 1 + 0.04 * noiseSigned(i, j); // +/-4%

      if (mode === 'ul_rate') {
        // UL is smaller
        const ul = clamp(spectral * 55 * wiggle, 0, UL_MAX);
        rowOut[i] = ul;
        continue;
      }

      if (mode === 'dl_rate') {
        // DL is larger
        const dl = clamp(spectral * 260 * wiggle, 0, DL_MAX);
        rowOut[i] = dl;
        continue;
      }

      // coverage should not go through plotly flow, but keep safe fallback
      rowOut[i] = rsrp;
    }
    out[j] = rowOut;
  }

  return out;
}

  // ===== [HEATMAP_PHASE4.4:PLOTLY_RENDER] =====
  // Purpose: Render RSRP z-matrix as Plotly heatmap in hidden div
  // ====================================
  private async renderPlotlyHeatmap(
    z: Array<Array<number | null>>,
    nx: number,
    nz: number,
    cellSize: number,
    range: { zmin: number; zmax: number; colorscale?: any; showscale?: boolean; zsmooth?: any },
    traceId?: number,
    /** When set, layout/toImage pixel size follows raw raster aspect (world extent); z may still be display-sized. */
    plotWorldRaster?: {
      rawNx: number;
      rawNz: number;
      worldWidth: number;
      worldDepth: number;
    }
  ): Promise<void> {
    if (!this.plotlyHostRef?.nativeElement) {
      console.warn('[Heatmap][Plotly] renderPlotlyHeatmap: no host element');
      return;
    }

    const host = this.plotlyHostRef.nativeElement;

    const DBG_PLOTLY_REVERSE_Y = (window as any).__hmPlotlyReverseY ?? true;
    const meta = this.DIST_MODE_META[this.distMode] ?? this.DIST_MODE_META.rsrp;

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][ORIENTATION][PLOTLY]', {
        yaxis_autorange: 'reversed',
        effect:
          "Plotly draws z[0] (first row, j=0) at the TOP of the heatmap / PNG; z[nz-1] at the BOTTOM. x[i] increases left→right (i=0 left).",
        displayMatrixRowsCols: { nz, nx },
        worldRasterForPixelAspect: plotWorldRaster
          ? { rawNx: plotWorldRaster.rawNx, rawNz: plotWorldRaster.rawNz }
          : 'zDims_used_when_plotWorldRaster_absent',
        phase2_displayPath:
          'z passed here is displayMatrix; row/col semantics match raw z[j][i] (j=row, i=col), only subsampled.',
        windowFlag___hmPlotlyReverseY: DBG_PLOTLY_REVERSE_Y,
        note_windowFlagUnused:
          '__hmPlotlyReverseY is read but layout always sets yaxis.autorange=reversed; change requires code edit.',
      });
    }

    // Use world dimensions (meters) for pixel aspect ratio so the PNG matches the Babylon floor plane.
    // When resolution > 1m, rawNx/rawNz (cell count) differs from worldWidth/worldDepth (meters),
    // causing non-uniform texture stretch and BS-heatmap misalignment. World dims are always correct.
    const extentNx = (plotWorldRaster?.worldWidth != null && plotWorldRaster.worldWidth > 0)
      ? plotWorldRaster.worldWidth
      : (plotWorldRaster?.rawNx ?? nx);
    const extentNz = (plotWorldRaster?.worldDepth != null && plotWorldRaster.worldDepth > 0)
      ? plotWorldRaster.worldDepth
      : (plotWorldRaster?.rawNz ?? nz);
    const minPx = 256;
    let pxW: number;
    let pxH: number;
    if (extentNx <= 0 || extentNz <= 0) {
      pxW = minPx;
      pxH = minPx;
    } else if (extentNx >= minPx && extentNz >= minPx) {
      pxW = extentNx;
      pxH = extentNz;
    } else {
      const s = Math.max(minPx / extentNx, minPx / extentNz);
      pxW = Math.max(minPx, Math.round(extentNx * s));
      pxH = Math.max(minPx, Math.round(extentNz * s));
    }

    if (this.DEBUG_HEATMAP) {
      if (plotWorldRaster) {
        console.log('[HEATMAP][TEXTURE_MAPPING]', {
          groundWidth: plotWorldRaster.worldWidth,
          groundDepth: plotWorldRaster.worldDepth,
          worldRasterNx: extentNx,
          worldRasterNz: extentNz,
          zDataRows: nz,
          zDataCols: nx,
          plotlyPixelWidth: pxW,
          plotlyPixelHeight: pxH,
        });
      }
      console.log('[HEATMAP_WORLD_MAPPING] extentSource:', plotWorldRaster?.worldWidth ? 'worldDims' : 'cellCount',
        '| extentNx:', extentNx, 'extentNz:', extentNz,
        '| pxW:', pxW, 'pxH:', pxH,
        '| cellCount(nx,nz):', nx, nz,
        '| aspectRatio:', (extentNx / extentNz).toFixed(3));
    }

    if (traceId != null && this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][PIPELINE_TRACE]', {
        traceId,
        step: 4,
        checkpoint: 'before-plotly-data-construction',
        zRows: nz,
        zCols: nx,
        extentNx,
        extentNz,
        pxW,
        pxH,
      });
    }

    const heatTrace = {
      type: 'heatmap',
      z,
      zmin: range.zmin,
      zmax: range.zmax,
      colorscale: range.colorscale ?? meta.colorscale,
      reversescale: false,
      showscale: range.showscale ?? false,
      hoverinfo: 'skip',
      zsmooth: range.zsmooth ?? 'best',
    } as any;

    const layout: any = {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      autosize: false,
      width: pxW,
      height: pxH,
      xaxis: { visible: false, showgrid: false, zeroline: false, showticklabels: false },
      yaxis: { visible: false, showgrid: false, zeroline: false, showticklabels: false, autorange: 'reversed' },
    };

    const config: any = {
      staticPlot: true,
      displayModeBar: false,
      responsive: false,
    };

    if (traceId != null && this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][PIPELINE_TRACE]', {
        traceId,
        step: 5,
        checkpoint: 'after-plotly-data-construction',
      });
    }

    try {
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 6,
          checkpoint: 'before-plotly-newPlot',
        });
      }
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][PLOTLY] about to render'); }
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.newPlot:about-to-render');
      }
      const plotlyRows = Array.isArray(z) ? z.length : 0;
      const plotlyCols = Array.isArray(z) && z[0] ? z[0].length : 0;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PLOTLY_INPUT]', {
          mode: (this as any).distributionMode ?? this.distMode ?? 'unknown',
          rows: plotlyRows,
          cols: plotlyCols,
          total: plotlyRows * plotlyCols,
          zmin: range.zmin,
          zmax: range.zmax,
        });
        console.log('[HEATMAP][PLOTLY_Y_REVERSED] enabled');
      }
      await (Plotly as any).newPlot(host, [heatTrace], layout, config);
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PLOTLY] render called');
        console.log('[HEATMAP][PLOTLY] render success');
      }
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 7,
          checkpoint: 'after-plotly-newPlot',
        });
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.newPlot:success');
      }

      (host as any).__hmNx = extentNx;
      (host as any).__hmNz = extentNz;
      (host as any).__hmPxW = pxW;
      (host as any).__hmPxH = pxH;

      if (this.DEBUG_HEATMAP) {
        console.log('[Heatmap][Plotly] optimized render', {
          zmin: range.zmin,
          zmax: range.zmax,
          zDataCols: nx,
          zDataRows: nz,
          extentNx,
          extentNz,
          coverage: `${(extentNx * cellSize / 1000).toFixed(1)}km × ${(extentNz * cellSize / 1000).toFixed(1)}km`,
          zsmooth: range.zsmooth ?? 'best',
          colorNodes: Array.isArray(range.colorscale) ? range.colorscale.length : 11,
        });
        console.log('[Heatmap][Plotly] rendered', {
          zDataCols: nx,
          zDataRows: nz,
          extentNx,
          extentNz,
          cellSize,
          range,
        });
      }
    } catch (err) {
      console.error('[HEATMAP][PLOTLY] render failed', err);
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.newPlot:failed');
      }
      console.error('[Heatmap][Plotly] render failed', err);
    }
  }

  // ===== [HEATMAP_PHASE4.5:PLOTLY_TO_IMAGE] =====
  // Purpose: Export Plotly heatmap to PNG dataURL
  // ====================================
  private async exportPlotlyToPngDataUrl(traceId?: number): Promise<string | null> {
    if (!this.plotlyHostRef?.nativeElement) {
      console.warn('[Heatmap][Plotly] exportPlotlyToPngDataUrl: no host element');
      return null;
    }

    try {
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][PNG] start export'); }
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.toImage:start');
      }
      const host = this.plotlyHostRef.nativeElement;
      const pxW = (host as any).__hmPxW ?? 800;
      const pxH = (host as any).__hmPxH ?? 600;

      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 8,
          checkpoint: 'before-plotly-toImage',
          pxW,
          pxH,
        });
      }

      const url = await (Plotly as any).toImage(host, {
        format: 'png',
        width: pxW,
        height: pxH,
        scale: 2,
      });
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 9,
          checkpoint: 'after-plotly-toImage',
          urlLen: url?.length ?? 0,
        });
      }
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][PNG] success', url?.length); }
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.toImage:success');
      }
      if (this.DEBUG_HEATMAP) { console.log('[Heatmap][Plotly] toImage ok', { len: url?.length ?? 0, head: url?.slice(0, 32) }); }
      return url;
    } catch (err) {
      console.error('[HEATMAP][PNG] failed', err);
      if (traceId != null && this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'plotly.toImage:failed');
      }
      console.error('[Heatmap][Plotly] toImage failed', err);
      return null;
    }
  }

  // ===== [HEATMAP_PHASE5.1:ENSURE_PLANE] =====
  // Purpose: Create or update heatmap overlay plane
  // ====================================
  private ensureHeatmapPlaneForPlotly(floorMesh: AbstractMesh, sliceY: number): Mesh {
    const bb = floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const max = bb.maximumWorld;

    const width = max.x - min.x;
    const depth = max.z - min.z;

    const centerX = (min.x + max.x) * 0.5;
    const centerZ = (min.z + max.z) * 0.5;

    const name = 'plotly_heatmap_plane';

    if (!this.heatmapPlane || (this.heatmapPlane && this.heatmapPlane.isDisposed())) {
      this.heatmapPlane = MeshBuilder.CreateGround(
        name,
        { width, height: depth, subdivisions: 1 },
        this.scene
      );
      this.heatmapPlane.isPickable = true;

      this.heatmapMat = new StandardMaterial('plotly_heatmap_mat', this.scene);
      this.heatmapMat.backFaceCulling = false;
      this.heatmapMat.disableLighting = true;
      this.heatmapPlane.material = this.heatmapMat;
      this.hmDbgLogGroundUv(this.heatmapPlane, 'plotly_heatmap_plane');
    } else {
      // 若尺寸變動：重建（最簡單、最穩）
      const old = this.heatmapPlane;
      old.dispose(false, true);
      this.heatmapPlane = undefined;
      return this.ensureHeatmapPlaneForPlotly(floorMesh, sliceY);
    }

    this.heatmapPlane.position.x = centerX;
    this.heatmapPlane.position.z = centerZ;
    this.heatmapPlane.position.y = sliceY + 0.03;
    this.heatmapPlane.isPickable = true;

    // Phase 5.4: Render with ground layer (renderingGroupId=0) so buildings/antennas overlay properly
    this.heatmapPlane.renderingGroupId = 0;
    if (this.heatmapMat) {
      this.heatmapMat.zOffset = 1;
    }

    // [HEATMAP_PLANE_META] — verify plane bounding box aligns with floor bounding box
    this.heatmapPlane.computeWorldMatrix(true);
    const planeBB = this.heatmapPlane.getBoundingInfo().boundingBox;
    const planeBMin = planeBB.minimumWorld;
    const planeBMax = planeBB.maximumWorld;
    const planeWorldWidth = planeBMax.x - planeBMin.x;
    const planeWorldDepth = planeBMax.z - planeBMin.z;
    const absPos = this.heatmapPlane.getAbsolutePosition();
    console.log('[HEATMAP_PLANE_META]', {
      floorMin:         { x: +min.x.toFixed(3),     z: +min.z.toFixed(3) },
      floorMax:         { x: +max.x.toFixed(3),     z: +max.z.toFixed(3) },
      floorCenter:      { x: +centerX.toFixed(3),   z: +centerZ.toFixed(3) },
      floorWorldWidth:  +width.toFixed(3),
      floorWorldDepth:  +depth.toFixed(3),
      planePosition:    { x: +this.heatmapPlane.position.x.toFixed(3), y: +this.heatmapPlane.position.y.toFixed(3), z: +this.heatmapPlane.position.z.toFixed(3) },
      planeAbsolutePosition: { x: +absPos.x.toFixed(3), y: +absPos.y.toFixed(3), z: +absPos.z.toFixed(3) },
      planeScaling:     { x: +this.heatmapPlane.scaling.x.toFixed(3), y: +this.heatmapPlane.scaling.y.toFixed(3), z: +this.heatmapPlane.scaling.z.toFixed(3) },
      planeRotation:    { x: +this.heatmapPlane.rotation.x.toFixed(4), y: +this.heatmapPlane.rotation.y.toFixed(4), z: +this.heatmapPlane.rotation.z.toFixed(4) },
      planeParentName:  this.heatmapPlane.parent?.name ?? null,
      planeBoundingMin: { x: +planeBMin.x.toFixed(3), z: +planeBMin.z.toFixed(3) },
      planeBoundingMax: { x: +planeBMax.x.toFixed(3), z: +planeBMax.z.toFixed(3) },
      planeWorldWidth:  +planeWorldWidth.toFixed(3),
      planeWorldDepth:  +planeWorldDepth.toFixed(3),
      alignOK: {
        minX: Math.abs(planeBMin.x - min.x) < 0.05,
        maxX: Math.abs(planeBMax.x - max.x) < 0.05,
        minZ: Math.abs(planeBMin.z - min.z) < 0.05,
        maxZ: Math.abs(planeBMax.z - max.z) < 0.05,
      },
    });

    return this.heatmapPlane;
  }

  // ===== [HEATMAP_PHASE5.1:APPLY_TEXTURE] =====
  // Purpose: Apply PNG dataURL texture to heatmap material
  // ====================================
  private applyPngDataUrlToHeatmap(pngDataUrl: string, traceId?: number): void {
    if (!this.heatmapMat) return;
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][BABYLON] applying texture'); }
    if (traceId != null && this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][TRACE]', traceId, 'babylon.applyTexture:start');
    }

    const tex = new Texture(pngDataUrl, this.scene, true, false);
    tex.hasAlpha = true;
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][ORIENTATION][BABYLON_TEXTURE]', {
        textureConstructor: { noMipmap: true, invertY: false },
        meaning_invertY_false:
          'Babylon Texture 4th arg invertY=false: standard DOM/canvas row order vs GPU v; combine with heatmap plane UV and __hmFlipV when diagnosing N/S flip.',
        devFlipV___hmFlipV: (window as any).__hmFlipV === true,
        afterApply: 'vScale/vOffset set below from __hmFlipV',
        heatmapPlaneMesh:
          'plotly_heatmap_plane: CreateGround(width=floorWorldX, height=floorWorldZ); local +X=world +X, +Z=world +Z; default ground UV runs u along width (X), v along depth (Z).',
      });
    }

    // tex.uScale = -1;
    // tex.uOffset = 1;
    // tex.vScale = -1;
    // tex.vOffset = 1;

    tex.onLoadObservable.add(() => {
      const s = tex.getSize();
      if (this.DEBUG_HEATMAP) { console.log('[Heatmap][Babylon] tex loaded', { w: s.width, h: s.height, urlHead: pngDataUrl.slice(0, 24) }); }
    });

    // Phase 5.2: Use emissive to ensure visibility regardless of lighting
    this.heatmapMat.disableLighting = true;
    this.heatmapMat.emissiveTexture = tex;
    this.heatmapMat.opacityTexture = tex;

    // Phase 5.2: Enable transparency mode explicitly
    this.heatmapMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.heatmapMat.separateCullingPass = true;
    this.heatmapMat.useAlphaFromDiffuseTexture = true;

    // Phase 5.4: Semi-transparent overlay (default 0.45) to avoid occluding buildings/antennas
    this.heatmapMat.alpha = 0.45;

    // Phase 5.3: Dev-only flipV control for orientation testing
    const DBG_TEX_FLIP_V = (window as any).__hmFlipV ?? false;
    if (DBG_TEX_FLIP_V) {
      tex.vScale = -1;
      tex.vOffset = 1;
    } else {
      tex.vScale = 1;
      tex.vOffset = 0;
    }
    if (this.DEBUG_HEATMAP) { console.log('[Heatmap][Babylon] tex flip', { flipV: DBG_TEX_FLIP_V }); }

    // Phase 5.4: Dev-only alpha control for dynamic transparency testing
    const DBG_ALPHA = (window as any).__hmAlpha;
    if (typeof DBG_ALPHA === 'number') {
      this.heatmapMat.alpha = Math.max(0, Math.min(1, DBG_ALPHA));
    }
    if (this.DEBUG_HEATMAP) {
      console.log('[Heatmap][Babylon] alpha', { alpha: this.heatmapMat.alpha });
      console.log('[HEATMAP][BABYLON] texture applied');
    }
    if (traceId != null && this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][TRACE]', traceId, 'babylon.applyTexture:success');
    }
  }

  // ===== [HEATMAP_PHASE3.3:RAY_BLOCKER_ATTENUATION] =====
  // Purpose: Compute total blocker attenuation via multi-height ray casting
  // ====================================
  private computeBlockerAttenuation(
    antennaPos: Vector3,
    samplePos: Vector3,
    blockers: AbstractMesh[]
  ): number {
    if (!this.scene || blockers.length === 0) {
      return 0;
    }

    // Multi-height ray band for accurate building intersection
    const rayHeights = [1.05, 5, 10];
    const hitBlockerSet = new Set<AbstractMesh>();

    for (const h of rayHeights) {
      const origin = antennaPos.clone();
      const target = samplePos.clone();
      origin.y = h;
      target.y = h;

      const dir = target.subtract(origin);
      const len = dir.length();
      if (len <= 0.001) continue;

      const ray = new Ray(origin, dir.normalize(), len);

      // No predicate - get all hits
      const hits = this.scene.multiPickWithRay(ray) ?? [];

      for (const hit of hits) {
        const picked = hit?.pickedMesh as AbstractMesh | null;
        if (!picked) continue;

        // Walk up parent chain to find a registered blocker mesh
        let cur: any = picked;
        while (cur) {
          if (blockers.includes(cur as AbstractMesh)) {
            hitBlockerSet.add(cur as AbstractMesh);
            break;
          }
          cur = cur.parent ?? null;
        }
      }
    }

    // Accumulate attenuation from unique hit blockers
    let totalAttenuation = 0;
    const hitArr = Array.from(hitBlockerSet);
    for (const mesh of hitArr) {
      const raw = (mesh as any)?.metadata?.attenuationDB;
      const n = Number(raw);
      const att = (Number.isFinite(n) && n > 0) ? n : 15;
      totalAttenuation += att;
    }

    // Debug: inspect first hit mesh
    const m0 = hitArr[0] ?? null;
    console.log('[RSRP][DBG][Hit0]', m0 ? {
      name: m0.name,
      meta: (m0 as any).metadata ?? null,
      rawAtt: (m0 as any)?.metadata?.attenuationDB,
      numAtt: Number((m0 as any)?.metadata?.attenuationDB),
      metaKeys: Object.keys((m0 as any)?.metadata ?? {}),
    } : null);

    console.log('[RSRP][DBG][MultiRay]', {
      heights: rayHeights,
      hitCount: hitArr.length,
      hitNames: hitArr.slice(0, 5).map(m => m.name),
      hitMetaSample: hitArr.slice(0, 3).map(m => ({
        name: m.name,
        metaType: (m as any)?.metadata?.type ?? null,
        rawAtt: (m as any)?.metadata?.attenuationDB ?? null,
      })),
      totalAttenuation,
    });

    return totalAttenuation;
  }

  private computeAttenuationMultiRay(
    antennaPos: Vector3,
    samplePos: Vector3,
    blockers: AbstractMesh[]
  ): { att: number; hitCount: number; hitNames: string[] } {
    if (!this.scene || blockers.length === 0) {
      return { att: 0, hitCount: 0, hitNames: [] };
    }

    const rayHeights = [1.05, 5, 10];
    const hitBlockerSet = new Set<AbstractMesh>();

    for (const h of rayHeights) {
      const origin = antennaPos.clone();
      const target = samplePos.clone();
      origin.y = h;
      target.y = h;

      const dir = target.subtract(origin);
      const len = dir.length();
      if (len <= 0.001) continue;

      const ray = new Ray(origin, dir.normalize(), len);
      const hits = this.scene.multiPickWithRay(ray) ?? [];

      for (const hit of hits) {
        const picked = hit?.pickedMesh as AbstractMesh | null;
        if (!picked) continue;

        let cur: any = picked;
        while (cur) {
          if (blockers.includes(cur as AbstractMesh)) {
            hitBlockerSet.add(cur as AbstractMesh);
            break;
          }
          cur = cur.parent ?? null;
        }
      }
    }

    let totalAttenuation = 0;
    const hitArr = Array.from(hitBlockerSet);
    for (const mesh of hitArr) {
      const raw = (mesh as any)?.metadata?.attenuationDB ?? (mesh as any)?.metadata?.attenuation;
      const n = Number(raw);
      const att = (Number.isFinite(n) && n > 0) ? n : 15;
      totalAttenuation += att;
    }

    const hitNames = hitArr.slice(0, 3).map(m => m.name);
    return { att: totalAttenuation, hitCount: hitArr.length, hitNames };
  }

  // ===== [HEATMAP_PHASE3.2:GRID_RSRP_BATCH] =====
  // Purpose: Compute RSRP for all grid points (with blocker attenuation)
  // ====================================
  private computeRSRPMatrixForGrid(
    antennaPos: Vector3,
    meta: any,
    cellSize: number,
    blockers: AbstractMesh[]
  ): Map<string, number> {
    // [Heatmap][RSRP] temp ensure pickable for blockers (dev/validation)
    for (const b of blockers) {
      b.isPickable = true;
    }

    const rsrpMap = new Map<string, number>();

    // Find antenna cell index for debug logging
    const antennaI = Math.floor((antennaPos.x - meta.min.x) / cellSize);
    const antennaJ = Math.floor((antennaPos.z - meta.min.z) / cellSize);

    for (let iz = 0; iz < meta.nz; iz++) {
      for (let ix = 0; ix < meta.nx; ix++) {
        const samplePos = this.getHeatmapSamplePoint(meta.min, ix, iz, cellSize, this.plotlyHeatmapSliceHeight);
        
        // Compute base RSRP (no blocker)
        const baseRSRP = this.computeRSRP_NoBlocker(antennaPos, samplePos);
        
        // Apply blocker attenuation
        const blockerAtt = this.computeBlockerAttenuation(antennaPos, samplePos, blockers);
        const finalRSRP = baseRSRP - blockerAtt;
        
        console.log('[RSRP][DBG][AttApply]', { baseRsrp: baseRSRP, totalAttenuation: blockerAtt, finalRsrp: finalRSRP });

        const key = `${ix},${iz}`;
        rsrpMap.set(key, finalRSRP);

        // ===== [DBG] Log antenna cell for verification
        if (ix === antennaI && iz === antennaJ) {
          const d = Vector3.Distance(antennaPos, samplePos);
          const d_km = d / 1000;
          const freqMHz = 3500;
          const fspl = 32.44 + 20 * Math.log10(d_km) + 20 * Math.log10(freqMHz);
          
          // Get blocker hits for this cell
          const direction = samplePos.subtract(antennaPos);
          const length = direction.length();
          const dirNorm = direction.length() > 0.01 ? direction.normalize() : new Vector3(1, 0, 0);
          const ray = new Ray(antennaPos, dirNorm, length);
          
          let hitNames: string[] = [];
          if (this.scene) {
            const hits = this.scene.multiPickWithRay(
              ray,
              (mesh: Mesh) => blockers.includes(mesh as AbstractMesh)
            );
            if (hits) {
              hitNames = hits.slice(0, 5).map(h => h.pickedMesh?.name ?? '(null)');
            }
          }
          
          console.log('[RSRP][DBG][AntennaCellBreakdown]', {
            cellIndex: { ix, iz },
            antennaPos: antennaPos.toString?.() ?? antennaPos,
            samplePos: samplePos.toString?.() ?? samplePos,
            distance: d.toFixed(2),
            fspl: fspl.toFixed(2),
            baseRsrp: baseRSRP.toFixed(2),
            hitsCount: hitNames.length,
            hitNames,
            totalAttenuation: blockerAtt.toFixed(2),
            finalRsrp: finalRSRP.toFixed(2),
          });
        }
      }
    }

    return rsrpMap;
  }

  // ===== [HEATMAP_PHASE5.4A:DBG_STRONGEST_MARKER] =====
  // Purpose: Dev-only marker for strongest RSRP point
  // ====================================
  private upsertHeatmapStrongestMarker(pos: Vector3): void {
    if (!this.guardEditWrite('upsertHeatmapStrongestMarker')) return;
    if (!this.scene) return;

    const name = 'heatmap_dbg_strongest';
    if (!this.heatmapDbgStrongestMarker || this.heatmapDbgStrongestMarker.isDisposed()) {
      const m = MeshBuilder.CreateSphere(name, { diameter: 1.0 }, this.scene);
      m.isPickable = false;
      m.renderingGroupId = 3;

      const mat = new StandardMaterial('heatmap_dbg_strongest_mat', this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = new Color3(1, 0, 1); // 紫色
      m.material = mat;

      this.heatmapDbgStrongestMarker = m;
    }

    this.heatmapDbgStrongestMarker.position.copyFrom(pos);
    this.heatmapDbgStrongestMarker.position.y += 0.25;
    console.log('[Heatmap][DBG] strongest marker', { x: pos.x.toFixed(2), y: pos.y.toFixed(2), z: pos.z.toFixed(2) });
  }

  private upsertHeatmapAltStrongestMarker(pos: Vector3): void {
    if (!this.scene) return;

    const name = 'heatmap_dbg_strongest_alt';
    if (!this.dbgAltStrongestMarker || this.dbgAltStrongestMarker.isDisposed()) {
      const m = MeshBuilder.CreateSphere(name, { diameter: 0.8 }, this.scene);
      m.isPickable = false;
      m.renderingGroupId = 3;

      const mat = new StandardMaterial('heatmap_dbg_strongest_alt_mat', this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = new Color3(0, 1, 1); // 青色
      m.material = mat;

      this.dbgAltStrongestMarker = m;
    }

    this.dbgAltStrongestMarker.position.copyFrom(pos);
    this.dbgAltStrongestMarker.position.y += 0.35;
  }

  // ===== [HEATMAP_PHASE5.4B:DBG_ANTENNA_CELL_MARKER] =====
  // Purpose: Dev-only marker for antenna cell center
  // ====================================
  private upsertHeatmapAntennaCellMarker(pos: Vector3): void {
    if (!this.guardEditWrite('upsertHeatmapAntennaCellMarker')) return;
    if (!this.scene) return;

    const name = 'heatmap_dbg_antenna_cell';
    if (!this.heatmapDbgAntennaCellMarker || this.heatmapDbgAntennaCellMarker.isDisposed()) {
      const m = MeshBuilder.CreateSphere(name, { diameter: 1.0 }, this.scene);
      m.isPickable = false;
      m.renderingGroupId = 3;

      const mat = new StandardMaterial('heatmap_dbg_antenna_cell_mat', this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = new Color3(1, 0.4, 0); // 橘色
      m.material = mat;

      this.heatmapDbgAntennaCellMarker = m;
    }

    this.heatmapDbgAntennaCellMarker.position.copyFrom(pos);
    this.heatmapDbgAntennaCellMarker.position.y += 0.25;
  }

  // ===== [HEATMAP_RESOLUTION:PHASE0.2] =====
  // Purpose: Map resolution mode to cell size in meters
  // ====================================
  private resolveHeatmapCellSize(): number {
    let cellSize: number;

    switch (this.heatmapResolutionMode) {
      case 'preview':
        cellSize = 10;
        break;
      case 'standard':
        cellSize = 5;
        break;
      case 'detail':
        cellSize = 3;
        break;
      default:
        cellSize = 10; // Fallback to preview
    }

    console.log('[Heatmap][Res] mode->cellSize', { mode: this.heatmapResolutionMode, cellSize });
    return cellSize;
  }

  // ===== [DEV:HEATMAP_DEBUG] =====
  // Purpose: Setup keyboard shortcuts for resolution mode (dev-only)
  // ====================================
  private setupDevHeatmapDebugControls(): void {
    if (!isDevMode()) return;

    this.devHeatmapKeydownHandler = (e: KeyboardEvent) => {
      if (!this.isEditMode()) return;
      // Don't intercept if in input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.contentEditable === 'true') {
        return;
      }

      if (e.key === '1') {
        this.heatmapResolutionMode = 'preview';
        console.log('[DEV][HeatmapRes] switched', { mode: this.heatmapResolutionMode });
        e.stopPropagation();
      } else if (e.key === '2') {
        this.heatmapResolutionMode = 'standard';
        console.log('[DEV][HeatmapRes] switched', { mode: this.heatmapResolutionMode });
        e.stopPropagation();
      } else if (e.key === '3') {
        this.heatmapResolutionMode = 'detail';
        console.log('[DEV][HeatmapRes] switched', { mode: this.heatmapResolutionMode });
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', this.devHeatmapKeydownHandler, { capture: true });
    console.log('[DEV] heatmap debug controls registered (1=preview, 2=standard, 3=detail)');
  }

  // ===== [GRIDBUILDER:PHASE1.1] =====
  // Purpose: Build grid metadata using world bounding box
  // ====================================
  private buildHeatmapGridMeta(floorMesh: AbstractMesh, cellSize: number): { min: Vector3; max: Vector3; width: number; depth: number; nx: number; nz: number; } {
    const bb = floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const max = bb.maximumWorld;

    const width = max.x - min.x;
    const depth = max.z - min.z;

    const nx = Math.ceil(width / cellSize);
    const nz = Math.ceil(depth / cellSize);

    console.log('[Heatmap][Grid] meta', { width, depth, nx, nz, min, max, cellSize });

    return { min, max, width, depth, nx, nz };
  }

  // ===== [GRIDBUILDER:PHASE1.2] =====
  // Purpose: Get world coordinate of grid cell center
  // ====================================
  private getHeatmapSamplePoint(min: Vector3, i: number, j: number, cellSize: number, sliceHeight: number): Vector3 {
    return new Vector3(
      min.x + (i + 0.5) * cellSize,
      sliceHeight,
      min.z + (j + 0.5) * cellSize
    );
  }

  // ===== [HEATMAP_DBG:WORLD_TO_INDEX] =====
  // Helper: map a world (x,z) back to heatmap grid index (i,j)
  private hmDbgWorldToGridIndex(
    min: Vector3,
    cellSize: number,
    nx: number,
    nz: number,
    x: number,
    z: number
  ): { i: number; j: number } {
    const fi = (x - min.x) / cellSize - 0.5;
    const fj = (z - min.z) / cellSize - 0.5;
    let i = Math.floor(fi);
    let j = Math.floor(fj);
    i = Math.max(0, Math.min(nx - 1, i));
    j = Math.max(0, Math.min(nz - 1, j));
    return { i, j };
  }

  // ===== [DBG:COORDINATE_OVERLAYS] =====
  private dbgGeoCornerRoot: TransformNode | null = null;
  private dbgWorldAxisRoot: TransformNode | null = null;
  private dbgHeatmapAxisRoot: TransformNode | null = null;
  private dbgFloorMinAxisRoot: TransformNode | null = null;
  private dbgHeatmapPointRoot: TransformNode | null = null;

  private dbgDisposeRoot(root: TransformNode | null): void {
    try {
      root?.dispose(false, true);
    } catch {
      // ignore
    }
  }

  private dbgCreateMarkerSphere(
    root: TransformNode,
    name: string,
    pos: Vector3,
    color: Color3,
    diameter: number = 1.0
  ): Mesh {
    const sphere = MeshBuilder.CreateSphere(name, { diameter }, this.scene!);
    sphere.position.copyFrom(pos);

    const mat = new StandardMaterial(`${name}_mat`, this.scene!);
    mat.disableLighting = true;
    mat.emissiveColor = color;
    mat.diffuseColor = color;

    sphere.material = mat;
    sphere.isPickable = false;
    sphere.setParent(root);

    return sphere;
  }

  private dbgStrongestIndexToWorldCenter(
    min: Vector3,
    cellSize: number,
    i: number,
    j: number
  ): Vector3 {
    return this.getHeatmapSamplePoint(min, i, j, cellSize, this.heatmapSliceHeight);
  }

  private dbgGetCellCenter(min: Vector3, cellSize: number, i: number, j: number): Vector3 {
    return new Vector3(
      min.x + (i + 0.5) * cellSize,
      this.heatmapSliceHeight,
      min.z + (j + 0.5) * cellSize
    );
  }

  private dbgCompareZMatrixWithWorld(): void {
    const enable = (window as any).__dbgCheckZMapping === true;
    if (!enable) return;

    if (!this.plotlyHoverZ || !this.plotlyHoverMeta || !this.scene) {
      console.warn('[DBG][Z_MAPPING] missing data');
      return;
    }

    const z = this.plotlyHoverZ;
    const meta = this.plotlyHoverMeta;

    const min = meta.min;
    const cellSize = meta.cellSize;

    const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));

    const samples = [
      { name: 'origin', i: 0, j: 0 },
      { name: 'center', i: clamp(Math.floor(meta.nx / 2), meta.nx), j: clamp(Math.floor(meta.nz / 2), meta.nz) },

      { name: 'offdiag_A', i: clamp(50, meta.nx), j: clamp(200, meta.nz) },
      { name: 'offdiag_B', i: clamp(200, meta.nx), j: clamp(50, meta.nz) },
      { name: 'offdiag_C', i: clamp(120, meta.nx), j: clamp(240, meta.nz) },
      { name: 'offdiag_D', i: clamp(240, meta.nx), j: clamp(120, meta.nz) },

      { name: 'maxCorner', i: meta.nx - 1, j: meta.nz - 1 },
    ];

    console.log('[DBG][Z_MAPPING][META]', {
      nx: meta.nx,
      nz: meta.nz,
      cellSize: meta.cellSize,
    });

    for (const s of samples) {
      const vA = z[s.i]?.[s.j];
      const vB = z[s.j]?.[s.i];

      const worldA = this.dbgGetCellCenter(min, cellSize, s.i, s.j);
      const worldB = this.dbgGetCellCenter(min, cellSize, s.j, s.i);

      console.log(`[DBG][Z_MAPPING][${s.name}]`, {
        index: { i: s.i, j: s.j },
        value_assume_i_j: vA,
        value_assume_j_i: vB,
        world_assume_i_j: worldA
          ? { x: worldA.x, z: worldA.z }
          : null,
        world_assume_j_i: worldB
          ? { x: worldB.x, z: worldB.z }
          : null,
      });
    }
  }

  private dbgRefreshGeoCorners(): void {
    this.dbgDisposeRoot(this.dbgGeoCornerRoot);
    this.dbgGeoCornerRoot = null;

    const enable = (window as any).__dbgShowGeoCorners === true;
    if (!enable || !this.floorMesh || !this.scene) return;

    const bb = this.floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const max = bb.maximumWorld;

    const sw = new Vector3(min.x, min.y, min.z);
    const nw = new Vector3(min.x, max.y, max.z);
    const ne = new Vector3(max.x, max.y, max.z);
    const se = new Vector3(max.x, min.y, min.z);

    const root = new TransformNode('[DBG-GEO-CORNER-ROOT]', this.scene);
    this.dbgGeoCornerRoot = root;

    const mk = (pos: Vector3, name: string, color: Color3) => {
      const sphere = MeshBuilder.CreateSphere(name, { diameter: 0.8 }, this.scene!);
      sphere.position = pos;
      const mat = new StandardMaterial(name + '_mat', this.scene!);
      mat.emissiveColor = color;
      mat.diffuseColor = color;
      sphere.material = mat;
      sphere.setParent(root);
    };

    mk(sw, '[DBG-GEO-CORNER] SW', new Color3(0, 1, 0)); // green
    mk(nw, '[DBG-GEO-CORNER] NW', new Color3(0, 0, 1)); // blue
    mk(ne, '[DBG-GEO-CORNER] NE', new Color3(1, 0, 0)); // red
    mk(se, '[DBG-GEO-CORNER] SE', new Color3(1, 1, 0)); // yellow

    console.log('[DBG][GeoCorners]', {
      sw: { x: sw.x, y: sw.y, z: sw.z },
      nw: { x: nw.x, y: nw.y, z: nw.z },
      ne: { x: ne.x, y: ne.y, z: ne.z },
      se: { x: se.x, y: se.y, z: se.z },
    });
  }

  private dbgRefreshWorldAxes(): void {
    this.dbgDisposeRoot(this.dbgWorldAxisRoot);
    this.dbgWorldAxisRoot = null;

    const enable = (window as any).__dbgShowWorldAxes === true;
    if (!enable || !this.scene) return;

    const root = new TransformNode('[DBG-WORLD-AXIS-ROOT]', this.scene);
    this.dbgWorldAxisRoot = root;

    const origin = new Vector3(0, 0.1, 0);
    const len = 20;
    const plusX = new Vector3(len, 0.1, 0);
    const plusZ = new Vector3(0, 0.1, len);

    const mkSphere = (pos: Vector3, name: string, color: Color3) => {
      const s = MeshBuilder.CreateSphere(name, { diameter: 0.6 }, this.scene!);
      s.position = pos;
      const mat = new StandardMaterial(name + '_mat', this.scene!);
      mat.emissiveColor = color;
      mat.diffuseColor = color;
      s.material = mat;
      s.setParent(root);
    };

    const mkAxis = (start: Vector3, end: Vector3, name: string, color: Color3) => {
      const line = MeshBuilder.CreateLines(name, { points: [start, end] }, this.scene!);
      (line.color as any) = color;
      line.setParent(root);
    };

    mkSphere(origin, '[DBG-WORLD-AXIS] O', new Color3(1, 1, 1)); // white
    mkSphere(plusX, '[DBG-WORLD-AXIS] +X', new Color3(1, 0, 0)); // red
    mkSphere(plusZ, '[DBG-WORLD-AXIS] +Z', new Color3(0, 0, 1)); // blue

    mkAxis(origin, plusX, '[DBG-WORLD-AXIS-LINE] +X', new Color3(1, 0, 0));
    mkAxis(origin, plusZ, '[DBG-WORLD-AXIS-LINE] +Z', new Color3(0, 0, 1));

    console.log('[DBG][WorldAxes]', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      plusXEnd: { x: plusX.x, y: plusX.y, z: plusX.z },
      plusZEnd: { x: plusZ.x, y: plusZ.y, z: plusZ.z },
    });
  }

  private dbgRefreshHeatmapAxes(): void {
    this.dbgDisposeRoot(this.dbgHeatmapAxisRoot);
    this.dbgHeatmapAxisRoot = null;

    const enable = (window as any).__dbgShowHeatmapAxes === true;
    if (!enable || !this.scene || !this.floorMesh) return;

    const meta = this.buildHeatmapGridMeta(this.floorMesh, this.plotlyHeatmapCellSize);
    const hm00 = this.getHeatmapSamplePoint(meta.min, 0, 0, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight);
    const hm10 = meta.nx > 1
      ? this.getHeatmapSamplePoint(meta.min, 1, 0, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight)
      : hm00;
    const hm01 = meta.nz > 1
      ? this.getHeatmapSamplePoint(meta.min, 0, 1, this.plotlyHeatmapCellSize, this.plotlyHeatmapSliceHeight)
      : hm00;

    const root = new TransformNode('[DBG-HM-AXIS-ROOT]', this.scene);
    this.dbgHeatmapAxisRoot = root;

    const mkSphere = (pos: Vector3, name: string, color: Color3) => {
      const s = MeshBuilder.CreateSphere(name, { diameter: 0.5 }, this.scene!);
      s.position = pos;
      const mat = new StandardMaterial(name + '_mat', this.scene!);
      mat.emissiveColor = color;
      mat.diffuseColor = color;
      s.material = mat;
      s.setParent(root);
    };

    const mkAxis = (start: Vector3, end: Vector3, name: string, color: Color3) => {
      const line = MeshBuilder.CreateLines(name, { points: [start, end] }, this.scene!);
      (line.color as any) = color;
      line.setParent(root);
    };

    mkSphere(hm00, '[DBG-HM-AXIS] HM(0,0)', new Color3(1, 1, 1)); // white
    mkSphere(hm10, '[DBG-HM-AXIS] HM(1,0)', new Color3(1, 0, 1)); // magenta
    mkSphere(hm01, '[DBG-HM-AXIS] HM(0,1)', new Color3(0, 1, 1)); // cyan

    mkAxis(hm00, hm10, '[DBG-HM-AXIS-LINE] I', new Color3(1, 0, 1));
    mkAxis(hm00, hm01, '[DBG-HM-AXIS-LINE] J', new Color3(0, 1, 1));

    console.log('[DBG][HeatmapAxes]', {
      hm00: { x: hm00.x, y: hm00.y, z: hm00.z },
      hm10: { x: hm10.x, y: hm10.y, z: hm10.z },
      hm01: { x: hm01.x, y: hm01.y, z: hm01.z },
      nx: meta.nx,
      nz: meta.nz,
      cellSize: this.plotlyHeatmapCellSize,
    });
  }

  private dbgRefreshFloorMinAxes(): void {
    this.dbgDisposeRoot(this.dbgFloorMinAxisRoot);
    this.dbgFloorMinAxisRoot = null;

    const enable = (window as any).__dbgShowFloorMinAxes === true;
    if (!enable || !this.scene || !this.floorMesh) return;

    const bb = this.floorMesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld;
    const len = 12;

    const origin = new Vector3(min.x, 0.15, min.z);
    const plusX = new Vector3(min.x + len, 0.15, min.z);
    const plusZ = new Vector3(min.x, 0.15, min.z + len);

    const root = new TransformNode('[DBG-FLOOR-MIN-AXIS-ROOT]', this.scene);
    this.dbgFloorMinAxisRoot = root;

    const mkSphere = (pos: Vector3, name: string, color: Color3, diameter: number) => {
      const s = MeshBuilder.CreateSphere(name, { diameter }, this.scene!);
      s.position = pos;
      const mat = new StandardMaterial(name + '_mat', this.scene!);
      mat.emissiveColor = color;
      mat.diffuseColor = color;
      mat.disableLighting = true;
      s.material = mat;
      s.isPickable = false;
      s.setParent(root);
    };

    const mkAxis = (start: Vector3, end: Vector3, name: string, color: Color3) => {
      const line = MeshBuilder.CreateLines(name, { points: [start, end] }, this.scene!);
      (line.color as any) = color;
      line.isPickable = false;
      line.setParent(root);
    };

    mkSphere(origin, '[DBG-FLOOR-MIN-AXIS] O', new Color3(1, 1, 1), 1.2);
    mkSphere(plusX, '[DBG-FLOOR-MIN-AXIS] +X', new Color3(1, 0, 0), 0.6);
    mkSphere(plusZ, '[DBG-FLOOR-MIN-AXIS] +Z', new Color3(0, 0, 1), 0.6);
    mkAxis(origin, plusX, '[DBG-FLOOR-MIN-AXIS-LINE] +X', new Color3(1, 0, 0));
    mkAxis(origin, plusZ, '[DBG-FLOOR-MIN-AXIS-LINE] +Z', new Color3(0, 0, 1));

    console.log('[DBG][FloorMinAxes]', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      plusXEnd: { x: plusX.x, y: plusX.y, z: plusX.z },
      plusZEnd: { x: plusZ.x, y: plusZ.y, z: plusZ.z },
      note: 'origin = floorMesh.boundingBox.minimumWorld',
    });
  }

  private dbgCompareBBoxSouthWestWithFloorMin(): void {
    try {
      const enable = (window as any).__dbgCompareSW === true;
      if (!enable) return;

      const mapCoordinateService = this.coord as any;
      if (!this.scene || !this.floorMesh || !mapCoordinateService) return;

      const bbox =
        (this as any).committedMapMeta?.bbox ??
        mapCoordinateService.committedBBox ??
        mapCoordinateService.lastBBox;

      if (!bbox || bbox.south == null || bbox.west == null) {
        console.warn('[DBG][SW_COMPARE] bbox not available', bbox);
        return;
      }

      const bb = this.floorMesh.getBoundingInfo().boundingBox;
      const floorMin = bb.minimumWorld;

      const swFromBBox = mapCoordinateService.convertToVector3(
        bbox.south,
        bbox.west
      );

      const dx = swFromBBox.x - floorMin.x;
      const dz = swFromBBox.z - floorMin.z;

      console.log('[DBG][SW_COMPARE]', {
        bboxSW: { lat: bbox.south, lon: bbox.west },
        swFromBBox: { x: swFromBBox.x, z: swFromBBox.z },
        floorMin: { x: floorMin.x, z: floorMin.z },
        delta: { dx, dz },
        note: 'compare (BBox south-west -> world) vs (floorMesh.minimumWorld)',
      });
    } catch (e) {
      console.error('[DBG][SW_COMPARE][ERROR]', e);
    }
  }

  private dbgRefreshHeatmapPointMarkers(): void {
    this.dbgDisposeRoot(this.dbgHeatmapPointRoot);
    this.dbgHeatmapPointRoot = null;

    const enable = (window as any).__dbgShowHeatmapPoints === true;
    if (!enable || !this.scene || !this.floorMesh) return;

    const { antennas } = this.p2_collectSignalNodes(this.scene);
    const bs = antennas?.[0] ?? null;

    if (!bs || !this.plotlyHoverMeta || !this.plotlyHoverZ) {
      console.warn('[DBG][HEATMAP_POINTS] missing required data', {
        hasBs: !!bs,
        hasMeta: !!this.plotlyHoverMeta,
        hasZ: !!this.plotlyHoverZ,
      });
      return;
    }

    const root = new TransformNode('[DBG-HEATMAP-POINT-ROOT]', this.scene);
    this.dbgHeatmapPointRoot = root;

    // Use resolveBsWorldPosition to avoid double-offset when row.x/y are already world coords
    const bsRows = this.fieldDomainStore.snapshot?.existingBs ?? [];
    const bsRow0 = bsRows[0] ?? null;
    const floorBBForDbg = this.floorMesh.getBoundingInfo().boundingBox;
    const floorMinForDbg = floorBBForDbg.minimumWorld;
    const floorMaxForDbg = floorBBForDbg.maximumWorld;
    const bsResolvedDbg = bsRow0 != null
      ? this.resolveBsWorldPosition(
          bsRow0.x, bsRow0.y,
          { x: floorMinForDbg.x, z: floorMinForDbg.z },
          { x: floorMaxForDbg.x, z: floorMaxForDbg.z }
        )
      : null;
    const bsWorld = bsResolvedDbg != null
      ? new Vector3(bsResolvedDbg.worldX, this.heatmapSliceHeight, bsResolvedDbg.worldZ)
      : null;
    if (!bsWorld) return;

    const bsMarkerPos = new Vector3(bsWorld.x, this.heatmapSliceHeight + 0.6, bsWorld.z);
    this.dbgCreateMarkerSphere(
      root,
      '[DBG-HEATMAP-POINT] BS_WORLD',
      bsMarkerPos,
      new Color3(1, 0, 0),
      1.2
    );

    const meta = this.plotlyHoverMeta;
    const cellSizeX = (meta as any).cellSizeX ?? meta.cellSize;
    const cellSizeZ = (meta as any).cellSizeZ ?? meta.cellSize;

    const rawFi = (bsWorld.x - meta.min.x) / cellSizeX - 0.5;
    const rawFj = (bsWorld.z - meta.min.z) / cellSizeZ - 0.5;

    const idx = {
      i: Math.max(0, Math.min(meta.nx - 1, Math.floor(rawFi))),
      j: Math.max(0, Math.min(meta.nz - 1, Math.floor(rawFj))),
    };

    const bsCellCenter = new Vector3(
      meta.min.x + (idx.i + 0.5) * cellSizeX,
      this.heatmapSliceHeight,
      meta.min.z + (idx.j + 0.5) * cellSizeZ
    );
    this.dbgCreateMarkerSphere(
      root,
      '[DBG-HEATMAP-POINT] BS_CELL_CENTER',
      new Vector3(bsCellCenter.x, this.heatmapSliceHeight + 0.9, bsCellCenter.z),
      new Color3(1, 0.5, 0),
      1.0
    );

    let bestValue = Number.NEGATIVE_INFINITY;
    let bestI = -1;  // X-axis index
    let bestJ = -1;  // Z-axis index
    // plotlyHoverZ layout: [j][i]  (outer=j/Z-axis, inner=i/X-axis)
    for (let j = 0; j < this.plotlyHoverZ.length; j++) {
      const row = this.plotlyHoverZ[j] ?? [];
      for (let i = 0; i < row.length; i++) {
        const v = row[i];
        if (!Number.isFinite(v)) continue;
        if (v > bestValue) {
          bestValue = v;
          bestI = i;  // X-axis
          bestJ = j;  // Z-axis
        }
      }
    }

    const strongestCenter =
      new Vector3(
        meta.min.x + (bestI + 0.5) * cellSizeX,
        this.heatmapSliceHeight,
        meta.min.z + (bestJ + 0.5) * cellSizeZ
      );

    console.log('[DBG][STRONGEST_FINAL]', {
      strongest: {
        value: bestValue,
        i: bestI,
        j: bestJ,
        center: strongestCenter
          ? { x: strongestCenter.x, y: strongestCenter.y, z: strongestCenter.z }
          : null,
      },
      note: 'plotlyHoverZ[j][i]: outer=j/Z, inner=i/X. bestI=X-axis, bestJ=Z-axis.',
    });

    if (!strongestCenter) {
      if (this.DEBUG_HEATMAP) { console.warn('[DBG][HEATMAP_POINTS] strongest cell not found'); }
      return;
    }

    console.log('[STRONGEST_MARKER_CREATE]', 'creating backend strongest');
    this.dbgCreateMarkerSphere(
      root,
      '[DBG-HEATMAP-POINT] STRONGEST_CELL_FINAL',
      new Vector3(strongestCenter.x, this.heatmapSliceHeight + 1.2, strongestCenter.z),
      new Color3(0.6, 0, 1),
      1.0
    );

    if (this.DEBUG_HEATMAP) {
      console.log('[DBG][HEATMAP_POINTS]', {
        bsWorld: bsWorld ? { x: bsWorld.x, y: bsWorld.y, z: bsWorld.z } : null,
        bsGridIndex: idx ?? null,
        bsCellCenter: bsCellCenter
          ? { x: bsCellCenter.x, y: bsCellCenter.y, z: bsCellCenter.z }
          : null,
        strongest: {
          value: bestValue,
          i: bestI,
          j: bestJ,
          center: strongestCenter
            ? { x: strongestCenter.x, y: strongestCenter.y, z: strongestCenter.z }
            : null,
        },
        note: 'red=BS world, orange=BS mapped cell center, purple=strongest cell center',
      });
    }
  }

  refreshDebugCoordinateOverlays(): void {
    this.dbgRefreshGeoCorners();
    this.dbgRefreshWorldAxes();
    this.dbgRefreshHeatmapAxes();
    this.dbgRefreshFloorMinAxes();
    this.dbgCompareBBoxSouthWestWithFloorMin();
    this.dbgRefreshHeatmapPointMarkers();
  }

  // ===== [HEATMAP_DBG:Z_PATTERN] =====
  // Enabled only when window.__hmDbgPattern is set ('corners'|'gradJ'|'gradI'|'singleHot')
  private hmDbgBuildPatternZ(nx: number, nz: number, mode: 'corners' | 'gradJ' | 'gradI' | 'singleHot'): number[][] {
    const z: number[][] = Array.from({ length: nz }, () => Array.from({ length: nx }, () => 0));

    if (mode === 'corners') {
      z[0][0] = 100;                  // top-left
      z[0][nx - 1] = 200;             // top-right
      z[nz - 1][0] = 300;             // bottom-left
      z[nz - 1][nx - 1] = 400;        // bottom-right
      return z;
    }

    if (mode === 'gradJ') {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) z[j][i] = j;
      return z;
    }

    if (mode === 'singleHot') {
      const ci = Math.floor(nx / 2);
      const cj = Math.floor(nz / 2);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          z[j][i] = i === ci && j === cj ? 100 : 0;
        }
      }
      return z;
    }

    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) z[j][i] = i;
    return z;
  }

  // ===== [HEATMAP_DBG:UV_LOG] =====
  // Enabled only when window.__hmDbgUV === true
  private hmDbgLogGroundUv(mesh: Mesh, tag: string): void {
    try {
      if ((window as any).__hmDbgUV !== true) return;

      const uv = mesh.getVerticesData(VertexBuffer.UVKind);
      if (!uv || uv.length < 8) {
        console.warn(`[Heatmap][UVDBG] ${tag} uv missing/too-short`, { len: uv?.length ?? 0 });
        return;
      }

      const head = uv.slice(0, 8);
      let uMin = Number.POSITIVE_INFINITY, uMax = Number.NEGATIVE_INFINITY;
      let vMin = Number.POSITIVE_INFINITY, vMax = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < uv.length; k += 2) {
        const u = uv[k], v = uv[k + 1];
        uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
        vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
      }
      console.log(`[Heatmap][UVDBG] ${tag}`, { head, uMin, uMax, vMin, vMax });
    } catch (e) {
      console.warn('[Heatmap][UVDBG] exception', e);
    }
  }

  // ===== [SIM_API_PHASE4][SINR_HEATMAP_EXTRACTOR] =====
  private parseBackendZValue(raw: any): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

    if (Array.isArray(raw)) {
      for (const value of raw) {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return null;
    }

    if (typeof raw === 'string') {
      try {
        return this.parseBackendZValue(JSON.parse(raw));
      } catch {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }

    return null;
  }

  private readBackendCellValue(cell: any): number | null {
    if (typeof cell === 'number') {
      return Number.isFinite(cell) ? cell : null;
    }

    if (Array.isArray(cell)) {
      for (const value of cell) {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return null;
    }

    if (cell === null || cell === undefined) return null;

    const parsed = Number(cell);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Legacy sinr raw grid resolution (same ?? chain as pre-Phase-3 sinr extractor).
  private pickLegacySinrRawMapFromResult(result: any): any[][] | null {
    const raw =
      result?.['5GOutput']?.sinrMap ??
      result?.['5GOutput']?.evaluationResult?.sinrMap ??
      result?.output?.sinrMap ??
      result?.sinrMap ??
      result?.output?.evaluationResult?.sinrMap;
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }
    return raw as any[][];
  }

  private parseBackendZValues(raw: unknown): number[] {
    if (Array.isArray(raw)) {
      return raw.map(Number).filter((n) => Number.isFinite(n));
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(Number).filter((n) => Number.isFinite(n));
        }
      } catch (err) {
        if (this.DEBUG_HEATMAP) { console.warn('[HEATMAP][Z_LEVELS] failed to parse zValue', raw, err); }
      }
    }
    return [];
  }

  private resolveHeatmapZIndex(zLevels: number[], sliceHeight: number): number {
    const exact = zLevels.findIndex((v) => Number(v) === Number(sliceHeight));
    if (exact >= 0) return exact;

    const fuzzy = zLevels.findIndex((v) => Math.abs(Number(v) - Number(sliceHeight)) < 1e-6);
    if (fuzzy >= 0) return fuzzy;

    return 0;
  }

  // Backend raw 2D grid → canonical heatmap matrix z[j][i] (mode-agnostic).
  private extractBackendHeatmapMatrix(
    rawMap: any,
    result: any
  ): {
    z: (number | null)[][];
    nx: number;
    nz: number;
    cellSize: number;
    sliceY: number;
    width: number;
    height: number;
    min: number;
    max: number;
  } | null {
    if (rawMap == null || !Array.isArray(rawMap) || rawMap.length === 0) {
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][EXTRACTOR] fail', { reason: 'empty-rawMap' }); }
      return null;
    }

    const inputMeta = result?.input ?? result ?? {};

    // Step 1: dimensions (iterative). Backend layout: raw[i][j] where i = X-axis, j = Z-axis.
    const nx_raw = rawMap.length;
    let nz_raw = 0;
    for (let i = 0; i < nx_raw; i++) {
      const row = rawMap[i];
      const len = Array.isArray(row) ? row.length : 0;
      if (len > nz_raw) nz_raw = len;
    }

    const totalCells = nx_raw * nz_raw;
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][EXTRACTOR] start', { rows: nx_raw, cols: nz_raw, totalCells }); }

    if (nx_raw <= 0 || nz_raw <= 0) {
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][EXTRACTOR] fail', { reason: 'invalid-dimensions', nx_raw, nz_raw }); }
      return null;
    }

    // Step 1.5: resolve z-level index from input.zValue + current sliceHeight
    const zLevels = this.parseBackendZValues(result?.input?.zValue);
    const zIndex = this.resolveHeatmapZIndex(zLevels, this.sliceHeight);

    // Step 2: parse cells (iterative only; same rules as legacy map path).
    const parsed: (number | null)[][] = new Array(nx_raw);
    for (let i = 0; i < nx_raw; i++) {
      const row = rawMap[i];
      const safeRow = Array.isArray(row) ? row : [];
      const outRow: (number | null)[] = new Array(nz_raw);
      for (let j = 0; j < nz_raw; j++) {
        if (j < safeRow.length) {
          const cell = safeRow[j];
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            outRow[j] = cell;
          } else if (Array.isArray(cell)) {
            const picked = cell[zIndex];
            const num = Number(picked);
            outRow[j] = Number.isFinite(num) ? num : null;
          } else {
            const num = Number(cell);
            outRow[j] = Number.isFinite(num) ? num : null;
          }
        } else {
          outRow[j] = null;
        }
      }
      parsed[i] = outRow;
    }

    // Step 3: transpose to z[j][i] (outer j = Z-axis, inner i = X-axis); Plotly row = Z, col = X.
    const z: (number | null)[][] = new Array(nz_raw);
    for (let j = 0; j < nz_raw; j++) {
      const zRow: (number | null)[] = new Array(nx_raw);
      for (let i = 0; i < nx_raw; i++) {
        zRow[i] = parsed[i]?.[j] ?? null;
      }
      z[j] = zRow;
    }

    const nz = nz_raw;
    const nx = nx_raw;
    if (nz <= 0 || nx <= 0) {
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][EXTRACTOR] fail', { reason: 'invalid-after-transpose', nx, nz }); }
      return null;
    }

    // Min/max without spread (Math.min(...hugeArray) overflows the call stack).
    let min = 0;
    let max = 0;
    let hasFinite = false;
    for (let j = 0; j < nz; j++) {
      const row = z[j];
      for (let i = 0; i < nx; i++) {
        const v = row[i];
        if (v != null && Number.isFinite(v)) {
          if (!hasFinite) {
            min = v;
            max = v;
            hasFinite = true;
          } else {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
    }
    if (!hasFinite) {
      min = 0;
      max = 0;
    }

    const resolutionNum =
      Number(inputMeta?.resolution) ||
      Number(result?.input?.resolution) ||
      1;
    const cellSize = Number.isFinite(resolutionNum) && resolutionNum > 0 ? resolutionNum : 1;

    const sliceY = Number.isFinite(zLevels[zIndex])
      ? zLevels[zIndex]
      : (Number(this.plotlyHeatmapSliceHeight) || 1.5);

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][Z_SELECTOR]', {
        requestedSliceHeight: this.sliceHeight,
        zLevels,
        resolvedZIndex: zIndex,
        resolvedSliceY: sliceY,
        sampleCellRaw: Array.isArray(rawMap?.[0]?.[0]) ? rawMap[0][0] : rawMap?.[0]?.[0],
        samplePickedValue: Array.isArray(rawMap?.[0]?.[0]) ? rawMap[0][0][zIndex] : rawMap?.[0]?.[0],
      });
    }

    const widthMeta = Number(inputMeta?.width);
    const heightMeta = Number(inputMeta?.height);
    const resolvedWidth = Number.isFinite(widthMeta) ? widthMeta : nx * cellSize;
    const resolvedHeight = Number.isFinite(heightMeta) ? heightMeta : nz * cellSize;

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][EXTRACTOR] success', {
        rows: nx_raw,
        cols: nz_raw,
        totalCells,
        nx,
        nz,
        cellSize,
      });
      console.log('[HEATMAP_RESOLUTION_CHECK] input.resolution:', inputMeta?.resolution,
        '-> resolutionNum:', resolutionNum, '-> cellSize:', cellSize,
        '| matrix(nx,nz):', nx, nz,
        '| worldSize(w,h):', resolvedWidth, resolvedHeight,
        '| expected cells ~= world/cellSize:', (resolvedWidth / cellSize).toFixed(1), 'x', (resolvedHeight / cellSize).toFixed(1));
    }

    return {
      z,
      nx,
      nz,
      cellSize,
      sliceY,
      width: resolvedWidth,
      height: resolvedHeight,
      min,
      max,
    };
  }

  // ====================================
  // Unified world-meta resolver for backend heatmap (resolution-first).
  // Prioritizes backend input.resolution as cell size; warns + falls back to backendWidth/colCount
  // when they disagree, and warns when floor mesh extent differs from backend expected size.
  // ====================================
  private resolveBackendHeatmapWorldMeta(
    backend: { nx: number; nz: number; cellSize: number; width: number; height: number },
    floorMesh: AbstractMesh | null | undefined
  ): {
    resolution: number;
    floorMinX: number;
    floorMinZ: number;
    floorWorldWidth: number;
    floorWorldDepth: number;
    backendWidth: number;
    backendHeight: number;
    colCount: number;
    rowCount: number;
    cellSizeX: number;
    cellSizeZ: number;
  } {
    const bb = floorMesh?.getBoundingInfo().boundingBox;
    const floorMinVec = bb?.minimumWorld ?? new Vector3(0, 0, 0);
    const floorMaxVec = bb?.maximumWorld ?? new Vector3(backend.width || backend.nx, 0, backend.height || backend.nz);
    const floorWorldWidth = floorMaxVec.x - floorMinVec.x;
    const floorWorldDepth = floorMaxVec.z - floorMinVec.z;

    const resolution = backend.cellSize > 0 ? backend.cellSize : 1;
    const backendWidth = backend.width > 0 ? backend.width : backend.nx * resolution;
    const backendHeight = backend.height > 0 ? backend.height : backend.nz * resolution;
    const colCount = backend.nx;
    const rowCount = backend.nz;

    // Primary: use resolution as cell size
    let cellSizeX = resolution;
    let cellSizeZ = resolution;

    // Fallback: if backendWidth/colCount disagrees with resolution, use that instead + warn
    if (colCount > 0 && backendWidth > 0) {
      const bwPerCell = backendWidth / colCount;
      if (Math.abs(bwPerCell - resolution) > 0.1) {
        console.warn('[HEATMAP_WORLD_META] cellSizeX: backendWidth/colCount differs from resolution — using backendWidth/colCount', {
          resolution, backendWidthPerCell: +bwPerCell.toFixed(4), colCount, backendWidth,
        });
        cellSizeX = bwPerCell;
      }
    }
    if (rowCount > 0 && backendHeight > 0) {
      const bhPerCell = backendHeight / rowCount;
      if (Math.abs(bhPerCell - resolution) > 0.1) {
        console.warn('[HEATMAP_WORLD_META] cellSizeZ: backendHeight/rowCount differs from resolution — using backendHeight/rowCount', {
          resolution, backendHeightPerCell: +bhPerCell.toFixed(4), rowCount, backendHeight,
        });
        cellSizeZ = bhPerCell;
      }
    }

    // Warn if floor mesh extent differs from backend expected extent (silent misalignment guard)
    const expectedWidth = colCount * cellSizeX;
    const expectedDepth = rowCount * cellSizeZ;
    if (Math.abs(floorWorldWidth - expectedWidth) > 1) {
      console.warn('[HEATMAP_WORLD_META] floorWorldWidth vs backend expectedWidth mismatch', {
        floorWorldWidth: +floorWorldWidth.toFixed(2), expectedWidth: +expectedWidth.toFixed(2),
        colCount, cellSizeX,
      });
    }
    if (Math.abs(floorWorldDepth - expectedDepth) > 1) {
      console.warn('[HEATMAP_WORLD_META] floorWorldDepth vs backend expectedDepth mismatch', {
        floorWorldDepth: +floorWorldDepth.toFixed(2), expectedDepth: +expectedDepth.toFixed(2),
        rowCount, cellSizeZ,
      });
    }

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP_WORLD_META]', {
        resolution,
        rowCount, colCount,
        floorMin: { x: +floorMinVec.x.toFixed(2), z: +floorMinVec.z.toFixed(2) },
        floorMax: { x: +floorMaxVec.x.toFixed(2), z: +floorMaxVec.z.toFixed(2) },
        floorWorldWidth: +floorWorldWidth.toFixed(2),
        floorWorldDepth: +floorWorldDepth.toFixed(2),
        backendWidth: +backendWidth.toFixed(2),
        backendHeight: +backendHeight.toFixed(2),
        cellSizeX: +cellSizeX.toFixed(4),
        cellSizeZ: +cellSizeZ.toFixed(4),
        expectedWidth: +expectedWidth.toFixed(2),
        expectedDepth: +expectedDepth.toFixed(2),
      });
    }

    return {
      resolution,
      floorMinX: floorMinVec.x,
      floorMinZ: floorMinVec.z,
      floorWorldWidth,
      floorWorldDepth,
      backendWidth,
      backendHeight,
      colCount,
      rowCount,
      cellSizeX,
      cellSizeZ,
    };
  }

  // ====================================
  // Unified cell-index → world-coordinate conversion.
  // i = X/column index, j = Z/row index.
  // worldX = floorMinX + (i + 0.5) * cellSizeX
  // worldZ = floorMinZ + (j + 0.5) * cellSizeZ
  // ====================================
  private heatmapCellToWorld(
    i: number,
    j: number,
    meta: { floorMinX: number; floorMinZ: number; cellSizeX: number; cellSizeZ: number }
  ): { worldX: number; worldZ: number } {
    return {
      worldX: meta.floorMinX + (i + 0.5) * meta.cellSizeX,
      worldZ: meta.floorMinZ + (j + 0.5) * meta.cellSizeZ,
    };
  }

  // ====================================
  // Detect whether a store existingBs row's x/y values are already Babylon world coords
  // or local/math offsets from floorMin (SW corner). Avoids double-offset bug.
  //
  // World test:  row.x in [floorMin.x - tol, floorMax.x + tol]
  //              row.y in [floorMin.z - tol, floorMax.z + tol]
  // Local test:  row.x in [-tol, floorWorldWidth  + tol]
  //              row.y in [-tol, floorWorldDepth + tol]
  // ====================================
  private resolveBsWorldPosition(
    rowX: number,
    rowY: number,
    floorMin: { x: number; z: number },
    floorMax: { x: number; z: number }
  ): { worldX: number; worldZ: number; detectedCoordSpace: 'world' | 'local' | 'unknown' } {
    const floorW = floorMax.x - floorMin.x;
    const floorD = floorMax.z - floorMin.z;
    const tol = 50; // metres — large enough for BS placed near edge, small enough to disambiguate

    const inWorldX = rowX >= floorMin.x - tol && rowX <= floorMax.x + tol;
    const inWorldZ = rowY >= floorMin.z - tol && rowY <= floorMax.z + tol;
    if (inWorldX && inWorldZ) {
      return { worldX: rowX, worldZ: rowY, detectedCoordSpace: 'world' };
    }

    const inLocalX = rowX >= -tol && rowX <= floorW + tol;
    const inLocalZ = rowY >= -tol && rowY <= floorD + tol;
    if (inLocalX && inLocalZ) {
      return { worldX: floorMin.x + rowX, worldZ: floorMin.z + rowY, detectedCoordSpace: 'local' };
    }

    console.warn('[BS_COORD_SOURCE][OUT_OF_RANGE]', {
      rowX, rowY,
      floorMin, floorMax,
      floorW: +floorW.toFixed(2), floorD: +floorD.toFixed(2),
      note: 'row.x/y fits neither world range nor local/math range',
    });
    return { worldX: rowX, worldZ: rowY, detectedCoordSpace: 'unknown' };
  }

  // Compatibility: legacy sinr resolution + extractBackendHeatmapMatrix.
  private extractBackendSinrHeatmap(result: any): {
    z: (number | null)[][];
    nx: number;
    nz: number;
    cellSize: number;
    sliceY: number;
    width: number;
    height: number;
    min: number;
    max: number;
  } | null {
    console.log('[SINR_DEBUG][5GOutput keys]', Object.keys(result?.['5GOutput'] ?? {}));
    console.log('[SINR_DEBUG][5GOutput.sinrMap]', result?.['5GOutput']?.sinrMap);

    const rawMap = this.pickLegacySinrRawMapFromResult(result);
    if (!rawMap) {
      return null;
    }
    const extracted = this.extractBackendHeatmapMatrix(rawMap, result);
    if (extracted) {
      console.log('[SIM_API_PHASE4][SINR_HEATMAP_EXTRACTOR][z layout is z[j][i] (outer=Z, inner=X)]', {
        nx: extracted.nx,
        nz: extracted.nz,
        cellSize: extracted.cellSize,
        sliceY: extracted.sliceY,
        width: extracted.width,
        height: extracted.height,
        min: extracted.min,
        max: extracted.max,
      });
    }
    return extracted;
  }

  /**
   * Coverage heatmap: binary z[j][i] in {0,1} ∪ {null} from backend rsrpMap / sinrMap only.
   * Uses the same extractBackendHeatmapMatrix canonical layout as other modes.
   */
  private buildCoverageHeatmapMatrix(
    result: any,
    threshold: string
  ): {
    z: (number | null)[][];
    nx: number;
    nz: number;
    cellSize: number;
    sliceY: number;
    width: number;
    height: number;
    min: number;
    max: number;
  } | null {
    const th: CoverageFilter =
      threshold === 'rsrp_minus_90' || threshold === 'sinr_15' || threshold === 'rsrp_minus_120'
        ? threshold
        : 'rsrp_minus_120';

    const out5g = result?.['5GOutput'];
    const hasRsrpMap =
      Array.isArray(out5g?.rsrpMap) && out5g.rsrpMap.length > 0;
    const hasSinrMap =
      Array.isArray(out5g?.sinrMap) && out5g.sinrMap.length > 0;

    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][COVERAGE_SOURCE]', { threshold: th, hasRsrpMap, hasSinrMap }); }

    let metricExtracted: ReturnType<
      EditSceneComponent['extractBackendHeatmapMatrix']
    > | null = null;

    if (th === 'sinr_15') {
      if (!hasSinrMap) {
        if (this.DEBUG_HEATMAP) { console.warn('[HEATMAP][COVERAGE_BUILD] sinr_15 requires 5GOutput.sinrMap'); }
        return null;
      }
      metricExtracted = this.extractBackendHeatmapMatrix(out5g.sinrMap, result);
    } else {
      if (!hasRsrpMap) {
        if (this.DEBUG_HEATMAP) { console.warn('[HEATMAP][COVERAGE_BUILD] RSRP thresholds require 5GOutput.rsrpMap'); }
        return null;
      }
      metricExtracted = this.extractBackendHeatmapMatrix(out5g.rsrpMap, result);
    }

    if (!metricExtracted) {
      return null;
    }

    const { z: zMetric, nx, nz } = metricExtracted;
    const zOut: (number | null)[][] = [];
    let coveredCount = 0;
    let uncoveredCount = 0;
    let nullCount = 0;

    for (let j = 0; j < nz; j++) {
      const row: (number | null)[] = [];
      for (let i = 0; i < nx; i++) {
        const v = zMetric[j]?.[i];
        if (v == null || !Number.isFinite(Number(v))) {
          row.push(null);
          nullCount++;
          continue;
        }
        const vn = Number(v);
        let covered: boolean;
        if (th === 'sinr_15') {
          covered = vn >= 15;
        } else if (th === 'rsrp_minus_90') {
          covered = vn >= -90;
        } else {
          covered = vn >= -120;
        }
        if (covered) {
          row.push(1);
          coveredCount++;
        } else {
          row.push(0);
          uncoveredCount++;
        }
      }
      zOut.push(row);
    }

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][COVERAGE_BUILD]', { coveredCount, uncoveredCount, nullCells: nullCount, nx, nz });
    }

    return {
      z: zOut,
      nx,
      nz,
      cellSize: metricExtracted.cellSize,
      sliceY: metricExtracted.sliceY,
      width: metricExtracted.width,
      height: metricExtracted.height,
      min: 0,
      max: 1,
    };
  }

  // Backend 2D map for `mode` from completeCalcResult (Phase 2: selection only).
  private getBackendHeatmapSourceByMode(
    result: any,
    mode: DistributionMode
  ): any[][] | null {
    let source: any = null;
    let sourceName = '';

    switch (mode) {
      case 'sinr':
        source = result?.['5GOutput']?.sinrMap;
        sourceName = '5GOutput.sinrMap';
        break;
      case 'rsrp':
        source = result?.['5GOutput']?.rsrpMap;
        sourceName = '5GOutput.rsrpMap';
        break;
      case 'dl_rate':
        source = result?.['5GOutput']?.throughputMap;
        sourceName = '5GOutput.throughputMap';
        break;
      case 'ul_rate':
        source = result?.['5GOutput']?.ulThroughputMap;
        sourceName = '5GOutput.ulThroughputMap';
        break;
      case 'coverage':
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][SOURCE_SELECTOR]', { mode, hasSource: false, sourceName: 'coverage', note: 'Phase 2: not wired yet' }); }
        return null;
      default:
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][SOURCE_SELECTOR]', { mode, hasSource: false, sourceName: 'unknown' }); }
        return null;
    }

    const hasSource = Array.isArray(source) && source.length > 0;
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][SOURCE_SELECTOR]', { mode, hasSource, sourceName }); }

    if (!hasSource) {
      return null;
    }
    return source as any[][];
  }

  private hasPerHeightValuesInCellArray(source: any): boolean {
    if (!Array.isArray(source) || source.length === 0) return false;
    const firstRow = source.find((row: any) => Array.isArray(row) && row.length > 0);
    if (!firstRow) return false;
    const firstCell = firstRow.find((cell: any) => cell != null);
    return Array.isArray(firstCell);
  }

  private resolveHeatmapMatrixByModeAndHeight(
    result: any,
    mode: string,
    sliceHeight: number
  ): any[] | null {
    if (this.DEBUG_HEATMAP) { console.log('[Heatmap][ResolveMatrix]', { mode, sliceHeight }); }

    // Coverage derives its matrix internally from rsrp/sinr — no raw source at this layer.
    if (mode === 'coverage') {
      return [];
    }

    const source = this.getBackendHeatmapSourceByMode(result, mode as DistributionMode);

    if (!source) {
      console.warn('[Heatmap][Render] matrix not found', { mode, sliceHeight });
      return null;
    }

    const hasPerHeightCellArray = this.hasPerHeightValuesInCellArray(source);

    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][PER_HEIGHT_SHAPE]', { mode, sliceHeight, hasPerHeightCellArray }); }

    if (!hasPerHeightCellArray) {
      console.warn('[Heatmap][SliceHeight] source has no per-height cell array', { mode, sliceHeight });
    }

    return source;
  }

  // ===== [Phase 8] Heatmap render cache (per key: mode + range/threshold + slice) =====
  private clearHeatmapRenderCache(): void {
    const n = this.heatmapRenderCache.size;
    this.heatmapRenderCache.clear();
    this.currentRenderedColorbarState = null;
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][CACHE] cleared', { previousEntries: n }); }
  }

  private buildColorbarStateForMode(mode: DistributionMode): {
    mode: DistributionMode;
    min: number;
    max: number;
    title: string;
    unit: string;
    colorscale?: any;
  } | null {
    if (mode === 'coverage') {
      return null;
    }
    const meta = this.DIST_MODE_META[mode as keyof typeof this.DIST_MODE_META];
    const range = this.committedRangeByMode[mode as 'sinr' | 'rsrp' | 'dl_rate' | 'ul_rate'];
    if (!meta || !range) {
      return null;
    }
    return {
      mode,
      min: range.min,
      max: range.max,
      title: meta.title,
      unit: meta.unit,
      colorscale: meta.colorscale,
    };
  }

  /** Call only after heatmap PNG + hover state successfully applied (fresh or cache). */
  private commitColorbarSnapshotForMode(mode: DistributionMode): void {
    if (mode === 'coverage') {
      this.renderPlotlyColorbar();
      return;
    }
    const snap = this.buildColorbarStateForMode(mode);
    if (!snap) {
      return;
    }
    this.currentRenderedColorbarState = snap;
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][COLORBAR] snapshot updated', { mode: snap.mode, min: snap.min, max: snap.max, unit: snap.unit }); }
    this.renderPlotlyColorbar();
  }

  private buildHeatmapCacheKey(mode: DistributionMode): string {
    const slice = Number(this.heatmapSliceHeight);
    if (mode === 'coverage') {
      return `v1|${mode}|th:${this.coverageThreshold}|slice:${slice}`;
    }
    const r =
      mode === 'sinr'
        ? this.committedRangeByMode.sinr
        : mode === 'rsrp'
          ? this.committedRangeByMode.rsrp
          : mode === 'dl_rate'
            ? this.committedRangeByMode.dl_rate
            : this.committedRangeByMode.ul_rate;
    const rm = r ?? { min: 0, max: 0 };
    return `v1|${mode}|r:${rm.min}:${rm.max}|slice:${slice}`;
  }

  private cloneHeatmapZForCache(z: (number | null)[][]): (number | null)[][] {
    return z.map((row) => row.slice());
  }

  private snapshotPlotlyHoverMetaForCache(): any {
    const m = this.plotlyHoverMeta as any;
    if (!m?.min || !m?.max) {
      return m ? { ...m } : null;
    }
    return {
      ...m,
      min: m.min.clone(),
      max: m.max.clone(),
    };
  }

  private async restoreHeatmapFromCache(entry: CachedHeatmapRender): Promise<boolean> {
    if (!this.floorMesh) {
      console.warn('[HEATMAP][CACHE] restore skipped: no floorMesh');
      return false;
    }

    this.plotlyHoverZ = entry.hoverZ.map((row) => row.slice());
    const hm = entry.hoverMeta;
    if (hm?.min?.clone && hm?.max?.clone) {
      this.plotlyHoverMeta = {
        ...hm,
        min: hm.min.clone(),
        max: hm.max.clone(),
      };
    } else {
      this.plotlyHoverMeta = hm;
    }

    this.plotlyHoverUnit = entry.unit as typeof this.plotlyHoverUnit;
    this.plotlyHeatmapCellSize = entry.cellSize;
    this.plotlyHeatmapSliceHeight = entry.sliceY;

    if (entry.dynamicRange) {
      this.heatmapMinValue = entry.dynamicRange.min;
      this.heatmapMaxValue = entry.dynamicRange.max;
    }

    this.ensureHeatmapPlaneForPlotly(this.floorMesh, entry.sliceY);
    this.applyPngDataUrlToHeatmap(entry.imageBase64);
    this.setupPlotlyHeatmapPointerTracking();
    this.isSimulationDone = true;

    this.commitColorbarSnapshotForMode(entry.mode);

    return true;
  }

  /**
   * Phase 2: build a display-only matrix for Plotly (does not mutate input).
   * Layout matches backend z[j][i]: outer = nz (rows), inner = nx (cols).
   * If within maxCells, returns the same matrix reference (identical to no-downsample path).
   */
  private downsampleHeatmapMatrixForDisplay(
    matrix: (number | null)[][],
    maxCells: number
  ): {
    displayMatrix: (number | null)[][];
    displayNx: number;
    displayNz: number;
    rowStep: number;
    colStep: number;
    applied: boolean;
  } {
    const rawNz = matrix.length;
    const rawNx = rawNz > 0 ? matrix[0]?.length ?? 0 : 0;
    const total = rawNz * rawNx;
    if (total <= maxCells || rawNz <= 0 || rawNx <= 0) {
      return {
        displayMatrix: matrix,
        displayNx: rawNx,
        displayNz: rawNz,
        rowStep: 1,
        colStep: 1,
        applied: false,
      };
    }

    const scale = Math.sqrt(total / maxCells);
    let targetNz = Math.max(1, Math.ceil(rawNz / scale));
    let targetNx = Math.max(1, Math.ceil(rawNx / scale));
    while (targetNz * targetNx > maxCells) {
      if (targetNx >= targetNz && targetNx > 1) {
        targetNx--;
      } else if (targetNz > 1) {
        targetNz--;
      } else {
        break;
      }
    }

    const rowStep = Math.ceil(rawNz / targetNz);
    const colStep = Math.ceil(rawNx / targetNx);
    const outNz = Math.ceil(rawNz / rowStep);
    const outNx = Math.ceil(rawNx / colStep);

    const displayMatrix: (number | null)[][] = new Array(outNz);
    for (let j = 0; j < outNz; j++) {
      const srcJ = j * rowStep;
      const srcRow = matrix[srcJ] ?? [];
      const row: (number | null)[] = new Array(outNx);
      for (let i = 0; i < outNx; i++) {
        const srcI = i * colStep;
        row[i] = srcRow[srcI] ?? null;
      }
      displayMatrix[j] = row;
    }

    return {
      displayMatrix,
      displayNx: outNx,
      displayNz: outNz,
      rowStep,
      colStep,
      applied: true,
    };
  }

  /**
   * Debug-only: compare geodetic north/south vs world Z vs heatmap row/texture conventions (no behavior change).
   */
  private dbgLogNorthSouthInversionProbe(params: {
    rawNx: number;
    rawNz: number;
    displayNx: number;
    displayNz: number;
    cellSize: number;
    backendWorldWidth: number;
    backendWorldDepth: number;
  }): void {
    const w = window as any;

    const bbox =
      (this as any).committedMapMeta?.bbox ??
      this.coord.committedBBox ??
      this.coord.lastBBox;

    const midLon =
      bbox && Number.isFinite(bbox.east) && Number.isFinite(bbox.west)
        ? (bbox.east + bbox.west) / 2
        : null;

    const midLat =
      bbox && Number.isFinite(bbox.north) && Number.isFinite(bbox.south)
        ? (bbox.north + bbox.south) / 2
        : null;

    let plusZIncreasesNorth: boolean | null = null;
    let plusXIncreasesEast: boolean | null = null;
    if (bbox && midLon != null) {
      const zn = this.coord.convertToVector3(bbox.north, midLon).z;
      const zs = this.coord.convertToVector3(bbox.south, midLon).z;
      plusZIncreasesNorth = zn !== zs ? zn > zs : null;
    }
    if (bbox && midLat != null) {
      const xe = this.coord.convertToVector3(midLat, bbox.east).x;
      const xw = this.coord.convertToVector3(midLat, bbox.west).x;
      plusXIncreasesEast = xe !== xw ? xe > xw : null;
    }

    const zLowEndCardinal =
      plusZIncreasesNorth === true
        ? 'south'
        : plusZIncreasesNorth === false
          ? 'north'
          : 'unknown_Z';
    const zHighEndCardinal =
      plusZIncreasesNorth === true
        ? 'north'
        : plusZIncreasesNorth === false
          ? 'south'
          : 'unknown_Z';
    const xLowEndCardinal =
      plusXIncreasesEast === true
        ? 'west'
        : plusXIncreasesEast === false
          ? 'east'
          : 'unknown_X';
    const xHighEndCardinal =
      plusXIncreasesEast === true
        ? 'east'
        : plusXIncreasesEast === false
          ? 'west'
          : 'unknown_X';

    console.log('[NS_PROBE][A][BUILDING_PLACEMENT]', {
      refPointLatLon: { lat: this.coord.refPoint.lat, lon: this.coord.refPoint.lon },
      bbox: bbox
        ? {
            south: bbox.south,
            north: bbox.north,
            west: bbox.west,
            east: bbox.east,
          }
        : null,
      __dbgDisableBuildingMirror: w.__dbgDisableBuildingMirror === true,
      note: 'MapGenerator shape uses convertToVector3 per vertex; check MapGeneratorService for any (-x,-z) vs BuildingPointAlign logs.',
    });

    if (bbox && midLon != null) {
      const vNorth = this.coord.convertToVector3(bbox.north, midLon);
      const vSouth = this.coord.convertToVector3(bbox.south, midLon);
      console.log('[NS_PROBE][A][GEO_TO_WORLD_SAMPLE]', {
        northEdge: { lat: bbox.north, lon: midLon, world: { x: vNorth.x, z: vNorth.z } },
        southEdge: { lat: bbox.south, lon: midLon, world: { x: vSouth.x, z: vSouth.z } },
        deltaZ_north_minus_south: vNorth.z - vSouth.z,
        expectNorthHigherLat: bbox.north > bbox.south,
        coordRule:
          'MapCoordinateService.convertToVector3: z = mercY(lat)-mercY(ref); larger lat → larger mercY → larger world z (same hemisphere).',
      });
    }

    type BSample = { name: string; cz: number; minZ: number; maxZ: number; osmId?: string };
    const buildingSamples: BSample[] = [];
    if (this.scene) {
      for (const m of this.scene.meshes) {
        const meta = (m as any).metadata;
        const t = meta?.type;
        if (t !== 'building' && t !== 'osm_building') continue;
        try {
          m.computeWorldMatrix(true);
          const bbw = m.getBoundingInfo().boundingBox;
          const c = bbw.centerWorld;
          buildingSamples.push({
            name: m.name,
            cz: c.z,
            minZ: bbw.minimumWorld.z,
            maxZ: bbw.maximumWorld.z,
            osmId: meta?.osmId,
          });
        } catch {
          /* skip */
        }
      }
    }
    buildingSamples.sort((a, b) => b.cz - a.cz);
    const top3 = buildingSamples.slice(0, 3);
    const bottom3 = buildingSamples.slice(Math.max(0, buildingSamples.length - 3));
    const allMinZ = buildingSamples.length
      ? Math.min(...buildingSamples.map((s) => s.minZ))
      : null;
    const allMaxZ = buildingSamples.length
      ? Math.max(...buildingSamples.map((s) => s.maxZ))
      : null;
    console.log('[NS_PROBE][A][BUILDING_WORLD_Z_SAMPLES]', {
      count: buildingSamples.length,
      highestCenterZ_top3: top3,
      lowestCenterZ_bottom3: bottom3,
      aggregateMinZ: allMinZ,
      aggregateMaxZ: allMaxZ,
    });

    console.log('[NS_PROBE][B][RAW_MATRIX_ORIENTATION]', {
      convention:
        'backend z[j][i]: j=0..nz-1 → Plotly heatmap rows (y); i=0..nx-1 → columns (x). World Z often aligns with j / lat via plotlyHoverMeta.min.z + cellSize.',
      rawNz_rows_j: params.rawNz,
      rawNx_cols_i: params.rawNx,
    });
    console.log('[NS_PROBE][B][DISPLAY_MATRIX_ORIENTATION]', {
      displayNz_rows_j: params.displayNz,
      displayNx_cols_i: params.displayNx,
      note: 'Downsample keeps same [j][i] semantics; fewer rows/cols only.',
    });
    console.log('[NS_PROBE][B][PLOTLY_YAXIS]', {
      autorangeReversed: true,
      meaning:
        "Plotly yaxis.autorange='reversed' → first row of z (j=0) draws at TOP of heatmap subplot (image top).",
    });
    console.log('[NS_PROBE][B][BABYLON_TEXTURE_FLIPV]', {
      __hmFlipV: w.__hmFlipV === true,
      effectiveFlipV: w.__hmFlipV === true,
    });
    if (this.floorMesh) {
      const bb = this.floorMesh.getBoundingInfo().boundingBox;
      const mn = bb.minimumWorld;
      const mx = bb.maximumWorld;
      console.log('[NS_PROBE][B][HEATMAP_GROUND_EXTENT]', {
        min: { x: mn.x, z: mn.z },
        max: { x: mx.x, z: mx.z },
        width: mx.x - mn.x,
        depth: mx.z - mn.z,
      });
    } else {
      console.log('[NS_PROBE][B][HEATMAP_GROUND_EXTENT]', { note: 'no floorMesh' });
    }

    const vNz =
      bbox && midLon != null ? this.coord.convertToVector3(bbox.north, midLon).z : null;
    const vSz =
      bbox && midLon != null ? this.coord.convertToVector3(bbox.south, midLon).z : null;
    console.log('[NS_PROBE][C][NORTH_SOUTH_VS_TEXTURE_ROWS]', {
      geodetic_north_lat_worldZ: vNz,
      geodetic_south_lat_worldZ: vSz,
      if_northLat_worldZ_gt_south:
        vNz != null && vSz != null ? vNz > vSz : null,
      sample_building_top3_centerZ: top3.map((s) => s.cz),
      sample_building_bottom3_centerZ: bottom3.map((s) => s.cz),
      heatmap_row0_maps_to: {
        plotly_subplot: 'TOP of PNG (j=0 row) when yaxis.autorange=reversed',
        babylon_uv:
          'Ground default UV: check v=0 vs v=1 edge vs world +Z; __hmFlipV swaps vScale if true.',
      },
      how_to_read:
        'If geodetic north has SMALLER world z than south but buildings with high lat appear at high z, suspect coord/geo. If north z order matches buildings but heatmap looks flipped vs buildings, suspect Plotly row order or Babylon flipV.',
    });

    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][ORIENTATION][EXTRACTOR_TO_WORLD]', {
        backendRawLayout: 'rawMap[outer_i][inner_j] = X index × Z index (see extractBackendHeatmapMatrix).',
        canonicalZ: 'z[j][i]: j = Z/Lon-lat axis row (nz), i = X axis col (nx); transpose from raw.',
        sceneXZ_via_getHeatmapSamplePoint:
          'World X = floorMin.x + (i+0.5)*cellSize; World Z = floorMin.z + (j+0.5)*cellSize (grid hover / sampling).',
        cellSize_m: params.cellSize,
        backendWorldWidth_m: params.backendWorldWidth,
        backendWorldDepth_m: params.backendWorldDepth,
        geoInference: {
          plusZIncreasesNorth,
          plusXIncreasesEast,
        },
      });

      console.log('[HEATMAP][ORIENTATION][EXTENT_BINDING]', {
        sameFullWorldExtent:
          'plotWorldRaster uses raw nx/nz only for Plotly canvas pixel aspect; displayMatrix supplies colors — no shrink of world width/depth.',
        rawCells: { nx: params.rawNx, nz: params.rawNz },
        displayCells: { nx: params.displayNx, nz: params.displayNz },
        downsamplePreservesEdgeSemantics:
          'display row 0 samples raw j=0; display col 0 samples raw i=0 — no row/col reversal in downsampleHeatmapMatrixForDisplay.',
        backendWidthHeight_vs_nxnz:
          'extractor width/height from input or nx*cellSize × nz*cellSize; should match simulated field extent, not display cell count.',
      });

      console.log('[HEATMAP][ROWCOL_WORLD_MEANING]', {
        rawMatrix_z_j_i: {
          rowIndex_j0: `low world-Z end of grid → ${zLowEndCardinal} (geodetic, from bbox Δz)`,
          rowIndex_jMax: `high world-Z end → ${zHighEndCardinal}`,
          colIndex_i0: `low world-X end → ${xLowEndCardinal}`,
          colIndex_iMax: `high world-X end → ${xHighEndCardinal}`,
        },
        displayMatrix_sameRowColMeaning:
          'Subsampled only; j=0 and i=0 still anchor the same world edges as raw.',
        plotly_then_png: {
          pngTopRow: `matrix row j=0 → ${zLowEndCardinal} (yaxis reversed)`,
          pngBottomRow: `matrix row j=nz-1 → ${zHighEndCardinal}`,
          pngLeftColumn: `col i=0 → ${xLowEndCardinal}`,
          pngRightColumn: `col i=nx-1 → ${xHighEndCardinal}`,
        },
        babylon_texture_chain_diagnosisOnly: {
          flipV_active: w.__hmFlipV === true,
          when_flipV_false:
            'vScale=1,vOffset=0; PNG top row may not coincide with world +Z — compare to [HEATMAP][ORIENTATION][BABYLON_TEXTURE] invertY=false.',
          when_flipV_true: 'vScale=-1,vOffset=1; vertically mirrors texture vs default.',
          fullScene_LR_plus_NS_reversal_suspects: [
            'Plotly y reversed vs backend expectation for which Z edge is row 0',
            'Babylon Texture invertY=false + ground UV + flipV vs PNG row order',
            'Mismatch between backendWorld width/depth axis order and scene +X/+Z (extractor transpose already applied)',
          ],
        },
      });
    }
  }

  // ===== [SIM_API_PHASE4–7][BACKEND_HEATMAP_RENDER] sinr / rsrp / dl / ul / coverage =====
  private async renderBackendHeatmapFromCompleteCalcResult(
    mode: DistributionMode
  ): Promise<boolean> {

    const staleLocalStrongest = this.scene?.getMeshByName('heatmap_dbg_strongest');
    if (staleLocalStrongest) {
      console.log('[STRONGEST_MARKER_DISPOSE]', staleLocalStrongest.name);
      try {
        staleLocalStrongest.dispose();
      } catch {}
    }

    if ((this as any).heatmapDbgStrongestMarker) {
      try {
        (this as any).heatmapDbgStrongestMarker.dispose();
      } catch {}
      (this as any).heatmapDbgStrongestMarker = null;
    }

    const traceId = Date.now();
    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][TRACE]', traceId, 'start');
      console.log('[HEATMAP][PIPELINE] renderBackendHeatmapFromCompleteCalcResult start', { mode });
      console.log('[HEATMAP][TRACE]', traceId, 'renderBackendHeatmapFromCompleteCalcResult:start');
    }

    if (
      mode !== 'sinr' &&
      mode !== 'rsrp' &&
      mode !== 'dl_rate' &&
      mode !== 'ul_rate' &&
      mode !== 'coverage'
    ) {
      console.warn(
        '[HEATMAP][RENDER] unsupported mode for backend heatmap render',
        { mode }
      );
      return false;
    }

    // Dispose local-sim strongest marker so it doesn't duplicate with backend heatmap marker
    if (this.heatmapDbgStrongestMarker && !this.heatmapDbgStrongestMarker.isDisposed()) {
      console.log('[STRONGEST_MARKER_DISPOSE]', 'disposing local-sim strongest');
      this.heatmapDbgStrongestMarker.dispose();
      (this as any).heatmapDbgStrongestMarker = undefined;
    }

    const result = this.lastCompleteCalcResult;
    if (!result) {
      console.warn('[HEATMAP][RENDER] no lastCompleteCalcResult');
      return false;
    }
    if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'result:ok'); }

    const cacheKey = this.buildHeatmapCacheKey(mode);
    const cached = this.heatmapRenderCache.get(cacheKey);
    if (cached && cached.mode === mode) {
      const rNonCov =
        mode !== 'coverage' ? this.committedRangeByMode[mode as 'sinr' | 'rsrp' | 'dl_rate' | 'ul_rate'] : undefined;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][CACHE] hit', {
          key: cacheKey,
          mode,
          isCoverage: mode === 'coverage',
          coverageThreshold: mode === 'coverage' ? this.coverageThreshold : undefined,
          dynamicRange: mode === 'coverage' ? undefined : rNonCov,
          sliceHeight: this.heatmapSliceHeight,
        });
      }
      return await this.restoreHeatmapFromCache(cached);
    }

    const rNonCovMiss =
      mode !== 'coverage'
        ? this.committedRangeByMode[mode as 'sinr' | 'rsrp' | 'dl_rate' | 'ul_rate']
        : undefined;
    if (this.DEBUG_HEATMAP) {
      console.log('[HEATMAP][CACHE] miss', {
        key: cacheKey,
        mode,
        isCoverage: mode === 'coverage',
        coverageThreshold: mode === 'coverage' ? this.coverageThreshold : undefined,
        dynamicRange: mode === 'coverage' ? undefined : rNonCovMiss,
        sliceHeight: this.heatmapSliceHeight,
      });
    }

    let plotlyHeatmapExtra: {
      colorscale?: any;
      zsmooth?: false | 'best';
    } = {};

    try {
      let backend: {
        z: (number | null)[][];
        nx: number;
        nz: number;
        cellSize: number;
        sliceY: number;
        width: number;
        height: number;
        min: number;
        max: number;
      };
      let actualSourceLabel: string;
      let committedRange: { min: number; max: number };

      if (mode === 'coverage') {
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:coverage:start'); }
        const cov = this.buildCoverageHeatmapMatrix(result, this.coverageThreshold);
        if (!cov) {
          if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:coverage:failed'); }
          return false;
        }
        backend = cov;
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:coverage:success'); }
        actualSourceLabel =
          'frontend-derived coverage from 5GOutput.rsrpMap / sinrMap (renderBackendHeatmapFromCompleteCalcResult)';
        committedRange = { min: 0, max: 1 };
        plotlyHeatmapExtra = {
          colorscale: this.HM_COLORSCALE_COVERAGE_BINARY,
          zsmooth: false,
        };
        this.logHeatmapModeSourceAndRange(
          'coverage',
          committedRange.min,
          committedRange.max,
          actualSourceLabel
        );
        const completeCalcResult = this.lastCompleteCalcResult;
        this.debugHeatmapMatrix('backend-coverage-before-plotly', backend.z as any);
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP][MODE_SOURCE]', {
            mode: 'coverage',
            hasSinrMap: !!completeCalcResult?.['5GOutput']?.sinrMap,
            hasRsrpMap: !!completeCalcResult?.['5GOutput']?.rsrpMap,
            hasThroughputMap: !!completeCalcResult?.['5GOutput']?.throughputMap,
            hasUlThroughputMap: !!completeCalcResult?.['5GOutput']?.ulThroughputMap,
            actualSource: actualSourceLabel,
            coverageThreshold: this.coverageThreshold,
          });
        }
      } else {
        const rawMap = this.getBackendHeatmapSourceByMode(result, mode);

        const rawForMatrix =
          mode === 'sinr'
            ? rawMap != null && Array.isArray(rawMap) && rawMap.length > 0
              ? rawMap
              : this.pickLegacySinrRawMapFromResult(result)
            : rawMap;

        const modeMeta = this.DIST_MODE_META[mode] ?? this.DIST_MODE_META.rsrp;
        actualSourceLabel =
          mode === 'sinr'
            ? 'backend 5GOutput.sinrMap (renderBackendHeatmapFromCompleteCalcResult)'
            : mode === 'rsrp'
              ? 'backend 5GOutput.rsrpMap (renderBackendHeatmapFromCompleteCalcResult)'
              : mode === 'dl_rate'
                ? 'backend 5GOutput.throughputMap (renderBackendHeatmapFromCompleteCalcResult)'
                : 'backend 5GOutput.ulThroughputMap (renderBackendHeatmapFromCompleteCalcResult)';

        const mapDebugTag =
          mode === 'sinr'
            ? '[SINR_DEBUG][sinrMap]'
            : mode === 'rsrp'
              ? '[RSRP_DEBUG][rsrpMap]'
              : mode === 'dl_rate'
                ? '[DL_RATE_DEBUG][throughputMap]'
                : '[UL_RATE_DEBUG][ulThroughputMap]';

        if (this.DEBUG_HEATMAP) { console.log(mapDebugTag, rawForMatrix); }

        if (
          !rawForMatrix ||
          !Array.isArray(rawForMatrix) ||
          rawForMatrix.length === 0
        ) {
          console.warn('[HEATMAP][RENDER] no backend map rows for mode', { mode });
          if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:raw-map:empty'); }
          return false;
        }

        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:start'); }
        const extracted = this.extractBackendHeatmapMatrix(rawForMatrix, result);
        if (!extracted) {
          if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:failed'); }
          return false;
        }
        backend = extracted;
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'extractor:success'); }

        if (this.DEBUG_HEATMAP) {
          console.log(
            `[SIM_API_PHASE4][${mode.toUpperCase()}_HEATMAP_EXTRACTOR][z layout is z[j][i] (outer=Z, inner=X)]`,
            { nx: backend.nx, nz: backend.nz, cellSize: backend.cellSize, sliceY: backend.sliceY, width: backend.width, height: backend.height, min: backend.min, max: backend.max }
          );
        }

        committedRange =
          mode === 'sinr'
            ? this.committedRangeByMode.sinr ?? { min: 0, max: 30 }
            : mode === 'rsrp'
              ? this.committedRangeByMode.rsrp ?? { min: -120, max: -60 }
              : mode === 'dl_rate'
                ? this.committedRangeByMode.dl_rate ?? { min: 0, max: 1000 }
                : this.committedRangeByMode.ul_rate ?? { min: 0, max: 200 };

        this.logHeatmapModeSourceAndRange(
          mode,
          committedRange.min,
          committedRange.max,
          actualSourceLabel
        );

        const completeCalcResult = this.lastCompleteCalcResult;
        const zMatrix = backend.z as any;
        this.debugHeatmapMatrix(`backend-${mode}-before-plotly`, zMatrix);
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP][MODE_SOURCE]', {
            mode,
            hasSinrMap: !!completeCalcResult?.['5GOutput']?.sinrMap,
            hasRsrpMap: !!completeCalcResult?.['5GOutput']?.rsrpMap,
            hasThroughputMap: !!completeCalcResult?.['5GOutput']?.throughputMap,
            hasUlThroughputMap: !!completeCalcResult?.['5GOutput']?.ulThroughputMap,
            actualSource: actualSourceLabel,
          });
        }
      }

      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 1,
          checkpoint: 'after-extractor-success',
          backendNx: backend.nx,
          backendNz: backend.nz,
          totalCells: backend.nx * backend.nz,
        });
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 2,
          checkpoint: 'before-matrix-normalization',
        });
      }

      const { z, nx, nz, cellSize, sliceY, min, max, width, height } = backend;

      // --- Unified display extent: always use floorMesh world bounds as single source of truth ---
      const floorBBDisplay = this.floorMesh?.getBoundingInfo().boundingBox;
      const floorMin = floorBBDisplay?.minimumWorld?.clone() ?? new Vector3(0, 0, 0);
      const floorMax = floorBBDisplay?.maximumWorld?.clone() ?? new Vector3(width, 0, height);
      const floorWidth = floorMax.x - floorMin.x;
      const floorDepth = floorMax.z - floorMin.z;

      console.log('[HEATMAP_DISPLAY_EXTENT]', {
        floorMin: { x: +floorMin.x.toFixed(2), z: +floorMin.z.toFixed(2) },
        floorMax: { x: +floorMax.x.toFixed(2), z: +floorMax.z.toFixed(2) },
        floorWidth: +floorWidth.toFixed(2),
        floorDepth: +floorDepth.toFixed(2),
        matrixRows: nz,
        matrixCols: nx,
        cellSize,
        matrixWidth: +(nx * cellSize).toFixed(2),
        matrixDepth: +(nz * cellSize).toFixed(2),
      });

      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][RAW_MATRIX]', { rows: nz, cols: nx, total: nz * nx }); }

      const displayDs = this.downsampleHeatmapMatrixForDisplay(
        z,
        this.MAX_PLOTLY_HEATMAP_CELLS
      );
      const displayMatrix = displayDs.displayMatrix;
      const displayNx = displayDs.displayNx;
      const displayNz = displayDs.displayNz;

      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][DISPLAY_MATRIX]', { rows: displayNz, cols: displayNx, total: displayNz * displayNx });
        console.log('[HEATMAP][DOWNSAMPLE]', {
          applied: displayDs.applied,
          strategy: 'step-sampling',
          steps: { rowStep: displayDs.rowStep, colStep: displayDs.colStep },
          threshold: this.MAX_PLOTLY_HEATMAP_CELLS,
        });
        console.log('[HEATMAP][PLOTLY_INPUT]', { rows: displayNz, cols: displayNx, total: displayNz * displayNx });
        console.log('[HEATMAP][WORLD_EXTENT]', 'raw', { width, depth: height, nx, nz });
        console.log('[HEATMAP][DISPLAY_EXTENT]', 'display', { rows: displayNz, cols: displayNx });
        console.log('[HEATMAP][EXTENT_BINDING]', 'using raw world extent + display matrix density');
      }

      this.dbgLogNorthSouthInversionProbe({
        rawNx: nx,
        rawNz: nz,
        displayNx,
        displayNz,
        cellSize,
        backendWorldWidth: width,
        backendWorldDepth: height,
      });

      const currentMode = mode;
      const selectedMap = z;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][TRACE]', traceId, 'mode-selected');
        console.log('[HEATMAP][MODE]', currentMode);
        if (!Array.isArray(selectedMap)) {
          console.error('[HEATMAP][ERROR] map is not array', selectedMap);
        } else {
          const rows = selectedMap.length;
          const cols = selectedMap[0]?.length ?? 0;
          console.log('[HEATMAP][MATRIX] size:', { rows, cols, total: rows * cols });
          const MAX_SAFE_CELLS = 200_000;
          if (rows * cols > MAX_SAFE_CELLS) {
            console.warn('[HEATMAP][WARNING] matrix too large', { rows, cols, total: rows * cols });
          }
          if (rows > 0 && cols > 0) {
            let validCount = 0;
            let invalidCount = 0;
            let minVal: number | null = null;
            let maxVal: number | null = null;
            for (let r = 0; r < rows; r++) {
              const row = selectedMap[r];
              for (let c = 0; c < cols; c++) {
                const v = row[c];
                if (typeof v === 'number' && !isNaN(v)) {
                  validCount++;
                  if (minVal === null) {
                    minVal = v;
                    maxVal = v;
                  } else {
                    if (v < minVal) minVal = v;
                    if (maxVal !== null && v > maxVal) maxVal = v;
                  }
                } else {
                  invalidCount++;
                }
              }
            }
            const totalCells = rows * cols;
            console.log('[HEATMAP][MATRIX] stats:', { total: totalCells, valid: validCount, invalid: invalidCount, min: minVal, max: maxVal });
          }
        }
      }

      this.plotlyHoverZ = z as any;
      this.plotlyHeatmapCellSize = cellSize;
      this.plotlyHeatmapSliceHeight = sliceY;
      this.plotlyHoverUnit =
        mode === 'coverage'
          ? ''
          : (this.DIST_MODE_META[mode] ?? this.DIST_MODE_META.rsrp).unit;

      // Always derive hover meta from floorMesh world extent + backend resolution — never reuse stale values.
      // Resolution (cellSize) is the primary cell size; floorWidth/nx is only a fallback when they disagree.
      const worldMeta = this.resolveBackendHeatmapWorldMeta(
        { nx, nz, cellSize, width, height },
        this.floorMesh
      );
      const displayCellSizeX = worldMeta.cellSizeX;
      const displayCellSizeZ = worldMeta.cellSizeZ;

      this.plotlyHoverMeta = {
        min: floorMin.clone(),
        max: floorMax.clone(),
        nx,
        nz,
        cellSize,
        cellSizeX: displayCellSizeX,
        cellSizeZ: displayCellSizeZ,
        sliceY,
      } as any;

      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP_DISPLAY_CELL_SIZE]', {
          width,
          height,
          nx,
          nz,
          backendCellSize: cellSize,
          displayCellSizeX,
          displayCellSizeZ,
        });
        console.log('[HEATMAP][PIPELINE_TRACE]', {
          traceId,
          step: 3,
          checkpoint: 'after-matrix-normalization',
          nx,
          nz,
          totalCells: nx * nz,
        });
      }

      // ===== [ORIGIN_DEBUG] 確認後端 heatmap origin 和場景座標的對應（sinr / rsrp / dl / ul 共用） =====
      if (this.floorMesh && mode !== 'coverage') {
        const floorBB = this.floorMesh.getBoundingInfo().boundingBox;
        const floorMin = floorBB.minimumWorld;  // 場景西南角

        // 後端 BS 位置（math 座標系）
        const p2Result = this.p2_collectSignalNodes(this.scene);
        const bsMesh = p2Result.antennas[0] ?? null;
        const bsScenePos = bsMesh?.getAbsolutePosition?.() ?? null;
        const bsMathPos = bsScenePos
          ? this.toMathPositionFromSceneXYZ(bsScenePos.x, bsScenePos.y, bsScenePos.z)
          : null;

        // ===== [BACKEND_INPUT_DEBUG] Compare frontend math BS vs backend input =====
        const backendInput: any = (this.lastCompleteCalcResult as any)?.input ?? null;
        const backendBsPos =
          backendInput?.bsPosition ??
          backendInput?.bs ??
          backendInput?.bsList?.defaultBs?.[0]?.position ??
          null;

        console.log('[BACKEND_INPUT_DEBUG]', {
          backendHeatmapMode: mode,
          bsScenePos: bsScenePos
            ? { x: bsScenePos.x, y: bsScenePos.y, z: bsScenePos.z }
            : null,
          bsMathPos: bsMathPos
            ? { x: bsMathPos.x, y: bsMathPos.y, z: bsMathPos.z }
            : null,
          backendBsPos,
          delta:
            bsMathPos && backendBsPos
              ? {
                  dx: backendBsPos.x - bsMathPos.x,
                  dy: backendBsPos.y - bsMathPos.y,
                  dz: (backendBsPos.z ?? 0) - (bsMathPos.z ?? 0),
                }
              : null,
          note: 'Compare frontend BS math position vs actual backend input position',
        });
        // ===== END [BACKEND_INPUT_DEBUG] =====

        // backend map 的尺寸和 cellSize（z[j][i]）
        const rows = z.length;
        const cols = z[0]?.length ?? 0;

        // 如果後端 origin = 場域左下角，BS 在 map 的 index 應該是：
        const expectedRowIfOriginBottomLeft = bsMathPos
          ? Math.floor(bsMathPos.y / backend.cellSize)
          : null;
        const expectedColIfOriginBottomLeft = bsMathPos
          ? Math.floor(bsMathPos.x / backend.cellSize)
          : null;

        // 找 map 裡最大值的 index（應該在 BS 附近；RSRP 同樣取 max）
        let maxVal = -Infinity, maxRow = -1, maxCol = -1;
        z.forEach((row, ri) => row.forEach((v, ci) => {
          if (v != null && v > maxVal) { maxVal = v; maxRow = ri; maxCol = ci; }
        }));

        // ===== [ORIGIN_DEBUG_V2] Compare backend row/col hypotheses =====
        if (bsMathPos) {
          const x = Math.floor(bsMathPos.x / backend.cellSize);
          const y = Math.floor(bsMathPos.y / backend.cellSize);

          const hypotheses = {
            row_y_col_x_bottomLeft: {
              row: y,
              col: x,
            },

            row_x_col_y_bottomLeft: {
              row: x,
              col: y,
            },

            row_revY_col_x_topLeft: {
              row: rows - 1 - y,
              col: x,
            },

            row_revX_col_y_rightOrigin: {
              row: rows - 1 - x,
              col: y,
            },
          };

          const deltas = Object.fromEntries(
            Object.entries(hypotheses).map(([key, idx]) => [
              key,
              {
                dRow: maxRow - idx.row,
                dCol: maxCol - idx.col,
                absRow: Math.abs(maxRow - idx.row),
                absCol: Math.abs(maxCol - idx.col),
                manhattan: Math.abs(maxRow - idx.row) + Math.abs(maxCol - idx.col),
              },
            ])
          );

          console.log('[ORIGIN_DEBUG_V2]', {
            backendHeatmapMode: mode,
            bsMathPos: {
              x: bsMathPos.x,
              y: bsMathPos.y,
            },
            sinrMaxAt: {
              row: maxRow,
              col: maxCol,
              value: maxVal,
            },
            hypotheses,
            deltas,
            note: 'Find which hypothesis is closest to sinrMaxAt. Smallest manhattan distance is the most likely backend row/col convention.',
          });
        }
        // ===== END ORIGIN_DEBUG_V2 =====

        console.log('[ORIGIN_DEBUG]', {
          backendHeatmapMode: mode,
          floorMin: { x: floorMin.x, z: floorMin.z },
          bsScenePos: bsScenePos ? { x: bsScenePos.x, z: bsScenePos.z } : null,
          bsMathPos,
          heatmapMapShape: { rows, cols },
          cellSize: backend.cellSize,
          metricMaxAt: { row: maxRow, col: maxCol, value: maxVal },
          expectedBsIndexIfOriginBottomLeft: {
            row: expectedRowIfOriginBottomLeft,
            col: expectedColIfOriginBottomLeft,
          },
          note: 'If metric max is near expectedBsIndex → origin=bottomLeft is correct. If max row ≈ (rows-1-expectedRow) → origin is topLeft (needs vertical flip).',
        });
      }
      // ===== END ORIGIN_DEBUG =====

      // [STRONGEST_COMPARE] — summary for verifying BS vs heatmap max alignment
      if (this.floorMesh) {
        const floorBBForStrongest = this.floorMesh.getBoundingInfo().boundingBox;
        const floorMinForStrongest = floorBBForStrongest.minimumWorld;
        const floorMaxForStrongest = floorBBForStrongest.maximumWorld;
        const floorWidthForStrongest = floorMaxForStrongest.x - floorMinForStrongest.x;
        const floorDepthForStrongest = floorMaxForStrongest.z - floorMinForStrongest.z;
        const strongestSource = this.plotlyHoverZ ?? [];
        // Use resolveBackendHeatmapWorldMeta for consistent resolution-first cell sizing
        const wmStrongest = this.resolveBackendHeatmapWorldMeta(
          { nx: backend.nx, nz: backend.nz, cellSize: backend.cellSize, width: backend.width, height: backend.height },
          this.floorMesh
        );
        const displayCellSizeX = wmStrongest.cellSizeX;
        const displayCellSizeZ = wmStrongest.cellSizeZ;

        // [BS_STORE_SNAPSHOT_TRACE] — snapshot all store rows at render time with coord-space detection
        {
          const snapRows = this.fieldDomainStore.snapshot?.existingBs ?? [];
          console.log('[BS_STORE_SNAPSHOT_TRACE]', {
            timestamp: Date.now(),
            floorMin: { x: floorMinForStrongest.x, z: floorMinForStrongest.z },
            floorMax: { x: floorMaxForStrongest.x, z: floorMaxForStrongest.z },
            floorSize: { w: floorWidthForStrongest, d: floorDepthForStrongest },
            rowCount: snapRows.length,
            rows: snapRows.map((r: any) => {
              const res = this.resolveBsWorldPosition(
                r.x, r.y,
                { x: floorMinForStrongest.x, z: floorMinForStrongest.z },
                { x: floorMaxForStrongest.x, z: floorMaxForStrongest.z }
              );
              const inBounds = res.worldX >= floorMinForStrongest.x - 50 && res.worldX <= floorMaxForStrongest.x + 50
                && res.worldZ >= floorMinForStrongest.z - 50 && res.worldZ <= floorMaxForStrongest.z + 50;
              return {
                id: r.id, name: r.name,
                rowX: r.x, rowY: r.y,
                resolvedWorld: { x: res.worldX, z: res.worldZ },
                detectedCoordSpace: res.detectedCoordSpace,
                inBounds,
                rowYvsFloorMaxZ: r.y - floorMaxForStrongest.z,
                rowXvsFloorMaxX: r.x - floorMaxForStrongest.x,
              };
            }),
          });
        }

        // [BS_COORD_SOURCE] Resolve BS position using coord-space detection
        const bsRows = this.fieldDomainStore.snapshot?.existingBs ?? [];
        const bsRow0 = bsRows[0] ?? null;
        const bsFloorMinForRes = { x: floorMinForStrongest.x, z: floorMinForStrongest.z };
        const bsFloorMaxForRes = { x: floorMaxForStrongest.x, z: floorMaxForStrongest.z };
        const bsResolved = bsRow0 != null
          ? this.resolveBsWorldPosition(bsRow0.x, bsRow0.y, bsFloorMinForRes, bsFloorMaxForRes)
          : null;
        const bsRawWorldX = bsResolved?.worldX ?? null;
        const bsRawWorldZ = bsResolved?.worldZ ?? null;

        const bsCellCol = bsRawWorldX != null ? Math.floor((bsRawWorldX - floorMinForStrongest.x) / displayCellSizeX) : -1;
        const bsCellRow = bsRawWorldZ != null ? Math.floor((bsRawWorldZ - floorMinForStrongest.z) / displayCellSizeZ) : -1;
        // Only use bsCell for tie-breaking if it falls inside the matrix
        const bsCellInBounds = bsCellRow >= 0 && bsCellRow < wmStrongest.rowCount
          && bsCellCol >= 0 && bsCellCol < wmStrongest.colCount;
        const hasBsCell = bsCellInBounds;

        // [BS_MESH_STORE_COMPARE] — compare each BS mesh world position with its matched store row
        {
          const p2ForCmp = this.p2_collectSignalNodes(this.scene);
          const bsMeshes: AbstractMesh[] = p2ForCmp.antennas ?? [];
          const storeRowsForCmp = this.fieldDomainStore.snapshot?.existingBs ?? [];
          const cmpFloorMin = { x: floorMinForStrongest.x, z: floorMinForStrongest.z };
          const cmpFloorMax = { x: floorMaxForStrongest.x, z: floorMaxForStrongest.z };
          const comparisons = bsMeshes.map((mesh: AbstractMesh) => {
            const absPos = mesh.getAbsolutePosition();
            const metaRowId = (mesh.metadata as any)?.rowId ?? (mesh.metadata as any)?.ownerId ?? null;
            const matchedRow = metaRowId != null
              ? storeRowsForCmp.find((r: any) => r.id === metaRowId)
              : storeRowsForCmp.find((r: any) => r.ownerMeshId === mesh.uniqueId || r.meshId === mesh.uniqueId);
            const rowRes = matchedRow != null
              ? this.resolveBsWorldPosition(matchedRow.x, matchedRow.y, cmpFloorMin, cmpFloorMax)
              : null;
            const dist = rowRes != null
              ? Math.sqrt((absPos.x - rowRes.worldX) ** 2 + (absPos.z - rowRes.worldZ) ** 2)
              : null;
            return {
              meshName: mesh.name,
              meshUniqueId: mesh.uniqueId,
              meshAbsPos: { x: absPos.x, y: absPos.y, z: absPos.z },
              metaRowId,
              matchedRowId: matchedRow?.id ?? null,
              matchedRowXY: matchedRow ? { x: matchedRow.x, y: matchedRow.y } : null,
              resolvedWorld: rowRes ? { x: rowRes.worldX, z: rowRes.worldZ } : null,
              coordSpace: rowRes?.detectedCoordSpace ?? null,
              distMeshToRow_m: dist,
            };
          });
          console.log('[BS_MESH_STORE_COMPARE]', {
            bsMeshCount: bsMeshes.length,
            storeRowCount: storeRowsForCmp.length,
            floorMin: cmpFloorMin,
            floorMax: cmpFloorMax,
            comparisons,
          });
        }

        // Phase 1: find global maxVal
        let scMaxVal = -Infinity;
        for (let ri = 0; ri < strongestSource.length; ri++) {
          const row = strongestSource[ri] ?? [];
          for (let ci = 0; ci < row.length; ci++) {
            const v = row[ci];
            if (v == null || !Number.isFinite(v)) continue;
            if ((v as number) > scMaxVal) scMaxVal = v as number;
          }
        }

        // Phase 2: among all maxVal cells, pick the one closest to bsCell (tie-break)
        let scMaxRow = -1;
        let scMaxCol = -1;
        let scBestDist2 = Infinity;
        let scCandidateCount = 0;
        const scTieCandidates: { ri: number; ci: number; dist2: number }[] = [];
        for (let ri = 0; ri < strongestSource.length; ri++) {
          const row = strongestSource[ri] ?? [];
          for (let ci = 0; ci < row.length; ci++) {
            const v = row[ci];
            if (v == null || !Number.isFinite(v)) continue;
            if (Math.abs((v as number) - scMaxVal) > 1e-9) continue;
            scCandidateCount++;
            const dist2 = hasBsCell
              ? (ri - bsCellRow) ** 2 + (ci - bsCellCol) ** 2
              : (scMaxRow < 0 ? 0 : Infinity);
            if (scTieCandidates.length < 10) scTieCandidates.push({ ri, ci, dist2 });
            if (scMaxRow < 0 || dist2 < scBestDist2) {
              scBestDist2 = dist2;
              scMaxRow = ri;
              scMaxCol = ci;
            }
          }
        }

        // Use heatmapCellToWorld helper for consistent coordinate conversion
        const wmForCell = {
          floorMinX: floorMinForStrongest.x,
          floorMinZ: floorMinForStrongest.z,
          cellSizeX: displayCellSizeX,
          cellSizeZ: displayCellSizeZ,
        };
        const strongestWorld = this.heatmapCellToWorld(scMaxCol, scMaxRow, wmForCell);
        const strongestWorldX = strongestWorld.worldX;
        const strongestWorldZ = strongestWorld.worldZ;
        const strongestWorldZReversed = floorMinForStrongest.z + ((backend.nz - 1 - scMaxRow) + 0.5) * displayCellSizeZ;

        const strongestCellCenterX = strongestWorldX;
        const strongestCellCenterZ = strongestWorldZ;

        // [HEATMAP_CELL_TO_WORLD_CHECK]
        console.log('[HEATMAP_CELL_TO_WORLD_CHECK]', {
          strongestCell: { i: scMaxCol, j: scMaxRow, value: Number.isFinite(scMaxVal) ? +scMaxVal.toFixed(3) : scMaxVal },
          strongestWorld: { x: +strongestWorldX.toFixed(3), z: +strongestWorldZ.toFixed(3) },
          formula: 'worldX = floorMinX + (i + 0.5) * cellSizeX; worldZ = floorMinZ + (j + 0.5) * cellSizeZ',
          floorMin: { x: +floorMinForStrongest.x.toFixed(3), z: +floorMinForStrongest.z.toFixed(3) },
          cellSizeX: +displayCellSizeX.toFixed(4),
          cellSizeZ: +displayCellSizeZ.toFixed(4),
          resolution: wmStrongest.resolution,
          colCount: wmStrongest.colCount,
          rowCount: wmStrongest.rowCount,
        });

        // Place strongest marker using floor-unified world coordinates
        const _markerSkipped = scMaxRow < 0 || scMaxCol < 0;
        const _markerSkipReason = _markerSkipped
          ? (strongestSource.length === 0 ? 'empty-source-matrix' : 'all-values-non-finite')
          : null;
        if (!_markerSkipped) {
          const dbgMarker = (window as any).__hmDbgMarker ?? true;
          if (dbgMarker) {
            this.upsertHeatmapStrongestMarker(new Vector3(strongestWorldX, sliceY, strongestWorldZ));
          }
        }

        // [HEATMAP_STRONGEST_DEBUG]
        const _srcRows = strongestSource.length;
        const _srcCols = ((strongestSource as any[])[0] ?? []).length;
        const _allVals = (strongestSource as any[][]).flat().filter((v: any) => v != null && Number.isFinite(v));
        const _uniqueVals = new Set(_allVals.map((v: number) => v.toFixed(6)));
        console.log('[HEATMAP_STRONGEST_DEBUG]', {
          mapShape: { rows: _srcRows, cols: _srcCols },
          totalFiniteCells: _allVals.length,
          uniqueValueCount: _uniqueVals.size,
          maxValue: scMaxVal,
          maxCellCount: scCandidateCount,
          strongestCell: { row: scMaxRow, col: scMaxCol },
          markerPlaced: !_markerSkipped,
          markerSkipped: _markerSkipped,
          skippedReason: _markerSkipReason,
          isConstantField: _uniqueVals.size <= 1,
          constantValue: _uniqueVals.size === 1 ? Array.from(_uniqueVals)[0] : null,
          mostCommonValueCoverage: _allVals.length > 0 ? `${((scCandidateCount / _allVals.length) * 100).toFixed(1)}%` : 'n/a',
          bsCount: bsRows.length,
          bsInPayload: (this as any).lastCompleteCalcResult?.input?.bsList?.defaultBs?.length ?? 'unknown',
        });

        const bsCellCenterX =
          floorMinForStrongest.x + (bsCellCol + 0.5) * displayCellSizeX;
        const bsCellCenterZ =
          floorMinForStrongest.z + (bsCellRow + 0.5) * displayCellSizeZ;

        const bsConvertedX = bsCellCenterX;
        const bsConvertedZ = bsCellCenterZ;

        console.log('[TIE_BREAK_STRONGEST]',
          '| maxVal:', scMaxVal.toFixed(2),
          '| candidateCount:', scCandidateCount,
          '| bsCell(row,col):', bsCellRow, bsCellCol,
          '| chosenStrongest(row,col):', scMaxRow, scMaxCol,
          '| chosenDist2:', scBestDist2
        );
        console.log('[TIE_BREAK_CANDIDATES]',
          scTieCandidates.map(c => `[${c.ri},${c.ci}] dist2=${c.dist2}`).join('  ')
        );

        console.log('[BS_COORD_SOURCE]', {
          source: 'store existingBs[0]',
          rawRowXY: bsRow0 ? { x: bsRow0.x, y: bsRow0.y } : null,
          detectedCoordSpace: bsResolved?.detectedCoordSpace ?? 'n/a',
          floorMin: { x: +floorMinForStrongest.x.toFixed(3), z: +floorMinForStrongest.z.toFixed(3) },
          floorMax: { x: +floorMaxForStrongest.x.toFixed(3), z: +floorMaxForStrongest.z.toFixed(3) },
          resolvedWorld: bsRawWorldX != null
            ? { x: +bsRawWorldX.toFixed(3), z: +bsRawWorldZ!.toFixed(3) }
            : null,
          bsCell: { row: bsCellRow, col: bsCellCol },
          inBounds: bsCellInBounds,
          bsSnapped: { x: +bsConvertedX.toFixed(3), z: +bsConvertedZ.toFixed(3) },
        });
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP_BS_COMPARE]',
            'mode:', mode,
            '| floorMin(x,z):', `(${floorMinForStrongest.x.toFixed(1)}, ${floorMinForStrongest.z.toFixed(1)})`,
            '| strongestWorld(x,z):', strongestWorldX.toFixed(1), strongestWorldZ.toFixed(1),
            '| bsConvertedWorld(x,z):', `(${bsConvertedX.toFixed(1)}, ${bsConvertedZ.toFixed(1)})`,
            '| delta(dx,dz):', `(${(strongestWorldX - bsConvertedX).toFixed(1)}, ${(strongestWorldZ - bsConvertedZ).toFixed(1)})`,
            '| cellSize:', backend.cellSize,
            '| note: delta should be < cellSize if aligned'
          );
        }

        console.log('[BS_CELL_COMPARE]',
          '| strongest cell(row,col):', scMaxRow, scMaxCol,
          '| bs cell(row,col):', bsCellRow, bsCellCol,
          '| rowDelta:', bsCellRow - scMaxRow,
          '| colDelta:', bsCellCol - scMaxCol
        );

        console.log('[CELL_CENTER_COMPARE]',
          '| strongest cell:', scMaxRow, scMaxCol,
          '| strongest center:', strongestCellCenterX.toFixed(1), strongestCellCenterZ.toFixed(1),
          '| bs cell:', bsCellRow, bsCellCol,
          '| bs center:', bsCellCenterX.toFixed(1), bsCellCenterZ.toFixed(1)
        );

        // ===== [INVESTIGATION] BS vs Strongest value comparison =====
        const bsValue = bsCellRow >= 0 && bsCellCol >= 0
          ? ((strongestSource[bsCellRow] ?? [])[bsCellCol] ?? null)
          : null;
        console.log('[BS_VS_STRONGEST_VALUE]',
          '| strongest cell(row,col):', scMaxRow, scMaxCol,
          '| strongest value:', scMaxVal.toFixed(2),
          '| bs cell(row,col):', bsCellRow, bsCellCol,
          '| bs value:', bsValue != null ? (bsValue as number).toFixed(2) : 'null',
          '| valueDelta:', bsValue != null ? (scMaxVal - (bsValue as number)).toFixed(2) : 'n/a'
        );

        // ===== [INVESTIGATION] BS 5x5 neighbor values =====
        const bsNeighbor: string[] = [];
        for (let dr = -2; dr <= 2; dr++) {
          const rowParts: string[] = [];
          for (let dc = -2; dc <= 2; dc++) {
            const nr = bsCellRow + dr;
            const nc = bsCellCol + dc;
            const v = nr >= 0 && nc >= 0 ? ((strongestSource[nr] ?? [])[nc] ?? null) : null;
            const marker = dr === 0 && dc === 0 ? '*' : ' ';
            rowParts.push(`${marker}[${nr},${nc}]=${v != null ? (v as number).toFixed(1) : 'null'}`);
          }
          bsNeighbor.push(rowParts.join(' '));
        }
        console.log('[BS_NEIGHBOR_VALUES] 5x5 centered on bs cell (' + bsCellRow + ',' + bsCellCol + '):\n'
          + bsNeighbor.join('\n'));

        // ===== [INVESTIGATION] Strongest source matrix info =====
        const srcRows = strongestSource.length;
        const srcCols = ((strongestSource as any[])[0] ?? []).length;
        const _calcInput: any = (this.lastCompleteCalcResult as any)?.input ?? null;
        const bsListDefaultBsCount = (_calcInput?.bsList?.defaultBs ?? []).length;
        const availableNewBsNum = _calcInput?.availableNewBsNumber ?? 'unknown';
        console.log('[STRONGEST_SOURCE_MATRIX]',
          '| source: this.plotlyHoverZ (= backend.z, full-resolution, NOT downsampled)',
          '| actualDims(rows,cols):', srcRows, srcCols,
          '| backend.nz:', backend.nz, '| backend.nx:', backend.nx,
          '| matchesBackend:', srcRows === backend.nz && srcCols === backend.nx,
          '| displayMatrix dims(rows,cols):', displayNz, displayNx,
          '| downsampled:', displayDs.applied,
          '| rowStep:', displayDs.rowStep, '| colStep:', displayDs.colStep,
          '| normalized: NO (raw dB/SINR values)',
          '| bsList.defaultBs count:', bsListDefaultBsCount,
          '| availableNewBsNumber:', availableNewBsNum,
          '| NOTE: if bsListCount>1 or availableNewBsNumber>0, backend simulates multiple BSes → strongest may be from a different BS than existingBs[0]'
        );
        // ===== END INVESTIGATION =====
      }

      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'plotly-render:start'); }
      await this.renderPlotlyHeatmap(
        displayMatrix,
        displayNx,
        displayNz,
        cellSize,
        {
          zmin: committedRange.min,
          zmax: committedRange.max,
          ...plotlyHeatmapExtra,
        },
        traceId,
        {
          rawNx: nx,
          rawNz: nz,
          worldWidth: floorWidth,
          worldDepth: floorDepth,
        }
      );
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'plotly-render:done'); }

      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'plotly-to-png:start'); }
      const pngUrl = await this.exportPlotlyToPngDataUrl(traceId);
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'plotly-to-png:done'); }
      if (pngUrl && this.floorMesh) {
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'babylon-texture:start'); }
        this.ensureHeatmapPlaneForPlotly(this.floorMesh, sliceY);
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP][PIPELINE_TRACE]', {
            traceId,
            step: 10,
            checkpoint: 'before-babylon-texture-apply',
            pngUrlLen: pngUrl?.length ?? 0,
          });
        }
        this.applyPngDataUrlToHeatmap(pngUrl, traceId);
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP][PIPELINE_TRACE]', {
            traceId,
            step: 11,
            checkpoint: 'after-babylon-texture-apply',
          });
        }
        this.setupPlotlyHeatmapPointerTracking();
        if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'babylon-texture:done'); }

        const dynamicRangeForCache =
          mode === 'coverage'
            ? { min: 0, max: 1 }
            : {
                min: committedRange.min,
                max: committedRange.max,
              };

        const cacheEntry: CachedHeatmapRender = {
          imageBase64: pngUrl,
          hoverZ: this.cloneHeatmapZForCache(z as (number | null)[][]),
          hoverMeta: this.snapshotPlotlyHoverMetaForCache(),
          unit: this.plotlyHoverUnit,
          mode,
          cellSize,
          sliceY,
          coverageThreshold: mode === 'coverage' ? this.coverageThreshold : undefined,
          dynamicRange: dynamicRangeForCache,
        };
        this.heatmapRenderCache.set(cacheKey, cacheEntry);

        const rLog =
          mode !== 'coverage'
            ? this.committedRangeByMode[mode as 'sinr' | 'rsrp' | 'dl_rate' | 'ul_rate']
            : undefined;
        if (this.DEBUG_HEATMAP) {
          console.log('[HEATMAP][CACHE] store', {
            key: cacheKey,
            mode,
            isCoverage: mode === 'coverage',
            coverageThreshold: mode === 'coverage' ? this.coverageThreshold : undefined,
            dynamicRange: mode === 'coverage' ? undefined : rLog,
            sliceHeight: this.heatmapSliceHeight,
          });
        }

        this.commitColorbarSnapshotForMode(mode);
      }

      this.isSimulationDone = true;

      if (this.DEBUG_HEATMAP) {
        console.log('[SIM_API_PHASE4][BACKEND_HEATMAP_RENDER] success', {
          mode, nx, nz, cellSize, sliceY, min, max,
          zRange: { zmin: committedRange.min, zmax: committedRange.max },
          plotlyHoverUnit: this.plotlyHoverUnit,
        });
        console.log('[HEATMAP][TRACE]', traceId, 'success');
      }
      return true;
    } catch (err) {
      console.error('[SIM_API_PHASE4][BACKEND_HEATMAP_RENDER] failed', { mode, err });
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][TRACE]', traceId, 'failed'); }
      return false;
    }
  }

  // Compatibility wrapper for existing call sites.
  private async runBackendSinrHeatmapFromCompleteCalcResult(): Promise<boolean> {
    return this.renderBackendHeatmapFromCompleteCalcResult('sinr');
  }

  // ===== [SIM_API_PHASE1] Helper Methods =====

  /**
   * Build phase 1 task ID
   */
  private buildPhase1TaskId(): string {
    // TODO: Replace with stable UUID generator when available
    const username = 'user'; // TODO: Get from auth service if available
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `task_${username}_${timestamp}_${randomStr}`;
  }

  /**
   * Resolve phase 1 session ID
   */
  private resolvePhase1SessionId(): string {
    const isValidSession = (v: unknown): v is string =>
      typeof v === 'string' && v.trim().length > 0;

    const componentSessionCandidates = [
      (this as any).sessionId,
      (this as any).session,
      (this as any).sonSession,
    ];
    for (const candidate of componentSessionCandidates) {
      if (isValidSession(candidate)) {
        console.log('[SIM_API_PHASE3][session] using component session');
        return candidate.trim();
      }
    }

    const windowSession = (window as any).__sonSession;
    if (isValidSession(windowSession)) {
      console.log('[SIM_API_PHASE3][session] using window.__sonSession');
      return windowSession.trim();
    }

    if (isValidSession(this.DEV_TEMP_SESSION)) {
      console.warn('[SIM_API_PHASE3][session] using DEV_TEMP_SESSION before localStorage');
      return this.DEV_TEMP_SESSION.trim();
    }

    try {
      const localStorageKeys = ['son_session', 'sessionId', 'session', '__sonSession'];
      for (const key of localStorageKeys) {
        const value = localStorage.getItem(key);
        if (isValidSession(value)) {
          console.log('[SIM_API_PHASE3][session] using localStorage session');
          return value.trim();
        }
      }
    } catch (err) {
      console.warn('[SIM_API_PHASE3][session] localStorage unavailable', err);
    }

    console.warn(
      '[SIM_API_PHASE3][TEMP_SESSION_FALLBACK] Using hardcoded development session.',
      {
        note: 'TODO: remove after login/session system implemented',
      }
    );
    return this.DEV_TEMP_SESSION;
  }

  /**
   * Collect execution inputs from component state
   */
  private getPlanningSnapshotFromTaskPanel(): any | null {
    if (!this.latestPlanningSnapshot) {
      console.warn('[SIM_API_PHASE3][planning] latestPlanningSnapshot unavailable');
      return null;
    }

    console.log('[SIM_API_PHASE3][planning] latestPlanningSnapshot =', this.latestPlanningSnapshot);
    return this.latestPlanningSnapshot;
  }

  private lonToMercX(lonDeg: number): number {
    return this.R_EARTH_META * (lonDeg * Math.PI / 180);
  }

  private latToMercY(latDeg: number): number {
    const maxLat = 85.05112878;
    const lat = Math.max(Math.min(latDeg, maxLat), -maxLat);
    const latRad = lat * Math.PI / 180;
    return this.R_EARTH_META * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  }

  private measureBBoxMeters(bbox: { south: number; west: number; north: number; east: number }): { widthM: number; heightM: number } {
    const widthM = Math.abs(this.lonToMercX(bbox.east) - this.lonToMercX(bbox.west));
    const heightM = Math.abs(this.latToMercY(bbox.north) - this.latToMercY(bbox.south));
    return { widthM, heightM };
  }

  /** heatmapGrid e.g. '4x4' → 4；不符 /^(\d+)x(\d+)$/ 時為 1 */
  private parseGrid(raw: string): number {
    const match = String(raw ?? '').trim().match(/^(\d+)x(\d+)$/);
    return match ? Number(match[1]) : 1;
  }

  private roundTo2(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  /** New Project meta → fieldSettingsState 初始值（不含 bbox 長寬；GIS 長寬由 commit 覆寫） */
  initFieldSettingsFromProjectMeta(meta: any | null): void {
    if (!meta) return;

    this.fieldSettingsState.projectName = String(meta.projectName ?? '');
    this.fieldSettingsState.networkType = meta.networkType === '4G' ? '4G' : '5G';
    this.fieldSettingsState.band = String(meta.band ?? '');
    this.fieldSettingsState.fieldMapSource = meta.fieldMapSource === 'glb' ? 'glb' : 'gis';

    const sz = meta.fieldSize ?? {};
    const len = Number(sz.length);
    const wid = Number(sz.width);
    const hgt = Number(sz.height);

    if (this.fieldSettingsState.fieldMapSource !== 'gis') {
      this.fieldSettingsState.length = this.roundTo2(len);
      this.fieldSettingsState.width = this.roundTo2(wid);
      this.fieldSettingsState.height = this.roundTo2(hgt);
    } else {
      this.fieldSettingsState.height = this.roundTo2(Number.isFinite(hgt) && hgt > 0 ? hgt : 3.5);
    }
  }

  /** GIS MapPicker commit：更新 committedMapMeta；僅覆寫 length/width，不動 height */
  applyCommittedMapMeta(data: CommittedMapData): void {
    const bbox = data.bbox;
    const { widthM, heightM } = this.measureBBoxMeters(bbox);
    const roundedWidthM = this.roundTo2(widthM);
    const roundedHeightM = this.roundTo2(heightM);
    const roundedAltitudeM = this.roundTo2(this.fieldSettingsState.height);
    const centerLatitude = (bbox.south + bbox.north) / 2;
    const centerLongitude = (bbox.west + bbox.east) / 2;

    this.committedMapMeta = {
      bbox: { ...bbox },
      widthMeters: roundedWidthM,
      heightMeters: roundedHeightM,
      altitudeMeters: roundedAltitudeM,
      centerLatitude,
      centerLongitude,
    };

    if (this.fieldSettingsState.fieldMapSource === 'gis') {
      this.fieldSettingsState.length = roundedWidthM;
      this.fieldSettingsState.width = roundedHeightM;
    }
  }

  private collectExecutionInputs(): BaseTaskPayloadBuilderInput {
    const snapshot = this.fieldDomainStore.snapshot;
    console.log('[BS_POLLUTION][snapshotAtCollectStart]', {
      existingBsCount: snapshot?.existingBs?.length ?? 0,
      rows: (snapshot?.existingBs ?? []).map((r: any) => ({
        id: r?.id,
        x: r?.x,
        y: r?.y,
        z: r?.z,
        ownerMeshId: r?.ownerMeshId,
      })),
    });
    const fs = this.fieldSettingsState;
    // Phase-0 trace: payload builder input must come from row/store, not scene-only drafts.
    const sceneBuildingCount = (this.scene?.meshes ?? []).filter((m: any) => m?.metadata?.type === 'building').length;
    console.log('[Phase0][CollectExecutionInputs][SourceCheck]', {
      obstacleRows: snapshot?.obstacles?.length ?? 0,
      intelligentPanelRows: snapshot?.intelligentPanels?.length ?? 0,
      candidateRisRows: snapshot?.candidateRis?.length ?? 0,
      sceneBuildingCount,
    });

    // Task metadata
    const taskId = this.buildPhase1TaskId();
    const sessionId = this.resolvePhase1SessionId();
    const now = new Date();
    const createTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const safeNumberOr = (value: unknown, fallback: number): number => {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const meta = this.committedMapMeta;

    // cutHeights：空字串要視為未填（不能因 Number('') => 0 而送出 0）
    const cutHeights = fs.cutHeights
      .map((v) => {
        const s = String(v ?? '').trim();
        if (!s) return NaN;
        return Number(s);
      })
      .filter((v) => Number.isFinite(v));
    const finalCutHeights = cutHeights.length > 0 ? cutHeights : [1.05];

    const heatmapGridMeters = this.parseGrid(fs.heatmapGrid);
    const objectiveIndex = safeNumberOr((snapshot as any)?.objectiveIndex, SIMULATION_SEED_FALLBACK.objectiveIndex);

    const ueSource = Array.isArray((snapshot as any)?.ueList)
      ? (snapshot as any).ueList
      : (Array.isArray((snapshot as any)?.ue) ? (snapshot as any).ue : []);

    const ueListNormalized = (ueSource as any[]).map((ue: any) => ({
      x: safeNumberOr(ue?.x ?? ue?.position?.x, 0),
      y: safeNumberOr(ue?.y ?? ue?.position?.y, 0),
      z: safeNumberOr(ue?.z ?? ue?.position?.z, 1.5),
      rxGain: safeNumberOr(ue?.rxGain, 0),
    }));

    const ueCoordinate = ueListNormalized
      .map((ue) => `[${ue.x},${ue.y},${ue.z}]`)
      .join('|');
    const ueRxGain = JSON.stringify(ueListNormalized.map((ue) => ue.rxGain));
    const useUeCoordinate = safeNumberOr(
      (snapshot as any)?.useUeCoordinate,
      SIMULATION_SEED_FALLBACK.useUeCoordinate
    );

    const observeList = Array.isArray(snapshot.observes) ? snapshot.observes : [];
    const zoneList = Array.isArray(snapshot.zones) ? snapshot.zones : [];

    const risSource = snapshot.intelligentPanels ?? [];
    console.log('[RIS_STORE]', risSource);

    const subfieldList = [...observeList, ...zoneList].map((item: any, idx: number) => ({
      id: item?.id ?? `subfield_${idx + 1}`,
      ...item,
    }));

    const pathLossModelId = safeNumberOr(
      (snapshot as any)?.pathLossModelId,
      SIMULATION_SEED_FALLBACK.pathLossModelId
    );

    // Zone rows -> payload.field.regionalDivision[]
    const fieldRegionalDivision = zoneList.map((zone: any, idx: number) => {
      const x = safeNumberOr(zone?.x, 0);
      const y = safeNumberOr(zone?.y, 0);
      const length = safeNumberOr(zone?.length, 0);
      const width = safeNumberOr(zone?.width, 0);
      const rotateAngle = safeNumberOr(zone?.angle, 0);

      const halfL = length / 2;
      const halfW = width / 2;

      const zoneColor = zone?.color ?? 'hsl(110, 98%, 21%)';

      const zonePathLossModelIdRaw = zone?.pathLossModelId;
      const zonePathLossModelId =
        zonePathLossModelIdRaw == null ? null : Number(zonePathLossModelIdRaw);
      const zonePathLossModelIdValid =
        zonePathLossModelId != null && Number.isFinite(zonePathLossModelId) ? zonePathLossModelId : null;

      const baseModelId = zonePathLossModelIdValid ?? pathLossModelId;

      return {
        color: zoneColor,
        pathLossModel: {
          ID: baseModelId,
        },
        regionID: zone?.seq ?? idx + 1,
        shape: {
          ID: 2,
          radius: 0,
          rotateAngle,
          rotateCenter: [x, y],
          // un-rotated rectangle vertices (backend uses rotateAngle/rotateCenter separately)
          vertices: [
            [x - halfL, y - halfW],
            [x + halfL, y - halfW],
            [x + halfL, y + halfW],
            [x - halfL, y + halfW],
          ],
        },
      };
    });

    const evaluationFunc = {
      field: {
        coverage: { activate: true, ratio: SIMULATION_SEED_FALLBACK.coverageRatio },
        rsrp: { activate: true, ratio: [fs.rsrpThreshold] },
        sinr: { activate: true, ratio: [fs.sinrThreshold] },
        throughput: { activate: true, ratio: [100, 20] },
        subfield: [],
      },
      ue: {
        coverage: { activate: true, ratio: SIMULATION_SEED_FALLBACK.ueCoverageRatio },
        sinr: { activate: true, ratio: [fs.sinrThreshold] },
        throughput: { activate: true, ratio: [100, 20] },
        throughputByDistance: { activate: false, ratio: [SIMULATION_SEED_FALLBACK.ueTpByDistanceRatio] },
        throughputByRsrp: { activate: false, ratio: [SIMULATION_SEED_FALLBACK.ueTpByRsrpRatio] },
      },
      subfield: [],
    };

    if ((window as any).__dbgBuildingReproject === true) {
      this.clearBuildingReprojectDebug();
    }

    const sceneBuildingMeshes = (this.scene?.meshes ?? [])
      .filter((m: any) => m?.metadata?.type === 'building')
      .map((m: any, meshIdx: number) => {
        // [BuildingCoordPatch] Use floorMesh world bbox min corner as origin so building
        // obstacle x/y is expressed as offset from the scene's (0,0) left-bottom corner.
        // finalLocalForMesh.x = centerWorld.x - floorMinX
        // finalLocalForMesh.z = centerWorld.z - floorMinZ
        // matches helper pickBuildingObstaclePlaneXY: tuple[0]=flm.x, tuple[1]=flm.z.
        const floorBb = this.floorMesh?.getBoundingInfo().boundingBox ?? null;
        const floorMinWorldX = floorBb?.minimumWorld?.x ?? 0;
        const floorMinWorldZ = floorBb?.minimumWorld?.z ?? 0;
        const mBb = m.getBoundingInfo?.()?.boundingBox ?? null;
        const bboxCenterWorldX = mBb?.centerWorld?.x ?? (m.position?.x ?? 0);
        const bboxCenterWorldZ = mBb?.centerWorld?.z ?? (m.position?.z ?? 0);
        const bboxMinWorldY   = mBb?.minimumWorld?.y ?? (m.position?.y ?? 0);
        const finalX = bboxCenterWorldX - floorMinWorldX;
        const finalZ = bboxCenterWorldZ - floorMinWorldZ;
        console.log('[Building][CoordPatch][FloorMinAudit]', {
          meshName: m?.name ?? '',
          osmId: String(m?.metadata?.osmId ?? m?.metadata?.osm_id ?? ''),
          floorMinWorld: { x: floorMinWorldX, z: floorMinWorldZ },
          bboxCenterWorld: { x: bboxCenterWorldX, z: bboxCenterWorldZ },
          bboxMinWorldY,
          finalLocalForMesh: { x: finalX, z: finalZ },
        });

        if (floorBb) {
          console.log('[Building][RangeCheck][FloorAudit]', {
            floorMinWorld: {
              x: floorBb.minimumWorld.x,
              z: floorBb.minimumWorld.z,
            },
            floorMaxWorld: {
              x: floorBb.maximumWorld.x,
              z: floorBb.maximumWorld.z,
            },
            floorSizeWorld: {
              width:  floorBb.maximumWorld.x - floorBb.minimumWorld.x,
              length: floorBb.maximumWorld.z - floorBb.minimumWorld.z,
            },
            mapContextWidth:  this.fieldSettingsState?.length,
            mapContextLength: this.fieldSettingsState?.width,
            meshName: m?.name ?? '',
            osmId: String(m?.metadata?.osmId ?? m?.metadata?.osm_id ?? ''),
            bboxCenterWorld: { x: bboxCenterWorldX, z: bboxCenterWorldZ },
            centerInsideFloorWorld:
              bboxCenterWorldX >= floorBb.minimumWorld.x &&
              bboxCenterWorldX <= floorBb.maximumWorld.x &&
              bboxCenterWorldZ >= floorBb.minimumWorld.z &&
              bboxCenterWorldZ <= floorBb.maximumWorld.z,
          });
        }

        const fieldWidth  = Number(this.fieldSettingsState?.length ?? 0);
        const fieldLength = Number(this.fieldSettingsState?.width  ?? 0);
        if (fieldWidth > 0 && fieldLength > 0) {
          const outOfRange = finalX < 0 || finalZ < 0 || finalX > fieldWidth || finalZ > fieldLength;
          if (outOfRange) {
            console.warn('[Building][RangeCheck][OUT]', {
              meshName: m?.name ?? '',
              osmId: String(m?.metadata?.osmId ?? m?.metadata?.osm_id ?? ''),
              x: finalX,
              y: finalZ,
              fieldWidth,
              fieldLength,
              floorMinWorld: { x: floorMinWorldX, z: floorMinWorldZ },
              bboxCenterWorld: { x: bboxCenterWorldX, z: bboxCenterWorldZ },
            });
          }
        }

        const dbgLimit: number =
          typeof (window as any).__dbgBuildingReprojectLimit === 'number'
            ? (window as any).__dbgBuildingReprojectLimit
            : 5;
        if ((window as any).__dbgBuildingReproject === true && meshIdx < dbgLimit) {
          this.renderBuildingReprojectDebug({
            bboxCenterWorldX,
            bboxCenterWorldZ,
            floorMinWorldX,
            floorMinWorldZ,
            finalX,
            finalZ,
            worldY: bboxMinWorldY,
            meshName: m?.name ?? '',
            osmId: String(m?.metadata?.osmId ?? m?.metadata?.osm_id ?? ''),
          });
        }

        return {
          name: m.name,
          metadata: {
            ...(m.metadata ?? {}),
            finalLocalForMesh: { x: finalX, z: finalZ },
          },
          getBoundingInfo: typeof m.getBoundingInfo === 'function' ? (m.getBoundingInfo as Function).bind(m) : undefined,
          getAbsolutePosition: typeof m.getAbsolutePosition === 'function' ? (m.getAbsolutePosition as Function).bind(m) : undefined,
          position: m.position,
        };
      });
    const sampleBuildingMesh: any = sceneBuildingMeshes[0] ?? null;
    if (sampleBuildingMesh) {
      const bb = sampleBuildingMesh.getBoundingInfo?.()?.boundingBox;
      const absPos = sampleBuildingMesh.getAbsolutePosition?.();
      console.log('[Building][SourceAudit][single]', {
        meshName: sampleBuildingMesh?.name ?? null,
        metadata: sampleBuildingMesh?.metadata ?? null,
        meshPosition: sampleBuildingMesh?.position
          ? {
              x: sampleBuildingMesh.position.x,
              y: sampleBuildingMesh.position.y,
              z: sampleBuildingMesh.position.z,
            }
          : null,
        absolutePosition: absPos
          ? { x: absPos.x, y: absPos.y, z: absPos.z }
          : null,
        boundingBox: bb
          ? {
              min: {
                x: bb.minimumWorld?.x ?? null,
                y: bb.minimumWorld?.y ?? null,
                z: bb.minimumWorld?.z ?? null,
              },
              max: {
                x: bb.maximumWorld?.x ?? null,
                y: bb.maximumWorld?.y ?? null,
                z: bb.maximumWorld?.z ?? null,
              },
              size: {
                x: (bb.maximumWorld?.x ?? 0) - (bb.minimumWorld?.x ?? 0),
                y: (bb.maximumWorld?.y ?? 0) - (bb.minimumWorld?.y ?? 0),
                z: (bb.maximumWorld?.z ?? 0) - (bb.minimumWorld?.z ?? 0),
              },
              center: {
                x: ((bb.maximumWorld?.x ?? 0) + (bb.minimumWorld?.x ?? 0)) / 2,
                z: ((bb.maximumWorld?.z ?? 0) + (bb.minimumWorld?.z ?? 0)) / 2,
              },
            }
          : null,
      });
    } else {
      console.warn('[Building][SourceAudit][single] no building mesh found in scene');
    }

    // Field data：場域設定欄位完全來自 fieldSettingsState
    const fieldData = {
      obstacles: snapshot.obstacles || [],
      existingBs: snapshot.existingBs || [],
      intelligentPanels: risSource,
      risList: risSource.map((r: any) => ({
        risID: safeNumberOr(r.risID ?? r.risId, 0),
        profileID: safeNumberOr(r.profileID ?? r.profileId, 0),
        position: [
          safeNumberOr(r.x ?? r.position?.x, 0),
          safeNumberOr(r.y ?? r.position?.y, 0),
          safeNumberOr(r.z ?? r.position?.z, 0),
        ] as [number, number, number],
        insHorizontal: r.insHorizontal ?? r.installHorizontalAngle ?? 0,
        insVertical: r.insVertical ?? r.installVerticalAngle ?? 0,
      })),
      candidateBs: snapshot.candidateBs || [],
      candidateRis: snapshot.candidateRis || [],
      ue: snapshot.ueList || [],
      zones: snapshot.zones || [],
      observe: snapshot.observes || [],
      projectName: fs.projectName || this.sceneName || 'Untitled Project',
      length: fs.length,
      width: fs.width,
      height: fs.height,
      cutHeights: finalCutHeights,
      heatmapGrid: fs.heatmapGrid,
      heatmapGridMeters,
      networkType: fs.networkType,
      band: fs.band,
      rsrpThreshold: fs.rsrpThreshold,
      sinrThreshold: fs.sinrThreshold,
      ueList: ueListNormalized.map(ue => ({
        x: ue.x,
        y: ue.y,
        z: ue.z,
        rxGain: ue.rxGain
      })),
      buildingRows: (snapshot.obstacles || []).filter((row: any) => row?.shape === 'building'),
      buildingMeshes: sceneBuildingMeshes,
    };

    const mapContext = {
      width_m: fs.length,
      height_m: fs.width,
      altitudeMeters: fs.height,
      center_latitude: meta?.centerLatitude ?? 0,
      center_longitude: meta?.centerLongitude ?? 0,
      bbox: meta?.bbox ?? null,
    };

    const taskPanelPlanningSnapshot = this.getPlanningSnapshotFromTaskPanel();

    // Planning input
    const planningSeed: any = {
      planning_type: 'coverage' as const,
      objective_function: 'maximize_coverage',
      constraints: [],
      coverageRatio: SIMULATION_SEED_FALLBACK.coverageRatio,
      ueCoverageRatio: SIMULATION_SEED_FALLBACK.ueCoverageRatio,
      sinrRatio: SIMULATION_SEED_FALLBACK.sinrRatio,
      throughputRatio: SIMULATION_SEED_FALLBACK.throughputRatio,
      ueAvgSinrRatio: SIMULATION_SEED_FALLBACK.ueAvgSinrRatio,
      ueAvgThroughputRatio: SIMULATION_SEED_FALLBACK.ueAvgThroughputRatio,
      ueTpByDistanceRatio: SIMULATION_SEED_FALLBACK.ueTpByDistanceRatio,
      ueTpByRsrpRatio: SIMULATION_SEED_FALLBACK.ueTpByRsrpRatio,
      maxConnectionNum: SIMULATION_SEED_FALLBACK.maxConnectionNum,
    };
    const planning: any = {
      ...planningSeed,
      ...(taskPanelPlanningSnapshot ?? {}),
    };

    // Radio input
    const radio: any = {
      frequency_ghz: 4.85,
      bandwidth_mhz: 100,
      tx_power_dbm: 24,
      pathloss_model: 'COST231',
      duplex: SIMULATION_SEED_FALLBACK.duplex,
      lteBand: SIMULATION_SEED_FALLBACK.lteBand,
      pathLossModelId,
      powerMinRange: SIMULATION_SEED_FALLBACK.powerMinRange,
      powerMaxRange: SIMULATION_SEED_FALLBACK.powerMaxRange,
      tddFrameRatio: SIMULATION_SEED_FALLBACK.tddFrameRatio,
      scs: 30,
      bandwidth: 100,
      frequency: 4850,
      txPower: 24,
      mimo: SIMULATION_SEED_FALLBACK.mctsMimo,
      mcs: '256QAM-table',
      dlMcsTable: '256QAM-table',
      ulMcsTable: '64QAM-table',
    };

    const resolvedMockDefaults = {
      ...(TASK_PAYLOAD_MOCK_DEFAULTS as any),
      objectiveIndex,
      createTime,
      evaluationFunc,
      pathLossModelId,
      lteBand: SIMULATION_SEED_FALLBACK.lteBand,
      duplex: SIMULATION_SEED_FALLBACK.duplex,
      coverageRatio: planning.coverageRatio,
      ueCoverageRatio: planning.ueCoverageRatio,
      sinrRatio: planning.sinrRatio,
      throughputRatio: planning.throughputRatio,
      ueAvgSinrRatio: planning.ueAvgSinrRatio,
      ueAvgThroughputRatio: planning.ueAvgThroughputRatio,
      ueTpByDistanceRatio: planning.ueTpByDistanceRatio,
      ueTpByRsrpRatio: planning.ueTpByRsrpRatio,
      maxConnectionNum: planning.maxConnectionNum,
      rsrpThreshold: fs.rsrpThreshold,
      sinrThreshold: fs.sinrThreshold,
      rssiThreshold: SIMULATION_SEED_FALLBACK.rssiThreshold,
      snrThreshold: SIMULATION_SEED_FALLBACK.snrThreshold,
      powerMinRange: radio.powerMinRange,
      powerMaxRange: radio.powerMaxRange,
      tddFrameRatio: radio.tddFrameRatio,
      scs: String(radio.scs),
      bandwidth: String(radio.bandwidth),
      frequency: String(radio.frequency),
      txPower: String(radio.txPower),
      mimoNumber: JSON.stringify([radio.mimo, radio.mimo]),
      ulMcsTableList: [radio.ulMcsTable, radio.ulMcsTable],
      dlMcsTableList: [radio.dlMcsTable, radio.dlMcsTable],
      mctsC: SIMULATION_SEED_FALLBACK.mctsC,
      mctsMimo: SIMULATION_SEED_FALLBACK.mctsMimo,
      mctsTemperature: SIMULATION_SEED_FALLBACK.mctsTemperature,
      mctsTestTime: SIMULATION_SEED_FALLBACK.mctsTestTime,
      mctsTime: SIMULATION_SEED_FALLBACK.mctsTime,
      mctsTotalTime: SIMULATION_SEED_FALLBACK.mctsTotalTime,
      isSimulation: true,
      isCoverage: true,
      isAverageSinr: true,
      isAvgThroughput: true,
      isUeCoverage: true,
      isUeAvgSinr: true,
      isUeAvgThroughput: true,
      isUeTpByDistance: false,
      isUeTpByRsrp: false,
      isBsNumberOptimization: false,
      isRisNumberOptimization: false,
      resolution: heatmapGridMeters,
      // Remove fallback to mock for UE fields; will be finalized below
      ueCoordinate: '',
      ueRxGain: '[]',
      useUeCoordinate: 0,
      zValue: finalCutHeights,
      subfieldList,
      field: {
        ...((TASK_PAYLOAD_MOCK_DEFAULTS as any)?.field || {}),
        regionalDivision: fieldRegionalDivision,
      },
      defaultPathLossModel: pathLossModelId,
      regionalDivision: fieldRegionalDivision,
    };

    // Build input
    const input: BaseTaskPayloadBuilderInput = {
      taskMeta: {
        task_name: fs.projectName || this.sceneName || 'Untitled Task',
        task_id: taskId,
        project_name: fs.projectName || this.sceneName || 'Untitled Project',
        created_by: 'system',
        taskId: taskId,
        sessionId: sessionId,
        now: now,
        objectiveIndex,
        createTime,
      } as any,
      mapContext: mapContext,
      basicField: fieldData,
      planning: planning as any,
      radio: radio as any,
      mockDefaults: resolvedMockDefaults,
    };

    // ===== [MAP_META_DEBUG] =====
    console.log('[MAP_META_DEBUG][input.basicField]', {
      projectName: input.basicField.projectName,
      networkType: input.basicField.networkType,
      band: input.basicField.band,
      length: input.basicField.length,
      width: input.basicField.width,
      height: input.basicField.height,
      heatmapGrid: input.basicField.heatmapGrid,
      heatmapGridMeters: input.basicField.heatmapGridMeters,
      cutHeights: input.basicField.cutHeights,
      center_latitude: meta?.centerLatitude,
      center_longitude: meta?.centerLongitude,
    });

    // Log summary
    console.log('[SIM_API_PHASE3][collectExecutionInputs][planning]', {
      fromTaskPanel: taskPanelPlanningSnapshot,
      finalPlanning: planning,
    });

    const inputSummary = {
      taskId: taskId,
      sessionId: sessionId,
      objectiveIndex,
      obstacleCount: fieldData.obstacles.length,
      buildingRowCount: (fieldData as any).buildingRows?.length ?? 0,
      buildingMeshCount: (fieldData as any).buildingMeshes?.length ?? 0,
      existingBsCount: fieldData.existingBs.length,
      candidateBsCount: fieldData.candidateBs.length,
      ueCount: fieldData.ue.length,
      useUeCoordinate,
      zValue: finalCutHeights,
      subfieldCount: subfieldList.length,
      widthMeters: fs.length,
      heightMeters: fs.width,
      altitudeMeters: fs.height
    };
    console.log('[SIM_API_PHASE1][collectExecutionInputs]', inputSummary);

    // [BS_POLLUTION] Log A: existingBs snapshot at collectExecutionInputs exit
    console.log('[BS_POLLUTION][collectExecutionInputs]', {
      count: fieldData.existingBs.length,
      rows: fieldData.existingBs.map((r: any) => ({ id: r?.id, name: r?.name, x: r?.x, y: r?.y, z: r?.z, source: r?.source })),
    });

    return input;
  }

  /**
   * Trim a legacy bracket-array string to targetCount elements.
   * E.g. "[4850,4850]" -> "[4850]", "[256QAM-table,256QAM-table]" -> "[256QAM-table]".
   * Does not use eval. Returns raw unchanged if not a valid bracket string.
   */
  private trimLegacyArrayString(raw: unknown, targetCount: number): string {
    if (typeof raw !== 'string') return String(raw ?? '');
    if (targetCount <= 0) return raw;
    const s = raw.trim();
    if (!s.startsWith('[') || !s.endsWith(']')) return raw;
    const inner = s.slice(1, -1).trim();
    if (!inner) return '[]';
    const parts = inner.split(',').map((p) => p.trim());
    if (parts.length <= targetCount) return raw;
    const trimmed = parts.slice(0, targetCount);
    return '[' + trimmed.join(',') + ']';
  }

  private normalizeZValueToApiString(raw: any): string {
    let values: unknown[] = [];

    if (Array.isArray(raw)) {
      values = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return JSON.stringify([1.05]);

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // raw 可能是 JSON 字串陣列，例如: "[1.05,4]"
        try {
          const parsed = JSON.parse(trimmed);
          values = Array.isArray(parsed) ? parsed : [];
        } catch {
          values = [];
        }
      } else {
        const n = Number(trimmed);
        values = Number.isFinite(n) ? [n] : [];
      }
    } else if (raw !== null && raw !== undefined) {
      const n = Number(raw);
      values = Number.isFinite(n) ? [n] : [];
    }

    const nums = values
      // 移除空值，避免 Number('') => 0
      .filter((v) => v !== '' && v !== null && v !== undefined)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      // 切面高度不允許 0
      .filter((v) => v !== 0);

    const finalValues = nums.length > 0 ? nums : [1.05];
    return JSON.stringify(finalValues);
  }

  // ===== [LEGACY_FLAGS_SYNC][MINIMAL] =====
  // 只同步 3 個 legacy flags：isCoverage / isAverageSinr / isUeCoverage
  // 來源為 evaluationFunc.field/ue.*.activate + ratio
  private syncLegacyFlagsFromEvaluationFunc(payload: any): void {
    const ef = payload?.evaluationFunc;
    if (!ef) return;

    const fieldCoverageActive = !!ef?.field?.coverage?.activate;
    const fieldSinrActive = !!ef?.field?.sinr?.activate;
    const ueCoverageActive = !!ef?.ue?.coverage?.activate;

    payload.isCoverage = fieldCoverageActive;
    payload.isAverageSinr = fieldSinrActive;
    payload.isUeCoverage = ueCoverageActive;

    if (fieldCoverageActive && Number.isFinite(Number(ef?.field?.coverage?.ratio))) {
      payload.coverageRatio = Number(ef.field.coverage.ratio);
    }

    if (fieldSinrActive && Number.isFinite(Number(ef?.field?.sinr?.ratio))) {
      payload.sinrRatio = Number(ef.field.sinr.ratio);
    }

    if (ueCoverageActive && Number.isFinite(Number(ef?.ue?.coverage?.ratio))) {
      payload.ueCoverageRatio = Number(ef.ue.coverage.ratio);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private isLegacyProgressMalformedError(err: any): boolean {
    const t =
      err?.error?.text ??
      (typeof err?.error === 'string' ? err.error : '') ??
      err?.message ??
      '';
    const s = String(t);
    return (
      s.includes('"progress":,"index":-1') ||
      s.includes('\\"progress\\":,\\"index\\":-1')
    );
  }

  private extractProgressValue(res: any): number | null {
    const n = Number(res?.progress);
    return Number.isFinite(n) ? n : null;
  }

private analyzeCompleteCalcResult(completeRes: any): {
    protocolKey: string;
    unAchieved: boolean;
    unAchievedObj: Record<string, boolean>;
    unusedRis: any[];
  } {
    const protocolKey =
      completeRes?.['5GOutput'] != null
        ? '5GOutput'
        : completeRes?.['4GOutput'] != null
          ? '4GOutput'
          : '5GOutput';
    const block = completeRes?.[protocolKey];
    const ue = block?.ue;
    const unAchievedObj: Record<string, boolean> = {
      sinr: block?.sinr === 'unachieved',
      rsrp: block?.rsrp === 'unachieved',
      throughput: block?.throughput === 'unachieved',
      coverage: block?.coverage === 'unachieved',
      'ue.throughputByRsrp': ue?.throughputByRsrp === 'unachieved',
      'ue.coverage': ue?.coverage === 'unachieved',
    };
    const unAchieved = Object.values(unAchievedObj).some(Boolean);
    const unusedRis = completeRes?.[protocolKey]?.unusedRis ?? [];
    return { protocolKey, unAchieved, unAchievedObj, unusedRis };
  }

  private async pollSimulationProgress(
    taskId: string,
    sessionId: string
  ): Promise<'completed' | 'fallback_result'> {
    const maxAttempts = 40;
    const intervalMs = 3000;
    const requestTimeoutMs = 10000;
    const url = `/son/progress/${encodeURIComponent(taskId)}/${encodeURIComponent(sessionId)}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        console.log('[SIM_API_PHASE3][progress] request start', {
          taskId,
          sessionId,
          attempt,
        });

        const res = await firstValueFrom(
          this.http.get<any>(url).pipe(timeout(requestTimeoutMs))
        );

        console.log('[SIM_API_PHASE3][progress] request success', {
          taskId,
          sessionId,
          attempt,
          res,
        });

        const p = this.extractProgressValue(res);

        if (p === 1) {
          console.log('[SIM_API_PHASE3][progress] completed', {
            taskId,
            sessionId,
            attempt,
            progress: p,
          });
          return 'completed';
        }

        console.log('[SIM_API_PHASE3][progress] pending', {
          taskId,
          sessionId,
          attempt,
          progress: p,
        });

        await this.sleep(intervalMs);
      } catch (err: any) {
        console.error('[SIM_API_PHASE3][progress] error', {
          taskId,
          sessionId,
          attempt,
          err,
        });

        if (err instanceof TimeoutError || err?.name === 'TimeoutError') {
          console.warn('[SIM_API_PHASE3][progress] request timeout', {
            taskId,
            sessionId,
            attempt,
          });

          await this.sleep(intervalMs);
          continue;
        }

        if (Number(err?.status) === 504) {
          console.warn('[SIM_API_PHASE3][progress] gateway timeout 504', {
            taskId,
            sessionId,
            attempt,
            status: err?.status,
          });

          throw err;
        }

        if (this.isLegacyProgressMalformedError(err)) {
          console.warn(
            '[SIM_API_PHASE3][progress] legacy malformed progress response, fallback to result',
            err
          );
          return 'fallback_result';
        }

        throw err;
      }
    }

    throw new Error('Simulation progress polling timeout');
  }

  /**
   * Run simulation API flow
   */
  private async runSimulationApiFlow(): Promise<void> {
    // ===== [SIM_API_PHASE5][COMPUTE_LOADING_START] =====
    this.computeLoading = true;

    try {
      console.log('[SIM_API_PHASE3][runSimulationApiFlow] START');

      // [BS_POLLUTION] Log snapshot: raw store state before any collection
      console.log('[BS_POLLUTION][snapshot]', {
        existingBsCount: this.fieldDomainStore.snapshot?.existingBs?.length ?? 0,
        rows: (this.fieldDomainStore.snapshot?.existingBs ?? []).map((r: any) => ({
          id: r?.id,
          x: r?.x,
          y: r?.y,
          z: r?.z,
          ownerMeshId: r?.ownerMeshId ?? null,
          antennaId: r?.antenna?.antennaID ?? null,
          antennaName: r?.antenna?.antennaName ?? null,
        })),
      });

      // Step 1: Collect inputs
      console.log('[SIM_FLOW_STAGE]', 'before-collectInputs');
      let input: any;
      try {
        input = this.collectExecutionInputs();
        console.log('[SIM_FLOW_STAGE]', 'after-collectInputs');
      } catch (collectErr) {
        console.error('[SIM_FLOW_COLLECT_FAIL]', {
          message: collectErr instanceof Error ? collectErr.message : String(collectErr),
          stack: collectErr instanceof Error ? collectErr.stack : null,
          raw: collectErr,
        });
        throw collectErr;
      }
      console.log('[ObstacleFlow][row/store]', {
        count: input?.basicField?.obstacles?.length ?? 0,
        top3: (input?.basicField?.obstacles ?? []).slice(0, 3).map((row: any) => ({
          id: row?.id,
          position: row?.position ?? null,
          startHeight: row?.startHeight,
          width: row?.width,
          length: row?.length,
          height: row?.height,
          angle: row?.angle,
          material: row?.material,
          shape: row?.shape,
          color: row?.color,
        })),
      });

      // Debug: snapshot existing BS rows before building payload
      const existingBsRowsForPayload =
        this.fieldDomainStore.snapshot?.existingBs ?? [];
      console.log(
        '[P3][ExistingBsRowsForPayload]',
        existingBsRowsForPayload
      );

      // Step 2: Build payload
      let builtPayload: any;
      console.log('[SIM_FLOW_STAGE]', 'before-build');
      try {
        const payload = this.baseTaskPayloadBuilder.build(input);
        builtPayload = payload as any;
        // [UE_BUILDER_RUNTIME]
        console.log('[UE_BUILDER_RUNTIME]', {
          ueCountInStore: this.fieldDomainStore.snapshot?.ueList?.length ?? 0,
          inputBasicFieldUeList: input?.basicField?.ueList ?? [],
          builtUeCoordinate: payload?.ueCoordinate,
          builtUeRxGain: payload?.ueRxGain,
          builtUseUeCoordinate: payload?.useUeCoordinate,
        });
        console.log(
          '[ZoneSerializer][regionalDivision]',
          (payload as any)?.field?.regionalDivision
        );
      } catch (builderErr) {
        console.error('[BUILDER_BUILD_FAILED]', {
          err: builderErr,
          message: builderErr instanceof Error ? builderErr.message : String(builderErr),
          stack: builderErr instanceof Error ? builderErr.stack : null,
          inputUeList: input?.basicField?.ueList,
          inputExistingBs: input?.basicField?.existingBs?.length,
        });
        throw builderErr;
      }
      console.log('[SIM_FLOW_STAGE]', 'after-build');
      console.log('[SIM_API_PHASE3][builderPayload][planning]', {
        inputPlanning: input?.planning,
        builderEvaluationFunc: (builtPayload as any)?.evaluationFunc,
        builderLegacyFlags: {
          isCoverage: (builtPayload as any)?.isCoverage,
          coverageRatio: (builtPayload as any)?.coverageRatio,
          isAverageSinr: (builtPayload as any)?.isAverageSinr,
          sinrRatio: (builtPayload as any)?.sinrRatio,
          isAverageRsrp: (builtPayload as any)?.isAverageRsrp,
          rsrpRatio: (builtPayload as any)?.rsrpRatio,
          isAvgThroughput: (builtPayload as any)?.isAvgThroughput,
          throughputRatio: (builtPayload as any)?.throughputRatio,
          isUeCoverage: (builtPayload as any)?.isUeCoverage,
          ueCoverageRatio: (builtPayload as any)?.ueCoverageRatio,
          isUeAvgSinr: (builtPayload as any)?.isUeAvgSinr,
          ueAvgSinrRatio: (builtPayload as any)?.ueAvgSinrRatio,
          isUeAvgThroughput: (builtPayload as any)?.isUeAvgThroughput,
          ueAvgThroughputRatio: (builtPayload as any)?.ueAvgThroughputRatio,
        },
      });
      const demoPayload: any = JSON.parse(JSON.stringify(TASK_PAYLOAD_MOCK_DEFAULTS));
      console.log('[SIM_FLOW_STAGE]', 'after-clone-mock');
      // [UE_MOCK_DEFAULT_RUNTIME]
      console.log('[UE_MOCK_DEFAULT_RUNTIME]', {
        mockUeCoordinate: TASK_PAYLOAD_MOCK_DEFAULTS?.ueCoordinate,
        mockUeRxGain: TASK_PAYLOAD_MOCK_DEFAULTS?.ueRxGain,
        mockUseUeCoordinate: TASK_PAYLOAD_MOCK_DEFAULTS?.useUeCoordinate,
        demoPayloadUeCoordinateAfterClone: demoPayload?.ueCoordinate,
        demoPayloadUeRxGainAfterClone: demoPayload?.ueRxGain,
        demoPayloadUseUeCoordinateAfterClone: demoPayload?.useUeCoordinate,
      });
      // 規劃目標：「進行現有場域訊號模擬」=> selectedPlanningMode === 'current'
      // 最終保底：確保 /son/simulation 的 simulation payload 一定是 isSimulation=true

      const bfSim = input.basicField;
      const gridMetersSim =
        bfSim.heatmapGridMeters ?? this.parseGrid(bfSim.heatmapGrid ?? '1x1');
      demoPayload.width = bfSim.length ?? 0;
      demoPayload.height = bfSim.width ?? 0;
      demoPayload.altitude = bfSim.height ?? 0;
      demoPayload.resolution = gridMetersSim;
      console.log('[SIM_RESOLUTION_CHECK] heatmapGrid:', bfSim.heatmapGrid, '-> gridMetersSim:', gridMetersSim, '-> demoPayload.resolution:', demoPayload.resolution);
      demoPayload.mapProtocol = bfSim.networkType ?? demoPayload.mapProtocol;
      demoPayload.lteBand = bfSim.band ?? demoPayload.lteBand;
      demoPayload.taskName =
        input.taskMeta.task_name || bfSim.projectName || demoPayload.taskName;
      demoPayload.zValue = JSON.stringify(
        Array.isArray(bfSim.cutHeights) ? bfSim.cutHeights : []
      );
      demoPayload.geographicalNorth = 0;
      if (typeof bfSim.rsrpThreshold === 'number') {
        demoPayload.rsrpThreshold = bfSim.rsrpThreshold;
      }
      if (typeof bfSim.sinrThreshold === 'number') {
        demoPayload.sinrThreshold = bfSim.sinrThreshold;
      }
      const DBG_ONLY_REAL_BS_POSITION = (window as any).__simOnlyRealBsPosition ?? true;

      if (!DBG_ONLY_REAL_BS_POSITION) {
        // ==============================
        // Patch 4：Inject Planning Payload（安全局部覆蓋）
        // ==============================

        try {
        const planning: any = input?.planning ?? null;

        if (planning) {
          const mode = planning?.selectedPlanningMode;

          const whole = planning?.wholeObjectives;
          const ue = planning?.ueObjectives;
          const area = planning?.areaObjectives;

          const isWholeLike = mode === 'whole' || mode === 'area';
          const isUeMode = mode === 'ue';

          const fieldSrc =
            mode === 'whole' ? whole :
            mode === 'area' ? area :
            null;

          const ueSrc = isUeMode ? ue : null;

          // ==============================
          // Flow semantic: this API path is simulation flow
          // ==============================
          demoPayload.isSimulation = true;

          // ==============================
          // Field flags：only for whole / area
          // ==============================
          demoPayload.isCoverage = isWholeLike ? !!fieldSrc?.coverage?.enabled : false;
          demoPayload.coverageRatio = isWholeLike ? (fieldSrc?.coverage?.ratio ?? 0) : 0;

          demoPayload.isAverageSinr = isWholeLike ? !!fieldSrc?.sinr?.enabled : false;
          demoPayload.sinrRatio = isWholeLike ? (fieldSrc?.sinr?.ratio ?? 0) : 0;

          demoPayload.isAverageRsrp = isWholeLike ? !!fieldSrc?.rsrp?.enabled : false;
          demoPayload.rsrpRatio = isWholeLike ? (fieldSrc?.rsrp?.ratio ?? 0) : 0;
          demoPayload.rsrpThreshold = isWholeLike ? (fieldSrc?.rsrp?.threshold ?? -90) : -90;

          demoPayload.isAvgThroughput = isWholeLike ? !!fieldSrc?.throughput?.enabled : false;
          demoPayload.throughputRatio = isWholeLike ? (fieldSrc?.throughput?.ratio ?? 0) : 0;

          // ==============================
          // UE flags：only for ue mode
          // ==============================
          demoPayload.isUeCoverage = isUeMode ? !!ueSrc?.coverage?.enabled : false;
          demoPayload.ueCoverageRatio = isUeMode ? (ueSrc?.coverage?.ratio ?? 0) : 0;

          demoPayload.isUeAvgSinr = isUeMode ? !!ueSrc?.sinr?.enabled : false;
          demoPayload.ueAvgSinrRatio = isUeMode ? (ueSrc?.sinr?.ratio ?? 0) : 0;

          demoPayload.isUeAvgThroughput = isUeMode ? !!ueSrc?.throughput?.enabled : false;
          demoPayload.ueAvgThroughputRatio = isUeMode ? (ueSrc?.throughput?.ratio ?? 0) : 0;

          console.log('[PATCH4.1][PlanningInjected]', {
            mode,
            isSimulation: demoPayload.isSimulation,
            field: {
              isCoverage: demoPayload.isCoverage,
              coverageRatio: demoPayload.coverageRatio,
              isAverageSinr: demoPayload.isAverageSinr,
              sinrRatio: demoPayload.sinrRatio,
              isAverageRsrp: demoPayload.isAverageRsrp,
              rsrpRatio: demoPayload.rsrpRatio,
              rsrpThreshold: demoPayload.rsrpThreshold,
              isAvgThroughput: demoPayload.isAvgThroughput,
              throughputRatio: demoPayload.throughputRatio,
            },
            ue: {
              isUeCoverage: demoPayload.isUeCoverage,
              ueCoverageRatio: demoPayload.ueCoverageRatio,
              isUeAvgSinr: demoPayload.isUeAvgSinr,
              ueAvgSinrRatio: demoPayload.ueAvgSinrRatio,
              isUeAvgThroughput: demoPayload.isUeAvgThroughput,
              ueAvgThroughputRatio: demoPayload.ueAvgThroughputRatio,
            },
          });
        }
      } catch (err) {
        console.warn('[PATCH4.1][PlanningInject][FAILED]', err);
      }

      // ==============================
      // Patch 5：Inject counts + radio config（安全局部覆蓋）
      // ==============================
      try {
        const planning: any = input?.planning ?? null;

        if (planning) {
          const duplexMode = String(planning?.duplexMode ?? planning?.tddConfig?.duplexMode ?? 'TDD').toUpperCase();
          const isTdd = duplexMode === 'TDD';

          const tdd = planning?.tddConfig ?? {};
          const fdd = planning?.fddConfig ?? {};
          const sharedRadio = tdd;
          const fddOnly = {
            ulCenterFreqMHz: fdd?.ulCenterFreqMHz,
            dlCenterFreqMHz: fdd?.dlCenterFreqMHz,
            ulScsKHz: fdd?.ulScsKHz,
            dlScsKHz: fdd?.dlScsKHz,
            ulBandwidthMHz: fdd?.ulBandwidthMHz,
            dlBandwidthMHz: fdd?.dlBandwidthMHz,
          };

          // ---------- counts ----------
          demoPayload.maxConnectionNum = Number(planning?.maxUePerTx ?? demoPayload.maxConnectionNum ?? 75);

          const isPlanningMode =
          String(planning?.mode ?? planning?.planningMode ?? '').toLowerCase() === 'planning';

          demoPayload.availableNewBsNumber =
            isPlanningMode && planning?.txCountMode === 'manual'
              ? Number(planning?.txCountManual ?? 0)
              : 0;

          demoPayload.availableNewRisNumber =
            planning?.risCountMode === 'manual'
              ? Number(planning?.risCountManual ?? 0)
              : Number(demoPayload.availableNewRisNumber ?? 0);

          // ---------- duplex ----------
          demoPayload.duplex = isTdd ? 'tdd' : 'fdd';

          // ---------- tx power ----------
          const txMin = Number(sharedRadio?.txPowerMin ?? demoPayload.powerMinRange ?? 10);
          const txMax = Number(sharedRadio?.txPowerMax ?? demoPayload.powerMaxRange ?? 24);

          demoPayload.powerMinRange = txMin;
          demoPayload.powerMaxRange = txMax;

          // 目前 payload 血統仍偏 legacy：txPower 通常送 "[max,max]"
          demoPayload.txPower = `[${txMax},${txMax}]`;

          // ---------- bs noise / gain / setting ----------
          const noiseFigure = Number(sharedRadio?.noiseFigure ?? 0);
          const txGain = Number(sharedRadio?.txGain ?? 0);
          const avgPowerW = Number(sharedRadio?.avgPowerW ?? 0);
          const bsCost = Number(sharedRadio?.bsCost ?? 0);
          const antenna = String(sharedRadio?.antenna ?? '');
          const powerUnitRaw = String(sharedRadio?.txPowerUnit ?? 'dBm');
          const powerUnit = powerUnitRaw.toLowerCase();

          // 依目前 bs 數量補成與 defaultBs 長度一致；不足時至少補 1
          const bsCount =
            Array.isArray(demoPayload?.bsList?.defaultBs) && demoPayload.bsList.defaultBs.length > 0
              ? demoPayload.bsList.defaultBs.length
              : 1;

          demoPayload.bsNoiseFigure = `[${Array.from({ length: bsCount }, () => noiseFigure).join(',')}]`;

          demoPayload.bsSetting = {
            ...(demoPayload.bsSetting ?? {}),
            isDAS: !!sharedRadio?.bsTypeDistributed,
            txPowerRange: [txMin, txMax],
            powerUnit,
            txGain,
            bsEnergy: avgPowerW,
            bsCost,
            antenna,
          };

          // ---------- radio ----------
          if (isTdd) {
            const centerFreqMHz = Number(tdd?.centerFreqMHz ?? 3600);
            const bandwidthMHz = Number(tdd?.bandwidthMHz ?? 100);
            const scsKHz = Number(tdd?.scsKHz ?? 30);
            const ulLayers = Number(sharedRadio?.ulLayers ?? 1);
            const dlLayers = Number(sharedRadio?.dlLayers ?? 1);
            const ulMcs = String(sharedRadio?.ulMcsTable ?? '64QAM-table');
            const dlMcs = String(sharedRadio?.dlMcsTable ?? '256QAM-table');

            demoPayload.frequency = `[${centerFreqMHz},${centerFreqMHz}]`;
            demoPayload.frequencyList = `[${centerFreqMHz},${centerFreqMHz}]`;

            demoPayload.bandwidth = `[${bandwidthMHz},${bandwidthMHz}]`;
            demoPayload.bandwidthList = `[${bandwidthMHz},${bandwidthMHz}]`;

            demoPayload.scs = `[${scsKHz},${scsKHz}]`;

            demoPayload.ulMcsTable = `[${ulMcs},${ulMcs}]`;
            demoPayload.dlMcsTable = `[${dlMcs},${dlMcs}]`;

            demoPayload.ulMimoLayer = `[${ulLayers},${ulLayers}]`;
            demoPayload.dlMimoLayer = `[${dlLayers},${dlLayers}]`;

            // TDD 沿用舊 payload：FDD 專屬欄位保持空陣列字串
            demoPayload.ulFrequency = '[]';
            demoPayload.dlFrequency = '[]';
            demoPayload.ulBandwidth = '[]';
            demoPayload.dlBandwidth = '[]';
            demoPayload.ulScs = '[]';
            demoPayload.dlScs = '[]';

            // 上下行配比：先保留舊映射 7:3 -> 70，6:4 -> 60
            const ratio = String(tdd?.ulDlRatio ?? 'D:U=7:3');
            demoPayload.tddFrameRatio = ratio.includes('6:4') ? 60 : 70;
          } else {
            const ulCenterFreqMHz = Number(fdd?.ulCenterFreqMHz ?? 3500);
            const dlCenterFreqMHz = Number(fdd?.dlCenterFreqMHz ?? 3700);
            const ulBandwidthMHz = Number(fdd?.ulBandwidthMHz ?? 100);
            const dlBandwidthMHz = Number(fdd?.dlBandwidthMHz ?? 100);
            const ulScsKHz = Number(fdd?.ulScsKHz ?? 30);
            const dlScsKHz = Number(fdd?.dlScsKHz ?? 30);
            const ulLayers = Number(sharedRadio?.ulLayers ?? 1);
            const dlLayers = Number(sharedRadio?.dlLayers ?? 1);
            const ulMcs = String(sharedRadio?.ulMcsTable ?? '64QAM-table');
            const dlMcs = String(sharedRadio?.dlMcsTable ?? '256QAM-table');

            // 舊 payload：先保留一組代表值（頻率/頻寬/scs）
            demoPayload.frequency = `[${ulCenterFreqMHz},${dlCenterFreqMHz}]`;
            demoPayload.frequencyList = `[${ulCenterFreqMHz},${dlCenterFreqMHz}]`;

            demoPayload.bandwidth = `[${ulBandwidthMHz},${dlBandwidthMHz}]`;
            demoPayload.bandwidthList = `[${ulBandwidthMHz},${dlBandwidthMHz}]`;

            demoPayload.scs = `[${ulScsKHz},${dlScsKHz}]`;

            demoPayload.ulFrequency = `[${ulCenterFreqMHz}]`;
            demoPayload.dlFrequency = `[${dlCenterFreqMHz}]`;
            demoPayload.ulBandwidth = `[${ulBandwidthMHz}]`;
            demoPayload.dlBandwidth = `[${dlBandwidthMHz}]`;
            demoPayload.ulScs = `[${ulScsKHz}]`;
            demoPayload.dlScs = `[${dlScsKHz}]`;

            demoPayload.ulMcsTable = `[${ulMcs},${ulMcs}]`;
            demoPayload.dlMcsTable = `[${dlMcs},${dlMcs}]`;

            demoPayload.ulMimoLayer = `[${ulLayers},${ulLayers}]`;
            demoPayload.dlMimoLayer = `[${dlLayers},${dlLayers}]`;
          }

          console.log('[PATCH5.1][RadioCountsInjected]', {
            duplex: demoPayload.duplex,
            maxConnectionNum: demoPayload.maxConnectionNum,
            availableNewBsNumber: demoPayload.availableNewBsNumber,
            availableNewRisNumber: demoPayload.availableNewRisNumber,
            txPower: demoPayload.txPower,
            powerMinRange: demoPayload.powerMinRange,
            powerMaxRange: demoPayload.powerMaxRange,
            frequency: demoPayload.frequency,
            bandwidth: demoPayload.bandwidth,
            scs: demoPayload.scs,
            ulMcsTable: demoPayload.ulMcsTable,
            dlMcsTable: demoPayload.dlMcsTable,
            ulMimoLayer: demoPayload.ulMimoLayer,
            dlMimoLayer: demoPayload.dlMimoLayer,
            bsNoiseFigure: demoPayload.bsNoiseFigure,
            bsSetting: demoPayload.bsSetting,
            sharedRadio,
            fddOnly,
          });
        }
      } catch (err) {
        console.warn('[PATCH5.1][RadioCountsInjected][FAILED]', err);
      }
      }

      // ==============================
      // Patch 6 / Patch 3：Inject real BS positions + antenna from scene/store
      // Uses bs-legacy-serializer for consistent legacy format
      // ==============================
      try {
        const existingBsRows = Array.isArray(input?.basicField?.existingBs)
          ? input.basicField.existingBs
          : [];

        // [BS_POLLUTION] Log B: existingBsRows after retrieval from input.basicField
        console.log('[BS_POLLUTION][existingBsRows]', {
          count: existingBsRows.length,
          rows: existingBsRows.map((r: any) => ({ id: r?.id, name: r?.name, x: r?.x, y: r?.y, z: r?.z, source: r?.source })),
        });

        console.log('[CHECK][payload source existingBs]', input.basicField?.existingBs);
        console.log(
          '[CHECK][payload source antenna summary]',
          (input.basicField?.existingBs ?? []).map((row: any) => ({
            id: row?.id,
            x: row?.x,
            y: row?.y,
            z: row?.z,
            antennaId: row?.antenna?.antennaID ?? null,
            antennaName: row?.antenna?.antennaName ?? null,
          }))
        );

        // [DEBUG][VERIFY] 組 payload 前：確認來源為 input.basicField.existingBs
        console.log('[DEBUG][VERIFY] input.basicField.existingBs (before assembly)', existingBsRows);
        console.log('[DEBUG][VERIFY] existingBs summary:', existingBsRows.map((r: any) => ({
          id: r?.id,
          x: r?.x,
          y: r?.y,
          z: r?.z,
          antennaId: r?.antenna?.antennaID ?? null,
          antennaName: r?.antenna?.antennaName ?? null,
        })));

        const sourceRows = toBsSourceRows(existingBsRows);

        console.log('[BS_POLLUTION][sourceRowsBuilt]', {
          existingBsRows: existingBsRows.map((r: any) => ({
            id: r?.id,
            x: r?.x,
            y: r?.y,
            z: r?.z,
            ownerMeshId: r?.ownerMeshId,
          })),
          sourceRows: sourceRows.map((r: any) => ({
            id: r?.id,
            x: r?.x,
            y: r?.y,
            z: r?.z,
          })),
        });

        if (sourceRows.length > 0) {
          demoPayload.defaultBs = serializeBsPositionsToLegacy(sourceRows);
          demoPayload.defaultBsAnt = serializeBsAntennaToLegacy(sourceRows);
          console.log('[BS_POLLUTION][afterSerializeBsPositions]', {
            sourceRowsCount: sourceRows.length,
            sourceRows: sourceRows.map((r: any) => ({
              id: r?.id,
              name: r?.name,
              x: r?.x,
              y: r?.y,
              z: r?.z,
            })),
            defaultBs: demoPayload.defaultBs,
            defaultBsAnt: demoPayload.defaultBsAnt,
          });

          // [BS_POLLUTION] Log C: before buildBsListDefaultBsFromRows
          console.log('[BS_POLLUTION][beforeBuildBsList]', {
            existingBsRowsCount: existingBsRows.length,
            sourceRowsCount: sourceRows.length,
            existingBsRows: existingBsRows.map((r: any) => ({ id: r?.id, x: r?.x, y: r?.y, z: r?.z })),
          });
          const _bsListBuilt = buildBsListDefaultBsFromRows(existingBsRows);
          // [BS_POLLUTION] Log C: after buildBsListDefaultBsFromRows
          console.log('[BS_POLLUTION][afterBuildBsList]', {
            builtCount: _bsListBuilt.length,
            builtRows: _bsListBuilt.map((bs: any) => ({ ID: bs?.ID, position: bs?.position })),
          });
          demoPayload.bsList = {
            ...(demoPayload.bsList ?? {}),
            defaultBs: _bsListBuilt,
          };

          console.log('[VERIFY][bsList.defaultBs rebuilt from rows]', (demoPayload.bsList.defaultBs ?? []).map((bs: any) => ({
            ID: bs?.ID,
            position: bs?.position,
            protocol: bs?.protocol,
            color: bs?.color,
            txPower: bs?.params?.txPower,
            band: bs?.params?.band,
            antenna0: bs?.antenna?.[0] ? {
              ID: bs.antenna[0].ID,
              gain: bs.antenna[0].gain,
              ulFrequency: bs.antenna[0].ulFrequency,
              installation: bs.antenna[0].position?.installation,
            } : null,
          })));

          console.log('[Patch3][BsSerializer] source BS data:', sourceRows.map((r) => ({
            id: r.id,
            position: [r.x, r.y, r.z],
            antennaId: r.antenna?.antennaID ?? null,
            antennaName: r.antenna?.antennaName ?? null,
          })));
          console.log('[Patch3][BsSerializer] serialized legacy:', {
            defaultBs: demoPayload.defaultBs,
            defaultBsAnt: demoPayload.defaultBsAnt,
          });
          console.log('[PATCH6][ExistingBsPositionInjected]', {
            existingBsCount: sourceRows.length,
            defaultBs: demoPayload.defaultBs,
            defaultBsAnt: demoPayload.defaultBsAnt,
            bsListDefaultBs: (demoPayload?.bsList?.defaultBs ?? []).map((bs: any) => ({
              ID: bs?.ID,
              position: bs?.position,
              antenna0: bs?.antenna?.[0] ?? null,
            })),
          });
        } else {
          console.log('[PATCH6][ExistingBsPositionInjected] skipped: no existingBs in input.basicField');
        }

        // [DEBUG][VERIFY] payload 組好後：確認 defaultBs / defaultBsAnt / bsList.defaultBs
        console.log('[DEBUG][VERIFY] payload after assembly:', {
          defaultBs: demoPayload.defaultBs,
          defaultBsAnt: demoPayload.defaultBsAnt,
          bsListDefaultBs: demoPayload?.bsList?.defaultBs ?? [],
        });

        console.log('[P3][finalBsPayloadReadable]', {
          defaultBs: demoPayload.defaultBs ?? null,
          defaultBsAnt: demoPayload.defaultBsAnt ?? null,
          bsListDefaultBsSummary: (demoPayload?.bsList?.defaultBs ?? []).map((bs: any) => ({
            ID: bs?.ID ?? null,
            position: bs?.position ?? null,
            txPower: bs?.params?.txPower ?? null,
            powerUnit: bs?.params?.powerUnit ?? null,
            noiseFigure: bs?.params?.noiseFigure ?? null,
            band: bs?.params?.band ?? null,
            antenna0: bs?.antenna?.[0]
              ? {
                  ID: bs.antenna[0].ID ?? null,
                  gain: bs.antenna[0].gain ?? null,
                  ulFrequency: bs.antenna[0].ulFrequency ?? null,
                  dlFrequency: bs.antenna[0].dlFrequency ?? null,
                  ulBandwidth: bs.antenna[0].ulBandwidth ?? null,
                  dlBandwidth: bs.antenna[0].dlBandwidth ?? null,
                  ulScs: bs.antenna[0].ulScs ?? null,
                  dlScs: bs.antenna[0].dlScs ?? null,
                  ulMcsTable: bs.antenna[0].ulMcsTable ?? null,
                  dlMcsTable: bs.antenna[0].dlMcsTable ?? null,
                  ulMimoLayer: bs.antenna[0].ulMimoLayer ?? null,
                  dlMimoLayer: bs.antenna[0].dlMimoLayer ?? null,
                  installation: bs.antenna[0].position?.installation ?? null,
                }
              : null,
          })),
        });

        console.log('[CHECK][serialized defaultBs]', demoPayload.defaultBs);
        console.log('[CHECK][serialized defaultBsAnt]', demoPayload.defaultBsAnt);
      } catch (err) {
        console.warn('[PATCH6][ExistingBsPositionInjected][FAILED]', err);
      }

      // ==============================
      // [P3][ExistingBsLegacyFields] Sync legacy BS radio fields from ExistingBsFieldRow
      // ==============================
      const rows = existingBsRowsForPayload ?? [];
      const toLegacyArrayString = (values: Array<string | number>) =>
        `[${values.join(',')}]`;

      (demoPayload as any).txPower = toLegacyArrayString(
        rows.map((row: any) => Number(row.txPower ?? 24))
      );
      (demoPayload as any).frequency = toLegacyArrayString(
        rows.map((row: any) => Number(row.centerFrequency ?? 4850))
      );
      (demoPayload as any).frequencyList = (demoPayload as any).frequency;

      (demoPayload as any).scs = toLegacyArrayString(
        rows.map((row: any) => Number(row.subcarrierSpacing ?? 30))
      );
      (demoPayload as any).bandwidth = toLegacyArrayString(
        rows.map((row: any) => Number(row.bandwidth ?? 100))
      );
      (demoPayload as any).bandwidthList = (demoPayload as any).bandwidth;

      (demoPayload as any).ulMimoLayer = toLegacyArrayString(
        rows.map((row: any) => Number(row.ulLayers ?? 1))
      );
      (demoPayload as any).dlMimoLayer = toLegacyArrayString(
        rows.map((row: any) => Number(row.dlLayers ?? 1))
      );

      (demoPayload as any).ulMcsTable = `[${rows
        .map((row: any) => row.ulModulation ?? '64QAM-table')
        .join(',')}]`;
      (demoPayload as any).dlMcsTable = `[${rows
        .map((row: any) => row.dlModulation ?? '256QAM-table')
        .join(',')}]`;

      (demoPayload as any).bsNoiseFigure = toLegacyArrayString(
        rows.map((row: any) => Number(row.noiseFigure ?? 0))
      );

      console.log('[P3][legacyBsFields]', {
        txPower: (demoPayload as any).txPower,
        frequency: (demoPayload as any).frequency,
        scs: (demoPayload as any).scs,
        bandwidth: (demoPayload as any).bandwidth,
        ulMimoLayer: (demoPayload as any).ulMimoLayer,
        dlMimoLayer: (demoPayload as any).dlMimoLayer,
        ulMcsTable: (demoPayload as any).ulMcsTable,
        dlMcsTable: (demoPayload as any).dlMcsTable,
        bsNoiseFigure: (demoPayload as any).bsNoiseFigure,
      });

      // [P3][ExistingBsLegacyDefaultBs]
      // Disabled: defaultBs is already written correctly by serializeBsPositionsToLegacy(sourceRows).
      // Do not overwrite it here, because this block uses firstRow only and may use stale / wrong coordinates.
      // if (rows.length > 0) {
      //   const firstRow: any = rows[0];
      //   const firstPos = [
      //     Number(firstRow.x ?? 0),
      //     Number(firstRow.y ?? 0),
      //     Number(firstRow.z ?? 0),
      //   ];
      //
      //   (demoPayload as any).defaultBs = JSON.stringify(firstPos);
      // }

      console.log('[P3][legacyDefaultBs]', {
        defaultBs: (demoPayload as any).defaultBs,
        defaultBsAnt: (demoPayload as any).defaultBsAnt,
      });

      // ==============================
      // [Experiment][BSArrayAlign] Trim top-level legacy radio array strings to match existingBs count
      // ==============================
      const existingBsCount = input?.basicField?.existingBs?.length ?? 0;
      const BS_COUNT_SENSITIVE_LEGACY_FIELDS = [
        'frequency',
        'frequencyList',
        'bandwidth',
        'bandwidthList',
        'txPower',
        'bsNoiseFigure',
        'scs',
        'dlMcsTable',
        'ulMcsTable',
        'dlMimoLayer',
        'ulMimoLayer',
      ] as const;

      if (existingBsCount > 0) {
        for (const field of BS_COUNT_SENSITIVE_LEGACY_FIELDS) {
          (demoPayload as any)[field] = this.trimLegacyArrayString((demoPayload as any)[field], existingBsCount);
        }
      }

      // 只保留每次都必須變動的欄位
      demoPayload.taskid = (builtPayload as any).taskid || '';
      demoPayload.sessionid =
        (builtPayload as any).sessionid ||
        (builtPayload as any).task_meta?.sessionid ||
        this.resolvePhase1SessionId?.() ||
        demoPayload.sessionid;

      // 如果 builder 會把 task_meta 一起送，保持一致
      if (!demoPayload.task_meta) {
        demoPayload.task_meta = {};
      }
      demoPayload.task_meta.taskid = demoPayload.taskid;
      demoPayload.task_meta.sessionid = demoPayload.sessionid;

      // Obstacle bridge: keep builder obstacleInfo in final request payload.
      demoPayload.obstacleInfo = String((builtPayload as any)?.obstacleInfo ?? demoPayload?.obstacleInfo ?? '');
      console.log('[ObstacleFlow][serializer/builder->finalPayload]', {
        builderObstacleInfoLength: String((builtPayload as any)?.obstacleInfo ?? '').length,
        finalObstacleInfoLength: String(demoPayload?.obstacleInfo ?? '').length,
        builderTop3: String((builtPayload as any)?.obstacleInfo ?? '').split('|').slice(0, 3),
        finalTop3: String(demoPayload?.obstacleInfo ?? '').split('|').slice(0, 3),
      });

      // RIS bridge: keep builder risList/defaultRis in final request payload.
      demoPayload.risList =
        (builtPayload as any).risList ?? { defaultRis: [], candidateRis: [] };
      console.log('[RIS_PAYLOAD_FINAL]', demoPayload.risList);
      const builderDefaultRis = Array.isArray(demoPayload.risList?.defaultRis)
        ? demoPayload.risList.defaultRis
        : [];
      demoPayload.ris = builderDefaultRis;
      demoPayload.candidateRisList = Array.isArray((builtPayload as any)?.candidateRisList)
        ? (builtPayload as any).candidateRisList
        : [];
      console.log('[RISFlow][serializer/builder->finalPayload]', {
        builderDefaultRisCount: builderDefaultRis.length,
        finalDefaultRisCount: Array.isArray(demoPayload?.risList?.defaultRis)
          ? demoPayload.risList.defaultRis.length
          : 0,
        builderTop3: builderDefaultRis.slice(0, 3),
        finalTop3: Array.isArray(demoPayload?.risList?.defaultRis)
          ? demoPayload.risList.defaultRis.slice(0, 3)
          : [],
      });

      const zValueRaw = demoPayload.zValue;
      demoPayload.zValue = this.normalizeZValueToApiString(demoPayload.zValue);

      console.log('[SIM][ZVALUE][CHECK]', {
        before: zValueRaw,
        after: demoPayload.zValue,
      });

      console.log('[SIM][DEMO_PAYLOAD][CHECK]', {
        taskid: demoPayload.taskid,
        sessionid: demoPayload.sessionid,
        taskName: demoPayload.taskName,
        mapName: demoPayload.mapName,
        width: demoPayload.width,
        height: demoPayload.height,
        altitude: demoPayload.altitude,
        defaultBs: demoPayload.defaultBs,
        ueCoordinate: demoPayload.ueCoordinate,
        zValue: demoPayload.zValue,
        evaluationFunc: demoPayload.evaluationFunc,
        duplex: demoPayload.duplex,
        lteBand: demoPayload.lteBand,
        pathLossModelId: demoPayload.pathLossModelId,
      });

      const originalTaskId = demoPayload.task_meta.taskid || demoPayload.task_meta.task_id || '';

      // storeTask should use empty taskid first, then overwrite from response before simulation
      demoPayload.taskid = '';
      if (demoPayload.task_meta) {
        demoPayload.task_meta.taskid = '';
      }

      console.log('[SIM_API_PHASE3][payload ready]', {
        taskid: demoPayload.taskid || demoPayload.task_meta.taskid,
        sessionid: demoPayload.sessionid || demoPayload.task_meta.sessionid,
        width: demoPayload.width,
        height: demoPayload.height,
        altitude: demoPayload.altitude
      });

      // ===== [PHASE8][FINAL_REQUEST_DEBUG] =====
      // Final gate before /son/storeTask: inspect obstacle/RIS consistency from modal(rows) -> builder -> final request.
      const normalizeRisFromModalRows = (rows: any[] = []) =>
        (rows || []).map((row: any) => ({
          risID: Number(row?.risID ?? row?.risId),
          profileID: Number(row?.profileID ?? row?.profileId),
          insHorizontal: Number(row?.insHorizontal ?? row?.installHorizontalAngle),
          insVertical: Number(row?.insVertical ?? row?.installVerticalAngle),
          location: {
            x: Number(row?.position?.x ?? row?.x),
            y: Number(row?.position?.y ?? row?.y),
            z: Number(row?.position?.z ?? row?.z),
          },
        }));

      const parseObstacleInfoPipe = (value: any): any[] => {
        if (typeof value !== 'string' || !value.trim()) return [];
        return value
          .split('|')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .map((part) => {
            try {
              const tuple = JSON.parse(part);
              return Array.isArray(tuple) ? tuple : null;
            } catch {
              return null;
            }
          })
          .filter((item) => Array.isArray(item));
      };

      const obstacleTupleSummary = (tuples: any[] = []) =>
        tuples.slice(0, 3).map((tuple: any[]) => ({
          width: tuple?.[3],
          length: tuple?.[4],
          height: tuple?.[5],
          angle: tuple?.[6],
          material: tuple?.[7],
          shape: tuple?.[8],
          color: tuple?.[9],
        }));

      const modalObstacleSummary = (rows: any[] = []) =>
        (rows || []).slice(0, 3).map((row: any) => ({
          width: row?.width,
          length: row?.length,
          height: row?.height,
          angle: row?.angle,
          material: row?.material,
          shape: row?.shape,
          color: row?.color,
        }));

      const modalRisNorm = normalizeRisFromModalRows(input?.basicField?.intelligentPanels ?? []);
      const builderRis = Array.isArray((builtPayload as any)?.risList?.defaultRis)
        ? (builtPayload as any).risList.defaultRis
        : [];
      const finalRis = Array.isArray(demoPayload?.risList?.defaultRis)
        ? demoPayload.risList.defaultRis
        : [];

      const builderObstacleRaw = (builtPayload as any)?.obstacleInfo;
      const finalObstacleRaw = demoPayload?.obstacleInfo;
      const builderObstacleTuples = parseObstacleInfoPipe(builderObstacleRaw);
      const finalObstacleTuples = parseObstacleInfoPipe(finalObstacleRaw);
      const classifyObstacleTuple = (tuple: any[]): 'building' | 'landscape' | 'basic' => {
        const shape = String(tuple?.[8] ?? '').toLowerCase();
        if (shape === 'building') return 'building';
        if (shape === 'landscape') return 'landscape';
        return 'basic';
      };
      const finalObstacleClassified = finalObstacleTuples.reduce(
        (acc, tuple) => {
          const kind = classifyObstacleTuple(tuple);
          acc[kind] += 1;
          return acc;
        },
        { basic: 0, landscape: 0, building: 0 }
      );
      const finalBuildingTuplePreview = finalObstacleTuples
        .filter((tuple) => classifyObstacleTuple(tuple) === 'building')
        .slice(0, 3);
      const buildingInputTotal =
        ((input?.basicField as any)?.buildingRows?.length ?? 0) +
        ((input?.basicField as any)?.buildingMeshes?.length ?? 0);
      const buildingSuccessCount = finalObstacleClassified.building;
      const buildingSkipCount = Math.max(0, buildingInputTotal - buildingSuccessCount);
      if (buildingInputTotal > 0 && buildingSuccessCount === 0) {
        console.warn('[Obstacle][Final][BuildingAllSkipped]', {
          buildingInputTotal,
          buildingSkipCount,
          buildingSkipReasons: this.baseTaskPayloadBuilder.lastObstacleBuildingSkips,
        });
      }

      const obstacleBuilderVsFinalConsistent =
        String(builderObstacleRaw ?? '') === String(finalObstacleRaw ?? '');
      const risBuilderVsFinalConsistent =
        JSON.stringify(builderRis) === JSON.stringify(finalRis);

      console.log('[PHASE8][DEBUG][obstacleInfo]', {
        builderLength: typeof builderObstacleRaw === 'string' ? builderObstacleRaw.length : 0,
        finalLength: typeof finalObstacleRaw === 'string' ? finalObstacleRaw.length : 0,
        builderTupleCount: builderObstacleTuples.length,
        finalTupleCount: finalObstacleTuples.length,
        builderSummaryTop3: obstacleTupleSummary(builderObstacleTuples),
        finalSummaryTop3: obstacleTupleSummary(finalObstacleTuples),
      });
      console.log('[Obstacle][FinalPayload][BeforeRequest]', {
        obstacleInfoLength: typeof finalObstacleRaw === 'string' ? finalObstacleRaw.length : 0,
        obstacleTupleCount: finalObstacleTuples.length,
        previewTop3: String(finalObstacleRaw ?? '').split('|').slice(0, 3),
        basicTupleCount: finalObstacleClassified.basic,
        landscapeTupleCount: finalObstacleClassified.landscape,
        buildingTupleCount: finalObstacleClassified.building,
        buildingPreviewTop3: finalBuildingTuplePreview,
        buildingInputTotal,
        buildingSuccessCount,
        buildingSkipCount,
      });

      console.log('[PHASE8][DEBUG][risList.defaultRis]', {
        builderCount: builderRis.length,
        finalCount: finalRis.length,
        builderTop3: builderRis.slice(0, 3),
        finalTop3: finalRis.slice(0, 3),
      });

      console.log('[PHASE8][VALIDATE][modal-vs-builder-vs-final]', {
        obstacle: {
          modalTop3: modalObstacleSummary(input?.basicField?.obstacles ?? []),
          builderTop3: obstacleTupleSummary(builderObstacleTuples),
          finalTop3: obstacleTupleSummary(finalObstacleTuples),
        },
        ris: {
          modalTop3: modalRisNorm.slice(0, 3),
          builderTop3: builderRis.slice(0, 3),
          finalTop3: finalRis.slice(0, 3),
        },
        consistency: {
          obstacleBuilderVsFinal: obstacleBuilderVsFinalConsistent,
          risBuilderVsFinal: risBuilderVsFinalConsistent,
        },
      });

      if (
        ((typeof builderObstacleRaw === 'string' && builderObstacleRaw.length > 0) ||
          builderRis.length > 0) &&
        ((typeof finalObstacleRaw !== 'string' || finalObstacleRaw.length === 0) ||
          finalRis.length === 0)
      ) {
        console.warn('[PHASE8][MISMATCH][builder-has-value-but-final-request-empty]', {
          builder: {
            obstacleInfoLength: typeof builderObstacleRaw === 'string' ? builderObstacleRaw.length : 0,
            risDefaultCount: builderRis.length,
          },
          finalRequest: {
            obstacleInfoLength: typeof finalObstacleRaw === 'string' ? finalObstacleRaw.length : 0,
            risDefaultCount: finalRis.length,
          },
          suspectedOverwriteStage:
            'between builder output (payload) and final request assembly (demoPayload) in runSimulationApiFlow',
        });
      }

      // ===== [LEGACY_FLAGS_INJECT][FINAL] =====
      // 將 evaluationFunc 映射到 /son/simulation 會吃的 legacy flags
      // 目標：避免 Patch 4 被 DBG gate 擋住導致 legacy flags 與 evaluationFunc 脫鉤
      try {
        const finalPayload: any = demoPayload;
        const evaluationFuncForFlags =
          (builtPayload as any)?.evaluationFunc ?? finalPayload?.evaluationFunc ?? null;

        const toFiniteNumber = (v: any): number | null => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        const extractRatioNumber = (rawRatio: any): number | null => {
          if (rawRatio == null) return null;

          // If ratio is array, use first element.
          if (Array.isArray(rawRatio)) {
            if (rawRatio.length === 0) return null;
            return extractRatioNumber(rawRatio[0]);
          }

          if (typeof rawRatio === 'number') {
            return Number.isFinite(rawRatio) ? rawRatio : null;
          }

          if (typeof rawRatio === 'string') {
            return toFiniteNumber(rawRatio);
          }

          if (typeof rawRatio === 'object') {
            const byValue = toFiniteNumber((rawRatio as any)?.value);
            if (byValue != null) return byValue;

            const byRatio = toFiniteNumber((rawRatio as any)?.ratio);
            if (byRatio != null) return byRatio;

            const byDl = toFiniteNumber((rawRatio as any)?.DLValue);
            if (byDl != null) return byDl;

            const byUl = toFiniteNumber((rawRatio as any)?.ULValue);
            if (byUl != null) return byUl;
          }

          return toFiniteNumber(rawRatio);
        };

        const fieldEval = evaluationFuncForFlags?.field ?? null;
        const ueEval = evaluationFuncForFlags?.ue ?? null;

        // Field -> legacy flags
        if (fieldEval?.coverage) {
          if (typeof fieldEval.coverage.activate === 'boolean') {
            finalPayload.isCoverage = fieldEval.coverage.activate;
          }
          const rn = extractRatioNumber(fieldEval.coverage.ratio);
          if (rn != null) finalPayload.coverageRatio = rn;
        }

        if (fieldEval?.sinr) {
          if (typeof fieldEval.sinr.activate === 'boolean') {
            finalPayload.isAverageSinr = fieldEval.sinr.activate;
          }
          const rn = extractRatioNumber(fieldEval.sinr.ratio);
          if (rn != null) finalPayload.sinrRatio = rn;
        }

        if (fieldEval?.throughput) {
          if (typeof fieldEval.throughput.activate === 'boolean') {
            finalPayload.isAvgThroughput = fieldEval.throughput.activate;
          }
          const rn = extractRatioNumber(fieldEval.throughput.ratio);
          if (rn != null) finalPayload.throughputRatio = rn;
        }

        // UE -> legacy flags
        if (ueEval?.coverage) {
          if (typeof ueEval.coverage.activate === 'boolean') {
            finalPayload.isUeCoverage = ueEval.coverage.activate;
          }
          const rn = extractRatioNumber(ueEval.coverage.ratio);
          if (rn != null) finalPayload.ueCoverageRatio = rn;
        }

        if (ueEval?.sinr) {
          if (typeof ueEval.sinr.activate === 'boolean') {
            finalPayload.isUeAvgSinr = ueEval.sinr.activate;
          }
          const rn = extractRatioNumber(ueEval.sinr.ratio);
          if (rn != null) finalPayload.ueAvgSinrRatio = rn;
        }

        if (ueEval?.throughput) {
          if (typeof ueEval.throughput.activate === 'boolean') {
            finalPayload.isUeAvgThroughput = ueEval.throughput.activate;
          }
          const rn = extractRatioNumber(ueEval.throughput.ratio);
          if (rn != null) finalPayload.ueAvgThroughputRatio = rn;
        }

        console.log('[LEGACY_FLAGS_INJECT][FINAL]', {
          evaluationFunc: finalPayload.evaluationFunc,
          isCoverage: finalPayload.isCoverage,
          coverageRatio: finalPayload.coverageRatio,
          isAverageSinr: finalPayload.isAverageSinr,
          sinrRatio: finalPayload.sinrRatio,
          isAvgThroughput: finalPayload.isAvgThroughput,
          throughputRatio: finalPayload.throughputRatio,
          isUeCoverage: finalPayload.isUeCoverage,
          ueCoverageRatio: finalPayload.ueCoverageRatio,
          isUeAvgSinr: finalPayload.isUeAvgSinr,
          ueAvgSinrRatio: finalPayload.ueAvgSinrRatio,
          isUeAvgThroughput: finalPayload.isUeAvgThroughput,
          ueAvgThroughputRatio: finalPayload.ueAvgThroughputRatio,
        });
      } catch (e) {
        console.warn('[LEGACY_FLAGS_INJECT][FINAL] failed', e);
      }

      // ===== [LEGACY_FLAGS_SYNC][MINIMAL] =====
      console.log('[SIM_FLOW_STAGE]', 'before-sync-legacy');
      try {
        this.syncLegacyFlagsFromEvaluationFunc(demoPayload);
        console.log('[SIM_FLOW_HELPER_DONE]', 'syncLegacyFlagsFromEvaluationFunc');
      } catch (err) {
        console.error('[SIM_FLOW_HELPER_FAIL]', {
          helper: 'syncLegacyFlagsFromEvaluationFunc',
          err,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : null,
        });
        throw err;
      }
      console.log('[SIM_FLOW_STAGE]', 'after-sync-legacy');
      console.log('[LEGACY_FLAGS_SYNC][MINIMAL]', {
        evaluationFunc: demoPayload?.evaluationFunc,
        isCoverage: demoPayload?.isCoverage,
        coverageRatio: demoPayload?.coverageRatio,
        isAverageSinr: demoPayload?.isAverageSinr,
        sinrRatio: demoPayload?.sinrRatio,
        isUeCoverage: demoPayload?.isUeCoverage,
        ueCoverageRatio: demoPayload?.ueCoverageRatio,
      });


      // ===== [UE_FINALIZE][STRICT] =====
      // Only use builder output for UE fields; never fallback to mock
      demoPayload.ueCoordinate = typeof builtPayload?.ueCoordinate === 'string' && builtPayload.ueCoordinate.length > 0
        ? builtPayload.ueCoordinate
        : '';
      demoPayload.ueRxGain = typeof builtPayload?.ueRxGain === 'string' && builtPayload.ueRxGain.length > 0
        ? builtPayload.ueRxGain
        : '[]';
      demoPayload.useUeCoordinate = typeof builtPayload?.useUeCoordinate === 'number' && builtPayload.useUeCoordinate > 0
        ? builtPayload.useUeCoordinate
        : 0;

      // Debug log for strict UE source
      console.log('[UE_FINAL_SOURCE_STRICT]', {
        builtUeCoordinate: builtPayload?.ueCoordinate ?? null,
        builtUeRxGain: builtPayload?.ueRxGain ?? null,
        builtUseUeCoordinate: builtPayload?.useUeCoordinate ?? null,
        finalUeCoordinate: demoPayload?.ueCoordinate ?? null,
        finalUeRxGain: demoPayload?.ueRxGain ?? null,
        finalUseUeCoordinate: demoPayload?.useUeCoordinate ?? null,
      });

      // ===== [PAYLOAD_FINAL_BRIDGE] Phase 2: bridge builtPayload real fields to demoPayload =====
      // subfieldList: builder computes from observeList + zoneList; mock has a hardcoded shape entry
      demoPayload.subfieldList = (builtPayload as any).subfieldList ?? [];
      // field: carries regionalDivision computed from zoneList; mock has a hardcoded region
      demoPayload.field = (builtPayload as any).field ?? demoPayload.field;
      // evaluationFunc: builder computes from store thresholds; mock has DEFAULT_EVALUATION_FUNC
      demoPayload.evaluationFunc = (builtPayload as any).evaluationFunc ?? demoPayload.evaluationFunc;
      // UE fields: already handled by [UE_FINALIZE][STRICT] above; confirm with ?? form
      demoPayload.ueCoordinate = (builtPayload as any).ueCoordinate ?? '';
      demoPayload.ueRxGain = (builtPayload as any).ueRxGain ?? '[]';
      demoPayload.useUeCoordinate = (builtPayload as any).useUeCoordinate ?? 0;
      // risList / ris: already bridged in [RIS bridge] above; re-affirm here for consistency
      demoPayload.risList = (builtPayload as any).risList ?? { defaultRis: [], candidateRis: [] };
      demoPayload.ris = (builtPayload as any).risList?.defaultRis ?? [];

      console.log('[PAYLOAD_FINAL_BRIDGE]', {
        built: {
          subfieldList: (builtPayload as any).subfieldList,
          field: (builtPayload as any).field,
          evaluationFunc: (builtPayload as any).evaluationFunc,
          ueCoordinate: (builtPayload as any).ueCoordinate,
          risList: (builtPayload as any).risList,
        },
        final: {
          subfieldList: demoPayload.subfieldList,
          field: demoPayload.field,
          evaluationFunc: demoPayload.evaluationFunc,
          ueCoordinate: demoPayload.ueCoordinate,
          risList: demoPayload.risList,
        },
      });
      // ===== [/PAYLOAD_FINAL_BRIDGE] =====

      // ===== [SUBFIELD_PAYLOAD_FINAL] Phase 4: final subfieldList from snapshot.subfields via serializer =====
      // Overrides Phase 2 bridge (builtPayload.subfieldList from observes+zones).
      // snapshot.subfields contains real rectangle geometry written by Phase 3 observe spawn.
      demoPayload.subfieldList = serializeSubfieldPayloadRows(
        this.fieldDomainStore.snapshot?.subfields ?? []
      );
      console.log('[SUBFIELD_PAYLOAD_FINAL]', {
        storeSubfields: this.fieldDomainStore.snapshot?.subfields ?? [],
        finalSubfieldList: demoPayload.subfieldList,
      });
      // ===== [/SUBFIELD_PAYLOAD_FINAL] =====

      // Step 3: POST storeTask
      // 最終保底：selectedPlanningMode=current 的「現有場域訊號模擬」一定要是 isSimulation=true
      demoPayload.isSimulation = true;
      console.log('[SIM_API_PHASE3] Calling storeTask...');
      console.log('[DBG][ONLY_REAL_BS_POSITION][FINAL_PAYLOAD_CHECK]', {
        enabled: DBG_ONLY_REAL_BS_POSITION,
        taskid: demoPayload?.taskid,
        sessionid: demoPayload?.sessionid,
        defaultBs: demoPayload?.defaultBs,
        defaultBsAnt: demoPayload?.defaultBsAnt,
        bsListDefaultBs: (demoPayload?.bsList?.defaultBs ?? []).map((bs: any) => ({
          ID: bs?.ID,
          position: bs?.position,
          antenna0: bs?.antenna?.[0]?.position?.coordinate ?? null,
        })),
        frequency: demoPayload?.frequency,
        frequencyList: demoPayload?.frequencyList,
        obstacleInfo: demoPayload?.obstacleInfo,
        ueCoordinate: demoPayload?.ueCoordinate,
        coverageRatio: demoPayload?.coverageRatio,
        sinrRatio: demoPayload?.sinrRatio,
        throughputRatio: demoPayload?.throughputRatio,
      });
      console.log('[ObstacleFlow][final-request-payload]', {
        obstacleInfo: demoPayload?.obstacleInfo,
      });

      // [Patch 3] Final payload debug: source BS, serialized legacy, final request
      const sourceBsForLog = toBsSourceRows(input?.basicField?.existingBs ?? []);
      console.log('[Patch3][FINAL_PAYLOAD]', {
        sourceBsList: sourceBsForLog.map((r) => ({
          id: r.id,
          position: [r.x, r.y, r.z],
          antennaId: r.antenna?.antennaID ?? null,
          antennaName: r.antenna?.antennaName ?? null,
        })),
        serialized: {
          defaultBs: demoPayload?.defaultBs,
          defaultBsAnt: demoPayload?.defaultBsAnt,
        },
        finalPayload: {
          taskid: demoPayload?.taskid,
          sessionid: demoPayload?.sessionid,
          defaultBs: demoPayload?.defaultBs,
          defaultBsAnt: demoPayload?.defaultBsAnt,
          bsListDefaultBsCount: (demoPayload?.bsList?.defaultBs ?? []).length,
        },
      });

      // [STORETASK_FINAL_RUNTIME]
      console.log('[STORETASK_FINAL_RUNTIME]', {
        ueCountInStore: this.fieldDomainStore.snapshot?.ueList?.length ?? 0,
        finalUeCoordinate: demoPayload?.ueCoordinate ?? null,
        finalUeRxGain: demoPayload?.ueRxGain ?? null,
        finalUseUeCoordinate: demoPayload?.useUeCoordinate ?? null,
        taskid: demoPayload?.taskid ?? null,
      });
      console.log('[SIM_FLOW_STAGE]', 'before-store-task');

      // ===== [PAYLOAD_SOURCE_AUDIT] builtPayload vs demoPayload before postStoreTask =====
      console.log('[PAYLOAD_SOURCE_AUDIT]', {
        // --- subfieldList ---
        builtSubfieldList: (builtPayload as any)?.subfieldList ?? 'NOT_IN_BUILDER',
        demoSubfieldList: demoPayload?.subfieldList,
        subfieldListFromMock: JSON.stringify(demoPayload?.subfieldList) === JSON.stringify((TASK_PAYLOAD_MOCK_DEFAULTS as any)?.subfieldList),

        // --- ueCoordinate / ueRxGain / useUeCoordinate ---
        builtUeCoordinate: (builtPayload as any)?.ueCoordinate ?? null,
        demoUeCoordinate: demoPayload?.ueCoordinate,
        builtUeRxGain: (builtPayload as any)?.ueRxGain ?? null,
        demoUeRxGain: demoPayload?.ueRxGain,
        builtUseUeCoordinate: (builtPayload as any)?.useUeCoordinate ?? null,
        demoUseUeCoordinate: demoPayload?.useUeCoordinate,

        // --- risList / ris ---
        builtRisListDefaultCount: Array.isArray((builtPayload as any)?.risList?.defaultRis) ? (builtPayload as any).risList.defaultRis.length : 'MISSING',
        demoRisListDefaultCount: Array.isArray(demoPayload?.risList?.defaultRis) ? demoPayload.risList.defaultRis.length : 'MISSING',
        demoRisCount: Array.isArray(demoPayload?.ris) ? demoPayload.ris.length : 'MISSING',

        // --- bsList / defaultBs / defaultBsAnt ---
        builtBsListDefaultBsCount: Array.isArray((builtPayload as any)?.bsList?.defaultBs) ? (builtPayload as any).bsList.defaultBs.length : 'NOT_IN_BUILDER',
        demoBsListDefaultBsCount: Array.isArray(demoPayload?.bsList?.defaultBs) ? demoPayload.bsList.defaultBs.length : 'MISSING',
        demoDefaultBs: demoPayload?.defaultBs,
        demoDefaultBsAnt: demoPayload?.defaultBsAnt,
        defaultBsFromMock: demoPayload?.defaultBs === (TASK_PAYLOAD_MOCK_DEFAULTS as any)?.defaultBs,

        // --- obstacleInfo ---
        builtObstacleInfoLength: String((builtPayload as any)?.obstacleInfo ?? '').length,
        demoObstacleInfoLength: String(demoPayload?.obstacleInfo ?? '').length,
        obstacleInfoMatch: (builtPayload as any)?.obstacleInfo === demoPayload?.obstacleInfo,

        // --- field.regionalDivision ---
        builtFieldRegionalDivisionCount: Array.isArray((builtPayload as any)?.field?.regionalDivision) ? (builtPayload as any).field.regionalDivision.length : 'NOT_IN_BUILDER',
        demoFieldRegionalDivisionCount: Array.isArray(demoPayload?.field?.regionalDivision) ? demoPayload.field.regionalDivision.length : 'MISSING',
        fieldRegionalDivisionFromMock: JSON.stringify(demoPayload?.field?.regionalDivision) === JSON.stringify((TASK_PAYLOAD_MOCK_DEFAULTS as any)?.field?.regionalDivision),

        // --- evaluationFunc ---
        builtEvaluationFunc: (builtPayload as any)?.evaluationFunc ?? null,
        demoEvaluationFunc: demoPayload?.evaluationFunc,
        evaluationFuncFromMock: JSON.stringify(demoPayload?.evaluationFunc) === JSON.stringify((TASK_PAYLOAD_MOCK_DEFAULTS as any)?.evaluationFunc),

        // --- width / height / resolution ---
        demoWidth: demoPayload?.width,
        demoHeight: demoPayload?.height,
        demoResolution: demoPayload?.resolution,
        widthFromMock: demoPayload?.width === (TASK_PAYLOAD_MOCK_DEFAULTS as any)?.width,
        heightFromMock: demoPayload?.height === (TASK_PAYLOAD_MOCK_DEFAULTS as any)?.height,

        // --- mapImage / mapName ---
        demoMapName: demoPayload?.mapName,
        demoMapImagePrefix: String(demoPayload?.mapImage ?? '').slice(0, 40),
        mapNameFromMock: demoPayload?.mapName === (TASK_PAYLOAD_MOCK_DEFAULTS as any)?.mapName,
        mapImageFromMock: demoPayload?.mapImage === (TASK_PAYLOAD_MOCK_DEFAULTS as any)?.mapImage,

        // --- postStoreTask variable ---
        actualArgIsDemo: true, // postStoreTask(demoPayload) — always demoPayload
      });
      // ===== [/PAYLOAD_SOURCE_AUDIT] =====

      // [BS_POLLUTION] Log D: final payload immediately before POST /son/storeTask
      console.log('[BS_POLLUTION][finalPayload]', {
        bsListDefaultBsCount: (demoPayload?.bsList?.defaultBs ?? []).length,
        bsListDefaultBsPositions: (demoPayload?.bsList?.defaultBs ?? []).map((bs: any) => bs?.position),
        defaultBs: demoPayload?.defaultBs,
        defaultBsAnt: demoPayload?.defaultBsAnt,
        txPower: demoPayload?.txPower,
        frequency: demoPayload?.frequency,
        bandwidth: demoPayload?.bandwidth,
        bandwidthList: demoPayload?.bandwidthList,
        bsNoiseFigure: demoPayload?.bsNoiseFigure,
      });

      console.log('[BS_POLLUTION][BEFORE_POST_STORE_TASK_EXACT]', {
        taskid: demoPayload?.taskid,
        taskMetaTaskid: demoPayload?.task_meta?.taskid,
        sessionid: demoPayload?.sessionid,
        createTime: demoPayload?.createTime,
        defaultBs: demoPayload?.defaultBs,
        defaultBsAnt: demoPayload?.defaultBsAnt,
        bsListDefaultBsCount: demoPayload?.bsList?.defaultBs?.length,
        bsListDefaultBsPositions: demoPayload?.bsList?.defaultBs?.map((b: any) => b?.position),
        txPower: demoPayload?.txPower,
        frequency: demoPayload?.frequency,
        bandwidth: demoPayload?.bandwidth,
      });
      const storeTaskResp = await firstValueFrom(this.taskApiService.postStoreTask(demoPayload));
      console.log('[SIM_API_PHASE3] storeTask response status:', storeTaskResp.status);

      // Try to parse taskid from response
      let finalTaskId = originalTaskId;
      try {
        const respBody = storeTaskResp.body;
        if (respBody && typeof respBody === 'string') {
          const parsed = JSON.parse(respBody);
          if (parsed.taskid) {
            finalTaskId = parsed.taskid;
            console.log('[SIM_API_PHASE3] Extracted taskid from response:', finalTaskId);
          }
        }
      } catch (parseErr) {
        console.warn('[SIM_API_PHASE3] Could not parse taskid from storeTask response, using original', parseErr);
      }

      console.log('[SIM_API_PHASE3] Using taskid:', finalTaskId);

      demoPayload.taskid = finalTaskId;
      if (demoPayload.task_meta) {
        demoPayload.task_meta.taskid = finalTaskId;
      }

      // Phase 5 — last gate before /son/simulation: obstacleInfo must match builder + tuple-kind breakdown.
      const simFinalObstacleRaw = demoPayload?.obstacleInfo;
      const simFinalTuples = parseObstacleInfoPipe(simFinalObstacleRaw);
      const simFinalClassified = simFinalTuples.reduce(
        (acc, tuple) => {
          const kind = classifyObstacleTuple(tuple);
          acc[kind] += 1;
          return acc;
        },
        { basic: 0, landscape: 0, building: 0 }
      );
      const simFinalBuildingPreview = simFinalTuples
        .filter((tuple) => classifyObstacleTuple(tuple) === 'building')
        .slice(0, 3)
        .map((tuple) => JSON.stringify(tuple));
      const simBuildingInputTotal =
        ((input?.basicField as any)?.buildingRows?.length ?? 0) +
        ((input?.basicField as any)?.buildingMeshes?.length ?? 0);
      const simBuildingSuccess = simFinalClassified.building;
      const simBuildingSkipped = Math.max(0, simBuildingInputTotal - simBuildingSuccess);

      console.log('[Obstacle][SimFinal]', {
        obstacleInfoLength: typeof simFinalObstacleRaw === 'string' ? simFinalObstacleRaw.length : 0,
        tupleCount: simFinalTuples.length,
        previewPipeFirst3: String(simFinalObstacleRaw ?? '').split('|').slice(0, 3),
        tupleKind: {
          basic: simFinalClassified.basic,
          landscape: simFinalClassified.landscape,
          building: simFinalClassified.building,
        },
        building: {
          inputTotal: simBuildingInputTotal,
          successInPayload: simBuildingSuccess,
          skipped: simBuildingSkipped,
        },
        buildingTuplePreviewFirst3: simFinalBuildingPreview,
      });
      if (simBuildingInputTotal > 0 && simBuildingSuccess === 0) {
        console.error('[Obstacle][SimFinal][BuildingAllSkipped]', {
          buildingSkipReasons: this.baseTaskPayloadBuilder.lastObstacleBuildingSkips,
        });
      }

      // Step 4: POST simulation
      console.log('[P3][finalBsPayload]', {
        bsList: (demoPayload as any).bsList,
        txPower: (demoPayload as any).txPower,
        frequency: (demoPayload as any).frequency,
        scs: (demoPayload as any).scs,
        bandwidth: (demoPayload as any).bandwidth,
        ulMimoLayer: (demoPayload as any).ulMimoLayer,
        dlMimoLayer: (demoPayload as any).dlMimoLayer,
        ulMcsTable: (demoPayload as any).ulMcsTable,
        dlMcsTable: (demoPayload as any).dlMcsTable,
        bsNoiseFigure: (demoPayload as any).bsNoiseFigure,
        defaultBs: (demoPayload as any).defaultBs,
        defaultBsAnt: (demoPayload as any).defaultBsAnt,
      });
      console.log('[SIM_API_PHASE3] Calling simulation...');
      const simulationResp = await firstValueFrom(this.simulationApiService.postSimulation(demoPayload));
      console.log('[SIM_API_PHASE3] simulation response status:', simulationResp.status);

      const finalSessionId = demoPayload.task_meta.sessionid || input.taskMeta.sessionId || '';


      console.log('[SIM_API_PHASE3][progress] start', {
        taskId: finalTaskId,
        sessionId: finalSessionId,
      });

      const progressState = await this.pollSimulationProgress(
        finalTaskId,
        finalSessionId
      );

      // ===== STEP 3: GET completeCalcResult =====
      console.log('[SIM_API_PHASE3] fetching completeCalcResult...');

      const completeRes = await firstValueFrom(
        this.resultApiService.getCompleteCalcResult(finalTaskId, finalSessionId)
      );

      console.log('[SIM_API_PHASE3] completeCalcResult received', completeRes);
      if (this.DEBUG_HEATMAP) { console.log('[HEATMAP][API] response received'); }
      const resp = completeRes;
      const output = resp?.['5GOutput'];
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][API] keys:', Object.keys(resp || {}));
        console.log('[HEATMAP][API] has 5GOutput:', !!output);
      }
      const sinrMap = output?.sinrMap;
      const rsrpMap = output?.rsrpMap;
      const dlMap = output?.dlThroughputMap;
      const ulMap = output?.ulThroughputMap;
      if (this.DEBUG_HEATMAP) {
        console.log('[HEATMAP][API] map existence', { sinr: !!sinrMap, rsrp: !!rsrpMap, dl: !!dlMap, ul: !!ulMap });
      }

      if (!completeRes) {
        console.warn('[SIM_API_PHASE3] completeCalcResult is empty -> show failure');
        // 顯示「運算失敗」視窗（目前以 computeLoading overlay 顯示文案）
        this.rightPanelType = null;
        try {
          this.resultService.resetToEdit();
        } catch {}
        return;
      }

      const resultAnalysis = this.analyzeCompleteCalcResult(completeRes);
      console.log('[SIM_API_PHASE3][result-analysis]', resultAnalysis);

      // ===== 核心：存進 state =====
      this.clearHeatmapRenderCache();
      this.completeCalcResult = completeRes;
      this.lastCompleteCalcResult = completeRes;
      this.resultService.setResultData(completeRes as ResultApiResponse);

      this.sliceHeightOptions = this.parseSliceHeightOptionsFromCompleteCalcResult(completeRes);
      console.log('[SliceHeight][Options]', this.sliceHeightOptions);
      if (this.sliceHeightOptions.length > 0) {
        const hasCurrent = this.sliceHeightOptions.includes(this.sliceHeight);
        this.sliceHeight = hasCurrent ? this.sliceHeight : this.sliceHeightOptions[0];
      }

      console.log('[RESULT_WRITE_BACK]', {
        completeRes,
        inputRisList: completeRes?.input?.risList,
        chosenRisList: completeRes?.['5GOutput']?.chosenRisList,
        hasResultService: !!this.resultService,
        resultSignalNow: this.resultService?.result?.(),
      });

      // ===== [SIM_API_PHASE4–7][BACKEND_HEATMAP_AFTER_COMPLETE] sinr / rsrp / dl / ul / coverage =====
      const distributionMode = (this as any).distributionMode ?? this.distMode;
      if (
        distributionMode === 'sinr' ||
        distributionMode === 'rsrp' ||
        distributionMode === 'dl_rate' ||
        distributionMode === 'ul_rate' ||
        distributionMode === 'coverage'
      ) {
        const rendered =
          await this.renderBackendHeatmapFromCompleteCalcResult(distributionMode);
        console.log('[SIM_API_PHASE4][BACKEND_HEATMAP_AFTER_COMPLETE]', {
          distributionMode,
          rendered,
        });

        if (rendered === true) {
          // ===== [SIM_API_PHASE6][ENTER_RESULT_MODE] =====
          this.resultService.setResultMvp(RESULT_MVP_MOCK);
          this.rightPanelType = null;
          console.log('[SIM_API_PHASE6][ENTER_RESULT_MODE]', {
            viewMode: this.resultService.viewMode?.() ?? 'unknown'
          });
        }
      }

      console.log('[SIM_API_PHASE3][runSimulationApiFlow] SUCCESS');
    } catch (err) {
      console.error('[SIM_API_PHASE3][flow failed]', err);
      console.error('[SIM_API_PHASE3][flow failed][detail]', {
        err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      });
      console.error('[SIM_FLOW_ERROR]', {
        err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      });

      // Important:
      // Re-throw so onStartCompute() can show the compute failure overlay.
      throw err;
    } finally {
      // ===== [SIM_API_PHASE5][COMPUTE_LOADING_END] =====
      await new Promise((resolve) => setTimeout(resolve, 180));

      // Do not close the overlay if it is already showing an error.
      if (!this.computeLoadingError) {
        this.computeLoading = false;
      }
    }
  }

}
