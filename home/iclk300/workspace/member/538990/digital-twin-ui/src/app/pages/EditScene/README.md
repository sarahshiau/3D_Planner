# EditScene — 主場景頁面

路由：`/editscene`（應用預設入口）

## 警告

`EditScene.component.ts` 是約 **648 KB** 的超重單體元件。任何改動前，建議先確認：
1. 要修改的功能在檔案的哪個區域（使用搜尋標籤）
2. 變更是否會影響 BabylonJS 場景的物件 ID 對應關係
3. 模擬流程中的 payload 是否受到影響

## 子元件（components/ 子目錄）

| 元件 | 功能 |
|---|---|
| `banner/` | 頂部工具列（模式切換、分布圖控制、存檔匯出） |
| `left-sidebar/` | 左側工具面板（物件類型選擇） |
| `map-scene/` | 迷你地圖（Leaflet）預覽區 |
| `right-sidebar/` | 右側結果面板（模擬結果、觀測區分析） |
| `panels/edit-field-panel/` | 場域物件清單面板（obstacle / bs / ris / ue 等） |
| `panels/edit-task-panel/` | 任務設定面板（規劃模式、目標門檻） |
| `panels/edit-file-panel/` | 檔案面板（天線/材質/路損/RIS 管理入口） |

## 核心狀態型別（定義於 EditScene.component.ts）

| 型別 | 說明 |
|---|---|
| `RightPanelType` | `'file' \| 'task' \| 'field' \| null` |
| `LeftToolType` | 工具列選項（`'primitive' \| 'marker' \| 'antenna' \| 'ris'` 等） |
| `EditSceneFieldSettingsState` | 場域設定（名稱/網路類型/頻段/尺寸/閾值） |
| `DistributionMode` | heatmap 顯示模式（`'rsrp' \| 'sinr' \| 'ul_rate' \| 'dl_rate' \| 'coverage'`） |

## 重要常數（定義於 EditScene.component.ts）

| 常數名稱 | 說明 | 風險 |
|---|---|---|
| `SIMULATION_SEED_FALLBACK` | 模擬預設參數（覆蓋率/門檻/MCTS 等） | 變更會影響模擬行為 |
| `SIMULATION_REFERENCE_SEED` | 完整參考 payload 結構（含 duplex/band 等） | 格式需與後端 API 對齊 |
| `RESULT_MVP_MOCK` | 硬編碼的假結果資料（開發階段佔位） | **正式上線前需確認是否仍被使用** |

## 使用到的主要 Services

- `FieldDomainStoreService` — 讀寫所有場域物件狀態
- `MapPreviewService` — 生成 BabylonJS 3D 場景
- `ResultDataService` — 切換 edit/result 視圖、儲存結果
- `ProjectDraftService` — 讀取新建專案傳遞的 committedMap
- `TaskApiService` / `SimulationApiService` / `ResultApiService` — API 呼叫

## console.log 狀況

此檔案含約 **639 個** `console.log`，依前綴分類：

| 前綴 | 性質 |
|---|---|
| `[SIM_API_PHASE1~6]` | 模擬 API 各階段追蹤日誌 |
| `[SUBFIELD_*]` | 觀測區（subfield）狀態追蹤 |
| `[CHK]` | 快速檢查點 |
| 無前綴 | 多為開發迭代中加入，性質混雜 |

## 座標系注意事項

本專案使用兩種座標系，互轉邏輯在 `utils/field-coordinate.util.ts`：

- **SceneCoord3D**：BabylonJS 場景空間（中心為原點，Y 軸向上）
- **MathCoord3D**：後端 / 場域數學空間（左下角為原點，Z 軸為高度）

場域物件的位置存入 `FieldDomainStore` 和送出 API payload 前，需注意使用哪個座標系。
