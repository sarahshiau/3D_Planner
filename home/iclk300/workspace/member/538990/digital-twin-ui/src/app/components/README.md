# components — 共用元件

## 目錄結構

```
components/
├── modals/                  對話框元件（數量最多）
├── map-picker/              地圖選點元件
├── confirm-dialog/          通用確認對話框
├── top-bar/                 頂部導覽列
│   └── topbar-panel/        頂部面板子元件
└── right-sidebar/           右側側欄（注意：EditScene 內也有一個同名元件）
```

## 重要說明：right-sidebar 的位置

本目錄的 `right-sidebar/` 與 `pages/EditScene/components/right-sidebar/` 是**不同的兩個元件**，接手時請確認使用的是哪一個。目前主要使用的是 `EditScene/components/right-sidebar/`（顯示模擬結果）。

---

## modals/（對話框元件）

每個 modal 負責一種資源的新增、編輯或管理。

### 天線（Antenna）相關
| 元件目錄 | 功能 |
|---|---|
| `antenna-add-modal/` | 新增天線 |
| `antenna-edit-modal/` | 編輯天線 |
| `antenna-manage-modal/` | 天線管理清單 |
| `antenna-settings-modal/` | 基站天線進階設定（安裝角度、頻率、port 選擇） |
| `antenna-pattern-modal/` | 天線輻射方向圖 3D 視覺化 |

### RIS 相關
| 元件目錄 | 功能 |
|---|---|
| `ris-add-modal/` | 新增 RIS Profile |
| `ris-edit-modal/` | 編輯 RIS Profile |
| `ris-manage-modal/` | RIS Profile 管理清單 |
| `ris-config-add-modal/` | 新增 RIS 設定組態 |
| `ris-config-edit-modal/` | 編輯 RIS 設定組態 |
| `ris-config-manage-modal/` | RIS 組態管理 |
| `ris-config-pattern-modal/` | RIS 組態方向圖視覺化 |
| `ris-profiles-modal/` | RIS Profile 總覽 |
| `ris-angle-help-modal/` | RIS 角度說明圖示 |

### 材質（Material）相關
| 元件目錄 | 功能 |
|---|---|
| `material-add-modal/` | 新增材質 |
| `material-edit-modal/` | 編輯材質 |
| `material-manage-modal/` | 材質管理清單 |

### 路損模型（Pathloss Model）相關
| 元件目錄 | 功能 |
|---|---|
| `pathloss-model-add-modal/` | 新增路損模型 |
| `pathloss-model-edit-modal/` | 編輯路損模型 |
| `pathloss-model-manage-modal/` | 路損模型管理清單 |

### 場域物件設定
| 元件目錄 | 功能 |
|---|---|
| `object-settings-modal/` | 3D 物件屬性設定（尺寸、材質） |
| `existing-bs-settings-modal/` | 既有基站詳細設定 |
| `intelligent-panel-settings-modal/` | RIS（智慧面板）詳細設定 |
| `ue-settings-modal/` | 終端裝置（UE）設定 |
| `zone-pathloss-settings-modal/` | 區域路損設定 |

### 規劃目標設定
| 元件目錄 | 功能 |
|---|---|
| `overall-area-planning-dialog/` | 整體區域規劃設定 |
| `overall-quality-target-dialog/` | 訊號品質目標（SINR） |
| `overall-strength-target-dialog/` | 訊號強度目標（RSRP） |
| `overall-throughput-target-dialog/` | 吞吐量目標 |

---

## map-picker/

地圖選點元件，用於 `NewProject` 頁面讓使用者框選場域範圍。

- 使用 Leaflet 顯示地圖
- 使用者拖拉矩形後，產生 `CommittedMapData`（含 bbox、尺寸（公尺）、中心點座標）
- 結果透過 `ProjectDraftService.setCommittedMap()` 傳至下一頁

---

## confirm-dialog/

通用確認對話框，由 `AlertService` 統一呼叫。

支援四種類型：`question`（確認/取消）、`success`、`error`、`info`

---

## top-bar/

頂部導覽列，含語系切換、使用者資訊、登出等功能。

`topbar-panel/` 為其子面板元件。
