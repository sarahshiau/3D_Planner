# DAS 天線識別邏輯 - 快速參考指南

## 🎯 三項核心修復一覽

### 1️⃣ onModelButtonClick 識別優先級

**文件：** `EditScene.component.ts` (Line ~3732)

```typescript
// ✅ 修復：das_antenna 優先級提升到 antenna 之前
if (resolvedKey === 'das_antenna' || resolvedKey.startsWith('das_antenna')) {
  this.placementMode = 'antenna';
  this.phase4PendingItemId = 'das_antenna';  // ✅ 明確標記
}
```

**原因：** 防止 `das_antenna.startsWith('antenna')` 被錯誤分類

---

### 2️⃣ 標準天線 Owner Metadata

**文件：** `EditScene.component.ts` (Line ~2885)

```typescript
// ✅ 修復：添加 itemId 字段
(owner as any).metadata = {
  ...((owner as any).metadata ?? {}),
  type: 'antenna',
  itemId: 'antenna',  // ✅ 新增，區分 DAS
  placedOn,
};
```

---

### 3️⃣ DAS 天線 Owner Metadata

**文件：** `EditScene.component.ts` (Line ~2965)

```typescript
// ✅ 已正確設置
(owner as any).metadata = {
  ...((owner as any).metadata ?? {}),
  type: 'antenna',
  itemId: 'das_antenna',  // ✅ 完整設置
  placedOn,
};
```

---

## 🔄 完整流程驗證

```
按鈕點擊 'das_antenna'
    ↓
✅ onModelButtonClick(resolvedKey='das_antenna')
    ├─ placementMode = 'antenna'
    └─ phase4PendingItemId = 'das_antenna'
    ↓
地面點擊
    ↓
✅ onPointerObservable 捕捉
    ├─ phase4SingleShot.mode = 'antenna'
    └─ phase4SingleShot.itemId = 'das_antenna'  ← 關鍵！
    ↓
✅ 檢查 shot.itemId === 'das_antenna'
    ↓
ensureDasAntennaTemplateLoaded()
    ↓
✅ spawnDasAntennaAt()
    ├─ owner.metadata.type = 'antenna'
    └─ owner.metadata.itemId = 'das_antenna'
    ↓
✅ DAS 天線生成成功
```

---

## 📊 Metadata 結構對比

| 字段 | 標準天線 | DAS 天線 |
|-----|--------|---------|
| `type` | `'antenna'` | `'antenna'` |
| `itemId` | `'antenna'` | `'das_antenna'` |
| `placedOn` | `'ground'` \| `'building'` | `'ground'` \| `'building'` |
| `ownerMeshId` | 回溯鏈接 ID | 回溯鏈接 ID |

---

## 🧪 快速測試檢查

### 檢查 1：按鈕識別
```javascript
// 在控制台檢查日誌
// ✅ 應該看到：
// [Phase4][PlacementMode][Model] { pendingItemId: 'das_antenna' }

// ❌ 不應該看到：
// [Phase4][PlacementMode][Model] unknown model key
```

### 檢查 2：Single-shot 傳遞
```javascript
// 監控 single-shot 物件
// ✅ shot.itemId 應該是 'das_antenna'
// ❌ 不應該是 null 或 undefined
```

### 檢查 3：Metadata 註冊
```javascript
// 在瀏覽器執行
const scene = engine.scenes[0];
const dasMesh = scene.meshes.find(m => 
  m.metadata?.itemId === 'das_antenna'
);
console.log(dasMesh?.metadata);
// ✅ 應該輸出：{ type: 'antenna', itemId: 'das_antenna', ... }
```

---

## 🔍 故障排除

### 問題：日誌顯示 "unknown model key"

**原因：** `onModelButtonClick()` 沒有正確識別

**解決：** 檢查 `resolvedKey` 是否為 `'das_antenna'`（完全匹配）

### 問題：single-shot.itemId 為 null

**原因：** 按鈕點擊時 `phase4PendingItemId` 未被設置

**解決：** 確保 `onModelButtonClick()` 第一行執行了：
```typescript
this.phase4PendingItemId = 'das_antenna';
```

### 問題：生成的 DAS 天線無法通過 metadata 識別

**原因：** owner.metadata 缺少 `itemId` 字段

**解決：** 檢查 `spawnDasAntennaAt()` 是否設置了：
```typescript
(owner as any).metadata = {
  ...,
  itemId: 'das_antenna',  // ✅ 必須有
};
```

---

## 📋 編譯狀態

```
✅ TypeScript: 無誤
✅ SCSS: 無誤
✅ 總體：通過
```

---

## 🚀 下一步行動

1. **Runtime 測試** → 驗證完整流程
2. **Metadata 驗證** → 在瀏覽器控制台查詢
3. **Phase 2 整合** → 應用於訊號計算

---

**版本：v1.1**  
**日期：2026-01-20**  
**狀態：✅ 完成**
