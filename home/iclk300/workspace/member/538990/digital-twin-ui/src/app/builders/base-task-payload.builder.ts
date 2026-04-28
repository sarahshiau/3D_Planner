/**
 * Base Task Payload Builder
 *
 * Constructs flat legacy payload from input sources.
 */

import {
  BaseTaskPayloadBuilderInput,
  BaseTaskPayload,
  BuilderEvaluationFunc,
} from '../models/task-payload.model';
import type { IntelligentPanelFieldRow } from '../models/field-domain.model';
import {
  TASK_PAYLOAD_MOCK_DEFAULTS,
  STORETASK_SUCCESS_TEMPLATE,
} from '../mocks/task-payload.mock';
import { RisSerializerBuilder } from './ris-serializer.builder';
import { ObstacleSerializerBuilder, type BuildingObstacleSkipRecord } from './obstacle-serializer.builder';

export class BaseTaskPayloadBuilder {
  private readonly DEBUG_PAYLOAD = false;
  private readonly risSerializer = new RisSerializerBuilder();
  private readonly obstacleSerializer = new ObstacleSerializerBuilder();

  /** Building rows/meshes skipped during obstacle serialization (latest `build()`). Used for SimFinal diagnostics. */
  lastObstacleBuildingSkips: BuildingObstacleSkipRecord[] = [];

  private safeRatio(value: unknown, fallback = 0.95): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private cloneEvaluationFunc(defaults: any): any {
    return JSON.parse(JSON.stringify(defaults?.evaluationFunc ?? {}));
  }

  private buildEvaluationFuncFromPlanning(input: BaseTaskPayloadBuilderInput, defaults: any): any {
    const planning: any = input.planning ?? {};
    const mode = planning.selectedPlanningMode ?? 'current';
    const ef = this.cloneEvaluationFunc(defaults);

    const whole = planning.wholeObjectives ?? {};
    const ue = planning.ueObjectives ?? {};
    const area = planning.areaObjectives ?? {};

    const fieldSource = mode === 'area' ? area : whole;
    const ueSource = ue;

    if (!ef.field) ef.field = {};
    if (!ef.ue) ef.ue = {};

    if (!ef.field.coverage) ef.field.coverage = {};
    if (!ef.field.sinr) ef.field.sinr = {};
    if (!ef.field.rsrp) ef.field.rsrp = {};
    if (!ef.field.throughput) ef.field.throughput = {};

    if (!ef.ue.coverage) ef.ue.coverage = {};
    if (!ef.ue.sinr) ef.ue.sinr = {};
    if (!ef.ue.throughput) ef.ue.throughput = {};

    const applyField = mode === 'whole' || mode === 'area';
    const applyUe = mode === 'ue';

    if (applyField) {
      ef.field.coverage.activate = !!fieldSource?.coverage?.enabled;
      ef.field.coverage.ratio = this.safeRatio(fieldSource?.coverage?.ratio);

      ef.field.sinr.activate = !!fieldSource?.sinr?.enabled;
      ef.field.sinr.ratio = this.safeRatio(fieldSource?.sinr?.ratio);

      ef.field.rsrp.activate = !!fieldSource?.rsrp?.enabled;
      ef.field.rsrp.ratio = this.safeRatio(fieldSource?.rsrp?.ratio);

      ef.field.throughput.activate = !!fieldSource?.throughput?.enabled;
      ef.field.throughput.ratio = this.safeRatio(fieldSource?.throughput?.ratio);
    }

    if (applyUe) {
      ef.ue.coverage.activate = !!ueSource?.coverage?.enabled;
      ef.ue.coverage.ratio = this.safeRatio(ueSource?.coverage?.ratio);

      ef.ue.sinr.activate = !!ueSource?.sinr?.enabled;
      ef.ue.sinr.ratio = this.safeRatio(ueSource?.sinr?.ratio);

      ef.ue.throughput.activate = !!ueSource?.throughput?.enabled;
      ef.ue.throughput.ratio = this.safeRatio(ueSource?.throughput?.ratio);
    }

    return ef;
  }

