/**
 * Field Domain Model
 *
 * Defines the data structure for all field domain objects (obstacles, base stations, RIS, UE, zones,
 * regional divisions, subfields / observation areas, etc.)
 * Serves as the single source of truth for:
 * - Scene object placement
 * - Panel data display
 * - Serializer API payload transformation
 */

import { AntennaApiDto } from './antenna/antenna.api.dto';

/* ================== ExistingBs Extended Config Types ================== */

export interface ExistingBsDisplayConfig {
  color: string[];
}

export interface ExistingBsPlacementConfig {
  installation: string;
  angle: { theta: number; phi: number; fixed: boolean };
}

export interface ExistingBsDuplexTddParam {
  dl: { frameRatio: number; frequency: number; bandwidth: string; scs: string; mcsTable: string; mimo: number };
  ul: { frameRatio: number; frequency: number; bandwidth: string; scs: string; mcsTable: string; mimo: number };
}

export interface ExistingBsDuplexFddParam {
  dl?: { frequency: number; bandwidth: string; scs: string; mcsTable: string; mimo: number };
  ul?: { frequency: number; bandwidth: string; scs: string; mcsTable: string; mimo: number };
}

export interface ExistingBsRadioConfig {
  txPower: number;
  powerUnit: string;
  noiseFigure: number;
  band: string;
  duplex: {
    isTdd: boolean;
    isFdd: boolean;
    tddParam?: ExistingBsDuplexTddParam;
    fddParam?: ExistingBsDuplexFddParam | Record<string, unknown>;
  };
}

export interface ExistingBsAntennaRuntime {
  selectedFrequency: number | null;
  selectedFrequencyId: number | null;
  selectedPortId: number | null;
  selectedPortName: string;
  selectedPortGain: number;
}

/* ================== Category Type ================== */

export type FieldCategory =
  | 'obstacle'
  | 'existingBs'
  | 'intelligentPanel'
  | 'candidateBs'
  | 'candidateRis'
  | 'ue'
  | 'zone'
  | 'observe';

/* ================== Base Row Interface ================== */

export interface FieldRowBase {
  id: string;        // e.g., obs_1, bs_2, ris_3
  seq: number;       // display sequence, increments on add, doesn't reorder on delete
  category: FieldCategory;
  
  meshId?: number;
  ownerMeshId?: number;
}

/* ================== Category-Specific Row Interfaces ================== */

export interface ObstacleFieldRow extends FieldRowBase {
  category: 'obstacle';
  x: number;
  y: number;
  startHeight: number;
  height: number;
  length: number;
  width: number;
  angle: number;
  material: string;
  /** Canonical pose alias for payload mapping (kept in sync by row x/y/startHeight). */
  position?: { x: number; y: number; z: number };
  /** Optional semantic shape identifier (e.g. box, sphere, cylinder, tree). */
  shape?: string;
  /** Optional display/payload color. */
  color?: string;

  // [Zone/Primitive/景觀參數 modal] optional fields for future editing
  sizeX?: number;
  sizeY?: number;
  sizeZ?: number;

  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;

  materialId?: number | null;
  materialName?: string;
}

export interface ExistingBsFieldRow extends FieldRowBase {
  category: 'existingBs';
  x: number;
  y: number;
  z: number;
  rxGain?: number;

  // Basic radio parameters for existing BS
  txPower?: number;
  txPowerUnit?: 'dBm' | 'mW';

  centerFrequency?: number;
  subcarrierSpacing?: number;
  bandwidth?: number;

  ulLayers?: number;
  dlLayers?: number;

  ulModulation?: string;
  dlModulation?: string;

  noiseFigure?: number;

  antennaMode?: 'default' | 'custom';

  antennaId?: number | null;
  antennaName?: string;
  antennaTypeLabel?: string;
  manufacturer?: string;

