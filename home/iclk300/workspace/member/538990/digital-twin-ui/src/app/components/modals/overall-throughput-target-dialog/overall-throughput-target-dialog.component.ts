import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

type Op = '>=' | '>' | '<=' | '<' | '=';
type UlDl = 'UL' | 'DL';

export interface OverallThroughputRow {
  areaPct: number;   // 目標面積比 (%)
  ulDl: UlDl;        // UL / DL
  op: Op;            // 條件
  mbps: number;      // 速率 (Mbps)
}

export interface OverallThroughputDialogData {
  rows?: OverallThroughputRow[];
}

@Component({
  selector: 'app-overall-throughput-target-dialog',
  templateUrl: './overall-throughput-target-dialog.component.html',
  styleUrls: ['./overall-throughput-target-dialog.component.scss'],
})
export class OverallThroughputTargetDialogComponent {
  private dialogRef = inject<MatDialogRef<OverallThroughputTargetDialogComponent>>(MatDialogRef);
  public data = inject<OverallThroughputDialogData>(MAT_DIALOG_DATA);

  opOptions: Op[] = ['>=', '>', '<=', '<', '='];
  ulDlOptions: UlDl[] = ['UL', 'DL'];

  rows = new FormArray<FormGroup>([]);

  constructor() {
    console.log('[OverallThroughputDialog] open data =', this.data);

  const initRows =
    this.data?.rows?.length
      ? this.data.rows
      : [
          { areaPct: 95, ulDl: 'UL' as const, op: '>=' as const, mbps: 250 },
          { areaPct: 95, ulDl: 'DL' as const, op: '>=' as const, mbps: 350 },
        ];

  // ✅ 保證至少有 UL + DL 各一列（即使 data 傳進來缺一種）
  const hasUL = initRows.some(r => r.ulDl === 'UL');
  const hasDL = initRows.some(r => r.ulDl === 'DL');

  if (!hasUL) initRows.unshift({ areaPct: 95, ulDl: 'UL' as const, op: '>=' as const, mbps: 250 });
  if (!hasDL) initRows.push({ areaPct: 95, ulDl: 'DL' as const, op: '>=' as const, mbps: 350 });

  initRows.forEach(r => this.rows.push(this.createRow(r)));

  }

  private createRow(r?: Partial<OverallThroughputRow>): FormGroup {
    return new FormGroup({
      areaPct: new FormControl<number>(r?.areaPct ?? 95, { nonNullable: true }),
      ulDl: new FormControl<UlDl>((r?.ulDl ?? 'UL' as const), { nonNullable: true }),
      op: new FormControl<Op>((r?.op ?? '>=' as const), { nonNullable: true }),
      mbps: new FormControl<number>(r?.mbps ?? 250, { nonNullable: true }),
    });
  }

  onAdd(): void {
    this.rows.push(this.createRow());
    console.log('[OverallThroughputDialog] add row length =', this.rows.length);
  }

  onRemove(i: number): void {
    const fg: any = this.rows.at(i);
    const type = fg.controls.ulDl.value as 'UL' | 'DL';

    // 防呆：不允許刪除最後一列 UL 或 DL
    if (this.countByUlDl(type) <= 1) {
      console.log('[OverallThroughputDialog] prevent remove last', type);
      return;
    }

    this.rows.removeAt(i);
    console.log('[OverallThroughputDialog] remove row', i, 'length =', this.rows.length);

    // 刪除後若某一種缺了，補回一列（確保固定 UL/DL 兩列存在）
    if (this.countByUlDl('UL') === 0) {
      this.rows.insert(0, this.createRow({ areaPct: 95, ulDl: 'UL', op: '>=', mbps: 250 }));
      console.log('[OverallThroughputDialog] auto add UL row');
    }
    if (this.countByUlDl('DL') === 0) {
      this.rows.push(this.createRow({ areaPct: 95, ulDl: 'DL', op: '>=', mbps: 350 }));
      console.log('[OverallThroughputDialog] auto add DL row');
    }
  }

  onCancel(): void {
    console.log('[OverallThroughputDialog] cancel');
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    const payload = this.rows.getRawValue() as OverallThroughputRow[];
    console.log('[OverallThroughputDialog] confirm payload =', payload);
    this.dialogRef.close(payload);
  }

  private countByUlDl(type: 'UL' | 'DL'): number {
  return this.rows.controls.filter((fg: any) => fg.controls.ulDl.value === type).length;
}

isRemoveDisabled(i: number): boolean {
  const fg: any = this.rows.at(i);
  const type = fg.controls.ulDl.value as 'UL' | 'DL';

  // 固定 UL/DL 兩列：不允許刪除該 type 的最後一列
  return this.countByUlDl(type) <= 1;
}

}