  private buildLegacyPlanningFlags(input: BaseTaskPayloadBuilderInput): Record<string, any> {
    const planning: any = input.planning ?? {};
    const mode = planning.selectedPlanningMode ?? 'current';

    const whole = planning.wholeObjectives ?? {};
    const ue = planning.ueObjectives ?? {};
    const area = planning.areaObjectives ?? {};

    const fieldSource = mode === 'area' ? area : whole;
    const applyField = mode === 'whole' || mode === 'area';
    const applyUe = mode === 'ue';

    return {
      isCoverage: applyField ? !!fieldSource?.coverage?.enabled : false,
      coverageRatio: applyField ? this.safeRatio(fieldSource?.coverage?.ratio) : 0,

      isAverageSinr: applyField ? !!fieldSource?.sinr?.enabled : false,
      sinrRatio: applyField ? this.safeRatio(fieldSource?.sinr?.ratio) : 0,

      isAverageRsrp: applyField ? !!fieldSource?.rsrp?.enabled : false,
      rsrpRatio: applyField ? this.safeRatio(fieldSource?.rsrp?.ratio) : 0,
      rsrpThreshold: applyField
        ? Number(fieldSource?.rsrp?.threshold ?? -90)
        : Number((input.planning as any)?.rsrpThreshold ?? (input.mockDefaults as any)?.rsrpThreshold ?? -90),

      isAvgThroughput: applyField ? !!fieldSource?.throughput?.enabled : false,
      throughputRatio: applyField ? this.safeRatio(fieldSource?.throughput?.ratio) : 0,

      isUeCoverage: applyUe ? !!ue?.coverage?.enabled : false,
      ueCoverageRatio: applyUe ? this.safeRatio(ue?.coverage?.ratio) : 0,

      isUeAvgSinr: applyUe ? !!ue?.sinr?.enabled : false,
      ueAvgSinrRatio: applyUe ? this.safeRatio(ue?.sinr?.ratio) : 0,

      isUeAvgThroughput: applyUe ? !!ue?.throughput?.enabled : false,
      ueAvgThroughputRatio: applyUe ? this.safeRatio(ue?.throughput?.ratio) : 0,
    };
  }

  /**
   * Build complete task payload from input
   */
  build(input: BaseTaskPayloadBuilderInput): BaseTaskPayload {
    this.lastObstacleBuildingSkips = [];
    const templateBase = {
      ...STORETASK_SUCCESS_TEMPLATE,
      ...(TASK_PAYLOAD_MOCK_DEFAULTS || {}),
      ...(input.mockDefaults || {}),
    } as any;

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildTaskMeta'); }
    const taskMeta = this.buildTaskMeta(input, templateBase);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildTaskMeta'); }

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildMapSection'); }
    const mapMeta = this.buildMapSection(input, templateBase);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildMapSection'); }

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildObstacleSection'); }
    const obstacleMeta = this.buildObstacleSection(input, templateBase);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildObstacleSection'); }

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildRisSection'); }
    const risMeta = this.buildRisSection(input, templateBase);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildRisSection'); }

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildEvaluationFuncFromPlanning'); }
    const dynamicEvaluationFunc = this.buildEvaluationFuncFromPlanning(input, templateBase);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildEvaluationFuncFromPlanning'); }

    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildLegacyPlanningFlags'); }
    const legacyPlanningFlags = this.buildLegacyPlanningFlags(input);
    if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildLegacyPlanningFlags'); }

  if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][ENTER] buildUeSection'); }
  const ueMeta = this.buildUeSection(input, templateBase);
  if (this.DEBUG_PAYLOAD) { console.log('[BUILDER_SECTION][DONE] buildUeSection'); }

    const payload = this.cloneTemplate(templateBase) as BaseTaskPayload;

