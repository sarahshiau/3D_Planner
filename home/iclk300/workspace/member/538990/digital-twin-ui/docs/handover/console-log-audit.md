# Console Log Audit

> **交接用途**：本文件記錄 `src/app` 下所有 console 呼叫的盤點與分類建議。
> 審查日期：2026-04-27
> **更新**：2026-04-27 Patch 完成 Risk=Low Remove Candidates（共 ~61 calls 已移除，詳見下方各節標註）。

---

## 1. Summary

### 數量統計

| 類型 | 數量 | 涉及檔案數 |
|------|------|-----------|
| `console.log` | 1,284 | 61 |
| `console.warn` | 179 | 25 |
| `console.error` | 108 | 25 |
| **Total** | **1,571** | **61** |

### Tag 分析

| 分類 | 數量 | 說明 |
|------|------|------|
| 有明確 tag（`[TAG]` 前綴）| ~1,350 | 約 86%；大多數檔案有系統性 tagging |
| 無 tag | ~221 | 約 14%；主要集中於 EditScene 中的臨時 debug 插入 |

### 高風險 Log（可能輸出 payload / session / result）

| 類型 | 預估數量 | 主要來源 |
|------|---------|---------|
| 輸出完整 payload 物件 | ~25 | EditScene（`[PAYLOAD_SOURCE_AUDIT]`、`[Patch3]`、`[FINAL_PAYLOAD]`）、task-api、sim-api |
| 輸出 session token | ~8 | EditScene `[SIM_API_PHASE3][session]`（session 字串直接印出） |
| 輸出完整 result 物件 | ~6 | EditScene `[SIM_API_PHASE3] completeCalcResult received`、result-api |
| 輸出大型 BS / RIS 資料 | ~12 | EditScene `[P3][finalBsPayload]`、`[RIS_PAYLOAD_FINAL]`、`[VERIFY]` |
| **合計** | **~51** | — |

### 最大噪音來源

| 排名 | File | 總 console 數 |
|------|------|-------------|
| 1 | `EditScene.component.ts` | 782 |
| 2 | `antenna-pattern-viewer.ts` | 207 |
| 3 | `map-test.component.ts` | 61 |
| 4 | `map-picker.component.ts` | 33 |
| 5 | `edit-task-panel.component.ts` | 24 |
| 6 | `map-scene.component.ts` | 24 |
| 7 | `right-sidebar.component.ts` | 23 |
| 8 | `base-task-payload.builder.ts` | 23 |

---

## 2. Remove Candidates

明顯可刪候選：開發過程殘留、重複刷屏、純粹 lifecycle noise、無附加資訊的 UI 事件 log。

