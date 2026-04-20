# 第一階段實現文檔：熱力圖控制工具列 & 物件屬性管理強化

## 📋 修改內容清單

### 1. **Banner 工具列 UI 擴充** ✅

#### 文件：`src/app/pages/EditScene/components/banner/banner.component.html`
**變更內容：**
- 在 `.capsule` 下方新增 `.control-toolbar` 容器
- 三區段佈局 (left/middle/right) with flexbox
- 左側：切面高度輸入 + 檢視控制多選下拉
- 中間：分布圖模式六選一下拉選單
- 右側：動態條件區域（使用 `*ngIf` 根據模式切換）
  - **覆蓋圖模式**：3 個 Radio Buttons（RSRP 閾值選擇）
  - **其他模式**：最小值/最大值輸入框 + 確定按鈕

**關鍵特性：**
```html
<!-- 檢視控制多選下拉 -->
<div class="dropdown-wrapper">
  <button (click)="toggleViewDropdown()">{{ getViewLabel() }}</button>
  <div *ngIf="isViewDropdownOpen" class="dropdown-menu">
    <label *ngFor="let filter of ['showTerminals', 'showObstacles', 'showAntennas']">
      <input type="checkbox" [(ngModel)]="viewFilters[filter]" (change)="onViewFilterChange()">
    </label>
  </div>
</div>

<!-- 動態條件區 -->
<div *ngIf="activeHeatmapMode === 'coverage'" class="dynamic-controls">
  <!-- 覆蓋圖：Radio buttons -->
</div>
<div *ngIf="activeHeatmapMode !== 'coverage'" class="dynamic-controls">
  <!-- 其他模式：Min/Max 輸入 -->
</div>
```

#### 文件：`src/app/pages/EditScene/components/banner/banner.component.scss`
**變更內容：**
- 新增 `.control-toolbar` 樣式（rgba 深色半透明，與 `.capsule` 一致）
- 響應式設計（1400px/1024px/768px/600px 斷點）
- `.toolbar-section` flexbox 佈局（left/middle/right）
- `.control-input`, `.control-select`, `.dropdown-*` 等控件樣式
- Checkbox/Radio 自訂樣式（accent-color、hover 效果）
- `.dynamic-controls` 滑入動畫

**色彩方案：**
- 背景：`rgba(20, 24, 36, 0.9)` （與膠囊一致）
- 邊框：`rgba(255, 255, 255, 0.12)`
- 輸入框背景：`rgba(255, 255, 255, 0.08)`
- 確定按鈕：綠色 `rgba(76, 194, 125, ...)`
- 其他按鈕：藍色 `rgba(76, 125, 194, ...)`

#### 文件：`src/app/pages/EditScene/components/banner/banner.component.ts`
**新增類別：**
```typescript
export interface ViewFilters {
  showTerminals: boolean;
  showObstacles: boolean;
  showAntennas: boolean;
}

export interface DynamicRange {
  min: number;
  max: number;
}
```

**狀態屬性：**
```typescript
sliceHeight = 1.05;                           // 預設切面高度
activeHeatmapMode = "sinr";                  // 當前分布圖模式
isViewDropdownOpen = false;                  // 檢視下拉展開狀態
viewFilters: ViewFilters = {...};            // 檢視篩選狀態
coverageThreshold = "rsrp_minus_120";        // 覆蓋圖閾值
dynamicRange: DynamicRange = {...};          // 動態範圍
```

**事件發射器：**
```typescript
@Output() sliceHeightChange = new EventEmitter<number>();
@Output() heatmapModeChange = new EventEmitter<string>();
@Output() viewFiltersChange = new EventEmitter<ViewFilters>();
@Output() coverageThresholdChange = new EventEmitter<string>();
@Output() dynamicRangeChange = new EventEmitter<DynamicRange>();
```

**核心方法：**
- `onSliceHeightChange()` → 發出切面高度變更事件
- `onHeatmapModeChange()` → 發出分布圖模式變更事件
- `onViewFilterChange()` → 發出檢視篩選變更事件
- `onCoverageThresholdChange()` → 發出覆蓋圖閾值變更事件
- `onDynamicRangeConfirm()` → 發出動態範圍確認事件
- `toggleViewDropdown()` → 切換檢視下拉菜單
- `getViewLabel()` → 計算活躍篩選項數量並返回標籤文本