    payload.taskid = this.asString(taskMeta.taskid, this.asString(STORETASK_SUCCESS_TEMPLATE.taskid, ''));
    payload.sessionid = this.asString(taskMeta.sessionid, this.asString(STORETASK_SUCCESS_TEMPLATE.sessionid, ''));
    payload.taskName = this.asString(taskMeta.taskName, this.asString(STORETASK_SUCCESS_TEMPLATE.taskName, ''));
    payload.createTime = this.asString(taskMeta.createTime, this.formatCreateTime(new Date()));
    payload.width = this.asNumber(mapMeta.width, 0);
    payload.height = this.asNumber(mapMeta.height, 0);
    payload.altitude = this.asNumber(mapMeta.altitude, 0);
    payload.obstacleInfo = this.asString(
      (obstacleMeta as any).obstacleInfo,
      this.asString((payload as any).obstacleInfo, '')
    );
    payload.risList = {
      defaultRis: this.asArray((risMeta as any).ris, this.asArray((payload as any).risList?.defaultRis, [])),
      candidateRis: [],
    };
    (payload as any).evaluationFunc = dynamicEvaluationFunc;
    Object.assign(payload as any, legacyPlanningFlags);
    (payload as any).goalMode =
      (input.planning as any)?.selectedPlanningMode === 'current' ? 'simulation' : 'planning';
    (payload as any).planningMode =
      (input.planning as any)?.selectedPlanningMode ?? 'current';

  // Apply UE section to payload
  (payload as any).ueCoordinate = (ueMeta as any).ueCoordinate ?? '';
  (payload as any).ueRxGain = (ueMeta as any).ueRxGain ?? '[]';
  (payload as any).useUeCoordinate = (ueMeta as any).useUeCoordinate ?? 0;

    const taskMetaCompat: any = {};
    Object.defineProperty(taskMetaCompat, 'taskid', {
      get: () => payload.taskid,
      set: (v: string) => { payload.taskid = this.asString(v, ''); },
      enumerable: true,
    });
    Object.defineProperty(taskMetaCompat, 'sessionid', {
      get: () => payload.sessionid,
      set: (v: string) => { payload.sessionid = this.asString(v, ''); },
      enumerable: true,
    });
    Object.defineProperty(taskMetaCompat, 'task_id', {
      get: () => payload.taskid,
      set: (v: string) => { payload.taskid = this.asString(v, ''); },
      enumerable: true,
    });
    taskMetaCompat.taskName = payload.taskName;
    taskMetaCompat.createTime = payload.createTime;
    taskMetaCompat.isSimulation = payload.isSimulation;

    const mapCompat: any = {};
    Object.defineProperty(mapCompat, 'width', { get: () => payload.width, enumerable: true });
    Object.defineProperty(mapCompat, 'height', { get: () => payload.height, enumerable: true });
    Object.defineProperty(mapCompat, 'altitude', { get: () => payload.altitude, enumerable: true });

    Object.defineProperty(payload, 'task_meta', {
      value: taskMetaCompat,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(payload, 'map', {
      value: mapCompat,
      enumerable: false,
      configurable: true,
    });

    if (this.DEBUG_PAYLOAD) {
      console.log('[BaseTaskPayloadBuilder][planning]', {
        selectedPlanningMode: (input.planning as any)?.selectedPlanningMode,
        planning: input.planning,
        dynamicEvaluationFunc,
        legacyPlanningFlags,
      });
    }

    return payload;
  }

  /**
   * Build task metadata section
   */
  private buildTaskMeta(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    return {
      taskid: this.asString(input.taskMeta.taskId ?? input.taskMeta.task_id ?? defaults.taskid, ''),
      sessionid: this.asString(input.taskMeta.sessionId ?? defaults.sessionid, ''),
      createTime: this.formatCreateTime(input.taskMeta.now || new Date()),
      taskName: this.asString(input.taskMeta.task_name || input.basicField.projectName || defaults.taskName, 'Untitled Task'),
      isSimulation: true,
    };
  }

  /**
   * Build map section
   */
  private buildMapSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    const gridResolution = this.gridToResolution(input.basicField.heatmapGrid);
    const resolution = !isNaN(gridResolution) ? gridResolution : this.asNumber(defaults.resolution, 1);
    const zValueArray =
      input.basicField.cutHeights && input.basicField.cutHeights.length > 0
        ? input.basicField.cutHeights
        : [];

    const zValue = JSON.stringify(zValueArray);

    return {
      width: this.asNumber(input.basicField.length, 0),
      height: this.asNumber(input.basicField.width, 0),
      altitude: this.asNumber(input.basicField.height, 0),
      mapName: this.asString(defaults.mapName, this.asString(STORETASK_SUCCESS_TEMPLATE.mapName, 'test_999')),
      mapImage: this.asString(defaults.mapImage || defaults.mapImageBase64, this.asString(STORETASK_SUCCESS_TEMPLATE.mapImage, '')),
      mapProtocol: this.asString(input.basicField.networkType || defaults.mapProtocol, '5G'),
      lteBand: this.asString(input.basicField.band || defaults.lteBand, 'n79'),
      geographicalNorth: this.asNumber(defaults.geographicalNorth, 0),
      resolution,
      zValue,
    };
  }

