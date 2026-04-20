import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { EditSceneComponent } from './pages/EditScene/EditScene.component';
import { osmSceneComponent } from './pages/OSMScene/osmScene.component';
import { MapTestComponent } from './pages/MapTest/map-test.component';

// ✅ 新增
import { NewProjectComponent } from './pages/NewProject/new-project.component';
import { ComputeResultComponent } from './pages/ComputeResult/compute-result.component';
import { GLBmapComponent } from './pages/GLBmap/glbmap.component';

const routes: Routes = [
  // ✅ 保留你原本預設導向 editscene
  { path: '', redirectTo: 'editscene', pathMatch: 'full' },

  // ✅ 新增專案流程（你可手動開 /project/new）
  { path: 'project/new', component: NewProjectComponent },

  // ✅ GLB 測試頁面
  { path: 'GLBmap', component: GLBmapComponent },

  // ✅ 你既有頁面（全部保留）
  { path: 'editscene', component: EditSceneComponent },
  { path: 'osmscene', component: osmSceneComponent },
  { path: 'map-test', component: MapTestComponent },

  // ✅ 運算結果頁
  { path: 'result', component: ComputeResultComponent },

  // ✅ 任意未知路由回 editscene（符合你目前習慣）
  { path: '**', redirectTo: 'editscene' },
  {
    path:'app',
    loadChildren: () => import('./app.module').then(m => m.AppModule)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
