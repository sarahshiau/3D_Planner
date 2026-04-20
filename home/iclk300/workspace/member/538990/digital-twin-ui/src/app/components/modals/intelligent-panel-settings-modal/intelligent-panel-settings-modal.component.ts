import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';

export interface IntelligentPanelSettingsRowLike {
  id: string;
  seq?: number;

  risId?: number | null;
  risID?: number | null;
  profileId?: number | null;
  profileID?: number | null;

  installHorizontalAngle?: number;
  installVerticalAngle?: number;
  insHorizontal?: number;
  insVertical?: number;
}

export interface RisSelectOption {
  value: number;
  label: string;
  frequency: number[];
  manufacturer: string;
  material: string;
  elementNumber: number[];
  risEnergy: number;
  risCost: number;
}

export interface RisProfileSelectOption {
  value: number;
  label: string;
  incHorizontal: number[];
  incVertical: number[];
  refHorizontal: number;
  refVertical: number;
  refCoefficient: number;
}

export interface IntelligentPanelSettingsConfirmPayload {
  rowId: string;
  risId: number | null;
  profileId: number | null;
  installHorizontalAngle: number;
  installVerticalAngle: number;
}

@Component({
  selector: 'app-intelligent-panel-settings-modal',
  templateUrl: './intelligent-panel-settings-modal.component.html',
  styleUrls: ['./intelligent-panel-settings-modal.component.scss'],
})
export class IntelligentPanelSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() row: IntelligentPanelSettingsRowLike | null = null;
  @Input() zIndexBase = 4200;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<IntelligentPanelSettingsConfirmPayload>();

  form: FormGroup;

  risOptions: RisSelectOption[] = [];
  profileOptions: RisProfileSelectOption[] = [];
  loadingRisOptions = false;
  loadingProfileOptions = false;

  selectedRisFrequencyText = '';
  selectedRisManufacturer = '';
  selectedRisMaterial = '';
  selectedRisElementNumberText = '';
  selectedRisEnergy: number | null = null;
  selectedRisCost: number | null = null;

  selectedProfileIncHorizontalText = '';
  selectedProfileIncVerticalText = '';
  selectedProfileRefHorizontal: number | null = null;
  selectedProfileRefVertical: number | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly authService: AuthService,
  ) {
    this.form = this.fb.group({
      risId: [null, [Validators.required]],
      profileId: [null, [Validators.required]],
      installHorizontalAngle: [0, [Validators.required]],
      installVerticalAngle: [0, [Validators.required]],
    });

    this.form.get('risId')?.valueChanges.subscribe((risId: number | null) => {
      this.applySelectedRis(risId);
      this.form.patchValue(
        { profileId: null },
        { emitEvent: false },
      );
      if (risId != null) {
        this.loadProfileOptions(risId);
      } else {
        this.profileOptions = [];
        this.clearProfileSelection();
      }
    });

    this.form.get('profileId')?.valueChanges.subscribe((profileId: number | null) => {
      this.applySelectedProfile(profileId);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['row']) && this.visible && this.row) {
      this.patchFormFromRow(this.row);
    }

    if (changes['visible'] && this.visible && this.risOptions.length === 0) {
      this.loadRisOptions();
    }
  }

  get title(): string {
    const seq = this.row?.seq;
    return seq != null ? `智慧反射面板【No.${seq}】參數設定` : '智慧反射面板參數設定';
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    if (!this.row || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    const payload: IntelligentPanelSettingsConfirmPayload = {
      rowId: this.row.id,
      risId: raw.risId != null ? Number(raw.risId) : null,
      profileId: raw.profileId != null ? Number(raw.profileId) : null,
      installHorizontalAngle: Number(raw.installHorizontalAngle),
      installVerticalAngle: Number(raw.installVerticalAngle),
    };

    console.log('[RIS][ANGLE_MODAL_CONFIRM]', {
      formRawHorizontal: raw.installHorizontalAngle,
      formRawVertical: raw.installVerticalAngle,
      payloadHorizontal: payload.installHorizontalAngle,
      payloadVertical: payload.installVerticalAngle,
    });
    console.log('[RIS][REAL_CONFIRM_ENTRY]', {
      source: 'intelligent-panel-settings-modal:onConfirm',
      payload,
    });
    this.confirm.emit(payload);
  }

  patchFormFromRow(row: IntelligentPanelSettingsRowLike): void {
    this.form.patchValue(
      {
        risId: row.risId ?? row.risID ?? null,
        profileId: row.profileId ?? row.profileID ?? null,
        installHorizontalAngle: row.installHorizontalAngle ?? row.insHorizontal ?? 0,
        installVerticalAngle: row.installVerticalAngle ?? row.insVertical ?? 0,
      },
      { emitEvent: false },
    );

    this.applySelectedRis(this.form.get('risId')?.value ?? null);
    this.applySelectedProfile(this.form.get('profileId')?.value ?? null);

    const risId = this.form.get('risId')?.value;
    if (risId != null) {
      this.loadProfileOptions(risId);
    }
  }

  loadRisOptions(): void {
    this.loadingRisOptions = true;
    const session = this.authService.getSessionInfo();

    this.http
      .get<any[]>(`/son/getRis/${session}`)
      .subscribe({
        next: (rows) => {
          this.risOptions = (rows || []).map((row: any) => ({
            value: Number(row.risID),
            label: row.risName,
            frequency: row.frequency ?? [],
            manufacturer: row.manufacturer ?? row.vendor ?? '',
            material: row.material ?? '',
            elementNumber: row.elementNumber ?? [],
            risEnergy: row.risEnergy ?? null,
            risCost: row.risCost ?? null,
          }));

          this.loadingRisOptions = false;

          const currentRisId = this.form.get('risId')?.value;
          if (currentRisId == null && this.risOptions.length > 0) {
            const first = this.risOptions[0];

            this.form.patchValue(
              { risId: first.value },
              { emitEvent: true },
            );

            return;
          }

          if (currentRisId != null) {
            this.applySelectedRis(currentRisId);
            this.loadProfileOptions(currentRisId);
          }
        },
        error: (err) => {
          console.error('[IntelligentPanelSettingsModal] failed to load RIS options', err);
          this.loadingRisOptions = false;
        },
      });
  }

  loadProfileOptions(risId: number | null): void {
    if (risId == null) {
      this.profileOptions = [];
      this.clearProfileSelection();
      return;
    }

    this.loadingProfileOptions = true;
    const session = this.authService.getSessionInfo();

    this.http
      .get<any[]>(`/son/getRisProfiles/${risId}/${session}`)
      .subscribe({
        next: (rows) => {
          this.profileOptions = (rows || []).map((row: any) => ({
            value: Number(row.profileID),
            label: row.profileName,
            incHorizontal: row.incHorizontal ?? [],
            incVertical: row.incVertical ?? [],
            refHorizontal: row.refHorizontal ?? 0,
            refVertical: row.refVertical ?? 0,
            refCoefficient: row.refCoefficient ?? 0,
          }));

          this.loadingProfileOptions = false;

          const currentProfileId = this.form.get('profileId')?.value;
          if (currentProfileId == null && this.profileOptions.length > 0) {
            const first = this.profileOptions[0];

            this.form.patchValue(
              { profileId: first.value },
              { emitEvent: true },
            );

            return;
          }

          if (currentProfileId != null) {
            this.applySelectedProfile(currentProfileId);
          } else {
            this.clearProfileSelection();
          }
        },
        error: (err) => {
          console.error('[IntelligentPanelSettingsModal] failed to load RIS profiles', err);
          this.loadingProfileOptions = false;
          this.profileOptions = [];
          this.clearProfileSelection();
        },
      });
  }

  applySelectedRis(risId: number | null): void {
    if (risId == null) {
      this.selectedRisFrequencyText = '';
      this.selectedRisManufacturer = '';
      this.selectedRisMaterial = '';
      this.selectedRisElementNumberText = '';
      this.selectedRisEnergy = null;
      this.selectedRisCost = null;
      return;
    }

    const selected = this.risOptions.find((opt) => opt.value === Number(risId));
    if (!selected) {
      return;
    }

    this.selectedRisFrequencyText = (selected.frequency ?? []).join(', ');
    this.selectedRisManufacturer = selected.manufacturer ?? '';
    this.selectedRisMaterial = selected.material ?? '';
    this.selectedRisElementNumberText = (selected.elementNumber ?? []).join(', ');
    this.selectedRisEnergy = selected.risEnergy ?? null;
    this.selectedRisCost = selected.risCost ?? null;
  }

  applySelectedProfile(profileId: number | null): void {
    if (profileId == null) {
      this.clearProfileSelection();
      return;
    }

    const selected = this.profileOptions.find((opt) => opt.value === Number(profileId));
    if (!selected) {
      return;
    }

    this.selectedProfileIncHorizontalText = (selected.incHorizontal ?? []).join(', ');
    this.selectedProfileIncVerticalText = (selected.incVertical ?? []).join(', ');
    this.selectedProfileRefHorizontal = selected.refHorizontal ?? null;
    this.selectedProfileRefVertical = selected.refVertical ?? null;
  }

  private clearProfileSelection(): void {
    this.selectedProfileIncHorizontalText = '';
    this.selectedProfileIncVerticalText = '';
    this.selectedProfileRefHorizontal = null;
    this.selectedProfileRefVertical = null;
  }
}
