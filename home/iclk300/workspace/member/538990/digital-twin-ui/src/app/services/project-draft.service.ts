import { Injectable } from '@angular/core';
import { CommittedMapData } from '../models/committed-map-data.model';

@Injectable({ providedIn: 'root' })
export class ProjectDraftService {
  private committedMap: CommittedMapData | null = null;
  private projectMeta: any | null = null;
  private projectName: string = '工業技術研究院 中興院區';

  setCommittedMap(data: CommittedMapData): void {
    this.committedMap = data;
    console.log('[ProjectDraft] setCommittedMap', data);
  }

  consumeCommittedMap(): CommittedMapData | null {
    const data = this.committedMap;
    this.committedMap = null;
    console.log('[ProjectDraft] consumeCommittedMap', data);
    return data;
  }

  hasCommittedMap(): boolean {
    return !!this.committedMap;
  }

  setProjectMeta(meta: any): void {
    this.projectMeta = meta;
    // 同步儲存專案名稱
    if (meta?.projectName) {
      this.projectName = meta.projectName;
    }
    console.log('[ProjectDraft] setProjectMeta', meta);
  }

  consumeProjectMeta(): any | null {
    const meta = this.projectMeta;
    this.projectMeta = null;
    console.log('[ProjectDraft] consumeProjectMeta', meta);
    return meta;
  }

  /**
   * 取得專案名稱
   * @returns 專案名稱，若未設定則返回預設值
   */
  getProjectName(): string {
    return this.projectName;
  }

  /**
   * 設定專案名稱
   * @param name 專案名稱
   */
  setProjectName(name: string): void {
    if (name && name.trim()) {
      this.projectName = name;
      console.log('[ProjectDraft] setProjectName', name);
    }
  }

  clear(): void {
    this.committedMap = null;
    this.projectName = '工業技術研究院 中興院區';
    console.log('[ProjectDraft] cleared');
  }
}
