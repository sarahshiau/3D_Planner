# API Call Flow and Payload Source

> **交接用途**：本文件完整記錄前端所有 API 呼叫位置、payload 欄位來源、錯誤處理方式與已知風險。
> 供下一位開發者在不閱讀 648KB EditScene.component.ts 的前提下，快速掌握系統 API 全貌。
>
> **代理設定**：`proxy.conf.json` → `/son/*` 轉發至 `http://211.20.94.215:3000`
> **Session**：全系統 hardcoded `'son_session_37a4ed55-2c75-4ac4-9c31-c2fd6bbedf19'`（見 Section 6）

---

## 1. API Inventory

| No. | API / Endpoint | Method | Purpose | Caller File | Caller Method | Request Source | Response Usage | Risk / Notes |
|-----|----------------|--------|---------|-------------|---------------|----------------|----------------|--------------|
| 1 | `/son/storeTask` | POST | 儲存任務（模擬前置） | `task-api.service.ts` | `postStoreTask(payload)` | `BaseTaskPayloadBuilder.build()` → `demoPayload` | 解析 `taskid` 供後續使用 | Content-Type: text/plain；body = JSON.stringify |
| 2 | `/son/simulation` | POST | 觸發模擬計算 | `simulation-api.service.ts` | `postSimulation(payload)` | 同 storeTask 的 `demoPayload` | 確認模擬啟動，進入 progress 輪詢 | Content-Type: text/plain |
| 3 | `/son/progress/:taskId/:sessionId` | GET | 輪詢模擬進度 | `EditScene.component.ts` | `pollSimulationProgress()` | path params（taskId, sessionId） | progress === 1 時繼續；否則等待 | inline `this.http.get`；最多 40 次，每次 3 s，逾時 10 s |
| 4 | `/son/completeCalcResult/:taskId/:sessionId` | GET | 取得完整計算結果 | `result-api.service.ts` | `getCompleteCalcResult()` | path params（taskId, sessionId） | `ResultDataService.setResultData()` | 回應體可能數 MB；欄位名稱為後端合約 |
| 5 | `/son/history/:userId/:session` | GET | 取得歷史任務列表 | `new-project.component.ts` | `loadHistoryProjects()` | `auth.id` + `auth.session`（path params） | 顯示歷史記錄下拉 | **⚠ Need Verification**：inline HTTP call，未封裝成 service |
| 6 | `/son/getAntenna/:session` | GET | 取得天線列表 | `antenna.service.ts` | `getAntennas()` / `getAntennasAsDto()` | session（path param） | 天線選擇 UI；存入 Signal | — |
| 7 | `/son/getAntennaRawData/:id/:session` | GET | 取得天線原始 pattern 資料 | `antenna.service.ts` | `getAntennaRawData()` | antennaId + session（path params） | 天線 pattern 圖表顯示 | — |
| 8 | `/son/uploadAntenna/:session` | POST | 上傳新天線（Excel/CSV） | `antenna.service.ts` | `uploadAntenna()` | FormData（file, name, sha256sum, property, type, band, protocol, port, model, manufactor） | 回傳新天線 ID | multipart/form-data |
| 9 | `/son/updateAntenna/:session` | POST | 更新天線資料 | `antenna.service.ts` | `updateAntenna()` | FormData（天線 metadata） | — | — |
| 10 | `/son/deleteAntenna/:id/:session` | **GET** | 刪除天線 | `antenna.service.ts` | `deleteAntenna()` | antennaId + session（path params） | — | **⚠ 刪除操作使用 GET**（後端合約設計） |
| 11 | `/son/getRis/:session` | GET | 取得 RIS 列表 | `ris.service.ts` | `loadRisListFromApi()` | session（path param） | 填入 RIS 選擇 UI；同步 in-memory mock DB | catchError 回傳 `of([])` |
| 12 | `/son/addRis/:session` | POST | 新增 RIS | `ris.service.ts` | `add()` | JSON.stringify(AddRisPayload) | 解析回傳 risID，更新 mock DB | Content-Type: text/plain；responseType: 'text' |
| 13 | `/son/addRisProfile/:risID/:session` | POST | 新增 RIS Profile | `ris.service.ts` | `addRisProfile()` | FormData（profileName, incHorizontal, incVertical, refHorizontal, refVertical, refCoefficient, sha256sum, file） | — | multipart/form-data；角度欄位以 JSON.stringify 編碼 |
| 14 | `/son/getRisProfiles/:id/:session` | GET | 取得 RIS 下所有 Profile | `ris.service.ts` | `getRisProfilesOnApi()` | risId + session（path params） | Profile 選擇 UI | — |
| 15 | `/son/getRisRawData/:rid/:pid/:session` | GET | 取得 RIS profile 原始圖表資料 | `ris.service.ts` | `getRisRawDataOnApi()` | risId + profileId + session（path params） | RIS pattern 圖表顯示 | — |
| 16 | `/son/updateRisProfile/:rid/:session` | POST | 更新 RIS Profile | `ris.service.ts` | `updateRisProfileOnApi()` | FormData（profileID, profileName, 角度欄位, sha256sum; file optional） | — | — |
| 17 | `/son/deleteRisProfile/:rid/:pid/:session` | DELETE | 刪除 RIS Profile | `ris.service.ts` | `deleteRisProfileOnApi()` | risId + profileId + session（path params） | — | responseType: 'text' |
| 18 | `/son/updateRis/:session` | POST | 更新 RIS 資料 | `ris.service.ts` | `updateRisOnApi()` | JSON.stringify(UpdateRisPayload) | — | Content-Type: text/plain；responseType: 'text' |
| 19 | `/son/deleteRis/:risID/:session` | DELETE | 刪除 RIS | `ris.service.ts` | `deleteRisOnApi()` | risId + session（path params） | — | 真正使用 DELETE（與其他刪除端點不同） |
| 20 | `/son/getObstacle/:session` | GET | 取得材質列表 | `material.service.ts` | `getMaterials()` | session（path param） | 填入材質選擇 UI | **⚠ 端點名稱為 Obstacle，前端當材質用** |
| 21 | `/son/getObstacle/:session` | GET | 取得障礙物選項列表 | `obstacle-master.service.ts` | `getObstacles()` | session（path param） | 障礙物材質選擇 | **⚠ 與 material.service.ts 共用同一端點**；有 in-memory cache |
| 22 | `/son/addObstacle/:session` | POST | 新增材質 | `material.service.ts` | `addMaterial()` | JSON.stringify({ name, chineseName }) | — | Content-Type: text/plain; charset=utf-8 |
| 23 | `/son/updateObstacle/:session` | POST | 更新材質 | `material.service.ts` | `updateMaterial()` | JSON.stringify({ id, name, chineseName }) | — | — |
| 24 | `/son/deleteObstacle/:session` | POST | 刪除材質 | `material.service.ts` | `deleteMaterial()` | JSON.stringify({ id, name }) | — | Content-Type: text/plain |
| 25 | `/son/getPathLossModel/:session` | GET | 取得路損模型列表 | `pathloss-model.service.ts` | `getList()` | session（path param） | 路損選擇 UI；未選則 fallback id = 12 | Promise-based（非 Observable） |
| 26 | `/son/addPathLossModel/:session` | POST | 新增路損模型 | `pathloss-model.service.ts` | `addPathLossModel()` | JSON.stringify({ name, chineseName, distancePowerLoss, fieldLoss, property }) | 回傳 `{ insertId, msg }` | Content-Type: text/plain; charset=utf-8 |
| 27 | `/son/updatePathLossModel/:session` | POST | 更新路損模型 | `pathloss-model.service.ts` | `updatePathLossModel()` | JSON.stringify({ id, name, chineseName, distancePowerLoss, fieldLoss, property }) | 回傳 `{ msg }` | Content-Type: text/plain; charset=utf-8 |
| 28 | `/son/deletePathLossModel/:session` | POST | 刪除路損模型 | `pathloss-model.service.ts` | `deletePathLossModel()` | JSON.stringify({ id, name }) | 回傳 `{ msg }` | Content-Type: text/plain; charset=utf-8 |
| 29 | `/son/calculatePathLossModel/:session` | POST | 上傳模型檔案並啟動計算 | `pathloss-model.service.ts` | `calculateFromFile()` | FormData（file, name, sha256sum, property） | 回傳 `{ id, msg }` | multipart/form-data |
| 30 | `/son/pollingPathLossModel/:session` | POST | 輪詢路損計算進度 | `pathloss-model.service.ts` | `pollPathlossModel()` / `waitForPollComplete()` | JSON.stringify([ { id } ]) | 計算完成後更新列表 | 最多 30 次，每次 1 s；Promise-based |
| 31 | `/api/auth/logout` | POST | 登出 | `logout-api.service.ts` | `logout()` | 無 body | 不使用（錯誤被吞） | **⚠ Stub 實作**；失敗時返回 `{ ok: false, stub: true }`；session token 仍有效 |
| 32 | `https://nominatim.openstreetmap.org/search` | GET | 地名 / 地址搜尋 | `map-picker.component.ts` | `onSearchSubmit()` | `?format=json&limit=6&addressdetails=1&q=:query`（URL encoded） | lat/lon → 地圖中心定位 | 外部服務；使用 `fetch()`（非 HttpClient）；無 API Key；Rate limit: 1 req/s |
| 33 | `https://overpass-api.de/api/interpreter`（+ 2 備援） | POST | 取得 OSM 建物邊界資料 | `map-generator.service.ts` | `getOSMData()` | `data=:overpassQL`（application/x-www-form-urlencoded） | 轉為 BabylonJS Mesh | 外部服務；3 站點輪詢；bbox > 0.02 度易 504 |
| E1 | `/son/progress/:taskId/:sessionId` | GET | 模擬進度（EditScene 直呼） | `EditScene.component.ts` L17487 | `pollSimulationProgress()` | taskId + sessionId（URL encode） | p === 1 → 'completed'；malformed → 'fallback_result' | inline `this.http.get`；10 s timeout per request |

