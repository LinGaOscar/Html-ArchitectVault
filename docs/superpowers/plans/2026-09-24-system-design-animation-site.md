# 系統設計動畫參考站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個純靜態網站，用可播放/暫停/單步/拖曳時間軸的互動動畫，示範 5 個系統設計與 CS 基礎主題（SQL Joins、Stack vs Heap、Load Balancer、Cache 讀寫策略、Consistent Hashing）。

**Architecture:** 共用一個「資料驅動」動畫引擎——每個主題只提供 `steps.js`（陣列，每個元素是一個畫面快照）與 `render.js`（純函式，依快照畫出畫面），共用的 `player.js` 負責播放/暫停/單步/拖曳時間軸的 UI 與狀態機，`render-loop.js` 負責用 View Transitions API 讓換畫面有補間效果。

**Tech Stack:** 純 HTML/CSS/JS（ES modules），無 build 工具、無後端、無資料庫。本機開發用 `python3 -m http.server` 起靜態伺服器。

**Spec:** `docs/superpowers/specs/2026-09-24-system-design-animation-site-design.md`

## Global Constraints

- 純靜態 HTML/CSS/JS，不用 build 工具，沒有後端、沒有資料庫（spec 技術路線）
- 介面文字與動畫旁白一律繁體中文，技術名詞保留英文（spec 語言）
- 主題頁一律用 `<script type="module">`；ES module 在 `file://` 協定下會被瀏覽器 CORS 政策擋下，因此每次手動驗證前都要先在 repo 根目錄跑 `python3 -m http.server 8000`（一次性靜態伺服器，非後端）
- 視覺 token 深色主題（色值見 Task 1），沿用 `~/.claude/guides/templates/tokens.css` 的 spacer 階層／圓角三階／box-shadow 命名結構
- 播放器只做播放/暫停/單步/拖曳時間軸，不做「切換情境參數」；跨步驟過場一律用 `document.startViewTransition(() => render(step, stage))`，偵測不到就直接呼叫 `render(step, stage)`
- **無自動化測試框架（spec 明確決定）**：本計畫每個任務的「驗證」步驟一律是「起本機靜態伺服器 → 瀏覽器實際操作 → 對照具體預期畫面/行為」，不是自動化測試指令。這是刻意的、spec 已核准的設計，不是省略測試。
- 資料契約全站統一：
  - `steps.js` 匯出 `steps`：`Array<{ id: string, caption: string, duration: number, data: object }>`
  - `render.js` 匯出 `render(step, stage)`：純函式，`stage` 是 DOM 節點，函式把 `step.data` 畫成 HTML 字串塞進 `stage.innerHTML`
  - 主題頁的 `<script type="module">` 一律呼叫 `initPlayer({ steps, render, mount: document.getElementById('player-root') })`

---

### Task 1: 首頁骨架與共用樣式

**Files:**
- Create: `assets/css/tokens.css`
- Create: `assets/css/base.css`
- Create: `index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: 無（第一個任務）
- Produces: CSS 變數（`--bs-body-bg`、`--bs-primary`、`--bs-secondary-bg`、`--bs-border-color`、`--bs-warning`、`--bs-danger`、`--bs-info`、`--bs-success`、`--bs-font-monospace`、`--bs-font-sans-serif`、`--bs-spacer-0`~`5`、`--bs-border-radius(-sm/-lg)`）供之後所有任務的 CSS 使用；共用 class（`.player`、`.stage`、`.caption`、`.transport`、`.scrubber`、`.grid-table`、`.row-highlight`、`.row-null`、`.mem-frame`、`.mem-frame-active`、`.mem-row`、`.mem-heap-block`、`.node`、`.node-active`）供各主題 `render.js` 產生的 HTML 使用

- [ ] **Step 1: 建立 `assets/css/tokens.css`**

```css
/*
 * 視覺設計 Token。變數命名比照 ~/.claude/guides/templates/tokens.css 的
 * Bootstrap 風格命名，但色值改為深色主題——呼應參考影片的深色終端機風格。
 */
:root {
  --bs-body-bg: #0B0F17;
  --bs-body-color: #E6EDF7;
  --bs-secondary-color: #8B98AD;
  --bs-border-color: #232B3A;

  --bs-secondary-bg: #121826;
  --bs-tertiary-bg: #1A2233;

  --bs-primary: #4EE0C1;
  --bs-info: #5B9DF0;
  --bs-success: #4EE0C1;
  --bs-warning: #E0B24E;
  --bs-danger: #E06B5B;

  --bs-border-radius-sm: 4px;
  --bs-border-radius: 8px;
  --bs-border-radius-lg: 12px;

  --bs-box-shadow: none;
  --bs-box-shadow-sm: 0 1px 2px rgba(0, 0, 0, .05);

  --bs-font-sans-serif: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --bs-font-monospace: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --bs-spacer: 1rem;
  --bs-spacer-0: 0;
  --bs-spacer-1: .25rem;
  --bs-spacer-2: .5rem;
  --bs-spacer-3: 1rem;
  --bs-spacer-4: 1.5rem;
  --bs-spacer-5: 3rem;
}
```

- [ ] **Step 2: 建立 `assets/css/base.css`**

```css
/* 全站共用樣式：只寫語意化樣式，色值/尺寸一律引用 tokens.css 的變數。 */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  font-family: var(--bs-font-sans-serif);
  line-height: 1.6;
}

a { color: var(--bs-info); }

/* 首頁：分類卡片牆 */
.page { max-width: 960px; margin: 0 auto; padding: var(--bs-spacer-4); }
.page-title { font-size: 1.75rem; margin-bottom: var(--bs-spacer-2); }
.page-subtitle { color: var(--bs-secondary-color); margin-bottom: var(--bs-spacer-4); }

