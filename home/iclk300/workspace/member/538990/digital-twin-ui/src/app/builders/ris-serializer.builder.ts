import type { IntelligentPanelFieldRow } from '../models/field-domain.model';

export interface SerializedRisRow {
  risID: number;
  location: {
    x: number;
    y: number;
    z: number;
  };
  profileID: number;
  insHorizontal: number;
  insVertical: number;
}

export class RisSerializerBuilder {
  serialize(rows: IntelligentPanelFieldRow[] = []): SerializedRisRow[] {
    return rows
      .map((row) => this.serializeOne(row))
      .filter((row): row is SerializedRisRow => row !== null);
  }

  private serializeOne(row: IntelligentPanelFieldRow): SerializedRisRow | null {
    const risID = this.asNum(row.risID ?? row.risId);
    const profileID = this.asNum(row.profileID ?? row.profileId);
    const insHorizontal = this.asNum(row.insHorizontal ?? row.installHorizontalAngle ?? 0);
    const insVertical = this.asNum(row.insVertical ?? row.installVerticalAngle ?? 0);

    const x = this.asNum(row.position?.x ?? row.x);
    const y = this.asNum(row.position?.y ?? row.y);
    const z = this.asNum(row.position?.z ?? row.z);

    if (
      risID === null ||
      profileID === null ||
      insHorizontal === null ||
      insVertical === null ||
      x === null ||
      y === null ||
      z === null
    ) {
      console.warn('[RisSerializer][skip-row-missing-required-field]', {
        rowId: row.id,
        missing: {
          risID: risID === null,
          profileID: profileID === null,
          insHorizontal: insHorizontal === null,
          insVertical: insVertical === null,
          positionX: x === null,
          positionY: y === null,
          positionZ: z === null,
        },
      });
      return null;
    }

    return {
      risID,
      location: { x, y, z },
      profileID,
      insHorizontal,
      insVertical,
    };
  }

  private asNum(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  }
}
