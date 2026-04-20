import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AddMaterialPayload } from 'src/app/models/material.model';
import { AlertService } from 'src/app/services/alert.service';

export interface MaterialAddDraft {
  name: string;
  decay: number | null;
}

@Component({
  selector: 'app-material-add-modal',
  templateUrl: './material-add-modal.component.html',
  styleUrls: ['./material-add-modal.component.scss'],
})
export class MaterialAddModalComponent {
  @Input() zIndexBase = 3020;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<AddMaterialPayload>();

  draft: MaterialAddDraft = {
    name: '',
    decay: 0.1,
  };

  constructor(private alertService: AlertService) {}

  ngOnInit(): void {}

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    const name = (this.draft.name ?? '').trim();
    const decayNum = Number(this.draft.decay);

    if (!name) {
      this.alertService.info('請輸入材質名稱');
      return;
    }
    if (!Number.isFinite(decayNum)) {
      this.alertService.info('材質衰減係數格式不正確');
      return;
    }

    const payload: AddMaterialPayload = {
      name: this.draft.name.trim(),
      decayCoefficient: Number(this.draft.decay),
      property: 'customized',
    };

    this.confirm.emit(payload);
  }
}
