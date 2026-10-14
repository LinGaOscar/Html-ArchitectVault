import { pop } from './motion.js';

// 「多個方案並排比較」的主題共用的面板零件：輸出區計數、手機比較摘要、「不同」標記、對照表。
// diagram.js（架構圖）與 timeline.js（時間軸）都用它，比較的呈現方式才會在每個主題長得一樣。
// systems[i].stats: [{ id, label }]，每一步每個面板的 view.stats: { id: value }

export const shortTitle = (sys) => sys.short || sys.title.split('（')[0];

export const numOf = (v) => {
  const m = typeof v === 'number' ? [String(v)] : String(v ?? '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// 這一拍「跟其他方案不一樣」的面板：多數方案一致、只有它不同。三個方案各不相同時不標，避免每一拍都在閃。
function outliers(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const [mode, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n < 2 || n === values.length) return [];
  return values.map((v, i) => (v !== mode ? i : -1)).filter((i) => i >= 0);
}

export function statsHtml(stats) {
  return `<dl class="dg-stats">${stats.map((s) => `<div class="dg-stat" data-stat="${s.id}"><dt>${s.label}</dt><dd>—</dd></div>`).join('')}</dl>`;
}

export function collectStats(root, stats) {
  return Object.fromEntries(stats.map((s) => [s.id, root.querySelector(`[data-stat="${s.id}"] dd`)]));
}

export function setStat(dd, value, before, animate) {
  const text = value === undefined || value === null ? '—' : String(value);
  const changed = before !== undefined && before !== null && before !== value && value !== undefined && value !== null;
  if (changed && typeof value === 'number' && typeof before === 'number') {
    dd.innerHTML = `<span class="delta"><s>${before}</s> → <b>${value}</b></span>`;
  } else {
    dd.textContent = text;
  }
  if (changed || (before == null && value != null)) pop(dd, animate);
}

// 手機上面板改成直排，讀到第三個面板時已經忘了第一個的數字；這條摘要固定在舞台頂端，把各方案的計數並排
export function summaryHtml(systems) {
  return `<table class="dg-summary" aria-label="各方案計數並排">
    <thead><tr><th></th>${systems.map((s) => `<th>${shortTitle(s)}</th>`).join('')}</tr></thead>
    <tbody>${systems[0].stats.map((st) => `<tr data-stat="${st.id}"><th>${st.label}</th>${systems.map(() => '<td>—</td>').join('')}</tr>`).join('')}</tbody>
  </table>`;
}

export function collectSummary(root, systems) {
  const table = root.querySelector('.dg-summary');
  return Object.fromEntries(systems[0].stats.map((st) => [st.id, Array.from(table.querySelectorAll(`tr[data-stat="${st.id}"] td`))]));
}

// panels: [{ root, stats: { id: dd } }]；更新摘要表，並標出這一拍結果跟其他方案不同的面板
export function syncComparison({ systems, panels, summaryCells, views, prevViews, animate }) {
  const diffPanels = new Set();
  systems[0].stats.forEach((st) => {
    const values = views.map((v) => v.stats[st.id]);
    const changed = views.some((v, i) => v.stats[st.id] != null && (!prevViews || prevViews[i].stats[st.id] !== v.stats[st.id]));
    const odd = changed && values.every((v) => v != null) ? outliers(values.map(String)) : [];
    odd.forEach((i) => diffPanels.add(i));
    summaryCells[st.id].forEach((td, i) => {
      const text = values[i] == null ? '—' : String(values[i]);
      if (td.textContent !== text) {
        td.textContent = text;
        pop(td, animate);
      }
      td.classList.toggle('is-diff', odd.includes(i));
    });
    panels.forEach((panel, i) => panel.stats[st.id].classList.toggle('is-diff', odd.includes(i)));
  });
  panels.forEach((panel, i) => panel.root.classList.toggle('is-diff', diffPanels.has(i)));
}

// 對照表：標了 better（'low' 或 'high'）的數字列加長條，最好的一格標綠、最差的標紅，掃一眼就知道結論
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

export function compareHtml(systems, compare) {
  return `
    <h3 class="dg-title">${compare.title}</h3>
    <table class="grid-table dg-compare-table">
      <thead><tr><th></th>${systems.map((s) => `<th>${s.title}</th>`).join('')}</tr></thead>
      <tbody>${compare.rows.map((r) => `<tr class="${r.highlight ? 'row-highlight' : ''}"><th>${r.label}</th>${compareCells(r)}</tr>`).join('')}</tbody>
    </table>
  `;
}
