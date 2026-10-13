import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { allNodes, nodePos, RING_SIZE, keys, keyIds, slotsPerNode } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// 每個 key 是一個從頭到尾都存在的 token：從排隊區飛到處理區，再飛進節點；節點增減時歸屬變了的 key
// 會從舊節點飛到新節點，沒變的 key 原地不動，讀者才看得出「搬家」的是誰。
// 取餘數與一致性雜湊各佔一個面板、吃同一批 key、同步前進，同一拍就能比較兩邊搬了多少。
let scene = null;

const SLOT = '<span class="ch-slotbox"></span>';

// 環的幾何：viewBox 固定 200x200，畫面縮放時整張 SVG 一起縮，所以座標都用 viewBox 單位算
const CENTER = 100;
const RING_R = 72; // 節點與弧段所在的圓
const SWEEP_R = 86; // 順時針尋找的高亮弧放在外圈，不蓋住節點
const GHOST_R = 54; // 已落定的 key 的小圓點放在內圈，顏色表示歸屬

const circumference = (r) => 2 * Math.PI * r;
const polar = (hash, r) => {
  const angle = (hash / RING_SIZE) * 2 * Math.PI;
  return { x: CENTER + r * Math.sin(angle), y: CENTER - r * Math.cos(angle) };
};

// 用 stroke-dasharray 畫圓上的一段弧：週期剛好等於周長，跨過 0 點的弧也能正確接起來，
// 而且 dasharray / dashoffset 可以用 CSS transition，節點增減時弧段會連續伸縮
function setArc(el, r, start, length) {
  const c = circumference(r);
  const len = (length / RING_SIZE) * c;
  el.style.strokeDasharray = `${len} ${c - len}`;
  el.style.strokeDashoffset = String(-(start / RING_SIZE) * c);
}

const wide = (long, short) => `<span class="ch-wide">${long}</span><span class="ch-narrow">${short}</span>`;
const letter = (node) => node.replace('node-', '');

function ringSvg() {
  const arcs = allNodes.map((n) => `<circle class="ch-arc" data-node="${n}" cx="${CENTER}" cy="${CENTER}" r="${RING_R}" transform="rotate(-90 ${CENTER} ${CENTER})"></circle>`).join('');
  const ticks = [0, 25, 50, 75].map((h) => {
    const p = polar(h, 96);
    return `<text class="ch-tick" x="${p.x}" y="${p.y}">${h}</text>`;
  }).join('');
  const ghosts = keys.map((k) => {
    const p = polar(k.hash, GHOST_R);
    return `<g class="ch-ghost" data-key="${k.id}"><circle cx="${p.x}" cy="${p.y}" r="8"></circle><text x="${p.x}" y="${p.y}">${k.id.slice(1)}</text></g>`;
  }).join('');
  const marks = allNodes.map((n) => {
    const p = polar(nodePos[n], RING_R);
    return `<g class="ch-mark" data-node="${n}"><circle cx="${p.x}" cy="${p.y}" r="11"></circle><text x="${p.x}" y="${p.y}">${letter(n)}</text></g>`;
  }).join('');
  return `
    <svg class="ch-ring" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ch-ring-base" cx="${CENTER}" cy="${CENTER}" r="${RING_R}"></circle>
      ${arcs}
      <circle class="ch-sweep" cx="${CENTER}" cy="${CENTER}" r="${SWEEP_R}" transform="rotate(-90 ${CENTER} ${CENTER})"></circle>
      ${ticks}${ghosts}${marks}
    </svg>`;
}

