/**
 * Phase 4-3/4-4: Observation-area card status, counts, section copy (analysis cards; user-facing zh-TW).
 */

import type {
  ObservationAreaCountsVm,
  SubfieldAnalysisStatus,
  SubfieldAnalysisVm,
} from '../models/subfield-analysis.vm';

export function subfieldMetricsHaveAny(vm: SubfieldAnalysisVm): boolean {
  return [
    vm.coverage,
    vm.avgSinr,
    vm.avgRsrp,
    vm.avgDlThroughput,
    vm.avgUlThroughput,
  ].some((v) => v != null && Number.isFinite(Number(v)));
}

/**
 * Reconcile status vs metrics (defensive) and attach derived flags.
 */
export function finalizeSubfieldAnalysisVm(
  vm: SubfieldAnalysisVm,
): SubfieldAnalysisVm {
  const hasAnyMetric = subfieldMetricsHaveAny(vm);
  let status: SubfieldAnalysisStatus = vm.status ?? 'unknown';

  if (status === 'ready' && !hasAnyMetric) {
    status = 'empty';
  }
  if (status === 'empty' && hasAnyMetric) {
    status = 'ready';
  }

  const isEmpty = status === 'empty';

  return {
    ...vm,
    status,
    hasAnyMetric,
    isEmpty,
  };
}

export function buildObservationAreaCounts(
  vms: SubfieldAnalysisVm[],
): ObservationAreaCountsVm {
  const counts: ObservationAreaCountsVm = {
    total: vms.length,
    ready: 0,
    empty: 0,
    pending: 0,
    unknown: 0,
  };

  for (const vm of vms) {
    switch (vm.status ?? 'unknown') {
      case 'ready':
        counts.ready++;
        break;
      case 'empty':
        counts.empty++;
        break;
      case 'pending':
        counts.pending++;
        break;
      case 'unknown':
      default:
        counts.unknown++;
        break;
    }
  }

  return counts;
}

/** One-line summary for the summary card (same section as \u89c0\u6e2c\u5340\u57df\u5206\u6790). */
export function formatObservationAreaCountsLine(
  c: ObservationAreaCountsVm,
): string {
  if (c.total <= 0) {
    return '';
  }
  const parts = [`\u5171 ${c.total} \u500b\u89c0\u6e2c\u5340\u57df`];
  if (c.ready > 0) {
    parts.push(`\u6709\u8cc7\u6599 ${c.ready}`);
  }
  if (c.empty > 0) {
    parts.push(`\u7121\u8cc7\u6599 ${c.empty}`);
  }
  if (c.pending > 0) {
    parts.push(`\u7b49\u5f85\u7d50\u679c ${c.pending}`);
  }
  if (c.unknown > 0) {
    parts.push(`\u7121\u6cd5\u5224\u5b9a ${c.unknown}`);
  }
  return parts.join(' \u00b7 ');
}

/**
 * Short hint under summary; distinct from "\u5c1a\u672a\u5efa\u7acb\u89c0\u6e2c\u5340\u57df".
 */
export function resolveObservationAreaSectionHint(
  c: ObservationAreaCountsVm,
): string | null {
  if (c.total <= 0) return null;

  if (c.pending === c.total) {
    return '\u5c1a\u672a\u7522\u751f\u5206\u6790\u7d50\u679c';
  }

  if (
    c.ready === 0 &&
    c.pending === 0 &&
    c.unknown === 0 &&
    c.empty === c.total
  ) {
    return '\u7121\u53ef\u7528\u7d71\u8a08\uff0c\u8acb\u78ba\u8a8d\u904b\u7b97\u5df2\u5b8c\u6210';
  }

  return null;
}

/** Neutral status badge (\u975e\u9054\u6a19 / \u672a\u9054\u6a19). */
export function observationCardStatusLabel(
  status: SubfieldAnalysisStatus | undefined,
): string {
  switch (status) {
    case 'ready':
      return '\u6709\u8cc7\u6599';
    case 'empty':
      return '\u7121\u8cc7\u6599';
    case 'pending':
      return '\u7b49\u5f85\u4e2d';
    case 'unknown':
    default:
      return '\u7121\u6cd5\u5224\u5b9a';
  }
}

/** BEM-style modifiers for card container + badge. */
export function observationCardModifierClass(
  status: SubfieldAnalysisStatus | undefined,
): string {
  const s = status ?? 'unknown';
  return `observe-card--${s}`;
}

export function observationBadgeModifierClass(
  status: SubfieldAnalysisStatus | undefined,
): string {
  const s = status ?? 'unknown';
  return `observe-status-badge--${s}`;
}

/** Per-card hint when row has no metrics (optional footer line). */
export function observationPerCardEmptyHint(
  status: SubfieldAnalysisStatus | undefined,
): string | null {
  if (status === 'empty') {
    return '\u6b64\u89c0\u6e2c\u5340\u57df\u76ee\u524d\u7121\u53ef\u7528\u8cc7\u6599';
  }
  return null;
}