| File | Method / Area | Log Summary | Reason | Risk |
|------|--------------|-------------|--------|------|
| `pages/MapTest/map-test.component.ts` | 全檔案（61 calls） | 大量 tile range、crop 計算、mosaic pixel debug | dev-only 測試頁；61 筆 log 全為開發用途；此頁面不應出現於 production route | Low |
| `components/top-bar/top-bar.component.ts` | `openAntennaManage`、`closeAntennaManage`、`openPathlossManage`、`closeMaterialManage`、`openRisManage`、`closeRisManage`（共 13 calls） | `[TopBar] openX BEFORE, isXOpen=...`、`[TopBar] closeX()` | 純 UI 開關狀態 log；before/after boolean toggle 對生產無意義；每次使用者操作都刷屏 | Low |
| `components/modals/antenna-manage-modal/antenna-manage-modal.component.ts` | `constructor`、`ngOnInit` | `[AntennaManageModal] constructor`、`[AntennaManageModal] ngOnInit` | pure lifecycle noise；constructor/ngOnInit log 提供零資訊 | Low |
| `components/modals/ris-manage-modal/ris-manage-modal.component.ts` | `constructor`、`ngOnInit` | `[RisManageModal] constructor`、`[RisManageModal] ngOnInit` | 同上 | Low |
| `components/modals/ris-config-manage-modal/ris-config-manage-modal.component.ts` | `constructor`、`ngOnInit` | `[RisConfigManageModal] constructor`、`[RisConfigManageModal] ngOnInit` | 同上 | Low |
| `components/modals/ris-add-modal/ris-add-modal.component.ts` | `constructor`、`ngOnInit` | `[RisAddModal] constructor`、`[RisAddModal] ngOnInit`、`[RisAddModal] zIndexBase=` | lifecycle + zIndex debug；zIndex 不變時無意義 | Low |
| `components/modals/ris-config-add-modal/ris-config-add-modal.component.ts` | `constructor`、`ngOnInit` | `[RisConfigAddModal] constructor`、`[RisConfigAddModal] ngOnInit, risID=` | 同上 | Low |
| `components/modals/ris-config-edit-modal/ris-config-edit-modal.component.ts` | `constructor`、`ngOnInit` | `[RisConfigEditModal] constructor`、`[RisConfigEditModal] ngOnInit` | 同上 | Low |
| `components/modals/antenna-add-modal/antenna-add-modal.component.ts` | `constructor`、`ngOnInit` | `[AntennaAddModal] constructor`、`[AntennaAddModal] ngOnInit` | 同上 | Low |
| `components/modals/antenna-edit-modal/antenna-edit-modal.component.ts` | `constructor`、`ngOnInit` | `[AntennaEditModal] constructor`、`[AntennaEditModal] ngOnInit, antenna=` | 同上 | Low |
| `pages/EditScene/components/banner/banner.component.ts` | event handlers（5 calls） | `[Banner] 切面高度已變更:`、`[Banner] 分布圖模式已變更:`、`[Banner] 檢視篩選已變更:`、`[Banner] 覆蓋圖閾值已變更:`、`[Banner] 動態範圍已確認:` | 每次使用者調整 UI 都觸發；對生產運作無診斷價值 | Low |
| `pages/EditScene/components/left-sidebar/left-sidebar.component.ts` | `toggle`、`toggleResult` | `[LeftSidebar] toggle 被叫了，tool =`（2 calls）、`[LeftSidebar][Result/Edit] clear ...`（2 calls） | 純 UI toggle 狀態；4 calls 全為 routine flow | Low |
| `services/result-data.service.ts` | `setResultData`、`setResultMvp`、`resetToEdit`、`enterResultMode` | `[ResultDataService] setResultData()`、`setResultMvp()`、`resetToEdit()`、`enterResultMode()` | 純狀態轉換 lifecycle；每次模擬完成都刷 4 行；值可從 Angular DevTools 觀察 | Low |
| `components/modals/ris-manage-modal/ris-manage-modal.component.ts` | `backdrop clicked`、`close clicked`、`preset changed` | `[RisManageModal] backdrop clicked (blocked)`、`close clicked`、`preset changed ->` | 常見 UI 互動；每次開關 modal 都輸出 | Low |
| `components/modals/ris-config-manage-modal/ris-config-manage-modal.component.ts` | `backdrop clicked`、`close clicked` | `[RisConfigManageModal] backdrop clicked (blocked)`、`close clicked` | 同上 | Low |
| `components/modals/antenna-manage-modal/antenna-manage-modal.component.ts` | `backdrop clicked`、`close clicked`、`preset changed` | 同模式 | 同上 | Low |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `save project clicked`、`export project clicked` | `[RightSidebar] save project clicked`、`export project clicked` | 與 Banner 同類 click handler log；行動結果才有意義 | Low |
| `services/logout-api.service.ts` | `tap` operator | `[LogoutApi] logout request sent (stub)` | stub 實作；每次登出都印；`console.warn` 的 warn level 反而比較合理 | Low |
| `components/modals/pathloss-model-manage-modal/pathloss-model-manage-modal.component.ts` | — | 全部 4 calls 均為 `console.error` in catch blocks | **不可刪**（見 Section 4）；此處為誤判，移至 Keep as Warn/Error | — |

---

## 3. Keep with Debug Flag

有診斷價值，但在正常運作時持續輸出會掩蓋真實錯誤。建議包進 debug flag 後保留。