function panelHtml(kind) {
  const isRing = kind === 'ring';
  const process = isRing
    ? `${ringSvg()}<div class="ch-calc"><p class="ch-l1"></p><p class="ch-l2"></p></div>`
    : `<div class="ch-process-mod"><div class="ch-gate">${SLOT}</div><div class="ch-calc"><p class="ch-l1"></p><p class="ch-l2"></p></div></div>`;
  return `
    <article class="ch-panel" data-kind="${kind}">
      <header class="ch-head">
        <h3 class="ch-title"></h3>
        <span class="ch-moves">${wide('搬動', '搬')} <b class="ch-cur">0</b><span class="delta" hidden><s class="ch-old"></s> → <b class="ch-new"></b></span> / ${keys.length}</span>
      </header>
      <p class="ch-rule"></p>
      <div class="ch-scene">
        <svg class="ch-wires" aria-hidden="true">
          <path class="ch-wire" data-wire="in"></path>
          ${allNodes.map((n) => `<path class="ch-wire" data-wire="${n}"></path>`).join('')}
        </svg>
        <div class="flow">
          <section class="flow-col flow-col-inline" data-col="input">
            <h4>輸入 <small>排隊中的 key</small></h4>
            <div class="ch-queue">${keyIds.map(() => SLOT).join('')}</div>
          </section>
          <section class="flow-col" data-col="process">
            <h4>處理 <small>${isRing ? '放上環，順時針找節點' : 'hash % N 算桶號'}</small></h4>
            ${process}
          </section>
          <section class="flow-col" data-col="output">
            <h4>輸出 <small>節點手上的 key</small></h4>
            <div class="ch-nodes">
              ${allNodes.map((n) => `<div class="ch-node" data-node="${n}">
                <div class="ch-nname">${wide(n, letter(n))}</div>
                <div class="ch-nsub">${isRing ? wide(`位置 ${nodePos[n]}`, `@${nodePos[n]}`) : '<span class="ch-bucket"></span>'}</div>
                <div class="ch-count"><span class="ch-count-num"><span class="ch-cn-cur">0</span><span class="delta" hidden><s></s> → <b></b></span></span></div>
                <div class="ch-chips">${SLOT.repeat(slotsPerNode)}</div>
              </div>`).join('')}
            </div>
          </section>
        </div>
        <div class="ch-tokens">
          ${keys.map((k) => `<span class="ch-token" data-id="${k.id}"><span class="chip">${k.name}</span></span>`).join('')}
        </div>
      </div>
    </article>
  `;
}

function collectPanel(root) {
  const nodeMap = (selector) => Object.fromEntries(allNodes.map((n) => [n, root.querySelector(`${selector}[data-node="${n}"]`)]));
  const boxes = nodeMap('.ch-node');
  return {
    kind: root.dataset.kind,
    title: root.querySelector('.ch-title'),
    rule: root.querySelector('.ch-rule'),
    l1: root.querySelector('.ch-l1'),
    l2: root.querySelector('.ch-l2'),
    sceneEl: root.querySelector('.ch-scene'),
    movesCur: root.querySelector('.ch-cur'),
    movesDelta: root.querySelector('.ch-moves .delta'),
    movesOld: root.querySelector('.ch-old'),
    movesNew: root.querySelector('.ch-new'),
    cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, root.querySelector(`[data-col="${c}"]`)])),
    queueSlots: Array.from(root.querySelectorAll('.ch-queue .ch-slotbox')),
    gateSlot: root.querySelector('.ch-gate .ch-slotbox'),
    ring: root.querySelector('.ch-ring'),
    arcs: nodeMap('.ch-arc'),
    marks: nodeMap('.ch-mark'),
    sweep: root.querySelector('.ch-sweep'),
    ghosts: Object.fromEntries(keyIds.map((id) => [id, root.querySelector(`.ch-ghost[data-key="${id}"]`)])),
    boxes,
    buckets: Object.fromEntries(allNodes.map((n) => [n, boxes[n].querySelector('.ch-bucket')])),
    countNums: Object.fromEntries(allNodes.map((n) => [n, boxes[n].querySelector('.ch-count-num')])),
    countCur: Object.fromEntries(allNodes.map((n) => [n, boxes[n].querySelector('.ch-cn-cur')])),
    countDelta: Object.fromEntries(allNodes.map((n) => [n, boxes[n].querySelector('.ch-count-num .delta')])),
    nodeSlots: Object.fromEntries(allNodes.map((n) => [n, Array.from(boxes[n].querySelectorAll('.ch-slotbox'))])),
    wires: Object.fromEntries(['in', ...allNodes].map((w) => [w, root.querySelector(`[data-wire="${w}"]`)])),
    tokens: new Map(keyIds.map((id) => [id, root.querySelector(`.ch-token[data-id="${id}"]`)])),
    positions: new Map(),
  };
}

