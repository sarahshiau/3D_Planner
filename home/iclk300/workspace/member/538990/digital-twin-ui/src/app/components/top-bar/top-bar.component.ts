import { Component, ChangeDetectorRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslationService } from '../../services/translation.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { LogoutApiService } from '../../services/logout-api.service';

@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss']
})
export class TopBarComponent {
  username = 'XXX';

  isTopbarPanelOpen = false;
  isAntennaManageOpen = false;

  // ✅ 新增：天線場型圖 modal 狀態
  isAntennaPatternOpen = false;
  isPathlossManageOpen = false;
  isMaterialManageOpen = false;
  isRisManageOpen = false;
  
  patternAntennaName: string | null = null;
  
  constructor(
    public translation: TranslationService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private logoutApi: LogoutApiService
  ) {}

  toggleTopbarPanel(): void {
    this.isTopbarPanelOpen = !this.isTopbarPanelOpen;
  }

  closeTopbarPanel(): void {
    this.isTopbarPanelOpen = false;
  }

  openAntennaManage(): void {
    this.isAntennaManageOpen = true;
  }
  
  closeAntennaManage(): void {
    this.isAntennaManageOpen = false;
  }

  openPathlossManage(): void {
  this.isPathlossManageOpen = true;
  }

  closePathlossManage(): void {
    this.isPathlossManageOpen = false;
  }

  openMaterialManage(): void {
    this.isMaterialManageOpen = true;
  }

  closeMaterialManage(): void {
    this.isMaterialManageOpen = false;
  }

  openRisManage(): void {
    this.isRisManageOpen = true;
  }

  closeRisManage(): void {
    this.isRisManageOpen = false;
  }

    onLogoutClick(): void {
    console.log('[TopBar] logout clicked');

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      disableClose: true,
      panelClass: 'planner-confirm-dialog',
      data: {
        title: this.translation.currentLang === 'zh' ? '確認登出' : 'Confirm Logout',
        message: this.translation.currentLang === 'zh'
          ? '你確定要登出嗎？'
          : 'Are you sure you want to logout?',
        confirmText: this.translation.currentLang === 'zh' ? '登出' : 'Logout',
        cancelText: this.translation.currentLang === 'zh' ? '取消' : 'Cancel',
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      console.log('[TopBar] logout dialog result =', confirmed);

      if (!confirmed) return;

      // Stub：只打 request + log，不清 token、不導頁、不關 modal
      this.logoutApi.logout().subscribe((res) => {
        console.log('[TopBar] logout stub response =', res);
      });
    });
  }

  switchLang(lang: 'zh' | 'en') {
    this.translation.switchLang(lang);
    this.cdr.detectChanges();
  }

}
