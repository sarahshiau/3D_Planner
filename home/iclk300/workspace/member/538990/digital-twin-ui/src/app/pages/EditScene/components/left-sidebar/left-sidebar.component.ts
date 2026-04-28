// src/app/components/left-sidebar/left-sidebar.component.ts
import { Component, EventEmitter, Output, inject, effect } from '@angular/core';
import { LeftToolType } from '../../EditScene.component';
import { ResultDataService } from 'src/app/services/result-data.service';

// ===== [A-FINAL][STEP3][RESULT-LEFT-TYPES] =====
export type ResultLeftToolType =
  | 'existing'
  | 'coverage'
  | 'bsPerf'
  | 'uePerf'
  | 'charts'
  | null;

@Component({
  selector: 'app-left-sidebar',
  templateUrl: './left-sidebar.component.html',
  styleUrls: ['./left-sidebar.component.scss']
})
export class LeftSidebarComponent {
  // Result mode 狀態來源（SSOT）
  public readonly resultService = inject(ResultDataService);

  // 告訴父元件：「目前選到哪個工具」（edit / result 都走同一個 event，避免父層要改兩套 event）
  // 注意：此處刻意放寬成 union，以支援 Result Mode 的 5 種工具 id
  @Output() toolChange = new EventEmitter<LeftToolType | ResultLeftToolType>();

  // ===== Edit Mode（原本既有） =====
  active: LeftToolType = null;

  tools: { id: LeftToolType; label: string; icon: string }[] = [
    { id: 'primitive', label: '基本物件', icon: 'assets/icons/shape.svg' },
    { id: 'landscape', label: '景觀物件', icon: 'assets/icons/flower.svg' },
    { id: 'antenna',  label: '通訊元件', icon: 'assets/icons/communication.svg' },
    { id: 'terminal', label: '行動終端', icon: 'assets/icons/UE.svg' },
    { id: 'observe',  label: '觀測區域', icon: 'assets/icons/observe.svg' },
    { id: 'zone',     label: '自訂分區', icon: 'assets/icons/area.svg' },
  ];

  // ===== Result Mode（新增） =====
  resultActive: ResultLeftToolType = null;

  resultTools: { id: ResultLeftToolType; label: string; icon: string }[] = [
    { id: 'existing', label: '既有元件', icon: 'assets/icons/shape_had.svg' },
    { id: 'coverage', label: '整體分析', icon: 'assets/icons/analysis.svg' },
    { id: 'bsPerf',   label: '基站效能', icon: 'assets/icons/bsPerf.svg' },
    { id: 'uePerf',   label: '終端分析', icon: 'assets/icons/uePerf.svg' },
    { id: 'charts',   label: '統計資訊', icon: 'assets/icons/charts.svg' },
  ];

  constructor() {
    // ===== [A-FINAL][STEP3][MODE-CLEAN-SWITCH] =====
    // 乾淨切換：mode 變動時清空 active，避免 edit/result 狀態互相污染
    effect(() => {
      const mode = this.resultService.viewMode();
      if (mode === 'edit') {
        this.resultActive = null;
        // 切回 edit 時，通知父層「關閉 result 面板」
        this.toolChange.emit(null);
      } else {
        this.active = null;
        // 進入 result 時，通知父層「關閉 edit 面板」
        this.toolChange.emit(null);
      }
    });
  }

  // ===== Edit Mode 行為（原本既有） =====
  toggle(tool: LeftToolType) {
    this.active = this.active === tool ? null : tool;
    this.toolChange.emit(this.active);
  }

  // ===== Result Mode 行為（新增） =====
  toggleResult(tool: ResultLeftToolType) {
    this.resultActive = this.resultActive === tool ? null : tool;
    this.toolChange.emit(this.resultActive);
  }
}
