// 畫面互動模式動畫：MVC、MVP、MVVM 做同一個購物車畫面，三個面板同步前進。
// 情境：使用者把數量從 2 改成 3，「總價」和「購物車徽章」兩處畫面都要更新。
// 安排三件事讓差異浮現：
// 1. 一次更新的資料流：誰轉手、誰主動推畫面、誰靠綁定自動同步。
// 2. 多加一個也要顯示總價的「結帳按鈕」：哪些既有程式要改。
// 3. 測試畫面邏輯（數量 × 單價）：要不要真的畫面。
// 「要改哪些元件」「測試要真畫面或假物件」都由 graph.js 依箭頭推導，不手寫。

import { diffNodes, testNeeds } from '../../assets/js/engine/graph.js';
import { makeSim, liveGraph, edgeIds, view } from '../../assets/js/engine/archsim.js';

const PRICE = 300;
const QTY_BEFORE = 2;
const QTY_AFTER = 3;
const money = (n) => `NT$${n}`;

const STATS = [
  { id: 'hops', label: '畫面更新完成要幾拍' },
  { id: 'pushes', label: '中間層主動更新畫面的次數' },
  { id: 'changed', label: '加結帳按鈕要改的既有元件' },
  { id: 'realUi', label: '測畫面邏輯要真畫面' },
  { id: 'mocks', label: '要準備的假 View' },
];
const TOKENS = [{ id: 'q', tone: 'req' }, { id: 't', tone: 'data' }, { id: 'b', tone: 'data' }, { id: 'c', tone: 'data' }];

// 三個面板共用同一組畫面元件，位置也一樣，讀者才看得出差別只在中間那一層
const views = [
  { id: 'input', name: '數量輸入框', sub: 'View', ring: 'ui', cell: [1, 1] },
  { id: 'total', name: '總價', sub: 'View', ring: 'ui', cell: [1, 2] },
  { id: 'badge', name: '購物車徽章', sub: 'View', ring: 'ui', cell: [1, 3] },
  { id: 'checkout', name: '結帳按鈕', sub: 'View', ring: 'ui', cell: [3, 3], hidden: true },
  { id: 'model', name: 'Cart Model', sub: '數量、單價', ring: 'core', cell: [3, 2] },
  { id: 'test', name: '單元測試', ring: 'test', cell: [2, 1], hidden: true },
];
const mid = (name, sub) => ({ id: 'mid', name, sub, ring: 'app', cell: [2, 2] });