| File | Method / Area | Log Tag | Purpose | Suggested Debug Flag |
|------|--------------|---------|---------|---------------------|
| `services/map-generator.service.ts` | `generateBuildings()` | `[NS_PROBE][BUILD_PLACE_VERTEX]`、`[NS_PROBE][BUILD_PLACE_NORTH_SOUTH_PAIR]`、`[NS_PROBE][BUILD_WORLD_PLACE]`、`[NS_PROBE][BUILD_PLACE_EAST_WEST_PAIR]` | 建物頂點座標對齊診斷；每棟建物每條邊都輸出；OSM 建物座標錯位時唯一偵錯線索 | `DEBUG_BUILDING_VERTEX` |
| `services/map-generator.service.ts` | `generateBuildings()` | `[2D2U4WJ6][Stage2-D0][GenerateEnter]`、`[2D2U4WJ6][Stage2-C][RawLatLonExtents]`、`[2D2U4WJ6][Stage2-D][LocalXZExtents]`、`[2D2U4WJ6][BuildingRect]` | 建物在 Scene 座標系中的 bounding box 計算；bbox 錯誤時診斷用途明確 | `DEBUG_BUILDING_BBOX` |
| `services/map-preview.service.ts` | `generate()`、`generateGroundMaterial()` | `[MAP_PREVIEW][TILE_CANVAS_ORIENTATION]`、`[MAP_PREVIEW][IMAGE_CORNER_MEANING]`、`[MAP_PREVIEW][GROUND_UV_MEANING]` | 地圖紋理貼圖 UV 方向診斷；tile 方向錯誤時必要 | `DEBUG_MAP_UV` |
| `services/map-preview.service.ts` | `generate()` | `[CHK][Scene@MapPreview.generate]`、`[DBG][MapPreview] before root create`、`[DBG][MapPreview][BBoxGround]` | Map preview scene 建構步驟追蹤；Scene 初始化失敗時診斷 | `DEBUG_MAP_PREVIEW` |
| `pages/EditScene/components/map-scene/map-scene.component.ts` | `captureMapToGround()` | `[2D2U4WJ6][CropCalc raw]`、`[2D2U4WJ6][TileOK sample]`、`[2D2U4WJ6][Tiles] finished`、`[2D2U4WJ6][BBoxTexture] ready`、`[2D2U4WJ6][Ground] before/after`、`[2D2U4WJ6][UVFix]` | tile mosaic 貼地流程；tile 載入失敗或材質錯位時關鍵診斷 | `DEBUG_TILE_MOSAIC` |
| `builders/base-task-payload.builder.ts` | `build()` | `[BUILDER_SECTION][ENTER/DONE]`（16 calls） | payload 建構各 section 的進入/完成追蹤；有 section 失敗時可快速定位 | `DEBUG_PAYLOAD_BUILD` |
| `builders/base-task-payload.builder.ts` | `buildUeSection()` | `[UE_PAYLOAD][BUILD]` | UE 座標 payload 輸出；UE 位置不對時診斷 | `DEBUG_PAYLOAD_BUILD` |
| `builders/base-task-payload.builder.ts` | `buildObstacleSection()` | `[ObstacleSection][STEP1-4]`、`[ObstacleFlow][store->builder]`、`[Phase0][ObstacleSerialize]` | Obstacle 序列化各步驟；建物/障礙物資料缺失時診斷 | `DEBUG_PAYLOAD_BUILD` |
| `builders/obstacle-serializer.builder.ts` | `serialize()` | `[Phase9][ObstacleSerializer]`、`[ObstacleSerializer][merge-layer]`、`[Phase3][ObstacleSerializer]`、`[Building][Obstacle][TuplePreview]`、`[BuildingRect][Payload]` | 障礙物 tuple 序列化診斷；後端收到錯誤格式時追蹤 | `DEBUG_OBSTACLE_SERIAL` |
| `utils/building-obstacle-normalize.helper.ts` | `normalizeBuilding()` | `[Obstacle][Building][PositionSource]`、`[Obstacle][Building][Normalized]`、`[BuildingRect][Normalized]`、`[Obstacle][Building][Fallback]` | OSM 建物正規化路徑追蹤；建物座標異常時診斷 | `DEBUG_OBSTACLE_SERIAL` |
| `services/task-api.service.ts` | `postStoreTask()` | `[SIM_API_PHASE2][storeTask][request]`、`[storeTask][response]` | 模擬 API 請求/回應追蹤；API 格式錯誤時診斷；但**包含 payload 物件** | `DEBUG_SIM_API` |
| `services/simulation-api.service.ts` | `postSimulation()` | `[SIM_API_PHASE2][simulation][request]`、`[simulation][response]` | 同上 | `DEBUG_SIM_API` |
| `services/result-api.service.ts` | `getCompleteCalcResult()` | `[SIM_API_PHASE2][completeCalcResult][request]`、`[completeCalcResult][response]` | 結果 API 追蹤；**response log 可能輸出數 MB 結果** | `DEBUG_SIM_API` |
| `pages/EditScene/EditScene.component.ts` | `runSimulationApiFlow()` | `[SIM_API_PHASE3][payload ready]`、`[SIM_API_PHASE3][builderPayload]`、`[SIM_RESOLUTION_CHECK]` | 模擬 payload 最終狀態確認；解析錯誤時診斷 | `DEBUG_SIM_API` |
| `pages/EditScene/EditScene.component.ts` | `renderBackendHeatmapFromCompleteCalcResult()` | `[HEATMAP][PIPELINE]`、`[HEATMAP][TRACE]`、`[SINR_DEBUG][5GOutput keys]` | heatmap 渲染流程追蹤；熱圖不顯示時診斷 | `DEBUG_HEATMAP` |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `resolveObjectCard()` | `[RightSidebar][DEBUG][object-bs]`、`[object-ris]`、`[object-terminal]`、`[object-ue-rows]`、`[RIS_UI_TRACE_FULL]` | 右側面板物件資料對應診斷；UI 顯示錯誤欄位時追蹤 | `DEBUG_SIDEBAR_OBJECT` |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `buildApiOnlyPayload()` | `[API_ONLY][field]`、`[API_ONLY][bs]`、`[API_ONLY][ue]`、`[API_ONLY][observe]`、`[API_ONLY][bs][fallback]` | API payload 各欄位建構確認；payload 欄位缺失時診斷 | `DEBUG_SIM_API` |
| `components/modals/antenna-pattern-modal/antenna-pattern-viewer.ts` | `buildAngleChecklist()`、`verifyPhiRing()` | `[AngleChecklist]`（12 calls）、`[ReferenceRings]`（5 calls）、`========== PHI RING ==========`系列 | 天線 pattern 角度驗證；pattern 顯示異常時唯一診斷工具；但輸出量極大 | `DEBUG_ANTENNA_PATTERN` |
| `components/modals/antenna-pattern-modal/antenna-pattern-viewer.ts` | `buildPattern()` | `[ColorDbg]`、`[ColorDbgRGB]`、`[Pattern] vtx:` | pattern mesh 頂點 + 顏色計算；3D 圖形錯誤時診斷 | `DEBUG_ANTENNA_PATTERN` |
| `pages/EditScene/components/panels/edit-task-panel/edit-task-panel.component.ts` | `onScsChange`、`onDuplexModeChange`、`onUlScsChange`、`onDlScsChange` | `[TDD] scs changed =`、`[TDD] bandwidth options =`、`[Duplex] changed =`、`[FDD]` 系列（8 calls） | 頻段/頻寬 UI 聯動邏輯；頻寬選項計算錯誤時診斷 | `DEBUG_TASK_PANEL` |
| `services/ris.service.ts` | `loadRisListFromApi()`、`add()`、`addRisProfile()`、`getRisRawDataOnApi()`、`updateRisProfileOnApi()`、`deleteRisProfileOnApi()`、`updateRisOnApi()` | `[RisService] GET/POST/DELETE` + url + params（8 calls） | RIS API 呼叫 URL 與參數追蹤；API 404/500 時定位哪個請求失敗 | `DEBUG_RIS_API` |
| `pages/EditScene/components/panels/edit-field-panel/edit-field-panel.component.ts` | RIS settings handlers | `[RIS][REAL_CONFIRM_ENTRY]`、`[RIS][ANGLE_STORE_BEFORE_PATCH]`、`[RIS][STORE_BEFORE_PATCH]`、`[RIS][ANGLE_PATCH_INPUT]`、`[RIS][ANGLE_STORE_AFTER_PATCH]`、`[RIS][STORE_AFTER_PATCH]` | RIS 角度設定 store patch 前後狀態；RIS 設定不生效時追蹤 | `DEBUG_RIS_STORE` |

