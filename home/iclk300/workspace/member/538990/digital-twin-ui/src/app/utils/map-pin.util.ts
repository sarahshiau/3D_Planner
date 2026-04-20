import * as BABYLON from '@babylonjs/core';

export interface MapPinOptions {
  name?: string;

  // meters
  widthM?: number;   // pin width (X span in 2D)
  heightM?: number;  // pin height (Y span in 2D, tip at y=0)
  depthM?: number;   // extrusion depth (along +Z before rotation)

  holeRadiusRatio?: number; // relative to width
  arcSegments?: number;
  holeSegments?: number;

  // base disc (ground shadow)
  baseDiscRadiusRatio?: number; // relative to width
  baseDiscAlpha?: number;       // 0..1
  baseDiscLiftMm?: number;      // lift to avoid z-fighting

  // initial color
  colorHex?: string; // "#E53935"
}

export interface MapPinHandle {
  root: BABYLON.TransformNode;
  pin: BABYLON.Mesh;
  baseDisc: BABYLON.Mesh;
  setColor: (hex: string) => void;
}

export function createMapPin(scene: BABYLON.Scene, opts: MapPinOptions = {}): MapPinHandle {
  const name = opts.name ?? 'map_pin';

  // ===== Defaults (meters) =====
  const W = opts.widthM ?? 1.0;
  const H = opts.heightM ?? 1.45;
  const D = opts.depthM ?? 0.20;

  const holeR = (opts.holeRadiusRatio ?? 0.22) * W;
  const arcSeg = opts.arcSegments ?? 48;
  const holeSeg = opts.holeSegments ?? 48;

  const baseDiscR = (opts.baseDiscRadiusRatio ?? 0.55) * W;
  const baseDiscAlpha = opts.baseDiscAlpha ?? 0.28;
  const baseDiscLift = (opts.baseDiscLiftMm ?? 2) / 1000;

  const initialHex = opts.colorHex ?? '#E53935';

  // ===== Root =====
  const root = new BABYLON.TransformNode(`${name}_root`, scene);

  // ===== [PIN2D] Head (sphere) + Stem (cylinder) =====
  // Dimensions (meters)
  const headRadius = (opts.widthM ?? 1.0) * 1.5;  // 放大至 0.38（原 0.28）
  const stemRadius = headRadius * 0.12;            // 竿粗細：可調
  const stemHeight = (opts.heightM ?? 1.45) * 2.5; // 竿長同步調整至 0.85

  // Head: perfect sphere (visible from any angle)
  const pinHead = BABYLON.MeshBuilder.CreateSphere(
    `${name}_pin_head`,
    {
      diameter: headRadius * 2,
      segments: 48,
    },
    scene
  );
  pinHead.parent = root;
  // 放在竿子上方
  pinHead.position.y = stemHeight + headRadius * 0.55;

  // Stem: cylinder
  const pinStem = BABYLON.MeshBuilder.CreateCylinder(
    `${name}_pin_stem`,
    { height: stemHeight, diameter: stemRadius * 2, tessellation: 24 },
    scene
  );
  pinStem.parent = root;
  // Stem starts from ground (y=0) up to stemHeight; cylinder is centered by default
  pinStem.position.y = stemHeight * 0.5;

  // Material: solid color (still support setColor)
  const mat = new BABYLON.StandardMaterial(`${name}_pin_mat`, scene);
  mat.diffuseColor = BABYLON.Color3.FromHexString(opts.colorHex ?? '#E53935');
  mat.emissiveColor = mat.diffuseColor.scale(0.15); // 微亮，讓它在陰影中也清楚
  mat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);

  pinHead.material = mat;
  pinStem.material = mat;

  // Expose "pin" as head (keep old handle shape)
  const pin = pinHead as BABYLON.Mesh;

  // ===== Base Disc (ground shadow) =====
  const baseDisc = BABYLON.MeshBuilder.CreateDisc(
    `${name}_base_disc`,
    { radius: baseDiscR, tessellation: 64 },
    scene
  );
  baseDisc.parent = root;
  // Base disc must lie on XZ ground (Y-up), so we force disc local rotation after root rotation.
  (baseDisc as any).rotationQuaternion = null;
  baseDisc.rotation.set(Math.PI / 2, 0, 0);
  baseDisc.position.y = baseDiscLift;
  baseDisc.isPickable = false;

  root.computeWorldMatrix(true);

  const discMat = new BABYLON.StandardMaterial(`${name}_disc_mat`, scene);
  discMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  discMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  discMat.alpha = baseDiscAlpha;
  discMat.disableLighting = true;
  baseDisc.material = discMat;

  const setColor = (hex: string) => {
    const c = BABYLON.Color3.FromHexString(hex);
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(0.15);
  };

  // Init
  setColor(initialHex);

  return { root, pin, baseDisc, setColor };
}

/** CCW outline: top arc (L->R) + right side (R->tip) + left side (tip->L)
 *  Improved teardrop: use 2-stage curves so tip converges faster (sharper).
 */