.topic-section { margin-bottom: var(--bs-spacer-5); }
.topic-section h2 {
  font-size: 1.1rem;
  color: var(--bs-secondary-color);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-bottom: var(--bs-spacer-3);
}
.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--bs-spacer-3);
}
.topic-card {
  display: block;
  padding: var(--bs-spacer-3);
  background: var(--bs-secondary-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  color: inherit;
  text-decoration: none;
  transition: border-color .15s ease, background .15s ease;
}
.topic-card:hover {
  border-color: var(--bs-primary);
  background: var(--bs-tertiary-bg);
}
.topic-card h3 { margin: 0 0 var(--bs-spacer-1); font-size: 1rem; color: var(--bs-primary); }
.topic-card p { margin: 0; font-size: .875rem; color: var(--bs-secondary-color); }

/* 主題頁外殼 */
.topic-page { max-width: 720px; margin: 0 auto; padding: var(--bs-spacer-4); }
.topic-page .back-link { display: inline-block; margin-bottom: var(--bs-spacer-3); font-size: .875rem; }
.topic-page h1 { font-size: 1.5rem; margin-bottom: var(--bs-spacer-4); }

/* 共用播放器（由 assets/js/engine/player.js 注入到 mount 節點內） */
.player { display: flex; flex-direction: column; gap: var(--bs-spacer-3); }
.stage {
  min-height: 320px;
  padding: var(--bs-spacer-3);
  background: var(--bs-secondary-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  font-family: var(--bs-font-monospace);
  font-size: .875rem;
  overflow-x: auto;
}
.stage h3, .stage p { font-family: var(--bs-font-sans-serif); }
.caption { min-height: 2.5em; margin: 0; color: var(--bs-body-color); }
.transport { display: flex; align-items: center; gap: var(--bs-spacer-2); }
.transport button {
  background: var(--bs-tertiary-bg);
  color: var(--bs-body-color);
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius-sm);
  padding: var(--bs-spacer-1) var(--bs-spacer-2);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.transport button:hover { border-color: var(--bs-primary); }
.transport .scrubber { flex: 1; accent-color: var(--bs-primary); }

/* Stage 內容共用元件（各主題 render.js 會用到） */
.grid-table { border-collapse: collapse; width: 100%; }
.grid-table caption { text-align: left; color: var(--bs-secondary-color); margin-bottom: var(--bs-spacer-1); font-family: var(--bs-font-sans-serif); }
.grid-table th, .grid-table td { border: 1px solid var(--bs-border-color); padding: var(--bs-spacer-1) var(--bs-spacer-2); text-align: left; }
.grid-table th { color: var(--bs-secondary-color); font-weight: normal; }

.row-highlight { background: color-mix(in srgb, var(--bs-primary) 25%, transparent); }
.row-null { color: var(--bs-secondary-color); font-style: italic; }

.mem-frame {
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius-sm);
  padding: var(--bs-spacer-2);
  margin-bottom: var(--bs-spacer-2);
  background: var(--bs-tertiary-bg);
}
.mem-frame-active { border-color: var(--bs-primary); }
.mem-row { display: flex; justify-content: space-between; gap: var(--bs-spacer-2); padding: 2px 0; }
.mem-heap-block {
  display: inline-block;
  padding: var(--bs-spacer-1) var(--bs-spacer-2);
  border: 1px solid var(--bs-warning);
  border-radius: var(--bs-border-radius-sm);
  background: color-mix(in srgb, var(--bs-warning) 15%, transparent);
  margin: 2px;
}

.node {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 48px;
  padding: 0 var(--bs-spacer-2);
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius-sm);
  background: var(--bs-tertiary-bg);
  text-align: center;
}
.node-active { border-color: var(--bs-primary); }
```

- [ ] **Step 3: 建立 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>系統設計動畫參考站</title>
  <link rel="stylesheet" href="./assets/css/tokens.css">
  <link rel="stylesheet" href="./assets/css/base.css">
</head>
<body>
  <main class="page">
    <h1 class="page-title">系統設計動畫參考站</h1>
    <p class="page-subtitle">給系統架構師的互動動畫參考，播放、暫停、單步、拖曳時間軸，逐步看懂每個概念。</p>

    <section class="topic-section">
      <h2>基礎篇</h2>
      <div class="topic-grid">
        <a class="topic-card" href="./topics/sql-joins/">
          <h3>SQL Joins</h3>
          <p>INNER / LEFT / RIGHT / FULL OUTER JOIN 逐步套用</p>
        </a>
        <a class="topic-card" href="./topics/stack-vs-heap/">
          <h3>Stack vs Heap</h3>
          <p>函式呼叫時堆疊與堆積的記憶體配置過程</p>
        </a>
      </div>
    </section>

    <section class="topic-section">
      <h2>系統設計篇</h2>
      <div class="topic-grid">
        <a class="topic-card" href="./topics/load-balancer/">
          <h3>Load Balancer</h3>
          <p>Round Robin / Least Connections 兩種分配演算法</p>
        </a>
        <a class="topic-card" href="./topics/cache-strategies/">
          <h3>Cache 讀寫策略</h3>
          <p>Cache-Aside / Write-Through / Write-Back</p>
        </a>
        <a class="topic-card" href="./topics/consistent-hashing/">
          <h3>Consistent Hashing</h3>
          <p>一致性雜湊環，新增/移除節點只影響鄰近區段</p>
        </a>
      </div>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 4: 手動瀏覽器驗證**

在 repo 根目錄執行 `python3 -m http.server 8000`，開啟 `http://localhost:8000/`：
- 預期：深色背景（近黑）、標題與說明文字可讀、「基礎篇」「系統設計篇」兩個分類各自顯示卡片
- 預期：滑鼠移到卡片上時邊框變成青綠色（`--bs-primary`）
- 這個階段點卡片連結會 404（`topics/` 資料夾還沒建立），這是預期中的暫時狀態，不算失敗
- 打開瀏覽器 DevTools console，確認沒有紅字錯誤（CSS 檔案路徑錯誤會在 Network 分頁顯示 404）

- [ ] **Step 5: Commit**

```bash
git add assets/css/tokens.css assets/css/base.css index.html
git commit -m "新增首頁骨架與共用視覺樣式"
```

---

### Task 2: 動畫引擎 + SQL Joins 主題

**Files:**
- Create: `assets/js/engine/render-loop.js`
- Create: `assets/js/engine/player.js`
- Create: `topics/sql-joins/steps.js`
- Create: `topics/sql-joins/render.js`
- Create: `topics/sql-joins/index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: Task 1 的 `assets/css/tokens.css`、`assets/css/base.css`（`.player`/`.stage`/`.caption`/`.transport`/`.scrubber`/`.grid-table`/`.row-highlight`/`.row-null`）
- Produces:
  - `renderStep(step, stage, render)`（`render-loop.js`）：之後 `player.js` 用它換畫面
  - `initPlayer({ steps, render, mount })`（`player.js`）：之後每個主題的 `index.html` 都呼叫這個函式啟動播放器
  - `steps`（`topics/sql-joins/steps.js`）、`render(step, stage)`（`topics/sql-joins/render.js`）：本任務內部使用，之後任務不依賴

- [ ] **Step 1: 建立 `assets/js/engine/render-loop.js`**

```js
// 用瀏覽器原生 View Transitions API 讓換畫面時有補間效果；
// 不支援的瀏覽器（沒有 startViewTransition）就直接切換，不影響功能正確性。
export function renderStep(step, stage, render) {
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => render(step, stage));
  } else {
    render(step, stage);
  }
}
```

- [ ] **Step 2: 建立 `assets/js/engine/player.js`**

```js
import { renderStep } from './render-loop.js';

