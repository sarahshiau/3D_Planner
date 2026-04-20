import type { ObstacleFieldRow } from '../models/field-domain.model';
import {
  normalizeBuildingObstacle,
  type BuildingObstacleMeshLike,
  type BuildingObstacleRowLike,
  type BuildingObstacleSkipRecord,
} from '../utils/building-obstacle-normalize.helper';

export type ObstacleTuple = [
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

export type { BuildingObstacleRowLike, BuildingObstacleMeshLike, BuildingObstacleSkipRecord };

export interface ObstacleSerializerInput {
  basicRows?: ObstacleFieldRow[];
  landscapeRows?: ObstacleFieldRow[];
  buildingRows?: BuildingObstacleRowLike[];
  buildingMeshes?: BuildingObstacleMeshLike[];
}

export type ObstacleMultiSerializeMode = 'legacy_pipe' | 'json_array';

export class ObstacleSerializerBuilder {
  /** Skip records from the latest `serialize()` / `serializeObstacleInfo()` run (building rows + meshes). */
  private lastBuildingSkips: BuildingObstacleSkipRecord[] = [];

  getLastBuildingSkips(): readonly BuildingObstacleSkipRecord[] {
    return this.lastBuildingSkips;
  }

  /**
   * Legacy obstacleInfo format (verified from legacy payload samples):
   * `JSON.stringify(tuple1) + '|' + JSON.stringify(tuple2) + ...`
   * Building tuples use the same 10-field `ObstacleTuple` + same `stringifyTuple` as basic/landscape
   * (merge order: basic → landscape → buildingRows → buildingMeshes). Delimiter and schema unchanged.
   *
   * TODO: if backend confirms JSON array contract, switch to mode='json_array'.
   */
  serializeObstacleInfo(
    input: ObstacleSerializerInput,
    mode: ObstacleMultiSerializeMode = 'legacy_pipe'
  ): string {
    const tuples = this.serialize(input);
    const previewWireFirst3 = tuples
      .slice(0, 3)
      .map((tuple) => this.stringifyTuple(tuple));
    console.log('[Obstacle][Final][TupleCount]', tuples.length);
    console.log('[Obstacle][Final][Preview]', previewWireFirst3);

    if (mode === 'json_array') {
      return JSON.stringify(tuples);
    }
    return tuples.map((tuple) => this.stringifyTuple(tuple)).join('|');
  }

  /**
   * Keep single item and multi items consistent by reusing one tuple serializer.
   */
  stringifyTuple(tuple: ObstacleTuple): string {
    return JSON.stringify(tuple);
  }

  /**
   * Merge layer: basic + landscape + map buildings (rows + meshes).
   * Building tuples come from `normalizeBuildingObstacle` (same 10-field tuple as legacy obstacleInfo).
   * A skipped building (null) is dropped per item only; basic/landscape tuples are independent.
   */
  serialize(input: ObstacleSerializerInput): ObstacleTuple[] {
    this.lastBuildingSkips = [];
    const fromBasic = (input.basicRows ?? []).map((row) =>
      this.normalizeObstacleRow(row, 'basic')
    );
    const fromLandscape = (input.landscapeRows ?? []).map((row) =>
      this.normalizeObstacleRow(row, 'landscape')
    );
    const fromBuildingRows = (input.buildingRows ?? []).map((row) =>
      this.normalizeBuildingRow(row)
    );
    const fromBuildingMeshes = (input.buildingMeshes ?? []).map((mesh) =>
      this.normalizeBuildingMesh(mesh)
    );

    const buildingRowTuples = fromBuildingRows.filter((item): item is ObstacleTuple =>
      Array.isArray(item)
    );
    const buildingMeshTuples = fromBuildingMeshes.filter((item): item is ObstacleTuple =>
      Array.isArray(item)
    );
    const basicTuples = fromBasic.filter((item): item is ObstacleTuple => Array.isArray(item));
    const landscapeTuples = fromLandscape.filter((item): item is ObstacleTuple =>
      Array.isArray(item)
    );

    console.log('[Phase9][ObstacleSerializer][building-tuple-verify]', {
      buildingRowsInput: (input.buildingRows ?? []).length,
      buildingRowsSerialized: buildingRowTuples.length,
      buildingMeshesInput: (input.buildingMeshes ?? []).length,
      buildingMeshesSerialized: buildingMeshTuples.length,
      buildingRowIdsTop3: (input.buildingRows ?? []).slice(0, 3).map((r) => r?.id ?? '(no-id)'),
      buildingMeshNamesTop3: (input.buildingMeshes ?? [])
        .slice(0, 3)
        .map((m) => m?.name ?? '(unnamed-building)'),
    });

    const mergedTuples: ObstacleTuple[] = [
      ...basicTuples,
      ...landscapeTuples,
      ...buildingRowTuples,
      ...buildingMeshTuples,
    ];

    const totalObstacleTupleCount = mergedTuples.length;

    console.log('[ObstacleSerializer][merge-layer][serialize]', {
      layer: 'ObstacleSerializerBuilder.serialize',
      basicTupleCount: basicTuples.length,
      landscapeTupleCount: landscapeTuples.length,
      buildingRowTupleCount: buildingRowTuples.length,
      buildingMeshTupleCount: buildingMeshTuples.length,
      mergedTupleCount: totalObstacleTupleCount,
    });

    console.log('[Phase3][ObstacleSerializer][merged-total]', {
      mergeLayer: 'ObstacleSerializerBuilder.serialize',
      order: 'basic → landscape → buildingRows → buildingMeshes',
      basicTupleCount: basicTuples.length,
      landscapeTupleCount: landscapeTuples.length,
      buildingRowTupleCount: buildingRowTuples.length,
      buildingMeshTupleCount: buildingMeshTuples.length,
      totalObstacleTupleCount,
    });

    return mergedTuples;
  }

  private normalizeObstacleRow(
    row: Partial<ObstacleFieldRow>,
    source: 'basic' | 'landscape'
  ): ObstacleTuple | null {
    const x = this.asNum(row.position?.x ?? row.x);
    const y = this.asNum(row.position?.y ?? row.y);
    // Keep baseHeight priority explicit: startHeight first, then position.z.
    const z = this.asNum(row.startHeight ?? row.position?.z);
    if (!this.isFiniteXYZ(x, y, z)) {
      console.warn('[ObstacleSerializer][skip-row-no-position]', {
        source,
        rowId: row.id,
      });
      return null;
    }

    return [
      x!,
      y!,
      z!,
      this.asNum(row.width, 0)!,
      this.asNum(row.length, 0)!,
      this.asNum(row.height, 0)!,
      this.asNum((row as any).angle ?? (row as any).rotation, 0)!,
      this.asStr((row as any).material, ''),
      this.asStr((row as any).shape, source === 'landscape' ? 'landscape' : 'obstacle'),
      this.asStr((row as any).color, '#73805c'),
    ];
  }

  private normalizeBuildingRow(row: BuildingObstacleRowLike): ObstacleTuple | null {
    const tuple = normalizeBuildingObstacle({
      source: 'row',
      key: row.id ?? '(no-id)',
      row,
      onSkip: (rec) => this.lastBuildingSkips.push(rec),
    }) as ObstacleTuple | null;
    if (tuple) {
      this.logBuildingRectPayload(row.id ?? '(no-id)', tuple);
    }
    return tuple;
  }

  private normalizeBuildingMesh(mesh: BuildingObstacleMeshLike): ObstacleTuple | null {
    const tuple = normalizeBuildingObstacle({
      source: 'mesh',
      key: mesh.name ?? '(unnamed-building)',
      mesh,
      onSkip: (rec) => this.lastBuildingSkips.push(rec),
    }) as ObstacleTuple | null;
    if (tuple) {
      const rowId =
        String((mesh.metadata as any)?.fieldRowId ?? (mesh.metadata as any)?.osmId ?? mesh.name ?? '(unnamed-building)');
      this.logBuildingRectPayload(rowId, tuple);
    }
    return tuple;
  }

  private logBuildingRectPayload(rowId: string, tuple: ObstacleTuple): void {
    console.log('[BuildingRect][Payload]', {
      rowId,
      x: tuple[0],
      y: tuple[1],
      width: tuple[3],
      length: tuple[4],
      angle: tuple[6],
      height: tuple[5],
      shape: tuple[8],
      material: tuple[7],
    });
  }

  private isFiniteXYZ(x: number | null, y: number | null, z: number | null): boolean {
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
  }

  private asNum(value: unknown, fallback: number | null = null): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private asStr(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (value == null) return fallback;
    return String(value);
  }
}
