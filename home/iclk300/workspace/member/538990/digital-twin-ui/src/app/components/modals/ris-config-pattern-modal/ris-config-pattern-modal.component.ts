import { Component, EventEmitter, Input, Output, OnInit, ViewChild, ElementRef, OnDestroy, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { RisService } from '../../../services/ris.service';
import { RisRawDataApi } from '../../../models/ris.model';
import { RisPatternViewer } from './ris-pattern-viewer';
import { firstValueFrom } from 'rxjs';

// ===== [RIS][PatternModal][ViewerTyping] =====
type GainFn = (thetaDeg: number, phiDeg: number) => number;

interface PatternViewerLike {
  init?(canvas: HTMLCanvasElement): void;
  resize?(): void;
  dispose?(): void;

  // 注意：RIS viewer 可能還沒實作，但我們要允許它存在
  buildFromGainFn?(gainFn: GainFn, stats?: any): void;
  setPatternSheet?(sheet: any, stats?: any): void;
  setDebugData?(sheet: any, modelService?: any): void;
}

@Component({
  selector: 'app-ris-config-pattern-modal',
  templateUrl: './ris-config-pattern-modal.component.html',
  styleUrls: ['./ris-config-pattern-modal.component.scss'],
})
export class RisConfigPatternModalComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
    @ViewChild('patternCanvas', { static: false }) patternCanvasRef!: ElementRef<HTMLCanvasElement>;
    viewer: PatternViewerLike | null = null;
    private resizeObserver: ResizeObserver | null = null;
  @Input() visible = false;
  @Input() zIndexBase = 3020;
  @Input() risID = 0;
  @Input() profileID = 0;
  @Input() configName = '';
  @Output() close = new EventEmitter<void>();

  rawData: RisRawDataApi | null = null;
  isLoading = false;
  errorMsg: string | null = null;
  private __loadSeq = 0;
  private __inFlight = false;
  Object = Object; // For template access

  constructor(private readonly risService: RisService) {
    console.log('[RisConfigPatternModal] constructor');
  }

  ngOnInit(): void {
    console.log('[RisConfigPatternModal] ngOnInit config=', this.configName, 'risID=', this.risID, 'profileID=', this.profileID);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const becameVisible = !!changes['visible'] && this.visible === true;
    const idChanged = !!changes['profileID'] || !!changes['risID'];

    if ((becameVisible || idChanged) && this.visible) {
      setTimeout(() => this.loadAndRender(), 0);
    }
  }

  ngAfterViewInit(): void {
    console.log('[RisConfigPatternModal] afterViewInit - canvas ready');

    const canvas = this.patternCanvasRef?.nativeElement;
    if (!canvas) return;

    if (!this.viewer) {
      requestAnimationFrame(() => {
        this.viewer = new RisPatternViewer();
        this.viewer.init(canvas);
        this.viewer.resize();

        // Setup resize observer (observe parent to handle layout changes)
        if (this.resizeObserver) this.resizeObserver.disconnect();
        const host = canvas.parentElement ?? canvas;
        this.resizeObserver = new ResizeObserver(() => {
          this.viewer?.resize();
        });
        this.resizeObserver.observe(host);

        // IMPORTANT: if modal is already visible, load+render now (fix "only axes" issue)
        if (this.visible) {
          // fire and forget
          this.loadAndRender();
        }
      });
    } else {
      // viewer already exists
      if (this.visible) this.loadAndRender();
    }
  }

  // ===== [RIS][PatternModal][LoadFlow] =====
  private async loadAndRender(): Promise<void> {
    const seq = ++this.__loadSeq;
    if (this.__inFlight) return;
    this.__inFlight = true;

    // viewer init is async (rAF). If not ready, retry shortly.
    if (!this.viewer) {
      console.log('[RisConfigPatternModal] viewer not ready yet, retry in 50ms');
      this.__inFlight = false; // ✅ release, avoid deadlock
      setTimeout(() => {
        if (this.visible) this.loadAndRender();
      }, 50);
      return;
    }

    const vAny = this.viewer as any;
    if (typeof vAny.buildFromRawData !== 'function') {
      console.warn('[RisConfigPatternModal] viewer.buildFromRawData() missing');
      this.__inFlight = false; // ✅ release
      return;
    }

    const risID = Number(this.risID);
    const profileID = Number(this.profileID);

    if (!Number.isFinite(risID) || risID <= 0 || !Number.isFinite(profileID) || profileID <= 0) {
      this.errorMsg = 'Invalid risID/profileID';
      this.__inFlight = false; // ✅ release
      return;
    }

    this.isLoading = true;
    this.errorMsg = null;

    try {
      const raw = await firstValueFrom(this.risService.getRisRawDataOnApi(risID, profileID));

      console.log('[RisConfigPatternModal] rawData loaded', {
        risID,
        profileID,
        rows: raw?.rowElement,
        cols: raw?.columnElement,
      });

      if (seq !== this.__loadSeq) return; // stale

      // OPTIONAL: attach angle meta if you have it (otherwise viewer defaults to [0,360],[0,180])
      // const enhanced = { ...raw, meta: { ...(raw as any).meta, phiIncDeg: [0, 360], thetaIncDeg: [0, 180] } };

      (this.viewer as any).buildFromRawData(raw);
      this.viewer.resize();

    } catch (e: any) {
      console.error('[RisConfigPatternModal] load rawData failed', e);
      this.errorMsg = '讀取場型失敗（API）';

      // fallback: build a tiny dummy matrix so user still sees a surface
      const dummy: any = {
        rowElement: 10,
        columnElement: 20,
        patternRaw: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), Array.from({ length: 20 }, () => 0)])),
        meta: { phiIncDeg: [0, 360], thetaIncDeg: [0, 180] },
      };
      (this.viewer as any).buildFromRawData(dummy);
      this.viewer.resize();
    } finally {
      this.__inFlight = false;
      this.isLoading = false;
    }
  }

  // ===== [RIS][PatternModal][Adapter] =====
  private buildPatternSheetFromRisRaw(raw: any): any {
    // 你後端回傳可能是：{ rowElement, columnElement, patternMatrix } 或 { rawData: {...} }
    // 先用最寬鬆的方式找出矩陣
    const matrix =
      raw?.patternRaw ??
      raw?.patternMatrix ??
      raw?.rawData?.patternMatrix ??
      raw?.pattern ??
      raw?.rawData?.pattern ??
      [];

    const rowN = raw?.rowElement ?? raw?.rawData?.rowElement ?? (Array.isArray(matrix) ? matrix.length : 0);
    const colN = raw?.columnElement ?? raw?.rawData?.columnElement ?? (Array.isArray(matrix?.[0]) ? matrix[0].length : 0);

    // 粗估 min/max
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < rowN; i++) {
      for (let j = 0; j < colN; j++) {
        const v = Number(matrix?.[i]?.[j] ?? 0);
        if (!Number.isFinite(v)) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }

    return {
      meta: {
        name: this.configName ?? `RIS Profile ${this.profileID}`,
        risID: this.risID,
        profileID: this.profileID,
      },
      grid: {
        matrix,
        rowN,
        colN,
      },
      stats: { minDb: min, maxDb: max },
    };
  }

  private sampleGainFromSheet(sheet: any, thetaDeg: number, phiDeg: number): number {
    const rowN = sheet?.grid?.rowN ?? 0;
    const colN = sheet?.grid?.colN ?? 0;
    const m = sheet?.grid?.matrix ?? [];
    if (rowN <= 0 || colN <= 0) return 0;

    // 暫定 mapping：theta 0..180 → row, phi 0..360 → col
    const ti = Math.max(0, Math.min(rowN - 1, Math.round((thetaDeg / 180) * (rowN - 1))));
    const pj = Math.max(0, Math.min(colN - 1, Math.round((phiDeg / 360) * (colN - 1))));
    const v = Number(m?.[ti]?.[pj] ?? 0);
    return Number.isFinite(v) ? v : 0;
  }
  ngOnDestroy(): void {
    try {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    } catch (e) {
      console.error('[RisConfigPatternModal] resizeObserver cleanup error', e);
    }
    try {
      if (this.viewer) {
        this.viewer.dispose();
        this.viewer = null;
      }
    } catch (e) {
      console.error('[RisConfigPatternModal] viewer cleanup error', e);
    }
  }

  onBackdropClick(): void {
    console.log('[RisConfigPatternModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[RisConfigPatternModal] close clicked');
    this.close.emit();
  }

  onExport(): void {
    console.log('[RisConfigPatternModal] export clicked');

    // placeholder：先匯出一個簡單 CSV（Excel 可直接開）
    const csv = [
      ['configName', this.configName],
      ['note', 'pattern export placeholder'],
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.configName}_pattern_export.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

}
