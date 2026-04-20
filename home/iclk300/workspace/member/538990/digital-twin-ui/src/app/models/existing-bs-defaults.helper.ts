/**
 * ExistingBsFieldRow default values helper
 * Centralized defaults; do not scatter values in placement logic.
 */

import {
  AntennaApiDto,
  AvailableFrequencyDto,
  PortDto,
} from './antenna/antenna.api.dto';
import type {
  ExistingBsDisplayConfig,
  ExistingBsPlacementConfig,
  ExistingBsRadioConfig,
  ExistingBsAntennaRuntime,
} from './field-domain.model';

/* ================== Default Values (system defaults) ================== */

export const DEFAULT_PROTOCOL = '5G';

export const DEFAULT_DISPLAY_COLOR: [string, string] = [
  'hsl(100,98%,68%)',
  'hsl(100,98%,48%)',
];

export const DEFAULT_INSTALLATION = 'Customized';

export const DEFAULT_ANGLE = { theta: 0, phi: 0, fixed: false } as const;

export const DEFAULT_TX_POWER = 24;
export const DEFAULT_POWER_UNIT = 'dbm';
export const DEFAULT_NOISE_FIGURE = 0;
export const DEFAULT_BAND = 'n79';
export const DEFAULT_FREQUENCY = 4850;
export const DEFAULT_BANDWIDTH = 100;
export const DEFAULT_SCS = 30;
export const DEFAULT_FRAME_RATIO = 70;
export const DEFAULT_UL_MCS_TABLE = '64QAM-table';
export const DEFAULT_DL_MCS_TABLE = '256QAM-table';
export const DEFAULT_MIMO = 1;

const DEFAULT_TDD_DL = {
  frameRatio: DEFAULT_FRAME_RATIO,
  frequency: DEFAULT_FREQUENCY,
  bandwidth: String(DEFAULT_BANDWIDTH),
  scs: String(DEFAULT_SCS),
  mcsTable: DEFAULT_DL_MCS_TABLE,
  mimo: DEFAULT_MIMO,
};

const DEFAULT_TDD_UL = {
  frameRatio: DEFAULT_FRAME_RATIO,
  frequency: DEFAULT_FREQUENCY,
  bandwidth: String(DEFAULT_BANDWIDTH),
  scs: String(DEFAULT_SCS),
  mcsTable: DEFAULT_UL_MCS_TABLE,
  mimo: DEFAULT_MIMO,
};

/* ================== Helper Functions ================== */

export function getDefaultDisplayConfig(): ExistingBsDisplayConfig {
  return {
    color: [...DEFAULT_DISPLAY_COLOR],
  };
}

export function getDefaultPlacementConfig(): ExistingBsPlacementConfig {
  return {
    installation: DEFAULT_INSTALLATION,
    angle: { ...DEFAULT_ANGLE },
  };
}

export function getDefaultRadioConfig(): ExistingBsRadioConfig {
  return {
    txPower: DEFAULT_TX_POWER,
    powerUnit: DEFAULT_POWER_UNIT,
    noiseFigure: DEFAULT_NOISE_FIGURE,
    band: DEFAULT_BAND,
    duplex: {
      isTdd: true,
      isFdd: false,
      tddParam: {
        dl: { ...DEFAULT_TDD_DL },
        ul: { ...DEFAULT_TDD_UL },
      },
      fddParam: {},
    },
  };
}

/**
 * Derive antennaRuntime from antenna.availableFrequencies[0] and ports[0].
 * Falls back to defaults when antenna is null or has no frequencies/ports.
 */
export function getDefaultAntennaRuntime(
  antenna?: AntennaApiDto | null
): ExistingBsAntennaRuntime {
  const af: AvailableFrequencyDto | undefined = antenna?.availableFrequencies?.[0];
  const port: PortDto | undefined = af?.ports?.[0];
  return {
    selectedFrequency: af?.frequency ?? DEFAULT_FREQUENCY,
    selectedFrequencyId: af?.frequencyId ?? null,
    selectedPortId: port?.portId ?? null,
    selectedPortName: port?.portName ?? '',
    selectedPortGain: port?.portGain ?? 0,
  };
}

/**
 * Build all optional field defaults for a new ExistingBsFieldRow.
 * Pass antenna when creating a row so antennaRuntime is derived from it.
 */
export function getExistingBsFieldDefaults(antenna?: AntennaApiDto | null): {
  protocol: string;
  displayConfig: ExistingBsDisplayConfig;
  placementConfig: ExistingBsPlacementConfig;
  radioConfig: ExistingBsRadioConfig;
  antennaRuntime: ExistingBsAntennaRuntime;
} {
  return {
    protocol: DEFAULT_PROTOCOL,
    displayConfig: getDefaultDisplayConfig(),
    placementConfig: getDefaultPlacementConfig(),
    radioConfig: getDefaultRadioConfig(),
    antennaRuntime: getDefaultAntennaRuntime(antenna),
  };
}