// 建立共用播放器：把控制列 UI 整個注入 mount 節點，並依 steps 陣列驅動 render()。
// steps: Array<{ id, caption, duration, data }>
// render: (step, stageElement) => void
// mount: HTMLElement，播放器 UI 會整個掛在這個節點底下
export function initPlayer({ steps, render, mount }) {
  mount.innerHTML = `
    <div class="player">
      <div class="stage" id="stage"></div>
      <p class="caption" id="caption" aria-live="polite"></p>
      <div class="transport">
        <button type="button" data-action="prev" aria-label="上一步">⏮</button>
        <button type="button" data-action="play-pause" aria-label="播放">▶</button>
        <button type="button" data-action="next" aria-label="下一步">⏭</button>
        <input type="range" class="scrubber" min="0" max="${steps.length - 1}" value="0" aria-label="時間軸">
      </div>
    </div>
  `;

  const stageEl = mount.querySelector('#stage');
  const captionEl = mount.querySelector('#caption');
  const playPauseBtn = mount.querySelector('[data-action="play-pause"]');
  const prevBtn = mount.querySelector('[data-action="prev"]');
  const nextBtn = mount.querySelector('[data-action="next"]');
  const scrubberEl = mount.querySelector('.scrubber');

  let currentIndex = 0;
  let playing = false;
  let timerId = null;

  function goTo(index) {
    currentIndex = Math.min(Math.max(index, 0), steps.length - 1);
    const step = steps[currentIndex];
    renderStep(step, stageEl, render);
    captionEl.textContent = step.caption;
    scrubberEl.value = String(currentIndex);
  }

  function pause() {
    playing = false;
    playPauseBtn.textContent = '▶';
    playPauseBtn.setAttribute('aria-label', '播放');
    clearTimeout(timerId);
  }

  function scheduleNext() {
    clearTimeout(timerId);
    const current = steps[currentIndex];
    timerId = setTimeout(() => {
      if (currentIndex >= steps.length - 1) {
        pause();
        return;
      }
      goTo(currentIndex + 1);
      scheduleNext();
    }, current.duration);
  }

  function play() {
    if (currentIndex >= steps.length - 1) return; // 已經在最後一步，沒有下一步可播
    playing = true;
    playPauseBtn.textContent = '⏸';
    playPauseBtn.setAttribute('aria-label', '暫停');
    scheduleNext();
  }

  playPauseBtn.addEventListener('click', () => {
    if (playing) pause();
    else play();
  });

  prevBtn.addEventListener('click', () => {
    pause();
    goTo(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    pause();
    goTo(currentIndex + 1);
  });

  scrubberEl.addEventListener('input', () => {
    pause();
    goTo(Number(scrubberEl.value));
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (playing) pause();
      else play();
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      pause();
      goTo(currentIndex - 1);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      pause();
      goTo(currentIndex + 1);
    }
  });

  goTo(0);
}
```

- [ ] **Step 3: 建立 `topics/sql-joins/steps.js`**

```js
// SQL Joins 動畫的資料與逐步狀態產生邏輯。
// 用同一份 users/orders 資料，依序示範 INNER / LEFT / RIGHT / FULL OUTER JOIN
// 的比對過程——四種 JOIN 共用同一段生成邏輯，避免手刻四份幾乎一樣的步驟。

const users = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Ben' },
  { id: 3, name: 'Cleo' },
  { id: 4, name: 'Dev' },
  { id: 5, name: 'Eva' },
];

const orders = [
  { id: 1, userId: 1, amount: 20 },
  { id: 2, userId: 2, amount: 35 },
  { id: 3, userId: 3, amount: 60 },
  { id: 4, userId: 3, amount: 99 },
  { id: 5, userId: 9, amount: 15 }, // 沒有對應的 user，示範 RIGHT/FULL 的孤兒列
];

// drive：以哪張表逐列掃描；includeUnmatchedDrive：驅動表掃到沒配對時要不要補 NULL 留在結果；
// includeUnmatchedOther：驅動表掃完後，另一張表裡完全沒被配對到的列要不要額外補上。
const JOIN_DEFS = {
  INNER: { drive: 'users', includeUnmatchedDrive: false, includeUnmatchedOther: false },
  LEFT: { drive: 'users', includeUnmatchedDrive: true, includeUnmatchedOther: false },
  RIGHT: { drive: 'orders', includeUnmatchedDrive: true, includeUnmatchedOther: false },
  FULL: { drive: 'users', includeUnmatchedDrive: true, includeUnmatchedOther: true },
};

export const JOIN_LABELS = {
  INNER: 'INNER JOIN',
  LEFT: 'LEFT JOIN',
  RIGHT: 'RIGHT JOIN',
  FULL: 'FULL OUTER JOIN',
};

function driveLabel(drive, row) {
  return drive === 'users' ? `users #${row.id}(${row.name})` : `orders #${row.id}`;
}

function buildJoinSteps(joinType) {
  const def = JOIN_DEFS[joinType];
  const driveRows = def.drive === 'users' ? users : orders;
  const otherRows = def.drive === 'users' ? orders : users;
  const resultRows = [];
  const matchedOtherIds = new Set();
  const steps = [];

  driveRows.forEach((driveRow) => {
    const matches = otherRows.filter((otherRow) =>
      def.drive === 'users' ? otherRow.userId === driveRow.id : driveRow.userId === otherRow.id
    );
    const highlightedUserIds = [];
    const highlightedOrderIds = [];

    if (def.drive === 'users') {
      highlightedUserIds.push(driveRow.id);
      matches.forEach((m) => highlightedOrderIds.push(m.id));
    } else {
      highlightedOrderIds.push(driveRow.id);
      matches.forEach((m) => highlightedUserIds.push(m.id));
    }

    if (matches.length > 0) {
      matches.forEach((m) => {
        matchedOtherIds.add(m.id);
        resultRows.push(
          def.drive === 'users'
            ? { userId: driveRow.id, userName: driveRow.name, orderId: m.id, amount: m.amount }
            : { userId: m.id, userName: m.name, orderId: driveRow.id, amount: driveRow.amount }
        );
      });
    } else if (def.includeUnmatchedDrive) {
      resultRows.push(
        def.drive === 'users'
          ? { userId: driveRow.id, userName: driveRow.name, orderId: null, amount: null }
          : { userId: null, userName: null, orderId: driveRow.id, amount: driveRow.amount }
      );
    }

    steps.push({
      id: `${joinType}-row-${driveRow.id}`,
      caption: matches.length > 0
        ? `${driveLabel(def.drive, driveRow)} 找到 ${matches.length} 筆配對，加入結果，目前 ${resultRows.length} 列`
        : def.includeUnmatchedDrive
          ? `${driveLabel(def.drive, driveRow)} 沒有配對，補上 NULL，目前 ${resultRows.length} 列`
          : `${driveLabel(def.drive, driveRow)} 沒有配對，${JOIN_LABELS[joinType]} 略過此列`,
      duration: 1400,
      data: { joinType, highlightedUserIds, highlightedOrderIds, resultRows: resultRows.slice() },
    });
  });

  if (def.includeUnmatchedOther) {
    otherRows
      .filter((o) => !matchedOtherIds.has(o.id))
      .forEach((o) => {
        resultRows.push({ userId: null, userName: null, orderId: o.id, amount: o.amount });
        steps.push({
          id: `${joinType}-unmatched-${o.id}`,
          caption: `orders #${o.id} 沒有配對的 user，補上 NULL，目前 ${resultRows.length} 列`,
          duration: 1400,
          data: { joinType, highlightedUserIds: [], highlightedOrderIds: [o.id], resultRows: resultRows.slice() },
        });
      });
  }

  steps.push({
    id: `${joinType}-done`,
    caption: `${JOIN_LABELS[joinType]} 完成，共 ${resultRows.length} 列`,
    duration: 2200,
    data: { joinType, highlightedUserIds: [], highlightedOrderIds: [], resultRows: resultRows.slice() },
  });

  return steps;
}

