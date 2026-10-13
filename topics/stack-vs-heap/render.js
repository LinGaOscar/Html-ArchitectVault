import { flyTo, pop } from '../../assets/js/engine/motion.js';
import { codeLines, frameDefs, blockDefs, wireDefs, heapGrid, summary } from './steps.js';

// 這個主題不在每一步重畫舞台：場景只建一次，之後每一步只改狀態。
// stack frame、heap 區塊、指標連線都是從頭到尾存在的元素：frame 預先建好、push 時從上方滑入，
// heap 區塊從發出 malloc 的 frame 旁飛進格子，frame 消失後連線跟著淡出，
// 讀者才看得出「frame 自動消失、heap 區塊留下來」這件事。
// stack 與 heap 左右並排、同一拍一起更新，各有計數。
let scene = null;

const wide = (long, short) => `<span class="sh-wide">${long}</span><span class="sh-narrow">${short}</span>`;
const GAP = 6; // frame 之間的間距（px）；frame 位置用公式算，不受淡入淡出動畫中途的座標影響
const SLIDE_IN = 36; // frame 尚未 push 時停在自己位置上方多遠
const SLIDE_OUT = 24; // frame return 後往上飄走多遠（stack 頂端離開的方向）
const IDLE_BLOCK = { w: 28, h: 20 }; // 區塊配置前縮成一小塊，藏在 frame 旁，配置時一邊飛一邊長大

const TAGS = {
  live: ['', ''],
  transit: ['回傳值帶著地址', '傳遞中'],
  leak: ['LEAK 沒人指著', 'LEAK'],
  freed: ['已 free', 'free'],
  idle: ['', ''],
};

const ctrHtml = (key) =>
  `<span class="sh-ctr" data-ctr="${key}"><b class="sh-cur">0</b><span class="delta" hidden><s class="sh-old"></s> → <b class="sh-new"></b></span></span>`;

function frameHtml(def) {
  return `<div class="sh-frame" data-frame="${def.id}">
    <div class="sh-fhead">${def.id}()</div>
    ${def.vars.map((v) => `<div class="sh-var" data-var="${v}"><span>${v}</span><span class="sh-vv">?</span></div>`).join('')}
  </div>`;
}

function blockHtml(def) {
  return `<div class="sh-block" data-block="${def.id}" data-state="idle">
    <span>${def.addr}</span><span>${def.size}</span>
    <span class="sh-btag"><span class="sh-wide"></span><span class="sh-narrow"></span></span>
  </div>`;
}

