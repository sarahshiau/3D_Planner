/**
 * BS Legacy Serializer
 *
 * Converts scene/store base station data to legacy payload format.
 * Keeps serialization logic centralized; output matches backend API expectations.
 */

import { ExistingBsFieldRow } from '../models/field-domain.model';
import { AntennaApiDto } from '../models/antenna/antenna.api.dto';
import {
  DEFAULT_PROTOCOL,
  DEFAULT_DISPLAY_COLOR,
  DEFAULT_INSTALLATION,
} from '../models/existing-bs-defaults.helper';

/** Normalized BS row for serialization (position + antenna from store) */
export interface BsSourceRow {
  id: string | number;
  x: number;
  y: number;
  z: number;
  antenna?: AntennaApiDto | null;
}

/**
 * Serialize BS positions to legacy defaultBs format.
 * Format: "[x,y,z]|[x,y,z]|..."
 */
export function serializeBsPositionsToLegacy(rows: BsSourceRow[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows
    .map((r) => {
      const x = Number(r?.x ?? 0);
      const y = Number(r?.y ?? 0);
      const z = Number(r?.z ?? 10);
      return `[${x},${y},${z}]`;
    })
    .join('|');
}

/**
 * Serialize BS antenna info to legacy defaultBsAnt format.
 * When antenna is bound: "[antennaID,0,0,0]|[antennaID,0,0,0]|..."
 * When no antenna: fallback to position format "[x,y,z]|..." to match defaultBs
 */
export function serializeBsAntennaToLegacy(rows: BsSourceRow[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows
    .map((r) => {
      const ant = r?.antenna;
      if (ant && Number.isFinite(ant.antennaID)) {
        return `[${ant.antennaID},0,0,0]`;
      }
      const x = Number(r?.x ?? 0);
      const y = Number(r?.y ?? 0);
      const z = Number(r?.z ?? 10);
      return `[${x},${y},${z}]`;
    })
    .join('|');
}

/** Legacy antenna object in bsList.defaultBs[].antenna[] */
export interface LegacyAntennaItem {
  ID: number;
  position: { coordinate: number[]; installation: string };
  gain: number;
  ulFrequency: number;
  dlFrequency: number;
  angle: { theta: number; phi: number; fixed: boolean };
}

/** Legacy bsList.defaultBs row */
export interface LegacyBsListRow {
  ID: number;
  position: number[];
  antenna: LegacyAntennaItem[];
  color?: string[];
  protocol?: string;
  params?: Record<string, unknown>;
}

/**
 * Map AntennaApiDto + BS position to legacy antenna item
 */
function mapAntennaToLegacy(antenna: AntennaApiDto, position: [number, number, number]): LegacyAntennaItem {
  const af = antenna?.availableFrequencies?.[0];
  const port = af?.ports?.[0];
  const freqMHz = af?.frequency ?? 4850;
  return {
    ID: antenna.antennaID,
    position: { coordinate: [...position], installation: 'Customized' },
    gain: Number(port?.portGain ?? 0),
    ulFrequency: Number(freqMHz),
    dlFrequency: Number(freqMHz),
    angle: { theta: 0, phi: 0, fixed: false },
  };
}

/** Default params shell for bsList.defaultBs row (from template) */
const DEFAULT_BS_PARAMS = {
  txPower: 24,
  powerUnit: 'dbm',
  noiseFigure: 0,
  band: 'n79',
  duplex: {
    isTdd: true,
    isFdd: false,
    tddParam: {
      dl: { frameRatio: 70, frequency: 4850, bandwidth: '100', scs: '30', mcsTable: '256QAM-table', mimo: 1 },
      ul: { frameRatio: 70, frequency: 4850, bandwidth: '100', scs: '30', mcsTable: '64QAM-table', mimo: 1 },
    },
    fddParam: {},
  },
};

const HSL_COLORS = ['hsl(100,98%,68%)', 'hsl(100,98%,48%)', 'hsl(200,73%,54%)', 'hsl(200,73%,34%)'];

/**
 * Build bsList.defaultBs from scene/store existingBs.
 * Each row gets position from store, antenna from row.antenna (AntennaApiDto).
 */
export function buildBsListDefaultBs(
  rows: BsSourceRow[],
  fallbackTemplate?: LegacyBsListRow[]
): LegacyBsListRow[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return fallbackTemplate ?? [];
  }

  return rows.map((row, index) => {
    const pos: [number, number, number] = [
      Number(row?.x ?? 0),
      Number(row?.y ?? 0),
      Number(row?.z ?? 10),
    ];
    const id = Number.isFinite(Number(row?.id)) ? Number(row.id) : index + 1;
    const antenna = row?.antenna;

    const legacyAntennas: LegacyAntennaItem[] = antenna
      ? [mapAntennaToLegacy(antenna, pos)]
      : [
          {
            ID: 0,
            position: { coordinate: [...pos], installation: 'Customized' },
            gain: 0,
            ulFrequency: 4850,
            dlFrequency: 4850,
            angle: { theta: 0, phi: 0, fixed: false },
          },
        ];

    const fallback = fallbackTemplate?.[index];
    return {
      ID: id,
      position: pos,
      antenna: legacyAntennas,
      color: fallback?.color ?? [HSL_COLORS[index % 2], HSL_COLORS[(index % 2) + 2]],
      protocol: fallback?.protocol ?? '5G',
      params: fallback?.params ?? DEFAULT_BS_PARAMS,
    };
  });
}

/**
 * Convert ExistingBsFieldRow[] to BsSourceRow[]
 */
export function toBsSourceRows(rows: ExistingBsFieldRow[]): BsSourceRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    z: r.z,
    antenna: r.antenna ?? null,
  }));
}

