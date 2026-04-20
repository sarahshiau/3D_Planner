import {
  ResultCardVm,
  ResultGroupVm,
  ResultPanelVm,
  ResultStatus,
} from '../models/result-panel.model';

export function buildResultPanelVm(evaluationFunc: any, resultOutput: any): ResultPanelVm {
  if (!evaluationFunc) {
    return {
      counts: { all: 0, passed: 0, failed: 0 },
      groups: [],
      emptyText: '尚未設定規劃目標',
    };
  }

  const field = evaluationFunc.field;
  const groups: ResultGroupVm[] = [];
  const subfield0 = getPrimarySubfield(resultOutput);

  if (field?.coverage?.activate === true) {
    const group = buildCoverageGroup(field.coverage, resultOutput, subfield0);
    if (group) groups.push(group);
  }

  if (field?.sinr?.activate === true) {
    const group = buildThresholdAreaSingleGroup({
      key: 'field-sinr',
      title: '強化整體場域訊號品質',
      unit: 'dB',
      ratios: Array.isArray(field?.sinr?.ratio) ? field.sinr.ratio : [],
      resolveActualRatio: (index: number) => {
        const sinrNode = resultOutput?.evaluationResult?.field?.sinr;
        return normalizeRatio01(
          safeNumber(
            firstDefined(
              Array.isArray(sinrNode?.ratio) ? sinrNode?.ratio?.[index] : undefined,
              subfield0?.coverageQuality,
            ),
          ),
        );
      },
    });

    if (group) groups.push(group);
  }

  if (field?.rsrp?.activate === true) {
    const group = buildThresholdAreaSingleGroup({
      key: 'field-rsrp',
      title: '強化整體場域訊號強度',
      unit: 'dB',
      ratios: Array.isArray(field?.rsrp?.ratio) ? field.rsrp.ratio : [],
      resolveActualRatio: (index: number) => {
        const rsrpNode = resultOutput?.evaluationResult?.field?.rsrp;
        return normalizeRatio01(
          safeNumber(
            firstDefined(
              Array.isArray(rsrpNode?.ratio) ? rsrpNode?.ratio?.[index] : undefined,
            ),
          ),
        );
      },
    });

    if (group) groups.push(group);
  }

  if (field?.throughput?.activate === true) {
    const group = buildThresholdAreaDuplexGroup({
      key: 'field-throughput',
      title: '強化整體場域訊號傳輸速率',
      ratios: Array.isArray(field?.throughput?.ratio) ? field.throughput.ratio : [],
      resolveActualUlRatio: (index: number) => {
        const tpNode = resultOutput?.evaluationResult?.field?.throughput;
        return normalizeRatio01(
          safeNumber(
            firstDefined(
              Array.isArray(tpNode?.ratio) ? tpNode?.ratio?.[index]?.ULValue : undefined,
            ),
          ),
        );
      },
      resolveActualDlRatio: (index: number) => {
        const tpNode = resultOutput?.evaluationResult?.field?.throughput;
        return normalizeRatio01(
          safeNumber(
            firstDefined(
              Array.isArray(tpNode?.ratio) ? tpNode?.ratio?.[index]?.DLValue : undefined,
            ),
          ),
        );
      },
    });

    if (group) groups.push(group);
  }

  groups.forEach(group => {
    group.status = resolveGroupStatus(group.cards);
  });

  const allCards = groups.flatMap(group => group.cards);

  return {
    counts: {
      all: allCards.length,
      passed: allCards.filter(card => card.status === 'passed').length,
      failed: allCards.filter(card => card.status === 'failed').length,
    },
    groups,
    emptyText: groups.length === 0 ? '尚未設定規劃目標' : undefined,
  };
}

