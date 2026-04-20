import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms'; 
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

// Components
import { TopBarComponent } from './components/top-bar/top-bar.component';
import { ConfirmDialogComponent, } from './components/confirm-dialog/confirm-dialog.component';
import { TopbarPanelComponent } from './components/top-bar/topbar-panel/topbar-panel.component';
import { AntennaManageModalComponent } from './components/modals/antenna-manage-modal/antenna-manage-modal.component';
import { AntennaPatternModalComponent } from './components/modals/antenna-pattern-modal/antenna-pattern-modal.component';
import { AntennaAddModalComponent } from './components/modals/antenna-add-modal/antenna-add-modal.component';
import { AntennaEditModalComponent } from './components/modals/antenna-edit-modal/antenna-edit-modal.component';
import { PathlossModelManageModalComponent } from './components/modals/pathloss-model-manage-modal/pathloss-model-manage-modal.component';
import { PathlossModelAddModalComponent } from './components/modals/pathloss-model-add-modal/pathloss-model-add-modal.component';
import { PathlossModelEditModalComponent } from './components/modals/pathloss-model-edit-modal/pathloss-model-edit-modal.component';
import { MaterialManageModalComponent } from './components/modals/material-manage-modal/material-manage-modal.component';
import { MaterialAddModalComponent } from './components/modals/material-add-modal/material-add-modal.component';
import { MaterialEditModalComponent } from './components/modals/material-edit-modal/material-edit-modal.component';
import { RisManageModalComponent } from './components/modals/ris-manage-modal/ris-manage-modal.component';
import { RisConfigManageModalComponent } from './components/modals/ris-config-manage-modal/ris-config-manage-modal.component';
import { RisConfigPatternModalComponent } from './components/modals/ris-config-pattern-modal/ris-config-pattern-modal.component';
import { RisAddModalComponent } from './components/modals/ris-add-modal/ris-add-modal.component';
import { RisEditModalComponent } from './components/modals/ris-edit-modal/ris-edit-modal.component';
import { RisConfigAddModalComponent } from './components/modals/ris-config-add-modal/ris-config-add-modal.component';
import { RisConfigEditModalComponent } from './components/modals/ris-config-edit-modal/ris-config-edit-modal.component';
import { RisAngleHelpModalComponent } from './components/modals/ris-angle-help-modal/ris-angle-help-modal.component';
import { MapPickerComponent } from './components/map-picker/map-picker.component';
import { AntennaSettingsModalComponent } from './components/modals/antenna-settings-modal/antenna-settings-modal.component';

// [Step3][SettingsModal] Three new settings modals
import { ExistingBsSettingsModalComponent } from './components/modals/existing-bs-settings-modal/existing-bs-settings-modal.component';
import { IntelligentPanelSettingsModalComponent } from './components/modals/intelligent-panel-settings-modal/intelligent-panel-settings-modal.component';
import { UeSettingsModalComponent } from './components/modals/ue-settings-modal/ue-settings-modal.component';
import { ZonePathlossSettingsModalComponent } from './components/modals/zone-pathloss-settings-modal/zone-pathloss-settings-modal.component';
import { ObjectSettingsModalComponent } from './components/modals/object-settings-modal/object-settings-modal.component';

// EditScene 專用 components（你目前放在 pages/EditScene/components 下）
import { LeftSidebarComponent } from './pages/EditScene/components/left-sidebar/left-sidebar.component';
import { RightSidebarComponent } from './pages/EditScene/components/right-sidebar/right-sidebar.component';
import { BannerComponent } from './pages/EditScene/components/banner/banner.component';
import { OverallAreaPlanningDialogComponent } from './components/modals/overall-area-planning-dialog/overall-area-planning-dialog.component';
import { OverallQualityTargetDialogComponent } from 'src/app/components/modals/overall-quality-target-dialog/overall-quality-target-dialog.component';
import { OverallStrengthTargetDialogComponent } from 'src/app/components/modals/overall-strength-target-dialog/overall-strength-target-dialog.component';
import { OverallThroughputTargetDialogComponent } from 'src/app/components/modals/overall-throughput-target-dialog/overall-throughput-target-dialog.component';

// Pages
import { EditSceneComponent } from './pages/EditScene/EditScene.component';
import { osmSceneComponent } from './pages/OSMScene/osmScene.component';
import { MapTestComponent } from './pages/MapTest/map-test.component';
import { NewProjectComponent } from './pages/NewProject/new-project.component';
import { ComputeResultComponent } from './pages/ComputeResult/compute-result.component';
import { GLBmapComponent } from './pages/GLBmap/glbmap.component';

// ✅ 右側三個 panel（你切出來的 components）
import { EditFilePanelComponent } from './pages/EditScene/components/panels/edit-file-panel/edit-file-panel.component';
import { EditTaskPanelComponent } from './pages/EditScene/components/panels/edit-task-panel/edit-task-panel.component';
import { EditFieldPanelComponent } from './pages/EditScene/components/panels/edit-field-panel/edit-field-panel.component';

// i18n
import { TranslateModule } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
// 用途：引入 ngx-echarts module（支援 <div echarts [options]="...">）
import { NgxEchartsModule } from 'ngx-echarts';

@NgModule({
  declarations: [
    AppComponent,

    // Global components
    TopBarComponent,
    TopbarPanelComponent,
    ConfirmDialogComponent,
    AntennaManageModalComponent,
    AntennaPatternModalComponent,
    AntennaAddModalComponent,
    AntennaEditModalComponent,
    PathlossModelManageModalComponent,
    PathlossModelAddModalComponent,
    PathlossModelEditModalComponent,
    MaterialManageModalComponent,
    MaterialAddModalComponent,
    MaterialEditModalComponent,
    RisManageModalComponent,
    RisConfigManageModalComponent,
    RisConfigPatternModalComponent,
    RisAddModalComponent,
    RisEditModalComponent,
    RisConfigAddModalComponent,
    RisConfigEditModalComponent,
    RisAngleHelpModalComponent,
    MapPickerComponent,
    AntennaSettingsModalComponent,

    // [Step3][SettingsModal] Three new settings modals
    ExistingBsSettingsModalComponent,
    IntelligentPanelSettingsModalComponent,
    UeSettingsModalComponent,
    ZonePathlossSettingsModalComponent,
    ObjectSettingsModalComponent,

    // Pages
    EditSceneComponent,
    osmSceneComponent,
    MapTestComponent,
    NewProjectComponent,
    ComputeResultComponent,
    GLBmapComponent,
    // EditScene scoped components
    LeftSidebarComponent,
    
    BannerComponent,
    OverallAreaPlanningDialogComponent,
    OverallQualityTargetDialogComponent,
    OverallStrengthTargetDialogComponent,
    OverallThroughputTargetDialogComponent,

    // ✅ EditScene 右側三個 panel components
    EditFilePanelComponent,
    EditTaskPanelComponent,
    EditFieldPanelComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,

    FormsModule, // ✅ ngModel 必需
    ReactiveFormsModule,

    // Routing
    AppRoutingModule,

    // Material
    MatDialogModule,
    MatIconModule,
    MatButtonModule,

    // i18n
    TranslateModule.forRoot({
      useDefaultLang: false,
      fallbackLang: 'zh',
      extend: true,
    }),

    //page
    RightSidebarComponent,
    // 用途：註冊 ECharts lazy import（避免直接打包過大）
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
}),

  ],
  providers: [
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json',
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