export const dataset = { users, orders };
export const steps = [
  ...buildJoinSteps('INNER'),
  ...buildJoinSteps('LEFT'),
  ...buildJoinSteps('RIGHT'),
  ...buildJoinSteps('FULL'),
];
```

- [ ] **Step 4: 建立 `topics/sql-joins/render.js`**

```js
import { dataset, JOIN_LABELS } from './steps.js';

function formatCell(value) {
  return value === null || value === undefined ? 'NULL' : String(value);
}

function renderSourceTable(title, rows, highlightedIds, columns) {
  const head = columns.map((col) => `<th>${col}</th>`).join('');
  const body = rows
    .map((row) => {
      const isHighlighted = highlightedIds.includes(row.id);
      const cells = columns.map((col) => `<td>${formatCell(row[col])}</td>`).join('');
      return `<tr class="${isHighlighted ? 'row-highlight' : ''}">${cells}</tr>`;
    })
    .join('');
  return `
    <table class="grid-table">
      <caption>${title}</caption>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderResultTable(resultRows) {
  const body = resultRows
    .map((row) => {
      const isNullRow = row.userId === null || row.orderId === null;
      return `<tr class="${isNullRow ? 'row-null' : ''}">
        <td>${formatCell(row.userId)}</td>
        <td>${formatCell(row.userName)}</td>
        <td>${formatCell(row.orderId)}</td>
        <td>${formatCell(row.amount)}</td>
      </tr>`;
    })
    .join('');
  return `
    <table class="grid-table">
      <caption>RESULT（${resultRows.length} 列）</caption>
      <thead><tr><th>user_id</th><th>name</th><th>order_id</th><th>amount</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

export function render(step, stage) {
  const { joinType, highlightedUserIds, highlightedOrderIds, resultRows } = step.data;
  const { users, orders } = dataset;

  stage.innerHTML = `
    <h3 style="margin-top:0">${JOIN_LABELS[joinType]}</h3>
    <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      ${renderSourceTable('users', users, highlightedUserIds, ['id', 'name'])}
      ${renderSourceTable('orders', orders, highlightedOrderIds, ['id', 'userId', 'amount'])}
    </div>
    ${renderResultTable(resultRows)}
  `;
}
```

- [ ] **Step 5: 建立 `topics/sql-joins/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SQL Joins - 系統設計動畫參考站</title>
  <link rel="stylesheet" href="../../assets/css/tokens.css">
  <link rel="stylesheet" href="../../assets/css/base.css">
</head>
<body>
  <main class="topic-page">
    <a class="back-link" href="../../index.html">← 返回首頁</a>
    <h1>SQL Joins</h1>
    <div id="player-root"></div>
  </main>
  <script type="module">
    import { initPlayer } from '../../assets/js/engine/player.js';
    import { steps } from './steps.js';
    import { render } from './render.js';
    initPlayer({ steps, render, mount: document.getElementById('player-root') });
  </script>
</body>
</html>
```

- [ ] **Step 6: 手動瀏覽器驗證**

`python3 -m http.server 8000`，開啟 `http://localhost:8000/topics/sql-joins/`：
- 預期：畫面顯示 users、orders 兩張來源表與一張 RESULT 表，標題顯示「INNER JOIN」
- 點「▶ 播放」：畫面依序推進，每次 users 或 orders 表格對應的列會被高亮（青綠底色），RESULT 表列數跟著增加，caption 文字跟畫面同步
- 用拖曳時間軸跳到 LEFT JOIN 區段（約第 6 步之後）：RESULT 表要出現 `NULL` 列（斜體字），對應 Dev、Eva 兩個沒有訂單的 user
- 拖到 RIGHT JOIN 區段：RESULT 表要出現一列 `user_id=NULL`（對應孤兒訂單 order #5）
- 拖到 FULL OUTER JOIN 最後一步：caption 顯示「共 7 列」，RESULT 表確實有 7 列
- 按左右方向鍵、空白鍵確認單步與播放/暫停正常
- DevTools console 無錯誤

- [ ] **Step 7: Commit**

```bash
git add assets/js/engine/render-loop.js assets/js/engine/player.js topics/sql-joins
git commit -m "新增動畫引擎與 SQL Joins 主題"
```

---

### Task 3: Stack vs Heap 主題

**Files:**
- Create: `topics/stack-vs-heap/steps.js`
- Create: `topics/stack-vs-heap/render.js`
- Create: `topics/stack-vs-heap/index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: `initPlayer` from `../../assets/js/engine/player.js`（Task 2）；`.mem-frame`/`.mem-frame-active`/`.mem-row`/`.mem-heap-block`（Task 1 的 `base.css`）
- Produces: 本任務內部使用，之後任務不依賴

- [ ] **Step 1: 建立 `topics/stack-vs-heap/steps.js`**

```js
// Stack vs Heap 動畫：一段 main → handle → load/decode/unpack → free 的呼叫序列，
// 每一步直接給出當下完整的 stack（陣列，索引 0 是最先呼叫的 main）與 heap 快照。
// 敘事只有一條線、不重複，所以直接手刻每一步的快照，不建生成邏輯。

export const steps = [
  {
    id: 'call-main',
    caption: 'main() 開始執行，堆疊多了一層 main 的呼叫框。',
    duration: 1600,
    data: { stack: [{ name: 'main', locals: [] }], heap: [] },
  },
  {
    id: 'call-handle',
    caption: 'main 呼叫 handle(request)，堆疊再疊一層。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
      ],
      heap: [],
    },
  },
  {
    id: 'call-load',
    caption: 'handle 呼叫 load(request)。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
        { name: 'load', locals: [{ name: 'request', value: '88' }] },
      ],
      heap: [],
    },
  },
  {
    id: 'malloc-photo',
    caption: 'load 呼叫 malloc(4MB) 要一塊 heap 空間，photo 這個區域變數指向它。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
        { name: 'load', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'return-load',
    caption: 'load 執行完畢，return——它那層堆疊框自己消失，但 photo 指向的 heap 區塊還在。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'call-decode',
    caption: 'handle 呼叫 decode(photo)。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'decode', locals: [{ name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'malloc-rows',
    caption: 'decode 呼叫 malloc(2MB) 給 rows。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'decode', locals: [{ name: 'photo', value: '→ photo (heap)' }, { name: 'rows', value: '→ rows (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
      ],
    },
  },
  {
    id: 'malloc-pixels',
    caption: 'decode 再呼叫 malloc(4MB) 給 pixels。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        {
          name: 'decode',
          locals: [
            { name: 'photo', value: '→ photo (heap)' },
            { name: 'rows', value: '→ rows (heap)' },
            { name: 'pixels', value: '→ pixels (heap)' },
          ],
        },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-decode',
    caption: 'decode 執行完畢，它的堆疊框消失，但 rows、pixels 兩塊 heap 都還留著。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'call-unpack',
    caption: 'handle 呼叫 unpack(rows)，unpack 這層是全新的堆疊框，有自己的區域變數。',
    duration: 2200,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'unpack', locals: [{ name: 'width', value: '1920' }, { name: 'height', value: '1080' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-unpack',
    caption: 'unpack 執行完畢，堆疊框消失。',
    duration: 1800,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-handle',
    caption: 'handle 執行完畢，回到 main，順便把三個指標交回來。三塊 heap 空間沒有人主動釋放，繼續留著。',
    duration: 2200,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-photo',
    caption: 'main 呼叫 free(photo)，這塊 heap 才真正釋放。',
    duration: 2000,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-rows',
    caption: 'main 呼叫 free(rows)。',
    duration: 1800,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-pixels',
    caption: 'main 呼叫 free(pixels)，三塊 heap 空間全部釋放完畢。',
    duration: 2000,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: true },
      ],
    },
  },
  {
    id: 'return-main',
    caption: 'main 執行完畢：堆疊在呼叫結束時自動清空；heap 要靠你自己 free() 才會清空。',
    duration: 2600,
    data: {
      stack: [],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: true },
      ],
    },
  },
];
```

- [ ] **Step 2: 建立 `topics/stack-vs-heap/render.js`**

```js
function renderStackFrame(frame, isTop) {
  const locals = frame.locals
    .map((l) => `<div class="mem-row"><span>${l.name}</span><span>${l.value}</span></div>`)
    .join('');
  return `<div class="mem-frame ${isTop ? 'mem-frame-active' : ''}">
    <strong>${frame.name}()</strong>
    ${locals || '<div class="mem-row"><span style="opacity:.6">（無區域變數）</span></div>'}
  </div>`;
}

