# builders — API Payload 組裝與序列化

本目錄負責將 UI 狀態（`FieldDomainStore` 中的資料）轉換成後端 API 所需的 payload 格式。
所有 builder 都是純類別或函式，**不依賴 Angular DI，無副作用**。

## 檔案說明

### base-task-payload.builder.ts
**核心 Builder**，組裝送至 `/son/storeTask` 與 `/son/simulation` 的完整 payload。

呼叫點：`EditScene.component.ts` 的模擬觸發邏輯

輸入（`BaseTaskPayloadBuilderInput`）：
- 場域設定（尺寸、切片高度、網路參數）
- 所有場域物件（從 `FieldDomainStoreService.snapshot` 取得）
- 規劃目標（coverage ratio、SINR/RSRP 門檻等）
- 天線、RIS、UE 資料

輸出（`BaseTaskPayload`）：後端期望的 flat legacy 格式

**注意**：此 builder 內部使用 `TASK_PAYLOAD_MOCK_DEFAULTS` 作為預設值基底，部分欄位在正式流程中仍以 mock 填入。

---

### obstacle-serializer.builder.ts
序列化障礙物（obstacle）至後端格式。

- 輸出格式（legacy）：`JSON.stringify(tuple1) + '|' + JSON.stringify(tuple2) + ...`
- 每個 tuple 為 10 欄位：`[x, y, baseHeight, width, length, obstacleHeight, angle, materialId, shapeId, color]`
- 支援三類障礙物：basic（手動繪製）、landscape（地形）、building（OSM 建物）
- 建物（building）若無法解析尺寸會被跳過，跳過紀錄存於 `lastBuildingSkips`，供 `BaseTaskPayloadBuilder` 做診斷

---

### ris-serializer.builder.ts
序列化 RIS（Intelligent Panel）物件至後端格式。

輸出格式：`SerializedRisRow[]`（含 risID、location、profileID、insHorizontal、insVertical）

若必填欄位（risID、profileID、位置）任一為 null，該 row 會被過濾掉（不送出）。

---

### subfield-payload.serializer.ts
序列化觀測子場域（subfield）至 payload 格式。

函式：`serializeSubfieldPayloadRows(rows: SubfieldRow[])`

---

### regional-division-payload.serializer.ts
序列化區域分割（regional division）資料。

---

### bs-legacy-serializer.ts
序列化基站（Base Station）相關資料至 legacy payload 格式。

包含：
- `toBsSourceRows()`：將 `ExistingBsFieldRow[]` 轉成中間格式
- `serializeBsPositionsToLegacy()`：輸出位置字串
- `serializeBsAntennaToLegacy()`：輸出天線設定字串
- `buildBsListDefaultBsFromRows()`：建立 `defaultBs` 清單（送至 `bsList.defaultBs`）

---

### result-panel.builder.ts
組裝右側結果面板的 ViewModel（`ResultPanelVm`），將 API 回傳資料轉為 UI 所需格式。

---

### subfield-analysis.builder.ts
組裝觀測區分析 ViewModel（`SubfieldAnalysisVm[]`）。

- 輸入：`SubfieldRow[]`（來自 Store）+ API 回傳的 `subfieldStatistics`
- 輸出：每個觀測區的覆蓋率、SINR、RSRP、throughput 等指標的顯示 VM
- 排序邏輯：先依 `sortOrder` 升序，再依 `subfieldID` 升序

## 資料流

```
FieldDomainStoreService.snapshot
        ↓
BaseTaskPayloadBuilder.build(input)
  ├─ ObstacleSerializerBuilder.serializeObstacleInfo()
  ├─ RisSerializerBuilder.serialize()
  ├─ serializeSubfieldPayloadRows()
  └─ toBsSourceRows() / serializeBsPositionsToLegacy() 等
        ↓
BaseTaskPayload  →  TaskApiService / SimulationApiService
```