---

## 2. API Group by Feature

---

### 2.1 Simulation APIs

#### storeTask

- **Endpoint:** `POST /son/storeTask`
- **Method:** `TaskApiService.postStoreTask(payload: BaseTaskPayload)`
  - 呼叫端：`EditScene.component.ts` L18788 `runSimulationApiFlow()`
- **Trigger:** 使用者點擊「開始計算」→ `onStartCompute()` L3841 → `runSimulationApiFlow()` L17563
- **Request Parameters:** 無 query/path params
- **Request Body:** `JSON.stringify(demoPayload)`（字串，非物件）
- **Request Body Source:** `BaseTaskPayloadBuilder.build(input)` 產生 `builtPayload`，EditScene 再組裝為 `demoPayload`（**⚠ 實際送出的是 demoPayload，不是 builtPayload 本身**）
- **Headers:** `Content-Type: text/plain`、`Accept: application/json, text/plain, */*`
- **Response Shape:** `HttpResponse<string>`（responseType: 'text'，observe: 'response'）；body 為 JSON 字串，含 `{ taskid }`
- **Response Usage:** 解析 `parsed.taskid`，若解析失敗則沿用 `originalTaskId`；taskId 用於後續 simulation + progress + completeCalcResult
- **Related State / Service:** `TaskApiService`、`AuthService`（sessionid 來源）
- **Error Handling:** 無 catchError；Observable 錯誤由 `runSimulationApiFlow()` 的 try/catch 捕捉，僅 console.error，**無使用者提示**
- **Risk / Need Verification:** `demoPayload` 組裝邏輯散落在 EditScene 中，`bsList.defaultBs` 目前仍來自 MOCK template（見 Section 4）

---

#### simulation

- **Endpoint:** `POST /son/simulation`
- **Method:** `SimulationApiService.postSimulation(payload: BaseTaskPayload)`
  - 呼叫端：`EditScene.component.ts` L18872
- **Trigger:** storeTask 成功後立即觸發
- **Request Parameters:** 無
- **Request Body:** 同 storeTask 的 `demoPayload`（JSON.stringify）
- **Request Body Source:** 同 storeTask
- **Headers:** `Content-Type: text/plain`、`Accept: application/json, text/plain, */*`
- **Response Shape:** `HttpResponse<string>`（responseType: 'text'，observe: 'response'）
- **Response Usage:** 僅確認 HTTP status；回應 body 不解析
- **Related State / Service:** `SimulationApiService`
- **Error Handling:** 同 storeTask；無 catchError，由外層 try/catch 處理
- **Risk / Need Verification:** 回應 body 未解析；若後端回傳錯誤訊息，前端無從得知細節

---

#### progress（輪詢）

- **Endpoint:** `GET /son/progress/:taskId/:sessionId`
- **Method:** `EditScene.component.ts` `pollSimulationProgress(taskId, sessionId)` L17480（private，未封裝成 service）
- **Trigger:** simulation API 回應後立即開始輪詢
- **Request Parameters:** taskId + sessionId（path params，URL encoded）
- **Request Body:** 無
- **Response Shape:** JSON `{ percent?: number, progress?: number, status?: string }`（透過 `extractProgressValue()` 正規化）
- **Response Usage:**
  - `extractProgressValue(res) === 1` → 返回 `'completed'`，繼續取 completeCalcResult
  - malformed response → 返回 `'fallback_result'`（仍繼續取 completeCalcResult）
  - TimeoutError（10 s）→ 繼續下一次嘗試
  - 其他錯誤 → 拋出，中止流程
- **Polling Config:** 最多 40 次、每次間隔 3000 ms、每次請求 timeout 10000 ms
- **Related State / Service:** 直接使用 `this.http`（inject 至 EditScene）
- **Error Handling:** try/catch per attempt；TimeoutError 繼續；malformed response 轉 fallback_result；exhausted（40 次後）拋出 `'Simulation progress polling timeout'`
- **Risk / Need Verification:**
  - **⚠ 未封裝成 service**，bypasses 所有 service 層
  - 超時後無使用者提示（僅 console.error）
  - fallback_result 行為需確認是否符合後端預期

