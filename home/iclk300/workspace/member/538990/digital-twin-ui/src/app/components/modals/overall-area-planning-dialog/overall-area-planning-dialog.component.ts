import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-overall-area-planning-dialog',
  templateUrl: './overall-area-planning-dialog.component.html',
  styleUrls: ['./overall-area-planning-dialog.component.scss'],
})
export class OverallAreaPlanningDialogComponent {
  private dialogRef = inject<MatDialogRef<OverallAreaPlanningDialogComponent>>(MatDialogRef);
  public data = inject<{ coveragePct?: number }>(MAT_DIALOG_DATA);

  coveragePct: number = 95;

  constructor() {
    console.log('[OverallAreaPlanningDialog] open data =', this.data);

    if (typeof this.data?.coveragePct === 'number') {
      this.coveragePct = this.data.coveragePct;
    }
  }

  onCancel(): void {
    console.log('[OverallAreaPlanningDialog] cancel');
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    const payload = { coveragePct: this.coveragePct };
    console.log('[OverallAreaPlanningDialog] confirm payload =', payload);
    this.dialogRef.close(payload);
  }
}
