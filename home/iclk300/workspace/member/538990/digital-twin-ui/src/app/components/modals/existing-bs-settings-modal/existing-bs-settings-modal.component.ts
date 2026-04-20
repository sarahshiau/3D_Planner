// [Step3][SettingsModal] Existing BS Settings Modal
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { take } from 'rxjs/operators';
import { AntennaService } from 'src/app/services/antenna.service';

export interface ExistingBsSettingsRowLike {
  id: string;
  seq?: number;

  txPower?: number;
  txPowerUnit?: 'dBm' | 'mW';

  centerFrequency?: number;
  subcarrierSpacing?: number;
  bandwidth?: number;

  ulLayers?: number;
  dlLayers?: number;

  ulModulation?: string;
  dlModulation?: string;

  noiseFigure?: number;

  antennaMode?: 'default' | 'custom';

  antennaId?: number | null;
  antennaName?: string;
  antennaTypeLabel?: string;
  manufacturer?: string;
}

export interface AntennaSelectOption {
  id: number;
  name: string;
  type: string;
  manufacturer: string;
  typeLabel: string;
}

export interface ExistingBsSettingsConfirmPayload {
  rowId: string;

  txPower: number;
  txPowerUnit: 'dBm' | 'mW';

  centerFrequency: number;
  subcarrierSpacing: number;
  bandwidth: number;

  ulLayers: number;
  dlLayers: number;

  ulModulation: string;
  dlModulation: string;

  noiseFigure: number;

  antennaMode: 'default' | 'custom';

  antennaId: number | null;
  antennaName: string;
  antennaTypeLabel: string;
  manufacturer: string;
}

