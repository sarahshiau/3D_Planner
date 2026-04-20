import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-topbar-panel',
  templateUrl: './topbar-panel.component.html',
  styleUrls: ['./topbar-panel.component.scss']
})
export class TopbarPanelComponent {
  @Output() close = new EventEmitter<void>();
  @Output() openAntennaManage = new EventEmitter<void>();
  @Output() openPathlossManage = new EventEmitter<void>();
  @Output() materialManage = new EventEmitter<void>();
  @Output() openRisManage = new EventEmitter<void>();
  
  onClickAntennaManage(): void {
    console.log('[TopbarPanel] antenna manage clicked');
    this.openAntennaManage.emit();
  }

  onOpenPathlossManage(): void {
      console.log('[TopbarPanel] pathloss manage clicked');
      this.openPathlossManage.emit();
    }

  onMaterialManageClick(): void {
    console.log('[TopbarPanel] material manage clicked');
    this.materialManage.emit();
  }
  
  onOpenRisManage(): void {
  console.log('[TopbarPanel] ris manage clicked');
  this.openRisManage.emit();
}

  ngOnInit(): void {
    console.log('[TopbarPanel] ngOnInit - panel created');
  }

  onClose(): void {
    console.log('[TopbarPanel] onClose clicked');
    this.close.emit();
  }

  constructor() {
    console.log('[TopbarPanel] constructor');
}

}
