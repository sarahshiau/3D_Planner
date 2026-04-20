export type MaterialProperty = 'default' | 'customized';

/**
 * API DTO: 對齊後端 getObstacle response
 */
export interface MaterialApiDto {
  id: number;
  name: string;
  chineseName?: string;
  decayCoefficient: number;
  property: MaterialProperty;
}

/**
 * UI Row: 供表格/管理頁使用
 * - decay: UI 延用舊欄位名稱（對應 decayCoefficient）
 * - chineseName: 可選（UI 不使用）
 * - __uiKey: Optimistic row 的唯一鍵
 * - __uiStatus: Optimistic row 的狀態（uploading | ready）
 */
export interface MaterialRow {
  id: number;
  name: string;
  chineseName?: string;
  decay: number;
  property: MaterialProperty;
  __uiKey?: string;
  __uiStatus?: 'uploading' | 'ready';
}

/**
 * Add payload: 對齊 addObstacle payload（不含 id）
 */
export interface AddMaterialPayload {
  name: string;
  chineseName?: string;
  decayCoefficient: number;
  property: 'customized';
}

/**
 * Update payload: 對齊 updateObstacle payload（含 id）
 */
export interface UpdateMaterialPayload {
  id: number;
  name: string;
  chineseName?: string;
  decayCoefficient: number;
  property: 'customized';
}
