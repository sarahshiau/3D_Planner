import { PathLossModelApi } from '../models/pathloss-model.model';

/**
 * 系統預設 PathLoss 模型（property = 'default'）
 */
export const PATHLOSS_SYSTEM_MODELS: PathLossModelApi[] = [
  {
    id: 1,
    name: 'ITRI Bldg.51',
    chineseName: 'ITRI 51館5F',
    distancePowerLoss: 16.16,
    fieldLoss: -11.24,
    property: 'default',
  },
  {
    id: 3,
    name: 'ITU office 900MHz',
    chineseName: 'ITU office 900MHz',
    distancePowerLoss: 33,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 4,
    name: 'ITU office 1.2~1.3GHz',
    chineseName: 'ITU office 1.2~1.3GHz',
    distancePowerLoss: 32,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 5,
    name: 'ITU office 1.8~2, 2.4GHz',
    chineseName: 'ITU office 1.8~2, 2.4GHz',
    distancePowerLoss: 30,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 6,
    name: 'ITU office 3.5GHz',
    chineseName: 'ITU office 3.5GHz',
    distancePowerLoss: 27,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 7,
    name: 'ITU residential 1.8~2, 2.4GHz',
    chineseName: 'ITU residential 1.8~2, 2.4GHz',
    distancePowerLoss: 28,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 8,
    name: 'ITU commercial 900MHz',
    chineseName: 'ITU commercial 900MHz',
    distancePowerLoss: 20,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 9,
    name: 'ITU commercial 1.2~1.3, 1.8~2, 4GHz',
    chineseName: 'ITU commercial 1.2~1.3, 1.8~2, 4GHz',
    distancePowerLoss: 22,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 12,
    name: 'ITU office 5.2GHz',
    chineseName: 'ITU office 5.2GHz',
    distancePowerLoss: 31,
    fieldLoss: 0,
    property: 'default',
  },
  {
    id: 13,
    name: 'ITU office 4.7GHz',
    chineseName: 'ITU office 4.7GHz',
    distancePowerLoss: 19.8,
    fieldLoss: 0,
    property: 'default',
  },
];

/**
 * 自訂 PathLoss 模型（property = 'customized'）
 */
export const PATHLOSS_CUSTOM_MODELS: PathLossModelApi[] = [
  {
    id: 29,
    name: '78-304_5G_n79_衰減',
    chineseName: '78-304_5G_n79_衰減',
    distancePowerLoss: 25.323,
    fieldLoss: 5.149,
    property: 'customized',
  },
  {
    id: 43,
    name: 'ITU office 26~29GHz',
    chineseName: 'ITU office 26~29GHz',
    distancePowerLoss: 18.4,
    fieldLoss: 0,
    property: 'customized',
  },
  {
    id: 44,
    name: '311RIS測試案場',
    chineseName: '311RIS測試案場',
    distancePowerLoss: 22.84707,
    fieldLoss: -55.97982,
    property: 'customized',
  },
  {
    id: 68,
    name: '000',
    chineseName: '000',
    distancePowerLoss: 0.1,
    fieldLoss: 0.1,
    property: 'customized',
  },
  {
    id: 69,
    name: '00000',
    chineseName: '00000',
    distancePowerLoss: 0.1,
    fieldLoss: 0.1,
    property: 'customized',
  },
];

/**
 * 所有 PathLoss 模型（系統預設 + 自訂）
 */
export const PATHLOSS_ALL_MODELS: PathLossModelApi[] = [
  ...PATHLOSS_SYSTEM_MODELS,
  ...PATHLOSS_CUSTOM_MODELS,
];