export const systems = [
  {
    id: 'mvc',
    title: 'MVC',
    rule: 'Controller 接收輸入、改資料；畫面自己盯著資料，資料一變就自己重畫。',
    processLabel: '箭頭 = 誰依賴誰',
    cols: 3,
    rows: 3,
    nodes: [...views, mid('Controller', '處理輸入')],
    edges: [
      { id: 'in', from: 'mid', to: 'input', kind: 'dep' },
      { id: 'mm', from: 'mid', to: 'model', kind: 'dep' },
      { id: 'tv', from: 'total', to: 'model', kind: 'dep' },
      { id: 'bv', from: 'badge', to: 'model', kind: 'dep' },
      { id: 'cv', from: 'checkout', to: 'model', kind: 'dep', hidden: true },
      { id: 'tm', from: 'test', to: 'mid', kind: 'dep', hidden: true },
    ],
    // 每一拍：token 在哪、哪幾條線在傳資料；push 標記「中間層主動去更新畫面」
    beats: [
      { q: 'input', on: [] },
      { q: 'mid', on: ['in'] },
      { q: 'model', on: ['mm'] },
      { q: 'model', t: 'total', b: 'badge', src: 'model', on: ['tv', 'bv'], note: 'Model 通知觀察者，View 自己來讀' },
    ],
    addView: ['checkout', 'cv'],
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'mvp',
    title: 'MVP',
    rule: '畫面很被動，只把輸入交給 Presenter；Presenter 改完資料，再一個一個去更新畫面。',
    processLabel: '箭頭 = 誰依賴誰',
    cols: 3,
    rows: 3,
    nodes: [...views, mid('Presenter', '畫面邏輯')],
    edges: [
      { id: 'iv', from: 'input', to: 'mid', kind: 'dep' },
      { id: 'pi', from: 'mid', to: 'input', kind: 'iface' },
      { id: 'pt', from: 'mid', to: 'total', kind: 'iface' },
      { id: 'pb', from: 'mid', to: 'badge', kind: 'iface' },
      { id: 'pc', from: 'mid', to: 'checkout', kind: 'iface', hidden: true },
      { id: 'mm', from: 'mid', to: 'model', kind: 'dep' },
      { id: 'tm', from: 'test', to: 'mid', kind: 'dep', hidden: true },
    ],
    beats: [
      { q: 'input', on: [] },
      { q: 'mid', on: ['iv'] },
      { q: 'model', on: ['mm'] },
      { q: 'mid', on: ['mm'], note: '拿到新總價，準備更新畫面' },
      { q: 'mid', t: 'total', b: 'badge', src: 'mid', on: ['pt', 'pb'], push: ['total', 'badge'], note: '呼叫 setTotal()、setBadge()' },
    ],
    addView: ['checkout', 'pc'],
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'mvvm',
    title: 'MVVM',
    rule: '畫面宣告「我要顯示哪個值」，值一改就自動同步到所有畫面；ViewModel 不需要認識任何畫面。',
    processLabel: '箭頭 = 誰依賴誰',
    cols: 3,
    rows: 3,
    nodes: [...views, mid('ViewModel', 'qty、total 屬性')],
    edges: [
      { id: 'ib', from: 'input', to: 'mid', kind: 'bind' },
      { id: 'tb', from: 'total', to: 'mid', kind: 'bind' },
      { id: 'bb', from: 'badge', to: 'mid', kind: 'bind' },
      { id: 'cb', from: 'checkout', to: 'mid', kind: 'bind', hidden: true },
      { id: 'mm', from: 'mid', to: 'model', kind: 'dep' },
      { id: 'tm', from: 'test', to: 'mid', kind: 'dep', hidden: true },
    ],
    beats: [
      { q: 'input', on: [] },
      { q: 'mid', on: ['ib'], note: '綁定把輸入寫進 qty' },
      { q: 'mid', t: 'total', b: 'badge', src: 'mid', on: ['tb', 'bb', 'mm'], note: 'total 重算，綁定自動更新畫面' },
    ],
    addView: ['checkout', 'cb'],
    tokens: TOKENS,
    stats: STATS,
  },
];

const nameOf = (sys, id) => sys.nodes.find((n) => n.id === id).name;
const names = (sys, ids) => ids.map((id) => nameOf(sys, id)).join('、') || '無';
const sims = systems.map(makeSim);
const each = (fn) => sims.map((sim, i) => fn(sim, sim.sys, i));
export const steps = [];
function push(id, chapter, duration, caption, beats) {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: sims.map((sim, i) => view(sim, beats[i])) } });
}

// 畫面上顯示的值：數量改了之後，總價與徽章要等資料流到了才變
const shown = (qtyIn, qtyOut) => ({
  input: `數量 ${qtyIn}`,
  total: money(qtyOut * PRICE),
  badge: `${qtyOut} 件`,
  model: `qty = ${qtyOut}`,
});
sims.forEach((sim) => { sim.notes = shown(QTY_BEFORE, QTY_BEFORE); });

// ---- 認識三種模式 ----
const C1 = '三種模式';
push('intro', C1, 4800,
  `三個面板做同一個購物車畫面：單價 ${money(PRICE)}，目前數量 ${QTY_BEFORE}。上排是畫面元件（View），下面是資料（Model），差別在中間那一層：Controller、Presenter、ViewModel。點線是資料綁定，虛線是依賴介面。`,
  each(() => ({ action: '同一個購物車畫面' })));