function buildCoverageGroup(
  coverageMetric: any,
  resultOutput: any,
  subfield0: any,
): ResultGroupVm | null {
  const targetRatio = normalizeRatio01(safeNumber(coverageMetric?.ratio));

  const coverageNode = resultOutput?.evaluationResult?.field?.coverage;
  const actualRatio = normalizeRatio01(
    safeNumber(
      firstDefined(
        coverageNode?.ratio,
        coverageNode,
        resultOutput?.coverage,
        subfield0?.coverage,
      ),
    ),
  );

  const status = resolveRatioStatus(actualRatio, targetRatio);

  const card: ResultCardVm = {
    id: 'field-coverage-0',
    order: 1,
    status,
    statusText: toStatusText(status),
    templateType: 'coverage-single',
    targetText: `覆蓋率 ${translateCompliance('moreThan')} ${formatPercent01Compact(targetRatio)}`,
    resultText: `覆蓋率 = ${formatPercent01(actualRatio)}`,
    actualValueText: formatPercent01(actualRatio),
    messagePrefix: '覆蓋率 =',
    messageSuffix: '',
    targetRaw: {
      ratio: targetRatio,
      compliance: 'moreThan',
    },
    actualRaw: {
      ratio: actualRatio,
    },
  };

  return {
    key: 'field-coverage',
    title: '強化整體場域內訊號覆蓋',
    status: 'unknown',
    cards: [card],
  };
}

function buildThresholdAreaSingleGroup(input: {
  key: string;
  title: string;
  unit: string;
  ratios: any[];
  resolveActualRatio: (index: number, ratio: any) => number | null;
}): ResultGroupVm | null {
  const cards: ResultCardVm[] = input.ratios.map((ratio, index) => {
    const targetAreaRatio = normalizeRatio01(safeNumber(ratio?.areaRatio));
    const actualAreaRatio = input.resolveActualRatio(index, ratio);
    const status = resolveRatioStatus(actualAreaRatio, targetAreaRatio);
    const operator = translateCompliance(ratio?.compliance);
    const thresholdText = formatThresholdWithUnit(ratio?.value, input.unit);

    return {
      id: `${input.key}-${index}`,
      order: index + 1,
      status,
      statusText: toStatusText(status),
      templateType: 'threshold-area-single',
      targetText: `場域內面積 ${formatPercent01Compact(targetAreaRatio)} ${operator} ${thresholdText}`,
      resultText: `場域內面積 ${formatPercent01(actualAreaRatio)} ${operator} ${thresholdText}`,
      actualValueText: formatPercent01(actualAreaRatio),
      messagePrefix: '場域內面積',
      messageSuffix: `${operator} ${thresholdText}`,
      targetRaw: {
        areaRatio: targetAreaRatio,
        compliance: ratio?.compliance,
        value: ratio?.value,
      },
      actualRaw: {
        ratio: actualAreaRatio,
      },
    };
  });

  if (cards.length === 0) return null;

  return {
    key: input.key,
    title: input.title,
    status: 'unknown',
    cards,
  };
}

