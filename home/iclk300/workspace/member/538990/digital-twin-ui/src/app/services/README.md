# services — 業務邏輯與狀態管理

所有 service 皆為 Angular singleton（`providedIn: 'root'`）。

## 狀態管理 Services（核心）

### FieldDomainStoreService
**`field-domain-store.service.ts`**

全域唯一的場域物件狀態源（Single Source of Truth）。

- 以 `BehaviorSubject<FieldDomainState>` 驅動，訂閱者自動更新
- 管理的物件類型：`obstacle`（障礙物）、`existingBs`（既有基站）、`intelligentPanel`（RIS）、`candidateBs`（候選基站）、`candidateRis`（候選 RIS）、`ue`（終端）、`zone`（區域）、`observe`（觀測區）、`regionalDivision`（區域分割）、`subfield`（子場域）
- 每類物件提供 `add / remove / update` 方法，所有操作皆為 immutable（不直接改原陣列）
- ID 格式：`obs_0`、`bs_1`、`ris_2`、`ue_3`、`zone_4`、`obv_5` 等，序號不因刪除而重置

**注意**：重置（`reset()`）會清空所有場域物件與序號計數器。

---

### ResultDataService
**`result-data.service.ts`**

儲存模擬結果，並控制 UI 是否處於 `edit` 或 `result` 模式。

- `viewMode$`：`'edit' | 'result'`，用 Angular Signal 驅動
- `result`：舊版 API 回傳格式（`ResultApiResponse`）
- `resultMvp`：新版 MVP 結果格式（`ResultMvpData`），含 bsPerformance / charts 等
- 呼叫 `resetToEdit()` 可清除結果並返回編輯模式

---

### ProjectDraftService
**`project-draft.service.ts`**

頁面之間的資料傳遞橋樑，用於 `NewProject → EditScene` 流程。

- `setCommittedMap(data)` / `consumeCommittedMap()` — 設定後消費即清空（one-shot）
- `setProjectMeta(meta)` / `consumeProjectMeta()` — 同上
- 預設專案名稱為 `'工業技術研究院 中興院區'`（hardcoded），接手後可評估是否改為可設定

---

## API Transport Services（純 HTTP，不處理業務邏輯）

| 檔案 | 方法 | API |
|---|---|---|
| `task-api.service.ts` | `postStoreTask(payload)` | POST `/son/storeTask` |
| `simulation-api.service.ts` | `postSimulation(payload)` | POST `/son/simulation` |
| `result-api.service.ts` | `getCompleteCalcResult(taskId, sessionId)` | GET `/son/completeCalcResult/:id/:sid` |
| `logout-api.service.ts` | — | 登出相關 |

Content-Type 均為 `text/plain`（後端期望接收 JSON 序列化字串）。

---

## 地圖與場景 Services

### MapPreviewService
**`map-preview.service.ts`**

依 Leaflet bbox 邊界在 BabylonJS 場景中生成地面（`ground`）、建物（`buildingsRoot`）與地圖貼圖。

- 依賴 `MapCoordinateService`（座標轉換）與 `MapGeneratorService`（OSM tile 抓取）
- 回傳 `GeneratedSceneAssets`（含 root、ground、buildingsRoot、bbox、texture）

### MapGeneratorService
**`map-generator.service.ts`**

從 OpenStreetMap Overpass API 抓取建物 GeoJSON，並進行高度、材質估算。

### MapCoordinateService
**`map-coordinate.service.ts`**

管理場域座標系資訊（bbox、中心點、米尺寸），供其他元件查詢使用。

---

## 資源庫 Services（CRUD）

| 檔案 | 管理資源 | 後端 API |
|---|---|---|
| `antenna.service.ts` | 天線（Antenna）定義 | 有（待確認端點） |
| `ris.service.ts` | RIS Profile 定義 | 有（待確認端點） |
| `material.service.ts` | 材質（Material）定義 | 有（待確認端點） |
| `pathloss-model.service.ts` | 路損模型定義 | 有（待確認端點） |

---

## 其他 Services

| 檔案 | 功能 |
|---|---|
| `alert.service.ts` | 統一確認對話框（question / success / error / info），包裝 `ConfirmDialogComponent` |
| `auth.service.ts` | 認證相關 |
| `translation.service.ts` | 多語系（i18n）輔助 |
| `signal-test.service.ts` | 訊號測試（用途待確認） |
| `glb-test.service.ts` | GLB 模型載入測試 |
| `project-file.service.ts` | 專案存檔 / 讀檔 |
| `obstacle-master.service.ts` | 障礙物主資料管理 |
| `ris-profile-xlsx.service.ts` | RIS Profile xlsx 匯入 |
| `antenna-pattern/` | 天線輻射方向圖（XLSX 解析、3D 模型視覺化） |