  /** [Patch 2] Antenna bound to this BS. Each row has its own clone. */
  antenna?: AntennaApiDto | null;
  /** Protocol (e.g. 5G) */
  protocol?: string;
  /** Display settings (color, etc.) */
  displayConfig?: ExistingBsDisplayConfig;
  /** Placement (installation type, angle) */
  placementConfig?: ExistingBsPlacementConfig;
  /** Radio parameters (txPower, duplex, etc.) */
  radioConfig?: ExistingBsRadioConfig;
  /** Runtime antenna selection (frequency, port) derived from antenna */
  antennaRuntime?: ExistingBsAntennaRuntime;
}

export interface IntelligentPanelFieldRow extends FieldRowBase {
  category: 'intelligentPanel';
  x: number;
  y: number;
  z: number;
  rxGain?: number;
  /** Canonical pose alias for payload mapping (kept in sync by row x/y/z). */
  position?: { x: number; y: number; z: number };
  /** Existing naming used by modal confirm flow. */
  risId?: number | null;
  risID?: number | null;
  profileId?: number | null;
  profileID?: number | null;
  installHorizontalAngle?: number;
  installVerticalAngle?: number;
  insHorizontal?: number;
  insVertical?: number;
}

export interface CandidateBsFieldRow extends FieldRowBase {
  category: 'candidateBs';
  x: number;
  y: number;
  z: number;
}

export interface CandidateRisFieldRow extends FieldRowBase {
  category: 'candidateRis';
  x: number;
  y: number;
  z: number;
}

export interface UeFieldRow extends FieldRowBase {
  category: 'ue';
  x: number;
  y: number;
  z: number;
  type?: string;
  rxGain?: number;
}

export interface ZoneFieldRow extends FieldRowBase {
  category: 'zone';
  x: number;
  y: number;
  length: number;
  width: number;
  angle: number;
  pathLossModelId?: number | null;
  pathLossModelName?: string;
  pathLossFormula?: string;
}

export interface ObserveFieldRow extends FieldRowBase {
  category: 'observe';
  x: number;
  y: number;
  z?: number;
}

/* ================== Regional Division & Subfield (planar regions) ==================
 * Standalone rows (not part of FieldRow union). Used for simulation path-loss regions
 * and observation/analysis areas respectively.
 */

export type FieldPlanarShapeType = 'rectangle' | 'polygon';

/** Vertices in field / map plane coordinates (x, y). */
export type FieldPlanarVertex = [number, number];

export interface RegionalDivisionFieldRow {
  id: string;
  regionID: number;
  name?: string;
  color: string;
  shapeType: FieldPlanarShapeType;
  vertices: FieldPlanarVertex[];
  rotateAngle: number;
  rotateCenter: FieldPlanarVertex;
  radius: number;
  pathLossModelId: number | null;
  attenuation?: number | null;
  visible: boolean;
  locked?: boolean;
  sceneObjectId?: string | null;
}

export interface SubfieldRow {
  id: string;
  subfieldID: number;
  /**
   * Optional display order in analysis UI (ascending). When set on rows being compared,
   * those rows sort by this first; otherwise by {@link subfieldID}, then store order.
   */
  sortOrder?: number;
  name?: string;
  color?: string;
  shapeType: FieldPlanarShapeType;
  vertices: FieldPlanarVertex[];
  rotateAngle: number;
  rotateCenter: FieldPlanarVertex;
  radius: number;
  visible: boolean;
  locked?: boolean;
  sceneObjectId?: string | null;
}

/* ================== Union Type ================== */

export type FieldRow =
  | ObstacleFieldRow
  | ExistingBsFieldRow
  | IntelligentPanelFieldRow
  | CandidateBsFieldRow
  | CandidateRisFieldRow
  | UeFieldRow
  | ZoneFieldRow
  | ObserveFieldRow;

/* ================== State Interfaces ================== */

