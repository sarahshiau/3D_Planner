/**
 * Task Payload Model
 * 
 * Defines the type structure for task payload generation.
 * Used by TaskPayloadBuilderService to construct API payloads.
 */

import {
  ObstacleFieldRow,
  ExistingBsFieldRow,
  IntelligentPanelFieldRow,
  CandidateBsFieldRow,
  CandidateRisFieldRow,
  UeFieldRow,
  ZoneFieldRow,
  ObserveFieldRow,
  RegionalDivisionFieldRow,
  SubfieldRow,
} from './field-domain.model';

/* ================== Builder Input Types ================== */

/**
 * Task metadata input (from ProjectDraftService)
 */
export interface BuilderTaskMetaInput {
  task_name: string;
  task_id: string;
  project_name: string;
  created_by: string;
  taskId?: string;
  sessionId?: string;
  now?: Date | number;
}

/**
 * Map context input (from MapCoordinateService)
 */
export interface BuilderMapContextInput {
  center_latitude: number;
  center_longitude: number;
  width_m: number;
  height_m: number;
  widthMeters?: number;
  heightMeters?: number;
  altitudeMeters?: number;
  /** BBox from MapPicker (optional, for downstream / debug) */
  bbox?: { south: number; west: number; north: number; east: number } | null;
}

/**
 * Basic field input (from FieldDomainStoreService)
 */
export interface BuilderBasicFieldInput {
  obstacles: ObstacleFieldRow[];
  existingBs: ExistingBsFieldRow[];
  intelligentPanels: IntelligentPanelFieldRow[];
  candidateBs: CandidateBsFieldRow[];
  candidateRis: CandidateRisFieldRow[];
  ue: UeFieldRow[];
  zones: ZoneFieldRow[];
  observe: ObserveFieldRow[];
  /** Present when builder reads store regional divisions (Phase 3+). */
  regionalDivisions?: RegionalDivisionFieldRow[];
  /** Present when builder reads store subfields (Phase 3+). */
  subfields?: SubfieldRow[];
  projectName?: string;
  length?: number;
  width?: number;
  height?: number;
  networkType?: string;
  band?: string;
  heatmapGrid?: string;
  /** Parsed from heatmapGrid e.g. 1x1 → 1 (meters) */
  heatmapGridMeters?: number;
  cutHeights?: number[];
  rsrpThreshold?: number;
  sinrThreshold?: number;
  ueList?: Array<{ x: number; y: number; z: number; rxGain?: number }>;
  /**
   * RIS rows normalized at collect time from {@link FieldDomainState.intelligentPanels}.
   * Preferred by {@link BaseTaskPayloadBuilder} RIS section when non-empty.
   */
  risList?: Array<{
    risID: number;
    profileID: number;
    position: [number, number, number];
    insHorizontal: number;
    insVertical: number;
  }>;
  /** Optional OSM/building rows when available from scene or store metadata. */
  buildingRows?: Array<Record<string, any>>;
  /** Optional OSM/building meshes; serializer reads metadata and bbox. */
  buildingMeshes?: Array<any>;
}

/**
 * Planning input (from dedicated planning state/service)
 */
export interface BuilderPlanningInput {
  planning_type: 'power' | 'coverage' | 'capacity';
  objective_function: string;
  constraints: any[];
}

/**
 * Radio parameters input (from radio settings panel/service)
 */
export interface BuilderRadioInput {
  frequency_ghz: number;
  bandwidth_mhz: number;
  tx_power_dbm: number;
  pathloss_model: string;
}

/**
 * Mock defaults input
 */
export interface BuilderMockDefaultsInput {
  [key: string]: any;
}

export interface BuilderTaskMockDefaults {
  task_name?: string;
  task_id?: string;
  project_name?: string;
  created_by?: string;
}