function renderHeapBlock(block) {
  const style = block.freed ? 'opacity:.35; text-decoration: line-through;' : '';
  return `<span class="mem-heap-block" style="${style}">${block.label} (${block.size})${block.freed ? ' freed' : ''}</span>`;
}

export function render(step, stage) {
  const { stack, heap } = step.data;
  const framesTopFirst = stack.slice().reverse();
  stage.innerHTML = `
    <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">
        <h3 style="margin-top:0">THE STACK（呼叫結束就自動清空）</h3>
        ${framesTopFirst.length ? framesTopFirst.map((f, i) => renderStackFrame(f, i === 0)).join('') : '<p style="opacity:.6">（空）</p>'}
      </div>
      <div style="flex:1; min-width:220px;">
        <h3 style="margin-top:0">THE HEAP（要 free() 才清空）</h3>
        ${heap.length ? heap.map(renderHeapBlock).join('') : '<p style="opacity:.6">（空）</p>'}
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: 建立 `topics/stack-vs-heap/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stack vs Heap - 系統設計動畫參考站</title>
  <link rel="stylesheet" href="../../assets/css/tokens.css">
  <link rel="stylesheet" href="../../assets/css/base.css">
</head>
<body>
  <main class="topic-page">
    <a class="back-link" href="../../index.html">← 返回首頁</a>
    <h1>Stack vs Heap</h1>
    <div id="player-root"></div>
  </main>
  <script type="module">
    import { initPlayer } from '../../assets/js/engine/player.js';
    import { steps } from './steps.js';
    import { render } from './render.js';
    initPlayer({ steps, render, mount: document.getElementById('player-root') });
  </script>
</body>
</html>
```

- [ ] **Step 4: 手動瀏覽器驗證**

`python3 -m http.server 8000`，開啟 `http://localhost:8000/topics/stack-vs-heap/`：
- 預期：左邊 THE STACK、右邊 THE HEAP 兩欄
- 播放到 `malloc-photo`：THE STACK 出現 main/handle/load 三層，load 那層有 `photo` 指向 heap；THE HEAP 出現一塊 `photo (4 MB)`
- 播放到 `return-load`：THE STACK 的 load 那層消失（剩 main/handle 兩層），但 THE HEAP 的 photo 區塊還在（沒被劃掉）
- 播放到 `return-handle`：THE STACK 只剩 main 一層，THE HEAP 三塊都還在、都沒被劃掉
- 播放到 `free-photo`／`free-rows`／`free-pixels`：對應的 heap 區塊依序出現刪除線與「freed」字樣
- 播放到最後一步 `return-main`：THE STACK 顯示「（空）」，THE HEAP 三塊全部有刪除線
- DevTools console 無錯誤

- [ ] **Step 5: Commit**

```bash
git add topics/stack-vs-heap
git commit -m "新增 Stack vs Heap 主題"
```

---

### Task 4: Load Balancer 主題

**Files:**
- Create: `topics/load-balancer/steps.js`
- Create: `topics/load-balancer/render.js`
- Create: `topics/load-balancer/index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: `initPlayer` from `../../assets/js/engine/player.js`（Task 2）；`.node`/`.node-active`/`.mem-frame`/`.mem-row`（Task 1 的 `base.css`）
- Produces: 本任務內部使用，之後任務不依賴

- [ ] **Step 1: 建立 `topics/load-balancer/steps.js`**

```js
// Load Balancer 動畫：同一批請求，先示範 Round Robin，再示範 Least Connections，
// 對照兩種演算法在同樣的請求序列下，分配結果為什麼不一樣。

export const nodes = ['server-1', 'server-2', 'server-3'];

// holdSteps：這個請求會佔用連線幾個「請求到達」的時間點，只有 Least Connections 用得到，
// 用來讓「目前連線數最少」在不同時間點真的會指向不同節點。
const requests = [
  { id: 1, holdSteps: 3 },
  { id: 2, holdSteps: 1 },
  { id: 3, holdSteps: 2 },
  { id: 4, holdSteps: 4 },
  { id: 5, holdSteps: 1 },
  { id: 6, holdSteps: 2 },
  { id: 7, holdSteps: 3 },
  { id: 8, holdSteps: 1 },
];

function buildRoundRobinSteps() {
  const assigned = [];
  return requests.map((req, i) => {
    const chosenNode = nodes[i % nodes.length];
    assigned.push({ requestId: req.id, node: chosenNode });
    return {
      id: `rr-${req.id}`,
      caption: `Round Robin：請求 #${req.id} 依序輪到 ${chosenNode}`,
      duration: 1400,
      data: { algorithm: 'Round Robin', assigned: assigned.slice(), activeCounts: null },
    };
  });
}

function buildLeastConnectionsSteps() {
  const active = Object.fromEntries(nodes.map((n) => [n, 0]));
  const assignedAt = {};
  const assigned = [];
  const steps = [];
  let tick = 0;

  requests.forEach((req) => {
    tick += 1;
    // 先讓連線持續時間到期的請求釋放連線，再決定新請求分配給誰
    Object.keys(assignedAt).forEach((rid) => {
      const info = assignedAt[rid];
      if (!info.released && tick - info.tick >= info.holdSteps) {
        active[info.node] -= 1;
        info.released = true;
      }
    });

    const beforeActive = { ...active }; // 分配前的連線數快照，caption 說明「為什麼選這個節點」要用這份，不能用分配後的

    let chosenNode = nodes[0];
    nodes.forEach((n) => {
      if (active[n] < active[chosenNode]) chosenNode = n;
    });
    active[chosenNode] += 1;
    assignedAt[req.id] = { node: chosenNode, tick, holdSteps: req.holdSteps, released: false };
    assigned.push({ requestId: req.id, node: chosenNode });

    steps.push({
      id: `lc-${req.id}`,
      caption: `Least Connections：請求 #${req.id} 分配給連線數最少的 ${chosenNode}（分配前各節點連線數：${nodes
        .map((n) => `${n}=${beforeActive[n]}`)
        .join(', ')}）`,
      duration: 1600,
      data: { algorithm: 'Least Connections', assigned: assigned.slice(), activeCounts: { ...active } },
    });
  });

  return steps;
}

export const steps = [...buildRoundRobinSteps(), ...buildLeastConnectionsSteps()];
```

- [ ] **Step 2: 建立 `topics/load-balancer/render.js`**

```js
import { nodes } from './steps.js';

function countByNode(assigned) {
  const counts = Object.fromEntries(nodes.map((n) => [n, 0]));
  assigned.forEach((a) => { counts[a.node] += 1; });
  return counts;
}

export function render(step, stage) {
  const { algorithm, assigned, activeCounts } = step.data;
  const totalCounts = countByNode(assigned);
  const last = assigned[assigned.length - 1];

  const nodesHtml = nodes
    .map((n) => {
      const isTarget = last && last.node === n;
      const label = activeCounts ? `目前連線 ${activeCounts[n]}` : `累計分配 ${totalCounts[n]}`;
      return `<div class="node ${isTarget ? 'node-active' : ''}">
        <div>
          <div>${n}</div>
          <div style="font-size:.75rem; opacity:.75;">${label}</div>
        </div>
      </div>`;
    })
    .join('');

  const logHtml = assigned
    .slice(-6)
    .map((a) => `<div class="mem-row"><span>請求 #${a.requestId}</span><span>→ ${a.node}</span></div>`)
    .join('');

  stage.innerHTML = `
    <h3 style="margin-top:0">${algorithm}</h3>
    <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">${nodesHtml}</div>
    <div class="mem-frame">
      <strong>最近分配紀錄</strong>
      ${logHtml}
    </div>
  `;
}
```

- [ ] **Step 3: 建立 `topics/load-balancer/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Load Balancer - 系統設計動畫參考站</title>
  <link rel="stylesheet" href="../../assets/css/tokens.css">
  <link rel="stylesheet" href="../../assets/css/base.css">
</head>
<body>
  <main class="topic-page">
    <a class="back-link" href="../../index.html">← 返回首頁</a>
    <h1>Load Balancer</h1>
    <div id="player-root"></div>
  </main>
  <script type="module">
    import { initPlayer } from '../../assets/js/engine/player.js';
    import { steps } from './steps.js';
    import { render } from './render.js';
    initPlayer({ steps, render, mount: document.getElementById('player-root') });
  </script>
</body>
</html>
```

- [ ] **Step 4: 手動瀏覽器驗證**

`python3 -m http.server 8000`，開啟 `http://localhost:8000/topics/load-balancer/`：
- 預期：一開始標題「Round Robin」，三個節點方塊橫排
- 播放前 3 步：請求 #1→server-1、#2→server-2、#3→server-3，依序輪替，剛分配到的節點方塊邊框變青綠色
- 拖曳時間軸到「Least Connections」區段開頭：標題變成「Least Connections」，節點顯示「目前連線 0」
- 繼續播放：caption 裡的「目前各節點連線數」數字要跟著請求到達/結束變化，且新請求應分配到連線數最少的節點（可對照 caption 文字核對）
- 「最近分配紀錄」面板顯示最近 6 筆請求→節點的對應
- DevTools console 無錯誤

- [ ] **Step 5: Commit**

```bash
git add topics/load-balancer
git commit -m "新增 Load Balancer 主題"
```

---

### Task 5: Cache 讀寫策略主題

**Files:**
- Create: `topics/cache-strategies/steps.js`
- Create: `topics/cache-strategies/render.js`
- Create: `topics/cache-strategies/index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: `initPlayer` from `../../assets/js/engine/player.js`（Task 2）；`.mem-frame`/`.mem-frame-active`/`.mem-row`（Task 1 的 `base.css`）
- Produces: 本任務內部使用，之後任務不依賴

- [ ] **Step 1: 建立 `topics/cache-strategies/steps.js`**

```js
// Cache 讀寫策略動畫：用同一個 key（user:42）分別示範
// Cache-Aside、Write-Through、Write-Back 三種策略下，Cache 與 DB 的狀態如何變化。
// 三段敘事彼此不同、不重複，直接手刻每一步。

export const steps = [
  // --- Cache-Aside ---
  {
    id: 'aside-1',
    caption: 'Cache-Aside：讀取 user:42，Cache 是空的，Cache Miss。',
    duration: 1800,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice' }, event: 'cache miss', highlight: 'cache' },
  },
  {
    id: 'aside-2',
    caption: 'Cache Miss 之後，應用程式自己去 DB 查詢，拿到 user:42 = "Alice"。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice' }, event: 'read from DB', highlight: 'db' },
  },
  {
    id: 'aside-3',
    caption: '應用程式把查到的值寫回 Cache，下次同樣的讀取就能命中。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice' }, event: 'fill cache', highlight: 'cache' },
  },
  {
    id: 'aside-4',
    caption: '再讀一次 user:42：這次 Cache Hit，不用查 DB。',
    duration: 1800,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice' }, event: 'cache hit', highlight: 'cache' },
  },
  {
    id: 'aside-5',
    caption: '寫入 user:42 = "Alice V2"：Cache-Aside 直接寫 DB，不碰 Cache。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice V2' }, event: 'write to DB', highlight: 'db' },
  },
  {
    id: 'aside-6',
    caption: '寫完 DB 後把 Cache 裡的舊值刪除（invalidate），避免下次讀到過期資料。',
    duration: 2200,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice V2' }, event: 'invalidate cache', highlight: 'cache' },
  },

  // --- Write-Through ---
  {
    id: 'through-1',
    caption: 'Write-Through：寫入 user:42 = "Bob"，Cache 與 DB 同一時間一起寫入。',
    duration: 2200,
    data: { strategy: 'Write-Through', cache: { value: 'Bob', dirty: false }, db: { value: 'Bob' }, event: 'write both', highlight: 'both' },
  },
  {
    id: 'through-2',
    caption: '讀取 user:42：Cache Hit，兩邊資料本來就一致。',
    duration: 1800,
    data: { strategy: 'Write-Through', cache: { value: 'Bob', dirty: false }, db: { value: 'Bob' }, event: 'cache hit', highlight: 'cache' },
  },

  // --- Write-Back ---
  {
    id: 'back-1',
    caption: 'Write-Back：寫入 user:42 = "Carol"，只先寫進 Cache，標記為 dirty（還沒同步到 DB）。',
    duration: 2200,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: true }, db: { value: 'Bob' }, event: 'write cache only', highlight: 'cache' },
  },
  {
    id: 'back-2',
    caption: '讀取 user:42：Cache Hit，拿到最新的 "Carol"，但這時候 DB 裡還是舊值 "Bob"。',
    duration: 2200,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: true }, db: { value: 'Bob' }, event: 'cache hit (DB stale)', highlight: 'cache' },
  },
  {
    id: 'back-3',
    caption: '背景排程觸發 flush：把 dirty 的資料寫回 DB，DB 更新為 "Carol"，Cache 標記回乾淨。',
    duration: 2400,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: false }, db: { value: 'Carol' }, event: 'flush to DB', highlight: 'db' },
  },
];
```

- [ ] **Step 2: 建立 `topics/cache-strategies/render.js`**

```js
function renderBox(title, content, isHighlighted) {
  return `<div class="mem-frame ${isHighlighted ? 'mem-frame-active' : ''}">
    <strong>${title}</strong>
    ${content}
  </div>`;
}

