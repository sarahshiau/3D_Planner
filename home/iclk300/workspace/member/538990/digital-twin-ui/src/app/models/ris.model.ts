export type RisProperty = 'default' | 'customized';

/**
 * Backend DTO: GET /getRis
 * Note: backend uses risID/risName and array tuples for frequency/elementNumber/elementSize.
 */
export interface RisApi {
  risID: number;
  risName: string;
  type: string; // e.g. "Passive" | "Active" | "passive" (backend not fully normalized)
  frequency: [number, number];
  material: string;
  manufacturer: string;
  elementNumber: [number, number]; // [column, row]
  elementSize: [number, number]; // [width, height] (unit per backend definition)
  property: RisProperty;
  risEnergy: number;
  risCost: number;
}

/**
 * UI row for table rendering.
 * Keep it UI-friendly but still derived from RisApi without losing information.
 */
export interface RisRow {
  id: number; // mapped from risID
  name: string; // mapped from risName
  type: string;
  frequencyMin: number;
  frequencyMax: number;
  material: string;
  manufacturer: string;
  elementCols: number;
  elementRows: number;
  elementWidth: number;
  elementHeight: number;
  property: RisProperty;
  risEnergy: number;
  risCost: number;
}

/**
 * UI ListRow for RIS manage modal table rendering.
 * Provides formatted fields for direct template binding (no component calculations).
 */
export interface RisListRow {
  id: number;
  name: string;
  type: string;
  freqMHz: string; // formatted: "min ~ max"
  vendor: string; // from manufacturer
  material: string;
  elementCount: number; // rows * cols
  elementSizeMm: string; // formatted: "width x height"
  avgPower: number; // from risEnergy
  price: number; // from risCost
  property: RisProperty; // for filtering backend
}

export type AddRisPayload = Omit<RisApi, 'risID'>;
export type UpdateRisPayload = RisApi;

/**
 * Backend DTO: GET /getRisMaterial
 */
export interface RisMaterialApi {
  risMaterialID: number;
  risMaterialNameEng: string;
  risMaterialNameCHI: string;
}

/**
 * Backend DTO: GET /getRisProfiles/:risId
 */
export interface RisProfileApi {
  profileID: number;
  profileName: string;
  incHorizontal: [number, number];
  incVertical: [number, number];
  refHorizontal: number;
  refVertical: number;
  refCoefficient: number;
}

/**
 * UI row for profile list table.
 */
export interface RisProfileRow {
  profileID: number;
  profileName: string;
  incHorizontalMin: number;
  incHorizontalMax: number;
  incVerticalMin: number;
  incVerticalMax: number;
  refHorizontal: number;
  refVertical: number;
  refCoefficient: number;
}

/**
 * UI ListRow for profile table display (formatted for template binding).
 */
export interface RisProfileListRow {
  profileID: number;
  name: string; // from profileName
  incAzRange: string; // formatted: "min ~ max"
  incElRange: string; // formatted: "min ~ max"
  refAz: number; // from refHorizontal
  refEl: number; // from refVertical
  reflGainDb: number; // from refCoefficient
}

/**
 * Payload for addRisProfile/updateRisProfile.
 * In mock stage, file/sha256sum can be optional; API stage will convert to FormData.
 * rawData is optional: if provided, service will store it directly; otherwise use default.
 */
export interface AddRisProfilePayload {
  profileName: string;
  incHorizontal: [number, number];
  incVertical: [number, number];
  refHorizontal: number;
  refVertical: number;
  refCoefficient: number;
  file?: File;
  sha256sum?: string;
  rawData?: RisRawDataApi | null;
}

export interface UpdateRisProfilePayload extends AddRisProfilePayload {
  profileID: number;
}

/**
 * Backend DTO: GET /getRisRawData/:risId/:profileId
 * patternRaw is a row-indexed map; each value is an array for columns.
 */
export type RisPatternRaw = Record<string, number[]>;

/**
 * radiationRaw row format: [angleIndex, value1, value2]
 * Backend currently returns arrays-of-arrays.
 */
export type RisRadiationRawRow = [number, number, number];

export interface RisRawDataMeta {
  phiIncDeg: [number, number];
  thetaIncDeg: [number, number];
  phiRefDeg: number;
  thetaRefDeg: number;
  refCoefficientDb: number;
  profileName: string;
}

export interface RisRawDataApi {
  rowElement: number;
  columnElement: number;
  patternRaw: RisPatternRaw;
  radiationRaw: RisRadiationRawRow[];
  meta?: RisRawDataMeta;
}
