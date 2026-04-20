import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

type Op = '>=' | '>' | '<=' | '<' | '=';

export interface OverallStrengthRow {
  areaPct: number;        // 目標面積比 (%)
  op: Op;                 // 條件
  strengthDbm: number;    // 訊號強度 (dBm)
}

export interface OverallStrengthDialogData {
  rows?: OverallStrengthRow[];
}

@Component({
  selector: 'app-overall-strength-target-dialog',
  templateUrl: './overall-strength-target-dialog.component.html',
  styleUrls: ['./overall-strength-target-dialog.component.scss'],
})
export class OverallStrengthTargetDialogComponent {
  private dialogRef = inject<MatDialogRef<OverallStrengthTargetDialogComponent>>(MatDialogRef);
  public data = inject<OverallStrengthDialogData>(MAT_DIALOG_DATA);

  opOptions: Op[] = ['>=', '>', '<=', '<', '='];

  rows = new FormArray<FormGroup>([]);

  constructor() {
    console.log('[OverallStrengthDialog] open data =', this.data);

    const initRows: OverallStrengthRow[] =
      this.data?.rows?.length
        ? this.data.rows
        : [{ areaPct: 95, op: '>=' as const, strengthDbm: -110 }];

    initRows.forEach(r => this.rows.push(this.createRow(r)));
  }

  private createRow(r?: Partial<OverallStrengthRow>): FormGroup {
    return new FormGroup({
      areaPct: new FormControl<number>(r?.areaPct ?? 95, { nonNullable: true }),
      op: new FormControl<Op>((r?.op ?? '>=' as const), { nonNullable: true }),
      strengthDbm: new FormControl<number>(r?.strengthDbm ?? -110, { nonNullable: true }),
    });
  }

  onAdd(): void {
    this.rows.push(this.createRow());
    console.log('[OverallStrengthDialog] add row length =', this.rows.length);
  }

  onRemove(i: number): void {
    this.rows.removeAt(i);
    console.log('[OverallStrengthDialog] remove row', i, 'length =', this.rows.length);
  }

  onCancel(): void {
    console.log('[OverallStrengthDialog] cancel');
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    const payload = this.rows.getRawValue() as OverallStrengthRow[];
    console.log('[OverallStrengthDialog] confirm payload =', payload);
    this.dialogRef.close(payload);
  }
}
