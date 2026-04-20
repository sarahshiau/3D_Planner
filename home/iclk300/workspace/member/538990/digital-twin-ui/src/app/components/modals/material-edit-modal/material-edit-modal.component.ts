import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MaterialRow, UpdateMaterialPayload } from 'src/app/models/material.model';
import { AlertService } from 'src/app/services/alert.service';

export interface MaterialEditDraft {
  name: string;
  decay: number | null;
}

@Component({
  selector: 'app-material-edit-modal',
  templateUrl: './material-edit-modal.component.html',
  styleUrls: ['./material-edit-modal.component.scss'],
})
export class MaterialEditModalComponent {
  @Input() zIndexBase = 3030;
  @Input() row!: MaterialRow; // 父層必須傳入

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<UpdateMaterialPayload>();

  draft: MaterialEditDraft = {
    name: '',
    decay: 0.1,
  };

  constructor(private alertService: AlertService) {}

  ngOnInit(): void {
    // 由 input row 帶入初始值
    this.draft = {
      name: this.row?.name ?? '',
      decay: this.row?.decay ?? 0,
    };
  }

  onBackdropClick(): void {}

  onClose(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    const target = this.row;
    if (!target) return;

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

    const payload: UpdateMaterialPayload = {
      id: target.id,
      name: this.draft.name.trim(),
      decayCoefficient: Number(this.draft.decay),
      property: 'customized',
    };

    this.confirm.emit(payload);
  }
}
