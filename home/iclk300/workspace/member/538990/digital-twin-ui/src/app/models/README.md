# models — TypeScript 介面與型別定義

本目錄為純型別定義，不含任何邏輯或副作用。

## 核心模型

### field-domain.model.ts
**整個應用最重要的型別檔案**。

定義所有「場域物件」的 TypeScript 介面，是以下三者的型別合約：
- UI 面板的資料顯示
- `FieldDomainStoreService` 的狀態儲存
- Builders 的序列化輸入

主要型別：

| 型別 | 說明 |
|---|---|
| `FieldCategory` | `'obstacle' \| 'existingBs' \| 'intelligentPanel' \| 'candidateBs' \| 'candidateRis' \| 'ue' \| 'zone' \| 'observe'` |
| `FieldRowBase` | 所有場域物件的共同基礎（id, seq, category, meshId） |
| `ObstacleFieldRow` | 障礙物（含尺寸、材質、形狀） |
| `ExistingBsFieldRow` | 既有基站（含天線、頻段、duplex 設定、位置、rxGain） |
| `IntelligentPanelFieldRow` | RIS（含 profileID、安裝角度） |
| `CandidateBsFieldRow` | 候選基站 |
| `CandidateRisFieldRow` | 候選 RIS |
| `UeFieldRow` | 終端裝置（UE） |
| `ZoneFieldRow` | 區域（polygon） |
| `ObserveFieldRow` | 觀測點 |
| `RegionalDivisionFieldRow` | 區域分割 |
| `SubfieldRow` | 觀測子場域（subfieldID + 名稱 + 座標範圍） |
| `FieldDomainState` | 整體 Store 快照（含所有類型的陣列） |

> **注意**：`ExistingBsFieldRow` 的型別很複雜（含 `ExistingBsRadioConfig`、`ExistingBsDuplexTddParam`、`ExistingBsAntennaRuntime` 等），改動前需仔細對照 BS 設定 modal 和 payload builder。

---

### field-domain.ts
`field-domain.model.ts` 的舊版或輔助檔（兩個檔案共存，**接手時需確認哪個是現行版本**）。

---

### task-payload.model.ts
`BaseTaskPayload` 及其 builder 輸入型別（`BaseTaskPayloadBuilderInput`），定義送往 `/son/storeTask` 和 `/son/simulation` 的 payload 結構。

---

### result-panel.model.ts
右側結果面板的 ViewModel 型別（`ResultPanelVm`）。

---

### subfield-analysis.vm.ts
觀測區分析的 ViewModel 型別（`SubfieldAnalysisVm`、`SubfieldAnalysisStatus`、`ObservationAreaCountsVm`）。

---

### antenna/ 目錄
天線相關型別分為三層：

| 檔案 | 說明 |
|---|---|
| `antenna.api.dto.ts` | 與後端 API 交換的 DTO 格式 |
| `antenna.ui.model.ts` | UI 顯示用的格式 |
| `antenna.draft.ts` | 編輯中的草稿格式（尚未儲存） |

---

### committed-map-data.model.ts
`CommittedMapData`：使用者在 map-picker 確認後的地圖選取資料（bbox、尺寸、中心點等）。用於 `ProjectDraftService` 跨頁面傳遞。

### project-meta.model.ts
專案元資料型別。

### material.model.ts
材質定義型別。

### pathloss-model.model.ts
路損模型定義型別。

### ris.model.ts
RIS Profile 型別（`RisApi`）。

### antenna.model.ts
天線主型別（頂層，與 `antenna/` 子目錄的型別有所區別，確認時需注意）。

### existing-bs-defaults.helper.ts
既有基站欄位的預設值輔助函式（`getExistingBsFieldDefaults()`）。雖命名為 helper，但歸在 models 目錄下。