export function render(step, stage) {
  const { strategy, cache, db, event, highlight } = step.data;

  const cacheContent = cache
    ? `<div class="mem-row"><span>user:42</span><span>${cache.value}${cache.dirty ? ' (dirty)' : ''}</span></div>`
    : '<p style="opacity:.6; margin:0;">（空，Cache Miss）</p>';

  const dbContent = `<div class="mem-row"><span>user:42</span><span>${db.value}</span></div>`;

  stage.innerHTML = `
    <h3 style="margin-top:0">${strategy}</h3>
    <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
      ${renderBox('CACHE', cacheContent, highlight === 'cache' || highlight === 'both')}
      ${renderBox('DATABASE', dbContent, highlight === 'db' || highlight === 'both')}
    </div>
    <p style="margin-top:1rem; opacity:.75; font-family: var(--bs-font-sans-serif);">事件：${event}</p>
  `;
}
```

- [ ] **Step 3: 建立 `topics/cache-strategies/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cache 讀寫策略 - 系統設計動畫參考站</title>
  <link rel="stylesheet" href="../../assets/css/tokens.css">
  <link rel="stylesheet" href="../../assets/css/base.css">
</head>
<body>
  <main class="topic-page">
    <a class="back-link" href="../../index.html">← 返回首頁</a>
    <h1>Cache 讀寫策略</h1>
    <div id="player-root"></div>
  </main>
  <script type="module">
    import { initPlayer } from '../../assets/js/engine/player.js';
    import { steps } from './steps.js';
    import { render } from './render.js';
    initPlayer({ steps, render, mount: document.getElementById('player-root') });
  </script>