---

### 2. **物件與屬性管理強化** ✅

#### 文件：`src/app/pages/EditScene/EditScene.component.ts`

**A. DAS Antenna 配置新增**
```typescript
public antennaShapes = [
  { id: 'antenna_1', label: '標準天線', icon: 'assets/icons/basestation3Dbtn.png' },
  { id: 'ris_panel', label: '智慧反射面板', icon: 'assets/icons/ris3Dbtn.png' },
  { id: 'das_antenna', label: 'DAS 天線', icon: 'assets/icons/antenna3Dbtn.png' }  // ← 新增
];
```

**B. 屬性面板拖曳功能 ✅（已完整實作）**

狀態變數：
```typescript
isDraggingMenu: boolean = false;
menuDragOffset = { x: 0, y: 0 };
private menuMouseMoveListener = (event: MouseEvent) => this.onMenuMouseMove(event);
private menuMouseUpListener = (event: MouseEvent) => this.onMenuMouseUp(event);
```

核心方法：
```typescript
onMenuHeaderMouseDown(event: MouseEvent): void {
  event.preventDefault();
  this.isDraggingMenu = true;
  this.menuDragOffset = {
    x: event.clientX - this.menuPosition.x,
    y: event.clientY - this.menuPosition.y,
  };
  document.addEventListener('mousemove', this.menuMouseMoveListener);
  document.addEventListener('mouseup', this.menuMouseUpListener);
}

private onMenuMouseMove(event: MouseEvent): void {
  if (!this.isDraggingMenu) return;
  this.menuPosition = {
    x: event.clientX - this.menuDragOffset.x,
    y: event.clientY - this.menuDragOffset.y,
  };
}

private onMenuMouseUp(event: MouseEvent): void {
  if (!this.isDraggingMenu) return;
  this.isDraggingMenu = false;
  this.teardownMenuDragListeners();
}
```

**C. 確定/取消按鈕與狀態備份 ✅（已完整實作）**

狀態快照定義：
```typescript
private initialTransform: {
  position: Vector3;
  rotation: Vector3;
  scaling: Vector3;
} | null = null;
```

進入屬性編輯模式時的備份邏輯：
```typescript
case 'properties':
  this.isPropertiesMode = true;
  
  // ✅ 備份初始狀態
  if (this.selectedMesh) {
    this.initialTransform = {
      position: this.selectedMesh.position.clone(),
      rotation: this.selectedMesh.rotation.clone(),
      scaling: this.selectedMesh.scaling.clone(),
    };
    console.log('[RightClickMenu] 初始變換已備份');
  }
  
  // ✅ 移除 Gizmo 以獲得清晰的屬性視圖
  if (this.gizmoManager?.attachedMesh) {
    this.gizmoManager.attachToMesh(null);
  }
  break;
```

確定/取消邏輯：
```typescript
confirmChanges(): void {
  console.log('[RightClickMenu] 變更已確認');
  this.initialTransform = null;
  this.closeContextMenu();
}

cancelChanges(): void {
  console.log('[RightClickMenu] 變更已取消，正在還原初始狀態');
  
  if (this.selectedMesh && this.initialTransform) {
    // 還原所有變換參數
    this.selectedMesh.position.copyFrom(this.initialTransform.position);
    this.selectedMesh.rotation.copyFrom(this.initialTransform.rotation);
    this.selectedMesh.scaling.copyFrom(this.initialTransform.scaling);
  }
  
  this.initialTransform = null;
  this.closeContextMenu();
}
```

**D. 優化點擊邏輯避免面板關閉 ✅（已完整實作）**

菜單容器已有防冒泡機制：
```typescript
// HTML 中
<div class="floating-menu" (click)="$event.stopPropagation()">
  <!-- 所有內容都被保護 -->
</div>

// 屬性編輯模式下的點擊防護
onCanvasClick(): void {
  // ✅ 在屬性編輯模式中完全阻止點擊事件
  if (this.isPropertiesMode) {
    console.log('[CanvasClick] 已阻止 - 屬性編輯模式活躍');
    return;
  }
  
  // ✅ 即使菜單可見，也只在非編輯模式時關閉
  if (this.isMenuVisible && !this.isPropertiesMode) {
    this.closeContextMenu();
  }
}
```

**E. 熱力圖工具列事件處理 ✅（已新增）**