---

## 4. Keep as Warn/Error

這些 warn/error 有明確的錯誤條件，應保留。部分 message 品質可改善但邏輯正確。

| File | Method / Area | Purpose | Message Quality | Notes |
|------|--------------|---------|-----------------|-------|
| `services/ris.service.ts` | `loadRisListFromApi()` `catchError` | `[RisService] loadRisListFromApi error` | Good — 有 tag、有 error 物件 | 無使用者提示，log 是唯一紀錄 |
| `services/ris.service.ts` | `add()` `catchError` | `[RisService] addRis error` | Good | — |
| `services/ris.service.ts` | `addRisProfile()` `catchError` | `[RisService] addRisProfile error` | Good | — |
| `services/ris.service.ts` | `getRisRawDataOnApi()` `catchError` | `[RisService] getRisRawDataOnApi error` | Good | — |
| `services/ris.service.ts` | `updateRisProfileOnApi()` `catchError` | `[RisService] updateRisProfileOnApi error` | Good | — |
| `services/ris.service.ts` | `updateRisOnApi()` `catchError` | `[RisService] updateRisOnApi error` | Good | — |
| `components/modals/pathloss-model-manage-modal/pathloss-model-manage-modal.component.ts` | `refresh`、`update`、`delete`、`add` catch blocks | `[PathlossManageModal] refresh/update/delete/add failed` | Good — 4 calls 全為有效 error catch | 這是此檔案全部的 console 呼叫 |
| `components/modals/antenna-manage-modal/antenna-manage-modal.component.ts` | `refresh()`、`upload`、`edit`、`delete` catch | `[AntennaManageModal] refresh failed`、`upload failed`、`edit failed`、`delete failed` | Good | 6 calls，都在 catch block |
| `components/modals/ris-manage-modal/ris-manage-modal.component.ts` | `add`、`update`、`delete`、`refreshList` catch | `[RisManageModal] add RIS failed`、`update error`、`delete error`、`refreshList error` | Good | 6 calls，都在 catch block |
| `components/modals/ris-config-manage-modal/ris-config-manage-modal.component.ts` | `deleteRisProfileOnApi`、`addRisProfile`、`updateRisProfile`、`refreshProfiles` catch | `[RisConfigManageModal] deleteRisProfileOnApi/addRisProfile/updateRisProfileOnApi error` | Good | 5 calls in catch |
| `components/modals/ris-config-edit-modal/ris-config-edit-modal.component.ts` | `loadRawData`、`Excel parse` catch | `[RisConfigEditModal] loadRawData failed`、`Excel parse error` | Good | — |
| `components/map-picker/map-picker.component.ts` | `generatePreview()` catch | `[MapPicker] preview generate failed` | Good | 用 console.error 正確 |
| `components/map-picker/map-picker.component.ts` | `onSearchSubmit()` catch | `[MapPicker][Nominatim] search failed` | Good — 有 tag + 有 err 物件 | 此外還有 UI 錯誤顯示，雙重保障 |
| `components/map-picker/map-picker.component.ts` | abort 條件（5 warns） | `preview confirm blocked: no pending bbox`、`preview confirm blocked: flow locked`、`confirm blocked: no bbox selected`、`initLeaflet aborted: no leafletHost`、`preview generate skipped: canvas size not ready` | Good — 每條說明了阻斷原因 | warn level 正確 |
| `pages/EditScene/components/map-scene/map-scene.component.ts` | `destroy()` catch、`getOSMData` catch | `[MapScene] destroy error`、`[MapScene] getOSMData error =` | Good | error level 正確 |
| `pages/EditScene/EditScene.component.ts` | `deleteObject()` | `[Delete][FieldStore] failed`、`[Delete][FieldStoreFallback] failed`、`[Delete][Dispose] failed` | Good | 3 error calls in catch |
| `pages/EditScene/EditScene.component.ts` | `alignToGround()` catch | `[alignToGround] Error aligning mesh:` | Good | — |
| `pages/EditScene/EditScene.component.ts` | `updateMeshTransform()` catch | `[updateMeshTransform] Error updating mesh:` | Good | — |
| `utils/building-obstacle-normalize.helper.ts` | `normalizeBuilding()` | `[Obstacle][Building][Skip]`（3 warns） | Good — 說明跳過原因 | skip 行為被標記為 warn 正確 |
| `builders/obstacle-serializer.builder.ts` | `serializeRow()` | `[ObstacleSerializer][skip-row-no-position]` | Good — 有 row 資訊 | skip 用 warn 正確 |
| `pages/EditScene/components/panels/edit-field-panel/edit-field-panel.component.ts` | `loadMaterials()` catch | `[EditFieldPanel][ObstacleMaterial] failed to load` | Good | — |
| `components/modals/material-manage-modal/material-manage-modal.component.ts` | CRUD catch blocks | 4 error calls for add/edit/delete/load failures | Good | — |
| `pages/NewProject/new-project.component.ts` | `loadHistoryProjects()` catch | `[NewProject] load history failed` | Good | catch 中唯一紀錄 |
| `services/logout-api.service.ts` | `catchError` | `[LogoutApi] logout request failed (stub) - ignored` | Fair — warn level 正確，但 "stub" 字眼暗示非生產實作 | 可接受；stub 說明有助交接 |
| `components/modals/antenna-pattern-modal/antenna-pattern-viewer.ts` | validate methods | `[AntennaPatternViewer] No pattern model`、`Invalid mode`、`No getGain function`、`cannot build pattern` | Good — 4 error calls 說明缺少前置條件 | error level 正確 |

