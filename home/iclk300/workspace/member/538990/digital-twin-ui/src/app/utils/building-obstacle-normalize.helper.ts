/**
 * Single-building obstacle tuple aligned with legacy obstacleInfo:
 * [x, y, baseHeight, width, length, obstacleHeight, angle, material, shape, color]
 *
 * Phase 6 — unified skip / fallback contract (one bad building never throws; others unaffected):
 * - Skip (warn + return null, never throw):
 *   1) x or y cannot be resolved to a finite number.
 *   2) Any of width, length, obstacleHeight cannot be resolved (metadata ∪ bounding box must
 *      yield finite values for all three; if any dimension stays unresolved → skip).
 * - Fallback (log `[Obstacle][Building][Fallback]`): optional fields use metadata, bounding box,
 *   or default value — see per-field `resolution` map.
 */
export type BuildingObstacleTuple = [
  number, // x
  number, // y
  number, // baseHeight
  number, // width
  number, // length
  number, // obstacleHeight
  number, // angle
  string, // material
  string, // shape
  string, // color
];

export interface BuildingObstacleRowLike {
  id?: string;
  position?: { x?: number; y?: number; z?: number };
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  length?: number;
  height?: number;
  angle?: number;
  rotation?: number;
  material?: string;
  shape?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

/** Loose mesh shape for map buildings (avoid extending Babylon AbstractMesh — getBoundingInfo() typing conflicts). */
export interface BuildingObstacleMeshLike {
  name?: string;
  metadata?: Record<string, unknown>;
  /** Local/world translation (Babylon); obstacle plane uses x and z for horizontal tuple. */
  position?: { x?: number; y?: number; z?: number };
  getBoundingInfo?: () => unknown;
  getAbsolutePosition?: () => { x?: number; y?: number; z?: number };
}

/** Emitted when a building row/mesh cannot be turned into an obstacle tuple (for SimFinal diagnostics). */
export interface BuildingObstacleSkipRecord {
  source: 'row' | 'mesh';
  key: string;
  skipRule: 'missing-x-or-y' | 'width-length-or-obstacleHeight-unresolved' | 'unexpected-error';
  missingFields: string[];
  detail?: unknown;
}

export interface NormalizeBuildingObstacleInput {
  source: 'row' | 'mesh';
  key: string;
  row?: BuildingObstacleRowLike;
  mesh?: BuildingObstacleMeshLike;
  /** Optional sink so callers can aggregate skip reasons (e.g. SimFinal when all buildings drop). */
  onSkip?: (record: BuildingObstacleSkipRecord) => void;
}

const BUILDING_DEFAULTS = {
  material: '水泥',
  angle: 0,
  baseHeight: 0,
  shape: 'building',
  /** Default building color (same as obstacle primitive / serializer convention). */
  color: '#73805c',
} as const;

/**
 * Normalize one building into a single obstacle tuple, or null if required data is missing.
 * Skip: console.warn only (never throw). Unexpected errors are caught and treated as skip.
 */
export function normalizeBuildingObstacle(
  input: NormalizeBuildingObstacleInput
): BuildingObstacleTuple | null {
  try {
    return normalizeBuildingObstacleCore(input);
  } catch (err) {
    const record: BuildingObstacleSkipRecord = {
      source: input.source,
      key: input.key,
      skipRule: 'unexpected-error',
      missingFields: [],
      detail: { message: err instanceof Error ? err.message : String(err) },
    };
    console.warn('[Obstacle][Building][Skip]', record);
    input.onSkip?.(record);
    return null;
  }
}

function normalizeBuildingObstacleCore(
  input: NormalizeBuildingObstacleInput
): BuildingObstacleTuple | null {
  const row = input.row;
  const mesh = input.mesh;
  const meta = (row?.metadata ?? mesh?.metadata ?? {}) as Record<string, unknown>;
  const bb = readBoundingBox(mesh);

  /**
   * Plane tuple: x = finalLocalForMesh.x, y = finalLocalForMesh.z (or mesh.position.x / mesh.position.z).
   * Never use rawLocalFromCoord, Babylon position.y for plane y, or bbox/abs as stand-ins for OSM mesh.
   */
  const plane = pickBuildingObstaclePlaneXY({
    row,
    meta,
    mesh,
  });

  const x = plane.x;
  const y = plane.y;

  console.log('[Obstacle][Building][PositionSource]', {
    osmId: String(meta['osmId'] ?? meta['osm_id'] ?? input.key ?? ''),
    x,
    y,
    source: plane.source,
  });

  const rawBaseHeight = asNum(
    row?.position?.z ??
      row?.z ??
      numFromMeta(meta, 'position', 'z') ??
      meta['z'] ??
      meta['baseHeight'] ??
      bb?.minY
  );
  const baseHeight = Number.isFinite(rawBaseHeight as number)
    ? (rawBaseHeight as number)
    : BUILDING_DEFAULTS.baseHeight;

  const widthFromMetadataRaw = asNum(row?.width ?? meta['width']);
  const lengthFromMetadataRaw = asNum(row?.length ?? meta['length']);
  const widthFromMetadata =
    widthFromMetadataRaw != null && Number.isFinite(widthFromMetadataRaw) && widthFromMetadataRaw > 0
      ? widthFromMetadataRaw
      : null;
  const lengthFromMetadata =
    lengthFromMetadataRaw != null && Number.isFinite(lengthFromMetadataRaw) && lengthFromMetadataRaw > 0
      ? lengthFromMetadataRaw
      : null;
  const heightFromMetadata = asNum(
    row?.height ?? meta['height'] ?? meta['baseHeightM']
  );
  const angleFromMetadataRaw = asNum(meta['angle'] ?? meta['rotation']);
  const angleFromMetadata =
    angleFromMetadataRaw != null && Number.isFinite(angleFromMetadataRaw)
      ? angleFromMetadataRaw
      : null;
  const angleFromRowRaw = asNum(row?.angle ?? row?.rotation);
  const angleFromRow =
    angleFromRowRaw != null && Number.isFinite(angleFromRowRaw)
      ? angleFromRowRaw
      : null;
  const resolvedAngle = normalizeAngle180(
    angleFromMetadata ??
      angleFromRow ??
      BUILDING_DEFAULTS.angle
  );

  const widthFromBbox = asNum(bb?.sizeX);
  const lengthFromBbox = asNum(bb?.sizeZ);
  const heightFromBbox = asNum(bb?.sizeY);

  const resolvedWidth = widthFromMetadata ?? widthFromBbox;
  const resolvedLength = lengthFromMetadata ?? lengthFromBbox;
  const resolvedHeight = heightFromMetadata ?? heightFromBbox;
  const normalizedSource =
    widthFromMetadata != null && lengthFromMetadata != null
      ? 'metadata'
      : 'bboxWorld';

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const missingFields: string[] = [];
    if (!Number.isFinite(x)) missingFields.push('x');
    if (!Number.isFinite(y)) missingFields.push('y');
    const record: BuildingObstacleSkipRecord = {
      source: input.source,
      key: input.key,
      skipRule: 'missing-x-or-y',
      missingFields,
      detail: {
        hasX: Number.isFinite(x),
        hasY: Number.isFinite(y),
      },
    };
    console.warn('[Obstacle][Building][Skip]', record);
    input.onSkip?.(record);
    return null;
  }

