import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectDraftService } from 'src/app/services/project-draft.service';
import { GlbTestService } from 'src/app/services/glb-test.service';
import { CommittedMapData } from 'src/app/models/committed-map-data.model';
import { AlertService } from 'src/app/services/alert.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ResultDataService } from 'src/app/services/result-data.service';

type ProjectSourceType = 'gis' | 'glb';
type HistoryTaskItem = {
  groupId: number;
  taskName: string;
  protocol: string;
  createTime: string;
};
type HistoryGroupItem = {
  groupId: number;
  taskName: string;
  protocol: string;
  createTime: string;
  groupTask: HistoryTaskItem[];
};

@Component({
  selector: 'app-new-project',
  templateUrl: './new-project.component.html',
  styleUrls: ['./new-project.component.scss'],
})
export class NewProjectComponent implements OnInit {
  projects: HistoryGroupItem[] = [];
  expandedGroupIds = new Set<number>();

  showCreateModal = false;   // 視窗1
  showGisPicker = false;     // 視窗2（MapPicker）

  draftForm: any = {
    projectName: '',
    fieldMapSource: 'gis', // 預設 GIS
    fieldSize: { length: 10, width: 10, height: 3 },
    networkType: '5G',
    band: 'n78',
  };

  sourceType: ProjectSourceType = 'gis';

  selectedGisFile: File | null = null;
  selectedGlbFile: File | null = null;

  projectName = '未命名專案';

  // -------------------- GIS Map Picker Modal (Phase 1 skeleton) --------------------
  constructor(
    private router: Router,
    private draft: ProjectDraftService,
    private glbTestService: GlbTestService,
    private alertService: AlertService,
    private http: HttpClient,
    private resultData: ResultDataService
  ) {}

  ngOnInit(): void {
    void this.loadHistoryProjects();
  }

  private async loadHistoryProjects(): Promise<void> {
    const auth = this.resolveHistoryAuth();

    try {
      const url = `/son/history/${encodeURIComponent(auth.id)}/${encodeURIComponent(auth.session)}`;
      console.log('[NewProject] load history', { url, id: auth.id, session: auth.session });
      const res = await firstValueFrom(this.http.get<any>(url));
      const rawHistory = Array.isArray(res?.history) ? res.history : [];

      this.projects = rawHistory.map((row: any, index: number) => this.mapHistoryGroupItem(row, index));
    } catch (err) {
      console.error('[NewProject] load history failed', err);
      this.projects = [];
    }
  }

  private resolveHistoryAuth(): { id: string; session: string } {
    const id = 'ydhuang';
    const session = 'son_session_3967d6ec-8304-402b-ab67-06cc9601895a';

    return { id, session };
  }

  private pickFirstLocalStorageValue(keys: string[]): string {
    for (const key of keys) {
      try {
        const val = localStorage.getItem(key);
        if (typeof val === 'string' && val.trim()) return val.trim();
      } catch {}
    }
    return '';
  }

  private mapHistoryGroupItem(raw: any, fallbackIndex: number): HistoryGroupItem {
    const normalizedGroupId = this.normalizeGroupId(raw?.groupId, fallbackIndex);
    const childrenRaw = Array.isArray(raw?.groupTask) ? raw.groupTask : [];
    const groupTask = childrenRaw.map((task: any, childIndex: number) =>
      this.mapHistoryTaskItem(task, normalizedGroupId, childIndex)
    );

    return {
      groupId: normalizedGroupId,
      taskName: String(raw?.taskName ?? ''),
      protocol: String(raw?.protocol ?? ''),
      createTime: String(raw?.createTime ?? ''),
      groupTask,
    };
  }

  private mapHistoryTaskItem(raw: any, parentGroupId: number, fallbackIndex: number): HistoryTaskItem {
    const normalizedGroupId = this.normalizeGroupId(raw?.groupId, parentGroupId * 1000 + fallbackIndex);
    return {
      groupId: normalizedGroupId,
      taskName: String(raw?.taskName ?? ''),
      protocol: String(raw?.protocol ?? ''),
      createTime: String(raw?.createTime ?? ''),
    };
  }

  private normalizeGroupId(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  toggleGroup(groupId: number): void {
    if (this.expandedGroupIds.has(groupId)) {
      this.expandedGroupIds.delete(groupId);
    } else {
      this.expandedGroupIds.add(groupId);
    }
  }

  isExpanded(groupId: number): boolean {
    return this.expandedGroupIds.has(groupId);
  }

  hasChildren(row: HistoryGroupItem): boolean {
    return Array.isArray(row.groupTask) && row.groupTask.length > 0;
  }

  onOpenCreateModal(): void {
    this.showCreateModal = true;
  }

  onCloseCreateModal(): void {
    this.showCreateModal = false;
  }

  onCreateConfirm(): void {
    // 這裡是視窗1按下「確認」
    const meta = {
      ...this.draftForm,
      createdAtISO: new Date().toISOString(),
    };

    // 保存專案名稱到 Service
    const projectName = meta.projectName || '工業技術研究院 中興院區';
    this.draft.setProjectName(projectName);

    // ✅ GLB 測試分支：直接跳轉到 GLBmap
    if (meta.fieldMapSource === 'glb') {
      // 檢查是否有選擇檔案
      if (!this.selectedGlbFile) {
        this.alertService.info('請先選擇 GLB 檔案');
        return;
      }

      // 儲存檔案到 GlbTestService
      this.glbTestService.setFile(this.selectedGlbFile);
      this.glbTestService.isGlbMode = true;

      console.log('[NewProject] confirm form with GLB -> navigate to GLBmap', {
        fileName: this.selectedGlbFile.name,
        fileSize: this.glbTestService.getFileSize(),
      });

      // 關閉彈窗並跳轉
      this.showCreateModal = false;
      this.router.navigate(['/GLBmap']);
      return;
    }

    // ✅ GIS 分支：開啟 MapPicker 第二步
    if (meta.fieldMapSource === 'gis') {
      console.log('[NewProject] confirm form -> open MapPicker', meta);
      this.draft.setProjectMeta(meta);
      this.showCreateModal = false;
      this.showGisPicker = true;
      return;
    }
  }

  onPickFile(evt: Event, type: ProjectSourceType): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    // GLB 檔案驗證
    if (type === 'glb' && file) {
      // 檢查副檔名
      if (!file.name.toLowerCase().endsWith('.glb')) {
        this.alertService.info('請只選擇 .glb 檔案');
        input.value = ''; // 清空輸入
        this.selectedGlbFile = null;
        return;
      }

      // 檢查 MIME type（可選但建議）
      if (file.type && !file.type.includes('gltf') && !file.type.includes('octet-stream')) {
        console.warn('[NewProject] Unusual MIME type for GLB file:', file.type);
      }

      this.selectedGlbFile = file;
    }

    if (type === 'gis') this.selectedGisFile = file;

    console.log('[NewProject] file picked', { type, fileName: file?.name });
  }

  onCancelGisPicker(): void {
    this.showGisPicker = false;
    this.showCreateModal = true;
    console.log('[NewProject] MapPicker back -> return to Create Modal (keep draft)');
  }

  onCommittedFromPicker(committed: CommittedMapData): void {
    console.log('[NewProject] committed from MapPicker -> create & go EditScene', committed);
    this.draft.setCommittedMap(committed);
    this.showGisPicker = false;
    // ResultDataService 為 root 單例：先前若已在 EditScene 進入過結果模式，viewMode 會維持 result；
    // 新建專案進場時必須回到編輯模式，否則會沿用舊的結果模式 UI。
    this.resultData.resetToEdit();
    this.router.navigate(['/editscene']);
  }

}
