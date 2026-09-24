# 系統設計動畫參考站 — 設計文件

日期：2026-09-24

## 背景與目的

建立一個給系統架構師參考的網站，用生動的互動動畫講解系統設計概念。`docs/` 下已有兩支 Instagram Reel（`AlgoMaster.io` 的 SQL Joins、`Krishna Chaitanya` 的 Stack vs Heap），這兩支影片作為**視覺風格與教學節奏的範本**，不直接嵌入播放——網站要用 HTML/CSS/JS 把同樣的概念重做成可暫停、可單步、可拖曳時間軸的互動動畫。

## 範圍（v1）

**主題涵蓋**：以經典系統設計元件為主軸，兩支參考影片的主題也收進來，歸類為「基礎篇」。v1 做 5 個主題，刻意涵蓋三種不同畫面型態（表格資料、記憶體圖、網路架構圖），用來驗證動畫引擎的通用性：

基礎篇：
1. SQL Joins（INNER / LEFT / RIGHT / FULL OUTER JOIN 逐步套用）
2. Stack vs Heap（函式呼叫時堆疊/堆積的記憶體配置過程）

系統設計篇：
3. Load Balancer（Round Robin / Least Connections）
4. Cache 讀寫策略（Cache-Aside / Write-Through / Write-Back，含 Cache Hit/Miss）
5. Consistent Hashing（一致性雜湊環，新增/移除節點只影響鄰近區段）

**Out of scope（先記下，v1 不做）**：DB Sharding/Replication、Message Queue、Rate Limiter、CAP 定理。之後每個主題都是照同一套引擎新增一個資料夾即可，不影響既有架構。

**互動深度**：只做播放器（播放/暫停/單步/拖曳時間軸），不做「切換情境參數」（例如切換 Cache 策略需要另開一個主題頁，而非同一頁面內切換）。

## 技術路線

純靜態 HTML/CSS/JS，不用 build 工具，沒有後端、沒有資料庫。可直接用一個靜態伺服器（或未來 GitHub Pages）served，不吃 Docker、npm。

**本機開發**：主題頁用 `<script type="module">` 載入共用引擎與各自的 `steps.js`/`render.js`。ES module 在 `file://` 協定下會被 Chrome/Edge/Safari 的 CORS 政策擋下（`import` 失敗、畫面空白），因此本機測試需先跑 `python3 -m http.server` 起一個一次性的靜態伺服器（非常駐後端）。部署後（如 GitHub Pages）走 http(s)，不受此限制。

## 語言

介面文字與動畫旁白一律**繁體中文**，技術名詞（Load Balancer、Sharding、Cache Hit 等）保留英文不翻譯。

## 網站結構

```
index.html                     # 首頁：分類卡片牆（基礎篇 / 系統設計篇）
assets/
  css/tokens.css                # 設計 token
  css/base.css                  # 全站共用樣式、播放器樣式
  js/engine/player.js           # 共用播放器
  js/engine/render-loop.js      # 依 step index 呼叫主題的 render(state)
topics/
  sql-joins/{index.html, steps.js, render.js}
  stack-vs-heap/{index.html, steps.js, render.js}
  load-balancer/{index.html, steps.js, render.js}
  cache-strategies/{index.html, steps.js, render.js}
  consistent-hashing/{index.html, steps.js, render.js}
docs/
  dev.md, 原始參考影片, superpowers/specs/（本文件）
```

導覽：首頁分類卡片牆，點進去是該主題的獨立頁面（`/topics/<slug>/`）。共用引擎與各主題資料分離，新增主題只需新增 `topics/` 下的資料夾，不動共用程式碼。

## 動畫引擎

**資料契約**：每個主題兩個檔案。

`steps.js` — 陣列，每個元素是一個畫面快照：
```js
export const steps = [
  {
    id: 'inner-join-0',
    caption: '目前沒有符合的資料列，INNER JOIN 結果是空集合。',
    duration: 1800,      // 建議停留毫秒數，供自動播放與時間軸分段用
    data: { /* 這一步的任意狀態 */ }
  },
  // ...
];
```

`render.js` — 純函式，依 step 畫出畫面：
```js
export function render(step, stage) {
  stage.innerHTML = `/* 依 step.data 產生的 HTML/SVG 字串 */`;
}
```

**跨步驟過場**：不手刻 DOM diff。用 `document.startViewTransition(() => render(step, stage))`，讓瀏覽器自動處理新舊畫面的補間；不支援的瀏覽器直接退化成瞬間切換，不影響功能正確性。

**共用播放器（`engine/player.js`）**：
- 維護 `currentIndex`、播放/暫停狀態
- 播放模式依 `step.duration` 計時自動前進，最後一步停止（不循環）
- 控制列：上一步 / 播放暫停 / 下一步 / 拖曳時間軸（scrubber）
- 顯示目前 `caption`
- 鍵盤：space 播放/暫停、左右鍵單步

**主題頁骨架**：固定的 `#stage` + `#caption` + 控制列 HTML，`<script type="module">` 引入 `initPlayer({ steps, render, mount: '#stage' })`。

## 視覺風格

複用 `~/.claude/guides/templates/tokens.css` 的變數命名結構（spacer 階層、圓角三階、box-shadow 命名），色值覆寫為深色主題（呼應兩支參考影片的深色終端機風格），放在 `assets/css/tokens.css`：

```css
--bs-body-bg: #0B0F17;
--bs-body-color: #E6EDF7;
--bs-secondary-color: #8B98AD;
--bs-border-color: #232B3A;

--bs-secondary-bg: #121826;
--bs-tertiary-bg: #1A2233;

--bs-primary: #4EE0C1;   /* 青綠：主要強調、目前 highlight */
--bs-info: #5B9DF0;      /* 藍：次要點綴、連結 */
--bs-success: #4EE0C1;
--bs-warning: #E0B24E;   /* 琥珀：變動中/待處理狀態 */
--bs-danger: #E06B5B;    /* 珊瑚紅：NULL/移除/錯誤 */

--bs-font-monospace: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; /* 資料表、程式碼、堆疊/堆積圖 */
--bs-font-sans-serif: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif; /* 標題、說明文字、UI 控制項 */
```

圓角、間距、關閉陰影沿用 guide 預設（扁平風格，卡片用 1px 邊框而非陰影）。各主題 `render.js` 產出的 HTML 一律吃這組變數，不寫死色碼。

## 驗證方式

純前端無測試框架，驗證以實際瀏覽器操作為準：
- 本機 `python3 -m http.server` 起靜態伺服器，逐一打開 5 個主題頁
- 確認播放/暫停/單步/拖曳時間軸都正確對應畫面、View Transition 有效果（或優雅降級不報錯）
- 依 CLAUDE.md「驗證不自驗」原則，完成後派 fresh-context subagent 用 chrome-devtools 實際操作 + 截圖驗收（每輪 ≤3 張），不由實作者自行驗收