@Component({
  selector: 'app-existing-bs-settings-modal',
  templateUrl: './existing-bs-settings-modal.component.html',
  styleUrls: ['./existing-bs-settings-modal.component.scss'],
})
export class ExistingBsSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() row: ExistingBsSettingsRowLike | null = null;
  @Input() zIndexBase = 4000;

  // 後續接 API 時可由父層餵入，或在 component 內自行 call API
  @Input() antennaOptions: AntennaSelectOption[] = [];
  @Input() loadingAntennaOptions = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<ExistingBsSettingsConfirmPayload>();

  form!: FormGroup;

  readonly subcarrierSpacingOptions = [
    { value: 15, label: '15' },
    { value: 30, label: '30' },
    { value: 60, label: '60' },
  ];

  readonly bandwidthOptions = [
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 15, label: '15' },
    { value: 20, label: '20' },
    { value: 25, label: '25' },
    { value: 30, label: '30' },
    { value: 40, label: '40' },
    { value: 50, label: '50' },
    { value: 60, label: '60' },
    { value: 70, label: '70' },
    { value: 80, label: '80' },
    { value: 90, label: '90' },
    { value: 100, label: '100' },
  ];

  readonly layerOptions = [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
    { value: 6, label: '6' },
    { value: 7, label: '7' },
    { value: 8, label: '8' },
  ];

  readonly modulationOptions = [
    { value: '64QAM-table', label: '64QAM-table' },
    { value: '256QAM-table', label: '256QAM-table' },
  ];

  readonly bandwidthByScs: Record<number, number[]> = {
    15: [5, 10, 15, 20, 25, 30, 40, 50],
    30: [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
    60: [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
  };

  filteredBandwidthOptions: Array<{ value: number; label: string }> = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly antennaService: AntennaService
  ) {
    this.form = this.fb.group({
      txPower: [24, [Validators.required, Validators.min(0)]],
      txPowerUnit: ['dBm', [Validators.required]],

      centerFrequency: [3600, [Validators.required, Validators.min(1)]],
      subcarrierSpacing: [30, [Validators.required]],
      bandwidth: [100, [Validators.required]],

      ulLayers: [1, [Validators.required]],
      dlLayers: [1, [Validators.required]],

      ulModulation: ['64QAM-table', [Validators.required]],
      dlModulation: ['256QAM-table', [Validators.required]],

      noiseFigure: [0, [Validators.required, Validators.min(0)]],

      antennaMode: ['default', [Validators.required]],

      antennaId: [null, [Validators.required]],
      antennaName: [''],
      antennaTypeLabel: [''],
      manufacturer: [''],
    });

    this.form.get('antennaId')?.valueChanges.subscribe((antennaId: number | null) => {
      this.applySelectedAntenna(antennaId);
    });

    this.form.get('subcarrierSpacing')?.valueChanges.subscribe((scs: number | null) => {
      this.updateFilteredBandwidthOptions(scs);
    });

    this.updateFilteredBandwidthOptions(this.form.get('subcarrierSpacing')?.value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['row']) && this.visible && this.row) {
      this.patchFormFromRow(this.row);
    }

    // [Step3][ExistingBsSettingsApi] 當 modal 打開且 antennaOptions 為空時，載入 API
    if (changes['visible'] && this.visible && this.antennaOptions.length === 0) {
      this.loadAntennaOptions();
    }

    if (changes['antennaOptions'] && this.visible) {
      const antennaId = this.form.get('antennaId')?.value ?? null;
      this.applySelectedAntenna(antennaId);
    }
  }

  get title(): string {
    const seq = this.row?.seq ?? '-';
    return `基地站【No.${seq}】參數設定`;
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

    const payload: ExistingBsSettingsConfirmPayload = {
      rowId: this.row.id,

      txPower: Number(raw.txPower),
      txPowerUnit: raw.txPowerUnit,

      centerFrequency: Number(raw.centerFrequency),
      subcarrierSpacing: Number(raw.subcarrierSpacing),
      bandwidth: Number(raw.bandwidth),

      ulLayers: Number(raw.ulLayers),
      dlLayers: Number(raw.dlLayers),

      ulModulation: raw.ulModulation,
      dlModulation: raw.dlModulation,

      noiseFigure: Number(raw.noiseFigure),

      antennaMode: raw.antennaMode,

      antennaId: raw.antennaId != null ? Number(raw.antennaId) : null,
      antennaName: raw.antennaName ?? '',
      antennaTypeLabel: raw.antennaTypeLabel ?? '',
      manufacturer: raw.manufacturer ?? '',
    };

    this.confirm.emit(payload);
  }

  // [Step3][ExistingBsSettingsApi] Load antenna options from API
  private loadAntennaOptions(): void {
    this.loadingAntennaOptions = true;

    this.antennaService
      .getAntennas()
      .pipe(take(1))
      .subscribe({
        next: (rows) => {
          this.antennaOptions = rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            type: row.type,
            manufacturer: row.vendor,
            typeLabel: this.mapAntennaTypeLabel(row.type),
          }));

          console.log('[Step3][ExistingBsSettings] antenna options loaded', this.antennaOptions);

          this.loadingAntennaOptions = false;

          // 若 form 中目前沒有 antennaId，且 options 有資料，預設選第一筆
          const currentAntennaId = this.form.get('antennaId')?.value;
          if ((currentAntennaId == null || currentAntennaId === '') && this.antennaOptions.length > 0) {
            const first = this.antennaOptions[0];
            this.form.patchValue(
              {
                antennaId: first.id,
                antennaName: first.name,
                antennaTypeLabel: first.typeLabel,
                manufacturer: first.manufacturer,
              },
              { emitEvent: false }
            );
          }
        },
        error: (err) => {
          console.error('[Step3][ExistingBsSettings] failed to load antenna options', err);
          this.loadingAntennaOptions = false;
        },
      });
  }

  private mapAntennaTypeLabel(type: string): string {
    const normalized = (type || '').toLowerCase();
    if (normalized === 'omnidirectional') return '全向';
    if (normalized === 'directional') return '指向';
    return type || '-';
  }

  private patchFormFromRow(row: ExistingBsSettingsRowLike): void {
    this.form.patchValue(
      {
        txPower: row.txPower ?? 24,
        txPowerUnit: row.txPowerUnit ?? 'dBm',

        centerFrequency: row.centerFrequency ?? 3600,
        subcarrierSpacing: row.subcarrierSpacing ?? 30,
        bandwidth: row.bandwidth ?? 100,

        ulLayers: row.ulLayers ?? 1,
        dlLayers: row.dlLayers ?? 1,

        ulModulation: row.ulModulation ?? '64QAM-table',
        dlModulation: row.dlModulation ?? '256QAM-table',

        noiseFigure: row.noiseFigure ?? 0,

        antennaMode: row.antennaMode ?? 'default',

        antennaId: row.antennaId ?? null,
        antennaName: row.antennaName ?? '',
        antennaTypeLabel: row.antennaTypeLabel ?? '',
        manufacturer: row.manufacturer ?? '',
      },
      { emitEvent: false }
    );

    this.updateFilteredBandwidthOptions(this.form.get('subcarrierSpacing')?.value);

    this.applySelectedAntenna(this.form.get('antennaId')?.value ?? null);

    const antennaId = this.form.get('antennaId')?.value;
    if ((antennaId == null || antennaId === '') && this.antennaOptions.length > 0) {
      const first = this.antennaOptions[0];
      this.form.patchValue(
        {
          antennaId: first.id,
          antennaName: first.name,
          antennaTypeLabel: first.typeLabel,
          manufacturer: first.manufacturer,
        },
        { emitEvent: false }
      );
    }
  }

  private applySelectedAntenna(antennaId: number | null): void {
    if (antennaId == null) {
      this.form.patchValue(
        {
          antennaName: '',
          antennaTypeLabel: '',
          manufacturer: '',
        },
        { emitEvent: false }
      );
      return;
    }

    const selected = this.antennaOptions.find((item) => item.id === Number(antennaId));
    if (!selected) return;

    this.form.patchValue(
      {
        antennaName: selected.name,
        antennaTypeLabel: selected.typeLabel,
        manufacturer: selected.manufacturer,
      },
      { emitEvent: false }
    );
  }

  private updateFilteredBandwidthOptions(scs: number | null | undefined): void {
    const allowed = this.bandwidthByScs[Number(scs)] ?? [];
    this.filteredBandwidthOptions = allowed.map((v) => ({ value: v, label: String(v) }));

    const currentBw = Number(this.form.get('bandwidth')?.value);
    const isValid = allowed.includes(currentBw);

    if (!isValid && allowed.length > 0) {
      this.form.patchValue(
        { bandwidth: allowed[0] },
        { emitEvent: false }
      );
    }
  }
}