  if (
    !Number.isFinite(resolvedWidth) ||
    !Number.isFinite(resolvedLength) ||
    !Number.isFinite(resolvedHeight)
  ) {
    const missingFields = [
      !Number.isFinite(resolvedWidth) ? 'width' : null,
      !Number.isFinite(resolvedLength) ? 'length' : null,
      !Number.isFinite(resolvedHeight) ? 'obstacleHeight' : null,
    ].filter((f): f is string => f != null);
    const record: BuildingObstacleSkipRecord = {
      source: input.source,
      key: input.key,
      skipRule: 'width-length-or-obstacleHeight-unresolved',
      missingFields,
      detail: {
        width: { metadata: widthFromMetadata, bounding_box: widthFromBbox, resolved: resolvedWidth },
        length: { metadata: lengthFromMetadata, bounding_box: lengthFromBbox, resolved: resolvedLength },
        obstacleHeight: {
          metadata: heightFromMetadata,
          bounding_box: heightFromBbox,
          resolved: resolvedHeight,
        },
      },
    };
    console.warn('[Obstacle][Building][Skip]', record);
    input.onSkip?.(record);
    return null;
  }

  /** Which source supplied the value used in the tuple: metadata | bounding_box | default_value */
  const resolution: Record<string, 'metadata' | 'bounding_box' | 'default_value'> = {};
  resolution.width = Number.isFinite(widthFromMetadata!)
    ? 'metadata'
    : 'bounding_box';
  resolution.length = Number.isFinite(lengthFromMetadata!)
    ? 'metadata'
    : 'bounding_box';
  resolution.obstacleHeight = Number.isFinite(heightFromMetadata!)
    ? 'metadata'
    : 'bounding_box';
  resolution.baseHeight = Number.isFinite(rawBaseHeight as number)
    ? 'metadata'
    : 'default_value';
  resolution.material =
    row?.material != null || meta['material'] != null ? 'metadata' : 'default_value';
  if (angleFromMetadata != null || angleFromRow != null) {
    resolution.angle = 'metadata';
  } else {
    resolution.angle = 'default_value';
  }
  resolution.shape =
    row?.shape != null || meta['shape'] != null ? 'metadata' : 'default_value';
  resolution.color =
    row?.color != null || meta['color'] != null ? 'metadata' : 'default_value';

