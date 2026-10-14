import { flyTo, pop } from './motion.js';

// 架構比較主題共用的舞台：每個方案一個面板，面板裡是「方塊 + 依賴箭頭 + 移動的請求」組成的架構圖。
// 跟其他主題一樣，場景只建一次，之後每一步只改 class、文字與位置；請求是常駐 token，用 flyTo 在元件之間移動。
// 主題只提供資料（systems 與 steps），畫法集中在這裡，各架構主題的視覺語言才會一致：
// 同一種箭頭在每個主題都代表同一件事，讀者學一次就能看懂全部。
//
// system: {
//   id, title, rule, code?, processLabel, cols, rows,
//   groups?: [{ id, name, area: [row, col, rowSpan, colSpan], kind? }], 外框；kind 'unit' 是部署單元，'boundary' 是程式碼裡的模組邊界
//   nodes: [{ id, name, sub?, ring, cell: [row, col] }],            ring 決定顏色（core、app、adapter、infra、ui、test…）
//   edges: [{ id, from, to, kind }],                                kind：dep 具體依賴、iface 介面依賴、net 網路呼叫、bind 資料綁定、event 事件
//   tokens: [{ id, tone }],                                         會移動的請求或資料
//   stats: [{ id, label }],                                         輸出區的計數
// }
// compare: { title, rows: [{ label, values, highlight?, better? }] }；better 為 'low' 或 'high' 時，該列的數字畫成長條並標出最好、最差
// 每一步每個面板的 view: { action, verdict, wires: { in, out }, nodes: { id: { show, state, note, badge } },
//   edges: { id: { show, state } }, groups: { id: { state, badge } }, tokens: { id: { at, label } }, stats: { id: value } }

const KIND_MARK = { iface: 'h', dep: 'a', net: 'a', bind: 'a', event: 'a', call: 'a' };

// 圖例只列出這個主題真的用到的符號：讀者不用記沒出現的東西
const KIND_LABEL = { dep: '依賴具體類別', iface: '依賴介面（可替換）', net: '網路呼叫', bind: '資料綁定', event: '事件通知' };
const RING_LABEL = { core: '核心邏輯', app: '應用 / 組裝', module: '功能模組', ui: '畫面元件', adapter: '轉接層', infra: '基礎設施', test: '測試' };

