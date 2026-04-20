/**
 * Phase 4-2: Extract Observation Area metrics from completeCalcResult / 5GOutput.subfieldStatistics.
 *
 * Bloodline (see repo sample `completeCalcResult.txt` → `5GOutput.subfieldStatistics`):
 * - Row key: numeric `ID` aligns with payload/store `subfieldID` (not slice label strings).
 * - `coverage`: backend percent (e.g. 100); may also appear as 0~1 ratio in older mocks.
 * - `signalQualityAvg`: average SINR (dB).
 * - `signalStrengthAvg`: average RSRP (dBm); optional alias `rsrpAvg`.
 * - `dlTptAvg` / `ulTptAvg`: average DL/UL throughput (Mbps in sampled response).
 */

function firstFinite(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Same semantics as RightSidebarComponent.normalizePct: ratio 0~1 → 0~100 display scale;
 * values already in 0~100 stay as-is (field / subfield statistics bloodline).
 */
export function normalizeSubfieldCoverage(raw: unknown): number | null {
  const n = firstFinite(raw);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
}

/**
 * Match `subfieldID` only on stable keys. Legacy rows may use `ID` as a slice label string
 * (e.g. "1.05 公尺"); those do not match unless `subfieldID` is explicitly present.
 */
export function resolveSubfieldStatRow(
  stats: any[] | null | undefined,
  subfieldID: number,
): any | null {
  if (!Array.isArray(stats) || !Number.isFinite(subfieldID)) return null;

  for (const s of stats) {
    const explicit =
      firstFinite(s?.subfieldID) ?? firstFinite(s?.subfieldId);
    if (explicit != null && explicit === subfieldID) {
      return s;
    }
  }

  for (const s of stats) {
    const rawId = s?.ID ?? s?.id;
    if (rawId == null) continue;

    if (typeof rawId === 'number' && Number.isFinite(rawId) && rawId === subfieldID) {
      return s;
    }

    if (typeof rawId === 'string') {
      const t = rawId.trim();
      if (/^\d+$/.test(t) && Number(t) === subfieldID) {
        return s;
      }
    }
  }

  return null;
}

export interface SubfieldMetricsExtracted {
  coverage: number | null;
  avgSinr: number | null;
  avgRsrp: number | null;
  avgDlThroughput: number | null;
  avgUlThroughput: number | null;
}

/**
 * Map one `subfieldStatistics` element to normalized metrics for SubfieldAnalysisVm.
 * Conservative: unknown shapes → null (no guessing across field/UE summaries).
 */
export function extractSubfieldMetricsFromStat(stat: any): SubfieldMetricsExtracted {
  const coverage = normalizeSubfieldCoverage(
    stat?.coverage ?? stat?.coverageRatio,
  );

  const avgSinr = firstFinite(
    stat?.signalQualityAvg,
    stat?.averageSinr,
    stat?.avgSinr,
  );

  const avgRsrp = firstFinite(
    stat?.signalStrengthAvg,
    stat?.averageRsrp,
    stat?.rsrpAvg,
  );

  const avgDlThroughput = firstFinite(
    stat?.dlTptAvg,
    stat?.averageDlThroughput,
    stat?.dlThroughput,
    stat?.dlTpt,
    stat?.dltpt,
  );

  const avgUlThroughput = firstFinite(
    stat?.ulTptAvg,
    stat?.averageUlThroughput,
    stat?.ulThroughput,
    stat?.ulTpt,
    stat?.ultpt,
  );

  return {
    coverage,
    avgSinr,
    avgRsrp,
    avgDlThroughput,
    avgUlThroughput,
  };
}
