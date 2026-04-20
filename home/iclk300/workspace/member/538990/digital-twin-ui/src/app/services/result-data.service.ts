import { Injectable, signal } from '@angular/core';

/** ===== API 回傳資料結構（依你提供的 JSON Mockup） ===== */



export interface BsDetail {
  ID: number;
  txPower: number;
  antenna: Array<{
    position: { coordinate: [number, number, number] };
    angle: { theta: number; phi: number };
  }>;
}

export interface SubfieldStat {
  /** Backend aligns with task `subfieldID` when numeric; may be a slice label string in legacy rows. */
  ID: string | number;
  subfieldID?: number;
  coverage: number; // 0~1 ratio or 0~100 percent (see normalizePct in sidebar)
  coverageHigh?: number;
  coverageQuality?: number;
  signalQualityAvg: number; // avg SINR (dB)
  rsrpAvg?: number; // dBm
  signalStrengthAvg?: number; // dBm (completeCalcResult bloodline)
  dlTptAvg?: number; // Mbps in sampled API
  ulTptAvg?: number;
}

export interface ResultApiResponse {
  taskId: string;
  taskName: string;
  output: {
    evaluationResult: {
      field: {
        coverage: number;      // 0~1
        sinr: number;          // dB
        rsrp: number;          // dBm
        dlThroughput: number;  // Mbps
      };
    };
    chosenBsList: {
      defaultBs: BsDetail[];
      candidateBs: BsDetail[];
    };
    subfieldStatistics: SubfieldStat[];
  };
}

export type ViewMode = 'edit' | 'result';

// ===== [RESULT:MVP_TYPES] =====
// Result Mode UI (A-final) uses this structure (mock now, API later)

export interface ResultMvpChartDatum {
  label: string;
  value: number;
}

export interface ResultMvpChart {
  id: string;
  title: string;
  type: 'donut' | 'bar' | 'line' | 'table' | 'type';
  unit?: string;
  data: ResultMvpChartDatum[];
}

export interface ResultMvpBsPerfRow {
  bsId: string;
  bsName: string;

  servedUe: number;
  avgThroughputMbps: number;

  // ===== 9 columns for "建議規劃元件 – 基站清單表" =====
  txPowerDbm?: number;        // 功率(dBm)
  centerFreqMhz?: number;     // 中心頻率(MHz)
  scsKhz?: number;            // 子載波間距(kHz)
  bandwidthMhz?: number;      // 頻寬(MHz)
  ulModulation?: string;      // 上行調變能力
  dlModulation?: string;      // 下行調變能力
  ulLayers?: number;          // 上行資料串流層數
  dlLayers?: number;          // 下行資料串流層數

  // ===== for Base Station Performance panel (optional) =====
  dlTotalRateMbps?: number;
  ulTotalRateMbps?: number;
  dlAvgRateMbps?: number;
  ulAvgRateMbps?: number;
}

export interface ResultMvpData {
  meta: {
    projectName: string;
    createdAt: string;
    siteSizeM: { length: number; width: number; height: number };
    sliceHeightM: number;
    maxUePerTx: number;
    gridM: { x: number; y: number };
    pathLoss: { name: string; formula: string };
    goal: {
      title: string;
      thresholdCoveragePct: number;
      resultCoveragePct: number;
      passed: boolean;
    };
  };

  

  bsSubmission: {
    networkType: string;
    band: string;
    duplex: string;
    installableCount: number;
    existingCount: number;
    powerRangeDbm: { min: number; max: number };
  };

  risSubmission: {
    existingCount: number;
  };

  existingComponents: {
    bs: Array<{ id: string; name: string }>;
    ris: Array<{ id: string; name: string }>;
  };

  analysis: {
    overallCoverage: {
      coveragePct: number;
      avgRsrpDbm: number;
      avgSinrDb: number;

      // Coverage Summary 兩個門檻
      coverageRsrp90Pct?: number;
      coverageSinr15Pct?: number;
    };

    // ✅ 補回：基站清單/基站效能分析資料來源
    bsPerformance: ResultMvpBsPerfRow[];

    ueAnalysis: {
      totalUe: number;
      coveredUe: number;
      coveragePct: number;
      avgThroughputMbps: number;

      // UE 專屬平均（可選）
      avgUeQualityDb?: number;
      avgUeStrengthDbm?: number;
    };

    // ✅ 補回：統計圖表資料
    charts: ResultMvpChart[];
  };

}

@Injectable({ providedIn: 'root' })

export class ResultDataService {
  // ===== [RESULT:STATE] =====
  private _viewMode = signal<ViewMode>('edit');

  // legacy / API mockup result (existing)
  private _result = signal<ResultApiResponse | null>(null);

  // MVP result for Result Mode UI (A-final)
  private _resultMvp = signal<ResultMvpData | null>(null);

  viewMode = this._viewMode.asReadonly();
  result = this._result.asReadonly();
  resultMvp = this._resultMvp.asReadonly();

  // ===== [RESULT:SET_RESULT_DATA] =====
  // Purpose: store AsetResultDataPI result + switch UI to result mode
  setResultData(data: ResultApiResponse): void {
    console.log('[ResultDataService] setResultData()', {
      taskId: data.taskId,
      taskName: data.taskName,
      defaultBs: data.output?.chosenBsList?.defaultBs?.length ?? 0,
      candidateBs: data.output?.chosenBsList?.candidateBs?.length ?? 0,
      subfields: data.output?.subfieldStatistics?.length ?? 0,
    });

    this._result.set(data);
    this._viewMode.set('result');
  }

  // ===== [RESULT:MVP:SET] =====
  setResultMvp(data: ResultMvpData): void {
    console.log('[ResultDataService] setResultMvp()', {
      projectName: data?.meta?.projectName,
      bsRows: data?.analysis?.bsPerformance?.length ?? 0,
    });

    this._resultMvp.set(data);
    this._viewMode.set('result');
  }

  // ===== [RESULT:RESET_TO_EDIT] =====
  resetToEdit(): void {
    console.log('[ResultDataService] resetToEdit()');
    this._viewMode.set('edit');
    this._result.set(null);
    this._resultMvp.set(null);
  }

  // ===== [DBG:ENTER_RESULT_MODE] =====
  // (Optional) keep for debug; not required in A-final once setResultData is used.
  enterResultMode(): void {
    console.log('[ResultDataService][DBG] enterResultMode()');
    this._viewMode.set('result');
    this._resultMvp.set(null);   // 清空 MVP
  }
}