function buildScene(stage) {
  stage.innerHTML = `
    <div class="ch-panels">${panelHtml('mod')}${panelHtml('ring')}</div>
    <div class="ch-compare" hidden></div>
  `;
  const panels = Array.from(stage.querySelectorAll('.ch-panel')).map(collectPanel);
  // 弧段先收成長度 0，節點第一次出現時才從自己的位置長出來
  panels.filter((p) => p.ring).forEach((p) => allNodes.forEach((n) => setArc(p.arcs[n], RING_R, nodePos[n], 0)));
  return {
    stage,
    panelsEl: stage.querySelector('.ch-panels'),
    compareEl: stage.querySelector('.ch-compare'),
    panels,
    current: null,
  };
}

// 資料由上往下流，連接線從上一段的下緣出發、彎進下一段的上緣
function wirePath(x1, y1, x2, y2) {
  const bend = (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

function layoutWires(panel, origin, present) {
  const rect = (el) => el.getBoundingClientRect();
  const midX = (r) => r.left + r.width / 2 - origin.left;
  const processRect = rect(panel.cols.process);
  const x = midX(processRect);
  const inputBottom = rect(panel.cols.input).bottom - origin.top;
  const processTop = processRect.top - origin.top;
  const processBottom = processRect.bottom - origin.top;
  const outputTop = rect(panel.cols.output).top - origin.top;

  panel.wires.in.setAttribute('d', wirePath(x, inputBottom, x, processTop));
  allNodes.forEach((n) => {
    panel.wires[n].setAttribute('d', wirePath(x, processBottom, midX(rect(panel.boxes[n])), outputTop));
    panel.wires[n].classList.toggle('is-absent', !present.includes(n));
  });
}

function countsOf(owner) {
  const counts = Object.fromEntries(allNodes.map((n) => [n, 0]));
  Object.values(owner).forEach((n) => { counts[n] += 1; });
  return counts;
}

function updateRing(panel, data) {
  const sorted = data.present.slice().sort((a, b) => nodePos[a] - nodePos[b]);
  allNodes.forEach((n) => {
    const here = data.present.includes(n);
    panel.arcs[n].classList.toggle('is-absent', !here);
    panel.marks[n].classList.toggle('is-absent', !here);
    panel.marks[n].classList.toggle('is-target', data.target === n);
    if (!here) return; // 離開環的節點弧段保持原樣淡出，鄰居的弧段同時長過去接手
    const prevNode = sorted[(sorted.indexOf(n) + sorted.length - 1) % sorted.length];
    const length = sorted.length === 1 ? RING_SIZE : (nodePos[n] - nodePos[prevNode] + RING_SIZE) % RING_SIZE;
    setArc(panel.arcs[n], RING_R, nodePos[prevNode], length);
  });

  if (data.sweep) {
    setArc(panel.sweep, SWEEP_R, data.sweep.from, (data.sweep.to - data.sweep.from + RING_SIZE) % RING_SIZE);
  }
  panel.sweep.classList.toggle('is-on', Boolean(data.sweep));

  keyIds.forEach((id) => {
    const ghost = panel.ghosts[id];
    const owner = data.owner[id];
    ghost.classList.toggle('is-shown', Boolean(owner));
    ghost.classList.toggle('is-marked', data.marked.includes(id));
    ghost.classList.toggle('is-moved', data.moved.includes(id));
    if (owner) ghost.dataset.owner = owner;
  });
}

// key 在環上的位置（處理區裡的 token 落點）：用 SVG 實際渲染的大小換算，環縮放後仍然對得上
function ringPoint(panel, hash, origin, size) {
  const svg = panel.ring.getBoundingClientRect();
  const scale = svg.width / 200;
  const p = polar(hash, RING_R);
  return {
    x: svg.left - origin.left + p.x * scale - size.w / 2,
    y: svg.top - origin.top + p.y * scale - size.h / 2,
  };
}

function updatePanel(panel, data, prevData, animate) {
  panel.title.textContent = data.title;
  panel.rule.textContent = data.rule;
  panel.l1.textContent = data.line1;
  panel.l2.textContent = data.line2;

  // 搬動數：只有數字增加（搬家發生）時才顯示新舊對照，事件之間歸零不算搬家
  const moves = data.moveCount;
  const beforeMoves = prevData ? prevData.moveCount : 0;
  const grew = moves > beforeMoves;
  panel.movesCur.textContent = String(moves);
  panel.movesCur.hidden = grew;
  panel.movesDelta.hidden = !grew;
  panel.movesOld.textContent = String(beforeMoves);
  panel.movesNew.textContent = String(moves);
  if (grew) pop(panel.movesDelta, animate);

  if (panel.kind === 'ring') updateRing(panel, data);

  const counts = countsOf(data.owner);
  const prevCounts = countsOf(prevData ? prevData.owner : {});
  allNodes.forEach((n) => {
    const here = data.present.includes(n);
    const box = panel.boxes[n];
    box.classList.toggle('is-absent', !here);
    box.classList.toggle('is-target', data.target === n);
    if (panel.kind === 'mod' && panel.buckets[n]) panel.buckets[n].textContent = here ? `桶 ${data.bucket[n]}` : '已移除';
    const changed = counts[n] !== prevCounts[n];
    panel.countCur[n].textContent = String(counts[n]);
    panel.countCur[n].hidden = changed;
    panel.countDelta[n].hidden = !changed;
    panel.countDelta[n].querySelector('s').textContent = String(prevCounts[n]);
    panel.countDelta[n].querySelector('b').textContent = String(counts[n]);
    if (changed) pop(panel.countNums[n], animate);
    panel.wires[n].classList.toggle('is-active', data.target === n);
  });
  panel.wires.in.classList.toggle('is-active', Boolean(data.gate));

  const origin = panel.sceneEl.getBoundingClientRect();
  const slotRect = panel.queueSlots[0].getBoundingClientRect();
  const size = { w: slotRect.width, h: slotRect.height };
  const topLeft = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top };
  };

  // 每個 key 這一步該待在哪：排隊區、處理區（取餘數是閘口，環是 key 自己的雜湊位置）、或某節點的固定位置
  const target = new Map();
  scene.queue.forEach((id, i) => target.set(id, topLeft(panel.queueSlots[i])));
  if (data.gate) {
    const hash = keys.find((k) => k.id === data.gate).hash;
    target.set(data.gate, panel.kind === 'ring' ? ringPoint(panel, hash, origin, size) : topLeft(panel.gateSlot));
  }
  keyIds.forEach((id) => {
    if (data.owner[id]) target.set(id, topLeft(panel.nodeSlots[data.owner[id]][data.slot[id]]));
  });

  panel.tokens.forEach((el, id) => {
    const pos = target.get(id);
    el.classList.toggle('is-current', data.current === id);
    el.classList.toggle('is-marked', data.marked.includes(id));
    el.classList.toggle('is-moved', data.moved.includes(id));
    if (data.owner[id]) el.dataset.owner = data.owner[id];
    else delete el.dataset.owner;
    if (!pos) return;
    flyTo(el, panel.positions, id, pos.x, pos.y, animate);
  });

  layoutWires(panel, origin, data.present);
}

