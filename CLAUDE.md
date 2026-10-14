# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案性質

給系統架構師看的互動動畫教學站。純靜態網站：HTML + CSS + 原生 ES modules，沒有建置工具、沒有套件管理、沒有測試框架、不使用任何外部函式庫或 CDN。以 GitHub Pages 發佈（https://lingaoscar.github.io/Html-ArchitectVault/），repo 根目錄就是網站根目錄，所以所有路徑都必須是相對路徑。

## 常用指令

```bash
# 本機預覽（頁面用 <script type="module">，不能用 file:// 直接開）
python3 -m http.server 8765
# 然後開 http://localhost:8765/

# 語法檢查
node --check topics/<主題>/steps.js
node --check topics/<主題>/render.js

# 檢視某主題的步驟資料（步數、總秒數、每步說明）
node --input-type=module -e "import {steps} from './topics/<主題>/steps.js'; console.log(steps.length, steps.reduce((a,s)=>a+s.duration,0)/1000+'s'); for (const s of steps) console.log(s.chapter,'|',s.caption)"
```

`steps.js` 不可使用 `window` / `document`，才能像上面這樣在 node 匯入檢查。`render.js` 會匯入用到 `window` 的 `motion.js`，只能做 `node --check`，實際行為要在瀏覽器驗證（桌機寬度與 390px 手機寬度都要看）。

瀏覽器會快取 ES module，改完程式後要強制重新整理，否則會看到舊的 `steps.js` 配新的 `render.js` 而出現匯出名稱不存在的錯誤。

## 架構

### 播放器與主題的契約

`assets/js/engine/player.js` 的 `initPlayer({ steps, render, mount })` 是唯一的引擎入口，負責控制列、時間軸、章節列、鍵盤操作與自動播放。每個主題提供兩樣東西：

- `steps.js` 匯出 `steps: Array<{ id, caption, duration, data, chapter? }>`。連續且 `chapter` 相同的步驟會成為一顆章節按鈕。
- `render.js` 匯出 `render(step, stageElement, prevStep)`。`prevStep` 是時間軸上的前一步（第一步為 `undefined`），用來算出「這一步變了什麼」。

使用者可以拖時間軸任意跳步與倒退，所以 **render 必須能只憑 `step`（加上 `prevStep`）畫出完整狀態**，不能依賴先前呼叫累積下來的狀態。所有推導（模擬、計數、歸屬）都在 `steps.js` 產生步驟時算好放進 `data`。

播放器不對舞台做任何轉場，只在舞台外圍加章節橫幅、說明文字進場與自動播放倒數條。說明文字與控制列包在 `.player-head` 裡，桌機捲動時黏在頂端；手機不黏（說明常有四五行，會吃掉半個螢幕）。`.stage` 用 `overflow-x: clip` 而不是 `auto`，否則舞台會變成捲動容器，裡面的 `position: sticky` 就失效。

### 主題的畫法：常駐場景

每個主題的 `render.js` 都遵循同一個模式（`topics/load-balancer/` 是範本，其餘主題照它寫）：

- 舞台 DOM 只在第一次呼叫時建立，存在 module 層級的 `scene` 變數；之後每一步只更新 class、文字與位置。**不可在每一步整塊 `innerHTML` 重畫**，那會造成畫面閃爍、也無法做連續動畫。
- 會移動的東西（請求、結果列、記憶體區塊、key）是從頭到尾都存在的絕對定位元素，用 `assets/js/engine/motion.js` 的 `flyTo()` 從上一個位置飛到新位置；目標位置是用 `getBoundingClientRect()` 對準版面中的空位 placeholder 算出來的。不在場上時加 class 淡出，不移除元素。
- 因為位置是絕對座標，每個主題都要監聽 `resize` 重新對位。
- 段與段之間的連接線是疊在場景上的 SVG，座標同樣由實際版面量出。
- 數值變化以 `<span class="delta"><s>舊</s> → <b>新</b></span>` 顯示並呼叫 `pop()`。
- 特效：`flyTo()` 會自動加上飛行發光、拖尾分身（`.fx-ghost`）與落地光環（`.fx-ring`），`pop()` 會加發光。狀態強調一律用 `base.css` 的共用 keyframes：`fx-pulse`（等待決定）、`fx-impact`（結果落定）、`fx-shake`（被拒絕／出錯）、`fx-bump`、`fx-wire-flow`（連接線流動）。特效顏色由 CSS 變數 `--fx-c` 決定，在元素上覆寫成歸屬色或警示色。已用 `transform` 定位的元素不可套用含 `transform` 的動畫（`fx-shake`、`fx-bump`）。

