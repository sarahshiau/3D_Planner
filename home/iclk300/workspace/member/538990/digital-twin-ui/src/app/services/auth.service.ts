import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // 目前先手動填入 YAML 範例中的 SessionID，讓 API 能通過驗證
  private mockSessionToken = 'xxxx_yyyy_zzzz';

  constructor() {}

  /**
   * 取得目前的 Session 資訊
   * 未來補上登入功能後，此處改為從 LocalStorage 或 Cookie 讀取
   */
  getSessionInfo(): string {
    return 'son_session_230e4316-2def-401f-b299-1197ed5bf682';
  }

  /**
   * 檢查是否已登入 (目前暫時永遠回傳 true)
   */
  isAuthenticated(): boolean {
    return !!this.mockSessionToken;
  }
}