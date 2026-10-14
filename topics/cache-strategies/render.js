import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { KEY, strategies, compareRows } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// 每個面板各有兩個常駐的牌子：req 是往外送的請求（讀、寫、失效、flush），res 是回給 App 的結果。
// 它們在 App、Cache、DB 的空位之間飛，讀者才看得出同一個請求走了哪條路。
// 三種策略各佔一個面板、吃同一串操作、同步前進，同一拍的差異直接並排比。
let scene = null;

const SLOT = (name) => `<span class="cs-slotbox" data-slot="${name}"></span>`;

function panelHtml(strategy) {
  return `
    <article class="cs-panel">
      <h3 class="cs-title">${strategy.name}</h3>
      <p class="cs-rule">${strategy.rule}</p>
      <pre class="snippet cs-code">${strategy.code}</pre>
      <div class="cs-scene">
        <svg class="cs-wires" aria-hidden="true">
          <path class="cs-wire" data-wire="ac"></path>
          <path class="cs-wire" data-wire="cd"></path>
          <path class="cs-wire" data-wire="ad"></path>
        </svg>
        <div class="flow cs-flow">
          <section class="flow-col cs-col" data-col="app">
            <h4>輸入 <small>程式發出的操作</small></h4>
            <div class="cs-role">程式（App）</div>
            <div class="cs-op"></div>
            <div class="cs-slots">${SLOT('app-res')}</div>
          </section>
          <section class="flow-col cs-col" data-col="cache">
            <h4>處理 <small>先看快取</small></h4>
            <div class="cs-role">快取（Cache）</div>
            <div class="cs-entry" data-state="empty"><span class="cs-key">${KEY}</span><span class="cs-val"></span></div>
            <div class="cs-tag"></div>
            <div class="cs-slots">${SLOT('cache-req')}</div>
            <p class="cs-verdict"></p>
          </section>
          <section class="flow-col cs-col" data-col="db">
            <h4>輸出 <small>資料庫存最終資料</small></h4>
            <div class="cs-role">資料庫（DB）</div>
            <div class="cs-entry cs-entry-db"><span class="cs-key">${KEY}</span><span class="cs-val"></span></div>
            <div class="cs-counts">讀 <b class="cs-reads">0</b> · 寫 <b class="cs-writes">0</b></div>
            <div class="cs-slots">${SLOT('db-req')}</div>
          </section>
        </div>
        <div class="cs-tokens">
          <span class="cs-token cs-token-req is-gone" data-token="req"></span>
          <span class="cs-token cs-token-res is-gone" data-token="res"></span>
        </div>
      </div>
    </article>
  `;
}

function compareHtml() {
  return `
    <h3 class="cs-title">同一串操作，三種策略的取捨</h3>
    <table class="grid-table cs-compare-table">
      <thead><tr><th></th>${strategies.map((s) => `<th>${s.name}</th>`).join('')}</tr></thead>
      <tbody>${compareRows.map((r) => `<tr>
        <th>${r.label}</th><td>${r.aside}</td><td>${r.through}</td><td>${r.back}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;
}

function collectPanel(root) {
  const q = (s) => root.querySelector(s);
  return {
    sceneEl: q('.cs-scene'),
    cols: { app: q('[data-col="app"]'), cache: q('[data-col="cache"]'), db: q('[data-col="db"]') },
    op: q('.cs-op'),
    cacheEntry: q('.cs-col[data-col="cache"] .cs-entry'),
    cacheVal: q('.cs-col[data-col="cache"] .cs-val'),
    tag: q('.cs-tag'),
    verdict: q('.cs-verdict'),
    dbVal: q('.cs-entry-db .cs-val'),
    reads: q('.cs-reads'),
    writes: q('.cs-writes'),
    wires: Object.fromEntries(['ac', 'cd', 'ad'].map((w) => [w, q(`[data-wire="${w}"]`)])),
    slots: { app: q('[data-slot="app-res"]'), cache: q('[data-slot="cache-req"]'), db: q('[data-slot="db-req"]') },
    tokens: { req: q('[data-token="req"]'), res: q('[data-token="res"]') },
    positions: new Map(),
  };
}

function buildScene(stage) {
  stage.innerHTML = `
    <div class="cs-panels">${strategies.map(panelHtml).join('')}</div>
    <div class="cs-compare" hidden>${compareHtml()}</div>
  `;
  return {
    stage,
    panelsEl: stage.querySelector('.cs-panels'),
    compareEl: stage.querySelector('.cs-compare'),
    panels: Array.from(stage.querySelectorAll('.cs-panel')).map(collectPanel),
    current: null,
  };
}