### 架構比較主題：共用架構圖引擎

`app-architecture`、`ui-patterns`、`deploy-architecture`、`cqrs` 四個主題的畫面都是「方塊 + 依賴箭頭 + 移動的請求」，畫法集中在共用模組，主題只提供資料：

- `assets/js/engine/diagram.js`：`createDiagramRender({ systems, compare })` 回傳 `render`。每個 system 定義方塊（`nodes`，用 `cell` 指定格子、`ring` 決定顏色）、箭頭（`edges`，`kind` 為 `dep` 具體依賴、`iface` 介面依賴、`net` 網路呼叫、`bind` 資料綁定、`event` 事件）、外框（`groups`，部署單元或模組邊界）、token 與輸出區計數。主題的 `render.js` 只有一行呼叫它。
- `assets/js/engine/graph.js`：純函式，從依賴圖推導「一次修改要改哪些既有元件」（`diffNodes`）與「測試要接哪些真實依賴、要幾個假物件」（`testNeeds`）。比較結論一律用它算，不手寫。
- `assets/js/engine/archsim.js`：steps.js 用的模擬狀態與 `view()`，把每一拍的方塊狀態（`active`、`changed`、`new`、`needed`、`mocked`、`broken`、`deploy`、`stale`、`ok`…）拍成 diagram.js 要的資料。
- `assets/css/diagram.css`：架構圖共用樣式，方塊狀態會在右上角顯示文字標籤（要改、新增、綁住、假的、停擺…），不只靠顏色。
- diagram.js 會自動產生：舞台頂端的圖例（只列主題用到的箭頭與顏色）；手機版黏在舞台頂端的比較摘要（各方案的 `stats` 並排）；「不同」標記（某個計數這一拍剛變動、多數方案一致而只有一個不同時，標出那個面板）。對照表的列加上 `better: 'low' | 'high'` 就會把數字畫成長條並標出最好、最差。
- 箭頭會被方塊遮住，安排 `cell` 時要避免箭頭從不相干的方塊後面穿過，否則會被誤讀成那個方塊的依賴。

### 每個主題共同的教學結構

- 畫面分成「輸入 → 處理 → 輸出」三段（共用 class `.flow` / `.flow-col`）。
- 一個事件拆成兩拍：先顯示正在判斷什麼，再顯示結果落到哪裡。
- 要比較的方案放在並排的面板裡同步前進（同一拍一起動），不是依序播放；最後一個章節是對照表。
- `index.html` 的結構是 `.lesson-intro`（要解決的問題＋看動畫時留意什麼）→ `#player-root` → `.lesson-summary`（重點整理）。
- 範例資料是刻意設計來凸顯差異的，而且各種計數、歸屬都由程式模擬算出，不手寫。

### 樣式分層

- `assets/css/tokens.css`：顏色、間距、圓角變數（Bootstrap 風格命名、深色主題）。色值與尺寸一律引用這些變數。
- `assets/css/base.css`：全站共用，包含播放器外殼、`.chip`、`.delta`、`.flow`、`.topic-page-wide`、教學文字區塊。`.stage` 用 `order: 1` 排在說明文字與控制列之後。
- `topics/<主題>/style.css`：主題專屬樣式，class 一律加主題前綴（`lb-`、`sj-`、`sh-`、`cs-`、`ch-`、`mq-`；架構比較主題用 `ar-`、`ui-`、`dp-`、`cq-` 作為頁面 class，共用架構圖用 `dg-`）。
- 手機版斷點是 `max-width: 760px`。並排的面板在手機上仍維持並排（或改成面板直排、面板內橫排），做法是縮小字與格子；放不下的文字同時輸出長短兩版，用 `*-wide` / `*-narrow` class 切換。390px 寬時頁面與舞台都不可橫向捲動。

### 其他目錄

- `docs/` 下的兩支 mp4 是視覺風格與節奏的參考影片（已被 `.gitignore` 排除），`docs/superpowers/` 是最初的規格與實作計畫。
- `design-system/clarity/` 是另一套獨立的設計系統檔案，目前網站沒有套用。

## 慣例

- 文字與註解用繁體中文，技術名詞保留英文；註解寫「為什麼」（教學上的理由），不寫「做了什麼」。
- 新增主題：在 `topics/<名稱>/` 建立 `index.html`、`steps.js`、`render.js`、`style.css`，並在首頁 `index.html` 加一張卡片。