// ---- 一次更新 ----
const C2 = '一次更新';
const flowLen = Math.max(...systems.map((s) => s.beats.length));
const reached = sims.map(() => new Set());
const pushes = sims.map(() => 0);
const captions = [
  `使用者把數量從 ${QTY_BEFORE} 改成 ${QTY_AFTER}。三邊的事件都從輸入框出發。`,
  'MVC 由 Controller 接手輸入；MVP 由 View 把事件交給 Presenter；MVVM 不需要寫事件處理，雙向綁定直接把新數量寫進 ViewModel 的 qty。',
  `MVC、MVP 把新數量寫進 Model。MVVM 的 ViewModel 重算 total，綁定機制同時把 ${money(QTY_AFTER * PRICE)} 推到「總價」和「徽章」，畫面已經更新完了。`,
  'MVC 的 Model 發出變更通知，總價與徽章這兩個 View 自己來讀新值重畫。MVP 的 Presenter 拿到結果，還要再主動更新畫面。',
  'MVP 的 Presenter 一個一個呼叫 view.setTotal()、view.setBadge()。畫面上有幾個要更新的地方，Presenter 就要寫幾行。',
];
// 某一拍才出現的結果 token（新總價、新件數），前一拍先隱形地停在出發點，出現時才看得到它從那裡飛出去
const srcOf = (sys, k) => {
  const next = sys.beats[k + 1];
  return next && next.t ? next.src : null;
};
for (let k = 0; k < flowLen; k += 1) {
  const lastBeat = k === flowLen - 1;
  push(`flow-${k}`, C2, lastBeat ? 5200 : 3600, captions[k], each((sim, sys, i) => {
    const fresh = k < sys.beats.length;
    const b = sys.beats[Math.min(k, sys.beats.length - 1)];
    const done = k >= sys.beats.length - 1;
    if (fresh) {
      [b.q, b.t, b.b].filter(Boolean).forEach((id) => reached[i].add(id));
      pushes[i] += (b.push || []).length;
    }
    sim.stats.hops = Math.min(k + 1, sys.beats.length);
    sim.stats.pushes = pushes[i];
    // 畫面上的值只在資料真的流到那裡時才改變
    const modelNow = reached[i].has('model') || (b.on || []).includes('mm');
    const viewsNow = reached[i].has('total');
    sim.notes = {
      ...sim.notes,
      input: `數量 ${QTY_AFTER}`,
      model: `qty = ${modelNow ? QTY_AFTER : QTY_BEFORE}`,
      total: money((viewsNow ? QTY_AFTER : QTY_BEFORE) * PRICE),
      badge: `${viewsNow ? QTY_AFTER : QTY_BEFORE} 件`,
    };
    if (!fresh) {
      return { action: `數量 ${QTY_BEFORE} → ${QTY_AFTER}`, state: { total: 'ok', badge: 'ok' }, wires: { in: false, out: true }, verdict: '畫面早就更新完成' };
    }
    const tokens = { q: { at: b.q, label: `qty ${QTY_AFTER}` } };
    if (b.t) {
      tokens.t = { at: b.t, label: money(QTY_AFTER * PRICE) };
      tokens.b = { at: b.b, label: `${QTY_AFTER} 件` };
    }
    const src = srcOf(sys, k);
    if (src) {
      tokens.t = { at: src, label: money(QTY_AFTER * PRICE), hidden: true };
      tokens.b = { at: src, label: `${QTY_AFTER} 件`, hidden: true };
    }
    const state = { [b.q]: 'active' };
    // 主動被推的畫面（MVP）用閃動標出；自己觀察或靠綁定更新的畫面標成 OK
    if (b.t) [b.t, b.b].forEach((id) => { state[id] = (b.push || []).includes(id) ? 'active' : 'ok'; });
    return {
      action: `數量 ${QTY_BEFORE} → ${QTY_AFTER}`,
      state,
      on: b.on,
      tokens,
      wires: { in: k === 0, out: done },
      verdict: b.note || `資料到達 ${nameOf(sys, b.q)}`,
    };
  }));
}

