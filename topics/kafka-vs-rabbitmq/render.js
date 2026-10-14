import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { messages, consumerDefs, systems, slotCounts, compareRows } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// 每則訊息是從頭到尾都存在的 token。RabbitMQ 的 token 本身從 queue 飛到 consumer，queue 因此變空；
// Kafka 的 token 留在 partition 裡，飛到 consumer 的是副本，讀者才看得出「推走」與「讀副本」的差別。
// 兩種 broker 各佔一個面板、吃同一串訊息、同步前進。
let scene = null;

const SLOT = '<span class="mq-slot"></span>';
const tokenHtml = (m, owner) =>
  `<span class="mq-token" data-key="${m.key}" data-tok="${owner}:${m.id}"><span class="chip">${m.id}</span></span>`;

function panelHtml(sys) {
  const isCopy = sys.mode === 'copy';
  return `
    <article class="mq-panel" data-sys="${sys.id}">
      <h3 class="mq-title">${sys.title}</h3>
      <p class="mq-rule">${sys.rule}</p>
      <pre class="snippet mq-code">${sys.code}</pre>
      <div class="mq-scene">
        <svg class="mq-wires" aria-hidden="true">
          <path class="mq-wire" data-wire="in"></path>
          ${consumerDefs.map((c) => `<path class="mq-wire" data-wire="${c.id}"></path>`).join('')}
        </svg>
        <div class="flow">
          <section class="flow-col flow-col-inline" data-col="input">
            <h4>輸入 <small>Producer 依序送出</small></h4>
            <div class="mq-producer">${SLOT.repeat(messages.length)}</div>
          </section>
          <section class="flow-col" data-col="process">
            <h4>處理 <small>${sys.processLabel}</small></h4>
            <div class="mq-process">
              <div class="mq-gate"><span class="mq-gname">${sys.gateName}</span>${SLOT}</div>
              <div class="mq-lanes">
                ${sys.lanes.map((l) => `<div class="mq-lane" data-lane="${l.id}">
                  <div class="mq-lhead"><b>${l.name}</b><span class="mq-lmeta"></span></div>
                  <div class="mq-lslots">${SLOT.repeat(slotCounts.lanes[sys.id][l.id])}</div>
                  ${isCopy ? '<div class="mq-ptrs"><span class="mq-ptr" data-group="orders">▲ 訂單</span><span class="mq-ptr" data-group="an">▲ 分析</span></div>' : ''}
                </div>`).join('')}
              </div>
            </div>
            <p class="mq-verdict"></p>
          </section>
          <section class="flow-col" data-col="output">
            <h4>輸出 <small>consumer 處理過的訊息</small></h4>
            <div class="mq-consumers">
              ${consumerDefs.map((c) => `<div class="mq-consumer" data-c="${c.id}">
                <div class="mq-cname">${c.name} <small>${c.group}</small></div>
                <div class="mq-count">已處理 <span class="mq-num">0</span></div>
                <div class="mq-cslots">${SLOT.repeat(slotCounts.consumers[c.id])}</div>
              </div>`).join('')}
            </div>
          </section>
        </div>
        <div class="mq-tokens">
          ${messages.map((m) => tokenHtml(m, 'main')).join('')}
          ${isCopy ? consumerDefs.flatMap((c) => messages.map((m) => tokenHtml(m, c.id))).join('') : ''}
        </div>
      </div>
    </article>
  `;
}

// 對照表是一次性內容，建場景時就產生，之後只切換顯示
function compareHtml() {
  return `
    <h3 class="mq-title">同一串訊息，兩種 broker 的結果</h3>
    <table class="grid-table mq-compare-table">
      <thead><tr><th></th><th>RabbitMQ</th><th>Kafka</th></tr></thead>
      <tbody>${compareRows.map((r) => `<tr class="${r.label.startsWith('本例') ? 'row-highlight' : ''}">
        <th>${r.label}</th><td>${r.rabbit}</td><td>${r.kafka}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;
}

