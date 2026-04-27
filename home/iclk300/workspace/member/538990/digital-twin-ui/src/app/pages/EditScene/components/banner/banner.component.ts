import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ViewChild, ElementRef, HostListener } from "@angular/core";
import { Router } from "@angular/router";
import { ProjectDraftService } from "src/app/services/project-draft.service";
import { AlertService } from "src/app/services/alert.service";

export interface ViewFilters {
  showTerminals: boolean;
  showObstacles: boolean;
  showAntennas: boolean;
  showObserveZones: boolean;
  showCustomRegions: boolean;
}
                       
export interface DynamicRange {
  min: number;
  max: number;
}

@Component({
  selector: "app-banner",
  templateUrl: "./banner.component.html",
  styleUrls: ["./banner.component.scss"]
})
export class BannerComponent implements OnInit, OnChanges {
  @Input() sceneName = "工業技術研究院 中興院區";
  @Input() location = "戶外";

  @Input() isSimulationDone = false; // ✅ 來自 EditScene 的模擬完成狀態

  @Output() sliceHeightChange = new EventEmitter<number>();
  @Output() heatmapModeChange = new EventEmitter<string>();
  @Output() viewFiltersChange = new EventEmitter<ViewFilters>();
  @Output() coverageThresholdChange = new EventEmitter<string>();
  @Output() dynamicRangeChange = new EventEmitter<DynamicRange>();
  @Output() backToEditMode = new EventEmitter<void>();
  @Output() saveClick = new EventEmitter<void>();

  // ✅ Banner project actions (UI only)
  isProjectActionsEnabled = true;

  @Input() sliceHeight = 1.5;
  @Input() sliceHeightOptions: number[] = [];
  @Input() hasTerminals = false;
  @Input() hasAntennas = false;
  @Input() hasObserveZones = false;
  @Input() hasCustomRegions = false;
  @Input() hasObstacles = false;
  activeHeatmapMode = "sinr";
  isViewDropdownOpen = false;
  @ViewChild("viewBtn", { static: false }) viewBtnRef?: ElementRef<HTMLElement>;
  viewMenuStyle: { [k: string]: any } = {};
  isCompactLayout = false;
  isResponsiveControlsOpen = false;

  viewFilters: ViewFilters = {
    showTerminals: true,
    showObstacles: true,
    showAntennas: true,
    showObserveZones: true,
    showCustomRegions: true
  };

  coverageThreshold = "rsrp_minus_120";

  dynamicRange: DynamicRange = {
    min: 0,
    max: 30
  };
  
  draftDynamicRange: DynamicRange = {
    min: 0,
    max: 30,
  };