function buildThresholdAreaDuplexGroup(input: {
  key: string;
  title: string;
  ratios: any[];
  resolveActualUlRatio: (index: number, ratio: any) => number | null;
  resolveActualDlRatio: (index: number, ratio: any) => number | null;
}): ResultGroupVm | null {
  const cards: ResultCardVm[] = [];

  input.ratios.forEach((ratio, index) => {
    const targetAreaRatio = normalizeRatio01(safeNumber(ratio?.areaRatio));
    const operator = translateCompliance(ratio?.compliance);

    if (ratio?.ULValue != null) {
      const actualUlRatio = input.resolveActualUlRatio(index, ratio);
      const ulStatus = resolveRatioStatus(actualUlRatio, targetAreaRatio);
      const ulThresholdText = `${formatPlainNumber(ratio?.ULValue)} Mbps`;

      cards.push({
        id: `${input.key}-ul-${index}`,
        order: cards.length + 1,
        status: ulStatus,
        statusText: toStatusText(ulStatus),
        templateType: 'threshold-area-duplex',
        targetText: `場域內面積 ${formatPercent01Compact(targetAreaRatio)} UL ${operator} ${ulThresholdText}`,
        resultText: `場域內面積 ${formatPercent01(actualUlRatio)} UL ${operator} ${ulThresholdText}`,
        actualValueText: formatPercent01(actualUlRatio),
        messagePrefix: '場域內面積',
        messageSuffix: `UL ${operator} ${ulThresholdText}`,
        targetRaw: {
          areaRatio: targetAreaRatio,
          compliance: ratio?.compliance,
          ULValue: ratio?.ULValue,
        },
        actualRaw: {
          ratio: actualUlRatio,
          direction: 'UL',
        },
      });
    }

    if (ratio?.DLValue != null) {
      const actualDlRatio = input.resolveActualDlRatio(index, ratio);
      const dlStatus = resolveRatioStatus(actualDlRatio, targetAreaRatio);
      const dlThresholdText = `${formatPlainNumber(ratio?.DLValue)} Mbps`;

      cards.push({
        id: `${input.key}-dl-${index}`,
        order: cards.length + 1,
        status: dlStatus,
        statusText: toStatusText(dlStatus),
        templateType: 'threshold-area-duplex',
        targetText: `場域內面積 ${formatPercent01Compact(targetAreaRatio)} DL ${operator} ${dlThresholdText}`,
        resultText: `場域內面積 ${formatPercent01(actualDlRatio)} DL ${operator} ${dlThresholdText}`,
        actualValueText: formatPercent01(actualDlRatio),
        messagePrefix: '場域內面積',
        messageSuffix: `DL ${operator} ${dlThresholdText}`,
        targetRaw: {
          areaRatio: targetAreaRatio,
          compliance: ratio?.compliance,
          DLValue: ratio?.DLValue,
        },
        actualRaw: {
          ratio: actualDlRatio,
          direction: 'DL',
        },
      });
    }
  });

  if (cards.length === 0) return null;

  return {
    key: input.key,
    title: input.title,
    status: 'unknown',
    cards,
  };
}

function getPrimarySubfield(resultOutput: any): any | null {
  const list = Array.isArray(resultOutput?.subfieldStatistics)
    ? resultOutput.subfieldStatistics
    : [];
  return list.length > 0 ? list[0] : null;
}

function translateCompliance(compliance: string): string {
  if (compliance === 'moreThan') return '>=';
  if (compliance === 'lessThan') return '<=';
  return compliance || '>=';
}

function normalizeRatio01(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (v > 1) return v / 100;
  if (v < 0) return null;
  return v;
}

function safeNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstDefined<T>(...values: T[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function formatPercent01(v: number | null | undefined): string {
  if (v == null) return '--';
  return `${(v * 100).toFixed(2)}%`;
}

function formatPercent01Compact(v: number | null | undefined): string {
  if (v == null) return '--';
  const pct = v * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

function formatPlainNumber(v: number | null | undefined): string {
  if (v == null) return '--';
  const n = Number(v);
  return Number.isInteger(n) ? `${n}` : `${n.toFixed(2)}`;
}

function formatThresholdWithUnit(v: number | null | undefined, unit: string): string {
  return `${formatPlainNumber(safeNumber(v))} ${unit}`;
}

function toStatusText(status: ResultStatus): string {
  return status === 'passed'
    ? '達標'
    : status === 'failed'
      ? '未達標'
      : '計算中';
}

function resolveRatioStatus(
  actual: number | null | undefined,
  target: number | null | undefined,
): ResultStatus {
  if (actual == null || target == null) {
    return 'unknown';
  }

  return actual >= target ? 'passed' : 'failed';
}

function resolveGroupStatus(cards: ResultCardVm[]): ResultStatus {
  if (cards.some(card => card.status === 'failed')) {
    return 'failed';
  }

  if (cards.length > 0 && cards.every(card => card.status === 'passed')) {
    return 'passed';
  }

  return 'unknown';
}