---

#### completeCalcResult

- **Endpoint:** `GET /son/completeCalcResult/:taskId/:sessionId`
- **Method:** `ResultApiService.getCompleteCalcResult(taskId, sessionId)` → 呼叫端 `EditScene.component.ts` L18891
- **Trigger:** progress 返回 `'completed'` 或 `'fallback_result'` 後
- **Request Parameters:** taskId + sessionId（path params）
- **Response Shape:** 大型巢狀 JSON，關鍵結構：
  ```
  {
    "5GOutput": {
      sinrMap: [...],
      rsrpMap: [...],
      dlThroughputMap: [...],
      ulThroughputMap: [...],
      chosenRisList: [...]
    },
    input: { risList: [...] }
  }
  ```
- **Response Usage:**
  - `this.completeCalcResult = completeRes`（EditScene 本地）
  - `ResultDataService.setResultData(completeRes)` → Signal 更新
  - `sliceHeightOptions` 解析
  - heatmap 渲染（SINR / RSRP / DL / UL throughput）
  - **⚠ `resultService.setResultMvp(RESULT_MVP_MOCK)`** — MVP 面板資料為 hardcoded mock
- **Related State / Service:** `ResultApiService`、`ResultDataService`（Angular Signal）
- **Error Handling:** `completeRes` 為空時 → `resultService.resetToEdit()`，無使用者提示；其他錯誤由外層 catch 捕捉
- **Risk / Need Verification:**
  - `RESULT_MVP_MOCK` 為 hardcoded，右側結果面板 MVP 數字**不反映真實計算結果**
  - 回應欄位名稱（`5GOutput`、`sinrMap` 等）為後端合約，任何改名需同步更新 extractor

---

### 2.2 Result APIs

`result-data.service.ts` 為純狀態服務（Angular Signal），無 HTTP 呼叫。

| Signal | 預設值 | 設定時機 |
|--------|--------|---------|
| `_viewMode` | `'edit'` | `setResultData()` / `setResultMvp()` 後切換為 `'result'`；`resetToEdit()` 還原 |
| `_result` | `null` | `setResultData(data: ResultApiResponse)` |
| `_resultMvp` | `null` | `setResultMvp(data: ResultMvpData)`（**⚠ 目前傳入 RESULT_MVP_MOCK**） |

---

### 2.3 Antenna APIs

所有端點由 `antenna.service.ts` 封裝。

#### get antenna list

- **Endpoint:** `GET /son/getAntenna/:session`
- **Caller:** `AntennaService.getAntennas(sessionOverride?)` / `getAntennasAsDto(sessionOverride?)`
- **Trigger:** 開啟天線管理 modal 或場景初始化時
- **Request Parameters:** session（path param）
- **Request Body:** 無
- **Response Shape:** 天線陣列；多種 wrapper 格式（`array`、`{ data }`）透過 `extractArray` 正規化
- **Response Usage:** 正規化後存入 `antennaRows` Signal（`normalizeAnyToDto` → `mapDtoToRow`）
- **Related State / Service:** `AntennaService`、`AuthService`
- **Error Handling:** 無顯式 catchError；錯誤傳播
- **Risk:** Mock DB（`MOCK_ANTENNAS`）存在但並非 catchError fallback；session hardcoded（L89）

---

#### get antenna raw data

- **Endpoint:** `GET /son/getAntennaRawData/:id/:session`
- **Caller:** `AntennaService.getAntennaRawData(antennaId, sessionOverride?)`
- **Trigger:** 使用者點擊天線查看 pattern
- **Request Parameters:** antennaId + session（path params）
- **Response Shape:** `AntennaRawDataResponseDto`
- **Response Usage:** 天線 pattern 圖表渲染

---

#### upload antenna

- **Endpoint:** `POST /son/uploadAntenna/:session`
- **Caller:** `AntennaService.uploadAntenna(session, draft, file, sha256sum)`
- **Trigger:** 使用者上傳新天線檔案
- **Request Body:** FormData 欄位：`file`, `name`, `sha256sum`, `property`, `type`, `band`, `protocol`, `port`, `model`, `manufactor`
- **Error Handling:** `catchError` → 映射至 `AntennaUploadDomainError` 型別

---

#### update antenna

- **Endpoint:** `POST /son/updateAntenna/:session`
- **Caller:** `AntennaService.updateAntenna(draft)`
- **Request Body:** FormData（天線 metadata）

---

#### delete antenna

- **Endpoint:** `GET /son/deleteAntenna/:id/:session`
- **Caller:** `AntennaService.deleteAntenna(antennaId)`
- **Request Parameters:** antennaId + session（path params）
- **⚠ Risk:** 刪除操作使用 HTTP GET；後端合約設計如此，勿改為 DELETE

---

#### antenna template download

- **Endpoint:** `assets/gltf/templates/UU_123.xlsx`（靜態資產）
- **Caller:** `antenna-pattern-xlsx.service.ts` L17 `downloadTemplate()`
- **Method:** `this.http.get(TEMPLATE_URL, { responseType: 'arraybuffer' })`
- **用途:** 觸發瀏覽器下載天線 pattern 範本 Excel 檔

---

### 2.4 RIS APIs

所有端點由 `ris.service.ts` 封裝。
**Session 取得優先順序**：`AuthService.getSessionInfo()` > `window.__sonSession` > `localStorage.getItem('son_session')`

#### get RIS list

- **Endpoint:** `GET /son/getRis/:session`
- **Caller:** `RisService.loadRisListFromApi(sessionOverride?)`
- **Trigger:** RIS 管理 modal 開啟或初始化
- **Response Shape:** `RisApi[]`
- **Response Usage:** 更新 UI 列表；**同步更新 in-memory mock DB**（`mockApiList`）
- **Error Handling:** `catchError` → 返回 `of([])`（靜默 fallback，不顯示錯誤）

---

#### add RIS

- **Endpoint:** `POST /son/addRis/:session`
- **Caller:** `RisService.add(payload, sessionOverride?)`
- **Request Body:** `JSON.stringify(AddRisPayload)`（Content-Type: text/plain）
- **Response:** responseType: 'text'；解析 risID
- **Response Usage:** 更新 mock DB（`mockApiList`）

---

#### add RIS profile

- **Endpoint:** `POST /son/addRisProfile/:risID/:session`
- **Caller:** `RisService.addRisProfile(risID, payload, sessionOverride?)`
- **Request Body:** FormData
  - `profileName`：字串
  - `incHorizontal`：`JSON.stringify(array)`
  - `incVertical`：`JSON.stringify(array)`
  - `refHorizontal`：數值
  - `refVertical`：數值
  - `refCoefficient`：數值
  - `sha256sum`：字串
  - `file`：File 物件

---

#### get RIS profiles

- **Endpoint:** `GET /son/getRisProfiles/:id/:session`
- **Caller:** `RisService.getRisProfilesOnApi(risID, sessionOverride?)`
- **Response Shape:** `RisProfileDto[]`

