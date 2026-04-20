import { Injectable } from '@angular/core';
import { signal } from '@angular/core';

/**
 * GlbTestService
 * 負責在組件間傳遞 3D 模型檔案（GLB 格式）
 * 
 * 主要職責：
 * - 存儲和管理上傳的 GLB 檔案
 * - 在組件間共享 3D 模型數據
 * - 提供記憶體管理機制
 */
@Injectable({
  providedIn: 'root',
})
export class GlbTestService {
  /** 私有屬性：存儲選中的 GLB 檔案 */
  private selectedFile: File | null = null;

  /** 標記：記錄當前專案是否為 GLB 模式 */
  isGlbMode: boolean = false;

  constructor() {}

  /**
   * 儲存上傳的 GLB 檔案
   * @param file - 要儲存的 File 對象
   */
  setFile(file: File): void {
    // 驗證檔案類型
    if (!file.name.toLowerCase().endsWith('.glb')) {
      console.warn('Warning: Selected file may not be a valid GLB file');
    }
    this.selectedFile = file;
  }

  /**
   * 回傳當前儲存的檔案
   * @returns 返回 File 對象或 null
   */
  getFile(): File | null {
    return this.selectedFile;
  }

  /**
   * 手動清空檔案以釋放記憶體
   */
  clearFile(): void {
    this.selectedFile = null;
  }

  /**
   * 獲取檔案大小（單位：MB）
   * @returns 檔案大小，若無檔案則返回 0
   */
  getFileSize(): number {
    if (!this.selectedFile) {
      return 0;
    }
    return parseFloat((this.selectedFile.size / (1024 * 1024)).toFixed(2));
  }

  /**
   * 檢查是否已加載檔案
   * @returns true 表示已有檔案，false 表示無檔案
   */
  hasFile(): boolean {
    return this.selectedFile !== null;
  }

  /**
   * 獲取檔案名稱
   * @returns 檔案名稱或 null
   */
  getFileName(): string | null {
    return this.selectedFile?.name ?? null;
  }
}