新增 5 個事件處理器：
```typescript
onSliceHeightChange(sliceHeight: number): void {
  console.log('[Banner] 切面高度已變更:', sliceHeight);
  // TODO: 實現場景更新邏輯
}

onHeatmapModeChange(mode: string): void {
  console.log('[Banner] 分布圖模式已變更:', mode);
  // TODO: 切換熱力圖視覺化
}

onViewFiltersChange(filters: any): void {
  console.log('[Banner] 檢視篩選已變更:', filters);
  // TODO: 切換 3D 元素可見性
}

onCoverageThresholdChange(threshold: string): void {
  console.log('[Banner] 覆蓋圖閾值已變更:', threshold);
  // TODO: 更新覆蓋圖
}

onDynamicRangeChange(range: any): void {
  console.log('[Banner] 動態範圍已確認:', range);
  // TODO: 套用範圍到熱力圖
}
```

---

#### 文件：`src/app/pages/EditScene/EditScene.component.html`

**變更：**
在第 158 行更新 Banner 綁定，新增 5 個輸出事件：
```html
<app-banner 
  [sceneName]="sceneName" 
  [location]="location"
  (sliceHeightChange)="onSliceHeightChange($event)"
  (heatmapModeChange)="onHeatmapModeChange($event)"
  (viewFiltersChange)="onViewFiltersChange($event)"
  (coverageThresholdChange)="onCoverageThresholdChange($event)"
  (dynamicRangeChange)="onDynamicRangeChange($event)">
</app-banner>
```

---

## 💻 代碼範例

### 範例 1：工具列 HTML 結構
```html
<div class="control-toolbar">
  <!-- 左側 -->
  <div class="toolbar-section left-section">
    <div class="control-group">
      <label class="control-label">切面高度 (m)</label>
      <input 
        type="number" 
        [(ngModel)]="sliceHeight" 
        (change)="onSliceHeightChange()"
        min="0" step="0.1"
        class="control-input">
    </div>
    
    <div class="control-group dropdown-wrapper">
      <label class="control-label">檢視</label>
      <button class="dropdown-trigger" (click)="toggleViewDropdown()">
        {{ getViewLabel() }}
      </button>
      <div class="dropdown-menu" *ngIf="isViewDropdownOpen">
        <label class="checkbox-item">
          <input type="checkbox" 
            [(ngModel)]="viewFilters.showTerminals" 
            (change)="onViewFilterChange()">
          <span>顯示終端</span>
        </label>
        <!-- 其他選項... -->
      </div>
    </div>
  </div>
  
  <!-- 中間 -->
  <div class="toolbar-section middle-section">
    <select [(ngModel)]="activeHeatmapMode" (change)="onHeatmapModeChange()">
      <option value="sinr">訊號品質 (SINR)</option>
      <option value="coverage">訊號覆蓋圖</option>
      <!-- ... -->
    </select>
  </div>
  
  <!-- 右側 -->
  <div class="toolbar-section right-section">
    <!-- 覆蓋圖：Radio buttons -->
    <div *ngIf="activeHeatmapMode === 'coverage'">
      <label class="radio-item">
        <input type="radio" [(ngModel)]="coverageThreshold" 
          value="rsrp_minus_120" (change)="onCoverageThresholdChange()">
        <span>RSRP ≥ -120 dBm</span>
      </label>
      <!-- ... -->
    </div>
    
    <!-- 其他模式：Min/Max -->
    <div *ngIf="activeHeatmapMode !== 'coverage'">
      <input type="number" [(ngModel)]="dynamicRange.min" class="control-input small">
      <input type="number" [(ngModel)]="dynamicRange.max" class="control-input small">
      <button (click)="onDynamicRangeConfirm()" class="confirm-btn">確定</button>
    </div>
  </div>
</div>
```

### 範例 2：取消還原邏輯
```typescript
// 進入屬性編輯模式
onMenuAction(action: string): void {
  if (action === 'properties') {
    this.isPropertiesMode = true;
    
    // ✅ 快照當前狀態
    if (this.selectedMesh) {
      this.initialTransform = {
        position: this.selectedMesh.position.clone(),
        rotation: this.selectedMesh.rotation.clone(),
        scaling: this.selectedMesh.scaling.clone(),
      };
    }
  }
}

// 用戶點擊「取消」
cancelChanges(): void {
  if (this.selectedMesh && this.initialTransform) {
    // 逐一還原
    this.selectedMesh.position.copyFrom(this.initialTransform.position);
    this.selectedMesh.rotation.copyFrom(this.initialTransform.rotation);
    this.selectedMesh.scaling.copyFrom(this.initialTransform.scaling);
  }
  
  this.isPropertiesMode = false;
  this.selectedMesh = null;
  this.initialTransform = null;
}
```