function buildPinOutline2D(W: number, H: number, arcSegments: number): BABYLON.Vector2[] {
  const R = W * 0.5;
  const cy = H - R;
  const tip = new BABYLON.Vector2(0, 0);

  // top arc: angle π..0
  const topArc: BABYLON.Vector2[] = [];
  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const ang = Math.PI * (1 - t);
    topArc.push(new BABYLON.Vector2(
      R * Math.cos(ang),
      cy + R * Math.sin(ang)
    ));
  }

  const left = topArc[0];                   // (-R, cy)
  const right = topArc[topArc.length - 1];  // (+R, cy)

  // --- Add a "shoulder" point (where the pin starts to narrow)
  // Higher shoulder => longer body; lower shoulder => rounder body.
  const shoulderY = cy * 0.62;
  const shoulderX = R * 0.82;

  const rightShoulder = new BABYLON.Vector2(+shoulderX, shoulderY);
  const leftShoulder  = new BABYLON.Vector2(-shoulderX, shoulderY);

  // Segments
  const sideSeg1 = Math.max(10, Math.floor(arcSegments / 4)); // circle end -> shoulder
  const sideSeg2 = Math.max(18, Math.floor(arcSegments / 2)); // shoulder -> tip (more segments for sharper tip)

  // Stage 1 (right end -> right shoulder): keep relatively round
  const rightCtrl1 = new BABYLON.Vector2(+R * 1.05, cy * 0.78);
  const rightToShoulder = sampleQuadraticBezier(right, rightCtrl1, rightShoulder, sideSeg1);

  // Stage 2 (right shoulder -> tip): pull inward aggressively so it becomes a true "teardrop"
  // Smaller ctrlX => faster converge to centerline => sharper tip.
  const rightCtrl2 = new BABYLON.Vector2(+R * 0.18, cy * 0.22);
  const shoulderToTipR = sampleQuadraticBezier(rightShoulder, rightCtrl2, tip, sideSeg2);

  // Left side: symmetric
  const leftCtrl1 = new BABYLON.Vector2(-R * 1.05, cy * 0.78);
  const leftToShoulder = sampleQuadraticBezier(leftShoulder, leftCtrl1, left, sideSeg1); // shoulder -> left end

  const leftCtrl2 = new BABYLON.Vector2(-R * 0.18, cy * 0.22);
  const tipToShoulderL = sampleQuadraticBezier(tip, leftCtrl2, leftShoulder, sideSeg2);  // tip -> shoulder

  // Merge (CCW)
  const outline: BABYLON.Vector2[] = [];
  outline.push(...topArc);                               // left -> right (arc)
  outline.push(...rightToShoulder.slice(1));             // right -> shoulder
  outline.push(...shoulderToTipR.slice(1));              // shoulder -> tip
  outline.push(...tipToShoulderL.slice(1));              // tip -> left shoulder
  outline.push(...leftToShoulder.slice(1));              // left shoulder -> left end

  // [PIN][DBG] outline extremes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  console.log('[PinShape2D][BBOX]', { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY });

  // print a few points near the tip (lowest Y)
  const sorted = [...outline].sort((a,b)=>a.y-b.y);
  console.log('[PinShape2D][TIP_PTS]', sorted.slice(0, 8));

  return outline;
}

function sampleQuadraticBezier(p0: BABYLON.Vector2, p1: BABYLON.Vector2, p2: BABYLON.Vector2, segments: number): BABYLON.Vector2[] {
  const pts: BABYLON.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push(new BABYLON.Vector2(
      a * p0.x + b * p1.x + c * p2.x,
      a * p0.y + b * p1.y + c * p2.y
    ));
  }
  return pts;
}

function buildCircle2D(center: BABYLON.Vector2, r: number, segments: number): BABYLON.Vector2[] {
  const pts: BABYLON.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const ang = t * Math.PI * 2;
    pts.push(new BABYLON.Vector2(
      center.x + Math.cos(ang) * r,
      center.y + Math.sin(ang) * r
    ));
  }
  return pts;
}

/** Build a tiny vertical ramp texture so a single base color can look like shaded gradient. */
function buildVerticalRampTexture(scene: BABYLON.Scene, name: string, hex: string): BABYLON.DynamicTexture {
  const tex = new BABYLON.DynamicTexture(name, { width: 8, height: 128 }, scene, false);
  tex.hasAlpha = false;
  updateVerticalRampTexture(tex, hex);
  return tex;
}

function updateVerticalRampTexture(tex: BABYLON.DynamicTexture, hex: string): void {
  const ctx = tex.getContext();
  const base = BABYLON.Color3.FromHexString(hex);

  // top brighter, bottom darker (subtle)
  const top = base.scale(1.08);
  const bottom = base.scale(0.65);

  const w = tex.getSize().width;
  const h = tex.getSize().height;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgb(${(top.r * 255) | 0}, ${(top.g * 255) | 0}, ${(top.b * 255) | 0})`);
  grad.addColorStop(1, `rgb(${(bottom.r * 255) | 0}, ${(bottom.g * 255) | 0}, ${(bottom.b * 255) | 0})`);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  tex.update(false);
}
