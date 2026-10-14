import { statsHtml, collectStats, setStat, summaryHtml, collectSummary, syncComparison, compareHtml } from './panelkit.js';

// 「時間」主題共用的舞台：每個方案一個面板，面板裡是一張甘特圖式的時間軸。
// 同步與非同步的差別是「同一段時間裡誰在等、誰被卡住」，用時間軸並排比，比用方塊圖更直接。
// 時間游標每一步往右推進，橫條跟著游標長出來；橫條是常駐元素（依 id 第一次出現時建立，之後只改位置與寬度），
// 倒退或跳步時一樣只憑這一步的資料就畫得出完整狀態。
//
// system: { id, title, short?, rule, code?, processLabel, stats: [{ id, label }] }
// legend: 圖例要列的 tone；可以寫 'net'（用預設說明）或 { tone: 'net', label: '主題自己的說法' }
// 每一步每個面板的 view: {
//   action, verdict, wires: { in, out },
//   span, unit,                       時間軸總長與單位（'ms'、'秒'）
//   t,                                時間游標位置
//   lanes: [{ id, name }],            泳道（主執行緒、各支 API…）
//   bars: [{ id, lane, start, end, label, tone }],   tone 決定顏色與圖例
//   marks: [{ id, lane, t, label, tone }],          瞬間發生的事（點擊、回應、逾時）
//   stats: { id: value },
// }

const TONE_LABEL = {
  block: '主執行緒卡住（畫面凍結）',
  work: '執行 JavaScript',
  net: '等待網路回應',
  conn: '佔住一條連線',
  job: '後端工作',
  abort: '請求被取消',
  err: '失敗 / 白做',
  read: '讀取',
  write: '寫入',
  wait: '等待（鎖、確認）',
  repl: '複寫中',
  ok: '正常 / 成功',
};