</body>
</html>
```

- [ ] **Step 4: 手動瀏覽器驗證**

`python3 -m http.server 8000`，開啟 `http://localhost:8000/topics/cache-strategies/`：
- 預期：CACHE、DATABASE 兩個面板並排，標題顯示「Cache-Aside」
- 第一步 CACHE 面板顯示「（空，Cache Miss）」
- 播放到 `aside-3`：CACHE 面板出現 `user:42 → Alice`，面板邊框變青綠（表示這步動作發生在 cache）
- 播放到 `aside-6`：CACHE 面板變回「（空，Cache Miss）」（invalidate 後）
- 拖到 Write-Back 區段（`back-1`）：CACHE 顯示 `Alice V2` 或 `Carol (dirty)` 字樣（依實際 value 顯示 dirty 標記），DATABASE 仍顯示舊值 `Bob`——兩邊值不一致
- 播放到 `back-3`：DATABASE 更新為 `Carol`，CACHE 的 `(dirty)` 標記消失
- DevTools console 無錯誤

- [ ] **Step 5: Commit**

```bash
git add topics/cache-strategies
git commit -m "新增 Cache 讀寫策略主題"
```

---

### Task 6: Consistent Hashing 主題

**Files:**
- Create: `topics/consistent-hashing/steps.js`
- Create: `topics/consistent-hashing/render.js`
- Create: `topics/consistent-hashing/index.html`
- Test: 手動瀏覽器驗證，無自動化測試檔案

**Interfaces:**
- Consumes: `initPlayer` from `../../assets/js/engine/player.js`（Task 2）；`--bs-primary`/`--bs-info`/`--bs-warning`/`--bs-border-color`/`--bs-body-color`/`--bs-secondary-color`（Task 1 的 `tokens.css`）
- Produces: 本任務內部使用，之後任務不依賴

- [ ] **Step 1: 建立 `topics/consistent-hashing/steps.js`**

```js
// 一致性雜湊環：用 0-359 度代表雜湊空間。這裡直接指定節點與 key 的位置，
// 不做真的雜湊運算——重點是示範「新增/移除節點只影響環上鄰近的一小段」，
// 用真實雜湊函式反而無法把位置設計得剛好展示這個效果。

const initialNodes = [
  { id: 'node-A', pos: 20 },
  { id: 'node-B', pos: 140 },
  { id: 'node-C', pos: 260 },
];

const keys = [
  { id: 'key-1', pos: 10 },
  { id: 'key-2', pos: 50 },
  { id: 'key-3', pos: 110 },
  { id: 'key-4', pos: 180 },
  { id: 'key-5', pos: 230 },
  { id: 'key-6', pos: 340 },
];

// 找 key 順時針方向遇到的第一個節點（超過最大位置的話繞回第一個節點）。
function assignKeys(nodeList, keyList) {
  const sorted = nodeList.slice().sort((a, b) => a.pos - b.pos);
  return keyList.map((key) => {
    const owner = sorted.find((n) => n.pos >= key.pos) || sorted[0];
    return { ...key, owner: owner.id };
  });
}

function diffOwners(before, after) {
  return after.filter((k) => {
    const prev = before.find((b) => b.id === k.id);
    return prev && prev.owner !== k.owner;
  });
}

const withNodeABC = assignKeys(initialNodes, keys);

const nodesWithD = [...initialNodes, { id: 'node-D', pos: 70 }];
const withNodeD = assignKeys(nodesWithD, keys);

const nodesAfterRemoveB = nodesWithD.filter((n) => n.id !== 'node-B');
const afterRemoveB = assignKeys(nodesAfterRemoveB, keys);

export const steps = [
  {
    id: 'initial',
    caption: '一致性雜湊環上有 3 個節點（A/B/C），每個 key 交給順時針方向第一個遇到的節點負責。',
    duration: 2400,
    data: { nodes: initialNodes, keys: withNodeABC, movedKeyIds: [] },
  },
  {
    id: 'add-d',
    caption: '新增 node-D（放在 70 度）。只有落在 node-D 與它前一個節點之間的 key 會換人負責，其他 key 完全不受影響。',
    duration: 2800,
    data: { nodes: nodesWithD, keys: withNodeD, movedKeyIds: diffOwners(withNodeABC, withNodeD).map((k) => k.id) },
  },
  {
    id: 'remove-b',
    caption: '移除 node-B。原本 node-B 負責的 key 全部轉給下一個順時針節點，其他 key 依然不受影響。',
    duration: 2800,
    data: { nodes: nodesAfterRemoveB, keys: afterRemoveB, movedKeyIds: diffOwners(withNodeD, afterRemoveB).map((k) => k.id) },
  },
];
```

