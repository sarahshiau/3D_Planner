# mocks — 開發用假資料

## 警告

**部分 mock 資料仍被正式流程引用，請勿直接刪除。**

---

## 檔案說明

### task-payload.mock.ts
**最重要的 mock 檔案**。

包含：
- `TASK_PAYLOAD_MOCK_DEFAULTS`：被 `BaseTaskPayloadBuilder` 用作 payload 的預設值基底
- `DEFAULT_EVALUATION_FUNC`：評估函數的預設結構，被 `right-sidebar.component.ts` 引用
- `STORETASK_SUCCESS_TEMPLATE`：模擬成功回應的結構範本

**這些資料在正式流程中仍被使用**，代表部分欄位的預設值來自 mock 而非 UI 設定。接手後需釐清哪些欄位已從 UI 接入真實值，哪些仍依賴 mock 預設。

---

### antenna.mock.ts
天線 API 回傳資料的假資料（用於本地開發）。

---

### material.mock.ts
材質資料的假資料。

---

### pathloss-model.mock.ts
路損模型的假資料。

---

### ris.mock.ts
RIS Profile 的假資料。

---

## 使用狀況確認清單

| 檔案 | 在正式流程中被引用 | 安全刪除 |
|---|---|---|
| `task-payload.mock.ts` | ✅ 是（被 builder 和 sidebar 引用） | ❌ 不可 |
| `antenna.mock.ts` | 待確認 | 待確認 |
| `material.mock.ts` | 待確認 | 待確認 |
| `pathloss-model.mock.ts` | 待確認 | 待確認 |
| `ris.mock.ts` | 待確認 | 待確認 |
