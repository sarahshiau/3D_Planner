import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { GlbTestService } from 'src/app/services/glb-test.service';
import {
  Engine,
  Scene,
  SceneLoader,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
} from '@babylonjs/core';

/**
 * GLBmapComponent
 * 
 * 職責：
 * - 從 GlbTestService 獲取上傳的 GLB 檔案
 * - 使用 Babylon.js 渲染 3D 模型
 * - 提供基礎的相機控制和場景管理
 * - 完善的資源清理機制
 */
@Component({
  selector: 'app-glbmap',
  templateUrl: './glbmap.component.html',
  styleUrls: ['./glbmap.component.scss'],
})
export class GLBmapComponent implements OnInit, OnDestroy {
  /** Babylon.js 核心對象 */
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private objectUrl: string | null = null;

  constructor(
    private router: Router,
    private glbTestService: GlbTestService
  ) {}

  ngOnInit(): void {
    // 獲取上傳的檔案
    const file = this.glbTestService.getFile();

    // 安全性檢查：若無檔案則返回
    if (!file) {
      console.warn('[GLBmap] No GLB file found in service. Redirecting to /project/new');
      this.router.navigate(['/project/new']);
      return;
    }

    // 初始化 Babylon.js 場景
    this.initializeBabylonScene(file);
  }

  /**
   * 初始化 Babylon.js 場景並載入 GLB 模型
   * @param file - GLB 檔案
   */
  private initializeBabylonScene(file: File): void {
    try {
      // 獲取畫布元素
      const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
      if (!canvas) {
        console.error('[GLBmap] Canvas element not found');
        return;
      }

      // 建立引擎
      this.engine = new Engine(canvas, true);

      // 建立場景
      this.scene = new Scene(this.engine);
      this.scene.clearColor.copyFromFloats(0.11, 0.06, 0.13, 1); // #0b1020 RGB 轉換

      // 使用 FileReader 讀取檔案
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result || !this.scene) {
          console.error('[GLBmap] Failed to read file');
          return;
        }

        console.log('[GLBmap] Loading GLB file:', {
          fileName: file.name,
          fileSize: this.glbTestService.getFileSize() + ' MB',
        });

        // 使用 SceneLoader 載入 GLB 資料
        try {
          SceneLoader.AppendAsync('', 'data:' + file.type + ';base64,' + this.arrayBufferToBase64(event.target.result as ArrayBuffer), this.scene)
            .then(() => {
              console.log('[GLBmap] GLB model loaded successfully');

              // 建立預設相機和光源
              if (this.scene) {
                this.scene.createDefaultCameraOrLight(true, true, true);

                // 附加相機控制
                const camera = this.scene.activeCamera;
                if (camera) {
                  camera.attachControl(canvas, true);
                  console.log('[GLBmap] Camera attached and controls enabled');
                }

                // 啟動渲染迴圈
                this.engine?.runRenderLoop(() => {
                  this.scene?.render();
                });

                // 響應視窗大小調整
                window.addEventListener('resize', () => {
                  this.engine?.resize();
                });
              }
            })
            .catch((error) => {
              console.error('[GLBmap] Failed to load GLB file:', error);
              alert('無法載入 GLB 檔案，請確認檔案格式正確');
              this.router.navigate(['/project/new']);
            });
        } catch (error) {
          console.error('[GLBmap] Error loading scene:', error);
          alert('載入場景發生錯誤');
          this.router.navigate(['/project/new']);
        }
      };

      reader.onerror = () => {
        console.error('[GLBmap] FileReader error');
        alert('無法讀取 GLB 檔案');
        this.router.navigate(['/project/new']);
      };

      // 讀取檔案為 ArrayBuffer
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('[GLBmap] Error initializing Babylon scene:', error);
      alert('初始化 3D 場景失敗');
      this.router.navigate(['/project/new']);
    }
  }

  /**
   * 將 ArrayBuffer 轉換為 Base64 字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 元件銷毀時清理資源
   * 
   * 必須執行的操作：
   * 1. 銷毀 Babylon.js 場景
   * 2. 銷毀 Babylon.js 引擎
   */
  ngOnDestroy(): void {
    console.log('[GLBmap] Cleaning up resources...');

    // 2. 銷毀場景（釋放所有網格、材質、紋理等）
    if (this.scene) {
      this.scene.dispose();
      console.log('[GLBmap] Scene disposed');
    }

    // 3. 銷毀引擎（停止渲染迴圈並釋放 WebGL 上下文）
    if (this.engine) {
      this.engine.dispose();
      console.log('[GLBmap] Engine disposed');
    }

    console.log('[GLBmap] All resources cleaned up');
  }
}