export function createTimelineRender({ systems, compare, maxLanes, legend }) {
  let scene = null;

  function panelHtml(sys) {
    return `
      <article class="dg-panel tl-panel" data-sys="${sys.id}">
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
              <div class="tl-chart" style="--p:0">
                <div class="tl-axis"><span class="tl-lname"></span><div class="tl-ticks"></div></div>
                ${Array.from({ length: maxLanes }, (_, i) => `<div class="tl-row" data-row="${i}"><span class="tl-lname"></span><div class="tl-track"></div></div>`).join('')}
                <div class="tl-cursor"><span></span></div>
              </div>
            </section>
            <section class="flow-col" data-col="output">
              <h4>輸出 <small>這個做法的結果</small></h4>
              ${statsHtml(sys.stats)}
              <p class="dg-verdict"></p>
            </section>
          </div>
        </div>
      </article>
    `;
  }

  function legendHtml() {
    return `<div class="dg-legend" aria-label="圖例">
      ${legend.map((e) => (typeof e === 'string' ? { tone: e, label: TONE_LABEL[e] } : e)).filter((e) => e.label).map((e) => `<span><i class="tl-ldot" data-tone="${e.tone}"></i>${e.label}</span>`).join('')}
      <span><i class="tl-lcursor"></i>現在時間</span>
    </div>`;
  }

  function collectPanel(root, sys) {
    const q = (s) => root.querySelector(s);
    const rows = Array.from(root.querySelectorAll('.tl-row'));
    return {
      sys,
      root,
      sceneEl: q('.dg-scene'),
      chart: q('.tl-chart'),
      ticks: q('.tl-ticks'),
      cursorLabel: q('.tl-cursor span'),
      rows: rows.map((r) => ({ el: r, name: r.querySelector('.tl-lname'), track: r.querySelector('.tl-track') })),
      action: q('.dg-action'),
      verdict: q('.dg-verdict'),
      cols: Object.fromEntries(['input', 'process', 'output'].map((c) => [c, q(`[data-col="${c}"]`)])),
      wires: { in: q('[data-wire="in"]'), out: q('[data-wire="out"]') },
      stats: collectStats(root, sys.stats),
      bars: new Map(),
      marks: new Map(),
      tickKey: '',
    };
  }

  function buildScene(stage) {
    stage.innerHTML = `
      <div class="dg-run">
        ${legendHtml()}
        ${summaryHtml(systems)}
        <div class="dg-panels" style="--panels:${systems.length}">${systems.map(panelHtml).join('')}</div>
      </div>
      <div class="dg-compare" hidden>${compareHtml(systems, compare)}</div>
    `;
    return {
      stage,
      panelsEl: stage.querySelector('.dg-run'),
      compareEl: stage.querySelector('.dg-compare'),
      summaryCells: collectSummary(stage, systems),
      panels: Array.from(stage.querySelectorAll('.dg-panel')).map((root, i) => collectPanel(root, systems[i])),
      current: null,
    };
  }

  const pct = (v, span) => `${Math.max(0, Math.min(100, (v / span) * 100))}%`;
  const fmt = (v, unit) => (unit === 'ms' ? `${Math.round(v)}ms` : `${Math.round(v * 10) / 10} ${unit}`);

  // 橫條與標記是依 id 建立的常駐元素：第一次出現時才建立，之後只改位置與寬度，所以會連續長出來
  function ensure(map, id, cls, html) {
    let el = map.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      map.set(id, el);
    }
    return el;
  }

  function updatePanel(panel, v, prevV, animate) {
    panel.action.textContent = v.action || '';
    panel.verdict.textContent = v.verdict || '';
    const laneRow = {};
    panel.rows.forEach((row, i) => {
      const lane = v.lanes[i];
      row.el.hidden = !lane;
      row.name.textContent = lane ? lane.name : '';
      if (lane) laneRow[lane.id] = row;
    });

    // 時間軸刻度：只在總長或單位改變時重排
    const key = `${v.span}${v.unit}`;
    if (panel.tickKey !== key) {
      panel.tickKey = key;
      panel.ticks.innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span style="left:${f * 100}%">${fmt(v.span * f, v.unit)}</span>`).join('');
    }
    panel.chart.style.setProperty('--p', String(Math.min(1, v.t / v.span)));
    panel.cursorLabel.textContent = fmt(v.t, v.unit);

    const seen = new Set();
    v.bars.forEach((b) => {
      seen.add(b.id);
      const row = laneRow[b.lane];
      const el = ensure(panel.bars, b.id, 'tl-bar', '<span></span>');
      const fresh = !el.isConnected;
      if (row && el.parentNode !== row.track) row.track.appendChild(el);
      el.dataset.tone = b.tone;
      el.firstElementChild.textContent = b.label || '';
      el.style.left = pct(b.start, v.span);
      const shown = v.t > b.start;
      // 新建立的橫條先從寬度 0 開始，下一個畫面再設目標寬度，才看得到它長出來
      if (fresh && animate) {
        el.style.width = '0%';
        void el.offsetWidth;
      }
      el.style.width = shown ? pct(Math.min(b.end, v.t) - b.start, v.span) : '0%';
      el.classList.toggle('is-hidden', !shown);
      el.classList.toggle('is-done', v.t >= b.end);
    });
    panel.bars.forEach((el, id) => { if (!seen.has(id)) el.classList.add('is-hidden'); });

    const seenMarks = new Set();
    (v.marks || []).forEach((m) => {
      seenMarks.add(m.id);
      const row = laneRow[m.lane];
      const el = ensure(panel.marks, m.id, 'tl-mark', '<i></i><span></span>');
      if (row && el.parentNode !== row.track) row.track.appendChild(el);
      el.dataset.tone = m.tone;
      el.lastElementChild.textContent = m.label;
      el.style.left = pct(m.t, v.span);
      // 標記靠右半邊時文字改往左長，才不會超出時間軸
      el.classList.toggle('is-flip', m.t / v.span > 0.6);
      const was = el.classList.contains('is-on');
      const on = v.t >= m.t;
      el.classList.toggle('is-on', on);
      if (on && !was && animate) el.classList.add('is-new');
      else el.classList.remove('is-new');
    });
    panel.marks.forEach((el, id) => { if (!seenMarks.has(id)) el.classList.remove('is-on'); });

    panel.sys.stats.forEach((s) => setStat(panel.stats[s.id], v.stats[s.id], prevV ? prevV.stats[s.id] : undefined, animate));

    const c = Object.fromEntries(Object.entries(panel.cols).map(([k, el]) => {
      const r = el.getBoundingClientRect();
      const o = panel.sceneEl.getBoundingClientRect();
      return [k, { mid: r.left + r.width / 2 - o.left, top: r.top - o.top, bottom: r.bottom - o.top }];
    }));
    const wire = (x1, y1, x2, y2) => `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
    panel.wires.in.setAttribute('d', wire(c.input.mid, c.input.bottom, c.process.mid, c.process.top));
    panel.wires.out.setAttribute('d', wire(c.process.mid, c.process.bottom, c.output.mid, c.output.top));
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
    // 跳步或倒退時不播橫條生長的轉場，否則會從錯的長度滑過去
    scene.panelsEl.classList.toggle('is-snap', !animate);
    scene.panels.forEach((panel, i) => updatePanel(panel, views[i], prevPanels ? prevPanels[i] : null, animate));
    if (!animate) {
      void scene.panelsEl.offsetWidth;
      scene.panelsEl.classList.remove('is-snap');
    }
    syncComparison({ systems, panels: scene.panels, summaryCells: scene.summaryCells, views, prevViews: prevPanels, animate });
  }

  // 輸入、處理、輸出之間的連接線是用實際版面量出來的，視窗寬度一變就得重量
  window.addEventListener('resize', () => {
    if (scene && scene.current && scene.stage.isConnected) update(scene.current.step, scene.current.prev, false);
  });

  return function render(step, stage, prev) {
    const isFirstFrame = !scene || scene.stage !== stage || !stage.contains(scene.panelsEl);
    // 播放器傳進來的 prev 永遠是時間軸上的前一步，就算使用者是拖時間軸跳過來的也一樣；
    // 所以另外記住上一次真正畫的是哪一步，只有「剛好往後一步」才播生長轉場，倒退與跳步直接定格
    const forward = !isFirstFrame && prev && scene.lastStep === prev && step.data.kind === 'run' && prev.data.kind === 'run';
    if (isFirstFrame) scene = buildScene(stage);
    update(step, prev, Boolean(forward));
    scene.lastStep = step;
  };
}