- [ ] **Step 2: 建立 `topics/consistent-hashing/render.js`**

```js
const RADIUS = 120;
const CENTER = 160;

function pointOnCircle(pos) {
  const angle = (pos / 360) * 2 * Math.PI - Math.PI / 2; // 0 度對應正上方
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

export function render(step, stage) {
  const { nodes, keys, movedKeyIds } = step.data;

  const nodeMarks = nodes
    .map((n) => {
      const { x, y } = pointOnCircle(n.pos);
      return `
        <circle cx="${x}" cy="${y}" r="10" fill="var(--bs-primary)" />
        <text x="${x}" y="${y - 16}" text-anchor="middle" fill="var(--bs-body-color)" font-size="12">${n.id}</text>
      `;
    })
    .join('');

  const keyMarks = keys
    .map((k) => {
      const { x, y } = pointOnCircle(k.pos);
      const moved = movedKeyIds.includes(k.id);
      return `
        <circle cx="${x}" cy="${y}" r="5" fill="${moved ? 'var(--bs-warning)' : 'var(--bs-info)'}" />
        <text x="${x}" y="${y + 16}" text-anchor="middle" fill="var(--bs-secondary-color)" font-size="10">${k.id}→${k.owner}</text>
      `;
    })
    .join('');

  stage.innerHTML = `
    <svg viewBox="0 0 320 320" width="320" height="320" style="display:block; margin:0 auto;">
      <circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke="var(--bs-border-color)" stroke-width="2" />
      ${nodeMarks}
      ${keyMarks}
    </svg>
    <p style="text-align:center; font-family: var(--bs-font-sans-serif); color: var(--bs-secondary-color);">
      ${movedKeyIds.length > 0 ? `這次變動只影響：${movedKeyIds.join(', ')}` : '目前沒有 key 換過負責節點'}
    </p>
  `;
}
```

- [ ] **Step 3: 建立 `topics/consistent-hashing/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Consistent Hashing - 系統設計動畫參考站</title>
  <link rel="stylesheet" href="../../assets/css/tokens.css">
  <link rel="stylesheet" href="../../assets/css/base.css">
</head>
<body>
  <main class="topic-page">
    <a class="back-link" href="../../index.html">← 返回首頁</a>
    <h1>Consistent Hashing</h1>
    <div id="player-root"></div>
  </main>
  <script type="module">
    import { initPlayer } from '../../assets/js/engine/player.js';
    import { steps } from './steps.js';
    import { render } from './render.js';
    initPlayer({ steps, render, mount: document.getElementById('player-root') });
  </script>
</body>
</html>
```

這份資料的正確答案（用 `assignKeys`/`diffOwners` 邏輯手算過）：

| step | key-1 | key-2 | key-3 | key-4 | key-5 | key-6 | movedKeyIds |
|---|---|---|---|---|---|---|---|
| initial（A20/B140/C260） | A | B | B | C | C | A | [] |
| add-d（+D70） | A | **D** | B | C | C | A | [key-2] |
| remove-b（去掉 B） | A | D | **C** | C | C | A | [key-3] |

- [ ] **Step 4: 手動瀏覽器驗證**

`python3 -m http.server 8000`，開啟 `http://localhost:8000/topics/consistent-hashing/`：
- 預期：一個圓環 SVG，3 個大圓點（node-A/B/C）、6 個小圓點（key-1~6），下方文字「目前沒有 key 換過負責節點」
- 播放到 `add-d`：環上多一個 node-D，只有 key-2 變成橘色（`--bs-warning`）且標示轉給 node-D，其餘 5 個 key 仍是藍色且歸屬不變，下方文字顯示「這次變動只影響：key-2」
- 播放到 `remove-b`：node-B 消失，只有 key-3 變成橘色並標示轉給 node-C，其餘 key 不受影響，下方文字顯示「這次變動只影響：key-3」
- 對照上表逐一核對每一步每個 key 的 owner 文字（`key-N→owner`）是否正確
- DevTools console 無錯誤

- [ ] **Step 5: Commit**

```bash
git add topics/consistent-hashing
git commit -m "新增 Consistent Hashing 主題"
```

---

### Task 7: 整體驗收

**Files:**
- 無新增/修改檔案（純驗證任務）

**Interfaces:**
- Consumes: Task 1-6 的全部產出
- Produces: 無

- [ ] **Step 1: 派 fresh-context subagent 做整體驗收**

依 CLAUDE.md「驗證不自驗」原則，派一個沒有實作記憶的 subagent，用 chrome-devtools 實際操作並截圖驗收，而不是由寫程式的人自己驗。驗收指示：

> 在 repo 根目錄執行 `python3 -m http.server 8000`。依序打開這 6 個頁面並用 chrome-devtools 截圖（每個頁面截一張，共 6 張，若超過單輪 3 張上限請分兩輪）：
> `http://localhost:8000/`、`/topics/sql-joins/`、`/topics/stack-vs-heap/`、`/topics/load-balancer/`、`/topics/cache-strategies/`、`/topics/consistent-hashing/`。
> 對每個主題頁：點擊播放，確認畫面會隨時間推進；點暫停；拖曳時間軸到中間與最後一步，確認畫面正確對應；按左右方向鍵與空白鍵確認單步/播放暫停正常。
> 檢查每個頁面的 DevTools console 有無錯誤訊息。
> 回報：哪些頁面正常、哪些有問題（附截圖與 console 錯誤訊息），不要只用文字描述畫面內容。

- [ ] **Step 2: 依驗收結果處理**

若驗收發現問題：回到對應主題的任務檔案修正，重新驗證後才算完成。
若驗收全數通過：本計畫完成，依 CLAUDE.md Git Standards 走 commit/巡檢/推送流程（此計畫每個任務已個別 commit，這步不需要額外 commit）。
