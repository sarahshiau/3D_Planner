export type ResultStatus = 'passed' | 'failed' | 'unknown';

export type ResultTemplateType =
  | 'coverage-single'
  | 'threshold-area-single'
  | 'threshold-area-duplex';

export interface ResultPanelVm {
  counts: {
    all: number;
    passed: number;
    failed: number;
  };
  groups: ResultGroupVm[];
  emptyText?: string;
}

export interface ResultGroupVm {
  key: string;
  title: string;
  status: ResultStatus;
  cards: ResultCardVm[];
}

export interface ResultCardVm {
  id: string;
  order: number;

  status: ResultStatus;
  statusText: string;

  templateType: ResultTemplateType;
  targetText: string;
  resultText: string;

  // 舊 HTML 相容欄位（Patch 2 才會移除）
  messagePrefix: string;
  actualValueText: string;
  messageSuffix: string;

  targetRaw: any;
  actualRaw: any;
}