---

## 5. Need Manual Review

不確定是否能移除的 log。刪前需確認是否仍有診斷或 QA 用途。

| File | Method / Area | Log Summary | Why Need Review |
|------|--------------|-------------|----------------|
| `pages/EditScene/EditScene.component.ts` | `getSessionForApi()` | `[SIM_API_PHASE3][session] using component session`、`using window.__sonSession`、`using DEV_TEMP_SESSION`、`using localStorage session` | 4 條 session 解析路徑 log；明確印出 session 取得來源。DEV_TEMP 標示表示開發期間用途；但若 session token 值本身被印出，屬敏感資料。需確認 log 內容是否含 token 值或僅含來源標籤 |
| `pages/EditScene/EditScene.component.ts` | `runSimulationApiFlow()` | `[SIM_API_PHASE3] completeCalcResult received` + `completeRes` 物件 | 直接印出完整計算結果物件（可能數 MB）。若後端結果含使用者資料，屬資料洩漏風險。需確認 `completeRes` 內容是否適合出現在 browser console |
| `pages/EditScene/EditScene.component.ts` | `runSimulationApiFlow()` | `[PAYLOAD_SOURCE_AUDIT]`、`[Patch3][FINAL_PAYLOAD]`、`[DBG][ONLY_REAL_BS_POSITION][FINAL_PAYLOAD_CHECK]`、`[ObstacleFlow][final-request-payload]` | 多條印出最終 payload 物件的 log。payload 含有座標、session、BS 設定等完整資料。目前仍需要用於 debug payload 組裝錯誤，但長期不應留在生產 | 高 — 含 session + 完整配置資料 |
| `pages/EditScene/EditScene.component.ts` | `runSimulationApiFlow()` | `[P3][finalBsPayload]`、`[VERIFY][bsList.defaultBs rebuilt from rows]`、`[DEBUG][VERIFY] payload after assembly` | BS payload 驗證 log 系列；與 bsList mock TODO 相關（`base-task-payload.builder.ts` L317）。當 bsList 仍來自 mock 時，這些 log 是確認 mock 資料是否正確傳入的唯一方式，**建議等 bsList 真實資料替換後再刪** | 高 — 與已知 Mock TODO 耦合 |
| `pages/EditScene/EditScene.component.ts` | `runSimulationApiFlow()` | `[RIS_PAYLOAD_FINAL]`、`[RISFlow][serializer/builder->finalPayload]`、`[ObstacleFlow][serializer/builder->finalPayload]` | RIS + Obstacle 最終 payload 確認；目前 RIS 設定流程較複雜，這些 log 在 RIS 資料不正確傳入時有診斷價值 | Medium — 需確認 RIS payload 流程是否已穩定 |
| `pages/EditScene/EditScene.component.ts` | `updateMeshTransform()` | `[updateMeshTransform] Updating X to Y on mesh Z`（7 calls — 每個 transform 屬性一條） | 每次使用者拖曳或調整物件都觸發。有助追蹤 mesh transform 異常，但頻率極高。需確認是否仍需要 | Medium — 操作頻繁，可能有效能影響 |
| `pages/EditScene/EditScene.component.ts` | `deleteObjectFromScene()` | `[Delete][Registry]`、`[Delete][FieldStore]`、`[Delete][Owner]`、`[Delete][Dispose]`、`[Delete][State]`（7 calls） | 刪除流程各步驟的完整追蹤。刪除後物件仍顯示或 store 不同步時需要這些 log。需確認刪除流程是否已穩定 | Medium |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `resolveForPathLoss()` | `[PathLoss] fetching model list, session=`、`[PathLoss] list result:`、`[PathLoss][RESOLVE]` | 3 條 log 含 session 值 + model list 內容。若 session 值本身被印出，屬敏感資料。需確認 log 內容 | Medium — 含 session 參數 |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `resolveObjectCard()` | `[OBS_DEBUG]`（L2492）、`[STORE_INSTANCE_SIDEBAR]` | OBS_DEBUG 印出 obstacles 完整資料；STORE_INSTANCE_SIDEBAR 印出整個 store 實例。大型物件直接輸出 | Medium — 大型物件輸出 |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `buildBsSimModeSection()` | `[SIM_MODE_FINAL_FIX]`（L593） | 印出 BS sim mode 解析結果；不確定此 log 是否仍反映現行邏輯或為過期 debug | Low |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `mapRisRowToViewModel()` | `[RIS_ROW_MAPPING]` | 每次 RIS row 被映射都輸出完整的 rawRow + mappedVm 物件；若 RIS 清單大，輸出量可觀 | Low |
| `pages/EditScene/components/right-sidebar/right-sidebar.component.ts` | `DEBUG FULL DATA` | `[DEBUG FULL DATA]`（L492） | 印出 `this._data`，可能是整個 field store snapshot。無法在不讀 right-sidebar 完整 context 的情況下判斷安全性 | Medium — 可能含完整 store 快照 |
| `services/field-domain-store.service.ts` | `addSubfield()` | `[SUBFIELD_ADD_SERVICE_ENTER/DONE]`、`[SUBFIELD_STORE_WRITE]` + `this` 物件 | `this` 物件被直接印出，等同印出整個 service 實例；可能含 private state | Medium — `this` 物件輸出 |
| `builders/base-task-payload.builder.ts` | `buildBsSection()` | `[BaseTaskPayloadBuilder][planning]`（L234） | 印出 planning 物件；與 mock TODO 相關；當 bsList 替換後應重新評估此 log | Low |
| `builders/base-task-payload.builder.ts` | `buildObstacleSection()` | `[ObstacleFlow][store->builder][rows]` | 印出 obstacles rows 陣列；OSM 建物多時輸出量極大 | Medium — 大型陣列輸出 |
| `pages/EditScene/EditScene.component.ts` | `[SINR_DEBUG][completeCalcResult]` (L15991) | 印出完整 `result` 物件 | 完整計算結果物件，可能極大。與 `[SIM_API_PHASE3] completeCalcResult received` 重複印出同一資料 | High — 重複 + 大型物件 |
| `components/modals/antenna-add-modal/antenna-add-modal.component.ts` | `onConfirm()` | `[AntennaAddModal] confirm clicked - sha256sum=`、`[AntennaAddModal] parsedMeta` | sha256sum 本身無敏感性；parsedMeta 內容需確認是否含完整 Excel 解析結果 | Low |
| `components/modals/ris-add-modal/ris-add-modal.component.ts` | `onConfirm()` | `[RIS ADD PAYLOAD]`（L455）、`[RisAddModal] confirm clicked - payload=` | payload 物件直接輸出；含 RIS 完整設定。兩條 log 重複輸出同一 payload | Low — 但屬資料重複輸出 |
| `components/modals/ris-config-add-modal/ris-config-add-modal.component.ts` | `onConfirm()` | `[RisConfigAddModal] confirm clicked - payload=` | 同上，payload 直接輸出 | Low |

