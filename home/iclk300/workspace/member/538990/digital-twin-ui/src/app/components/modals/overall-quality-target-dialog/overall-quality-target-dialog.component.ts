import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

type Op = '>=' | '>' | '<=' | '<' | '=';

export interface OverallQualityRow {
  areaPct: number;     // 目標面積比 (%)
  op: Op;              // 條件
  qualityDb: number;   // 訊號品質 (dB)
}

export interface OverallQualityDialogData {
  rows?: OverallQualityRow[];
}

@Component({
  selector: 'app-overall-quality-target-dialog',
  templateUrl: './overall-quality-target-dialog.component.html',
  styleUrls: ['./overall-quality-target-dialog.component.scss'],
})
export class OverallQualityTargetDialogComponent {
  private dialogRef = inject<MatDialogRef<OverallQualityTargetDialogComponent>>(MatDialogRef);
  public data = inject<OverallQualityDialogData>(MAT_DIALOG_DATA);

  opOptions: Op[] = ['>=', '>', '<=', '<', '='];

  rows = new FormArray<FormGroup>([]);

  constructor() {
    console.log('[OverallQualityDialog] open data =', this.data);

    const initRows: OverallQualityRow[] =
      this.data?.rows?.length
        ? this.data.rows
        : [{ areaPct: 95, op: '>=' as const, qualityDb: 15 }];

    initRows.forEach(r => this.rows.push(this.createRow(r)));
  }

  private createRow(r?: Partial<OverallQualityRow>): FormGroup {
    return new FormGroup({
      areaPct: new FormControl<number>(r?.areaPct ?? 95, { nonNullable: true }),
      op: new FormControl<Op>((r?.op ?? '>=' as const), { nonNullable: true }),
      qualityDb: new FormControl<number>(r?.qualityDb ?? 15, { nonNullable: true }),
    });
  }

  onAdd(): void {
    this.rows.push(this.createRow());
    console.log('[OverallQualityDialog] add row length =', this.rows.length);
  }

  onRemove(i: number): void {
    this.rows.removeAt(i);
    console.log('[OverallQualityDialog] remove row', i, 'length =', this.rows.length);
  }

  onCancel(): void {
    console.log('[OverallQualityDialog] cancel');
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    const payload = this.rows.getRawValue() as OverallQualityRow[];
    console.log('[OverallQualityDialog] confirm payload =', payload);
    this.dialogRef.close(payload);
  }
}
