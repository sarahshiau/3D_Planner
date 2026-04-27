# pages — 頁面元件

每個子資料夾對應一個路由頁面。

## 頁面清單

### EditScene（主要頁面）
- 路由：`/editscene`
- 檔案：`EditScene.component.ts` / `.html` / `.scss`
- 功能：3D 場景編輯（BabylonJS）、場域物件管理、執行模擬、結果顯示
- **警告**：單一 `.ts` 檔案約 648 KB，是整個應用的核心。內含多個子元件（`components/` 子目錄）。

### NewProject（新建專案）
- 路由：`/project/new`
- 檔案：`NewProject/new-project.component.ts`
- 功能：填寫專案名稱、選擇地圖來源（GIS / GLB）、讀取歷史任務清單
- 流程：填寫完成後透過 `ProjectDraftService` 傳遞資料，再導航至 `/editscene`

### ComputeResult（計算結果）
- 路由：`/result`
- 檔案：`ComputeResult/compute-result.component.ts`
- 功能：棄用

### GLBmap（GLB 測試頁）
- 路由：`/GLBmap`
- 狀態：**開發測試用途**

### MapTest（地圖測試頁）
- 路由：`/map-test`
- 狀態：**開發測試用途**，內含 53 個 `console.log`，正式環境應確認處理方式

### OSMScene（OSM 測試頁）
- 路由：`/osmscene`
- 狀態：**發測試用途**，功能與 EditScene 有重疊

## 建議接手確認事項

- [ ] `GLBmap`、`MapTest`、`OSMScene` 三個頁面是否要繼續維護或移除？
- [ ] `ComputeResult` 棄用
