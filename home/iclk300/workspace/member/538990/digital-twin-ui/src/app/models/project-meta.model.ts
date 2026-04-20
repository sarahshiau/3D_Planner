export type FieldMapSource = 'gis' | 'glb';

export interface ProjectMeta {
  projectName: string;

  fieldMapSource: FieldMapSource; // 'gis' | 'glb'
  glbFileName?: string;           // Phase 1 先記名字（真正上傳後面再做）

  // 先以你截圖的欄位 stub 起來（後續要完整再擴充）
  fieldSize?: {
    length: number; // 公尺
    width: number;  // 公尺
    height: number; // 公尺
  };

  networkType?: '5G' | 'WiFi' | '5G+WiFi';
  band?: 'n78' | 'n79' | 'n257' | 'n258';

  createdAtISO: string;
}