---

#### get RIS raw data

- **Endpoint:** `GET /son/getRisRawData/:rid/:pid/:session`
- **Caller:** `RisService.getRisRawDataOnApi(risID, profileID, sessionOverride?)`
- **Response Shape:** `RisRawDataApi`（正規化後）

---

#### update RIS profile

- **Endpoint:** `POST /son/updateRisProfile/:rid/:session`
- **Caller:** `RisService.updateRisProfileOnApi(risID, payload, sessionOverride?)`
- **Request Body:** FormData（必填：profileID, profileName, incHorizontal, incVertical, refHorizontal, refVertical, refCoefficient, sha256sum；選填：file）

---

#### delete RIS profile

- **Endpoint:** `DELETE /son/deleteRisProfile/:rid/:pid/:session`
- **Caller:** `RisService.deleteRisProfileOnApi(risID, profileID, sessionOverride?)`
- **Response:** responseType: 'text'

---

#### update RIS

- **Endpoint:** `POST /son/updateRis/:session`
- **Caller:** `RisService.updateRisOnApi(payload, sessionOverride?)`
- **Request Body:** `JSON.stringify(UpdateRisPayload)`（Content-Type: text/plain）

---

#### delete RIS

- **Endpoint:** `DELETE /son/deleteRis/:risID/:session`
- **Caller:** `RisService.deleteRisOnApi(risID, sessionOverride?)`
- **Response:** responseType: 'text'
- **Note:** 此端點確實使用 DELETE（其他多數刪除端點用 GET/POST）

---

**⚠ EditScene 直呼警告（繞過 RisService）**

`EditScene.component.ts` 約 L10758 / L10769 有 2 處直接 `this.http.get('/son/getRis/...')`，完全繞過 `RisService`。若 RisService URL 或邏輯調整，這兩處不會自動同步。

---

### 2.5 Path Loss Model APIs

所有端點由 `pathloss-model.service.ts` 封裝（全部為 Promise-based，非 Observable）。

#### get path loss model list

- **Endpoint:** `GET /son/getPathLossModel/:session`
- **Caller:** `PathlossModelService.getList(sessionOverride?): Promise<PathlossApiDto[]>`
- **Trigger:** 路損模型選擇 UI 開啟
- **Response Usage:** 下拉選單；**若未選擇則 fallback `pathLossModelId = 12`**

---

#### add path loss model

- **Endpoint:** `POST /son/addPathLossModel/:session`
- **Caller:** `PathlossModelService.addPathLossModel(draft, sessionOverride?)`
- **Request Body:** `JSON.stringify({ name, chineseName, distancePowerLoss, fieldLoss, property })`（Content-Type: text/plain; charset=utf-8）
- **Response:** 解析 JSON 含 `{ insertId, msg }`；**有 JSON 解析 fallback**（text response → try JSON.parse）

---

#### update path loss model

- **Endpoint:** `POST /son/updatePathLossModel/:session`
- **Caller:** `PathlossModelService.updatePathLossModel(draft, sessionOverride?)`
- **Request Body:** `JSON.stringify({ id, name, chineseName, distancePowerLoss, fieldLoss, property })`

---

#### delete path loss model

- **Endpoint:** `POST /son/deletePathLossModel/:session`
- **Caller:** `PathlossModelService.deletePathLossModel(draft, sessionOverride?)`
- **Request Body:** `JSON.stringify({ id, name })`

---

#### calculate path loss model (from file)

- **Endpoint:** `POST /son/calculatePathLossModel/:session`
- **Caller:** `PathlossModelService.calculateFromFile(session, { file, name, sha256sum, property })`
- **Request Body:** FormData
- **Response:** `{ id, msg }`；id 用於 polling

---

#### polling path loss model

- **Endpoint:** `POST /son/pollingPathLossModel/:session`
- **Caller:** `PathlossModelService.pollPathlossModel(session, ids)` / `waitForPollComplete(session, id, opts)`
- **Request Body:** `JSON.stringify([ { id } ])`（Content-Type: text/plain; charset=utf-8）
- **Polling Config:** `waitForPollComplete` 最多 30 次，每次 1 s
- **Response Usage:** 計算完成後更新列表

---

### 2.6 Map / OSM / Overpass APIs

#### Nominatim（地名搜尋）

- **Endpoint:** `GET https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=:query`
- **Caller:** `map-picker.component.ts` `onSearchSubmit()`
- **Trigger:** 使用者在地圖搜尋欄輸入後送出（manual submit，非 auto-query）
- **Request Parameters:** `q`（URL encoded）
- **Request Body:** 無
- **HTTP Client:** 瀏覽器原生 `fetch()`（**非 Angular HttpClient**）
- **Headers:** `Accept-Language: zh-TW,zh;q=0.9,en;q=0.6`
- **Response Shape:** `[{ display_name, lat, lon, ... }]`
- **Response Usage:** 取第一筆 lat/lon，移動地圖中心點
- **Error Handling:** catch → 設定 `searchError` 顯示訊息
- **Risk:** 外部服務；無 API Key；Rate limit 1 req/s；CORS 依賴瀏覽器

---

#### Overpass API（OSM 建物資料）

- **Endpoints（依序輪詢）:**
  1. `https://overpass-api.de/api/interpreter`（主）
  2. `https://overpass.kumi.systems/api/interpreter`（備援 1）
  3. `https://overpass.nchc.org.tw/api/interpreter`（備援 2，台灣地區建議優先）
