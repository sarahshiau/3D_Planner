import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  constructor(private readonly dialog: MatDialog) {}

  /** 共用確認對話框，回傳 Observable<boolean>（確定=true，取消=false） */
  question(message: string): Observable<boolean> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      disableClose: true,
      panelClass: 'planner-confirm-dialog',
      data: {
        title: '系統確認',
        message,
        confirmText: '確定',
        cancelText: '取消',
        type: 'question',
      },
    });

    return dialogRef.afterClosed().pipe(map((ok) => !!ok));
  }

  success(message: string): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      disableClose: true,
      panelClass: 'planner-confirm-dialog',
      data: {
        title: '操作成功',
        message,
        confirmText: '確定',
        type: 'success',
      },
    });
  }

  error(message: string): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      disableClose: true,
      panelClass: 'planner-confirm-dialog',
      data: {
        title: '發生錯誤',
        message,
        confirmText: '確定',
        type: 'error',
      },
    });
  }

  info(message: string): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      disableClose: true,
      panelClass: 'planner-confirm-dialog',
      data: {
        title: '系統提示',
        message,
        confirmText: '確定',
        type: 'info',
      },
    });
  }
}
