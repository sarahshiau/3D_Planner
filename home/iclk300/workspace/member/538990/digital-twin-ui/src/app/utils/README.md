# utils — 純工具函式

本目錄為純函式（pure functions），**無副作用、不依賴 Angular DI、可獨立測試**。

## 檔案說明

### field-coordinate.util.ts
場景座標系與數學座標系的互轉。

本專案有兩套座標系：

| 座標系 | 原點 | 使用場合 |
|---|---|---|
| `SceneCoord3D` | 中心點，Y 軸向上 | BabylonJS 場景渲染 |
| `MathCoord3D` | 左下角，Z 軸為高度 | 後端 API、FieldDomainStore |

轉換函式：
- `sceneToMath(scene, width, height)` → `MathCoord3D`
- `mathToScene(math, width, height)` → `SceneCoord3D`

**注意**：存入 `FieldDomainStore` 的位置使用 MathCoord3D，渲染到 BabylonJS 場景時需先呼叫 `mathToScene` 轉換。這個差異很容易造成物件位置偏移，修改位置相關邏輯時需特別留意。

---

### map-pin.util.ts
在 BabylonJS 場景中建立地圖定位針（map pin）的 3D 模型。

- 由球型頭部（sphere）+ 圓柱竿（cylinder）+ 地面陰影圓盤（disc）組成
- 回傳 `MapPinHandle`（含 `root`、`pin`、`baseDisc`、`setColor(hex)` 方法）
- 顏色可在建立後動態更新

---

### building-obstacle-normalize.helper.ts
將 OSM 建物或手動繪製的建物障礙物資料標準化。

- 提供 `normalizeBuildingObstacle()` 函式
- 主要被 `obstacle-serializer.builder.ts` 使用
- 若建物資料不完整（無法取得尺寸），會記錄在 skip record 中
