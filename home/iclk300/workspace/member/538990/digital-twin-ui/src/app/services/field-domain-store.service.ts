/**
 * Field Domain Store Service
 * 
 * Manages the single source of truth for all field domain objects.
 * Provides add, remove, update, and query methods for all field entities.
 * 
 * This service is used by:
 * - Panels to display field data
 * - Scene to render 3D objects
 * - Serializers to transform to API payloads
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  FieldCategory,
  FieldDomainCounts,
  FieldDomainState,
  FieldSeqState,
  EMPTY_FIELD_DOMAIN_STATE,
  EMPTY_FIELD_SEQ_STATE,
  ObstacleFieldRow,
  ExistingBsFieldRow,
  IntelligentPanelFieldRow,
  CandidateBsFieldRow,
  CandidateRisFieldRow,
  UeFieldRow,
  ZoneFieldRow,
  ObserveFieldRow,
  RegionalDivisionFieldRow,
  RegionalDivisionFieldRowPatch,
  RegionalDivisionRowInput,
  SubfieldRow,
  SubfieldRowInput,
  SubfieldRowPatch,
} from '../models/field-domain.model';

@Injectable({
  providedIn: 'root',
})
export class FieldDomainStoreService {
  private readonly stateSubject = new BehaviorSubject<FieldDomainState>({
    ...EMPTY_FIELD_DOMAIN_STATE,
  });

  readonly state$: Observable<FieldDomainState> = this.stateSubject.asObservable();

  private seqState: FieldSeqState = {
    ...EMPTY_FIELD_SEQ_STATE,
  };

  /* ================== Getters ================== */

  /** Current immutable snapshot (includes regionalDivisions, subfields). */
  get snapshot(): FieldDomainState {
    return this.stateSubject.value;
  }

  /* ================== Private Helpers ================== */

  private setState(next: FieldDomainState): void {
    this.stateSubject.next(next);
  }

  private getPrefix(category: FieldCategory): string {
    switch (category) {
      case 'obstacle':
        return 'obs';
      case 'existingBs':
        return 'bs';
      case 'intelligentPanel':
        return 'ris';
      case 'candidateBs':
        return 'cbs';
      case 'candidateRis':
        return 'cris';
      case 'ue':
        return 'ue';
      case 'zone':
        return 'zone';
      case 'observe':
        return 'obv';
      default:
        const _exhaustive: never = category;
        return _exhaustive;
    }
  }

  private takeNextSeq(category: FieldCategory): number {
    const current = this.seqState[category];
    this.seqState[category] += 1;
    return current;
  }

  private takeNextRegionalDivisionNumericId(): number {
    const current = this.seqState.regionalDivision;
    this.seqState.regionalDivision += 1;
    return current;
  }

  private takeNextSubfieldNumericId(): number {
    const current = this.seqState.subfield;
    this.seqState.subfield += 1;
    return current;
  }

  private removeById<T extends { id: string }>(list: T[], rowId: string): T[] {
    return list.filter(item => item.id !== rowId);
  }

  // ===== PATCH 5-pre =====
  // Generic immutable row updater
  private updateRowById<T extends { id: string }>(
    rows: T[],
    id: string,
    patch: Partial<T>,
  ): T[] {
    return rows.map((row) =>
      row.id === id ? { ...row, ...patch } : row
    );
  }

  /* ================== Add Methods ================== */

  addObstacle(
    data: Omit<ObstacleFieldRow, 'id' | 'seq' | 'category'>
  ): ObstacleFieldRow {
    const seq = this.takeNextSeq('obstacle');
    const id = `obs_${seq}`;

    const newRow: ObstacleFieldRow = {
      id,
      seq,
      category: 'obstacle',
      ...data,
    };

    const next = {
      ...this.snapshot,
      obstacles: [...this.snapshot.obstacles, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addExistingBs(
    data: Omit<ExistingBsFieldRow, 'id' | 'seq' | 'category'>
  ): ExistingBsFieldRow {
    const seq = this.takeNextSeq('existingBs');
    const id = `bs_${seq}`;

    const newRow: ExistingBsFieldRow = {
      id,
      seq,
      category: 'existingBs',
      ...data,
    };

    const next = {
      ...this.snapshot,
      existingBs: [...this.snapshot.existingBs, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addIntelligentPanel(
    data: Omit<IntelligentPanelFieldRow, 'id' | 'seq' | 'category'>
  ): IntelligentPanelFieldRow {
    const seq = this.takeNextSeq('intelligentPanel');
    const id = `ris_${seq}`;

    const newRow: IntelligentPanelFieldRow = {
      id,
      seq,
      category: 'intelligentPanel',
      ...data,
    };

    const next = {
      ...this.snapshot,
      intelligentPanels: [...this.snapshot.intelligentPanels, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addCandidateBs(
    data: Omit<CandidateBsFieldRow, 'id' | 'seq' | 'category'>
  ): CandidateBsFieldRow {
    const seq = this.takeNextSeq('candidateBs');
    const id = `cbs_${seq}`;

    const newRow: CandidateBsFieldRow = {
      id,
      seq,
      category: 'candidateBs',
      ...data,
    };

    const next = {
      ...this.snapshot,
      candidateBs: [...this.snapshot.candidateBs, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addCandidateRis(
    data: Omit<CandidateRisFieldRow, 'id' | 'seq' | 'category'>
  ): CandidateRisFieldRow {
    const seq = this.takeNextSeq('candidateRis');
    const id = `cris_${seq}`;

    const newRow: CandidateRisFieldRow = {
      id,
      seq,
      category: 'candidateRis',
      ...data,
    };

    const next = {
      ...this.snapshot,
      candidateRis: [...this.snapshot.candidateRis, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addUe(
    data: Omit<UeFieldRow, 'id' | 'seq' | 'category'>
  ): UeFieldRow {
    const seq = this.takeNextSeq('ue');
    const id = `ue_${seq}`;

    const newRow: UeFieldRow = {
      id,
      seq,
      category: 'ue',
      ...data,
    };

    const next = {
      ...this.snapshot,
      ueList: [...this.snapshot.ueList, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addZone(
    data: Omit<ZoneFieldRow, 'id' | 'seq' | 'category'>
  ): ZoneFieldRow {
    const seq = this.takeNextSeq('zone');
    const id = `zone_${seq}`;

    const newRow: ZoneFieldRow = {
      id,
      seq,
      category: 'zone',
      ...data,
    };

    const next = {
      ...this.snapshot,
      zones: [...this.snapshot.zones, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addObserve(
    data: Omit<ObserveFieldRow, 'id' | 'seq' | 'category'>
  ): ObserveFieldRow {
    const seq = this.takeNextSeq('observe');
    const id = `obv_${seq}`;

    const newRow: ObserveFieldRow = {
      id,
      seq,
      category: 'observe',
      ...data,
    };

    const next = {
      ...this.snapshot,
      observes: [...this.snapshot.observes, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addRegionalDivision(data: RegionalDivisionRowInput): RegionalDivisionFieldRow {
    const regionID = this.takeNextRegionalDivisionNumericId();
    const id = `rdiv_${regionID}`;

    const newRow: RegionalDivisionFieldRow = {
      id,
      regionID,
      ...data,
    };

    const next = {
      ...this.snapshot,
      regionalDivisions: [...this.snapshot.regionalDivisions, newRow],
    };

    this.setState(next);
    return newRow;
  }

  addSubfield(data: SubfieldRowInput): SubfieldRow {
    console.log('[SUBFIELD_ADD_SERVICE_ENTER][v1]', {
      currentSubfields: this.snapshot?.subfields ?? [],
    });
    const subfieldID = this.takeNextSubfieldNumericId();
    const id = `subf_${subfieldID}`;

    const newRow: SubfieldRow = {
      id,
      subfieldID,
      ...data,
    };

    const next = {
      ...this.snapshot,
      subfields: [...this.snapshot.subfields, newRow],
    };

    this.setState(next);
    console.log('[SUBFIELD_ADD_SERVICE_DONE][v1]', {
      nextSubfields: this.snapshot?.subfields ?? [],
    });
    console.log('[SUBFIELD_STORE_WRITE]', this, this.snapshot.subfields);
    return newRow;
  }

  /* ================== Remove Methods ================== */

  removeObstacle(rowId: string): void {
    const next = {
      ...this.snapshot,
      obstacles: this.removeById(this.snapshot.obstacles, rowId),
    };
    this.setState(next);
  }

  removeExistingBs(rowId: string): void {
    const next = {
      ...this.snapshot,
      existingBs: this.removeById(this.snapshot.existingBs, rowId),
    };
    this.setState(next);
  }

  removeIntelligentPanel(rowId: string): void {
    const next = {
      ...this.snapshot,
      intelligentPanels: this.removeById(this.snapshot.intelligentPanels, rowId),
    };
    this.setState(next);
  }

  removeCandidateBs(rowId: string): void {
    const next = {
      ...this.snapshot,
      candidateBs: this.removeById(this.snapshot.candidateBs, rowId),
    };
    this.setState(next);
  }

  removeCandidateRis(rowId: string): void {
    const next = {
      ...this.snapshot,
      candidateRis: this.removeById(this.snapshot.candidateRis, rowId),
    };
    this.setState(next);
  }

  removeUe(rowId: string): void {
    const next = {
      ...this.snapshot,
      ueList: this.removeById(this.snapshot.ueList, rowId),
    };
    this.setState(next);
  }

  removeZone(rowId: string): void {
    const next = {
      ...this.snapshot,
      zones: this.removeById(this.snapshot.zones, rowId),
    };
    this.setState(next);
  }

  removeObserve(rowId: string): void {
    const next = {
      ...this.snapshot,
      observes: this.removeById(this.snapshot.observes, rowId),
    };
    this.setState(next);
  }

  removeRegionalDivision(rowId: string): void {
    const next = {
      ...this.snapshot,
      regionalDivisions: this.removeById(this.snapshot.regionalDivisions, rowId),
    };
    this.setState(next);
  }

  removeSubfield(rowId: string): void {
    const next = {
      ...this.snapshot,
      subfields: this.removeById(this.snapshot.subfields, rowId),
    };
    this.setState(next);
  }

  /* ================== Update Methods ================== */

  updateObstacle(id: string, patch: Partial<ObstacleFieldRow>): void {
    const next = this.updateRowById(this.snapshot.obstacles, id, patch);

    this.setState({
      ...this.snapshot,
      obstacles: next,
    });
  }

  updateZone(id: string, patch: Partial<ZoneFieldRow>): void {
    const next = this.updateRowById(this.snapshot.zones, id, patch);

    this.setState({
      ...this.snapshot,
      zones: next,
    });
  }

  updateObserve(id: string, patch: Partial<ObserveFieldRow>): void {
    const next = this.updateRowById(this.snapshot.observes, id, patch);

    this.setState({
      ...this.snapshot,
      observes: next,
    });
  }

  updateExistingBs(id: string, patch: Partial<ExistingBsFieldRow>): void {
    const next = this.updateRowById(this.snapshot.existingBs, id, patch);

    this.setState({
      ...this.snapshot,
      existingBs: next,
    });
  }

  updateIntelligentPanel(id: string, patch: Partial<IntelligentPanelFieldRow>): void {
    const next = this.updateRowById(this.snapshot.intelligentPanels, id, patch);

    this.setState({
      ...this.snapshot,
      intelligentPanels: next,
    });
  }

  updateCandidateBs(id: string, patch: Partial<CandidateBsFieldRow>): void {
    const next = this.updateRowById(this.snapshot.candidateBs, id, patch);

    this.setState({
      ...this.snapshot,
      candidateBs: next,
    });
  }

  updateCandidateRis(id: string, patch: Partial<CandidateRisFieldRow>): void {
    const next = this.updateRowById(this.snapshot.candidateRis, id, patch);

    this.setState({
      ...this.snapshot,
      candidateRis: next,
    });
  }

  updateUe(id: string, patch: Partial<UeFieldRow>): void {
    const next = this.updateRowById(this.snapshot.ueList, id, patch);

    this.setState({
      ...this.snapshot,
      ueList: next,
    });
  }

  updateRegionalDivision(id: string, patch: RegionalDivisionFieldRowPatch): void {
    const next = this.snapshot.regionalDivisions.map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    );

    this.setState({
      ...this.snapshot,
      regionalDivisions: next,
    });
  }

  updateSubfield(id: string, patch: SubfieldRowPatch): void {
    const next = this.snapshot.subfields.map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    );

    this.setState({
      ...this.snapshot,
      subfields: next,
    });
  }

  updateExistingBsRxGain(rowId: string, rxGain: number): void {
    const next = {
      ...this.snapshot,
      existingBs: this.snapshot.existingBs.map(row =>
        row.id === rowId ? { ...row, rxGain } : row
      ),
    };
    this.setState(next);
  }

  updateIntelligentPanelRxGain(rowId: string, rxGain: number): void {
    const next = {
      ...this.snapshot,
      intelligentPanels: this.snapshot.intelligentPanels.map(row =>
        row.id === rowId ? { ...row, rxGain } : row
      ),
    };
    this.setState(next);
  }

  updateUeRxGain(rowId: string, rxGain: number): void {
    const next = {
      ...this.snapshot,
      ueList: this.snapshot.ueList.map(row =>
        row.id === rowId ? { ...row, rxGain } : row
      ),
    };
    this.setState(next);
  }

  /* ================== Query Methods ================== */

  getCounts(state: FieldDomainState = this.snapshot): FieldDomainCounts {
    return {
      obstacle: state.obstacles.length,
      existingBs: state.existingBs.length,
      intelligentPanel: state.intelligentPanels.length,
      candidateBs: state.candidateBs.length,
      candidateRis: state.candidateRis.length,
      ue: state.ueList.length,
      zone: state.zones.length,
      observe: state.observes.length,
      regionalDivision: state.regionalDivisions.length,
      subfield: state.subfields.length,
    };
  }

  /* ================== Reset & Export ================== */

  reset(): void {
    this.setState({ ...EMPTY_FIELD_DOMAIN_STATE });
    this.seqState = { ...EMPTY_FIELD_SEQ_STATE };
  }

  exportState(): FieldDomainState {
    return this.snapshot;
  }
}

export type {
  FieldDomainCounts,
  FieldDomainState,
  FieldDomainStoreSnapshot,
  FieldSeqState,
  RegionalDivisionFieldRow,
  RegionalDivisionFieldRowPatch,
  RegionalDivisionRowInput,
  SubfieldRow,
  SubfieldRowInput,
  SubfieldRowPatch,
} from '../models/field-domain.model';