---

## 附錄：各檔案分類摘要

| File | Total | Remove | Debug Flag | Keep Warn/Error | Need Review |
|------|-------|--------|-----------|-----------------|-------------|
| `EditScene.component.ts` | 782 | ~30 | ~200 | ~80 | ~472 |
| `antenna-pattern-viewer.ts` | 207 | 0 | ~185 | 12 | 10 |
| `map-test.component.ts` | 61 | 61 | 0 | 0 | 0 |
| `map-picker.component.ts` | 33 | 0 | ~11 | ~16 | 6 |
| `edit-task-panel.component.ts` | 24 | ~5 | ~14 | 0 | 5 |
| `map-scene.component.ts` | 24 | 0 | ~20 | 4 | 0 |
| `right-sidebar.component.ts` | 23 | 2 | ~6 | 1 | 14 |
| `base-task-payload.builder.ts` | 23 | 0 | ~20 | 0 | 3 |
| `ris-config-manage-modal.component.ts` | 22 | 3 | 5 | 5 | 9 |
| `antenna-manage-modal.component.ts` | 22 | 3 | 7 | 6 | 6 |
| `ris-manage-modal.component.ts` | 21 | 4 | 5 | 6 | 6 |
| `ris-config-edit-modal.component.ts` | 19 | 2 | 10 | 3 | 4 |
| `map-generator.service.ts` | 14 | 0 | 14 | 0 | 0 |
| `ris.service.ts` | 14 | 0 | 8 | 6 | 0 |
| `ris-add-modal.component.ts` | 14 | 2 | 7 | 0 | 5 |
| `top-bar.component.ts` | 17 | 13 | 0 | 0 | 4 |
| `ris-config-add-modal.component.ts` | 13 | 2 | 8 | 1 | 2 |
| `antenna-add-modal.component.ts` | 18 | 2 | 10 | 2 | 4 |
| `antenna-edit-modal.component.ts` | 12 | 2 | 6 | 3 | 1 |
| `map-preview.service.ts` | 9 | 0 | 7 | 2 | 0 |
| `new-project.component.ts` | 8 | 2 | 3 | 1 | 2 |
| `banner.component.ts` | 8 | 5 | 0 | 1 | 2 |
| `obstacle-serializer.builder.ts` | 8 | 0 | 7 | 1 | 0 |
| `building-obstacle-normalize.helper.ts` | 8 | 0 | 4 | 3 | 1 |
| `glbmap.component.ts` | 14 | 5 | 3 | 6 | 0 |
| `edit-field-panel.component.ts` | 16 | 0 | 10 | 2 | 4 |
| `result-data.service.ts` | 4 | 4 | 0 | 0 | 0 |
| `field-domain-store.service.ts` | 3 | 0 | 1 | 0 | 2 |
| `task-api.service.ts` | 2 | 0 | 2 | 0 | 0 |
| `simulation-api.service.ts` | 2 | 0 | 2 | 0 | 0 |
| `result-api.service.ts` | 2 | 0 | 2 | 0 | 0 |
| `logout-api.service.ts` | 2 | 1 | 0 | 1 | 0 |
| `left-sidebar.component.ts` | 4 | 4 | 0 | 0 | 0 |
| `pathloss-model-manage-modal.component.ts` | 4 | 0 | 0 | 4 | 0 |
| 其餘 27 檔案 | ~90 | ~25 | ~30 | ~20 | ~15 |
| **合計（估算）** | **1,571** | **~176** | **~606** | **~287** | **~502** |

---

> **注意**：EditScene.component.ts 的 "Need Review" 數量龐大，原因是該檔案 782 條 log 中有大量 payload dump、session log、coordinate trace 混合，不讀完整程式碼無法逐一確認刪除安全性。建議 EditScene 另開獨立 audit session 處理。
