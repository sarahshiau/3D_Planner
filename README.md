
```
digital-twin-ui
├─ DAS_ANTENNA_IMPLEMENTATION.md
├─ FINAL_VERIFICATION_REPORT.md
├─ home
│  └─ iclk300
│     └─ workspace
│        └─ member
│           └─ 538990
│              ├─ digital-twin-ui
│              │  ├─ angular.json
│              │  ├─ assets.lnk
│              │  ├─ package-lock.json
│              │  ├─ package.json
│              │  ├─ README.md
│              │  ├─ src
│              │  │  ├─ app
│              │  │  │  ├─ app-routing.module.ts
│              │  │  │  ├─ app.component.html
│              │  │  │  ├─ app.component.scss
│              │  │  │  ├─ app.component.ts
│              │  │  │  ├─ app.module.ts
│              │  │  │  ├─ components
│              │  │  │  │  ├─ confirm-dialog
│              │  │  │  │  │  ├─ confirm-dialog.component.html
│              │  │  │  │  │  ├─ confirm-dialog.component.scss
│              │  │  │  │  │  └─ confirm-dialog.component.ts
│              │  │  │  │  ├─ map-picker
│              │  │  │  │  │  ├─ map-picker.component.html
│              │  │  │  │  │  ├─ map-picker.component.scss
│              │  │  │  │  │  └─ map-picker.component.ts
│              │  │  │  │  ├─ modals
│              │  │  │  │  │  ├─ antenna-add-modal
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-add-modal.component.ts
│              │  │  │  │  │  ├─ antenna-edit-modal
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-edit-modal.component.ts
│              │  │  │  │  │  ├─ antenna-manage-modal
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-manage-modal.component.ts
│              │  │  │  │  │  ├─ antenna-pattern-modal
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-pattern-modal.component.ts
│              │  │  │  │  │  ├─ material-add-modal
│              │  │  │  │  │  │  ├─ material-add-modal.component.html
│              │  │  │  │  │  │  ├─ material-add-modal.component.scss
│              │  │  │  │  │  │  └─ material-add-modal.component.ts
│              │  │  │  │  │  ├─ material-edit-modal
│              │  │  │  │  │  │  ├─ material-edit-modal.component.html
│              │  │  │  │  │  │  ├─ material-edit-modal.component.scss
│              │  │  │  │  │  │  └─ material-edit-modal.component.ts
│              │  │  │  │  │  ├─ material-manage-modal
│              │  │  │  │  │  │  ├─ material-manage-modal.component.html
│              │  │  │  │  │  │  ├─ material-manage-modal.component.scss
│              │  │  │  │  │  │  └─ material-manage-modal.component.ts
│              │  │  │  │  │  ├─ overall-area-planning-dialog
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-area-planning-dialog.component.ts
│              │  │  │  │  │  ├─ overall-quality-target-dialog
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-quality-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-strength-target-dialog
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-strength-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-throughput-target-dialog
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-throughput-target-dialog.component.ts
│              │  │  │  │  │  ├─ pathloss-model-add-modal
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-add-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-edit-modal
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-edit-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-manage-modal
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-add-modal
│              │  │  │  │  │  │  ├─ ris-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-angle-help-modal
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.html
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.scss
│              │  │  │  │  │  │  └─ ris-angle-help-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-add-modal
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-edit-modal
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.html.html
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-manage-modal
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-pattern-modal
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-pattern-modal.component.ts
│              │  │  │  │  │  ├─ ris-edit-modal
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.html
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-manage-modal
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-manage-modal.component.ts
│              │  │  │  │  │  └─ _modal-dialog-base.scss
│              │  │  │  │  └─ top-bar
│              │  │  │  │     ├─ top-bar.component.html
│              │  │  │  │     ├─ top-bar.component.scss
│              │  │  │  │     ├─ top-bar.component.ts
│              │  │  │  │     └─ topbar-panel
│              │  │  │  │        ├─ topbar-panel.component.html
│              │  │  │  │        ├─ topbar-panel.component.scss
│              │  │  │  │        └─ topbar-panel.component.ts
│              │  │  │  ├─ components.zip
│              │  │  │  ├─ mocks
│              │  │  │  ├─ models
│              │  │  │  │  ├─ committed-map-data.model.ts
│              │  │  │  │  └─ project-meta.model.ts
│              │  │  │  ├─ pages
│              │  │  │  │  ├─ ComputeResult
│              │  │  │  │  │  ├─ compute-result.component.html
│              │  │  │  │  │  ├─ compute-result.component.scss
│              │  │  │  │  │  └─ compute-result.component.ts
│              │  │  │  │  ├─ EditScene
│              │  │  │  │  │  ├─ components
│              │  │  │  │  │  │  ├─ banner
│              │  │  │  │  │  │  │  ├─ banner-toolbar.scss
│              │  │  │  │  │  │  │  ├─ banner.component.html
│              │  │  │  │  │  │  │  ├─ banner.component.scss
│              │  │  │  │  │  │  │  └─ banner.component.ts
│              │  │  │  │  │  │  ├─ banner.zip
│              │  │  │  │  │  │  ├─ left-sidebar
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ left-sidebar.component.ts
│              │  │  │  │  │  │  ├─ left-sidebar.zip
│              │  │  │  │  │  │  ├─ map-scene
│              │  │  │  │  │  │  │  ├─ map-scene.component.html
│              │  │  │  │  │  │  │  ├─ map-scene.component.scss
│              │  │  │  │  │  │  │  └─ map-scene.component.ts
│              │  │  │  │  │  │  ├─ panels
│              │  │  │  │  │  │  │  ├─ edit-field-panel
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-field-panel.component.ts
│              │  │  │  │  │  │  │  ├─ edit-file-panel
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-file-panel.component.ts
│              │  │  │  │  │  │  │  └─ edit-task-panel
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.html
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.scss
│              │  │  │  │  │  │  │     └─ edit-task-panel.component.ts
│              │  │  │  │  │  │  ├─ panels.zip
│              │  │  │  │  │  │  ├─ right-sidebar
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ right-sidebar.component.ts
│              │  │  │  │  │  │  └─ right-sidebar.zip
│              │  │  │  │  │  ├─ components.zip
│              │  │  │  │  │  ├─ EditScene.component.html
│              │  │  │  │  │  ├─ EditScene.component.scss
│              │  │  │  │  │  └─ EditScene.component.ts
│              │  │  │  │  ├─ EditScene.zip
│              │  │  │  │  ├─ GLBmap
│              │  │  │  │  │  ├─ glbmap.component.html
│              │  │  │  │  │  ├─ glbmap.component.scss
│              │  │  │  │  │  └─ glbmap.component.ts
│              │  │  │  │  ├─ MapTest
│              │  │  │  │  │  ├─ map-test.component.html
│              │  │  │  │  │  ├─ map-test.component.scss
│              │  │  │  │  │  └─ map-test.component.ts
│              │  │  │  │  ├─ NewProject
│              │  │  │  │  │  ├─ new-project.component.html
│              │  │  │  │  │  ├─ new-project.component.scss
│              │  │  │  │  │  └─ new-project.component.ts
│              │  │  │  │  ├─ NewProject.zip
│              │  │  │  │  └─ OSMScene
│              │  │  │  │     ├─ osmScene.component.html
│              │  │  │  │     ├─ osmScene.component.scss
│              │  │  │  │     └─ osmScene.component.ts
│              │  │  │  ├─ pages.zip
│              │  │  │  ├─ services
│              │  │  │  │  ├─ glb-test.service.ts
│              │  │  │  │  ├─ logout-api.service.ts
│              │  │  │  │  ├─ map-coordinate.service.ts
│              │  │  │  │  ├─ map-generator.service.ts
│              │  │  │  │  ├─ map-preview.service.ts
│              │  │  │  │  ├─ project-draft.service.ts
│              │  │  │  │  ├─ project-file.service.ts
│              │  │  │  │  ├─ result-data.service.ts
│              │  │  │  │  ├─ signal-test.service.ts
│              │  │  │  │  └─ translation.service.ts
│              │  │  │  └─ services.zip
│              │  │  ├─ assets
│              │  │  │  ├─ i18n
│              │  │  │  │  ├─ en.json
│              │  │  │  │  └─ zh.json
│              │  │  │  ├─ icons
│              │  │  │  │  ├─ analysis.svg
│              │  │  │  │  ├─ antenna3Dbtn.png
│              │  │  │  │  ├─ area.svg
│              │  │  │  │  ├─ basestation3Dbtn.png
│              │  │  │  │  ├─ bsPerf.svg
│              │  │  │  │  ├─ building.svg
│              │  │  │  │  ├─ celandine3Dbtn.png
│              │  │  │  │  ├─ chair3Dbtn.png
│              │  │  │  │  ├─ charts.svg
│              │  │  │  │  ├─ circle.svg
│              │  │  │  │  ├─ circle3Dbtn.png
│              │  │  │  │  ├─ communication.svg
│              │  │  │  │  ├─ cylinder3Dbtn.png
│              │  │  │  │  ├─ eye.svg
│              │  │  │  │  ├─ file.svg
│              │  │  │  │  ├─ flower.svg
│              │  │  │  │  ├─ observe.svg
│              │  │  │  │  ├─ phone3Dbtn.png
│              │  │  │  │  ├─ ris3Dbtn.png
│              │  │  │  │  ├─ shape.svg
│              │  │  │  │  ├─ shape_had.svg
│              │  │  │  │  ├─ sofa3Dbtn.png
│              │  │  │  │  ├─ square.svg
│              │  │  │  │  ├─ square3Dbtn.png
│              │  │  │  │  ├─ target.svg
│              │  │  │  │  ├─ trapezoid3Dbtn.png
│              │  │  │  │  ├─ tree3Dbtn.png
│              │  │  │  │  ├─ triangle3Dbtn.png
│              │  │  │  │  ├─ UE.svg
│              │  │  │  │  └─ uePerf.svg
│              │  │  │  ├─ models
│              │  │  │  │  ├─ antenna
│              │  │  │  │  │  ├─ antenna.glb
│              │  │  │  │  │  └─ basestation.glb
│              │  │  │  │  ├─ antenna.glb
│              │  │  │  │  ├─ bush.glb
│              │  │  │  │  ├─ celandine
│              │  │  │  │  │  ├─ celandine_01.bin
│              │  │  │  │  │  ├─ celandine_01_4k.blend
│              │  │  │  │  │  ├─ celandine_01_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ celandine_01_alpha_4k.png
│              │  │  │  │  │     ├─ celandine_01_ao_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_arm_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_diff_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_disp_4k.png
│              │  │  │  │  │     ├─ celandine_01_nor_gl_4k.exr
│              │  │  │  │  │     └─ celandine_01_rough_4k.exr
│              │  │  │  │  ├─ chair
│              │  │  │  │  │  ├─ modern_arm_chair_01.bin
│              │  │  │  │  │  ├─ modern_arm_chair_01_4k.blend
│              │  │  │  │  │  └─ modern_arm_chair_01_4k.gltf
│              │  │  │  │  ├─ city.glb
│              │  │  │  │  ├─ das_antenna.glb
│              │  │  │  │  ├─ jungle_tree.glb
│              │  │  │  │  ├─ maple_tree.glb
│              │  │  │  │  ├─ office_chair.glb
│              │  │  │  │  ├─ phone.glb
│              │  │  │  │  ├─ sofa
│              │  │  │  │  │  ├─ sofa_02.bin
│              │  │  │  │  │  ├─ sofa_02_4k.blend
│              │  │  │  │  │  ├─ sofa_02_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ sofa_02_arm_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_diff_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_metallic_4k.exr
│              │  │  │  │  │     ├─ sofa_02_nor_gl_4k.exr
│              │  │  │  │  │     └─ sofa_02_roughness_4k.exr
│              │  │  │  │  ├─ sofa_chair.glb
│              │  │  │  │  ├─ tree
│              │  │  │  │  │  ├─ textures
│              │  │  │  │  │  │  ├─ tree_small_02_ao_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_arm_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_diff_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_disp_4k.png
│              │  │  │  │  │  │  ├─ tree_small_02_nor_gl_4k.exr
│              │  │  │  │  │  │  └─ tree_small_02_rough_4k.exr
│              │  │  │  │  │  ├─ tree_small_02.bin
│              │  │  │  │  │  ├─ tree_small_02_4k.blend
│              │  │  │  │  │  └─ tree_small_02_4k.gltf
│              │  │  │  │  └─ tree.glb
│              │  │  │  ├─ templates
│              │  │  │  │  ├─ ITRI_antenna_template.xlsx
│              │  │  │  │  └─ RIS.png
│              │  │  │  └─ 天現場型圖(詳).png
│              │  │  ├─ index.html
│              │  │  ├─ main.ts
│              │  │  ├─ styles
│              │  │  │  └─ _panel-shared.scss
│              │  │  └─ styles.scss
│              │  ├─ tsconfig.app.json
│              │  └─ tsconfig.json
│              └─ digital-twin-ui.zip
├─ IDENTIFICATION_LOGIC_FIXES.md
├─ IMPLEMENTATION_NOTES.md
├─ package-lock.json
├─ package.json
├─ project_structure.txt
├─ QUICK_REFERENCE.md
└─ REPAIR_SUMMARY.md

```
```
digital-twin-ui
├─ ANGLE_CHECKLIST_DEBUG.md
├─ DAS_ANTENNA_IMPLEMENTATION.md
├─ FINAL_VERIFICATION_REPORT.md
├─ home
│  └─ iclk300
│     └─ workspace
│        └─ member
│           └─ 538990
│              ├─ digital-twin-ui
│              │  ├─ angular.json
│              │  ├─ assets.lnk
│              │  ├─ package-lock.json
│              │  ├─ package.json
│              │  ├─ project_structure.txt
│              │  ├─ README.md
│              │  ├─ src
│              │  │  ├─ app
│              │  │  │  ├─ app-routing.module.ts
│              │  │  │  ├─ app.component.html
│              │  │  │  ├─ app.component.scss
│              │  │  │  ├─ app.component.ts
│              │  │  │  ├─ app.module.ts
│              │  │  │  ├─ components
│              │  │  │  │  ├─ confirm-dialog
│              │  │  │  │  │  ├─ confirm-dialog.component.html
│              │  │  │  │  │  ├─ confirm-dialog.component.scss
│              │  │  │  │  │  └─ confirm-dialog.component.ts
│              │  │  │  │  ├─ map-picker
│              │  │  │  │  │  ├─ map-picker.component.html
│              │  │  │  │  │  ├─ map-picker.component.scss
│              │  │  │  │  │  └─ map-picker.component.ts
│              │  │  │  │  ├─ modals
│              │  │  │  │  │  ├─ antenna-add-modal
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-add-modal.component.ts
│              │  │  │  │  │  ├─ antenna-edit-modal
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-edit-modal.component.ts
│              │  │  │  │  │  ├─ antenna-manage-modal
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-manage-modal.component.ts
│              │  │  │  │  │  ├─ antenna-manage-modal.zip
│              │  │  │  │  │  ├─ antenna-pattern-modal
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.scss
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.ts
│              │  │  │  │  │  │  └─ antenna-pattern-viewer.ts
│              │  │  │  │  │  ├─ antenna-pattern-modal (2).zip
│              │  │  │  │  │  ├─ antenna-pattern-modal.zip
│              │  │  │  │  │  ├─ material-add-modal
│              │  │  │  │  │  │  ├─ material-add-modal.component.html
│              │  │  │  │  │  │  ├─ material-add-modal.component.scss
│              │  │  │  │  │  │  └─ material-add-modal.component.ts
│              │  │  │  │  │  ├─ material-edit-modal
│              │  │  │  │  │  │  ├─ material-edit-modal.component.html
│              │  │  │  │  │  │  ├─ material-edit-modal.component.scss
│              │  │  │  │  │  │  └─ material-edit-modal.component.ts
│              │  │  │  │  │  ├─ material-manage-modal
│              │  │  │  │  │  │  ├─ material-manage-modal.component.html
│              │  │  │  │  │  │  ├─ material-manage-modal.component.scss
│              │  │  │  │  │  │  └─ material-manage-modal.component.ts
│              │  │  │  │  │  ├─ overall-area-planning-dialog
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-area-planning-dialog.component.ts
│              │  │  │  │  │  ├─ overall-quality-target-dialog
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-quality-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-strength-target-dialog
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-strength-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-throughput-target-dialog
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-throughput-target-dialog.component.ts
│              │  │  │  │  │  ├─ pathloss-model-add-modal
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-add-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-edit-modal
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-edit-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-manage-modal
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-add-modal
│              │  │  │  │  │  │  ├─ ris-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-angle-help-modal
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.html
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.scss
│              │  │  │  │  │  │  └─ ris-angle-help-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-add-modal
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-edit-modal
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.html.html
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-manage-modal
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-pattern-modal
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-pattern-modal.component.ts
│              │  │  │  │  │  ├─ ris-edit-modal
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.html
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-manage-modal
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-manage-modal.component.ts
│              │  │  │  │  │  └─ _modal-dialog-base.scss
│              │  │  │  │  ├─ modals.zip
│              │  │  │  │  └─ top-bar
│              │  │  │  │     ├─ top-bar.component.html
│              │  │  │  │     ├─ top-bar.component.scss
│              │  │  │  │     ├─ top-bar.component.ts
│              │  │  │  │     └─ topbar-panel
│              │  │  │  │        ├─ topbar-panel.component.html
│              │  │  │  │        ├─ topbar-panel.component.scss
│              │  │  │  │        └─ topbar-panel.component.ts
│              │  │  │  ├─ components.zip
│              │  │  │  ├─ mocks
│              │  │  │  ├─ models
│              │  │  │  │  ├─ committed-map-data.model.ts
│              │  │  │  │  └─ project-meta.model.ts
│              │  │  │  ├─ pages
│              │  │  │  │  ├─ ComputeResult
│              │  │  │  │  │  ├─ compute-result.component.html
│              │  │  │  │  │  ├─ compute-result.component.scss
│              │  │  │  │  │  └─ compute-result.component.ts
│              │  │  │  │  ├─ EditScene
│              │  │  │  │  │  ├─ components
│              │  │  │  │  │  │  ├─ banner
│              │  │  │  │  │  │  │  ├─ banner-toolbar.scss
│              │  │  │  │  │  │  │  ├─ banner.component.html
│              │  │  │  │  │  │  │  ├─ banner.component.scss
│              │  │  │  │  │  │  │  └─ banner.component.ts
│              │  │  │  │  │  │  ├─ banner.zip
│              │  │  │  │  │  │  ├─ left-sidebar
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ left-sidebar.component.ts
│              │  │  │  │  │  │  ├─ left-sidebar.zip
│              │  │  │  │  │  │  ├─ map-scene
│              │  │  │  │  │  │  │  ├─ map-scene.component.html
│              │  │  │  │  │  │  │  ├─ map-scene.component.scss
│              │  │  │  │  │  │  │  └─ map-scene.component.ts
│              │  │  │  │  │  │  ├─ panels
│              │  │  │  │  │  │  │  ├─ edit-field-panel
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-field-panel.component.ts
│              │  │  │  │  │  │  │  ├─ edit-file-panel
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-file-panel.component.ts
│              │  │  │  │  │  │  │  └─ edit-task-panel
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.html
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.scss
│              │  │  │  │  │  │  │     └─ edit-task-panel.component.ts
│              │  │  │  │  │  │  ├─ panels.zip
│              │  │  │  │  │  │  ├─ right-sidebar
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ right-sidebar.component.ts
│              │  │  │  │  │  │  └─ right-sidebar.zip
│              │  │  │  │  │  ├─ components.zip
│              │  │  │  │  │  ├─ EditScene.component.html
│              │  │  │  │  │  ├─ EditScene.component.scss
│              │  │  │  │  │  └─ EditScene.component.ts
│              │  │  │  │  ├─ EditScene.zip
│              │  │  │  │  ├─ GLBmap
│              │  │  │  │  │  ├─ glbmap.component.html
│              │  │  │  │  │  ├─ glbmap.component.scss
│              │  │  │  │  │  └─ glbmap.component.ts
│              │  │  │  │  ├─ MapTest
│              │  │  │  │  │  ├─ map-test.component.html
│              │  │  │  │  │  ├─ map-test.component.scss
│              │  │  │  │  │  └─ map-test.component.ts
│              │  │  │  │  ├─ NewProject
│              │  │  │  │  │  ├─ new-project.component.html
│              │  │  │  │  │  ├─ new-project.component.scss
│              │  │  │  │  │  └─ new-project.component.ts
│              │  │  │  │  ├─ NewProject.zip
│              │  │  │  │  └─ OSMScene
│              │  │  │  │     ├─ osmScene.component.html
│              │  │  │  │     ├─ osmScene.component.scss
│              │  │  │  │     └─ osmScene.component.ts
│              │  │  │  ├─ pages.zip
│              │  │  │  ├─ services
│              │  │  │  │  ├─ antenna-pattern
│              │  │  │  │  │  ├─ antenna-pattern-model.service.ts
│              │  │  │  │  │  ├─ antenna-pattern-xlsx.service.ts
│              │  │  │  │  │  └─ antenna-pattern.types.ts
│              │  │  │  │  ├─ antenna-pattern.zip
│              │  │  │  │  ├─ glb-test.service.ts
│              │  │  │  │  ├─ logout-api.service.ts
│              │  │  │  │  ├─ map-coordinate.service.ts
│              │  │  │  │  ├─ map-generator.service.ts
│              │  │  │  │  ├─ map-preview.service.ts
│              │  │  │  │  ├─ project-draft.service.ts
│              │  │  │  │  ├─ project-file.service.ts
│              │  │  │  │  ├─ result-data.service.ts
│              │  │  │  │  ├─ signal-test.service.ts
│              │  │  │  │  └─ translation.service.ts
│              │  │  │  └─ services.zip
│              │  │  ├─ assets
│              │  │  │  ├─ gltf
│              │  │  │  │  └─ templates
│              │  │  │  │     ├─ dadfa.xlsx
│              │  │  │  │     ├─ ITRI_antenna_template.xlsx
│              │  │  │  │     ├─ ITRI_antenna_template_2G04X6B_20240708.xlsx
│              │  │  │  │     ├─ ITRI_template_directional.xlsx
│              │  │  │  │     ├─ ITRI_template_omni.xlsx
│              │  │  │  │     ├─ ITRI_template_omni_donut_fixed.xlsx
│              │  │  │  │     ├─ ITRI_template_sector65.xlsx
│              │  │  │  │     └─ UU_123.xlsx
│              │  │  │  ├─ i18n
│              │  │  │  │  ├─ en.json
│              │  │  │  │  └─ zh.json
│              │  │  │  ├─ icons
│              │  │  │  │  ├─ analysis.svg
│              │  │  │  │  ├─ analysisbtn.png
│              │  │  │  │  ├─ antenna3Dbtn.png
│              │  │  │  │  ├─ area.svg
│              │  │  │  │  ├─ basestation3Dbtn.png
│              │  │  │  │  ├─ bsPerf.svg
│              │  │  │  │  ├─ building.svg
│              │  │  │  │  ├─ celandine3Dbtn.png
│              │  │  │  │  ├─ chair3Dbtn.png
│              │  │  │  │  ├─ charts.svg
│              │  │  │  │  ├─ circle.svg
│              │  │  │  │  ├─ circle3Dbtn.png
│              │  │  │  │  ├─ communication.svg
│              │  │  │  │  ├─ cylinder3Dbtn.png
│              │  │  │  │  ├─ eye.svg
│              │  │  │  │  ├─ file.svg
│              │  │  │  │  ├─ flower.svg
│              │  │  │  │  ├─ objectbtn.png
│              │  │  │  │  ├─ observe.svg
│              │  │  │  │  ├─ phone3Dbtn.png
│              │  │  │  │  ├─ resultbtn.png
│              │  │  │  │  ├─ ris3Dbtn.png
│              │  │  │  │  ├─ settingbtn.png
│              │  │  │  │  ├─ shape.svg
│              │  │  │  │  ├─ shape_had.svg
│              │  │  │  │  ├─ sofa3Dbtn.png
│              │  │  │  │  ├─ square.svg
│              │  │  │  │  ├─ square3Dbtn.png
│              │  │  │  │  ├─ target.svg
│              │  │  │  │  ├─ trapezoid3Dbtn.png
│              │  │  │  │  ├─ tree3Dbtn.png
│              │  │  │  │  ├─ triangle3Dbtn.png
│              │  │  │  │  ├─ UE.svg
│              │  │  │  │  ├─ uePerf.svg
│              │  │  │  │  └─ visiblebtn.png
│              │  │  │  ├─ models
│              │  │  │  │  ├─ antenna
│              │  │  │  │  │  ├─ antenna.glb
│              │  │  │  │  │  └─ basestation.glb
│              │  │  │  │  ├─ antenna.glb
│              │  │  │  │  ├─ bush.glb
│              │  │  │  │  ├─ celandine
│              │  │  │  │  │  ├─ celandine_01.bin
│              │  │  │  │  │  ├─ celandine_01_4k.blend
│              │  │  │  │  │  ├─ celandine_01_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ celandine_01_alpha_4k.png
│              │  │  │  │  │     ├─ celandine_01_ao_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_arm_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_diff_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_disp_4k.png
│              │  │  │  │  │     ├─ celandine_01_nor_gl_4k.exr
│              │  │  │  │  │     └─ celandine_01_rough_4k.exr
│              │  │  │  │  ├─ chair
│              │  │  │  │  │  ├─ modern_arm_chair_01.bin
│              │  │  │  │  │  ├─ modern_arm_chair_01_4k.blend
│              │  │  │  │  │  └─ modern_arm_chair_01_4k.gltf
│              │  │  │  │  ├─ city.glb
│              │  │  │  │  ├─ das_antenna.glb
│              │  │  │  │  ├─ jungle_tree.glb
│              │  │  │  │  ├─ maple_tree.glb
│              │  │  │  │  ├─ office_chair.glb
│              │  │  │  │  ├─ phone.glb
│              │  │  │  │  ├─ sofa
│              │  │  │  │  │  ├─ sofa_02.bin
│              │  │  │  │  │  ├─ sofa_02_4k.blend
│              │  │  │  │  │  ├─ sofa_02_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ sofa_02_arm_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_diff_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_metallic_4k.exr
│              │  │  │  │  │     ├─ sofa_02_nor_gl_4k.exr
│              │  │  │  │  │     └─ sofa_02_roughness_4k.exr
│              │  │  │  │  ├─ sofa_chair.glb
│              │  │  │  │  ├─ tree
│              │  │  │  │  │  ├─ textures
│              │  │  │  │  │  │  ├─ tree_small_02_ao_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_arm_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_diff_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_disp_4k.png
│              │  │  │  │  │  │  ├─ tree_small_02_nor_gl_4k.exr
│              │  │  │  │  │  │  └─ tree_small_02_rough_4k.exr
│              │  │  │  │  │  ├─ tree_small_02.bin
│              │  │  │  │  │  ├─ tree_small_02_4k.blend
│              │  │  │  │  │  └─ tree_small_02_4k.gltf
│              │  │  │  │  └─ tree.glb
│              │  │  │  ├─ templates
│              │  │  │  │  ├─ ITRI_antenna_template.xlsx
│              │  │  │  │  └─ RIS.png
│              │  │  │  └─ 天現場型圖(詳).png
│              │  │  ├─ index.html
│              │  │  ├─ main.ts
│              │  │  ├─ styles
│              │  │  │  └─ _panel-shared.scss
│              │  │  └─ styles.scss
│              │  ├─ tsconfig.app.json
│              │  └─ tsconfig.json
│              └─ digital-twin-ui.zip
├─ IDENTIFICATION_LOGIC_FIXES.md
├─ IMPLEMENTATION_NOTES.md
├─ package-lock.json
├─ package.json
├─ project_structure.txt
├─ QUICK_REFERENCE.md
├─ README.md
└─ REPAIR_SUMMARY.md

```
```
digital-twin-ui
├─ ANGLE_CHECKLIST_DEBUG.md
├─ DAS_ANTENNA_IMPLEMENTATION.md
├─ FINAL_VERIFICATION_REPORT.md
├─ home
│  └─ iclk300
│     └─ workspace
│        └─ member
│           └─ 538990
│              ├─ digital-twin-ui
│              │  ├─ angular.json
│              │  ├─ assets.lnk
│              │  ├─ package-lock.json
│              │  ├─ package.json
│              │  ├─ project_structure.txt
│              │  ├─ README.md
│              │  ├─ src
│              │  │  ├─ app
│              │  │  │  ├─ app-routing.module.ts
│              │  │  │  ├─ app.component.html
│              │  │  │  ├─ app.component.scss
│              │  │  │  ├─ app.component.ts
│              │  │  │  ├─ app.module.ts
│              │  │  │  ├─ components
│              │  │  │  │  ├─ confirm-dialog
│              │  │  │  │  │  ├─ confirm-dialog.component.html
│              │  │  │  │  │  ├─ confirm-dialog.component.scss
│              │  │  │  │  │  └─ confirm-dialog.component.ts
│              │  │  │  │  ├─ map-picker
│              │  │  │  │  │  ├─ map-picker.component.html
│              │  │  │  │  │  ├─ map-picker.component.scss
│              │  │  │  │  │  └─ map-picker.component.ts
│              │  │  │  │  ├─ modals
│              │  │  │  │  │  ├─ antenna-add-modal
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-add-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-add-modal.component.ts
│              │  │  │  │  │  ├─ antenna-edit-modal
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-edit-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-edit-modal.component.ts
│              │  │  │  │  │  ├─ antenna-manage-modal
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-manage-modal.component.scss
│              │  │  │  │  │  │  └─ antenna-manage-modal.component.ts
│              │  │  │  │  │  ├─ antenna-manage-modal.zip
│              │  │  │  │  │  ├─ antenna-pattern-modal
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.scss
│              │  │  │  │  │  │  ├─ antenna-pattern-modal.component.ts
│              │  │  │  │  │  │  └─ antenna-pattern-viewer.ts
│              │  │  │  │  │  ├─ antenna-pattern-modal (2).zip
│              │  │  │  │  │  ├─ antenna-pattern-modal.zip
│              │  │  │  │  │  ├─ material-add-modal
│              │  │  │  │  │  │  ├─ material-add-modal.component.html
│              │  │  │  │  │  │  ├─ material-add-modal.component.scss
│              │  │  │  │  │  │  └─ material-add-modal.component.ts
│              │  │  │  │  │  ├─ material-edit-modal
│              │  │  │  │  │  │  ├─ material-edit-modal.component.html
│              │  │  │  │  │  │  ├─ material-edit-modal.component.scss
│              │  │  │  │  │  │  └─ material-edit-modal.component.ts
│              │  │  │  │  │  ├─ material-manage-modal
│              │  │  │  │  │  │  ├─ material-manage-modal.component.html
│              │  │  │  │  │  │  ├─ material-manage-modal.component.scss
│              │  │  │  │  │  │  └─ material-manage-modal.component.ts
│              │  │  │  │  │  ├─ overall-area-planning-dialog
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-area-planning-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-area-planning-dialog.component.ts
│              │  │  │  │  │  ├─ overall-quality-target-dialog
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-quality-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-quality-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-strength-target-dialog
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-strength-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-strength-target-dialog.component.ts
│              │  │  │  │  │  ├─ overall-throughput-target-dialog
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.html
│              │  │  │  │  │  │  ├─ overall-throughput-target-dialog.component.scss
│              │  │  │  │  │  │  └─ overall-throughput-target-dialog.component.ts
│              │  │  │  │  │  ├─ pathloss-model-add-modal
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-add-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-add-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-edit-modal
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-edit-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-edit-modal.component.ts
│              │  │  │  │  │  ├─ pathloss-model-manage-modal
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.html
│              │  │  │  │  │  │  ├─ pathloss-model-manage-modal.component.scss
│              │  │  │  │  │  │  └─ pathloss-model-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-add-modal
│              │  │  │  │  │  │  ├─ ris-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-angle-help-modal
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.html
│              │  │  │  │  │  │  ├─ ris-angle-help-modal.component.scss
│              │  │  │  │  │  │  └─ ris-angle-help-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-add-modal
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-add-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-add-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-edit-modal
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.html.html
│              │  │  │  │  │  │  ├─ ris-config-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-manage-modal
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-manage-modal.component.ts
│              │  │  │  │  │  ├─ ris-config-pattern-modal
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.html
│              │  │  │  │  │  │  ├─ ris-config-pattern-modal.component.scss
│              │  │  │  │  │  │  └─ ris-config-pattern-modal.component.ts
│              │  │  │  │  │  ├─ ris-edit-modal
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.html
│              │  │  │  │  │  │  ├─ ris-edit-modal.component.scss
│              │  │  │  │  │  │  └─ ris-edit-modal.component.ts
│              │  │  │  │  │  ├─ ris-manage-modal
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.html
│              │  │  │  │  │  │  ├─ ris-manage-modal.component.scss
│              │  │  │  │  │  │  └─ ris-manage-modal.component.ts
│              │  │  │  │  │  └─ _modal-dialog-base.scss
│              │  │  │  │  ├─ modals.zip
│              │  │  │  │  └─ top-bar
│              │  │  │  │     ├─ top-bar.component.html
│              │  │  │  │     ├─ top-bar.component.scss
│              │  │  │  │     ├─ top-bar.component.ts
│              │  │  │  │     └─ topbar-panel
│              │  │  │  │        ├─ topbar-panel.component.html
│              │  │  │  │        ├─ topbar-panel.component.scss
│              │  │  │  │        └─ topbar-panel.component.ts
│              │  │  │  ├─ components.zip
│              │  │  │  ├─ mocks
│              │  │  │  ├─ models
│              │  │  │  │  ├─ committed-map-data.model.ts
│              │  │  │  │  └─ project-meta.model.ts
│              │  │  │  ├─ pages
│              │  │  │  │  ├─ ComputeResult
│              │  │  │  │  │  ├─ compute-result.component.html
│              │  │  │  │  │  ├─ compute-result.component.scss
│              │  │  │  │  │  └─ compute-result.component.ts
│              │  │  │  │  ├─ EditScene
│              │  │  │  │  │  ├─ components
│              │  │  │  │  │  │  ├─ banner
│              │  │  │  │  │  │  │  ├─ banner-toolbar.scss
│              │  │  │  │  │  │  │  ├─ banner.component.html
│              │  │  │  │  │  │  │  ├─ banner.component.scss
│              │  │  │  │  │  │  │  └─ banner.component.ts
│              │  │  │  │  │  │  ├─ banner.zip
│              │  │  │  │  │  │  ├─ left-sidebar
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ left-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ left-sidebar.component.ts
│              │  │  │  │  │  │  ├─ left-sidebar.zip
│              │  │  │  │  │  │  ├─ map-scene
│              │  │  │  │  │  │  │  ├─ map-scene.component.html
│              │  │  │  │  │  │  │  ├─ map-scene.component.scss
│              │  │  │  │  │  │  │  └─ map-scene.component.ts
│              │  │  │  │  │  │  ├─ panels
│              │  │  │  │  │  │  │  ├─ edit-field-panel
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-field-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-field-panel.component.ts
│              │  │  │  │  │  │  │  ├─ edit-file-panel
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.html
│              │  │  │  │  │  │  │  │  ├─ edit-file-panel.component.scss
│              │  │  │  │  │  │  │  │  └─ edit-file-panel.component.ts
│              │  │  │  │  │  │  │  └─ edit-task-panel
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.html
│              │  │  │  │  │  │  │     ├─ edit-task-panel.component.scss
│              │  │  │  │  │  │  │     └─ edit-task-panel.component.ts
│              │  │  │  │  │  │  ├─ panels.zip
│              │  │  │  │  │  │  ├─ right-sidebar
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.html
│              │  │  │  │  │  │  │  ├─ right-sidebar.component.scss
│              │  │  │  │  │  │  │  └─ right-sidebar.component.ts
│              │  │  │  │  │  │  └─ right-sidebar.zip
│              │  │  │  │  │  ├─ components.zip
│              │  │  │  │  │  ├─ EditScene.component.html
│              │  │  │  │  │  ├─ EditScene.component.scss
│              │  │  │  │  │  └─ EditScene.component.ts
│              │  │  │  │  ├─ EditScene.zip
│              │  │  │  │  ├─ GLBmap
│              │  │  │  │  │  ├─ glbmap.component.html
│              │  │  │  │  │  ├─ glbmap.component.scss
│              │  │  │  │  │  └─ glbmap.component.ts
│              │  │  │  │  ├─ MapTest
│              │  │  │  │  │  ├─ map-test.component.html
│              │  │  │  │  │  ├─ map-test.component.scss
│              │  │  │  │  │  └─ map-test.component.ts
│              │  │  │  │  ├─ NewProject
│              │  │  │  │  │  ├─ new-project.component.html
│              │  │  │  │  │  ├─ new-project.component.scss
│              │  │  │  │  │  └─ new-project.component.ts
│              │  │  │  │  ├─ NewProject.zip
│              │  │  │  │  └─ OSMScene
│              │  │  │  │     ├─ osmScene.component.html
│              │  │  │  │     ├─ osmScene.component.scss
│              │  │  │  │     └─ osmScene.component.ts
│              │  │  │  ├─ pages.zip
│              │  │  │  ├─ services
│              │  │  │  │  ├─ antenna-pattern
│              │  │  │  │  │  ├─ antenna-pattern-model.service.ts
│              │  │  │  │  │  ├─ antenna-pattern-xlsx.service.ts
│              │  │  │  │  │  └─ antenna-pattern.types.ts
│              │  │  │  │  ├─ antenna-pattern.zip
│              │  │  │  │  ├─ glb-test.service.ts
│              │  │  │  │  ├─ logout-api.service.ts
│              │  │  │  │  ├─ map-coordinate.service.ts
│              │  │  │  │  ├─ map-generator.service.ts
│              │  │  │  │  ├─ map-preview.service.ts
│              │  │  │  │  ├─ project-draft.service.ts
│              │  │  │  │  ├─ project-file.service.ts
│              │  │  │  │  ├─ result-data.service.ts
│              │  │  │  │  ├─ signal-test.service.ts
│              │  │  │  │  └─ translation.service.ts
│              │  │  │  └─ services.zip
│              │  │  ├─ assets
│              │  │  │  ├─ gltf
│              │  │  │  │  └─ templates
│              │  │  │  │     ├─ dadfa.xlsx
│              │  │  │  │     ├─ ITRI_antenna_template.xlsx
│              │  │  │  │     ├─ ITRI_antenna_template_2G04X6B_20240708.xlsx
│              │  │  │  │     ├─ ITRI_template_directional.xlsx
│              │  │  │  │     ├─ ITRI_template_omni.xlsx
│              │  │  │  │     ├─ ITRI_template_omni_donut_fixed.xlsx
│              │  │  │  │     ├─ ITRI_template_sector65.xlsx
│              │  │  │  │     └─ UU_123.xlsx
│              │  │  │  ├─ i18n
│              │  │  │  │  ├─ en.json
│              │  │  │  │  └─ zh.json
│              │  │  │  ├─ icons
│              │  │  │  │  ├─ analysis.svg
│              │  │  │  │  ├─ analysisbtn.png
│              │  │  │  │  ├─ antenna3Dbtn.png
│              │  │  │  │  ├─ area.svg
│              │  │  │  │  ├─ basestation3Dbtn.png
│              │  │  │  │  ├─ bsPerf.svg
│              │  │  │  │  ├─ building.svg
│              │  │  │  │  ├─ celandine3Dbtn.png
│              │  │  │  │  ├─ chair3Dbtn.png
│              │  │  │  │  ├─ charts.svg
│              │  │  │  │  ├─ circle.svg
│              │  │  │  │  ├─ circle3Dbtn.png
│              │  │  │  │  ├─ communication.svg
│              │  │  │  │  ├─ cylinder3Dbtn.png
│              │  │  │  │  ├─ eye.svg
│              │  │  │  │  ├─ file.svg
│              │  │  │  │  ├─ flower.svg
│              │  │  │  │  ├─ objectbtn.png
│              │  │  │  │  ├─ observe.svg
│              │  │  │  │  ├─ phone3Dbtn.png
│              │  │  │  │  ├─ resultbtn.png
│              │  │  │  │  ├─ ris3Dbtn.png
│              │  │  │  │  ├─ settingbtn.png
│              │  │  │  │  ├─ shape.svg
│              │  │  │  │  ├─ shape_had.svg
│              │  │  │  │  ├─ sofa3Dbtn.png
│              │  │  │  │  ├─ square.svg
│              │  │  │  │  ├─ square3Dbtn.png
│              │  │  │  │  ├─ target.svg
│              │  │  │  │  ├─ trapezoid3Dbtn.png
│              │  │  │  │  ├─ tree3Dbtn.png
│              │  │  │  │  ├─ triangle3Dbtn.png
│              │  │  │  │  ├─ UE.svg
│              │  │  │  │  ├─ uePerf.svg
│              │  │  │  │  └─ visiblebtn.png
│              │  │  │  ├─ models
│              │  │  │  │  ├─ antenna
│              │  │  │  │  │  ├─ antenna.glb
│              │  │  │  │  │  └─ basestation.glb
│              │  │  │  │  ├─ antenna.glb
│              │  │  │  │  ├─ bush.glb
│              │  │  │  │  ├─ celandine
│              │  │  │  │  │  ├─ celandine_01.bin
│              │  │  │  │  │  ├─ celandine_01_4k.blend
│              │  │  │  │  │  ├─ celandine_01_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ celandine_01_alpha_4k.png
│              │  │  │  │  │     ├─ celandine_01_ao_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_arm_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_diff_4k.jpg
│              │  │  │  │  │     ├─ celandine_01_disp_4k.png
│              │  │  │  │  │     ├─ celandine_01_nor_gl_4k.exr
│              │  │  │  │  │     └─ celandine_01_rough_4k.exr
│              │  │  │  │  ├─ chair
│              │  │  │  │  │  ├─ modern_arm_chair_01.bin
│              │  │  │  │  │  ├─ modern_arm_chair_01_4k.blend
│              │  │  │  │  │  └─ modern_arm_chair_01_4k.gltf
│              │  │  │  │  ├─ city.glb
│              │  │  │  │  ├─ das_antenna.glb
│              │  │  │  │  ├─ jungle_tree.glb
│              │  │  │  │  ├─ maple_tree.glb
│              │  │  │  │  ├─ office_chair.glb
│              │  │  │  │  ├─ phone.glb
│              │  │  │  │  ├─ sofa
│              │  │  │  │  │  ├─ sofa_02.bin
│              │  │  │  │  │  ├─ sofa_02_4k.blend
│              │  │  │  │  │  ├─ sofa_02_4k.gltf
│              │  │  │  │  │  └─ textures
│              │  │  │  │  │     ├─ sofa_02_arm_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_diff_4k.jpg
│              │  │  │  │  │     ├─ sofa_02_metallic_4k.exr
│              │  │  │  │  │     ├─ sofa_02_nor_gl_4k.exr
│              │  │  │  │  │     └─ sofa_02_roughness_4k.exr
│              │  │  │  │  ├─ sofa_chair.glb
│              │  │  │  │  ├─ tree
│              │  │  │  │  │  ├─ textures
│              │  │  │  │  │  │  ├─ tree_small_02_ao_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_arm_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_diff_4k.jpg
│              │  │  │  │  │  │  ├─ tree_small_02_disp_4k.png
│              │  │  │  │  │  │  ├─ tree_small_02_nor_gl_4k.exr
│              │  │  │  │  │  │  └─ tree_small_02_rough_4k.exr
│              │  │  │  │  │  ├─ tree_small_02.bin
│              │  │  │  │  │  ├─ tree_small_02_4k.blend
│              │  │  │  │  │  └─ tree_small_02_4k.gltf
│              │  │  │  │  └─ tree.glb
│              │  │  │  ├─ templates
│              │  │  │  │  ├─ ITRI_antenna_template.xlsx
│              │  │  │  │  └─ RIS.png
│              │  │  │  └─ 天現場型圖(詳).png
│              │  │  ├─ index.html
│              │  │  ├─ main.ts
│              │  │  ├─ styles
│              │  │  │  └─ _panel-shared.scss
│              │  │  └─ styles.scss
│              │  ├─ tsconfig.app.json
│              │  └─ tsconfig.json
│              └─ digital-twin-ui.zip
├─ IDENTIFICATION_LOGIC_FIXES.md
├─ IMPLEMENTATION_NOTES.md
├─ package-lock.json
├─ package.json
├─ project_structure.txt
├─ QUICK_REFERENCE.md
├─ README.md
└─ REPAIR_SUMMARY.md

```