  const resolutionSummary = Object.entries(resolution)
    .map(([field, src]) => `${field}=${src}`)
    .join(', ');

  console.log('[Obstacle][Building][Fallback]', {
    source: input.source,
    key: input.key,
    resolution,
    resolutionSummary,
  });

  const tuple: BuildingObstacleTuple = [
    x as number,
    y as number,
    baseHeight,
    resolvedWidth as number,
    resolvedLength as number,
    resolvedHeight as number,
    resolvedAngle,
    asStr(row?.material ?? meta['material'], BUILDING_DEFAULTS.material),
    asStr(row?.shape ?? meta['shape'], BUILDING_DEFAULTS.shape),
    asStr(row?.color ?? meta['color'], BUILDING_DEFAULTS.color),
  ];

  console.log('[Obstacle][Building][Normalized]', {
    source: input.source,
    key: input.key,
    tuple,
  });

  console.log('[BuildingRect][Normalized]', {
    rowId: row?.id ?? String(meta['osmId'] ?? meta['osm_id'] ?? input.key ?? ''),
    x: x as number,
    y: y as number,
    width: resolvedWidth as number,
    length: resolvedLength as number,
    angle: resolvedAngle,
    height: resolvedHeight as number,
    source: normalizedSource,
  });

  return tuple;
}

function numFromMeta(
  meta: Record<string, unknown>,
  objKey: string,
  axis: 'x' | 'y' | 'z'
): number | null {
  const pos = meta[objKey];
  if (pos && typeof pos === 'object' && axis in (pos as object)) {
    return asNum((pos as Record<string, unknown>)[axis]);
  }
  return null;
}

type PlanePickSource =
  | 'metadata.finalLocalForMesh'
  | 'mesh.position'
  | 'row.position'
  | 'row.flat'
  | 'metadata.position'
  | 'metadata.scalar'
  | 'unresolved';