// ---- 加一個畫面元件 ----
const C3 = '加一個畫面';
push('add-plan', C3, 4000,
  '新需求：結帳按鈕上也要顯示總價。三邊都得新寫這個 View，問題是既有的程式要不要跟著改。',
  each((sim) => {
    sim.nodes.add('checkout');
    sim.notes.checkout = '「結帳 NT$900」';
    return { action: '結帳按鈕也要顯示總價', state: { checkout: 'new' }, wires: { in: true, out: false }, verdict: '新增一個 View' };
  }));

const addDiff = each((sim, sys) => {
  sim.nodes.delete('checkout');
  const before = liveGraph(sim);
  sim.nodes.add('checkout');
  sim.edges.add(sys.addView[1]);
  const d = diffNodes(before, liveGraph(sim));
  sim.stats.changed = d.changed.length;
  return d;
});
push('add-apply', C3, 6000,
  `MVC 的結帳按鈕自己觀察 Model、MVVM 的結帳按鈕自己綁定 total，既有程式都不用改。MVP 要改 ${names(systems[1], addDiff[1].changed)}：它得多呼叫一次 setCheckoutTotal()，畫面越多，Presenter 越肥。`,
  each((sim, sys, i) => {
    const d = addDiff[i];
    const state = { checkout: 'new' };
    d.changed.forEach((id) => { state[id] = 'changed'; });
    return {
      action: '結帳按鈕也要顯示總價',
      state,
      on: [sys.addView[1]],
      wires: { in: false, out: true },
      verdict: d.changed.length ? `要改 ${names(sys, d.changed)}` : '只新增 View，既有程式不動',
    };
  }));

// ---- 測試畫面邏輯 ----
const C4 = '測試畫面邏輯';
push('test-plan', C4, 4000,
  `想測「數量 × 單價 = 總價」這段畫面邏輯，它寫在中間那一層。單元測試最好不必真的開出畫面。`,
  each((sim, sys) => {
    sim.nodes.add('test');
    sim.edges.add('tm');
    return { action: '測試總價計算', state: { test: 'new', mid: 'focus' }, wires: { in: true, out: false }, verdict: `測試對象：${nameOf(sys, 'mid')}` };
  }));

const needs = each((sim, sys) => {
  const n = testNeeds(liveGraph(sim).edges, 'mid');
  const ui = n.concrete.filter((id) => sys.nodes.find((x) => x.id === id).ring === 'ui');
  sim.stats.realUi = ui.length ? `要（${names(sys, ui)}）` : '不用';
  sim.stats.mocks = n.mocks.length;
  return { ...n, ui };
});
push('test-run', C4, 6400,
  `MVC 的 Controller 直接依賴輸入框，測試得有真的${names(systems[0], needs[0].ui)}。MVP 的 Presenter 只依賴 View 介面，但要準備 ${needs[1].mocks.length} 個假 View 來接它的呼叫。MVVM 的 ViewModel 不認識任何 View，測試直接設 qty、檢查 total，假物件 ${needs[2].mocks.length} 個。`,
  each((sim, sys, i) => {
    const n = needs[i];
    const state = { test: 'active', mid: 'focus' };
    n.concrete.forEach((id) => { state[id] = n.ui.includes(id) ? 'needed' : 'focus'; });
    n.mocks.forEach((id) => { state[id] = 'mocked'; });
    const touched = ['test', 'mid', ...n.concrete, ...n.mocks];
    return {
      action: '測試總價計算',
      state,
      on: edgeIds(sim, liveGraph(sim).edges.filter((e) => touched.includes(e.from) && touched.includes(e.to) && (e.from === 'mid' || e.from === 'test')).map((e) => [e.from, e.to])),
      wires: { in: false, out: true },
      verdict: n.ui.length ? '得先準備好真的畫面' : n.mocks.length ? `要寫 ${n.mocks.length} 個假 View` : '不用任何假物件',
    };
  }));

