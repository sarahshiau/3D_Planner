# panels — EditScene 右側面板元件

這三個面板由 `EditScene.component.ts` 透過 `rightPanelType` 狀態切換顯示。

## edit-field-panel（場域物件面板）

顯示目前場域內所有物件的清單（obstacles、existingBs、ris、ue、zone、observe 等）。

- 從 `FieldDomainStoreService.state$` 訂閱資料
- 使用者點擊物件卡片可選取（觸發 `FieldCardSelectPayload` 事件）
- 支援物件的刪除與設定（透過開啟對應 modal）

關鍵 Output：`FieldCardSelectPayload`（傳回 `EditScene.component.ts` 控制 3D 場景選取）

---

## edit-task-panel（任務設定面板）

配置模擬的目標與規劃模式。

規劃模式（`PlanningModeType`）：
| 模式 | 說明 |
|---|---|
| `current` | 現有場域訊號模擬（不進行規劃） |
| `whole` | 以整體場域為主的規劃 |
| `ue` | 以終端裝置覆蓋為主的規劃 |
| `area` | 以指定區域為主的規劃 |

規劃目標（`GoalMode`）：`'planning' | 'simulation'`

每個規劃模式下可設定覆蓋率、SINR、RSRP、throughput 的目標門檻，透過對應的 dialog（`overall-*-target-dialog`）編輯。

主要 Output：`planningSnapshotChange`（傳回當前設定快照給 `EditScene`，模擬時作為 builder 輸入）

---

## edit-file-panel（資源庫面板）

天線、材質、路損模型、RIS Profile 的管理入口。

點擊各按鈕會開啟對應的 manage modal（`antenna-manage-modal`、`material-manage-modal` 等）。

也包含專案存檔、載入歷史任務等功能入口。
