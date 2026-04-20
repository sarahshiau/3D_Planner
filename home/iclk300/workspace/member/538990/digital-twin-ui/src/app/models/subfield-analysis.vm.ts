/**
 * View model for Observation Area / Subfield rows in Result Panel (Phase 4-1+).
 * Numeric fields are raw API values where applicable; UI formats units in the sidebar.
 */

/**
 * Observation-area cards are analysis summaries (not evaluationFunc target cards).
 * Phase 4-3: no passed/failed until per-subfield thresholds are specified.
 */
export type SubfieldAnalysisStatus =
  | 'ready'
  | 'empty'
  | 'pending'
  | 'unknown';

export interface SubfieldAnalysisVm {
  subfieldID: number;
  title: string;

  /**
   * Coverage display scale aligned with field analysis normalizePct:
   * 0~100 (percent points); may be filled from backend ratio via normalization in extractor.
   */
  coverage?: number | null;
  avgSinr?: number | null;
  avgRsrp?: number | null;
  avgDlThroughput?: number | null;
  avgUlThroughput?: number | null;

  status?: SubfieldAnalysisStatus;

  /** Derived in Phase 4-3: at least one of the five metrics is finite. */
  hasAnyMetric?: boolean;

  /** True when status is `empty` (no usable stats row or all metrics null after load). */
  isEmpty?: boolean;
}

/** Aggregates for the observation-area section header (Right Sidebar). */
export interface ObservationAreaCountsVm {
  total: number;
  ready: number;
  empty: number;
  pending: number;
  unknown: number;
}
