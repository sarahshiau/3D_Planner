/**
 * Serialize FieldDomainStore subfield (observation area) rows for API root `subfieldList`.
 * Minimal payload: subfieldID + shape only (no pathLoss / color).
 */

import type { SubfieldRow } from '../models/field-domain.model';
import type { TaskPayloadSubfieldItem } from '../models/task-payload.model';

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

export function serializeSubfieldForPayload(row: SubfieldRow): TaskPayloadSubfieldItem | null {
  if (typeof row.subfieldID !== 'number' || !Number.isFinite(row.subfieldID)) {
    console.warn('[SubfieldPayloadSerializer] skip row: invalid subfieldID', row?.id);
    return null;
  }

  if (!isValidVertices(row.vertices)) {
    console.warn('[SubfieldPayloadSerializer] skip row: invalid vertices', row?.id);
    return null;
  }

  const vertices = row.vertices.map(
    (p) => [Number(p[0]), Number(p[1])] as [number, number]
  );

  const rawCenter = row.rotateCenter;
  const rotateCenter: [number, number] = isFinitePair(rawCenter)
    ? [Number(rawCenter[0]), Number(rawCenter[1])]
    : centerFromVertices(vertices);

  return {
    subfieldID: row.subfieldID,
    shape: {
      ID: 0,
      vertices,
      radius: row.radius ?? 0,
      rotateAngle: row.rotateAngle ?? 0,
      rotateCenter,
    },
  };
}

export function serializeSubfieldPayloadRows(rows: SubfieldRow[]): TaskPayloadSubfieldItem[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((r) => serializeSubfieldForPayload(r))
    .filter((x): x is TaskPayloadSubfieldItem => x != null);
}