- **Caller:** `map-generator.service.ts` `getOSMData(bbox: BBox): Promise<any>`
- **Trigger:** 使用者框選地圖範圍後載入場景建物
- **Request Body:** `data=${encodeURIComponent(overpassQL)}`
- **Headers:** `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
- **Response Shape:** `{ elements: [{ type: 'way', id, tags, geometry: [{ lat, lon }] }] }`
- **Response Usage:** `generateBuildings(scene, data, bbox)` → BabylonJS Mesh；mesh.metadata 存 OSM tags + 估算高度 + 衰減參數
- **Error Handling:** 前一個 endpoint 失敗（504/429）才試下一個；全部失敗 → 拋出 `'Overpass 全部 endpoint 失敗'`
- **Risk:** bbox 超過約 0.02 度經緯度易 504；外部服務無認證

---

### 2.7 Other APIs

#### history tasks

- **Endpoint:** `GET /son/history/:userId/:session`
- **Caller:** `new-project.component.ts` `loadHistoryProjects()` L71（inline `this.http.get()`，未封裝）
- **Trigger:** NewProject 頁面載入時
- **Request Parameters:** `auth.id`（userId）+ `auth.session`（path params，URL encoded）
- **Response Shape:** **⚠ Need Verification** — 預期 `{ history: HistoryGroupItem[] }`，型別未確認
- **Response Usage:** 歷史記錄下拉清單
- **Error Handling:** catch → `this.projects = []`（靜默 fallback）
- **Risk:** 未封裝成 service；URL 格式需向後端確認

---

#### logout

- **Endpoint:** `POST /api/auth/logout`
- **Caller:** `logout-api.service.ts` `logout()`
- **Request Body:** 無
- **Headers:** `X-Debug-Stub: logout`
- **Error Handling:** `catchError` → 返回 `of({ ok: false, stub: true })`（錯誤被吞）
- **Risk:** Stub 實作；session token 不因此失效；成功/失敗對前端無影響

---

## 3. Main API Flow

### 3.1 Start Compute Flow

```
使用者點擊「開始計算」
  └─ EditScene.onStartCompute() [L3841]
       └─ runSimulationApiFlow() [L17563]
            ├─ Step 1: collectExecutionInputs()
            │    └─ 從 FieldDomainStoreService 取 obstacles, bs, ris, ue, zone 等
            │
            ├─ Step 2: BaseTaskPayloadBuilder.build(input)
            │    └─ 產生 builtPayload（見 Section 4 欄位來源）
            │
            ├─ Step 3: 組裝 demoPayload
            │    ⚠ builtPayload → demoPayload 的組裝邏輯散落在 EditScene 中
            │    ⚠ bsList.defaultBs 目前來自 MOCK template
            │
            ├─ Step 4: POST /son/storeTask (demoPayload)
            │    └─ 解析回應取 taskid（解析失敗 → 使用 originalTaskId）
            │
            ├─ Step 5: POST /son/simulation (demoPayload)
            │    └─ 確認 HTTP 200，不解析 body
            │
            ├─ Step 6: GET /son/progress/:taskId/:sessionId（輪詢）
            │    ├─ 最多 40 次，每 3000 ms，每次 timeout 10 s
            │    ├─ progress === 1 → 'completed' → 繼續
            │    ├─ malformed response → 'fallback_result' → 繼續
            │    └─ 超時 → throw → flow 中止
            │
            ├─ Step 7: GET /son/completeCalcResult/:taskId/:sessionId
            │    └─ 取得完整計算結果
            │
            ├─ Step 8: ResultDataService.setResultData(completeRes)
            │    ├─ 更新 Signal（_result）
            │    └─ 切換 viewMode 為 'result'
            │
            ├─ Step 9: renderBackendHeatmapFromCompleteCalcResult()
            │    └─ 渲染 SINR / RSRP / DL / UL heatmap
            │
            └─ Step 10: resultService.setResultMvp(RESULT_MVP_MOCK)
                 ⚠ MVP 面板為 hardcoded mock，非真實計算結果
```

**錯誤處理**：整個 flow 外層 try/catch；catch 僅 console.error，**不顯示任何使用者提示**；finally → `computeLoading = false`

---

### 3.2 RIS Add / Edit / Delete Flow

```
使用者開啟 RIS 管理 modal
  └─ RisService.loadRisListFromApi()
       └─ GET /son/getRis/:session
            ├─ 成功 → 更新 UI 列表 + mockApiList
            └─ 失敗 → catchError → of([])（靜默）

新增 RIS
  └─ RisService.add(payload)
       └─ POST /son/addRis/:session（text/plain）
            └─ 解析 risID → 更新 mockApiList

新增 Profile
  └─ RisService.addRisProfile(risID, payload)
       └─ POST /son/addRisProfile/:risID/:session（FormData）

更新 RIS
  └─ RisService.updateRisOnApi(payload)
       └─ POST /son/updateRis/:session（text/plain）

刪除 RIS
  └─ RisService.deleteRisOnApi(risID)
       └─ DELETE /son/deleteRis/:risID/:session

刪除 Profile
  └─ RisService.deleteRisProfileOnApi(risID, profileID)
       └─ DELETE /son/deleteRisProfile/:rid/:pid/:session
```

---

### 3.3 Antenna Add / Edit / Delete Flow

```
使用者開啟天線管理 modal
  └─ AntennaService.getAntennas()
       └─ GET /son/getAntenna/:session → 更新 Signal

上傳天線
  └─ AntennaService.uploadAntenna(session, draft, file, sha256sum)
       └─ POST /son/uploadAntenna/:session（FormData）
            └─ catchError → AntennaUploadDomainError

更新天線
  └─ AntennaService.updateAntenna(draft)
       └─ POST /son/updateAntenna/:session（FormData）

刪除天線
  └─ AntennaService.deleteAntenna(antennaId)
       └─ GET /son/deleteAntenna/:id/:session（⚠ 用 GET 非 DELETE）

下載天線範本
  └─ antenna-pattern-xlsx.service.ts
       └─ GET assets/gltf/templates/UU_123.xlsx（靜態資產）
```

---

### 3.4 Path Loss Model Load Flow

```
路損模型管理 modal 開啟
  └─ PathlossModelService.getList()
       └─ GET /son/getPathLossModel/:session（Promise）
            └─ 填入下拉清單；未選擇 → pathLossModelId = 12

上傳並計算
  └─ PathlossModelService.calculateFromFile(session, args)
       └─ POST /son/calculatePathLossModel/:session（FormData）
            └─ 取得計算 id

輪詢計算進度
  └─ PathlossModelService.waitForPollComplete(session, id)
       └─ POST /son/pollingPathLossModel/:session（最多 30 次，每 1 s）
            └─ 完成後重新載入列表
```

---

### 3.5 Map / OSM Fetch Flow

```
使用者在地圖搜尋欄輸入地名
  └─ map-picker.component.ts onSearchSubmit()
       └─ fetch('https://nominatim.openstreetmap.org/search?...')
            └─ 取第一筆 lat/lon → 移動地圖中心

使用者框選地圖範圍
  └─ MapPreviewService → MapGeneratorService.getOSMData(bbox)
       └─ 嘗試 overpass-api.de（失敗 → kumi.systems → nchc.org.tw）
            └─ POST overpass endpoint（Overpass QL）
                 └─ generateBuildings(scene, data, bbox)
                      └─ BabylonJS Mesh + metadata（osmId, height, tags）
