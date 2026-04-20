# Angle Checklist Debug Tool

## Overview
A debug tool for analyzing Excel antenna pattern angle definitions without modifying the existing pattern generation algorithm.

## Features

### 1. Automated Analysis
The tool automatically analyzes pattern data to find:
- **Peak angles**: φ_peak (horizontal max gain) and θ_peak (vertical max gain)
- **-3dB points**: Left/right for φ, up/down for θ
- **Angle breaks**: Detects non-monotonic sequences that need sorting/unwrapping
- **Range analysis**: Min/max angle coverage

### 2. Smart Hints
Generates actionable hints based on analysis:
- **φ offset detection**: Suggests +90°/-90° offset if needed
- **θ definition detection**: Identifies colatitude vs elevation conventions
- **Mirror detection**: Flags potential 360-φ transformations needed
- **Break warnings**: Highlights angle sequence issues

### 3. Console Output Format
```
========== ANGLE CHECKLIST ==========
[AngleChecklist] phi_peak=0.0° (gain=-0.50dB)
[AngleChecklist] theta_peak=90.0° (gain=-0.30dB)

--- -3dB Points ---
[AngleChecklist] phi_-3dB_left=45.0°
[AngleChecklist] phi_-3dB_right=315.0°
[AngleChecklist] theta_-3dB_up=60.0°
[AngleChecklist] theta_-3dB_down=120.0°

--- Angle Sequence Issues ---
[AngleChecklist] phi_breaks=[]
[AngleChecklist] theta_breaks=[180]

--- Analysis Hints ---
[AngleChecklist] φ_peak~0°: Excel φ=0 likely points to +X (viewer φ=0)
[AngleChecklist] θ_peak~90°: likely horizon (colatitude 90=XZ plane)
[AngleChecklist] φ range: [0.0, 359.0]
[AngleChecklist] θ range: [0.0, 180.0]
[AngleChecklist] Viewer: φ=0→+X, φ=90→+Z, θ=0→+Y, θ=90→XZ(horizon), θ=180→-Y
=====================================
```

## Usage

### Step 1: Load Pattern
Open the antenna pattern modal in the application. The debug system automatically activates when a pattern is loaded.

### Step 2: Run Analysis
Open browser console and execute:
```javascript
window.__apViewer.dbgAngleChecklist()
```

### Step 3: Interpret Results
- Check if φ_peak aligns with expected antenna front direction
- Verify θ_peak matches expected main lobe elevation
- Look for angle break warnings
- Review hints for offset/mirror suggestions

## Implementation Details

### Modified Files

#### 1. `antenna-pattern-model.service.ts`
Added methods:
- `generateAngleChecklist()`: Main analysis orchestrator
- `findMaxIndex()`: Locates peak gain indices
- `find3dBPoints()`: Finds -3dB beamwidth boundaries
- `detectAngleBreaks()`: Identifies non-monotonic sequences
- `generateHints()`: Creates actionable suggestions

New export:
- `AngleChecklistReport`: TypeScript interface for report structure

#### 2. `antenna-pattern-viewer.ts`
Added fields:
- `debugSheet`: Stores pattern sheet for analysis
- `debugModelService`: Reference to model service

Added methods:
- `setDebugData()`: Injects debug data before pattern build
- `dbgAngleChecklist()`: Prints formatted checklist to console

#### 3. `antenna-pattern-modal.component.ts`
Updated `ngAfterViewInit()`:
- Calls `setDebugData()` after loading pattern
- Exposes `window.__apViewer` for console access
- Logs debug availability message

Updated `ngOnDestroy()`:
- Cleans up global `__apViewer` reference

## Coordinate System Reference

### Viewer Convention (Babylon.js Y-up)
- **φ (azimuth)**:
  - φ=0° → +X axis (red)
  - φ=90° → +Z axis (blue)
  - φ=180° → -X axis
  - φ=270° → -Z axis
  
- **θ (colatitude)**:
  - θ=0° → +Y axis (green, zenith)
  - θ=90° → XZ plane (horizon)
  - θ=180° → -Y axis (nadir)

### Excel Conventions (Common Variations)
1. **Front-facing antenna**: φ=0 at -Z (antenna front) → needs -90° offset
2. **Elevation angle**: θ=0 at horizon, θ=90° at zenith → needs conversion
3. **Wrapped sequences**: [270..359, 0..269] → needs unwrapping before interpolation

## Example Scenarios

### Scenario 1: Front-Facing Antenna
```
[AngleChecklist] φ_peak~270°: Excel φ=270 may point to -Z → needs rotation/offset
```
**Solution**: Apply φ_viewer = φ_excel - 90°

### Scenario 2: Elevation Angle
```
[AngleChecklist] θ_peak~0°: likely colatitude (0=zenith/+Y) or elevation (+90=zenith)
```
**Solution**: If elevation, convert θ_viewer = 90° - θ_excel

### Scenario 3: Angle Breaks
```
[AngleChecklist] ⚠ φ has 1 break(s) at indices 270 → needs sorting/unwrap
```
**Solution**: Sort or unwrap angle sequence before creating interpolator

## Limitations
- Does not modify existing rendering algorithm
- Assumes linear interpolation between sample points
- -3dB detection uses simple nearest-neighbor search
- Break detection threshold: 5° for non-wrap cases

## Future Enhancements
- Automatic offset application based on detected patterns
- Visual markers on 3D viewer for peak/3dB points
- Export checklist report to file
- Comparison mode for multiple antenna files
