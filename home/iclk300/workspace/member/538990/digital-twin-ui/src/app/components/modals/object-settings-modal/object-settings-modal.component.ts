import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { ObstacleMasterService, ObstacleOption } from 'src/app/services/obstacle-master.service';

export interface ObjectSettingsRowLike {
  id: string;
  seq?: number;
  category?: string;

  startHeight?: number;
  /** 與 ObstacleFieldRow.height 一致（唯一高度來源） */
  height?: number;
  width?: number;
  length?: number;
  angle?: number;
  shape?: string;
  color?: string;
  material?: string;

  materialId?: number | null;
  materialName?: string;
  // 材質衰減係數（如由後端/資料來源提供）
  materialDecay?: number | null;
  metadata?: Record<string, unknown>;
  baseHeightM?: number | null;
  meshHeight?: number | null;
  isBuildingObstacle?: boolean;
}

export interface ObjectSettingsConfirmPayload {
  rowId: string;
  startHeight: number;
  /** 對應 ObstacleFieldRow.height（表單 obstacleHeight 控制項的值） */
  height: number;
  width: number;
  length: number;
  angle: number;
  shape: string;
  color: string;

  materialId: number | null;
  materialName: string;
  materialDecay: number | null;
}

type MaterialOption = { value: number; label: string; decay: number };

