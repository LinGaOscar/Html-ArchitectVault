import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { users, orders, joins, resultCatalog, compareRows, unmatchedUserNames, orphanLabels } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// 游標與「結果列」是從頭到尾都存在的元素：游標沿列滑動，結果列從來源列飛進 RESULT 的空位，
// 讀者才看得出 RESULT 裡的每一列是從哪一筆輸入長出來的。
// 四種 JOIN 各佔一個面板、吃同一份資料、同步前進，配不到的列在同一個時間點的不同反應就能直接比。
let scene = null;

const wide = (long, short) => `<span class="sj-wide">${long}</span><span class="sj-narrow">${short}</span>`;
const SLOT_COUNT = resultCatalog.length;
const cell = (value) => (value === null ? '<span class="sj-null">NULL</span>' : `<span>${value}</span>`);

function panelHtml(join) {
  return `
    <article class="sj-panel">
      <header class="sj-head">
        <h3 class="sj-title">${wide(join.label, join.short)}</h3>
        <span class="sj-count">列數 <b class="sj-cur">0</b><span class="delta" hidden><s class="sj-old"></s> → <b class="sj-new"></b></span></span>
      </header>
      <p class="sj-rule">${join.rule}</p>
      <pre class="snippet"><code>SELECT u.name, o.id, o.amount
FROM users u
<b>${join.label}</b> orders o <span class="sj-on">ON o.user_id = u.id</span></code></pre>
      <div class="sj-scene">
        <svg class="sj-wires" aria-hidden="true">
          ${orders.map((o) => `<path class="sj-wire" data-order="${o.id}"></path>`).join('')}
        </svg>
        <div class="sj-grid">
          <section class="flow-col sj-in">
            <h4>輸入 <small>兩張表</small></h4>
            <div class="sj-tables">
              <div class="sj-table sj-users">
                <div class="sj-tname">users</div>
                <div class="sj-row sj-headrow"><span>id</span><span>name</span><span></span></div>
                ${users.map((u) => `<div class="sj-row" data-user="${u.id}"><span>#${u.id}</span><span>${u.name}</span><span class="sj-mark"></span></div>`).join('')}
              </div>
              <div class="sj-table sj-orders">
                <div class="sj-tname">orders</div>
                <div class="sj-row sj-headrow"><span>id</span><span>${wide('user_id', 'uid')}</span><span>amt</span><span></span></div>
                ${orders.map((o) => `<div class="sj-row" data-order="${o.id}"><span>#${o.id}</span><span>${o.userId}</span><span>${o.amount}</span><span class="sj-mark"></span></div>`).join('')}
              </div>
            </div>
          </section>
          <section class="flow-col sj-proc">
            <h4>處理 <small>逐列比對並判定</small></h4>
            <p class="sj-verdict"></p>
          </section>
          <section class="flow-col sj-out">
            <h4>輸出 <small>結果</small></h4>
            <div class="sj-table sj-result">
              <div class="sj-tname">RESULT</div>
              <div class="sj-row sj-headrow"><span>name</span><span>order</span><span>amt</span></div>
              ${Array.from({ length: SLOT_COUNT }, () => '<div class="sj-row sj-slot"></div>').join('')}
            </div>
          </section>
        </div>
        <div class="sj-overlay">
          <span class="sj-cursor"></span>
          ${resultCatalog.map((r) => `<div class="sj-token ${r.user && r.order ? '' : 'sj-token-null'}" data-key="${r.key}">
            ${cell(r.user ? r.user.name : null)}${cell(r.order ? `#${r.order.id}` : null)}${cell(r.order ? r.order.amount : null)}
          </div>`).join('')}
        </div>
      </div>
    </article>
  `;
}

function collectPanel(root) {
  const byId = (selector, list, attr) => Object.fromEntries(list.map((x) => [x.id, root.querySelector(`${selector}[data-${attr}="${x.id}"]`)]));
  return {
    sceneEl: root.querySelector('.sj-scene'),
    verdict: root.querySelector('.sj-verdict'),
    countCur: root.querySelector('.sj-cur'),
    countDelta: root.querySelector('.sj-count .delta'),
    countOld: root.querySelector('.sj-old'),
    countNew: root.querySelector('.sj-new'),
    userRows: byId('.sj-users .sj-row', users, 'user'),
    orderRows: byId('.sj-orders .sj-row', orders, 'order'),
    wires: byId('.sj-wire', orders, 'order'),
    slots: Array.from(root.querySelectorAll('.sj-slot')),
    cursor: root.querySelector('.sj-cursor'),
    cursorShown: false,
    tokens: new Map(resultCatalog.map((r) => [r.key, root.querySelector(`.sj-token[data-key="${r.key}"]`)])),
    positions: new Map(),
  };
}

// 對照表是一次性內容，建場景時就產生，之後只切換顯示
function compareHtml() {
  return `
    <h3 class="sj-title">同一份資料，四種 JOIN 的結果</h3>
    <table class="grid-table sj-compare-table">
      <thead><tr>
        <th>JOIN</th><th>結果列數</th>
        <th>users 配不到的列（${unmatchedUserNames.join('、')}）</th>
        <th>orders 配不到的列（${orphanLabels.join('、')}）</th>
      </tr></thead>
      <tbody>${compareRows.map((r) => `<tr>
        <td>${wide(r.label, r.short)}</td><td><b>${r.count}</b></td>
        <td class="${r.keepUser ? 'sj-keep' : 'sj-drop'}">${r.keepUser ? '保留，補 NULL' : '丟掉'}</td>
        <td class="${r.keepOrder ? 'sj-keep' : 'sj-drop'}">${r.keepOrder ? '保留，補 NULL' : '丟掉'}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;
}

function buildScene(stage) {
  stage.innerHTML = `
    <div class="sj-panels">${joins.map(panelHtml).join('')}</div>
    <div class="sj-compare" hidden>${compareHtml()}</div>
  `;
  return {
    stage,
    panelsEl: stage.querySelector('.sj-panels'),
    compareEl: stage.querySelector('.sj-compare'),
    panels: Array.from(stage.querySelectorAll('.sj-panel')).map(collectPanel),
    current: null,
  };
}

function paintRow(el, st) {
  el.dataset.state = st.state;
  el.lastElementChild.textContent = st.mark;
}

// 配對連線橫向連接兩張表，從 users 列右緣彎進 orders 列左緣
function wirePath(x1, y1, x2, y2) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function updatePanel(panel, data, prevData, animate) {
  panel.verdict.textContent = data.verdict;
  users.forEach((u) => paintRow(panel.userRows[u.id], data.userRows[u.id]));
  orders.forEach((o) => paintRow(panel.orderRows[o.id], data.orderRows[o.id]));

  const count = data.results.length;
  const before = prevData ? prevData.results.length : 0;
  const changed = count !== before;
  panel.countCur.textContent = String(count);
  panel.countCur.hidden = changed;
  panel.countDelta.hidden = !changed;
  panel.countOld.textContent = String(before);
  panel.countNew.textContent = String(count);
  if (changed) pop(panel.countDelta, animate);

  const origin = panel.sceneEl.getBoundingClientRect();
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  };

  // 結果列在 RESULT 裡就待在對應空位；還沒產出時停在來源列（透明），產出時才從那裡飛進空位
  resultCatalog.forEach((r) => {
    const el = panel.tokens.get(r.key);
    const idx = data.results.indexOf(r.key);
    const slot = idx >= 0 ? rel(panel.slots[idx]) : null;
    const source = rel(r.from.table === 'users' ? panel.userRows[r.from.id] : panel.orderRows[r.from.id]);
    const size = rel(panel.slots[0]);
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    el.classList.toggle('is-gone', idx < 0);
    el.classList.toggle('is-new', idx >= 0 && !(prevData && prevData.results.includes(r.key)));
    const to = slot || source;
    flyTo(el, panel.positions, r.key, to.x, to.y, animate);
  });

  const cur = data.cursor;
  if (cur) {
    const r = rel(cur.table === 'users' ? panel.userRows[cur.id] : panel.orderRows[cur.id]);
    // 游標第一次出現時直接擺到位，不從角落滑進來
    const snap = !animate || !panel.cursorShown;
    if (snap) panel.cursor.style.transition = 'none';
    panel.cursor.style.transform = `translate(${r.x}px, ${r.y}px)`;
    panel.cursor.style.width = `${r.w}px`;
    panel.cursor.style.height = `${r.h}px`;
    panel.cursor.style.opacity = '1';
    if (snap) {
      void panel.cursor.offsetWidth;
      panel.cursor.style.transition = '';
    }
    panel.cursorShown = true;
  } else {
    panel.cursor.style.opacity = '0';
    panel.cursorShown = false;
  }

  orders.forEach((o) => {
    const wire = panel.wires[o.id];
    const on = data.wire && data.wire.to.includes(o.id);
    if (on) {
      const a = rel(panel.userRows[data.wire.from]);
      const b = rel(panel.orderRows[o.id]);
      wire.setAttribute('d', wirePath(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2));
    }
    wire.classList.toggle('is-active', Boolean(on) && data.wire.phase === 'compare');
    wire.classList.toggle('is-done', Boolean(on) && data.wire.phase === 'emit');
  });
}

function update(step, prev, animate) {
  scene.current = { step, prev };
  const isCompare = step.data.kind === 'compare';
  scene.panelsEl.hidden = isCompare;
  scene.compareEl.hidden = !isCompare;
  if (isCompare) return;
  const prevPanels = prev && prev.data.panels;
  scene.panels.forEach((panel, i) => {
    updatePanel(panel, step.data.panels[i], prevPanels ? prevPanels[i] : null, animate);
  });
}

// 視窗寬度一變，各個位置的座標就跟著變；結果列與游標是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
