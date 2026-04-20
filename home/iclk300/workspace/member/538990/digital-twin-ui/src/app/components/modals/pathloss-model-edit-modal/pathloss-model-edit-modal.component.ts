import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PathLossModelRow, UpdatePathLossModelPayload } from '../../../models/pathloss-model.model';

export interface PathlossEditDraft {
  name: string;
  chineseName: string;
  distancePowerLoss: string;
  fieldLoss: string;
  fileName?: string;
  file?: File | null;
}

@Component({
  selector: 'app-pathloss-model-edit-modal',
  templateUrl: './pathloss-model-edit-modal.component.html',
  styleUrls: ['./pathloss-model-edit-modal.component.scss'],
})
export class PathlossModelEditModalComponent {
  @Input() zIndexBase = 3030;
  @Input() row!: PathLossModelRow;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<UpdatePathLossModelPayload>();

  draft: PathlossEditDraft = {
    name: '',
    chineseName: '',
    distancePowerLoss: '',
    fieldLoss: '',
    fileName: '',
    file: null,
  };

  // 顯示用
  selectedFileName = '';
  private selectedFile: File | null = null;

  constructor() {}

  ngOnInit(): void {
    this.draft = {
      name: this.row?.name ?? '',
      chineseName: this.row?.chineseName ?? '',
      distancePowerLoss: String(this.row?.distancePowerLoss ?? ''),
      fieldLoss: String(this.row?.fieldLoss ?? ''),
      fileName: '',
      file: null,
    };

    this.selectedFileName = '';
  }

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  downloadTemplate(): void {
    const url = 'assets/templates/ITRI_pathlossmodel_template.xlsx';

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ITRI_pathlossmodel_template.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  onFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    const ok = !!file && /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      this.selectedFile = null;
      this.selectedFileName = '';
      input.value = '';
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
  }

  onConfirm(): void {
    const payload: UpdatePathLossModelPayload = {
      id: this.row.id,
      name: this.draft.name ?? this.row.name,
      chineseName: this.draft.chineseName ?? this.row.chineseName,
      distancePowerLoss: Number(this.draft.distancePowerLoss ?? this.row.distancePowerLoss),
      fieldLoss: Number(this.draft.fieldLoss ?? this.row.fieldLoss),
      property: this.row.property,
    };
    this.confirm.emit(payload);
  }
}
