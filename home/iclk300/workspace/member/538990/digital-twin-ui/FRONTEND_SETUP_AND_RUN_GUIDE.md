# 前端系統安裝與執行教學（Digital Twin UI）

本文件整理本專案的前端環境需求、安裝流程與啟動方式。

---

## 1. 系統環境安裝

### 1.1 系統建議規格

> 以下為執行本專案（Angular + Babylon.js 3D 場景）的建議規格。

- **作業系統**：Windows 10/11（64-bit）
- **CPU**：Intel i5 / AMD Ryzen 5 以上
- **記憶體**：至少 8 GB（建議 16 GB）
- **儲存空間**：至少 10 GB 可用空間（含 `node_modules` 與建置暫存）
- **網路**：可連線到專案 API（`proxy.conf.json` 內 `/son` 代理目標）
- **顯示卡（建議）**：支援 WebGL 的獨立顯卡，可提升 3D 場景流暢度

### 1.2 開發工具及程式語言

依目前專案設定（`package.json`、`angular.json`）整理如下：

- **Node.js**：建議使用 LTS 版本（建議 Node.js 20.x）
- **npm**：隨 Node.js 安裝（建議 10+，專案可用 npm 11）
- **Angular**：專案相依為 **Angular 17.3.x**（`@angular/*`）
- **TypeScript**：`5.3.3`
- **主要語言**：TypeScript、HTML、SCSS
- **建議編輯器**：Visual Studio Code

> 註：專案 `README.md` 出現 Angular v18 說明，但實際套件版本為 Angular 17.3.x，建議以 `package.json` 為準。

---

## 2. 前端軟體安裝

以下在 **Windows PowerShell** 執行。

### Step 1：進入專案資料夾

```powershell
cd "C:\B40715\3D Planner\digital-twin-ui\home\iclk300\workspace\member\538990\digital-twin-ui"
```

### Step 2：確認 Node/npm 版本

```powershell
node -v
npm -v
```

### Step 3：安裝前端相依套件

```powershell
npm install
```

### Step 4（選用）：確認 Angular CLI 可正常使用

```powershell
npx ng version
```

---

## 3. 前端軟體執行

### Step 1：啟動開發伺服器

```powershell
npm start
```

預設會執行：

```text
ng serve --port 4200
```

啟動成功後，瀏覽器開啟：

- `http://localhost:4200`

### Step 2：常見啟動問題與處理

#### 問題 A：`Port 4200 is already in use`

你目前環境已出現此錯誤（`npm start` Exit Code 1）。

**解法 1：改用其他連接埠**

```powershell
npx ng serve --port 4201
```

然後改開：`http://localhost:4201`

**解法 2：關閉占用 4200 的程序後重啟**

```powershell
netstat -ano | findstr :4200
```

找到 PID 後結束程序：

```powershell
taskkill /PID <PID> /F
npm start
```

#### 問題 B：API 無回應或跨網段無法連線

- 專案使用 `proxy.conf.json`，會將 `/son` 轉發到：`http://211.20.94.215:3000`
- 請確認公司內網/VPN、防火牆與目標服務狀態

### Step 3：建置正式版（選用）

```powershell
npm run build
```

建置輸出路徑：`dist/digital-twin-ui`

---

## 附錄：常用指令速查

```powershell
npm install
npm start
npx ng serve --port 4201
npm run build
npm run watch
```
