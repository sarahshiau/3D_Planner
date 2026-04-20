/**
 * Serialize FieldDomainStore regional division rows for API task / simulation payloads.
 * Output shape matches TASK_PAYLOAD_MOCK_DEFAULTS.field.regionalDivision items.
 */

import type { RegionalDivisionFieldRow } from '../models/field-domain.model';
import { DEFAULT_REGIONAL_DIVISION_COLOR } from '../models/field-domain.model';
import type { TaskPayloadRegionalDivisionItem } from '../models/task-payload.model';

export interface SerializeRegionalDivisionContext {
  /** When row.pathLossModelId is null/undefined, use this numeric ID (field-level model). */
  fallbackPathLossModelId: number;
}

function isFinitePair(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

function isValidVertices(v: unknown): v is [number, number][] {
  if (!Array.isArray(v) || v.length < 3) {
    return false;
  }
  return v.every(isFinitePair);
}

function centerFromVertices(vertices: [number, number][]): [number, number] {
  const xs = vertices.map((p) => p[0]);
  const ys = vertices.map((p) => p[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

/**
 * Serialize a single store row; returns null if required data is missing (caller may filter).
 */
export function serializeRegionalDivisionForPayload(
  row: RegionalDivisionFieldRow,
  ctx: SerializeRegionalDivisionContext
): TaskPayloadRegionalDivisionItem | null {
  if (typeof row.regionID !== 'number' || !Number.isFinite(row.regionID)) {
    console.warn('[RegionalDivisionPayloadSerializer] skip row: invalid regionID', row?.id);
    return null;
  }

  if (!isValidVertices(row.vertices)) {
    console.warn('[RegionalDivisionPayloadSerializer] skip row: invalid vertices', row?.id);
    return null;
  }

  const vertices = row.vertices.map(
    (p) => [Number(p[0]), Number(p[1])] as [number, number]
  );

  let modelId: number;
  if (row.pathLossModelId != null && Number.isFinite(Number(row.pathLossModelId))) {
    modelId = Number(row.pathLossModelId);
  } else {
    modelId = ctx.fallbackPathLossModelId;
  }
  if (!Number.isFinite(modelId)) {
    console.warn('[RegionalDivisionPayloadSerializer] skip row: invalid path loss model ID', row?.id);
    return null;
  }

  const rawCenter = row.rotateCenter;
  const rotateCenter: [number, number] = isFinitePair(rawCenter)
    ? [Number(rawCenter[0]), Number(rawCenter[1])]
    : centerFromVertices(vertices);

  const color =
    row.color != null && String(row.color).trim().length > 0
      ? String(row.color)
      : DEFAULT_REGIONAL_DIVISION_COLOR;

  return {
    regionID: row.regionID,
    color,
    pathLossModel: { ID: modelId },
    shape: {
      ID: 0,
      vertices,
      radius: row.radius ?? 0,
      rotateAngle: row.rotateAngle ?? 0,
      rotateCenter,
    },
  };
}

export function serializeRegionalDivisionPayloadRows(
  rows: RegionalDivisionFieldRow[],
  ctx: SerializeRegionalDivisionContext
): TaskPayloadRegionalDivisionItem[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((r) => serializeRegionalDivisionForPayload(r, ctx))
    .filter((x): x is TaskPayloadRegionalDivisionItem => x != null);
}