function readFinalLocalForMesh(meta: Record<string, unknown>): { x: number; z: number } | null {
  const flm = meta['finalLocalForMesh'];
  if (!flm || typeof flm !== 'object') return null;
  const o = flm as Record<string, unknown>;
  const x = asNum(o['x']);
  const z = asNum(o['z']);
  if (x == null || z == null || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

/** Tuple y uses mesh.position.z (horizontal), never position.y. */
function readMeshPositionXZ(mesh: BuildingObstacleMeshLike | undefined): { x: number; z: number } | null {
  const pos = mesh?.position;
  if (!pos || typeof pos !== 'object') return null;
  const x = asNum((pos as Record<string, unknown>)['x']);
  const z = asNum((pos as Record<string, unknown>)['z']);
  if (x == null || z == null || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function pickBuildingObstaclePlaneXY(args: {
  row: BuildingObstacleRowLike | undefined;
  meta: Record<string, unknown>;
  mesh: BuildingObstacleMeshLike | undefined;
}): { x: number; y: number; source: string } {
  const { row, meta, mesh } = args;

  const flm = readFinalLocalForMesh(meta);
  if (flm) {
    return {
      x: flm.x,
      y: flm.z,
      source: 'metadata.finalLocalForMesh',
    };
  }

  const mp = readMeshPositionXZ(mesh);
  if (mp) {
    return {
      x: mp.x,
      y: mp.z,
      source: 'mesh.position',
    };
  }

  const explicitX = pickExplicitHorizontal(row, meta, 'x');
  const explicitY = pickExplicitHorizontal(row, meta, 'y');
  if (explicitX != null && explicitY != null) {
    const same = explicitX.source === explicitY.source;
    return {
      x: explicitX.value,
      y: explicitY.value,
      source: same ? explicitX.source : `${explicitX.source}/${explicitY.source}`,
    };
  }

  return { x: NaN, y: NaN, source: 'unresolved' };
}

function pickExplicitHorizontal(
  row: BuildingObstacleRowLike | undefined,
  meta: Record<string, unknown>,
  axis: 'x' | 'y'
): { value: number; source: PlanePickSource } | null {
  const posKey = axis === 'x' ? ('x' as const) : ('y' as const);
  const flatKey = axis === 'x' ? ('x' as const) : ('y' as const);
  const metaPos = numFromMeta(meta, 'position', posKey);
  const metaScalar = axis === 'x' ? meta['x'] : meta['y'];

  const p = row?.position?.[posKey];
  if (p != null && Number.isFinite(Number(p))) {
    return { value: Number(p), source: 'row.position' };
  }
  const flat = row?.[flatKey];
  if (flat != null && Number.isFinite(Number(flat))) {
    return { value: Number(flat), source: 'row.flat' };
  }
  if (metaPos != null && Number.isFinite(metaPos)) {
    return { value: metaPos, source: 'metadata.position' };
  }
  const ms = asNum(metaScalar);
  if (ms != null && Number.isFinite(ms)) {
    return { value: ms, source: 'metadata.scalar' };
  }
  return null;
}

function readBoundingBox(mesh: BuildingObstacleMeshLike | undefined): {
  minY: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  centerX: number;
  centerZ: number;
  /** Babylon world-space center (preferred over min/max average). */
  centerWorldX: number | null;
  centerWorldZ: number | null;
} | null {
  if (!mesh?.getBoundingInfo) return null;
  const bi = mesh.getBoundingInfo() as {
    boundingBox?: {
      minimumWorld?: { x?: number; y?: number; z?: number };
      maximumWorld?: { x?: number; y?: number; z?: number };
      centerWorld?: { x?: number; y?: number; z?: number };
    };
  } | null;
  const bb = bi?.boundingBox;
  if (!bb) return null;
  const minW = bb.minimumWorld;
  const maxW = bb.maximumWorld;
  const cw = bb.centerWorld;
  const centerWorldX = cw != null ? asNum(cw.x) : null;
  const centerWorldZ = cw != null ? asNum(cw.z) : null;
  return {
    minY: asNum(minW?.y, 0)!,
    sizeX: asNum((maxW?.x ?? 0) - (minW?.x ?? 0), 0)!,
    sizeY: asNum((maxW?.y ?? 0) - (minW?.y ?? 0), 0)!,
    sizeZ: asNum((maxW?.z ?? 0) - (minW?.z ?? 0), 0)!,
    centerX: asNum(((maxW?.x ?? 0) + (minW?.x ?? 0)) / 2, 0)!,
    centerZ: asNum(((maxW?.z ?? 0) + (minW?.z ?? 0)) / 2, 0)!,
    centerWorldX,
    centerWorldZ,
  };
}

function asNum(value: unknown, fallback: number | null = null): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAngle180(angleDeg: number): number {
  return ((angleDeg % 180) + 180) % 180;
}

function asStr(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (value == null) return fallback;
  return String(value);
}
