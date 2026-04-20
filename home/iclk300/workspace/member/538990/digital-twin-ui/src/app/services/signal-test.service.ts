// ✅ 1. 修正匯入：使用最新的名稱
import { 
  Injectable 
} from '@angular/core';

import { 
  Scene, Vector3, Mesh, Ray, Color3, StandardMaterial,
  CreateGreasedLine,         // 直接匯入函數
  GreasedLineMeshColorMode   // 修正名稱
} from '@babylonjs/core';

@Injectable({ providedIn: 'root' })
export class SignalTestService {
  private readonly FREQUENCY = 3.5e9;
  private readonly TX_POWER = 40;

  initBuildingMetadata(scene: Scene) {
    scene.meshes.forEach(m => {
      if (m.metadata?.type === 'osm_building') {
        m.metadata.attenuationDB = 0.5 + Math.random() * 4.5;
      }
    });
  }

  calculateRayPath(scene: Scene, start: Vector3, end: Vector3) {
    const direction = end.subtract(start).normalize();
    const maxDist = Vector3.Distance(start, end);
    const ray = new Ray(start, direction, maxDist);
    const hits = scene.multiPickWithRay(ray).sort((a, b) => a.distance - b.distance);

    let totalWallLoss = 0;
    const pathPoints: Vector3[] = [start];
    
    // ✅ 修正點：最新 API 參數名稱為 'color' (單數)，且型別為 Color3 或 Color3[]
    const pathColors: Color3[] = [this.getSignalColor(this.TX_POWER)]; 

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (hit.pickedMesh?.metadata?.type === 'osm_building') {
        const nextHit = hits[i + 1];
        if (nextHit && nextHit.pickedMesh === hit.pickedMesh) {
          const thickness = nextHit.distance - hit.distance;
          const attRate = hit.pickedMesh.metadata.attenuationDB || 2.0;
          totalWallLoss += thickness * attRate;

          pathPoints.push(hit.pickedPoint!);
          pathPoints.push(nextHit.pickedPoint!);
          
          const currentPower = this.TX_POWER - totalWallLoss;
          const col = this.getSignalColor(currentPower);
          pathColors.push(col, col); 
          i++; 
        }
      }
    }
    pathPoints.push(end);
    const finalDBm = this.TX_POWER - (20 * Math.log10(maxDist) + 20 * Math.log10(this.FREQUENCY) - 147.55) - totalWallLoss;
    pathColors.push(this.getSignalColor(finalDBm));

    return { points: pathPoints, colors: pathColors, finalDBm };
  }

  private getSignalColor(dBm: number): Color3 {
    const ratio = Math.max(0, Math.min(1, (dBm - (-100)) / ((-30) - (-100))));
    return new Color3(ratio, 0, 1 - ratio);
  }
}