export interface BuilderMapMockDefaults {
  center_latitude?: number;
  center_longitude?: number;
  width_m?: number;
  height_m?: number;
  altitudeMeters?: number;
  mapProtocol?: string;
  lteBand?: string;
  geographicalNorth?: number;
  resolution?: number;
  zValue?: number[];
  project_name?: string;
}

export interface BuilderPlanningMockDefaults {
  planning_type?: 'power' | 'coverage' | 'capacity';
  objective_function?: string;
  constraints?: any[];
  objectiveIndex?: number;
  coverageRatio?: number;
  sinrRatio?: number;
  throughputRatio?: number;
  maxConnectionNum?: number;
  ueCoverageRatio?: number;
  ueAvgSinrRatio?: number;
  ueAvgThroughputRatio?: number;
  ueTpByDistanceRatio?: number;
  ueTpByRsrpRatio?: number;
  evaluationFunc?: BuilderEvaluationFunc;
}

export interface BuilderRadioMockDefaults {
  frequency_ghz?: number;
  bandwidth_mhz?: number;
  tx_power_dbm?: number;
  pathloss_model?: string;
  duplex?: string;
  frequencyMHzList?: number[];
  bandwidthMHzList?: number[];
  scsKHzList?: number[];
  txPowerDbmList?: number[];
}

export interface BuilderBackendMockDefaults {
  solver?: string;
  max_iterations?: number;
  convergence_threshold?: number;
  pathLossModelId?: number;
  beamId?: string;
  beamMinId?: number;
  beamMaxId?: number;
  mimoNumber?: string;
  guardInterval?: string;
  wifiBand?: string;
  wifiMimo?: string;
  wifiProtocol?: string;
  mctsC?: number;
  mctsMimo?: number;
  mctsTemperature?: number;
  mctsTestTime?: number;
  mctsTime?: number;
  mctsTotalTime?: number;
}

export interface BuilderBsMockDefaults {
  antenna_type?: string;
  height_m?: number;
  tilt_deg?: number;
  azimuth_deg?: number;
  availableNewBsNumber?: number;
}

export interface BuilderRisMockDefaults {
  panel_size?: string;
  element_count?: number;
  phase_resolution?: number;
  availableNewRisNumber?: number;
}

export interface BuilderEvaluationNumberMetric {
  activate: boolean;
  ratio: number | number[];
}

export interface BuilderEvaluationArrayMetric {
  activate: boolean;
  ratio: number[];
}

export interface BuilderEvaluationFunc {
  subfield: any[];
  field: {
    coverage: BuilderEvaluationNumberMetric;
    rsrp: BuilderEvaluationArrayMetric;
    sinr: BuilderEvaluationArrayMetric;
    throughput: BuilderEvaluationArrayMetric;
    subfield: any[];
  };
  ue: {
    coverage: BuilderEvaluationNumberMetric;
    sinr: BuilderEvaluationArrayMetric;
    throughput: BuilderEvaluationArrayMetric;
    throughputByDistance: BuilderEvaluationArrayMetric;
    throughputByRsrp: BuilderEvaluationArrayMetric;
  };
}

/**
 * Complete builder input bundle
 */
export interface BaseTaskPayloadBuilderInput {
  taskMeta: BuilderTaskMetaInput;
  mapContext: BuilderMapContextInput;
  basicField: BuilderBasicFieldInput;
  planning: BuilderPlanningInput;
  radio: BuilderRadioInput;
  mockDefaults?: BuilderMockDefaultsInput;
}

/* ================== Payload Section Types ================== */

/**
 * Task metadata section in payload
 */
export interface BuilderTaskMetaSection {
  task_name: string;
  task_id: string;
  project_name: string;
  created_by: string;
  created_at?: string;
  version?: string;
  taskid?: string;
  sessionid?: string;
  createTime?: string;
  taskName?: string;
  isSimulation?: boolean;
}

/**
 * Map section in payload
 */