function collectPanel(root, sys) {
  const q = (s) => root.querySelector(s);
  const lanes = Object.fromEntries(sys.lanes.map((l) => {
    const el = q(`.mq-lane[data-lane="${l.id}"]`);
    return [l.id, {
      el,
      meta: el.querySelector('.mq-lmeta'),
      slots: Array.from(el.querySelectorAll('.mq-slot')),
      ptrs: Object.fromEntries(Array.from(el.querySelectorAll('.mq-ptr')).map((p) => [p.dataset.group, p])),
    }];
  }));
  const consumers = Object.fromEntries(consumerDefs.map((c) => {
    const el = q(`.mq-consumer[data-c="${c.id}"]`);
    return [c.id, { el, num: el.querySelector('.mq-num'), slots: Array.from(el.querySelectorAll('.mq-slot')) }];
  }));
  return {
    sys,
    sceneEl: q('.mq-scene'),
    verdict: q('.mq-verdict'),
    cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, q(`[data-col="${c}"]`)])),
    producerSlots: Array.from(q('.mq-producer').querySelectorAll('.mq-slot')),
    gateSlot: q('.mq-gate .mq-slot'),
    lanes,
    consumers,
    wires: Object.fromEntries(['in', ...consumerDefs.map((c) => c.id)].map((w) => [w, q(`[data-wire="${w}"]`)])),
    tokens: new Map(Array.from(root.querySelectorAll('.mq-token')).map((el) => [el.dataset.tok, el])),
    positions: new Map(),
  };
}

function buildScene(stage) {
  stage.innerHTML = `
    <div class="mq-panels">${systems.map(panelHtml).join('')}</div>
    <div class="mq-compare" hidden>${compareHtml()}</div>
  `;
  const roots = Array.from(stage.querySelectorAll('.mq-panel'));
  return {
    stage,
    panelsEl: stage.querySelector('.mq-panels'),
    compareEl: stage.querySelector('.mq-compare'),
    panels: roots.map((root, i) => collectPanel(root, systems[i])),
    current: null,
  };
}

