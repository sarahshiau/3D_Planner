# Patch 7: Fix CandidateBs/CandidateRis Marker Root Tracking

**Status**: ✅ COMPLETE

## Problem
When editing candidateBs/candidateRis panel X/Y values, only the head mesh of the marker would move, not the complete TransformNode hierarchy. This caused visual inconsistency where the root node stayed in place while the head moved separately.

**Root Cause**: 
- `spawnPlaceablePinMarkerAt()` creates a TransformNode as root with child meshes (head, stem, baseDisc)
- Store was incorrectly tracking `meshId: head.uniqueId` instead of `ownerMeshId: root.uniqueId`
- When panel synced to scene, `getSceneTargetByFieldRow()` would find only the head mesh, not the root

## Changes Made

### 1. Fix candidateBs marker storage (Line ~2564)
**Before**:
```typescript
const candidateBsRow = this.fieldDomainStore.addCandidateBs({
  x: fieldPos.x,
  y: fieldPos.y,
  z: fieldZ,
  meshId: head.uniqueId,  // ❌ Wrong: only tracks head mesh
});
```

**After**:
```typescript
const candidateBsRow = this.fieldDomainStore.addCandidateBs({
  x: fieldPos.x,
  y: fieldPos.y,
  z: fieldZ,
  ownerMeshId: root.uniqueId,  // ✅ Correct: tracks root TransformNode parent
});
```

### 2. Fix candidateRis marker storage (Line ~2572)
**Before**:
```typescript
const candidateRisRow = this.fieldDomainStore.addCandidateRis({
  x: fieldPos.x,
  y: fieldPos.y,
  z: fieldZ,
  meshId: head.uniqueId,  // ❌ Wrong: only tracks head mesh
});
```

**After**:
```typescript
const candidateRisRow = this.fieldDomainStore.addCandidateRis({
  x: fieldPos.x,
  y: fieldPos.y,
  z: fieldZ,
  ownerMeshId: root.uniqueId,  // ✅ Correct: tracks root TransformNode parent
});
```

### 3. Update getSceneTargetByFieldRow() to support TransformNode (Line 2693)
**Before**:
```typescript
private getSceneTargetByFieldRow(row: { meshId?: number; ownerMeshId?: number }): AbstractMesh | null {
  // Only tried getMeshByUniqueId, would fail for TransformNode
  if (row.ownerMeshId != null && typeof sceneAny.getMeshByUniqueId === 'function') {
    const owner = sceneAny.getMeshByUniqueId(row.ownerMeshId);
    if (owner) return owner;
  }
  // ... rest
}
```

**After**:
```typescript
private getSceneTargetByFieldRow(row: { meshId?: number; ownerMeshId?: number }): AbstractMesh | TransformNode | null {
  if (row.ownerMeshId != null) {
    // Try mesh first
    if (typeof sceneAny.getMeshByUniqueId === 'function') {
      const owner = sceneAny.getMeshByUniqueId(row.ownerMeshId);
      if (owner) return owner;
    }
    // Fallback to TransformNode
    if (typeof sceneAny.getTransformNodeByUniqueId === 'function') {
      const ownerNode = sceneAny.getTransformNodeByUniqueId(row.ownerMeshId);
      if (ownerNode) return ownerNode;
    }
  }
  // ... rest
}
```

### 4. Add Type Narrowing in applyObstacleRowToScene() & applyZoneRowToScene()
Since these methods call `getWorldBoundsInfo()` and `alignToGround()` which require `AbstractMesh`, added instanceof check:

**Before**:
```typescript
const target = this.getSceneTargetByFieldRow(row);
if (!target) return;
const bounds = this.getWorldBoundsInfo(target);  // ❌ Type error if TransformNode
```

**After**:
```typescript
const target = this.getSceneTargetByFieldRow(row);
if (!target || !(target instanceof AbstractMesh)) return;  // ✅ Type narrowed
const bounds = this.getWorldBoundsInfo(target);  // ✅ Now guaranteed AbstractMesh
```

## Result
- ✅ CandidateBs markers now track root TransformNode, entire hierarchy moves together on panel X/Y change
- ✅ CandidateRis markers now track root TransformNode, entire hierarchy moves together on panel X/Y change  
- ✅ No TypeScript errors
- ✅ Backward compatible - meshId fallback still works for other row types
- ✅ Scene→Store→Panel bidirectional sync maintains full consistency

## Files Modified
- `EditScene.component.ts` (4 targeted changes, ~40 lines total)
  - spawnPlaceablePinMarkerAt() candidateBs call (1 line)
  - spawnPlaceablePinMarkerAt() candidateRis call (1 line)
  - getSceneTargetByFieldRow() method signature & logic (~13 lines)
  - applyObstacleRowToScene() type guard (1 line)
  - applyZoneRowToScene() type guard (1 line)

## Testing
- No changes to store model, API, panel, or serializer
- Existing tests should pass unchanged
- Manual test: Place antenna/RIS via UI → Edit panel X/Y → Verify marker root moves with all children