### 範例 3：拖曳菜單功能
```typescript
// 按下菜單標題時啟動拖曳
onMenuHeaderMouseDown(event: MouseEvent): void {
  event.preventDefault();
  this.isDraggingMenu = true;
  
  // 記錄拖曳起點的偏移量
  this.menuDragOffset = {
    x: event.clientX - this.menuPosition.x,
    y: event.clientY - this.menuPosition.y,
  };
  
  // 綁定 document 事件監聽
  document.addEventListener('mousemove', this.menuMouseMoveListener);
  document.addEventListener('mouseup', this.menuMouseUpListener);
}

// 拖曳時更新菜單位置
private onMenuMouseMove(event: MouseEvent): void {
  if (!this.isDraggingMenu) return;
  
  this.menuPosition = {
    x: event.clientX - this.menuDragOffset.x,
    y: event.clientY - this.menuDragOffset.y,
  };
}

// 拖曳結束時清理監聽器
private onMenuMouseUp(event: MouseEvent): void {
  if (!this.isDraggingMenu) return;
  
  this.isDraggingMenu = false;
  this.teardownMenuDragListeners();
}
```

---

## ✅ 驗證要點（測試步驟）

### 1. **工具列基本功能**
- [ ] 刷新頁面，Banner 下方顯示完整工具列
- [ ] 切面高度輸入框：輸入 0.5～3 之間的值，無錯誤
- [ ] 檢視控制下拉：點擊按鈕展開/關閉菜單
- [ ] 檢視控制下拉：選中/取消三個 checkbox，標籤實時更新（顯示 "無"/"已選 1-3 項"/"全選"）
- [ ] 分布圖模式下拉：切換 5 個選項，UI 無卡頓

### 2. **動態條件區域切換**
- [ ] 選擇「訊號覆蓋圖」→ 右側顯示 3 個 Radio Button（RSRP -120/-90, SINR 15）
- [ ] 選擇其他模式（SINR/RSRP/速率）→ 右側顯示最小值/最大值輸入框和確定按鈕
- [ ] 在模式之間快速切換 → 動畫平滑、無殘留 DOM 元素

### 3. **屬性面板拖曳與交互**
- [ ] 右擊 3D 場景中的物件 → 浮動菜單出現
- [ ] 點擊「物件屬性」→ 菜單進入屬性編輯模式
- [ ] 在菜單標題上按住滑鼠左鍵拖曳 → 菜單跟隨移動，位置平滑更新
- [ ] 鬆開滑鼠 → 菜單停留在新位置
- [ ] 在屬性輸入框內修改數值 → 3D 場景中的物件實時更新，菜單不關閉

### 4. **取消還原功能**
- [ ] 進入屬性編輯模式
- [ ] 修改物件的尺寸、位置或旋轉（確認 3D 視圖更新）
- [ ] 點擊「取消」按鈕 → 物件還原到編輯前的狀態（位置/旋轉/尺寸）
- [ ] 菜單自動關閉

### 5. **確定與事件發射**
- [ ] 修改工具列中的任何值：
  - 切面高度 → 控制台輸出 "[Banner] 切面高度已變更: ..."
  - 分布圖模式 → 控制台輸出 "[Banner] 分布圖模式已變更: ..."
  - 檢視篩選 → 控制台輸出 "[Banner] 檢視篩選已變更: ..."
  - 覆蓋圖閾值（僅覆蓋圖模式）→ 控制台輸出 "[Banner] 覆蓋圖閾值已變更: ..."
  - 動態範圍（非覆蓋圖模式）→ 點擊確定後控制台輸出 "[Banner] 動態範圍已確認: ..."

### 6. **DAS Antenna 配置**
- [ ] 在左側工具列「天線」分類中找到 "DAS 天線" 選項
- [ ] 點擊該選項，進入放置模式
- [ ] 在 3D 場景中點擊放置一個 DAS 天線
- [ ] 右擊 DAS 天線 → 可正常編輯屬性

