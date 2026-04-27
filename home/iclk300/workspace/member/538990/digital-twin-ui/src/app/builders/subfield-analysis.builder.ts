/**
 * Assembles SubfieldAnalysisVm[] from store rows + API result output (5GOutput / output).
 * Phase 4-2: metrics from `subfieldStatistics` via subfield-result.extractor (completeCalcResult bloodline).
 */

import type { SubfieldRow } from '../models/field-domain.model';
import type { SubfieldAnalysisVm } from '../models/subfield-analysis.vm';
import {
  extractSubfieldMetricsFromStat,
  resolveSubfieldStatRow,
  type SubfieldMetricsExtracted,
} from '../extractors/subfield-result.extractor';

/**
 * Stable display order:
 * rows with `sortOrder` first (ascending), tie-break `subfieldID`;
 * rows without `sortOrder` after, by `subfieldID` ascending, tie-break store index.
 */
function sortSubfieldRowsStable(rows: SubfieldRow[]): SubfieldRow[] {
  const indexed = rows.map((row, storeIndex) => ({ row, storeIndex }));
  const keys = (r: SubfieldRow, storeIndex: number): [number, number, number] => {
    const so = r.sortOrder;
    if (so != null && Number.isFinite(Number(so))) {
      return [0, Number(so), r.subfieldID];
    }
    return [1, r.subfieldID, storeIndex];
  };
  indexed.sort((a, b) => {
    const ka = keys(a.row, a.storeIndex);
    const kb = keys(b.row, b.storeIndex);
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
  return indexed.map((x) => x.row);
}

function buildOne(
  row: SubfieldRow,
  stat: any | null,
  hasResultOutput: boolean,
  metrics: SubfieldMetricsExtracted | null,
): SubfieldAnalysisVm {
  const title =
    row.name != null && String(row.name).trim().length > 0
      ? String(row.name)
      : '\u89c0\u6e2c\u5340\u57df ' + row.subfieldID;

  if (
    stat != null &&
    (typeof stat !== 'object' || Array.isArray(stat))
  ) {
    return {
      subfieldID: row.subfieldID,
      title,
      coverage: null,
      avgSinr: null,
      avgRsrp: null,
      avgDlThroughput: null,
      avgUlThroughput: null,
      status: 'unknown',
    };
  }

  if (!hasResultOutput) {
    return {
      subfieldID: row.subfieldID,
      title,
      coverage: null,
      avgSinr: null,
      avgRsrp: null,
      avgDlThroughput: null,
      avgUlThroughput: null,
      status: 'pending',
    };
  }

  if (!stat) {
    return {
      subfieldID: row.subfieldID,
      title,
      coverage: null,
      avgSinr: null,
      avgRsrp: null,
      avgDlThroughput: null,
      avgUlThroughput: null,
      status: 'empty',
    };
  }

  const { coverage, avgSinr, avgRsrp, avgDlThroughput, avgUlThroughput } =
    metrics ?? { coverage: null, avgSinr: null, avgRsrp: null, avgDlThroughput: null, avgUlThroughput: null };

  // Stat was matched \u2014 always 'ready'. 0 is a valid value, never downgrade to 'empty' here.
  return {
    subfieldID: row.subfieldID,
    title,
    coverage,
    avgSinr,
    avgRsrp,
    avgDlThroughput,
    avgUlThroughput,
    status: 'ready',
  };
}

/**
 * Stable order: {@link SubfieldRow.sortOrder} when both rows define it; else `subfieldID`;
 * tie-break: original store order.
 */
export function buildSubfieldAnalysisVms(
  rows: SubfieldRow[] | null | undefined,
  resultOutput: any,
): SubfieldAnalysisVm[] {
  const list = Array.isArray(rows) ? sortSubfieldRowsStable([...rows]) : [];

  const hasResultOutput = resultOutput != null;
  const stats = Array.isArray(resultOutput?.subfieldStatistics)
    ? resultOutput.subfieldStatistics
    : [];

  const singleSubfieldPair =
    stats.length === 1 && list.length === 1 ? stats[0] : null;

  return list.map((row) => {
    let matchedStat = resolveSubfieldStatRow(stats, row.subfieldID);
    /**
     * Legacy / mock rows may omit subfieldID and use a non-numeric `ID` label (e.g. slice height).
     * Only when API returns exactly one statistics row and the store has exactly one observation
     * area do we bind that row — avoids wrong assignment with multiple subfields.
     */
    if (!matchedStat && singleSubfieldPair != null) {
      matchedStat = singleSubfieldPair;
    }

    const extractedMetrics =
      matchedStat != null && typeof matchedStat === 'object' && !Array.isArray(matchedStat)
        ? extractSubfieldMetricsFromStat(matchedStat)
        : null;

    const cardVm = buildOne(row, matchedStat, hasResultOutput, extractedMetrics);

    console.log('[OBS_STAT_MAPPING]', {
      analysisSubfield: row,
      stats,
      matchedStat,
      extractedMetrics,
      cardVm,
    });

    return cardVm;
  });
}