// 資料由上往下流，連接線從上一段的下緣出發、彎進下一段的上緣
function wirePath(x1, y1, x2, y2) {
  const bend = (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

function layoutWires(panel, origin) {
  const rect = (el) => el.getBoundingClientRect();
  const midX = (r) => r.left + r.width / 2 - origin.left;
  const gateX = midX(rect(panel.gateSlot));
  const procX = midX(rect(panel.cols.process));
  panel.wires.in.setAttribute('d', wirePath(gateX, rect(panel.cols.input).bottom - origin.top, gateX, rect(panel.cols.process).top - origin.top));
  const procBottom = rect(panel.cols.process).bottom - origin.top;
  const outTop = rect(panel.cols.output).top - origin.top;
  consumerDefs.forEach((c) => {
    panel.wires[c.id].setAttribute('d', wirePath(procX, procBottom, midX(rect(panel.consumers[c.id].el)), outTop));
  });
}

// Kafka 的 offset 指標：停在「下一則要讀」的格子下方；讀完時停在最後一格之後
function ptrX(slots, offset) {
  if (offset < slots.length) return slots[offset].offsetLeft;
  const last = slots[slots.length - 1];
  return last.offsetLeft + last.offsetWidth + 4;
}

function updatePanel(panel, d, prevD, animate) {
  const { sys } = panel;
  const isCopy = sys.mode === 'copy';
  panel.verdict.textContent = d.verdict;
  const origin = panel.sceneEl.getBoundingClientRect();
  const pos = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top };
  };

  // 訊息本體在 broker 這一側的位置：producer、exchange / partitioner、或 queue / partition 裡的某一格
  const home = new Map();
  d.producer.forEach((id, i) => home.set(id, panel.producerSlots[i]));
  if (d.gate) home.set(d.gate, panel.gateSlot);
  Object.entries(d.lanes).forEach(([l, ids]) => {
    if (ids) ids.forEach((id, i) => home.set(id, panel.lanes[l].slots[i]));
  });
  // RabbitMQ 的訊息被推走之後，本體就待在 consumer 那裡
  const mainAt = new Map(home);
  if (!isCopy) consumerDefs.forEach((c) => d.consumers[c.id].forEach((id, i) => mainAt.set(id, panel.consumers[c.id].slots[i])));

  messages.forEach((m) => {
    const el = panel.tokens.get(`main:${m.id}`);
    el.classList.toggle('is-current', d.current.includes(m.id));
    const p = pos(mainAt.get(m.id));
    flyTo(el, panel.positions, `main:${m.id}`, p.x, p.y, animate);
  });

  // Kafka 的副本：還沒被讀時藏在本體那格（看不見），被讀到時才從 partition 飛向 consumer
  if (isCopy) {
    consumerDefs.forEach((c) => messages.forEach((m) => {
      const key = `${c.id}:${m.id}`;
      const el = panel.tokens.get(key);
      const idx = d.consumers[c.id].indexOf(m.id);
      const shown = idx >= 0;
      el.classList.toggle('is-gone', !shown);
      const p = pos(shown ? panel.consumers[c.id].slots[idx] : home.get(m.id));
      // 藏起來的副本只是跟著本體換位置，不播飛行與落地特效
      flyTo(el, panel.positions, key, p.x, p.y, animate && shown);
    }));
  }

  sys.lanes.forEach((l) => {
    const lane = panel.lanes[l.id];
    const ids = d.lanes[l.id];
    lane.el.classList.toggle('is-absent', ids === null);
    lane.el.classList.toggle('is-active', d.active.lanes.includes(l.id));
    if (ids === null) {
      lane.meta.textContent = '尚未建立';
    } else if (isCopy) {
      const an = d.offsets.an ? ` · 分析 ${d.offsets.an[l.id]}` : '';
      lane.meta.textContent = `${ids.length} 則 · 書籤：訂單 ${d.offsets.orders[l.id]}${an}`;
    } else {
      lane.meta.textContent = `${ids.length} 則待處理`;
    }
    Object.entries(lane.ptrs).forEach(([group, ptr]) => {
      const offsets = d.offsets[group];
      ptr.style.opacity = offsets ? '1' : '0';
      if (offsets) ptr.style.transform = `translateX(${ptrX(lane.slots, offsets[l.id])}px)`;
    });
  });

  consumerDefs.forEach((c) => {
    const box = panel.consumers[c.id];
    const present = c.id !== 'an' || d.present.an;
    const on = d.active.consumers.includes(c.id);
    box.el.classList.toggle('is-absent', !present);
    box.el.classList.toggle('is-target', on && d.active.phase === 'target');
    box.el.classList.toggle('is-chosen', on && d.active.phase === 'chosen');
    const count = d.consumers[c.id].length;
    const before = prevD ? prevD.consumers[c.id].length : 0;
    box.num.innerHTML = count !== before ? `<span class="delta"><s>${before}</s> → <b>${count}</b></span>` : String(count);
    if (count !== before) pop(box.num, animate);
    panel.wires[c.id].classList.toggle('is-absent', !present);
    panel.wires[c.id].classList.toggle('is-active', on);
  });
  panel.wires.in.classList.toggle('is-active', d.active.in);

  layoutWires(panel, origin);
}

function update(step, prev, animate) {
  scene.current = { step, prev };
  const isCompare = step.data.kind === 'compare';
  scene.panelsEl.hidden = isCompare;
  scene.compareEl.hidden = !isCompare;
  if (isCompare) return;
  const prevPanels = prev && prev.data.kind === 'run' ? prev.data.panels : null;
  scene.panels.forEach((panel, i) => {
    updatePanel(panel, step.data.panels[i], prevPanels ? prevPanels[i] : null, animate);
  });
}

// 視窗寬度一變，各個位置的座標就跟著變；訊息是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
