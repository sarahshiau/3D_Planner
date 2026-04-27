# src/app — 應用程式根目錄

## 框架與技術

| 項目 | 版本 |
|---|---|
| Angular | 17 |
| BabylonJS | 7.x |
| Leaflet | 1.9.x |
| Plotly.js | 3.x |
| Angular Material | 17 |
| 狀態管理 | 無 NgRx，改用 BehaviorSubject 手刻 |

## 資料夾一覽

```
src/app/
├── pages/        各路由頁面的根元件（EditScene、NewProject 等）
├── components/   跨頁面共用的 UI 元件，主要是各種 modal 對話框
├── services/     Angular singleton service，負責狀態管理與 API 呼叫
├── models/       TypeScript 型別與介面定義，是整個應用的型別合約
├── builders/     將 UI 狀態組裝成後端所需的 API payload 格式
├── extractors/   從後端回傳的原始 JSON 中解析特定欄位，集中管理解析邏輯
├── helpers/      與 UI 顯示相關的判斷函式，例如狀態文字、CSS class 決策
├── mappers/      model ↔ DTO 互轉（目前為空，保留供未來使用）
├── mocks/        開發用假資料，注意：部分仍被正式流程引用，不可直接刪除
└── utils/        純工具函式（座標轉換、3D 圖形建構等），無副作用、可獨立測試
```

## 路由對照

| 路徑 | 元件 | 狀態 |
|---|---|---|
| `/` | → 轉跳 `/editscene` | — |
| `/editscene` | `EditSceneComponent` | 主要使用頁面 |
| `/project/new` | `NewProjectComponent` | 新建專案入口 |
| `/result` | `ComputeResultComponent` | 結果顯示 |
| `/osmscene` | `osmSceneComponent` | 疑似 legacy，待確認 |
| `/map-test` | `MapTestComponent` | 開發測試用 |
| `/GLBmap` | `GLBmapComponent` | GLB 格式測試用 |

## 主要資料流（簡易版）

```
NewProjectComponent
  └─ 填寫場域設定 → ProjectDraftService.setCommittedMap()
       └─ 導航至 /editscene

EditSceneComponent
  ├─ 讀取 ProjectDraftService（consumeCommittedMap）
  ├─ FieldDomainStoreService  ← 所有場域物件狀態（obstacle / bs / ris / ue / zone）
  ├─ 使用者互動（新增/編輯/刪除場域物件）
  └─ 執行模擬
       ├─ BaseTaskPayloadBuilder.build()  → 組裝 payload
       ├─ TaskApiService.postStoreTask()  → POST /son/storeTask
       ├─ SimulationApiService.postSimulation() → POST /son/simulation
       └─ ResultApiService.getCompleteCalcResult() → GET /son/completeCalcResult/:id/:sid
            └─ ResultDataService.setResultData() → 切換至 result 視圖
```

## API 端點（代理設定）

代理設定：`proxy.conf.json` 將 `/son/*` 轉發至 `http://211.20.94.215:3000`

| 方法 | 路徑 | 用途 |
|---|---|---|
| POST | `/son/storeTask` | 儲存 task（先於模擬執行） |
| POST | `/son/simulation` | 觸發模擬計算 |
| GET | `/son/completeCalcResult/:taskId/:sessionId` | 取得計算結果 |

> **注意**：`environment.ts` 的 `apiUrl` 指向 `localhost:3000`，但代理實際轉發到 `211.20.94.215:3000`，兩者不一致。`environment.ts` 目前未被 services 直接使用。

## 已知注意事項

- `EditScene.component.ts` 是 648 KB 的超重單體元件，包含場景渲染、UI 狀態、模擬流程等所有邏輯。任何改動前請完整閱讀。
- `mocks/` 中的假資料部分仍被正式流程引用（如 `TASK_PAYLOAD_MOCK_DEFAULTS`），不可直接刪除。
- `src/` 目錄內有多個 `.zip` 備份檔（`app.zip`、`components.zip` 等），不影響編譯，但容易造成混淆。
