import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AntennaRow } from '../antenna-manage-modal/antenna-manage-modal.component';
import { AntennaPatternViewer } from './antenna-pattern-viewer';
import { AntennaPatternXlsxService } from '../../../services/antenna-pattern/antenna-pattern-xlsx.service';
import { AntennaPatternModelService } from '../../../services/antenna-pattern/antenna-pattern-model.service';
import { AntennaService, AntennaRawDataResponseDto } from '../../../services/antenna.service';
import { PatternSheet } from '../../../services/antenna-pattern/antenna-pattern.types';

@Component({
  selector: 'app-antenna-pattern-modal',
  templateUrl: './antenna-pattern-modal.component.html',
  styleUrls: ['./antenna-pattern-modal.component.scss'],
})
export class AntennaPatternModalComponent implements AfterViewInit, OnDestroy {
  @Input() antenna!: AntennaRow; // 由天線管理 modal 傳進來
  @Input() zIndexBase = 3010;
  @Output() close = new EventEmitter<void>();

  @ViewChild('patternCanvas') patternCanvasRef!: ElementRef<HTMLCanvasElement>;

  txGainDb = 0; // 先做輸入框，後續可接你的模型參數

  private viewer: AntennaPatternViewer | null = null;
  private ro: ResizeObserver | null = null;
  private resizeHandler: (() => void) | null = null;

  errorMessage: string | null = null;

  constructor(
    private xlsxService: AntennaPatternXlsxService,
    private modelService: AntennaPatternModelService,
    private antennaService: AntennaService
  ) {}

  // ===== [AP][WP-A2][Adapter] rawData -> PatternSheet =====
  private buildPatternSheetFromApi(resp: AntennaRawDataResponseDto): PatternSheet {
    const port0 = resp.rawData?.[0];
    if (!port0 || !Array.isArray(port0.pattern) || port0.pattern.length === 0) {
      throw new Error('Antenna rawData is empty');
    }

    // pattern row format: [deg, h, v, ...]
    const deg = port0.pattern.map(r => Number(r[0]));
    const h = port0.pattern.map(r => Number(r[1]));
    const v = port0.pattern.map(r => Number(r[2]));

    return {
      meta: {
        name: resp.antennaName ?? this.antenna?.name,
        frequencyMHz: Number(port0.frequency),
        mainGainDbi: Number(port0.portGain),
        sheetName: port0.portName || `port1_${port0.frequency}`,
      },
      horizontal: { phiDeg: deg, gainDb: h },
      vertical: { thetaDeg: deg, gainDb: v },
    };
  }

  ngAfterViewInit(): void {
    const canvas = this.patternCanvasRef?.nativeElement;
    if (!canvas) {
      console.warn('[AntennaPatternModal] canvas not found');
      return;
    }

    // Create viewer
    this.viewer = new AntennaPatternViewer();

    // Delay initialization by one frame to ensure canvas has correct dimensions
    requestAnimationFrame(async () => {
      if (!this.viewer) return;

      try {
        // Initialize viewer
        this.viewer.init(canvas);

        // ===== [AP][WP-A2] Prefer API rawData, fallback to XLSX template =====
        const antennaId =
          (this.antenna as any)?.id ??
          (this.antenna as any)?.antennaID ??
          (this.antenna as any)?.antennaId;

        if (!antennaId) {
          throw new Error('antennaId not found on input antenna');
        }

        let sheet: PatternSheet | null = null;

        try {
          console.log('[AntennaPatternModal][WP-A2] Fetch rawData via API', { antennaId });
          const resp = await firstValueFrom(this.antennaService.getAntennaRawData(Number(antennaId)));
          console.log('[AntennaPatternModal][WP-A2] rawData loaded', {
            antennaName: resp.antennaName,
            rawPorts: resp.rawData?.length ?? 0,
            sampleSheet: resp.rawData?.[0]?.portName,
            sampleFreq: resp.rawData?.[0]?.frequency
          });
          sheet = this.buildPatternSheetFromApi(resp);
        } catch (apiErr) {
          console.warn('[AntennaPatternModal][WP-A2] API rawData failed, fallback to template', apiErr);
          sheet = await this.xlsxService.loadDefaultTemplate();
        }

        console.log('[AntennaPatternModal][WP-A2] PatternSheet ready', {
          meta: sheet.meta,
          horizontalPoints: sheet.horizontal.phiDeg.length,
          verticalPoints: sheet.vertical.thetaDeg.length
        });

        // Inject debug data for angle checklist
        this.viewer.setDebugData(sheet, this.modelService);

        // Expose viewer globally for debug access
        (window as any).__apViewer = this.viewer;
        console.log('[AntennaPatternModal] Debug: window.__apViewer exposed. Call __apViewer.dbgAngleChecklist() to analyze angles');

        // Create model from sheet
        const model = this.modelService.createModel(sheet);
        console.log('[AntennaPatternModal] Model created', {
          stats: model.stats
        });

        // Phase 5A-1: Set pattern sheet for reference rings
        this.viewer.setPatternSheet(sheet, model.stats);

        // Build pattern from model's gain function
        this.viewer.buildFromGainFn(
          (thetaDeg, phiDeg) => model.getGain(thetaDeg, phiDeg),
          model.stats
        );

        // Phase 5A-1: Draw reference rings from Excel data
        this.viewer.drawReferenceRingsFromSheet();

        // Initial resize after building pattern
        requestAnimationFrame(() => {
          if (this.viewer) {
            this.viewer.resize();
          }
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.errorMessage = `Failed to load antenna pattern: ${message}`;
        console.error('[AntennaPatternModal] Failed to load pattern', error);
        
        // Fallback: build fake pattern to ensure 3D visualization always appears
        this.viewer?.buildFakePattern();
        
        // Initial resize after building fallback pattern
        requestAnimationFrame(() => {
          if (this.viewer) {
            this.viewer.resize();
          }
        });
      }
    });

    // Setup ResizeObserver on canvas parent (ph-box)
    const container = canvas.parentElement;
    if (container) {
      this.ro = new ResizeObserver(() => {
        if (this.viewer) {
          this.viewer.resize();
        }
      });
      this.ro.observe(container);
    }

    // Backup: window resize listener
    this.resizeHandler = () => {
      if (this.viewer) {
        this.viewer.resize();
      }
    };
    window.addEventListener('resize', this.resizeHandler);

    console.log('[AntennaPatternModal] viewer setup complete', {
      antenna: this.antenna?.name,
      hasViewer: !!this.viewer,
      hasResizeObserver: !!this.ro
    });
  }

  ngOnDestroy(): void {
    try {
      // Clear global debug reference
      if ((window as any).__apViewer === this.viewer) {
        delete (window as any).__apViewer;
      }

      // Disconnect ResizeObserver
      if (this.ro) {
        this.ro.disconnect();
        this.ro = null;
      }

      // Remove window resize listener
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
        this.resizeHandler = null;
      }

      // Dispose viewer
      if (this.viewer) {
        this.viewer.dispose();
        this.viewer = null;
      }
    } catch (err) {
      console.error('[AntennaPatternModal] cleanup error', err);
    }
  }

  onBackdropClick(): void {
    // 依你目前需求：遮罩不可點穿；是否允許點遮罩關閉，你可自行決定
    console.log('[AntennaPatternModal] backdrop clicked (blocked)');
  }

  onClose(): void {
    console.log('[AntennaPatternModal] close clicked, antenna=', this.antenna?.name);
    this.close.emit();
  }
}