// 對照表是一次性內容，建場景時就產生，之後只切換顯示
function compareHtml() {
  const rows = [
    ['誰配置', '進入函式時自動配置一個 frame，不需要程式碼要求', '程式自己呼叫 malloc 要求'],
    ['誰釋放', '函式 return 時自動回收整個 frame', '程式自己呼叫 free；忘了 free 又沒人保有地址就是 leak'],
    ['生命週期', '跟著函式呼叫，return 就結束', '從 malloc 到 free，可以活得比配置它的函式久'],
    ['速度與大小', '很快，只是移動 stack 頂端；容量小，通常只有數 MB，爆掉就是 stack overflow', '較慢，配置器要找夠大的空位；容量大，受機器可用記憶體限制'],
    [
      '本例中',
      `${summary.cleaned} 個區域變數（load 的 p、main 的 a、work 的 a 與 t）全部自動清掉，沒有任何清理程式碼`,
      `配置 ${summary.allocated} 塊：4 MB 被 free(a) 釋放，${summary.leakedSize}沒人指著也沒 free，漏掉 ${summary.leaked} 塊`,
    ],
  ];
  return `
    <h3 class="sh-title">Stack 與 Heap 對照</h3>
    <table class="grid-table sh-compare-table">
      <thead><tr><th></th><th>Stack</th><th>Heap</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i === rows.length - 1 ? 'row-highlight' : ''}"><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function buildScene(stage) {
  const cellCount = heapGrid.cols * heapGrid.rows;
  stage.innerHTML = `
    <div class="sh-run">
      <div class="flow">
        <section class="flow-col" data-col="input">
          <h4>輸入 <small>程式碼，高亮的是正在執行的一行</small></h4>
          <div class="sh-code">
            <span class="sh-hl"></span>
            ${codeLines.map((src, i) => `<div class="sh-line"><span class="sh-ln">${i + 1}</span><span class="sh-src">${src}</span></div>`).join('')}
          </div>
        </section>
        <section class="flow-col" data-col="process">
          <h4>處理 <small>這一行造成的動作</small></h4>
          <div class="sh-verdict">
            <span class="sh-tag" data-kind="none"></span>
            <span class="sh-phase"></span>
            <p class="sh-vtext"></p>
          </div>
        </section>
        <section class="flow-col" data-col="output">
          <h4>輸出 <small>記憶體狀態，stack 與 heap 並排</small></h4>
          <div class="sh-mem">
            <div class="sh-side" data-side="stack">
              <header class="sh-sidehead"><h5>STACK</h5><span>${wide('區域變數 ', '變數 ')}${ctrHtml('locals')}</span></header>
              <div class="sh-stack">${frameDefs.map(frameHtml).join('')}</div>
              <p class="sh-foot">${wide('return 時自動清掉 ', '自動清掉 ')}${ctrHtml('cleaned')}${wide(' 個值', '')}</p>
            </div>
            <div class="sh-side" data-side="heap">
              <header class="sh-sidehead"><h5>HEAP</h5><span>${wide('區塊 ', '區塊 ')}${ctrHtml('blocks')}</span></header>
              <div class="sh-heap" style="--cols:${heapGrid.cols};--rows:${heapGrid.rows}">
                <div class="sh-grid">${'<i class="sh-cell"></i>'.repeat(cellCount)}</div>
                <div class="sh-grid">${blockDefs.map((b) => `<i class="sh-bslot" data-block="${b.id}" style="grid-row:${b.row};grid-column:${b.col} / span ${b.span}"></i>`).join('')}</div>
              </div>
              <p class="sh-foot">${wide('已 free ', 'free ')}${ctrHtml('freed')}${wide(' 塊 · 漏掉 ', ' · 漏 ')}<span class="sh-leaked">${ctrHtml('leaked')}</span>${wide(' 塊', '')}</p>
            </div>
          </div>
        </section>
      </div>
      <div class="sh-blocks">${blockDefs.map(blockHtml).join('')}</div>
      <svg class="sh-wires" aria-hidden="true">
        <defs>
          <marker id="sh-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="sh-arrowhead" d="M0 0 L8 4 L0 8 z"></path></marker>
        </defs>
        <path class="sh-wire" data-wire="in"></path>
        <path class="sh-wire" data-wire="stack"></path>
        <path class="sh-wire" data-wire="heap"></path>
        ${wireDefs.map((w) => `<path class="sh-ptr" data-ptr="${w.key}" marker-end="url(#sh-arrow)"></path>`).join('')}
      </svg>
    </div>
    <div class="sh-compare" hidden>${compareHtml()}</div>
  `;

  const run = stage.querySelector('.sh-run');
  const ctr = (key) => {
    const el = run.querySelector(`[data-ctr="${key}"]`);
    return { cur: el.querySelector('.sh-cur'), delta: el.querySelector('.delta'), old: el.querySelector('.sh-old'), next: el.querySelector('.sh-new') };
  };
  return {
    stage,
    runEl: run,
    compareEl: stage.querySelector('.sh-compare'),
    cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, run.querySelector(`[data-col="${c}"]`)])),
    sides: { stack: run.querySelector('[data-side="stack"]'), heap: run.querySelector('[data-side="heap"]') },
    stackEl: run.querySelector('.sh-stack'),
    codeEl: run.querySelector('.sh-code'),
    hl: run.querySelector('.sh-hl'),
    hlShown: false,
    lines: Array.from(run.querySelectorAll('.sh-line')),
    tag: run.querySelector('.sh-tag'),
    phase: run.querySelector('.sh-phase'),
    vtext: run.querySelector('.sh-vtext'),
    leakedEl: run.querySelector('.sh-leaked'),
    ctrs: Object.fromEntries(['locals', 'blocks', 'cleaned', 'freed', 'leaked'].map((k) => [k, ctr(k)])),
    frames: Object.fromEntries(
      frameDefs.map((f) => {
        const el = run.querySelector(`.sh-frame[data-frame="${f.id}"]`);
        return [f.id, { el, vars: Object.fromEntries(f.vars.map((v) => [v, el.querySelector(`.sh-var[data-var="${v}"]`)])) }];
      }),
    ),
    blocks: Object.fromEntries(
      blockDefs.map((b) => {
        const el = run.querySelector(`.sh-block[data-block="${b.id}"]`);
        const tag = el.querySelector('.sh-btag');
        return [b.id, { el, wideTag: tag.children[0], narrowTag: tag.children[1], slot: run.querySelector(`.sh-bslot[data-block="${b.id}"]`) }];
      }),
    ),
    wires: Object.fromEntries(['in', 'stack', 'heap'].map((w) => [w, run.querySelector(`[data-wire="${w}"]`)])),
    ptrs: Object.fromEntries(wireDefs.map((w) => [w.key, run.querySelector(`[data-ptr="${w.key}"]`)])),
    positions: new Map(),
    current: null,
  };
}

function setCtr(c, now, before, animate) {
  const changed = now !== before;
  c.cur.textContent = String(now);
  c.cur.hidden = changed;
  c.delta.hidden = !changed;
  c.old.textContent = String(before);
  c.next.textContent = String(now);
  if (changed) pop(c.delta, animate);
}

// 段與段之間的連接線由上往下；指標連線則由 stack 往右彎進 heap
function vPath(x1, y1, x2, y2) {
  const bend = (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}
function hPath(x1, y1, x2, y2) {
  const bend = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function paint(step, prev, animate) {
  const { data } = step;
  const prevData = prev && prev.data.kind === 'run' ? prev.data : null;
  const origin = scene.runEl.getBoundingClientRect();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height, right: r.right - origin.left, bottom: r.bottom - origin.top };
  };

  // 輸入：高亮條是常駐元素，滑到目前這一行
  scene.lines.forEach((el, i) => el.classList.toggle('is-current', data.line === i + 1));
  if (data.line) {
    const first = !scene.hlShown;
    if (first) scene.hl.style.transition = 'none';
    scene.hl.style.transform = `translateY(${scene.lines[data.line - 1].offsetTop}px)`;
    scene.hl.style.opacity = '1';
    if (first) {
      void scene.hl.offsetWidth;
      scene.hl.style.transition = '';
    }
    scene.hlShown = true;
  } else {
    scene.hl.style.opacity = '0';
    scene.hlShown = false;
  }

  // 處理：判定這一行屬於哪種動作；第一拍是「要做什麼」，第二拍是「做完的結果」
  scene.tag.dataset.kind = data.verdict.kind;
  scene.tag.textContent = data.verdict.label;
  scene.phase.textContent = { read: '讀到這一行', act: '執行結果', start: '' }[data.beat];
  scene.vtext.textContent = data.verdict.text;

  // 輸出（左）：frame 預先建好，依狀態決定停在上方、疊在 stack 上、或 return 後飄走淡出
  const areaH = scene.stackEl.clientHeight;
  const mainH = scene.frames.main.el.offsetHeight;
  const frameY = {};
  const liveIds = frameDefs.filter((f) => data.frames[f.id] === 'live');
  const topId = liveIds.length ? liveIds[liveIds.length - 1].id : null;
  frameDefs.forEach((f) => {
    const { el, vars } = scene.frames[f.id];
    const h = el.offsetHeight;
    const y = f.depth === 0 ? areaH - h : areaH - mainH - GAP - h;
    frameY[f.id] = y;
    const status = data.frames[f.id];
    el.dataset.status = status;
    el.classList.toggle('is-top', f.id === topId);
    el.style.transform = `translateY(${status === 'before' ? y - SLIDE_IN : status === 'done' ? y - SLIDE_OUT : y}px)`;
    f.vars.forEach((v) => {
      const value = data.locals[`${f.id}.${v}`];
      const before = prevData ? prevData.locals[`${f.id}.${v}`] : null;
      vars[v].classList.toggle('is-set', value !== null);
      vars[v].classList.toggle('is-new', value !== null && value !== before);
      vars[v].lastElementChild.textContent = value === null ? '?' : value;
    });
  });

  // 輸出（右）：區塊配置前縮成一小塊藏在發出 malloc 的 frame 旁，配置時飛進 heap 的空位並長到完整大小
  const stackRect = rect(scene.stackEl);
  blockDefs.forEach((b) => {
    const { el, wideTag, narrowTag, slot } = scene.blocks[b.id];
    const state = data.blocks[b.id];
    const before = prevData ? prevData.blocks[b.id] : 'idle';
    el.dataset.state = state;
    el.classList.toggle('is-new', state !== before && (state === 'live' || state === 'leak'));
    wideTag.textContent = TAGS[state][0];
    narrowTag.textContent = TAGS[state][1];
    const s = rect(slot);
    const idle = state === 'idle';
    el.style.width = `${idle ? IDLE_BLOCK.w : s.w}px`;
    el.style.height = `${idle ? IDLE_BLOCK.h : s.h}px`;
    const x = idle ? stackRect.right - IDLE_BLOCK.w : s.x;
    const y = idle ? stackRect.y + frameY[b.owner] + 4 : s.y;
    flyTo(el, scene.positions, b.id, x, y, animate);
  });

  // 指標連線：變數所在的 frame 還在、區塊還在才亮；frame 消失連線就淡出，區塊會因此顯示「沒人指著」
  wireDefs.forEach((w) => {
    const { vars } = scene.frames[w.frame];
    const row = vars[w.name];
    const slot = rect(scene.blocks[w.block].slot);
    const x1 = stackRect.right;
    const y1 = stackRect.y + frameY[w.frame] + row.offsetTop + row.offsetHeight / 2;
    scene.ptrs[w.key].setAttribute('d', hPath(x1, y1, slot.x, slot.y + slot.h * w.frac));
    scene.ptrs[w.key].classList.toggle('is-on', data.wireOn[w.key]);
  });

  // 計數：變了就顯示「舊 → 新」並跳一下
  const counts = data.counts;
  Object.keys(scene.ctrs).forEach((k) => setCtr(scene.ctrs[k], counts[k], prevData ? prevData.counts[k] : 0, animate));
  scene.leakedEl.classList.toggle('is-bad', counts.leaked > 0);

  // 段與段之間的連接線：讀的那一拍亮輸入到處理，做的那一拍亮處理到有變動的那一側
  const cIn = rect(scene.cols.input);
  const cProc = rect(scene.cols.process);
  const cOut = rect(scene.cols.output);
  const midX = (r) => r.x + r.w / 2;
  const procX = midX(cProc);
  scene.wires.in.setAttribute('d', vPath(procX, cIn.bottom, procX, cProc.y));
  scene.wires.stack.setAttribute('d', vPath(procX, cProc.bottom, midX(rect(scene.sides.stack)), cOut.y));
  scene.wires.heap.setAttribute('d', vPath(procX, cProc.bottom, midX(rect(scene.sides.heap)), cOut.y));
  scene.wires.in.classList.toggle('is-active', data.beat === 'read');
  scene.wires.stack.classList.toggle('is-active', data.beat === 'act' && Boolean(data.touches.stack));
  scene.wires.heap.classList.toggle('is-active', data.beat === 'act' && Boolean(data.touches.heap));
}

function update(step, prev, animate) {
  scene.current = { step, prev };
  const isCompare = step.data.kind === 'compare';
  scene.runEl.hidden = isCompare;
  scene.compareEl.hidden = !isCompare;
  if (isCompare) return;
  // 第一次畫與 resize 重新對位時不要播轉場，否則元素會從原點滑到位
  if (!animate) scene.runEl.classList.add('is-snap');
  paint(step, prev, animate);
  if (!animate) {
    void scene.runEl.offsetWidth;
    scene.runEl.classList.remove('is-snap');
  }
}

// 視窗寬度一變，各個位置的座標就跟著變；區塊與連線是用絕對座標擺的，得重新對位
window.addEventListener('resize', () => {
  if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
});

export function render(step, stage, prev) {
  const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.runEl);
  if (isFirstFrame) scene = buildScene(stage);
  update(step, prev, !isFirstFrame);
}