### 7. **響應式設計**
- [ ] 將瀏覽器視窗縮小到 1024px 以下
  - 工具列改為換行佈局
  - 各區段堆疊，仍然可操作
- [ ] 進一步縮小到 600px 以下
  - 字體、輸入框尺寸自動縮小
  - 功能保持完整

### 8. **邊界情況**
- [ ] 快速連續修改工具列數值 → 無卡頓或事件遺漏
- [ ] 同時拖曳菜單並修改屬性 → 邏輯獨立，互不干擾
- [ ] 在屬性編輯模式下點擊 3D 場景 → 菜單不關閉
- [ ] 修改後點擊確定 → 菜單正常關閉

---

## 📊 狀態流程圖

```
右擊物件
    ↓
[isMenuVisible = true]
    ↓
顯示菜單（刪除/複製/屬性）
    ↓
用戶點擊「物件屬性」
    ↓
[isPropertiesMode = true] ← 快照 initialTransform
    ↓
菜單進入屬性編輯模式
顯示屬性輸入框 & 確定/取消按鈕
    ↓
用戶修改屬性值
    ├─→ 實時更新 3D 場景
    └─→ 事件發射到 EditScene
    ↓
用戶點擊「確定」或「取消」
    ├─→ 確定：清理快照，關閉菜單
    └─→ 取消：還原 initialTransform，關閉菜單
    ↓
[isMenuVisible = false]
[isPropertiesMode = false]
```

---

## 🔄 熱力圖工具列狀態變更流程

```
工具列狀態改變（用戶操作）
    ↓
Banner 組件偵測變更
    ↓
發射 @Output EventEmitter（帶有新值）
    ↓
EditSceneComponent 對應的處理器方法被呼叫
例：onSliceHeightChange(value)
    ↓
[TODO] 實現場景更新邏輯
    ├─→ 重新渲染熱力圖
    ├─→ 更新數據層
    ├─→ 切換元素可見性
    └─→ 更新圖例/刻度
    ↓
3D 場景視覺更新完成
```

---

## 📝 後續實現提示

以下方法在 `EditSceneComponent` 中已宣告但留待後續實現：

```typescript
// 待實現：更新熱力圖層級
onSliceHeightChange(sliceHeight: number): void {
  // 場景邏輯：根據 sliceHeight 重新計算顯示平面
  // 可配合 Babylon.js GroundMesh 或自訂平面 Mesh
}

// 待實現：切換熱力圖視覺化模式
onHeatmapModeChange(mode: string): void {
  // 模式映射：
  // - 'sinr' → 訊號品質色譜（紅→黃→綠→藍）
  // - 'coverage' → 二值圖（覆蓋/未覆蓋）
  // - 'rsrp' → 信號強度色譜
  // - 'ul_rate' / 'dl_rate' → 速率色譜
}

// 待實現：切換 3D 元素可見性
onViewFiltersChange(filters: any): void {
  // 遍歷 scene.meshes，根據 metadata 分類
  // 切換 mesh.isVisible 狀態
}

// 待實現：更新覆蓋圖閾值
onCoverageThresholdChange(threshold: string): void {
  // 根據選中的閾值重新計算覆蓋區域
  // 更新熱力圖顏色
}

// 待實現：套用動態範圍
onDynamicRangeChange(range: any): void {
  // 將 range.min / range.max 應用到熱力圖顏色映射
  // 更新刻度顯示
}
```

---

## 🎯 設計原則與最佳實踐

1. **狀態管理清晰化**
   - Banner 組件管理自己的工具列狀態
   - EditScene 組件通過事件監聽接收變更並更新場景

2. **防冒泡與點擊保護**
   - 浮動菜單使用 `(click)="$event.stopPropagation()"`
   - 屬性編輯模式中禁用畫布點擊事件

3. **快照與還原**
   - 進入編輯模式時深拷貝（`.clone()`）初始狀態
   - 取消操作時完全還原所有參數

4. **實時反饋**
   - 屬性修改立即在 3D 場景中可見
   - 工具列控件變更立即觸發事件

5. **響應式友善**
   - 使用 `clamp()` 與 `@media` 查詢
   - 確保在各種螢幕尺寸下可用

---

**實現日期：2026-01-20**
**版本：v1.0 - Phase 1 Complete**
