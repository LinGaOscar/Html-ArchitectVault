# Clarity 設計系統

極簡、大量留白、產品為主角的視覺風格。純 CSS + 一支小 JS，不需要 React 或建置工具。

線上完整版（含每個元件的即時預覽）：Claude 裡的「Clarity」Design System artifact。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `tokens.css` | 顏色、間距、圓角、字體變數與文字樣式 class（`.hero` `.headline` `.title` `.subhead` `.body` `.caption`） |
| `tokens.json` | 同一份 token 的原始資料（給工具讀） |
| `clarity.css` | 元件樣式，class 一律 `cl-` 開頭 |
| `cursor-light.js` | 滑鼠光暈效果，作用在 `.cl-lit` 元素 |
| `demo.html` | 所有元件的示範頁，直接用瀏覽器打開 |

## 套用到頁面

```html
<link rel="stylesheet" href="/design-system/clarity/tokens.css">
<link rel="stylesheet" href="/design-system/clarity/clarity.css">
<script src="/design-system/clarity/cursor-light.js" defer></script>
```

路徑依頁面位置調整（例如 `topics/xxx/index.html` 用 `../../design-system/clarity/…`）。

主題：預設跟隨系統深淺色；`<html data-theme="light">` 或 `data-theme="dark"` 可強制指定。

## 設計規則

- **一段只講一件事**：一個大標、一句副標、最多兩個動作。
- **色彩**：中性色為主，`--surface-100` / `--surface-200` 交錯分段；藍色（`--action`、`--link`）只給可點擊的東西。
- **形狀**：按鈕一律膠囊（`--radius-pill`），卡片 `--radius-lg`。
- **不用陰影**：唯一的光影是跟隨滑鼠的光暈（`.cl-lit`），只給卡片、主圖這類表面用。
- **分段**靠背景色，不靠邊框；必要時才用 `--hairline` 細線。
- 寫新樣式時，色值與尺寸一律引用 token 變數，不寫死數值。

## 元件 markup

```html
<!-- Button：primary / secondary × md / sm；<a> 或 <button> 皆可 -->
<a class="cl-btn cl-btn-primary cl-btn-md" href="#">了解更多</a>
<a class="cl-btn cl-btn-secondary cl-btn-md" href="#">購買</a>

<!-- TextLink -->
<a class="cl-link" href="#">購買<span class="cl-link-chev" aria-hidden="true">›</span></a>

<!-- Badge -->
<span class="cl-badge">新品</span>

<!-- Card：cl-card-subtle / cl-card-plain / cl-card-inverse；cl-card-start 文字靠左；cl-lit 開啟光暈 -->
<article class="cl-card cl-card-subtle cl-lit">
  <p class="cl-card-eyebrow">新品</p>
  <h3 class="cl-card-title">標題</h3>
  <p class="cl-card-body">一句說明。</p>
  <div class="cl-card-actions">
    <a class="cl-btn cl-btn-primary cl-btn-sm" href="#">了解更多</a>
  </div>
</article>

<!-- Input：錯誤時外層加 cl-input-error，input 加 aria-invalid="true" -->
<div class="cl-input">
  <label class="cl-input-label" for="email">電子郵件</label>
  <input class="cl-input-field" id="email" aria-describedby="email-msg">
  <p class="cl-input-msg" id="email-msg">說明文字</p>
</div>

<!-- NavBar -->
<nav class="cl-nav" aria-label="主選單">
  <div class="cl-nav-inner">
    <a class="cl-nav-brand" href="#">名稱</a>
    <ul class="cl-nav-list">
      <li><a class="cl-nav-item is-active" aria-current="page" href="#">項目</a></li>
    </ul>
    <div class="cl-nav-actions"><a class="cl-btn cl-btn-primary cl-btn-sm" href="#">動作</a></div>
  </div>
</nav>

<!-- Hero：cl-hero-plain / cl-hero-subtle / cl-hero-inverse，相鄰區塊交錯使用 -->
<section class="cl-hero cl-hero-subtle">
  <p class="cl-hero-eyebrow">新品</p>
  <h1 class="cl-hero-title">大標</h1>
  <p class="cl-hero-sub">一句副標。</p>
  <div class="cl-hero-actions">
    <a class="cl-btn cl-btn-primary cl-btn-md" href="#">了解更多</a>
  </div>
</section>
```

## 注意

- `clarity.css` 會設定 `body` 的背景、文字色與字體；本站其他頁面目前使用 `assets/css/` 的深色終端機風格，兩套不要在同一頁混用。