const shortTitle = (sys) => sys.short || sys.title.split('（')[0];
const numOf = (v) => {
  const m = typeof v === 'number' ? [String(v)] : String(v ?? '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// 這一拍「跟其他方案不一樣」的面板：某個計數這一拍剛變動，而且多數方案一致、只有它不同。
// 三個方案各不相同時不標，避免每一拍都在閃。
function outliers(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const [mode, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n < 2 || n === values.length) return [];
  return values.map((v, i) => (v !== mode ? i : -1)).filter((i) => i >= 0);
}

export function createDiagramRender({ systems, compare }) {
  let scene = null;

  // 英文類別名稱只在大小寫交界處斷行（Order<wbr>Service），窄欄位才不會把一個字從中間切開
  function nodeHtml(n) {
    return `<div class="dg-node" data-node="${n.id}" data-ring="${n.ring}" style="grid-row:${n.cell[0]};grid-column:${n.cell[1]}">
      <b class="dg-name">${n.name.replace(/([a-z])([A-Z])/g, '$1<wbr>$2')}</b>${n.sub ? `<span class="dg-sub">${n.sub}</span>` : ''}<span class="dg-note"></span><span class="dg-badge"></span>
    </div>`;
  }

  function groupHtml(g) {
    const [r, c, rs, cs] = g.area;
    return `<div class="dg-group" data-group="${g.id}" data-kind="${g.kind || 'unit'}" style="grid-row:${r} / span ${rs};grid-column:${c} / span ${cs}">
      <span class="dg-gname">${g.name}</span><span class="dg-gbadge"></span>
    </div>`;
  }

  function panelHtml(sys) {
    const mark = (name, cls) => `<marker id="dg-${sys.id}-${name}" class="${cls}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">${
      name.startsWith('h') ? '<path d="M1 1 L9 5 L1 9 z" class="dg-head-hollow"></path>' : '<path d="M0 0 L10 5 L0 10 z"></path>'
    }</marker>`;
    return `
      <article class="dg-panel" data-sys="${sys.id}">
        <h3 class="dg-title">${sys.title}</h3>
        <p class="dg-rule">${sys.rule}</p>
        ${sys.code ? `<pre class="snippet dg-code">${sys.code}</pre>` : ''}
        <div class="dg-scene">
          <svg class="dg-wires" aria-hidden="true"><path class="dg-wire" data-wire="in"></path><path class="dg-wire" data-wire="out"></path></svg>
          <div class="flow">
            <section class="flow-col flow-col-inline" data-col="input">
              <h4>輸入 <small>這一拍發生的事</small></h4>
              <p class="dg-action"></p>
            </section>
            <section class="flow-col" data-col="process">
              <h4>處理 <small>${sys.processLabel}</small></h4>
              <div class="dg-diagram" style="--cols:${sys.cols};--rows:${sys.rows}">
                ${(sys.groups || []).map(groupHtml).join('')}
                <svg class="dg-edges" aria-hidden="true">
                  <defs>${mark('a', 'dg-mark')}${mark('a-on', 'dg-mark is-on')}${mark('h', 'dg-mark')}${mark('h-on', 'dg-mark is-on')}</defs>
                  ${sys.edges.map((e) => `<path class="dg-edge kind-${e.kind}" data-edge="${e.id}"></path>`).join('')}
                </svg>
                ${sys.nodes.map(nodeHtml).join('')}
                <div class="dg-tokens">${(sys.tokens || []).map((t) => `<span class="dg-token is-gone" data-tok="${t.id}" data-tone="${t.tone}"><span class="chip"></span></span>`).join('')}</div>
              </div>
            </section>
            <section class="flow-col" data-col="output">
              <h4>輸出 <small>這個做法的結果</small></h4>
              <dl class="dg-stats">${sys.stats.map((s) => `<div class="dg-stat" data-stat="${s.id}"><dt>${s.label}</dt><dd>—</dd></div>`).join('')}</dl>
              <p class="dg-verdict"></p>
            </section>
          </div>
        </div>
      </article>
    `;
  }

  // 對照表：標了 better 的數字列加長條，最好的一格標綠、最差的標紅，掃一眼就知道結論
  function compareCells(r) {
    const nums = r.values.map(numOf);
    if (!r.better || nums.some((n) => n === null)) return r.values.map((v) => `<td>${v}</td>`).join('');
    const max = Math.max(...nums, 1);
    const best = r.better === 'low' ? Math.min(...nums) : Math.max(...nums);
    const worst = r.better === 'low' ? Math.max(...nums) : Math.min(...nums);
    const tie = best === worst;
    return r.values.map((v, i) => {
      const cls = tie ? '' : nums[i] === best ? 'is-best' : nums[i] === worst ? 'is-worst' : '';
      return `<td class="dg-cv ${cls}"><span>${v}</span><span class="dg-bar"><i style="width:${Math.max(4, (nums[i] / max) * 100)}%"></i></span></td>`;
    }).join('');
  }

  function compareHtml() {
    return `
      <h3 class="dg-title">${compare.title}</h3>
      <table class="grid-table dg-compare-table">
        <thead><tr><th></th>${systems.map((s) => `<th>${s.title}</th>`).join('')}</tr></thead>
        <tbody>${compare.rows.map((r) => `<tr class="${r.highlight ? 'row-highlight' : ''}"><th>${r.label}</th>${compareCells(r)}</tr>`).join('')}</tbody>
      </table>
    `;
  }

  function legendHtml() {
    const kinds = [...new Set(systems.flatMap((s) => s.edges.map((e) => e.kind)))].filter((k) => KIND_LABEL[k]);
    const rings = [...new Set(systems.flatMap((s) => s.nodes.map((n) => n.ring)))].filter((r) => RING_LABEL[r]);
    const hasUnit = systems.some((s) => (s.groups || []).some((g) => (g.kind || 'unit') === 'unit'));
    const hasBoundary = systems.some((s) => (s.groups || []).some((g) => g.kind === 'boundary'));
    const line = (k) => `<svg viewBox="0 0 34 10" aria-hidden="true"><path class="dg-edge kind-${k}" d="M2 5 L26 5"></path><path class="dg-lhead${k === 'iface' ? ' is-hollow' : ''}" d="M25 1 L33 5 L25 9 z"></path></svg>`;
    return `<div class="dg-legend" aria-label="圖例">
      ${kinds.map((k) => `<span>${line(k)}${KIND_LABEL[k]}</span>`).join('')}
      ${rings.map((r) => `<span><i class="dg-ldot" data-ring="${r}"></i>${RING_LABEL[r]}</span>`).join('')}
      ${hasUnit ? '<span><i class="dg-lbox"></i>部署單元</span>' : ''}
      ${hasBoundary ? '<span><i class="dg-lbox is-boundary"></i>模組邊界</span>' : ''}
    </div>`;
  }

  // 手機上面板改成直排，讀到第三個面板時已經忘了第一個的數字；這條摘要固定在舞台頂端，把各方案的計數並排
  function summaryHtml() {
    const stats = systems[0].stats;
    return `<table class="dg-summary" aria-label="各方案計數並排">
      <thead><tr><th></th>${systems.map((s) => `<th>${shortTitle(s)}</th>`).join('')}</tr></thead>
      <tbody>${stats.map((st) => `<tr data-stat="${st.id}"><th>${st.label}</th>${systems.map(() => '<td>—</td>').join('')}</tr>`).join('')}</tbody>
    </table>`;
  }

  function collectPanel(root, sys) {
    const q = (s) => root.querySelector(s);
    const byAttr = (attr, list) => Object.fromEntries(list.map((x) => [x.id, q(`[data-${attr}="${x.id}"]`)]));
    return {
      sys,
      root,
      sceneEl: q('.dg-scene'),
      diagram: q('.dg-diagram'),
      action: q('.dg-action'),
      verdict: q('.dg-verdict'),
      cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, q(`[data-col="${c}"]`)])),
      wires: { in: q('[data-wire="in"]'), out: q('[data-wire="out"]') },
      nodes: byAttr('node', sys.nodes),
      groups: byAttr('group', sys.groups || []),
      edges: byAttr('edge', sys.edges),
      tokens: byAttr('tok', sys.tokens || []),
      stats: Object.fromEntries(sys.stats.map((s) => [s.id, q(`[data-stat="${s.id}"] dd`)])),
      positions: new Map(),
    };
  }

  function buildScene(stage) {
    stage.innerHTML = `
      <div class="dg-run">
        ${legendHtml()}
        ${summaryHtml()}
        <div class="dg-panels" style="--panels:${systems.length}">${systems.map(panelHtml).join('')}</div>
      </div>
      <div class="dg-compare" hidden>${compareHtml()}</div>
    `;
    const roots = Array.from(stage.querySelectorAll('.dg-panel'));
    const summary = stage.querySelector('.dg-summary');
    return {
      stage,
      panelsEl: stage.querySelector('.dg-run'),
      summaryCells: Object.fromEntries(systems[0].stats.map((st) => [st.id, Array.from(summary.querySelectorAll(`tr[data-stat="${st.id}"] td`))])),
      compareEl: stage.querySelector('.dg-compare'),
      panels: roots.map((root, i) => collectPanel(root, systems[i])),
      current: null,
    };
  }

  // 箭頭從方塊邊緣出發、停在另一個方塊邊緣，才不會被方塊蓋住；同一對方塊互指時兩條線錯開
  function edgePath(a, b, offset) {
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;
    const clip = (r) => Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
    const ta = clip(a) + 4 / len;
    const tb = clip(b) + 6 / len;
    const x1 = ca.x + dx * ta + nx;
    const y1 = ca.y + dy * ta + ny;
    const x2 = cb.x - dx * tb + nx;
    const y2 = cb.y - dy * tb + ny;
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  function wirePath(x1, y1, x2, y2) {
    const bend = (y2 - y1) / 2;
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  }

  function setStat(dd, value, before, animate) {
    const text = value === undefined || value === null ? '—' : String(value);
    const changed = before !== undefined && before !== null && before !== value && value !== undefined && value !== null;
    if (changed && typeof value === 'number' && typeof before === 'number') {
      dd.innerHTML = `<span class="delta"><s>${before}</s> → <b>${value}</b></span>`;
    } else {
      dd.textContent = text;
    }
    if (changed || (before == null && value != null)) pop(dd, animate);
  }

  function updatePanel(panel, v, prevV, animate) {
    const { sys } = panel;
    panel.action.textContent = v.action || '';
    panel.verdict.textContent = v.verdict || '';

    sys.nodes.forEach((n) => {
      const el = panel.nodes[n.id];
      const s = v.nodes[n.id] || {};
      el.classList.toggle('is-hidden', !s.show);
      el.dataset.state = s.state || '';
      el.querySelector('.dg-note').textContent = s.note || '';
      el.querySelector('.dg-badge').textContent = s.badge || '';
    });
    (sys.groups || []).forEach((g) => {
      const el = panel.groups[g.id];
      const s = (v.groups && v.groups[g.id]) || {};
      el.dataset.state = s.state || '';
      el.querySelector('.dg-gbadge').textContent = s.badge || '';
      el.style.setProperty('--reps', String(s.reps || 1));
    });

    const origin = panel.diagram.getBoundingClientRect();
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    };

    const pairs = new Set(sys.edges.map((e) => `${e.from}>${e.to}`));
    sys.edges.forEach((e) => {
      const el = panel.edges[e.id];
      const s = v.edges[e.id] || {};
      const show = Boolean(s.show) && v.nodes[e.from]?.show && v.nodes[e.to]?.show;
      el.classList.toggle('is-hidden', !show);
      el.dataset.state = s.state || '';
      const on = s.state === 'on';
      el.setAttribute('marker-end', `url(#dg-${sys.id}-${KIND_MARK[e.kind]}${on ? '-on' : ''})`);
      if (show) el.setAttribute('d', edgePath(rel(panel.nodes[e.from]), rel(panel.nodes[e.to]), pairs.has(`${e.to}>${e.from}`) ? 5 : 0));
    });

    // 同一個方塊上有多個 token 時排成一列，貼在方塊右下角：右上角留給狀態標籤，兩者才不會疊在一起
    const perNode = {};
    (sys.tokens || []).forEach((t) => {
      const el = panel.tokens[t.id];
      const s = v.tokens && v.tokens[t.id];
      // hidden：先隱形地停在出發點，下一拍出現時才看得到它從那裡飛出去
      el.classList.toggle('is-gone', !s || Boolean(s.hidden));
      if (!s) return;
      el.firstElementChild.textContent = s.label;
      const r = rel(panel.nodes[s.at]);
      const i = s.hidden ? 0 : perNode[s.at] || 0;
      if (!s.hidden) perNode[s.at] = i + 1;
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
      flyTo(el, panel.positions, t.id, r.x + r.w - tw - 2 - i * (tw + 3), r.y + r.h - th / 2, animate);
    });

    sys.stats.forEach((s) => setStat(panel.stats[s.id], v.stats[s.id], prevV ? prevV.stats[s.id] : undefined, animate));

    const c = Object.fromEntries(Object.entries(panel.cols).map(([k, el]) => {
      const r = el.getBoundingClientRect();
      const o = panel.sceneEl.getBoundingClientRect();
      return [k, { mid: r.left + r.width / 2 - o.left, top: r.top - o.top, bottom: r.bottom - o.top }];
    }));
    panel.wires.in.setAttribute('d', wirePath(c.input.mid, c.input.bottom, c.process.mid, c.process.top));
    panel.wires.out.setAttribute('d', wirePath(c.process.mid, c.process.bottom, c.output.mid, c.output.top));
    panel.wires.in.classList.toggle('is-active', Boolean(v.wires && v.wires.in));
    panel.wires.out.classList.toggle('is-active', Boolean(v.wires && v.wires.out));
  }

  function update(step, prev, animate) {
    scene.current = { step, prev };
    const isCompare = step.data.kind === 'compare';
    scene.panelsEl.hidden = isCompare;
    scene.compareEl.hidden = !isCompare;
    if (isCompare) return;
    const prevPanels = prev && prev.data.kind === 'run' ? prev.data.panels : null;
    const views = step.data.panels;
    scene.panels.forEach((panel, i) => updatePanel(panel, views[i], prevPanels ? prevPanels[i] : null, animate));

    const diffPanels = new Set();
    systems[0].stats.forEach((st) => {
      const values = views.map((v) => v.stats[st.id]);
      const changed = views.some((v, i) => v.stats[st.id] != null && (!prevPanels || prevPanels[i].stats[st.id] !== v.stats[st.id]));
      const odd = changed && values.every((v) => v != null) ? outliers(values.map(String)) : [];
      odd.forEach((i) => diffPanels.add(i));
      scene.summaryCells[st.id].forEach((td, i) => {
        const text = values[i] == null ? '—' : String(values[i]);
        if (td.textContent !== text) {
          td.textContent = text;
          pop(td, animate);
        }
        td.classList.toggle('is-diff', odd.includes(i));
      });
      scene.panels.forEach((panel, i) => panel.stats[st.id].classList.toggle('is-diff', odd.includes(i)));
    });
    scene.panels.forEach((panel, i) => panel.root.classList.toggle('is-diff', diffPanels.has(i)));
  }

  // 視窗寬度一變，方塊位置就跟著變；箭頭與 token 是用絕對座標擺的，得重新對位
  window.addEventListener('resize', () => {
    if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
  });

  return function render(step, stage, prev) {
    const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
    if (isFirstFrame) scene = buildScene(stage);
    update(step, prev, !isFirstFrame);
  };
}
