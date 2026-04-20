import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { take } from 'rxjs/operators';
import {
  PathLossModelService,
  PathlossApiDto,
} from 'src/app/services/pathloss-model.service';

type PathLossModel = Pick<
  PathlossApiDto,
  'id' | 'chineseName' | 'distancePowerLoss' | 'fieldLoss'
>;

export interface ZonePathlossRowLike {
  id: string;
  seq?: number;
  pathLossModelId?: number | null;
  pathLossModelName?: string;
  pathLossFormula?: string;
}

export interface ZonePathlossConfirmPayload {
  rowId: string;
  pathLossModelId: number | null;
}

@Component({
  selector: 'app-zone-pathloss-settings-modal',
  templateUrl: './zone-pathloss-settings-modal.component.html',
  styleUrls: ['./zone-pathloss-settings-modal.component.scss'],
})
export class ZonePathlossSettingsModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() rows: ZonePathlossRowLike[] = [];
  @Input() defaultPathLossModelId: number | null = null;
  @Input() zIndexBase = 4300;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<ZonePathlossConfirmPayload[]>();

  models: PathLossModel[] = [];
  selectedModel: PathLossModel | null = null;
  isLoadingModels = false;
  modelLoadError = '';
  formRows: Array<{
    rowId: string;
    seq?: number;
    model: PathLossModel | null;
    modelId: number | null;
    modelName: string;
  }> = [];

  constructor(private readonly pathlossModelService: PathLossModelService) {}

  private getModelById(modelId: number | null): PathLossModel | null {
    if (modelId == null) return null;
    return this.models.find((m) => m.id === modelId) ?? null;
  }

  buildPathLossFormula(model: PathLossModel | null): string {
    if (!model) return '—';
    return `L_total = 20 log10 f + ${model.distancePowerLoss} log10 d + (${model.fieldLoss}) - 28`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      const parsedDefaultModelId = Number(this.defaultPathLossModelId);
      const fallbackModelId = Number.isFinite(parsedDefaultModelId)
        ? parsedDefaultModelId
        : null;

      // 先把 rows 複製到表單狀態（modelName/formula 待 API 回傳後依 modelId 回填）
      const rowsToProcess = [...(this.rows ?? [])];
      
      // 若無 rows，建立預留位置行 (placeholder) 以便顯示下拉選單及公式
      if (rowsToProcess.length === 0) {
        rowsToProcess.push({
          id: '__placeholder__',
          seq: 1,
          pathLossModelId: fallbackModelId,
          pathLossModelName: '',
        } as ZonePathlossRowLike);
      }

      this.formRows = rowsToProcess.map((row) => {
        const parsedRowModelId = Number(row.pathLossModelId);
        const rowModelId = Number.isFinite(parsedRowModelId) ? parsedRowModelId : null;

        return {
          rowId: row.id,
          seq: row.seq,
          model: null,
          modelId: rowModelId ?? fallbackModelId,
          modelName: row.pathLossModelName ?? '',
        };
      });

      this.isLoadingModels = true;
      this.modelLoadError = '';

      this.pathlossModelService
        .getPathLossModels()
        .pipe(take(1))
        .subscribe({
          next: (models) => {
            this.models = (models ?? []).map((m) => ({
              id: Number(m.id ?? 0),
              chineseName: String(m.chineseName ?? ''),
              distancePowerLoss: Number(m.distancePowerLoss ?? 0),
              fieldLoss: Number(m.fieldLoss ?? 0),
            }));
            this.isLoadingModels = false;
            this.selectedModel = null;
            const firstModel = this.models[0] ?? null;

            // 預選：先用 row.pathLossModelId；若無對應，預設使用下拉第一個模型
            this.formRows.forEach((row) => {
              const model = this.getModelById(row.modelId) ?? firstModel;
              row.model = model;
              row.modelId = model?.id ?? null;
              row.modelName = model?.chineseName ?? '';
            });

            this.selectedModel = this.formRows.find((row) => !!row.model)?.model ?? firstModel;
          },
          error: (err) => {
            this.isLoadingModels = false;
            this.models = [];
            this.selectedModel = null;
            this.modelLoadError = '載入衰減模型失敗';
            this.formRows.forEach((row) => {
              row.model = null;
            });
            console.error('[ZonePathLossSettingsModal] failed to load models', err);
          },
        });
    }
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onConfirm(): void {
    const payload: ZonePathlossConfirmPayload[] = this.formRows.map((row) => {
      return {
        rowId: row.rowId,
        pathLossModelId: row.model?.id ?? null,
      };
    });

    this.confirm.emit(payload);
  }

  onModelChange(
    row: {
      rowId: string;
      seq?: number;
      model: PathLossModel | null;
      modelId: number | null;
      modelName: string;
    },
    model: PathLossModel | null,
  ): void {
    row.model = model;
    this.selectedModel = model;
    row.modelId = model?.id ?? null;

    if (!model) {
      row.modelName = '';
      return;
    }

    row.modelName = model.chineseName ?? '';
  }
}

