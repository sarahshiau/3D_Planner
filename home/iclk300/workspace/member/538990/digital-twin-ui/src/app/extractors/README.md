# extractors — API 回傳資料提取器

從後端 API 的原始回傳結構中提取特定欄位，隔離解析邏輯，避免散落在元件中。

## 檔案說明

### subfield-result.extractor.ts
從 `completeCalcResult` API 回傳的 `5GOutput.subfieldStatistics` 中提取觀測子場域的指標。

**後端資料對應關係（重要）：**

| 後端欄位 | 說明 | 注意 |
|---|---|---|
| `ID` | 對應 payload 的 `subfieldID`（數字） | 舊資料可能是切面標籤字串，如 `"1.05 公尺"` |
| `coverage` | 覆蓋率（百分比，後端回 0~100） | 舊 mock 可能是 0~1 比例，需正規化 |
| `signalQualityAvg` | 平均 SINR（dB） | |
| `signalStrengthAvg` | 平均 RSRP（dBm） | 有時以 `rsrpAvg` 名稱出現 |
| `dlTptAvg` / `ulTptAvg` | DL/UL 吞吐量（Mbps） | |

主要函式：
- `resolveSubfieldStatRow(stats, subfieldID)` — 依 ID 找到對應的統計列
- `normalizeSubfieldCoverage(raw)` — 將 0~1 或 0~100 的覆蓋率正規化為 0~100 顯示值
- `extractSubfieldMetricsFromStat(stat)` — 從一列 stat 資料提取所有指標

**此資料路徑的命名為「completeCalcResult bloodline」**，在程式碼中以此標籤追蹤相關邏輯。