export interface FieldDomainState {
  obstacles: ObstacleFieldRow[];
  existingBs: ExistingBsFieldRow[];
  intelligentPanels: IntelligentPanelFieldRow[];
  candidateBs: CandidateBsFieldRow[];
  candidateRis: CandidateRisFieldRow[];
  ueList: UeFieldRow[];
  zones: ZoneFieldRow[];
  observes: ObserveFieldRow[];
  regionalDivisions: RegionalDivisionFieldRow[];
  subfields: SubfieldRow[];
}

export interface FieldSeqState {
  obstacle: number;
  existingBs: number;
  intelligentPanel: number;
  candidateBs: number;
  candidateRis: number;
  ue: number;
  zone: number;
  observe: number;
  regionalDivision: number;
  subfield: number;
}

/** Lengths per category; returned by {@link FieldDomainStoreService.getCounts}. */
export interface FieldDomainCounts {
  obstacle: number;
  existingBs: number;
  intelligentPanel: number;
  candidateBs: number;
  candidateRis: number;
  ue: number;
  zone: number;
  observe: number;
  regionalDivision: number;
  subfield: number;
}

/**
 * Shape of {@link FieldDomainStoreService.snapshot} and {@link FieldDomainStoreService.exportState}.
 * Alias of {@link FieldDomainState} for call-site clarity.
 */
export type FieldDomainStoreSnapshot = FieldDomainState;

/* ================== Empty State Constants ================== */

export const EMPTY_FIELD_DOMAIN_STATE: FieldDomainState = {
  obstacles: [],
  existingBs: [],
  intelligentPanels: [],
  candidateBs: [],
  candidateRis: [],
  ueList: [],
  zones: [],
  observes: [],
  regionalDivisions: [],
  subfields: [],
};

export const EMPTY_FIELD_SEQ_STATE: FieldSeqState = {
  obstacle: 1,
  existingBs: 1,
  intelligentPanel: 1,
  candidateBs: 1,
  candidateRis: 1,
  ue: 1,
  zone: 1,
  observe: 1,
  regionalDivision: 1,
  subfield: 1,
};

/** Default fill for Regional Division rows (store assigns id + regionID). */
export const DEFAULT_REGIONAL_DIVISION_COLOR = 'rgba(72, 120, 220, 0.42)';

/** Default fill tint for Subfield / observation rows (store assigns id + subfieldID). */
export const DEFAULT_SUBFIELD_COLOR = 'rgba(255, 186, 120, 0.42)';

export type RegionalDivisionRowInput = Omit<RegionalDivisionFieldRow, 'id' | 'regionID'>;

export type SubfieldRowInput = Omit<SubfieldRow, 'id' | 'subfieldID'>;

/** Patch for store update (immutable id / regionID). */
export type RegionalDivisionFieldRowPatch = Partial<
  Omit<RegionalDivisionFieldRow, 'id' | 'regionID'>
>;

/** Patch for store update (immutable id / subfieldID). */
export type SubfieldRowPatch = Partial<Omit<SubfieldRow, 'id' | 'subfieldID'>>;

export function createDefaultRegionalDivisionRow(
  partial?: Partial<RegionalDivisionRowInput>,
): RegionalDivisionRowInput {
  return {
    color: DEFAULT_REGIONAL_DIVISION_COLOR,
    shapeType: 'rectangle',
    vertices: [],
    rotateAngle: 0,
    rotateCenter: [0, 0],
    radius: 0,
    pathLossModelId: null,
    attenuation: null,
    visible: true,
    sceneObjectId: null,
    ...partial,
  };
}

export function createDefaultSubfieldRow(partial?: Partial<SubfieldRowInput>): SubfieldRowInput {
  return {
    color: DEFAULT_SUBFIELD_COLOR,
    shapeType: 'rectangle',
    vertices: [],
    rotateAngle: 0,
    rotateCenter: [0, 0],
    radius: 0,
    visible: true,
    sceneObjectId: null,
    ...partial,
  };
}