// 直排（桌機）時資料由上往下流，橫排（手機）時由左往右流；由實際版面判斷，不另外記模式
function layoutWires(panel, origin) {
  const rect = (k) => panel.cols[k].getBoundingClientRect();
  const a = rect('app');
  const c = rect('cache');
  const d = rect('db');
  const x = (v) => v - origin.left;
  const y = (v) => v - origin.top;
  const vertical = c.top >= a.bottom - 1;
  const mid = (lo, hi) => (lo + hi) / 2;

  const link = (from, to) => {
    if (vertical) {
      const x1 = x(mid(from.left, from.right));
      const x2 = x(mid(to.left, to.right));
      const y1 = y(from.bottom);
      const y2 = y(to.top);
      const b = (y2 - y1) / 2;
      return `M ${x1} ${y1} C ${x1} ${y1 + b}, ${x2} ${y2 - b}, ${x2} ${y2}`;
    }
    const x1 = x(from.right);
    const x2 = x(to.left);
    const y1 = y(mid(from.top, from.bottom));
    const y2 = y(mid(to.top, to.bottom));
    const b = (x2 - x1) / 2;
    return `M ${x1} ${y1} C ${x1 + b} ${y1}, ${x2 - b} ${y2}, ${x2} ${y2}`;
  };

  // App 直接連 DB 的線（Cache-Aside 的寫入與回源）繞過 cache：直排時走右側，橫排時走下方
  const bypass = () => {
    if (vertical) {
      const x1 = x(a.right);
      const x2 = x(d.right);
      return `M ${x1} ${y(mid(a.top, a.bottom))} C ${x1 + 30} ${y(mid(a.top, a.bottom))}, ${x2 + 30} ${y(mid(d.top, d.bottom))}, ${x2} ${y(mid(d.top, d.bottom))}`;
    }
    const x1 = x(mid(a.left, a.right));
    const x2 = x(mid(d.left, d.right));
    return `M ${x1} ${y(a.bottom)} C ${x1} ${y(a.bottom) + 28}, ${x2} ${y(d.bottom) + 28}, ${x2} ${y(d.bottom)}`;
  };

  panel.wires.ac.setAttribute('d', link(a, c));
  panel.wires.cd.setAttribute('d', link(c, d));
  panel.wires.ad.setAttribute('d', bypass());
}

// 值有變就顯示 舊 → 新 並 pop；用 DOM 組裝而不是 innerHTML，換步時才不會把元素整個重建
function setValue(el, before, after, animate) {
  el.textContent = '';
  if (before !== null && before !== after) {
    const delta = document.createElement('span');
    delta.className = 'delta';
    const s = document.createElement('s');
    s.textContent = before;
    const b = document.createElement('b');
    b.textContent = after;
    delta.append(s, ' → ', b);
    el.append(delta);
    pop(el, animate);
  } else {
    el.textContent = after;
  }
}

const show = (v) => (v === null ? '空' : v);

function entryState(d) {
  if (d.crashed) return 'crashed';
  if (d.cache === null) return 'empty';
  if (d.dirty) return 'dirty';
  return d.cache !== d.db ? 'stale' : 'clean';
}

const TAGS = {
  dirty: '還沒存進資料庫',
  crashed: '故障',
};

function placeToken(panel, key, spec, animate, origin) {
  const el = panel.tokens[key];
  el.classList.toggle('is-gone', !spec);
  if (!spec) return;
  const wasGone = el.dataset.shown !== '1';
  el.textContent = spec.label;
  el.classList.toggle('is-warn', Boolean(spec.warn));
  const r = panel.slots[spec.at].getBoundingClientRect();
  // 從隱藏狀態出現時直接在新位置淡入，不從上一次消失的地方飛過來
  flyTo(el, panel.positions, key, r.left - origin.left, r.top - origin.top, animate && !wasGone);
}

function updatePanel(panel, d, prevD, step, animate) {
  const origin = panel.sceneEl.getBoundingClientRect();
  panel.op.textContent = step.data.op;
  panel.verdict.textContent = d.verdict;
  panel.verdict.classList.toggle('is-idle', d.idle);

  const state = entryState(d);
  panel.cacheEntry.dataset.state = state;
  panel.tag.textContent = state === 'stale' ? `舊值：資料庫已是 ${d.db}` : TAGS[state] || '';
  setValue(panel.cacheVal, prevD ? show(prevD.cache) : null, show(d.cache), animate);
  setValue(panel.dbVal, prevD ? prevD.db : null, d.db, animate);
  setValue(panel.reads, prevD ? String(prevD.reads) : null, String(d.reads), animate);
  setValue(panel.writes, prevD ? String(prevD.writes) : null, String(d.writes), animate);

  Object.entries(panel.wires).forEach(([w, el]) => el.classList.toggle('is-active', d.wires.includes(w)));

  ['req', 'res'].forEach((key) => {
    placeToken(panel, key, d[key], animate, origin);
    panel.tokens[key].dataset.shown = d[key] ? '1' : '0';
  });
  layoutWires(panel, origin);
}

function update(step, prev, animate) {
  scene.current = { step, prev };
  const isCompare = step.data.kind === 'compare';
  scene.panelsEl.hidden = isCompare;
  scene.compareEl.hidden = !isCompare;
  if (isCompare) return;
  // 倒回假設情境的那一拍狀態不連續，不拿上一拍來比，免得顯示出不存在的 delta
  const prevPanels = prev && !step.data.rewind && prev.data.panels;
  scene.panels.forEach((panel, i) => {
    updatePanel(panel, step.data.panels[i], prevPanels ? prevPanels[i] : null, step, animate);
  });
}

// 視窗寬度一變，各個位置的座標就跟著變；牌子是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
