import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { nodes, longIds, requestIds, slotsPerServer } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// 每個請求是一個從頭到尾都存在的元素，換步時從目前位置移到新位置，
// 讀者才看得出「同一個請求」從輸入端經過 Load Balancer 流到輸出端。
// 兩種演算法各佔一個面板、吃同一批請求、同步前進，差異在同一個時間點就能直接比。
let scene = null;

const SLOT = '<span class="lb-slotbox"></span>';

// 手機寬度放不下完整的伺服器名稱，同時輸出短名稱（S1、S2…），由 CSS 依寬度擇一顯示
function nameHtml(node) {
  return `<span class="lb-wide">${node}</span><span class="lb-narrow">S${node.split('-')[1]}</span>`;
}

function panelHtml() {
  return `
    <article class="lb-panel">
      <h3 class="lb-title"></h3>
      <p class="lb-rule"></p>
      <pre class="snippet lb-code"></pre>
      <div class="lb-scene">
        <svg class="lb-wires" aria-hidden="true">
          <path class="lb-wire" data-wire="in"></path>
          ${nodes.map((n) => `<path class="lb-wire" data-wire="${n}"></path>`).join('')}
        </svg>
        <div class="flow">
          <section class="flow-col flow-col-inline" data-col="input">
            <h4>輸入 <small>用戶端送來的請求</small></h4>
            <div class="lb-queue">${requestIds.map(() => SLOT).join('')}</div>
          </section>
          <section class="flow-col" data-col="process">
            <h4>處理 <small>Load Balancer 決定給誰</small></h4>
            <div class="lb-process">
              <div class="lb-gate">${SLOT}</div>
              <div class="lb-decision-wrap">
                <span class="lb-pointer" aria-hidden="true">▶</span>
                <ul class="lb-decision">
                  ${nodes.map((n) => `<li data-node="${n}">${nameHtml(n)}<span class="lb-detail"></span></li>`).join('')}
                </ul>
              </div>
            </div>
          </section>
          <section class="flow-col" data-col="output">
            <h4>輸出 <small>後端伺服器手上的連線</small></h4>
            <div class="lb-servers">
              ${nodes.map((n) => `<div class="lb-server" data-node="${n}">
                <div>${nameHtml(n)}</div>
                <div class="lb-count"><span class="lb-wide">連線 </span><span class="lb-count-num">0</span></div>
                <div class="lb-chips">${SLOT.repeat(slotsPerServer)}</div>
              </div>`).join('')}
            </div>
          </section>
        </div>
        <div class="lb-tokens">
          ${requestIds.map((id) => `<span class="lb-token" data-id="${id}"><span class="chip ${longIds.includes(id) ? 'chip-long' : ''}">#${id}</span></span>`).join('')}
        </div>
      </div>
      <p class="lb-explain"></p>
    </article>
  `;
}

function collectPanel(root) {
  const byNode = (selector) => Object.fromEntries(nodes.map((n) => [n, root.querySelector(`${selector}[data-node="${n}"]`)]));
  const servers = byNode('.lb-server');
  return {
    title: root.querySelector('.lb-title'),
    rule: root.querySelector('.lb-rule'),
    code: root.querySelector('.lb-code'),
    explain: root.querySelector('.lb-explain'),
    sceneEl: root.querySelector('.lb-scene'),
    cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, root.querySelector(`[data-col="${c}"]`)])),
    queueSlots: Array.from(root.querySelectorAll('.lb-queue .lb-slotbox')),
    gateSlot: root.querySelector('.lb-gate .lb-slotbox'),
    pointer: root.querySelector('.lb-pointer'),
    rows: byNode('.lb-decision li'),
    servers,
    serverSlots: Object.fromEntries(nodes.map((n) => [n, Array.from(servers[n].querySelectorAll('.lb-slotbox'))])),
    wires: Object.fromEntries(['in', ...nodes].map((w) => [w, root.querySelector(`[data-wire="${w}"]`)])),
    tokens: new Map(requestIds.map((id) => [id, root.querySelector(`.lb-token[data-id="${id}"]`)])),
    positions: new Map(),
  };
}

function buildScene(stage) {
  stage.innerHTML = `
    <div class="lb-panels">${panelHtml()}${panelHtml()}</div>
    <div class="lb-compare" hidden></div>
  `;
  return {
    stage,
    panelsEl: stage.querySelector('.lb-panels'),
    compareEl: stage.querySelector('.lb-compare'),
    panels: Array.from(stage.querySelectorAll('.lb-panel')).map(collectPanel),
    current: null,
  };
}

// 資料由上往下流，所以連接線從上一段的下緣出發、彎進下一段的上緣
function wirePath(x1, y1, x2, y2) {
  const bend = (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

function layoutWires(panel, origin) {
  const rect = (el) => el.getBoundingClientRect();
  const midX = (r) => r.left + r.width / 2 - origin.left;
  const gateX = midX(rect(panel.gateSlot));
  const inputBottom = rect(panel.cols.input).bottom - origin.top;
  const processTop = rect(panel.cols.process).top - origin.top;
  const processBottom = rect(panel.cols.process).bottom - origin.top;
  const outputTop = rect(panel.cols.output).top - origin.top;

  panel.wires.in.setAttribute('d', wirePath(gateX, inputBottom, gateX, processTop));
  nodes.forEach((n) => {
    panel.wires[n].setAttribute('d', wirePath(gateX, processBottom, midX(rect(panel.servers[n])), outputTop));
  });
}

function updatePanel(panel, data, prevData, step, animate) {
  const { kind, request, queue } = step.data;
  const { algorithm, rule, code, chosen, held, pickLabel, showCounts, explain } = data;
  panel.title.textContent = algorithm;
  panel.rule.textContent = `規則：${rule}`;
  panel.code.textContent = code;
  panel.explain.textContent = explain;

  // 每個請求這一步該待在哪個位置：排隊區、Load Balancer 入口、或某台伺服器的連線位置；都不在就是已處理完
  const target = new Map();
  queue.forEach((id, i) => target.set(id, panel.queueSlots[i]));
  if (kind === 'decide') target.set(request.id, panel.gateSlot);
  nodes.forEach((n) => held[n].forEach((id, i) => target.set(id, panel.serverSlots[n][i])));

  const origin = panel.sceneEl.getBoundingClientRect();
  panel.tokens.forEach((el, id) => {
    const slot = target.get(id);
    el.classList.toggle('is-gone', !slot);
    el.classList.toggle('is-current', Boolean(request) && request.id === id);
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    flyTo(el, panel.positions, id, r.left - origin.left, r.top - origin.top, animate);
  });

  nodes.forEach((n) => {
    const isPick = n === chosen;
    // 判斷用的是送出前的連線數，送出那一拍要扣回剛加上去的那一條，面板才不會在兩拍之間跳動
    const seenCount = held[n].length - (kind === 'dispatch' && isPick ? 1 : 0);
    panel.rows[n].classList.toggle('is-pick', isPick);
    panel.rows[n].querySelector('.lb-detail').textContent = [showCounts ? `${seenCount} 條` : '', isPick ? pickLabel : '']
      .filter(Boolean)
      .join(' · ');

    const server = panel.servers[n];
    server.classList.toggle('is-target', isPick && kind === 'decide');
    server.classList.toggle('is-chosen', isPick && kind === 'dispatch');
    const count = held[n].length;
    const before = prevData ? prevData.held[n].length : 0;
    const num = server.querySelector('.lb-count-num');
    num.innerHTML = count !== before ? `<span class="delta"><s>${before}</s> → <b>${count}</b></span>` : String(count);
    if (count !== before) pop(num, animate);

    panel.wires[n].classList.toggle('is-target', isPick && kind === 'decide');
    panel.wires[n].classList.toggle('is-active', isPick && kind === 'dispatch');
  });
  panel.wires.in.classList.toggle('is-active', kind === 'decide');

  panel.pointer.style.opacity = chosen ? '1' : '0';
  if (chosen) panel.pointer.style.transform = `translateY(${panel.rows[chosen].offsetTop}px)`;

  layoutWires(panel, origin);
}

function updateCompare(step) {
  const { rows, peaks } = step.data;
  scene.compareEl.innerHTML = `
    <h3 class="lb-title">同一批請求，兩種分配結果</h3>
    <table class="grid-table">
      <thead><tr><th>請求</th><th>佔用連線</th><th>Round Robin</th><th>Least Connections</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.roundRobin !== r.leastConnections ? 'row-highlight' : ''}">
        <td>#${r.id}</td><td>${r.holdSteps} 輪</td><td>${r.roundRobin}</td><td>${r.leastConnections}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="2">單台同時連線最高</th><td>${peaks.roundRobin} 條</td><td>${peaks.leastConnections} 條</td></tr></tfoot>
    </table>
  `;
}

function update(step, prev, animate) {
  scene.current = { step, prev };
  const isCompare = step.data.kind === 'compare';
  scene.panelsEl.hidden = isCompare;
  scene.compareEl.hidden = !isCompare;
  if (isCompare) {
    updateCompare(step);
    return;
  }
  const prevPanels = prev && prev.data.panels;
  scene.panels.forEach((panel, i) => {
    updatePanel(panel, step.data.panels[i], prevPanels ? prevPanels[i] : null, step, animate);
  });
}

// 視窗寬度一變，各個位置的座標就跟著變；請求是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
