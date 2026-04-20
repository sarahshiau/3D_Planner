/**
 * Coordinate conversion utility between:
 * - MathCoord3D (canonical/backend-facing, left-bottom origin)
 * - SceneCoord3D (Babylon-facing, center origin on x-z plane)
 *
 * We keep two coordinate systems because backend math/domain data and
 * Babylon rendering use different origins and axes conventions.
 */

export type MathCoord3D = {
  x: number; // x: right
  y: number; // y: up (height)
  z: number; // z: height? (canonical uses z as height in this project)
};

export type SceneCoord3D = {
  x: number; // x: right
  y: number; // y: height in Babylon
  z: number; // z: forward/back on x-z ground plane
};

/**
 * Scene -> Math
 * Fixed rules:
 * math.x = scene.x + width / 2
 * math.y = scene.z + height / 2
 * math.z = scene.y
 */
export function sceneToMath(
  scene: SceneCoord3D,
  width: number,
  height: number
): MathCoord3D {
  return {
    x: scene.x + width / 2,
    y: scene.z + height / 2,
    z: scene.y,
  };
}

/**
 * Math -> Scene
 * Fixed rules:
 * scene.x = math.x - width / 2
 * scene.z = math.y - height / 2
 * scene.y = math.z
 */
export function mathToScene(
  math: MathCoord3D,
  width: number,
  height: number
): SceneCoord3D {
  return {
    x: math.x - width / 2,
    y: math.z,
    z: math.y - height / 2,
  };
}