```

---

## 4. Request Payload Source Table

### storeTask / simulation Payload

| Payload Field | Source | Transform / Mapping | Fallback | Risk |
|---------------|--------|--------------------|---------|----|
| `taskid` | `input.taskMeta.taskId` | asString() | `STORETASK_SUCCESS_TEMPLATE.taskid` | — |
| `sessionid` | `input.taskMeta.sessionId`（來自 AuthService） | asString() | `STORETASK_SUCCESS_TEMPLATE.sessionid` | **hardcoded session token** |
| `taskName` | `input.basicField.projectName` | asString() | `'Untitled Task'` | — |
| `createTime` | `new Date()` at build time | `YYYY-MM-DD HH:mm:ss` | — | — |
| `width` | `input.basicField.length`（**注意：length → width**） | asNumber() | `0` | 欄位名稱互換，易混淆 |
| `height` | `input.basicField.width`（**注意：width → height**） | asNumber() | `0` | 欄位名稱互換，易混淆 |
| `altitude` | `input.basicField.height` | asNumber() | `0` | — |
| `mapProtocol` | `input.basicField.networkType` | asString() | `'5G'` | — |
| `lteBand` | `input.basicField.band` | asString() | `'n79'` | — |
| `resolution` | `input.basicField.heatmapGrid`（'1x1' → 1） | `gridToResolution()` | `defaults.resolution` | NaN → 使用 defaults |
| `zValue` | `input.basicField.cutHeights` | `JSON.stringify(array)` | `'[]'` | — |
| `obstacleInfo` | `input.basicField.obstacles`（+ buildingRows + buildingMeshes） | `ObstacleSerializerBuilder.serializeObstacleInfo()` → pipe-delimited tuple string | `defaults.obstacleInfo \|\| ''` | OSM building 序列化失敗時靜默 skip |
| `risList.defaultRis` | `input.basicField.risList` 或 `input.basicField.intelligentPanels` | `RisSerializerBuilder.serialize()` | `[]` | — |
| `risList.candidateRis` | hardcoded `[]` | — | — | 候選 RIS 未實作 |
| `bsList.defaultBs` | **⚠ `STORETASK_SUCCESS_TEMPLATE.bsList.defaultBs`（MOCK）** | asArray() | mock data | **TODO 待替換為真實 existingBs 資料** |
| `bsList.candidateBs` | `input.basicField.candidateBs` | map({ id, x, y, z }) | `[]` | — |
| `ueCoordinate` | `input.basicField.ueList` | `encodeVector3PipeList()` → `'[x,y,z]\|...'` | `''` | 座標系為 Scene 座標（非後端座標） |
| `ueRxGain` | `input.basicField.ueList[].rxGain` | `JSON.stringify(array)` | `'[]'` | — |
| `useUeCoordinate` | `ueList.length > 0` | `1 \| 0` | `0` | — |
| `pathLossModelId` | `defaults.pathLossModelId`（來自任務面板選擇） | asNumber() | **`12`（hardcoded fallback）** | 未選擇時靜默使用 model 12 |
| `subfieldList` | `defaults.subfieldList` | asArray() | `STORETASK_SUCCESS_TEMPLATE.subfieldList` | **來自 MOCK template** |
| `field` | `defaults.field` | — | `STORETASK_SUCCESS_TEMPLATE.field` | **來自 MOCK template** |
| `evaluationFunc` | `input.planning`（selectedPlanningMode + objectives） | `buildEvaluationFuncFromPlanning()` | clone from defaults | — |
| `goalMode` | `input.planning.selectedPlanningMode` | `'current' → 'simulation'`；其他 → `'planning'` | `'simulation'` | — |
| `planningMode` | `input.planning.selectedPlanningMode` | as-is | `'current'` | — |
| `isCoverage` / `isAverageSinr` / `isAvgThroughput` | `input.planning.wholeObjectives` 或 `areaObjectives` | boolean | `false` | mode 不匹配時全為 false |
| `isUeCoverage` / `isUeAvgSinr` / `isUeAvgThroughput` | `input.planning.ueObjectives` | boolean | `false` | mode !== 'ue' 時全為 false |
| `frequency` | `defaults.frequency` 或 `input.radio.frequency_ghz` | asString() | `'4850'` | 來自 mock defaults |
| `bandwidth` | `defaults.bandwidth` 或 `input.radio.bandwidth_mhz` | asString() | `'100'` | 來自 mock defaults |
| `txPower` | `defaults.txPower` 或 `input.radio.tx_power_dbm` | asString() | `'24'` | 來自 mock defaults |
| `rsrpThreshold` | `defaults.rsrpThreshold` | asNumber() | `-95` | — |
| `sinrThreshold` | `defaults.sinrThreshold` | asNumber() | `15` | — |

---

### Antenna Payload（uploadAntenna / updateAntenna）

| Payload Field | Source | Notes |
|---------------|--------|-------|
| `file` | `File` 物件 | 使用者選取 |
| `name` | `AntennaUpsertDraft.name` | — |
| `sha256sum` | 計算後傳入 | 前端計算 |
| `property` | `AntennaUpsertDraft.property`（JSON stringify） | — |
| `type` | `AntennaUpsertDraft.type` | — |
| `band` | `AntennaUpsertDraft.band` | — |
| `protocol` | `AntennaUpsertDraft.protocol` | — |
| `port` | `AntennaUpsertDraft.port` | — |
| `model` | `AntennaUpsertDraft.model` | — |
| `manufactor` | `AntennaUpsertDraft.manufactor` | — |

---

### RIS Payload

| Payload Field | Source | Notes |
|---------------|--------|-------|
| `risName` | `AddRisPayload.risName` | — |
| `type` | `AddRisPayload.type` | — |
| `frequency` | `AddRisPayload.frequency` | — |
| `material` | `AddRisPayload.material` | — |
| `manufacturer` | `AddRisPayload.manufacturer` | — |
| `elementNumber` | `AddRisPayload.elementNumber` | — |
| `elementSize` | `AddRisPayload.elementSize` | — |
| `property` | `AddRisPayload.property` | — |
| `profileName` | `RisProfilePayload.profileName` | Profile 欄位 |
| `incHorizontal` | `JSON.stringify(array)` | FormData；角度陣列編碼 |
| `incVertical` | `JSON.stringify(array)` | FormData；角度陣列編碼 |
| `refHorizontal` | 數值 | — |
| `refVertical` | 數值 | — |
| `refCoefficient` | 數值 | — |
| `sha256sum` | 前端計算 | — |
| `file` | `File` 物件 | Profile 上傳時 |

---

### Path Loss Model Payload

| Operation | Key Fields | Source |
|-----------|-----------|--------|
| add | `name`, `chineseName`, `distancePowerLoss`, `fieldLoss`, `property` | 使用者填寫 |
| update | 同 add + `id` | 現有記錄 id |
| delete | `id`, `name` | 現有記錄 |
| calculateFromFile | `file`, `name`, `sha256sum`, `property` | 使用者上傳 |

---

## 5. Response Usage Table

| API | Response Field | Used By | Purpose | Risk / Notes |
|-----|---------------|---------|---------|-------------|
| `completeCalcResult` | `5GOutput.sinrMap` | `EditScene.renderBackendHeatmapFromCompleteCalcResult()` | SINR heatmap 渲染 | 欄位名以 `'5GOutput'` 字串索引 |
| `completeCalcResult` | `5GOutput.rsrpMap` | 同上 | RSRP heatmap | — |
| `completeCalcResult` | `5GOutput.dlThroughputMap` | 同上 | DL throughput heatmap | — |
| `completeCalcResult` | `5GOutput.ulThroughputMap` | 同上 | UL throughput heatmap | — |
| `completeCalcResult` | `5GOutput.chosenRisList` | `EditScene`（console log） | 紀錄後端選擇的 RIS | 僅 log，未顯示於 UI |
| `completeCalcResult` | `input.risList` | `EditScene`（console log） | 確認輸入 RIS 列表 | 僅 log |
| `completeCalcResult` | （整體） | `ResultDataService.setResultData()` | Signal 狀態更新 | **⚠ MVP 面板另用 RESULT_MVP_MOCK** |
| `getAntenna` | antenna array | `AntennaService.antennaRows` Signal | 天線選擇 UI | 多種 wrapper 格式正規化 |
| `getAntennaRawData` | `AntennaRawDataResponseDto` | 天線 pattern 圖表元件 | 顯示天線增益圖 | — |
| `getRis` | `RisApi[]` | `RisService.mockApiList` + UI | RIS 選擇 UI | — |
| `getRisProfiles` | `RisProfileDto[]` | Profile 選擇 UI | — | — |
| `getRisRawData` | `RisRawDataApi` | RIS pattern 圖表元件 | 顯示 RIS 增益圖 | — |
| `getPathLossModel` | `PathlossApiDto[]` | 路損模型選擇 UI | — | 未選擇 → fallback id=12 |
| `storeTask` | `taskid` | `EditScene`（demoPayload.taskid） | 後續 API 的路徑參數 | JSON.parse(body)；解析失敗 → 使用 originalTaskId |
| `Nominatim` | `[0].lat`, `[0].lon` | `map-picker` | 地圖中心定位 | 取第一筆結果 |
| `Overpass` | `elements[].geometry` | `MapGeneratorService.generateBuildings()` | BabylonJS 建物 Mesh | OSM way geometry |

---

## 6. Session / Auth / Base URL

| Item | Location | Current Behavior | Risk / Notes |
|------|----------|-----------------|--------------|
| Session Token | `auth.service.ts` L17 | Hardcoded `'son_session_37a4ed55-2c75-4ac4-9c31-c2fd6bbedf19'` | **⚠ 無真實 login 流程；token 過期或環境切換須手動改碼** |
| Session（RIS） | `ris.service.ts` L75-88 | 優先 `AuthService` > `window.__sonSession` > `localStorage.getItem('son_session')` | 3 種來源優先順序；window 全域變數為非正式路徑 |
| Session（Antenna） | `antenna.service.ts` L89 | `getSession()` 直接返回 hardcoded token | 與 auth.service 相同值 |
| Session（新增任務） | `new-project.component.ts` L71 | 從 `auth.id` + `auth.session` 組 URL | **⚠ Need Verification**：`auth.id` 值來源未確認 |
| localStorage | `ris.service.ts` L87 | `localStorage.getItem('son_session')` 為第三優先 | 非主要路徑，但可能影響 session 取得 |
| `window.__sonSession` | `ris.service.ts` L83 | 全域變數（第二優先） | 非正式 API，僅供緊急 override 使用 |
| apiBase（Antenna） | `antenna.service.ts` | `/son` | — |
| apiBase（RIS） | `ris.service.ts` | `''`（空字串，proxy 接管） | — |
| apiBase（Material） | `material.service.ts` | `/son` | — |
| apiBase（Pathloss） | `pathloss-model.service.ts` | `''`（空字串） | — |
| apiBase（Result） | `result-api.service.ts` | `''`（空字串） | — |
| environment.apiUrl | `environment.ts` | `'http://localhost:3000'` | **⚠ 目前未被任何 service 使用；實際路徑由 proxy 決定** |
| Proxy 設定 | `proxy.conf.json` | `/son/*` → `http://211.20.94.215:3000` | IP hardcoded；環境切換須修改此檔 |
| 外部 URL（Overpass） | `map-generator.service.ts` L40-43 | 3 個 URL hardcoded in array | 公開服務；無認證 |
| 外部 URL（Nominatim） | `map-picker.component.ts` L1049 | URL hardcoded in fetch call | 公開服務；無認證 |

---

## 7. Mock / Fallback / Hardcoded Risk

| Type | File | Code Area / Method | Current Behavior | Risk | Suggested Follow-up |
|------|------|-------------------|-----------------|------|---------------------|
| Hardcoded session | `auth.service.ts` L17 | class property | 全系統使用同一固定 token | Token 過期 → 全部 API 失效；多環境須手改 | 實作真實 login flow |
| Hardcoded session（備份） | `antenna.service.ts` L89 | `getSession()` | 返回 hardcoded token（與 auth.service 相同） | 同上 | 統一從 AuthService 取得 |
| Mock DB（RIS） | `ris.service.ts` | `mockApiList`, `profilesDb`, `rawDataDb` | API 成功時更新；API 失敗時靜默返回 mock 資料 | 開發時若後端未啟動，資料為假資料無錯誤提示 | 考慮開發模式下區分 mock/real |
| Mock DB（Antenna） | `antenna.service.ts` | `MOCK_ANTENNAS` BehaviorSubject | 存在但非 catchError fallback | 確認是否實際使用 | Need Verification |
| Mock payload defaults | `mocks/task-payload.mock.ts` | `TASK_PAYLOAD_MOCK_DEFAULTS`, `STORETASK_SUCCESS_TEMPLATE` | **被 BaseTaskPayloadBuilder.build() 直接引用**（非測試專用） | 許多欄位值來自 mock；bsList.defaultBs 全來自 mock | TODO 待替換真實 existingBs mapping |
| Mock project save | `project-file.service.ts` | `saveProject()` | 300ms delay 後返回假成功 `{ ok: true }`；無後端呼叫 | 存檔功能完全未實作 | 接後端 API 實作 |
| Hardcoded MVP result | `EditScene.component.ts` L18964 | `runSimulationApiFlow()` | `resultService.setResultMvp(RESULT_MVP_MOCK)` | 右側結果面板 MVP 數字為假資料 | 從 completeCalcResult 取真實值 |
| bsList.defaultBs | `base-task-payload.builder.ts` L310-319 | `buildBsSection()` | 強制從 mock template fallback；有 TODO 標注 | 場域 BS 設定不反映於模擬 | 替換為真實 existingBs → bsList 映射 |
| pathLossModelId | `base-task-payload.builder.ts` L501 | `buildRadioPlanningSection()` | 未選擇時 fallback = `12` | 靜默使用 model 12，使用者無感知 | 加入 UI 提示或強制選擇 |
| subfieldList | `base-task-payload.builder.ts` L502 | `buildRadioPlanningSection()` | 來自 `defaults.subfieldList || STORETASK_SUCCESS_TEMPLATE.subfieldList` | 觀測區設定可能為 mock | Need Verification |
| field（radio params） | `base-task-payload.builder.ts` L500 | `buildRadioPlanningSection()` | `defaults.field || STORETASK_SUCCESS_TEMPLATE.field` | 多個 radio 參數來自 mock | Need Verification |
| Logout stub | `logout-api.service.ts` | `logout()` | 失敗時返回假成功；錯誤被吞 | 使用者不知登出是否成功 | 接真實登出 API |
| Nominatim（外部） | `map-picker.component.ts` | `onSearchSubmit()` | 公開 API，無認證 | Rate limit 觸發時地搜尋功能失效 | 考慮加 retry 或用戶提示 |
| Overpass（外部） | `map-generator.service.ts` | `getOSMData()` | 3 站點輪詢 | 全部失敗時場景建物無法載入 | 加入更友好的錯誤提示 |

---

## 8. API Error Handling

| API | Error Handling | User Feedback | Fallback Behavior | Risk |
|-----|---------------|--------------|------------------|------|
| `storeTask` | 外層 try/catch（EditScene） | **無**（僅 console.error） | 無；flow 中止 | 使用者不知失敗原因 |
| `simulation` | 外層 try/catch（EditScene） | **無** | 無；flow 中止 | 同上 |
| `progress` | per-attempt try/catch | **無** | TimeoutError → continue；malformed → 'fallback_result'；其他 → throw | 超時後 flow 中止，無提示 |
| `completeCalcResult` | `completeRes` 為空 → resetToEdit() | **無** | 還原至編輯模式 | 使用者不知計算失敗 |
| `getRis` | `catchError` | **無**（靜默） | 返回 `of([])` | RIS 列表空白但無錯誤訊息 |
| `addRis` | 無顯式 catchError | 不確定（Need Verification） | 無 | — |
| `uploadAntenna` | `catchError` → `AntennaUploadDomainError` | 由 modal 元件處理（Need Verification） | 返回 domain error 物件 | — |
| `deleteAntenna` | 無顯式（Need Verification） | 不確定 | 無 | — |
| `getObstacle`（material） | 無顯式 | 不確定 | 無 | — |
| `getPathLossModel` | Promise catch（Need Verification） | 不確定 | 無（列表空） | fallback model 12 |
| `logout` | `catchError` → stub response | **無** | 返回 `{ ok: false, stub: true }` | 靜默失敗 |
| `loadHistoryProjects` | `try/catch` → `this.projects = []` | **無**（清空列表） | 空列表 | 使用者不知載入失敗 |
| `Nominatim` | `catch` → `searchError` 訊息 | **有**（顯示錯誤文字） | 無（搜尋結果空） | 較好的錯誤處理 |
| `Overpass` | 輪詢 → throw | 不確定（Need Verification） | 無 | 全部失敗時建物無法顯示 |
| `calculatePathLossModel` | Promise（Need Verification） | 不確定 | 無 | — |

---

## 9. Need Verification List

| Item | Related API | File | Why Need Verification |
|------|-------------|------|----------------------|
| history API response 型別 | `GET /son/history/:userId/:session` | `new-project.component.ts` | 無型別標注，`HistoryGroupItem` 結構不確定 |
| `auth.id` 值來源 | `GET /son/history/...` | `new-project.component.ts` | `auth.id` 從 AuthService 取得，AuthService 目前值為何？ |
| Antenna mock DB 實際用途 | `getAntenna` | `antenna.service.ts` | `MOCK_ANTENNAS` BehaviorSubject 是否被 catchError 使用？ |
| `addRis` 錯誤處理 | `POST /son/addRis` | `ris.service.ts` | 無 catchError，錯誤是否有 UI 反饋？ |
| Antenna `deleteAntenna` 錯誤處理 | `GET /son/deleteAntenna` | `antenna.service.ts` | 是否有 UI 反饋？ |
| `subfieldList` 實際來源 | `storeTask` payload | `base-task-payload.builder.ts` L502 | 是否從 FieldDomainStoreService observationAreas 填入，或仍為 mock？ |
| `field`（radio section）實際來源 | `storeTask` payload | `base-task-payload.builder.ts` L500 | `defaults.field` 從何填入？是否為 mock？ |
| `RESULT_MVP_MOCK` 結構 | `completeCalcResult` 後 | `EditScene.component.ts` | MVP 面板哪些欄位？何時換為真實資料？ |
| Overpass 失敗時 UI 反饋 | Overpass API | `map-generator.service.ts` | 全部失敗時使用者是否看到錯誤訊息？ |
| `pollingPathLossModel` response 結構 | `POST /son/pollingPathLossModel` | `pathloss-model.service.ts` | 完成判斷條件為何？ |
| EditScene L10758/L10769 直呼 RIS | `GET /son/getRis` | `EditScene.component.ts` | 這兩處呼叫的完整上下文與觸發時機？ |
| `deleteObstacle` / `deleteRisProfile` 相比其他刪除差異 | 各刪除端點 | 各 service | 為何部分用 POST / DELETE，部分用 GET？後端合約是否一致？ |
| progress `extractProgressValue()` 邏輯 | `GET /son/progress` | `EditScene.component.ts` | 如何判斷 progress === 1？回應格式為何？ |

---

## 10. Suggested Follow-up

### P0 Must Verify

- [ ] **bsList.defaultBs 為 MOCK**：`base-task-payload.builder.ts` L310-319 有 `// [SIM_API_PHASE3][TEMP_BACKEND_SHAPE_MOCK]` TODO；模擬實際使用的 BS 資料完全來自 mock template，需替換為真實 existingBs → bsList 映射
- [ ] **RESULT_MVP_MOCK hardcoded**：右側結果面板 MVP 數字不反映真實計算；`EditScene.component.ts` L18964 需從 `completeCalcResult` 取真實值
- [ ] **Session token hardcoded**：`auth.service.ts` L17；全系統使用同一 token，token 過期時全部 API 失效
- [ ] **progress 超時無使用者提示**：模擬逾時（2 分鐘）僅 console.error，無任何 UI 反饋
- [ ] **EditScene 直呼 RIS（L10758/L10769）**：確認觸發時機與 RisService 的關係，避免邏輯分裂

### P1 Important

- [ ] **project-file.service.ts 完全 mock**：存檔功能未接後端，使用者操作無實際儲存
- [ ] **history API 型別**：`new-project.component.ts` 的歷史任務 API 無型別標注，URL 格式需與後端確認
- [ ] **logout stub**：登出 API 為 stub，session 不會真正失效
- [ ] **pathlossModelId fallback = 12**：使用者未選路損模型時靜默使用 model 12，加入 UI 提示或強制選擇
- [ ] **catchError 返回空陣列（getRis）**：API 失敗時靜默返回 `[]`，使用者不知 RIS 列表是否為空或載入失敗
- [ ] **subfieldList / field 欄位來源**：確認觀測區與 radio 參數是否從真實 UI 狀態填入，或仍為 mock

### P2 Future Cleanup

- [ ] **Overpass 外部服務改為可設定**：`map-generator.service.ts` 的 3 個 URL hardcoded；考慮移至 environment 設定
- [ ] **environment.ts apiUrl 未使用**：`environment.ts` 的 `apiUrl` 目前未被任何 service 使用，與 proxy 設定不一致，建議統一
- [ ] **material.service.ts 與 obstacle 端點共用**：`/son/*Obstacle` 端點同時服務材質與障礙物功能，後端若拆分需前端同步修改兩處
- [ ] **Nominatim rate limit**：地圖搜尋無 debounce；高頻使用可能觸發 rate limit；考慮加入 debounce 或錯誤提示
- [ ] **EditScene.component.ts 模組拆分**：648KB 單體元件包含所有 API 呼叫邏輯，建議逐步拆分為獨立 service