@Component({
  selector: 'app-object-settings-modal',
  templateUrl: './object-settings-modal.component.html',
  styleUrls: ['./object-settings-modal.component.scss'],
})
export class ObjectSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() row: ObjectSettingsRowLike | null = null;
  @Input() zIndexBase = 4400;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<ObjectSettingsConfirmPayload>();

  form: FormGroup;

  materialOptions: MaterialOption[] = [];
  loadingMaterials = false;
  materialLoadError = '';

  selectedMaterialDecay: number | null = null;
  selectedMaterialName = '';
  isBuildingMode = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly obstacleMasterService: ObstacleMasterService
  ) {
    this.form = this.fb.group({
      startHeight: [0],
      obstacleHeight: [0.8],
      width: [1],
      length: [1],
      angle: [0],
      shape: [''],
      color: ['#73805c'],
      materialId: [null as number | null],
    });
  }

  get title(): string {
    const isLandscape = (this.row?.category ?? '').toLowerCase() === 'landscape';
    return isLandscape ? '景觀物件參數設定' : '基礎物件參數設定';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['row']) && this.visible && this.row) {
      this.isBuildingMode = this.isBuildingObstacle(this.row);
      console.log('[BuildingConsume][ModalInput]', {
        rowId: this.row.id,
        rowIsBuildingObstacle: this.row.isBuildingObstacle === true,
        rowShape: this.row.shape ?? null,
        isBuildingMode: this.isBuildingMode,
      });
      console.log('[DEBUG][ModalInput]', {
        rowId: this.row?.id ?? null,
        shape: this.row?.shape ?? null,
        isBuildingObstacle: this.row?.isBuildingObstacle === true,
        isBuildingMode: this.isBuildingMode,
      });
      this.patchFormFromRow(this.row);
      if (!this.isBuildingMode) {
        this.loadMaterialOptions();
      }
    }
  }

  patchFormFromRow(row: ObjectSettingsRowLike): void {
    this.selectedMaterialDecay = row.materialDecay ?? null;
    this.selectedMaterialName = row.materialName ?? '';

    const heightVal = row.height ?? 0.8;
    const patchedAngleY = row.angle ?? 0;
    const baseHeightM = Number((row.metadata as any)?.baseHeightM ?? row.baseHeightM);
    const meshHeight = Number(row.meshHeight);
    const buildingDraftHeight = Number.isFinite(Number(row.height))
      ? Number(row.height)
      : Number.isFinite(baseHeightM)
        ? baseHeightM
        : Number.isFinite(meshHeight)
          ? meshHeight
          : 15;

    this.form.patchValue(
      {
        startHeight: row.startHeight ?? 0,
        obstacleHeight: this.isBuildingMode ? buildingDraftHeight : heightVal,
        width: row.width ?? 1,
        length: row.length ?? 1,
        angle: patchedAngleY,
        shape: row.shape ?? '',
        color: row.color ?? '#73805c',
        materialId: row.materialId ?? null,
      },
      { emitEvent: false }
    );

    if (this.isBuildingMode) {
      console.log('[BuildingHeight][Init]', {
        rowId: row.id,
        rowHeight: row.height ?? null,
        baseHeightM: Number.isFinite(baseHeightM) ? baseHeightM : null,
        meshHeight: Number.isFinite(meshHeight) ? meshHeight : null,
        draftHeight: buildingDraftHeight,
      });
    }
    console.log('[BuildingConsume][ModalInput]', {
      rowId: row.id,
      rowIsBuildingObstacle: row.isBuildingObstacle === true,
      rowShape: row.shape ?? null,
      isBuildingMode: this.isBuildingMode,
    });
    console.log('[DEBUG][ModalInput]', {
      rowId: row?.id ?? null,
      shape: row?.shape ?? null,
      isBuildingObstacle: row?.isBuildingObstacle === true,
      isBuildingMode: this.isBuildingMode,
    });

    console.log('[ObstacleAngle][ModalInit]', {
      rowId: row.id,
      rowAngle: row.angle ?? 0,
      patchedAngleY,
    });

    console.log('[ObstacleSettings][Patch]', {
      rowHeight: row.height,
      formHeight: this.form.get('obstacleHeight')?.value,
      rowWidth: row.width,
      rowLength: row.length,
      rowAngle: row.angle,
      rowShape: row.shape,
      rowColor: row.color,
    });
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onMaterialChange(materialId: any): void {
    const id = materialId == null ? null : Number(materialId);
    const obstacle = this.obstacleMasterService.getObstacleById(id);

    if (obstacle) {
      this.selectedMaterialDecay = obstacle.decayCoefficient;
      this.selectedMaterialName = obstacle.chineseName || obstacle.name || '';
      return;
    }

    this.selectedMaterialDecay = null;
    this.selectedMaterialName = '';
  }

  onConfirm(): void {
    if (!this.row) return;

    const raw = this.form.getRawValue() as {
      startHeight: unknown;
      obstacleHeight: unknown;
      width: unknown;
      length: unknown;
      angle: unknown;
      shape: unknown;
      color: unknown;
      materialId: number | null;
    };

    const materialId = raw.materialId ?? null;
    const materialName = this.selectedMaterialName;
    const materialDecay = this.selectedMaterialDecay;

    if (this.isBuildingMode) {
      const inputHeight = Number(raw.obstacleHeight);
      const finalHeight = Number.isFinite(inputHeight) ? inputHeight : Number(this.row.height ?? 15);
      console.log('[BuildingHeight][Confirm]', {
        rowId: this.row.id,
        inputHeight,
        finalHeight,
      });

      this.confirm.emit({
        rowId: this.row.id,
        startHeight: Number(this.row.startHeight ?? 0),
        height: finalHeight,
        width: Number(this.row.width ?? 0),
        length: Number(this.row.length ?? 0),
        angle: Number(this.row.angle ?? 0),
        shape: String(this.row.shape ?? 'building'),
        color: String(this.row.color ?? '#73805c'),
        materialId: this.row.materialId ?? null,
        materialName: String(this.row.materialName ?? this.row.material ?? ''),
        materialDecay: this.row.materialDecay ?? null,
      });
      return;
    }

    const angleY = Number(raw.angle);
    const patchAngle = angleY;

    console.log('[ObstacleAngle][ModalConfirm]', {
      rowId: this.row.id,
      angleY,
      patchAngle,
    });

    const payload: ObjectSettingsConfirmPayload = {
      rowId: this.row.id,
      startHeight: Number(raw.startHeight),
      height: Number(raw.obstacleHeight),
      width: Number(raw.width),
      length: Number(raw.length),
      angle: patchAngle,
      shape: String(raw.shape ?? ''),
      color: String(raw.color ?? '#73805c'),

      materialId,
      materialName,
      materialDecay,
    };

    this.confirm.emit(payload);
  }

  private isBuildingObstacle(row: ObjectSettingsRowLike): boolean {
    const meta = (row as any)?.metadata ?? {};
    return (
      row.isBuildingObstacle === true ||
      String(row.shape ?? '').toLowerCase() === 'building' ||
      meta?.osmId != null ||
      meta?.tags?.building != null
    );
  }

  private loadMaterialOptions(): void {
    this.loadingMaterials = true;
    this.materialLoadError = '';

    this.obstacleMasterService.getObstacles().subscribe({
      next: (list) => {
        this.materialOptions = (list ?? []).map((o) => ({
          id: o.id,
          value: o.id,
          name: o.name,
          label: o.chineseName || o.name,
          decayCoefficient: o.decayCoefficient,
          decay: o.decayCoefficient,
          property: o.property,
          chineseName: o.chineseName,
        })) as any;

        this.loadingMaterials = false;

        const currentId = this.form.get('materialId')?.value ?? null;
        const first = (list ?? [])[0] ?? null;

        if ((currentId == null || currentId === '') && first) {
          this.form.patchValue({ materialId: first.id }, { emitEvent: false });
          this.onMaterialChange(first.id);
          return;
        }

        this.onMaterialChange(currentId);
      },
      error: (err) => {
        this.loadingMaterials = false;
        this.materialLoadError = '載入障礙物材質失敗';
        console.error('[ObjectSettings][loadMaterials]', err);
      },
    });
  }
}

