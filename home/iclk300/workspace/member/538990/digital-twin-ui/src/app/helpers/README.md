# helpers — UI 判斷邏輯輔助函式

與 `utils/` 的差異：`utils/` 為純資料轉換函式；`helpers/` 偏向 UI 層的判斷與顯示邏輯（含中文字串、樣式 class 決策等）。

## 檔案說明

### observation-area-status.helper.ts
觀測區（subfield）卡片的狀態判斷與顯示輔助。

**使用者介面對應**：右側分析側欄中「觀測區」分頁的每張卡片。

主要匯出函式：

| 函式 | 說明 |
|---|---|
| `finalizeSubfieldAnalysisVm(vm)` | 補全 VM 的 status 與 hasAnyMetric 旗標 |
| `buildObservationAreaCounts(vms)` | 統計各狀態的觀測區數量（ready / empty / unknown） |
| `subfieldMetricsHaveAny(vm)` | 判斷 VM 是否有任何有效指標數值 |
| `observationBadgeModifierClass(vm)` | 回傳 CSS class 字串（用於狀態 badge 顏色） |
| `observationCardModifierClass(vm)` | 回傳卡片本身的 CSS modifier class |
| `observationCardStatusLabel(vm)` | 回傳狀態標籤文字（中文，使用者可見） |
| `observationPerCardEmptyHint(vm)` | 回傳無資料時的提示文字 |
| `resolveObservationAreaSectionHint(counts)` | 依統計產生整體區域提示文字 |
| `formatObservationAreaCountsLine(counts)` | 格式化統計數量成單行文字 |

**三種狀態**（`SubfieldAnalysisStatus`）：
- `ready`：有模擬結果資料
- `empty`：已設定但無匹配的模擬結果
- `unknown`：尚未設定或資料不完整