function updateCompare(step) {
  const { rows, total } = step.data;
  const pct = (n) => `${Math.round((n / total) * 100)}%`;
  scene.compareEl.innerHTML = `
    <h3 class="ch-title">同一批 ${total} 個 key，節點增減時搬了幾個</h3>
    <table class="grid-table ch-compare-table">
      <thead><tr><th>事件</th><th>取餘數</th><th>Consistent Hashing</th><th>理論 K/N</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${r.label}</td>
        <td class="ch-bad">${r.mod} / ${r.total}（${pct(r.mod)}）</td>
        <td class="ch-good">${r.ring} / ${r.total}（${pct(r.ring)}）</td>
        <td>約 ${r.theory} 個</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="ch-compare-note">K 是 key 總數，N 是節點數。取餘數在 N 變動時，大部分 key 的 hash % N 都會不同。一致性雜湊只有被新增或移除節點所負責的那一段會換人，平均約 K/N 個。這裡只有 ${total} 個 key，實測會偏離平均值。</p>
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
  scene.queue = step.data.queue;
  // 上一步若是對照表，兩個面板當時是隱藏的，沒有可比較的前後狀態
  const prevPanels = prev && prev.data.kind === 'run' ? prev.data.panels : null;
  scene.panels.forEach((panel, i) => {
    updatePanel(panel, step.data.panels[i], prevPanels ? prevPanels[i] : null, animate);
  });
}

// 視窗寬度一變，各個位置的座標（包含環縮放後的位置）就跟著變；token 是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