export interface BuilderMapSection {
  center_latitude: number;
  center_longitude: number;
  width_m: number;
  height_m: number;
  map_type?: string;
  osm_data?: any;
  width?: number;
  height?: number;
  altitude?: number;
  altitude_meters?: number;
  mapName?: string;
  mapProtocol?: string;
  map_protocol?: string;
  lteBand?: string;
  lte_band?: string;
  geographicalNorth?: number;
  geographical_north?: number;
  resolution?: number;
  zValue?: string;
  z_value?: number[];
}

/**
 * Base station section in payload
 */
export interface BuilderBsSection {
  existing_bs: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    antenna_type?: string;
    tx_power_dbm?: number;
    frequency_ghz?: number;
    [key: string]: any;
  }>;
  candidate_bs: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    [key: string]: any;
  }>;
  available_new_bs_number?: number;
}

/**
 * RIS section in payload
 */
export interface BuilderRisSection {
  intelligent_panels: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    panel_size?: string;
    element_count?: number;
    [key: string]: any;
  }>;
  candidate_ris: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    [key: string]: any;
  }>;
  available_new_ris_number?: number;
}

/**
 * UE section in payload
 */
export interface BuilderUeSection {
  ue_list: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    type?: string;
    rx_gain?: number;
    [key: string]: any;
  }>;
  zones?: Array<{
    id: string;
    x: number;
    y: number;
    length: number;
    width: number;
    angle: number;
    [key: string]: any;
  }>;
  observe_points?: Array<{
    id: string;
    x: number;
    y: number;
    z?: number;
    [key: string]: any;
  }>;
  ueCoordinate?: string;
  ueRxGain?: string;
  useUeCoordinate?: number;
}

/**
 * Obstacle section in payload
 */
export interface BuilderObstacleSection {
  obstacles: Array<{
    id: string;
    x: number;
    y: number;
    start_height: number;
    height: number;
    length: number;
    width: number;
    angle: number;
    material: string;
    [key: string]: any;
  }>;
  obstacleInfo?: string;
}

/**
 * Radio planning section in payload
 */
export interface BuilderRadioPlanningSection {
  planning_type: 'power' | 'coverage' | 'capacity';
  objective_function: string;
  constraints: any[];
  objective_index?: number;
  coverage_ratio?: number;
  sinr_ratio?: number;
  throughput_ratio?: number;
  max_connection_num?: number;
  ue_coverage_ratio?: number;
  ue_avg_sinr_ratio?: number;
  ue_avg_throughput_ratio?: number;
  ue_tp_by_distance_ratio?: number;
  ue_tp_by_rsrp_ratio?: number;
  evaluation_func?: BuilderEvaluationFunc;
  radio_params: {
    frequency_ghz: number;
    bandwidth_mhz: number;
    tx_power_dbm: number;
    pathloss_model: string;
    [key: string]: any;
  };
  backend_params?: {
    [key: string]: any;
  };
}

/* ================== Field Domain Snapshot ================== */

/**
 * Complete field domain snapshot (references field-domain.model.ts types)
 */
export interface FieldDomainSnapshot {
  obstacles: ObstacleFieldRow[];
  existingBs: ExistingBsFieldRow[];
  intelligentPanels: IntelligentPanelFieldRow[];
  candidateBs: CandidateBsFieldRow[];
  candidateRis: CandidateRisFieldRow[];
  ue: UeFieldRow[];
  zones: ZoneFieldRow[];
  observe: ObserveFieldRow[];
  regionalDivisions?: RegionalDivisionFieldRow[];
  subfields?: SubfieldRow[];
}

/** API item under `field.regionalDivision` (simulation / storeTask). */
export interface TaskPayloadRegionalDivisionPathLossModel {
  ID: number;
}

export interface TaskPayloadRegionalDivisionShape {
  ID: number;
  vertices: [number, number][];
  radius: number;
  rotateAngle: number;
  rotateCenter: [number, number];
}

export interface TaskPayloadRegionalDivisionItem {
  regionID: number;
  color: string;
  pathLossModel: TaskPayloadRegionalDivisionPathLossModel;
  shape: TaskPayloadRegionalDivisionShape;
}

