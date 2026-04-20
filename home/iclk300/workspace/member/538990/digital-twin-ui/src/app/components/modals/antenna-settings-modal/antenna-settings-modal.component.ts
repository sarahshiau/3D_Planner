import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

export interface AntennaSettingsRowLike {
  id: string;
  seq?: number;

  antennaInstallation?: 'custom' | 'ceiling' | 'wall';
  antennaTheta?: number;
  antennaPhi?: number;
  antennaGain?: number;
}

export interface AntennaSettingsConfirmPayload {
  rowId: string;
  installation: 'custom' | 'ceiling' | 'wall';
  theta: number;
  phi: number;
  gain: number;
}

@Component({
  selector: 'app-antenna-settings-modal',
  templateUrl: './antenna-settings-modal.component.html',
  styleUrls: ['./antenna-settings-modal.component.scss'],
})
export class AntennaSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() row: AntennaSettingsRowLike | null = null;
  @Input() zIndexBase = 4100;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<AntennaSettingsConfirmPayload>();

  form: FormGroup;

  readonly installationOptions: Array<{ value: 'custom' | 'ceiling' | 'wall'; label: string }> = [
    { value: 'custom', label: '自訂' },
    { value: 'ceiling', label: '吸頂' },
    { value: 'wall', label: '壁掛' },
  ];

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      installation: ['custom', [Validators.required]],
      theta: [0, [Validators.required]],
      phi: [0, [Validators.required]],
      gain: [0, [Validators.required]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['row']) && this.visible && this.row) {
      this.patchFormFromRow(this.row);
    }
  }

  get title(): string {
    const seq = this.row?.seq;
    return seq != null ? `天線【No.${seq}】參數設定` : '天線參數設定';
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    if (this.form.invalid || !this.row) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    const payload: AntennaSettingsConfirmPayload = {
      rowId: this.row.id,
      installation: raw.installation,
      theta: Number(raw.theta),
      phi: Number(raw.phi),
      gain: Number(raw.gain),
    };

    this.confirm.emit(payload);
  }

  patchFormFromRow(row: AntennaSettingsRowLike): void {
    this.form.patchValue(
      {
        installation: row.antennaInstallation ?? 'custom',
        theta: row.antennaTheta ?? 0,
        phi: row.antennaPhi ?? 0,
        gain: row.antennaGain ?? 0,
      },
      { emitEvent: false }
    );
  }
}

