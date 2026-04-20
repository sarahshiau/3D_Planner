import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-ris-angle-help-modal',
  templateUrl: './ris-angle-help-modal.component.html',
  styleUrls: ['./ris-angle-help-modal.component.scss'],
})
export class RisAngleHelpModalComponent {
  @Input() zIndexBase = 4000;
  @Input() title = '角度說明';

  @Output() close = new EventEmitter<void>();

  imgSrc = 'assets/templates/RIS.png';

  onBackdropClick(): void {
    console.log('[RisAngleHelpModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisAngleHelpModal] close clicked');
    this.close.emit();
  }
}
