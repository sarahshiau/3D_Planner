import {
  RisApi,
  RisMaterialApi,
  RisProfileApi,
  RisRawDataApi,
  RisPatternRaw,
  RisRadiationRawRow,
} from '../models/ris.model';

export const MOCK_RIS_LIST: RisApi[] = [
  {
    risID: 2,
    risName: 'protorype',
    type: 'Active',
    frequency: [25800, 26700],
    material: 'Crystal-Liquid',
    manufacturer: 'prototype',
    elementNumber: [242, 137],
    elementSize: [2, 2],
    property: 'default',
    risEnergy: 0,
    risCost: 0,
  },
  {
    risID: 8,
    risName: 'New_RIS',
    type: 'passive',
    frequency: [27000, 285000],
    material: 'Glass Epoxy',
    manufacturer: 'AATest_ITRI',
    elementNumber: [15, 10],
    elementSize: [30, 30],
    property: 'customized',
    risEnergy: 20,
    risCost: 20,
  },
  {
    risID: 16,
    risName: 'FR4_RIS2',
    type: 'Passive',
    frequency: [27000, 29000],
    material: 'Glass Epoxy',
    manufacturer: 'AU',
    elementNumber: [64, 64],
    elementSize: [10, 10],
    property: 'customized',
    risEnergy: 50,
    risCost: 18000,
  },
  {
    risID: 23,
    risName: '5545',
    type: 'Passive',
    frequency: [25000, 28000],
    material: 'PIN-diode',
    manufacturer: '4864',
    elementNumber: [242, 137],
    elementSize: [10, 10],
    property: 'customized',
    risEnergy: 0,
    risCost: 0,
  },
];

export const MOCK_RIS_MATERIALS: RisMaterialApi[] = [
  { risMaterialID: 1, risMaterialNameEng: 'PIN-diode', risMaterialNameCHI: 'PIN-二級體' },
  { risMaterialID: 2, risMaterialNameEng: 'Crystal-Liquid', risMaterialNameCHI: '液晶' },
  { risMaterialID: 3, risMaterialNameEng: 'CMOS', risMaterialNameCHI: '互補式金屬氧化物半導體' },
  { risMaterialID: 4, risMaterialNameEng: 'Glass Epoxy', risMaterialNameCHI: '玻璃環氧樹脂' },
];

export const MOCK_RIS_PROFILES_BY_RISID: Record<number, RisProfileApi[]> = {
  2: [
    {
      profileID: 2,
      profileName: 'P001001',
      incHorizontal: [0, 0],
      incVertical: [90, 90],
      refHorizontal: 0,
      refVertical: 90,
      refCoefficient: 1.1,
    },
    {
      profileID: 3,
      profileName: 'P001002',
      incHorizontal: [0, 0],
      incVertical: [90, 90],
      refHorizontal: 0,
      refVertical: 60,
      refCoefficient: 7.61,
    },
  ],
  8: [
    {
      profileID: 5,
      profileName: 'pattern_RIS',
      incHorizontal: [0, 360],
      incVertical: [0, 180],
      refHorizontal: 45,
      refVertical: 0,
      refCoefficient: -15,
    },
  ],
};

export function makeRisKey(risID: number, profileID: number): string {
  return `${risID}:${profileID}`;
}

// Minimal demo rawdata for UI wiring (pattern table / preview).
// In Phase B we will replace this with xlsx parsing or API call.
function buildDemoPatternRaw(rows: number, cols: number): RisPatternRaw {
  const out: RisPatternRaw = {};
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      // simple checkerboard-ish pattern for demo
      row.push((r + c) % 3 === 0 ? 1 : 0);
    }
    out[String(r)] = row;
  }
  return out;
}

function buildDemoRadiationRaw(n: number): RisRadiationRawRow[] {
  const out: RisRadiationRawRow[] = [];
  for (let i = 0; i < n; i++) {
    // [angleIndex, v1, v2]
    out.push([i, Math.sin(i / 12) * 10, Math.sin(i / 12) * 10]);
  }
  return out;
}

export const MOCK_RIS_RAWDATA_BY_KEY: Record<string, RisRawDataApi> = {
  [makeRisKey(2, 2)]: {
    rowElement: 10,
    columnElement: 15,
    patternRaw: buildDemoPatternRaw(10, 15),
    radiationRaw: buildDemoRadiationRaw(360),
  },
  [makeRisKey(2, 3)]: {
    rowElement: 10,
    columnElement: 15,
    patternRaw: buildDemoPatternRaw(10, 15),
    radiationRaw: buildDemoRadiationRaw(360),
  },
  [makeRisKey(8, 5)]: {
    rowElement: 10,
    columnElement: 15,
    patternRaw: buildDemoPatternRaw(10, 15),
    radiationRaw: buildDemoRadiationRaw(360),
  },
};
