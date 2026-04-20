export interface PathLossModelApi {
  id: number;
  name: string;
  chineseName: string;
  distancePowerLoss: number;
  fieldLoss: number;
  property: 'default' | 'customized' | string;
  protocol?: string;
}

export interface PathLossModelRow {
  id: number;
  name: string;
  chineseName: string;
  distancePowerLoss: number;
  fieldLoss: number;
  property: string;
  formula: string;
}

export type AddPathLossModelPayload = Omit<PathLossModelApi, 'id'>;
export type UpdatePathLossModelPayload = PathLossModelApi;