  /**
   * Build base station section
   */
  private buildBsSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    const existingBs = input.basicField.existingBs.map(row => ({
      id: row.id,
      x: row.x,
      y: row.y,
      z: row.z,
      rxGain: row.rxGain || 0,
    }));
    const candidateBs = input.basicField.candidateBs.map(row => ({
      id: row.id,
      x: row.x,
      y: row.y,
      z: row.z
    }));

    const safeDefaultBs = existingBs.length > 0
      ? existingBs
      : [{ id: 'bs_1', x: 0, y: 0, z: 10, rxGain: 0 }];

    const defaultBsAnt = safeDefaultBs
      .map((bs: any) => `[${this.asNumber(bs.x, 0)},${this.asNumber(bs.y, 0)},${this.asNumber(bs.z, 10)}]`)
      .join('|');

    const fallbackBsList = this.asArray(defaults.bsList?.defaultBs, this.asArray(STORETASK_SUCCESS_TEMPLATE.bsList?.defaultBs, []));
    return {
      defaultBs: this.asString(defaults.defaultBs, ''),
      candidateBs: this.asString(defaults.candidateBs, ''),
      defaultBsAnt: defaultBsAnt || this.asString(defaults.defaultBsAnt, '[0,0,10]|'),
      candidateBsAnt: this.asString(defaults.candidateBsAnt, ''),
      // ===== [SIM_API_PHASE3][TEMP_BACKEND_SHAPE_MOCK] =====
      // TODO: replace with real existingBs -> bsList mapping after API flow is stable.
      bsList: {
        defaultBs: fallbackBsList,
        candidateBs,
      },
      bsSetting: defaults.bsSetting || STORETASK_SUCCESS_TEMPLATE.bsSetting,
      addFixedBsNumber: this.asNumber(defaults.addFixedBsNumber, 0),
      availableNewBsNumber: this.asNumber(defaults.availableNewBsNumber, 4),
    };
  }

  /**
   * Build RIS section
   */
  private buildRisSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    const bf = input.basicField as any;
    const fromRisList = Array.isArray(bf.risList) ? bf.risList : [];
    const panelRows: IntelligentPanelFieldRow[] =
      fromRisList.length > 0
        ? (fromRisList as any[]).map((item: any, idx: number) => {
            const pos = Array.isArray(item.position) ? item.position : [];
            const x = Number(pos[0] ?? item.x);
            const y = Number(pos[1] ?? item.y);
            const z = Number(pos[2] ?? item.z);
            return {
              id: `ris_collect_${idx}`,
              seq: idx + 1,
              category: 'intelligentPanel',
              risID: item.risID ?? item.risId ?? null,
              risId: item.risID ?? item.risId ?? null,
              profileID: item.profileID ?? item.profileId ?? null,
              profileId: item.profileID ?? item.profileId ?? null,
              x: Number.isFinite(x) ? x : 0,
              y: Number.isFinite(y) ? y : 0,
              z: Number.isFinite(z) ? z : 0,
              position: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, z: Number.isFinite(z) ? z : 0 },
              insHorizontal: item.insHorizontal ?? 0,
              insVertical: item.insVertical ?? 0,
              installHorizontalAngle: item.insHorizontal ?? 0,
              installVerticalAngle: item.insVertical ?? 0,
            } as IntelligentPanelFieldRow;
          })
        : (bf.intelligentPanels ?? []);
    const ris = this.risSerializer.serialize(panelRows);
    const candidateRis: any[] = [];

    return {
      defaultRis: null,
      candidateRis: null,
      candidateRisList: candidateRis,
      ris,
      risList: {
        defaultRis: ris,
        candidateRis,
      },
      availableNewRisNumber: this.asNumber(defaults.availableNewRisNumber, 0),
    };
  }

  /**
   * Build UE section
   */
  private buildUeSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    // Single source of truth: basicField.ueList (already normalised by EditScene before passing in)
    const rawList: any[] = Array.isArray(input.basicField.ueList) ? input.basicField.ueList : [];

    // Sort ascending by id string so ordering is deterministic
    const ueSource = [...rawList].sort((a, b) => {
      const ai = String(a?.id ?? '');
      const bi = String(b?.id ?? '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });

    const ueCoordinates: Array<[number, number, number]> = ueSource.map(ue => [
      Number(ue.x ?? 0),
      Number(ue.y ?? 0),
      Number(ue.z ?? 0),
    ]);
    const ueCoordinate = ueSource.length > 0 ? this.encodeVector3PipeList(ueCoordinates) : '';
    const rxGainValues: number[] = ueSource.map(ue => {
      const g = Number(ue.rxGain);
      return Number.isFinite(g) ? g : 0;
    });
    const ueRxGain = ueSource.length > 0 ? this.encodeNumberArray(rxGainValues) : '[]';
    // useUeCoordinate is driven entirely by whether there are UE rows in the store
    const useUeCoordinate = ueSource.length > 0 ? 1 : 0;

    if (this.DEBUG_PAYLOAD) {
      console.log('[UE_PAYLOAD][BUILD]', {
        ueCount: ueSource.length,
        ueList: ueSource.map(ue => ({ id: ue.id, x: ue.x, y: ue.y, z: ue.z, rxGain: ue.rxGain })),
        ueCoordinate,
        ueRxGain,
        useUeCoordinate,
      });
    }

    return {
      ueCoordinate,
      ueRxGain,
      useUeCoordinate,
    };
  }

  /**
   * Build obstacle section
   */
  private buildObstacleSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    const sourceRows = input.basicField.obstacles ?? [];
    if (this.DEBUG_PAYLOAD) { console.log('[ObstacleSection][STEP1] sourceRows count', sourceRows.length); }
    if (this.DEBUG_PAYLOAD) {
      console.log('[ObstacleFlow][store->builder][rows]', {
        count: sourceRows.length,
        top3: sourceRows.slice(0, 3).map((row: any) => ({
          id: row?.id,
          position: row?.position ?? null,
          startHeight: row?.startHeight,
          width: row?.width,
          length: row?.length,
          height: row?.height,
          angle: row?.angle,
          material: row?.material,
          shape: row?.shape,
          color: row?.color,
        })),
      });
    }

    const obstacleInfo = this.obstacleSerializer.serializeObstacleInfo({
      basicRows: input.basicField.obstacles,
      // Add map-generated / OSM buildings into the same legacy obstacleInfo tuple flow.
      // Missing critical geometry fields are handled by serializer as warn + skip.
      buildingRows: (input.basicField as any).buildingRows ?? [],
      buildingMeshes: (input.basicField as any).buildingMeshes ?? [],
    });
    if (this.DEBUG_PAYLOAD) { console.log('[ObstacleSection][STEP3] serializeObstacleInfo done, length=', obstacleInfo?.length); }
    this.lastObstacleBuildingSkips = [...this.obstacleSerializer.getLastBuildingSkips()];

    if (this.DEBUG_PAYLOAD) {
      console.log('[ObstacleFlow][builder->serializer][result]', {
        obstacleRows: input.basicField.obstacles?.length ?? 0,
        buildingRows: ((input.basicField as any).buildingRows ?? []).length,
        buildingMeshes: ((input.basicField as any).buildingMeshes ?? []).length,
        serializedTop3: String(obstacleInfo ?? '').split('|').slice(0, 3),
        obstacleInfoLength: obstacleInfo.length,
      });
    }
    return {
      obstacleInfo: obstacleInfo || this.asString(defaults.obstacleInfo, ''),
    };
  }

  /**
   * Build radio planning section
   */
  private buildRadioPlanningSection(input: BaseTaskPayloadBuilderInput, defaults: any): Partial<BaseTaskPayload> {
    const dynamicEvaluationFunc = this.buildEvaluationFuncFromPlanning(input, defaults);
    const legacyPlanningFlags = this.buildLegacyPlanningFlags(input);
    const frequencyMHzList = this.asArray(defaults.frequencyMHzList, [4850, 4850]);
    const bandwidthMHzList = this.asArray(defaults.bandwidthMHzList, [100, 100]);
    const scsKHzList = this.asArray(defaults.scsKHzList, [30, 30]);
    const txPowerDbmList = this.asArray(defaults.txPowerDbmList, [24, 24]);
    const bsNoiseFigureList = this.asArray(defaults.bsNoiseFigureList, [0, 0]);
    const ulMcsTableList = this.asArray(defaults.ulMcsTableList, ['64QAM-table', '64QAM-table']);
    const dlMcsTableList = this.asArray(defaults.dlMcsTableList, ['256QAM-table', '256QAM-table']);
    const ulMimoLayerList = this.asArray(defaults.ulMimoLayerList, [1, 1]);
    const dlMimoLayerList = this.asArray(defaults.dlMimoLayerList, [1, 1]);

    if (defaults.pathLossModelId == null) {
      console.warn('[BaseTaskPayloadBuilder][pathLossModelId][fallback]', {
        fallbackPathLossModelId: 12,
        reason: 'defaults.pathLossModelId is missing',
      });
    }

    return {
      duplex: this.asString(defaults.duplex, 'tdd'),
      frequency: this.asString(defaults.frequency, this.asString(input.radio.frequency_ghz, '4850')),
      frequencyList: this.encodeNumberArray(frequencyMHzList),
      bandwidth: this.asString(defaults.bandwidth, this.asString(input.radio.bandwidth_mhz, '100')),
      bandwidthList: this.encodeNumberArray(bandwidthMHzList),
      scs: this.asString(defaults.scs, this.asString(scsKHzList[0], '30')),
      txPower: this.asString(defaults.txPower, this.asString(input.radio.tx_power_dbm, '24')),
      ulMcsTable: JSON.stringify(ulMcsTableList),
      dlMcsTable: JSON.stringify(dlMcsTableList),
      ulMimoLayer: this.encodeNumberArray(ulMimoLayerList),
      dlMimoLayer: this.encodeNumberArray(dlMimoLayerList),
      bsNoiseFigure: this.encodeNumberArray(bsNoiseFigureList),
      tddFrameRatio: this.asNumber(defaults.tddFrameRatio, 70),
      beamId: this.asString(defaults.beamId, '[0,0,0,0]'),
      beamMinId: this.asNumber(defaults.beamMinId, 0),
      beamMaxId: this.asNumber(defaults.beamMaxId, 0),
      evaluationFunc: dynamicEvaluationFunc,
      ...legacyPlanningFlags,
      field: defaults.field || STORETASK_SUCCESS_TEMPLATE.field,
      pathLossModelId: this.asNumber(defaults.pathLossModelId, 12),
      subfieldList: this.asArray(defaults.subfieldList, this.asArray(STORETASK_SUCCESS_TEMPLATE.subfieldList, [])),
      optInfo: this.asRecord(defaults.optInfo, {}),
      mimoNumber: this.asString(defaults.mimoNumber, '[]'),
      guardInterval: this.asString(defaults.guardInterval, ''),
      wifiBand: this.asString(defaults.wifiBand, ''),
      wifiMimo: this.asString(defaults.wifiMimo, ''),
      wifiProtocol: this.asString(defaults.wifiProtocol, ''),
      powerMinRange: this.asNumber(defaults.powerMinRange, 10),
      powerMaxRange: this.asNumber(defaults.powerMaxRange, 24),
      rsrpThreshold: this.asNumber(defaults.rsrpThreshold, -95),
      sinrThreshold: this.asNumber(defaults.sinrThreshold, 15),
      rssiThreshold: this.asNumber(defaults.rssiThreshold, -70),
      snrThreshold: this.asNumber(defaults.snrThreshold, 20),
      objectiveIndex: this.asNumber(defaults.objectiveIndex, 1),
      coverageRatio: this.asNumber(defaults.coverageRatio, 0.95),
      sinrRatio: this.asNumber(defaults.sinrRatio, 5),
      throughputRatio: this.asNumber(defaults.throughputRatio, 5),
      maxConnectionNum: this.asNumber(defaults.maxConnectionNum, 75),
      isCoverage: this.asBoolean(defaults.isCoverage, false),
      isAverageSinr: this.asBoolean(defaults.isAverageSinr, false),
      isAvgThroughput: this.asBoolean(defaults.isAvgThroughput, false),
      isUeCoverage: this.asBoolean(defaults.isUeCoverage, false),
      isUeAvgSinr: this.asBoolean(defaults.isUeAvgSinr, false),
      isUeAvgThroughput: this.asBoolean(defaults.isUeAvgThroughput, false),
      isUeTpByDistance: this.asBoolean(defaults.isUeTpByDistance, false),
      isUeTpByRsrp: this.asBoolean(defaults.isUeTpByRsrp, false),
      ueCoverageRatio: this.asNumber(defaults.ueCoverageRatio, 0.95),
      ueAvgSinrRatio: this.asNumber(defaults.ueAvgSinrRatio, 16),
      ueAvgThroughputRatio: this.asNumber(defaults.ueAvgThroughputRatio, 100),
      ueTpByDistanceRatio: this.asNumber(defaults.ueTpByDistanceRatio, 100),
      ueTpByRsrpRatio: this.asNumber(defaults.ueTpByRsrpRatio, 100),
      ulFrequency: this.asString(defaults.ulFrequency, String(this.asNumber(frequencyMHzList[0], 4850))),
      dlFrequency: this.asString(defaults.dlFrequency, String(this.asNumber(frequencyMHzList[1], 4850))),
      ulBandwidth: this.asString(defaults.ulBandwidth, String(this.asNumber(bandwidthMHzList[0], 100))),
      dlBandwidth: this.asString(defaults.dlBandwidth, String(this.asNumber(bandwidthMHzList[1], 100))),
      ulScs: this.asString(defaults.ulScs, String(this.asNumber(scsKHzList[0], 30))),
      dlScs: this.asString(defaults.dlScs, String(this.asNumber(scsKHzList[1], 30))),
      mctsC: this.asNumber(defaults.mctsC, 1.2),
      mctsMimo: this.asNumber(defaults.mctsMimo, 2),
      mctsTemperature: this.asNumber(defaults.mctsTemperature, 300),
      mctsTestTime: this.asNumber(defaults.mctsTestTime, 300),
      mctsTime: this.asNumber(defaults.mctsTime, 30),
      mctsTotalTime: this.asNumber(defaults.mctsTotalTime, 500),
      scalingFactor: this.asNumber(defaults.scalingFactor, 1),
    };
  }

  /**
   * Encode number array to JSON array string format
   * Format: "[1,2,3]"
   */
  private encodeNumberArray(values: number[]): string {
    return JSON.stringify(values);
  }

  /**
   * Encode string array to comma-separated string
   */
  private encodeStringArray(values: string[]): string {
    return values.join(',');
  }

  /**
   * Encode Vector3 points to pipe-delimited string
   * Format: "[x1,y1,z1]|[x2,y2,z2]|..."
   */
  private encodeVector3PipeList(points: Array<[number, number, number]>): string {
    return points.map(([x, y, z]) => `[${x},${y},${z}]`).join('|');
  }

  /**
   * Encode obstacle record (placeholder for future implementation)
   */
  private encodeObstacleRecord(obstacles: any[]): string {
    return '';
  }

  /**
   * Encode obstacle pipe format
   * Format: "[x,y,startHeight,length,width,height,angle,materialId,0,color]|..."
   * Note: current implementation reads geometry fields from obstacle rows,
   * but still uses fixed materialId/shape/color placeholders.
   */
  private encodeObstaclePipe(obstacles: any[]): string {
    console.log('[Phase0][ObstacleSerialize][TupleSource]', {
      obstacleRows: obstacles?.length ?? 0,
      tupleOrder: ['x', 'y', 'startHeight', 'length', 'width', 'height', 'angle', 'materialId', 'shape', 'color'],
    });
    return obstacles.map(row => {
      const record = [
        row.x,
        row.y,
        row.startHeight,
        row.length,
        row.width,
        row.height,
        row.angle,
        2201,
        0,
        '"#73805c"'
      ];
      return `[${record.join(',')}]`;
    }).join('|');
  }

  /**
   * Convert grid string to resolution number
   * Supports: '1x1' => 1, '0.5x0.5' => 0.5, others => NaN
   */
  private gridToResolution(grid?: string): number {
    if (!grid) return NaN;

    const match = grid.match(/([\d.]+)x([\d.]+)/);
    if (!match) return NaN;

    const value = parseFloat(match[1]);
    return isNaN(value) ? NaN : value;
  }

  /**
   * Format create time to YYYY-MM-DD HH:mm:ss
   */
  private formatCreateTime(now: Date | number): string {
    const date = typeof now === 'number' ? new Date(now) : now;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Convert UL/DL ratio string to frame ratio number
   */
  private ulDlRatioToFrameRatio(value?: string): number {
    if (!value) return 0.5;

    const match = value.match(/(\d+):(\d+)/);
    if (!match) return 0.5;

    const ul = parseInt(match[1], 10);
    const dl = parseInt(match[2], 10);
    return ul / (ul + dl);
  }

  private asNumber(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private asString(value: unknown, fallback: string): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  private asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private asArray<T = any>(value: unknown, fallback: T[]): T[] {
    return Array.isArray(value) ? value as T[] : fallback;
  }

  private asArrayOrNull<T = any>(value: unknown, fallback: T[]): T[] | null {
    if (value === null) return null;
    return this.asArray(value, fallback);
  }

  private asRecord(value: unknown, fallback: Record<string, any>): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return fallback;
  }

  private cloneTemplate<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private normalizeEvaluationFunc(value: BuilderEvaluationFunc | undefined, fallbackSubfield: any[]): BuilderEvaluationFunc {
    const source = (value || {}) as any;
    return {
      subfield: this.asArray(source.subfield, fallbackSubfield),
      field: {
        coverage: {
          activate: this.asBoolean(source.field?.coverage?.activate, false),
          ratio: this.asNumber(source.field?.coverage?.ratio, 0.95),
        },
        rsrp: {
          activate: this.asBoolean(source.field?.rsrp?.activate, false),
          ratio: this.asArray(source.field?.rsrp?.ratio, []),
        },
        sinr: {
          activate: this.asBoolean(source.field?.sinr?.activate, false),
          ratio: this.asArray(source.field?.sinr?.ratio, []),
        },
        throughput: {
          activate: this.asBoolean(source.field?.throughput?.activate, false),
          ratio: this.asArray(source.field?.throughput?.ratio, []),
        },
        subfield: this.asArray(source.field?.subfield, []),
      },
      ue: {
        coverage: {
          activate: this.asBoolean(source.ue?.coverage?.activate, false),
          ratio: this.asNumber(source.ue?.coverage?.ratio, 0.95),
        },
        sinr: {
          activate: this.asBoolean(source.ue?.sinr?.activate, false),
          ratio: this.asArray(source.ue?.sinr?.ratio, []),
        },
        throughput: {
          activate: this.asBoolean(source.ue?.throughput?.activate, false),
          ratio: this.asArray(source.ue?.throughput?.ratio, []),
        },
        throughputByDistance: {
          activate: this.asBoolean(source.ue?.throughputByDistance?.activate, false),
          ratio: this.asArray(source.ue?.throughputByDistance?.ratio, []),
        },
        throughputByRsrp: {
          activate: this.asBoolean(source.ue?.throughputByRsrp?.activate, false),
          ratio: this.asArray(source.ue?.throughputByRsrp?.ratio, []),
        },
      },
    };
  }
}