// ---- 對照 ----
const stat = (id) => sims.map((sim) => sim.stats[id]);
export const compare = {
  title: '同一個購物車畫面，三種互動模式',
  rows: [
    { label: '中間層', values: ['Controller：接收輸入、改 Model', 'Presenter：畫面邏輯，主動更新 View', 'ViewModel：畫面狀態，靠綁定同步'] },
    { label: '誰更新畫面', values: ['View 觀察 Model 自己重畫', 'Presenter 逐一呼叫 View', '綁定機制自動同步'] },
    { label: '畫面更新完成要幾拍', better: 'low', values: stat('hops').map((v) => `${v} 拍`), highlight: true },
    { label: '中間層主動更新畫面', better: 'low', values: stat('pushes').map((v) => `${v} 次`), highlight: true },
    { label: '加結帳按鈕要改的既有元件', better: 'low', values: stat('changed').map((v, i) => `${v} 個${v ? `（${names(systems[i], addDiff[i].changed)}）` : ''}`), highlight: true },
    { label: '測畫面邏輯', values: sims.map((sim) => `真畫面：${sim.stats.realUi}，假 View：${sim.stats.mocks} 個`), highlight: true },
    { label: '代價', values: ['View 與 Model 綁在一起，邏輯容易散在 View 和 Controller', 'View 介面與 Presenter 的呼叫要一個一個寫', '需要綁定框架；綁定出錯時較難追蹤'] },
    { label: '常見於', values: ['伺服器端網頁框架（Rails、Spring MVC、ASP.NET MVC）', 'Android 早期、WinForms、需要高度可測的 UI', 'WPF、Vue、Angular、Android Jetpack、SwiftUI'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '三種模式都在把畫面和邏輯分開，差別在誰負責把資料送回畫面。MVC 讓 View 自己看 Model，MVP 讓 Presenter 動手，MVVM 交給綁定機制。',
  data: { kind: 'compare' },
});


// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  intro: `三種寫法做同一個購物車畫面：單價 ${money(PRICE)}、數量 ${QTY_BEFORE}。上排是畫面元件，下面是資料，差別在中間那一層。`,
  'flow-0': `使用者把數量從 ${QTY_BEFORE} 改成 ${QTY_AFTER}。`,
  'flow-1': 'MVC 交給 Controller、MVP 交給 Presenter；MVVM 靠自動同步（資料綁定），新數量直接進 ViewModel。',
  'flow-2': `MVVM 的總價已經自動算好，畫面也自動更新成 ${money(QTY_AFTER * PRICE)}；另外兩種才剛把新數量存進資料。`,
  'flow-3': 'MVC 的資料通知畫面「我變了」，畫面自己來讀；MVP 的 Presenter 拿到結果，準備去改畫面。',
  'flow-4': 'MVP 的 Presenter 一個一個去改畫面：畫面上有幾處要更新，它就要寫幾行。',
  'add-plan': '新需求：結帳按鈕上也要顯示總價。',
  'add-apply': `MVC 和 MVVM 只要新增按鈕本身；MVP 還得改 ${names(systems[1], addDiff[1].changed)}，多寫一次更新畫面的程式。`,
  'test-plan': '想測試「數量 × 單價 = 總價」這段邏輯，最好不用真的開出畫面。',
  'test-run': `MVC 要真的畫面才能測；MVP 要準備 ${needs[1].mocks.length} 個假畫面；MVVM 什麼都不用，直接測。`,
  compare: '三種都在把畫面和邏輯分開，差別在「資料改了之後，由誰送回畫面」。',
};
const plain = (s) => PLAIN[s.id];
steps.forEach((s) => { s.detail = s.caption; s.caption = plain(s); });
