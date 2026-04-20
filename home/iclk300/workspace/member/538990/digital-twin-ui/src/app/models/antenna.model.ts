/** 天線連接埠資訊 */
export interface AntennaPort {
  portId: number;
  portName: string;
  portGain: number;
}

/** 天線頻率與連接埠關聯 */
export interface AntennaAvailableFrequency {
  frequency: number | null;
  frequencyId: number | null;
  ports: AntennaPort[];
}

/** 1. 原始 API 格式 (完全對齊 YAML son_getAntennas_body) */
export interface AntennaFromApi {
  antennaID: number;
  antennaName: string;
  antennaType: string;
  protocol: string;
  manufactor: string;
  model: string;
  band: number[]; // [開始頻率, 結束頻率]
  availableFrequencies?: AntennaAvailableFrequency[];
}

/** 2. 前端 UI 顯示格式 (對齊你目前的 HTML 變數) */
export interface AntennaRow {
  id: string;        // 將 number ID 轉為 string 方便處理
  name: string;      // 對應 antennaName
  type: string;      // 對應 antennaType
  network: string;   // 對應 protocol
  freqMHz: string;   // 由 [band0, band1] 轉換成 "band0 ~ band1"
  vendor: string;    // 對應 manufactor
  model: string;
  count: number;
  availableFrequencies?: AntennaAvailableFrequency[];
}