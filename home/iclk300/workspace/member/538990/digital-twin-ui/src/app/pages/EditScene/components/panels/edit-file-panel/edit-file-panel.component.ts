// src/app/panels/edit-file-panel/edit-file-panel.component.ts
import { Component } from '@angular/core';
import { ProjectFileService, SaveProjectPayload } from 'src/app/services/project-file.service';

@Component({
  selector: 'app-edit-file-panel',
  templateUrl: './edit-file-panel.component.html',
  styleUrls: ['./edit-file-panel.component.scss'],
})
export class EditFilePanelComponent {
  projectName = '工業技術研究院';

  layers = [
    { name: '戶外', file: 'OutDoor.glb' },
    // { name: '一樓', file: '1stFloor.glb' },
    // { name: '二樓', file: '2ndFloor.glb' },
  ];

  // Debug 狀態：讓你在 UI 上或 console 更好追
  isSaving = false;
  lastSaveRequestId: string | null = null;

  constructor(private projectFileService: ProjectFileService) {}

  /**
   * 儲存專案：
   * 1) 組出 payload（目前設定值：projectName + layers）
   * 2) 呼叫假 API service（只 console log + 模擬成功回傳）
   */
  // 【新增】匯出用 debug 狀態
  isExporting = false;
  lastExportFileName: string | null = null;

  /**
 * 【新增】把目前設定值組成 payload（匯出/儲存共用）
 */
  private buildProjectPayload() {
    return {
      projectName: this.projectName,
      layers: this.layers.map(l => ({ ...l })),
      exportedAtISO: new Date().toISOString(),
    };
  }

  /**
   * 【新增】把文字內容下載成 .txt（純前端，不需後端）
   */
  private downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    // 釋放記憶體
    URL.revokeObjectURL(url);
  }

  saveProject() {
    if (this.isSaving) return;

    this.isSaving = true;
    this.lastSaveRequestId = null;

    const payload: SaveProjectPayload = {
      projectName: this.projectName,
      layers: this.layers.map(l => ({ ...l })), // 防止外部誤改 reference
      savedAtISO: new Date().toISOString(),
    };

    console.log('[EditFilePanel] saveProject clicked');
    console.log('[EditFilePanel] payload prepared =', payload);

    this.projectFileService.saveProject(payload).subscribe({
      next: (res) => {
        console.log('[EditFilePanel] saveProject success =>', res);
        this.lastSaveRequestId = res.requestId;
      },
      error: (err) => {
        // 目前是 fake API，理論上不會進來，但保留方便你之後換真 API debug
        console.error('[EditFilePanel] saveProject error =>', err);
      },
      complete: () => {
        this.isSaving = false;
      },
    });
  }

  exportProject() {
    if (this.isExporting) return;

    this.isExporting = true;
    this.lastExportFileName = null;

    // 1) 組出目前設定值（「現在 UI 上的值」）
    const payload = this.buildProjectPayload();

    // 2) 轉成可讀的文字內容（你也可以改成 JSON.stringify(payload, null, 2) 走純 JSON）
    const textContent =
      `=== Project Export ===\n` +
      `Project Name: ${payload.projectName}\n` +
      `Exported At: ${payload.exportedAtISO}\n` +
      `\n` +
      `--- Layers (${payload.layers.length}) ---\n` +
      payload.layers.map((l: any, idx: number) => `${idx + 1}. ${l.name} -> ${l.file}`).join('\n') +
      `\n`;

    // 3) 檔名（避免特殊字元）
    const safeName = String(payload.projectName || 'project')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();

    const filename = `${safeName}_export_${Date.now()}.txt`;

    // 4) 下載
    this.downloadTextFile(filename, textContent);

    // 5) Debug log（你要求 console log 顯示匯出成功）
    console.log('[EditFilePanel] exportProject success');
    console.log('[EditFilePanel] filename =', filename);
    console.log('[EditFilePanel] payload =', payload);

    this.lastExportFileName = filename;
    this.isExporting = false;
  }


  addLayer() {
    console.log('[EditFilePanel] 新增圖層');

    // 先用最簡單可 debug 的方式：直接 append 一筆假資料
    const nextIndex = this.layers.length + 1;
    this.layers = [
      ...this.layers,
      { name: `新圖層 ${nextIndex}`, file: `NewLayer_${nextIndex}.glb` },
    ];
  }



}