  constructor(
    private router: Router,
    private projectDraftService: ProjectDraftService,
    private alertService: AlertService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["sliceHeightOptions"]) {
      const options = this.sliceHeightOptions ?? [];
      if (options.length > 0 && !options.includes(this.sliceHeight)) {
        this.sliceHeight = options[0];
        this.sliceHeightChange.emit(this.sliceHeight);
      }
    }
  }

  ngOnInit(): void {
    const projectName = this.projectDraftService.getProjectName();
    if (projectName) {
      this.sceneName = projectName;
    }
    this.draftDynamicRange = { ...this.dynamicRange };
  }

  onBackClick(): void {
    this.alertService.question("確定要回到編輯模式嗎？").subscribe(confirmed => {
      if (confirmed) {
        this.backToEditMode.emit();
      }
    });
  }

  onSliceHeightChange(): void {
    this.sliceHeightChange.emit(this.sliceHeight);
  }

  onHeatmapModeChange(): void {
    this.heatmapModeChange.emit(this.activeHeatmapMode);
    
    if (this.activeHeatmapMode === 'coverage') {
      this.draftDynamicRange = { ...this.dynamicRange };
      return;
    }

    // DEBUG requirement A: SINR mode should use fixed 0~30 range (UI-only + Confirm mechanism unchanged)
    if (this.activeHeatmapMode === 'sinr') {
      this.dynamicRange = { min: 0, max: 30 };
      this.draftDynamicRange = { min: 0, max: 30 };
      return;
    }

    // RSRP keep legacy defaults
    if (this.activeHeatmapMode === 'rsrp') {
      this.dynamicRange = { min: -120, max: -50 };
      this.draftDynamicRange = { min: -120, max: -50 };
      return;
    }

    // DL Rate: align with EditScene committedRangeByMode.dl_rate (0–1000 Mbps)
    if (this.activeHeatmapMode === 'dl_rate') {
      this.dynamicRange = { min: 0, max: 1000 };
      this.draftDynamicRange = { min: 0, max: 1000 };
      return;
    }

    // UL Rate: align with EditScene committedRangeByMode.ul_rate (0–200 Mbps)
    if (this.activeHeatmapMode === 'ul_rate') {
      this.dynamicRange = { min: 0, max: 200 };
      this.draftDynamicRange = { min: 0, max: 200 };
      return;
    }
  }
  
  get isDynamicRangeDraftValid(): boolean {
    if (this.activeHeatmapMode === 'coverage') {
      return false;
    }
    
    const minValue = Number(this.draftDynamicRange.min);
    const maxValue = Number(this.draftDynamicRange.max);
    
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return false;
    }
    
    return minValue < maxValue;
  }
  
  get isDynamicRangeDirty(): boolean {
    if (this.activeHeatmapMode === 'coverage') {
      return false;
    }
    
    return (
      this.draftDynamicRange.min !== this.dynamicRange.min ||
      this.draftDynamicRange.max !== this.dynamicRange.max
    );
  }

  onViewFilterChange(): void {
    this.viewFiltersChange.emit(this.viewFilters);
  }

  onCoverageThresholdChange(): void {
    this.coverageThresholdChange.emit(this.coverageThreshold);
  }

  onDynamicRangeConfirm(): void {
    if (!this.isDynamicRangeDraftValid || !this.isDynamicRangeDirty) {
      return;
    }
    
    this.dynamicRange = { ...this.draftDynamicRange };
    this.dynamicRangeChange.emit(this.dynamicRange);
  }

  toggleViewDropdown(): void {

    this.isViewDropdownOpen = !this.isViewDropdownOpen;

    if (this.isViewDropdownOpen) {
      setTimeout(() => {
        this.updateViewMenuPosition();
      }, 0);
    }
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.isViewDropdownOpen) return;

    const target = ev.target as HTMLElement | null;
    const btnEl = this.viewBtnRef?.nativeElement;

    // 點到按鈕不關
    if (btnEl && target && (btnEl === target || btnEl.contains(target))) return;

    // 點到 dropdown 內不關
    if (target && target.closest(".view-dropdown-menu")) return;

    this.isViewDropdownOpen = false;
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (this.isViewDropdownOpen) this.updateViewMenuPosition();
  }

  @HostListener("window:scroll")
  onWindowScroll(): void {
    if (this.isViewDropdownOpen) this.updateViewMenuPosition();
  }

  /**
   * 計算並更新「檢視（View）dropdown」的位置
   *
   * 核心設計理念：
   * 1. 使用 getBoundingClientRect() 取得「按鈕在螢幕上的實際位置」
   * 2. 使用 position: fixed，讓 dropdown 以「視窗」為座標系，不受 banner overflow 裁切
   * 3. 所有幾何計算在 TS 進行，CSS 只負責外觀
   */
  private updateViewMenuPosition(): void {

    // 取得「檢視 icon 按鈕」的 DOM 元素
    const btnEl = this.viewBtnRef?.nativeElement;
    if (!btnEl) {
      // 理論上不該發生，保險防呆
      console.warn("[View][pos] viewBtnRef is NULL");
      return;
    }

    /**
     * 取得按鈕在「瀏覽器視窗」中的實際位置與尺寸
     *
     * rect 的座標系：
     * - (0, 0) = 視窗左上角
     * - 單位 = px
     * - 已包含 scroll / layout / flex / transform 等所有影響
     */
    const rect = btnEl.getBoundingClientRect();
    /**
     * gap：
     * dropdown 與按鈕之間的視覺間距
     * （避免貼太近，看起來像黏在一起）
     */
    const gap = 8;
    /**
     * dropdown 的「預估寬度」
     *
     * 用途：
     * - 用來判斷是否會超出視窗右側
     * - 做 clamp（限制在視窗內）
     *
     * ⚠️ 不需要 100% 精準，只要是合理的最大寬度即可
     */
    const menuWidth = 220;
    /**
     * === 水平位置（left）計算 ===
     *
     * 需求：
     * dropdown 的「左上角」對齊「按鈕的左下角」
     *
     * 幾何意義：
     * - dropdown.left = 按鈕.left
     */
    let left = rect.left;      // ✅ 右下：從按鈕右側開始
    
     /**
     * clamp：避免 dropdown 超出視窗右邊
     *
     * 規則：
     * - 最左不小於 gap
     * - 最右不超過 window.innerWidth - menuWidth - gap
     */
    left = Math.max(gap, Math.min(left, window.innerWidth - menuWidth - gap));
    /**
     * === 垂直位置（top）計算 ===
     *
     * 需求：
     * dropdown 顯示在「按鈕下方」
     *
     * 幾何意義：
     * - dropdown.top = 按鈕.bottom + gap
     */
    const top = rect.bottom + gap; // ✅ 下方

  /**
   * 將計算後的座標，轉成 inline style
   *
   * 為什麼用 position: fixed？
   * - fixed 以「視窗」為座標系
   * - 完全不受 banner overflow / scroll 容器影響
   * - 與 getBoundingClientRect() 的座標系一致
   */
    this.viewMenuStyle = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      // 確保 dropdown 顯示在 banner / topbar 之上
      zIndex: "3005"
    };

  }


  toggleResponsiveControls(): void {
    this.isResponsiveControlsOpen = !this.isResponsiveControlsOpen;
  }

  getViewLabel(): string {
    const activeCount = [
      this.viewFilters.showTerminals ? "終端" : "",
      this.viewFilters.showObstacles ? "障礙物" : "",
      this.viewFilters.showAntennas ? "基地台" : ""
    ].filter(v => v).length;

    if (activeCount === 0) {
      return "無";
    } else if (activeCount === 3) {
      return "全選";
    } else {
      return `已選 ${activeCount} 項`;
    }
  }

  onSaveProjectClick(): void {
    console.log("[Banner] Save Project clicked");
    this.saveClick.emit();
  }

  onExportProjectClick(): void {
    console.log("[Banner] Export Project clicked");
  }

}