/* ================== Full Builder (from ExistingBsFieldRow, no template) ================== */

/** Parse numeric ID from row.id suffix (e.g. 'bs_1' -> 1), fallback index+1 */
function parseRowId(row: ExistingBsFieldRow, index: number): number {
  const raw = String(row?.id ?? '');
  const match = raw.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : index + 1;
}

/** Ensure bandwidth/scs as string for legacy payload */
function asLegacyString(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

/**
 * Build legacy antenna[0] from ExistingBsFieldRow.
 */
export function buildLegacyBsAntennaFromRow(row: ExistingBsFieldRow): LegacyAntennaItem {
  const pos: [number, number, number] = [
    Number(row?.x ?? 0),
    Number(row?.y ?? 0),
    Number(row?.z ?? 10),
  ];
  const antennaId = row?.antenna?.antennaID ?? 0;
  const installation = row?.placementConfig?.installation ?? DEFAULT_INSTALLATION;
  const gain = Number(row?.antennaRuntime?.selectedPortGain ?? 0);
  const freq = Number(row?.antennaRuntime?.selectedFrequency ?? 4850);
  const angle = row?.placementConfig?.angle ?? { theta: 0, phi: 0, fixed: false };
  return {
    ID: antennaId,
    position: { coordinate: [...pos], installation },
    gain,
    ulFrequency: freq,
    dlFrequency: freq,
    angle: { ...angle },
  };
}

/**
 * Build full legacy bsList.defaultBs item from ExistingBsFieldRow.
 */
export function buildLegacyDefaultBsItemFromRow(
  row: ExistingBsFieldRow,
  index: number
): LegacyBsListRow {
  const pos: [number, number, number] = [
    Number(row?.x ?? 0),
    Number(row?.y ?? 0),
    Number(row?.z ?? 10),
  ];
  const id = parseRowId(row, index);
  const color = Array.isArray(row?.displayConfig?.color) && row.displayConfig.color.length > 0
    ? [...row.displayConfig.color]
    : [...DEFAULT_DISPLAY_COLOR];
  const protocol = row?.protocol ?? DEFAULT_PROTOCOL;

  const rc = row?.radioConfig;
  const duplex = rc?.duplex;
  const tddParam = duplex?.tddParam;
  const dl = tddParam?.dl;
  const ul = tddParam?.ul;
  const params = {
    txPower: Number(rc?.txPower ?? 24),
    powerUnit: String(rc?.powerUnit ?? 'dbm'),
    noiseFigure: Number(rc?.noiseFigure ?? 0),
    band: String(rc?.band ?? 'n79'),
    duplex: {
      isTdd: duplex?.isTdd ?? true,
      isFdd: duplex?.isFdd ?? false,
      tddParam: {
        dl: {
          frameRatio: Number(dl?.frameRatio ?? 70),
          frequency: Number(dl?.frequency ?? 4850),
          bandwidth: asLegacyString(dl?.bandwidth, '100'),
          scs: asLegacyString(dl?.scs, '30'),
          mcsTable: String(dl?.mcsTable ?? '256QAM-table'),
          mimo: Number(dl?.mimo ?? 1),
        },
        ul: {
          frameRatio: Number(ul?.frameRatio ?? 70),
          frequency: Number(ul?.frequency ?? 4850),
          bandwidth: asLegacyString(ul?.bandwidth, '100'),
          scs: asLegacyString(ul?.scs, '30'),
          mcsTable: String(ul?.mcsTable ?? '64QAM-table'),
          mimo: Number(ul?.mimo ?? 1),
        },
      },
      fddParam: duplex?.fddParam ?? {},
    },
  };

  const antenna = [buildLegacyBsAntennaFromRow(row)];

  return {
    ID: id,
    position: pos,
    antenna,
    color,
    protocol,
    params,
  };
}

/**
 * Build bsList.defaultBs fully from ExistingBsFieldRow[].
 * No template; each item is dynamically built from row.
 */
export function buildBsListDefaultBsFromRows(
  rows: ExistingBsFieldRow[]
): LegacyBsListRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row, index) => buildLegacyDefaultBsItemFromRow(row, index));
}