/** Shape block under `subfieldList[].shape` (same numeric layout as regional division shape). */
export type TaskPayloadSubfieldShape = TaskPayloadRegionalDivisionShape;

/** API item in root `subfieldList` (observation / analysis area). */
export interface TaskPayloadSubfieldItem {
  subfieldID: number;
  shape: TaskPayloadSubfieldShape;
}

/* ================== Base Task Payload ================== */

/**
 * Complete task payload structure for API submission
 */
export interface BaseTaskPayload {
  taskid: string;
  sessionid: string;
  taskName: string;
  createTime: string;
  width: number;
  height: number;
  altitude: number;
  mapName: string;
  mapImage: string;
  mapProtocol: string;
  lteBand: string;
  geographicalNorth: number;
  resolution: number;
  zValue: string;
  defaultBs: string;
  candidateBs: string;
  defaultBsAnt: string;
  candidateBsAnt: string;
  bsList: {
    defaultBs: any[];
    candidateBs: any[];
  };
  bsSetting: Record<string, any>;
  ueCoordinate: string;
  ueRxGain: string;
  useUeCoordinate: number;
  obstacleInfo: string;
  duplex: string;
  frequency: string;
  frequencyList: string;
  bandwidth: string;
  bandwidthList: string;
  scs: string;
  txPower: string;
  ulMcsTable: string;
  dlMcsTable: string;
  ulMimoLayer: string;
  dlMimoLayer: string;
  bsNoiseFigure: string;
  tddFrameRatio: number;
  objectiveIndex: number;
  coverageRatio: number;
  sinrRatio: number;
  throughputRatio: number;
  maxConnectionNum: number;
  evaluationFunc: BuilderEvaluationFunc;
  field: Record<string, any>;
  pathLossModelId: number;
  subfieldList: TaskPayloadSubfieldItem[];
  optInfo: Record<string, any>;
  beamId: string;
  beamMinId: number;
  beamMaxId: number;
  mimoNumber: string;
  guardInterval: string;
  wifiBand: string;
  wifiMimo: string;
  wifiProtocol: string;
  powerMinRange: number;
  powerMaxRange: number;
  rsrpThreshold: number;
  sinrThreshold: number;
  rssiThreshold: number;
  snrThreshold: number;
  availableNewBsNumber: number;
  availableNewRisNumber: number;
  addFixedBsNumber: number;
  defaultRis: null;
  candidateRis: null;
  candidateRisList: any[];
  ris: any[];
  risList: {
    defaultRis: any[];
    candidateRis: any[];
  };
  ulFrequency: string;
  dlFrequency: string;
  ulBandwidth: string;
  dlBandwidth: string;
  ulScs: string;
  dlScs: string;
  isSimulation: boolean;
  isCoverage: boolean;
  isAverageSinr: boolean;
  isAvgThroughput: boolean;
  isUeCoverage: boolean;
  isUeAvgSinr: boolean;
  isUeAvgThroughput: boolean;
  isUeTpByDistance: boolean;
  isUeTpByRsrp: boolean;
  isBsNumberOptimization: boolean;
  isRisNumberOptimization: boolean;
  ueCoverageRatio: number;
  ueAvgSinrRatio: number;
  ueAvgThroughputRatio: number;
  ueTpByDistanceRatio: number;
  ueTpByRsrpRatio: number;
  mctsC: number;
  mctsMimo: number;
  mctsTemperature: number;
  mctsTestTime: number;
  mctsTime: number;
  mctsTotalTime: number;
  scalingFactor: number;

  // Compatibility view for existing EditScene access (non-enumerable runtime attachment)
  task_meta?: {
    taskid: string;
    sessionid: string;
    taskName: string;
    createTime: string;
    isSimulation: boolean;
    task_id?: string;
  };
  map?: {
    width: number;
    height: number;
    altitude: number;
  };
}
