import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { UeFieldRow } from 'src/app/models/field-domain.model';

/** Aligns with intelligent-panel-settings-modal / RIS-style confirm payload. */
export interface UeSettingsConfirmPayload {
  rowId: string;
  rxGain: number | null;
}

@Component({
  selector: 'app-ue-settings-modal',
  templateUrl: './ue-settings-modal.component.html',
  styleUrls: ['./ue-settings-modal.component.scss'],
})
export class UeSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() row: UeFieldRow | null = null;
  @Input() zIndexBase = 4200;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<UeSettingsConfirmPayload>();

  rxGainInput = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['row'] || changes['visible']) {
      if (this.visible && this.row) {
        const g = this.row.rxGain;
        this.rxGainInput =
          g !== undefined && g !== null && !Number.isNaN(g) ? String(g) : '';
      }
    }
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    if (!this.row) {
      return;
    }
    const raw = this.rxGainInput.trim();
    let rxGain: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      rxGain = Number.isFinite(n) ? n : null;
    }
    this.confirm.emit({ rowId: this.row.id, rxGain });
  }
}
