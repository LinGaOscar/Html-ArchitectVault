// 程式內部分層動畫：三層式、六角架構、Clean Architecture 實作同一個「下單」功能，三個面板同步前進。
// 重點是依賴箭頭的方向（原始碼裡誰 import 誰），所以安排三件事讓方向的後果浮現：
// 1. 執行時的呼叫路徑三邊幾乎一樣，但箭頭方向不同。
// 2. 把 MySQL 換成 MongoDB：要改哪些既有元件、業務邏輯有沒有被波及。
// 3. 單元測試業務邏輯：要不要接真的資料庫。
// 「要改哪些元件」「要接哪些真實依賴」都由 graph.js 依箭頭推導，不手寫。

import { diffNodes, reach, testNeeds } from '../../assets/js/engine/graph.js';
import { makeSim, liveGraph, edgeIds, view } from '../../assets/js/engine/archsim.js';

const STATS = [
  { id: 'coreDeps', label: '業務邏輯依賴的基礎設施' },
  { id: 'changed', label: '換 DB 要改的既有元件' },
  { id: 'coreTouched', label: '業務邏輯被改到' },
  { id: 'realDb', label: '測業務邏輯要接真 DB' },
];
const TOKENS = [{ id: 'req', tone: 'req' }];

export const systems = [
  {
    id: 'layered',
    title: '三層式（Layered）',
    rule: '畫面層 → 業務邏輯層 → 資料層，每一層直接使用下一層的程式。',
    processLabel: '箭頭 = 原始碼裡誰 import 誰',
    cols: 3,
    rows: 4,
    core: 'svc',
    nodes: [
      { id: 'ctrl', name: 'OrderController', sub: '展示層', ring: 'adapter', cell: [1, 2] },
      { id: 'svc', name: 'OrderService', sub: '業務邏輯層', ring: 'core', cell: [2, 2] },
      { id: 'repo', name: 'MySqlOrderRepo', sub: '資料存取層', ring: 'adapter', cell: [3, 2] },
      { id: 'db', name: 'MySQL', ring: 'infra', cell: [4, 2] },
      { id: 'repo2', name: 'MongoOrderRepo', sub: '資料存取層', ring: 'adapter', cell: [3, 3], hidden: true },
      { id: 'db2', name: 'MongoDB', ring: 'infra', cell: [4, 3], hidden: true },
      { id: 'test', name: '單元測試', ring: 'test', cell: [2, 1], hidden: true },
    ],
    edges: [
      { id: 'e1', from: 'ctrl', to: 'svc', kind: 'dep' },
      { id: 'e2', from: 'svc', to: 'repo', kind: 'dep' },
      { id: 'e3', from: 'repo', to: 'db', kind: 'dep' },
      { id: 'e4', from: 'svc', to: 'repo2', kind: 'dep', hidden: true },
      { id: 'e5', from: 'repo2', to: 'db2', kind: 'dep', hidden: true },
      { id: 'e6', from: 'test', to: 'svc', kind: 'dep', hidden: true },
    ],
    flow: ['ctrl', 'svc', 'repo', 'db'],
    swap: { remove: ['repo', 'db', 'e2', 'e3'], add: ['repo2', 'db2', 'e4', 'e5'] },
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'hex',
    title: '六角架構（Ports & Adapters）',
    rule: '業務核心自己定「插座規格」（介面），資料庫、網頁入口都做成插頭接上來；所有箭頭都指向核心。',
    processLabel: '箭頭 = 原始碼裡誰 import 誰',
    cols: 3,
    rows: 4,
    core: 'domain',
    nodes: [
      { id: 'http', name: 'HTTP Adapter', sub: '驅動端', ring: 'adapter', cell: [1, 2] },
      { id: 'main', name: 'main', sub: '組裝', ring: 'app', cell: [1, 3] },
      { id: 'domain', name: 'Order 核心', sub: '含 Port 介面', ring: 'core', cell: [2, 2] },
      { id: 'mysqlA', name: 'MySQL Adapter', sub: '被驅動端', ring: 'adapter', cell: [3, 2] },
      { id: 'db', name: 'MySQL', ring: 'infra', cell: [4, 2] },
      { id: 'mongoA', name: 'Mongo Adapter', sub: '被驅動端', ring: 'adapter', cell: [3, 3], hidden: true },
      { id: 'db2', name: 'MongoDB', ring: 'infra', cell: [4, 3], hidden: true },
      { id: 'test', name: '單元測試', ring: 'test', cell: [2, 1], hidden: true },
      { id: 'fake', name: '假 Repo', sub: '記憶體實作', ring: 'test', cell: [3, 1], hidden: true },
    ],
    edges: [
      { id: 'e1', from: 'http', to: 'domain', kind: 'dep' },
      { id: 'e2', from: 'mysqlA', to: 'domain', kind: 'iface' },
      { id: 'e3', from: 'mysqlA', to: 'db', kind: 'dep' },
      { id: 'e4', from: 'main', to: 'http', kind: 'dep' },
      { id: 'e5', from: 'main', to: 'mysqlA', kind: 'dep' },
      { id: 'e6', from: 'mongoA', to: 'domain', kind: 'iface', hidden: true },
      { id: 'e7', from: 'mongoA', to: 'db2', kind: 'dep', hidden: true },
      { id: 'e8', from: 'main', to: 'mongoA', kind: 'dep', hidden: true },
      { id: 'e9', from: 'test', to: 'domain', kind: 'dep', hidden: true },
      { id: 'e10', from: 'test', to: 'fake', kind: 'dep', hidden: true },
      { id: 'e11', from: 'fake', to: 'domain', kind: 'iface', hidden: true },
    ],
    flow: ['http', 'domain', 'mysqlA', 'db'],
    swap: { remove: ['mysqlA', 'db', 'e2', 'e3', 'e5'], add: ['mongoA', 'db2', 'e6', 'e7', 'e8'] },
    testExtra: { nodes: ['fake'], edges: ['e10', 'e11'] },
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'clean',
    title: 'Clean Architecture',
    short: 'Clean',
    rule: '像洋蔥一圈一圈：最內圈是業務規則，外圈的資料庫、框架只能往內依賴。',
    processLabel: '箭頭 = 原始碼裡誰 import 誰',
    cols: 3, // main 放左下角：它接 Gateway 的箭頭才不會從 Entity 後面穿過、被誤看成 Entity 的依賴
    rows: 4,
    core: 'usecase',
    nodes: [
      { id: 'ctrl', name: 'Controller', sub: '介面轉接層', ring: 'adapter', cell: [1, 2] },
      { id: 'main', name: 'main', sub: '組裝', ring: 'app', cell: [4, 1] },
      { id: 'usecase', name: 'PlaceOrder', sub: 'Use Case', ring: 'core', cell: [2, 2] },
      { id: 'entity', name: 'Order', sub: 'Entity', ring: 'core', cell: [2, 3] },
      { id: 'gw', name: 'MySqlGateway', sub: '介面轉接層', ring: 'adapter', cell: [3, 2] },
      { id: 'db', name: 'MySQL', sub: '框架與驅動', ring: 'infra', cell: [4, 2] },
      { id: 'gw2', name: 'MongoGateway', sub: '介面轉接層', ring: 'adapter', cell: [3, 3], hidden: true },
      { id: 'db2', name: 'MongoDB', sub: '框架與驅動', ring: 'infra', cell: [4, 3], hidden: true },
      { id: 'test', name: '單元測試', ring: 'test', cell: [2, 1], hidden: true },
      { id: 'fake', name: '假 Gateway', sub: '記憶體實作', ring: 'test', cell: [3, 1], hidden: true },
    ],
    edges: [
      { id: 'e1', from: 'ctrl', to: 'usecase', kind: 'dep' },
      { id: 'e2', from: 'usecase', to: 'entity', kind: 'dep' },
      { id: 'e3', from: 'gw', to: 'usecase', kind: 'iface' },
      { id: 'e4', from: 'gw', to: 'db', kind: 'dep' },
      { id: 'e6', from: 'main', to: 'gw', kind: 'dep' },
      { id: 'e7', from: 'gw2', to: 'usecase', kind: 'iface', hidden: true },
      { id: 'e8', from: 'gw2', to: 'db2', kind: 'dep', hidden: true },
      { id: 'e9', from: 'main', to: 'gw2', kind: 'dep', hidden: true },
      { id: 'e10', from: 'test', to: 'usecase', kind: 'dep', hidden: true },
      { id: 'e11', from: 'test', to: 'fake', kind: 'dep', hidden: true },
      { id: 'e12', from: 'fake', to: 'usecase', kind: 'iface', hidden: true },
    ],
    flow: ['ctrl', 'usecase', 'gw', 'db'],
    swap: { remove: ['gw', 'db', 'e3', 'e4', 'e6'], add: ['gw2', 'db2', 'e7', 'e8', 'e9'] },
    testExtra: { nodes: ['fake'], edges: ['e11', 'e12'] },
    tokens: TOKENS,
    stats: STATS,
  },
];

const ringOf = (sys, id) => sys.nodes.find((n) => n.id === id).ring;
const nameOf = (sys, id) => sys.nodes.find((n) => n.id === id).name;
const names = (sys, ids) => ids.map((id) => nameOf(sys, id)).join('、') || '無';
const sims = systems.map(makeSim);
export const steps = [];

function push(id, chapter, duration, caption, beats) {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: sims.map((sim, i) => view(sim, beats[i])) } });
}
const each = (fn) => sims.map((sim) => fn(sim, sim.sys));

// ---- 依賴方向 ----
const C1 = '依賴方向';
push('intro', C1, 4400,
  '三個面板都在實作同一個「下單」功能。箭頭代表原始碼的依賴：A → B 表示 A 的程式碼 import 了 B，B 一改，A 就可能要跟著改。虛線箭頭是依賴介面，實作可以替換。',
  each(() => ({ action: '同一個功能：下單' })));

// 從業務邏輯出發，沿具體依賴走得到的基礎設施與轉接層，就是業務邏輯被綁住的東西
const coreDeps = each((sim, sys) => reach(liveGraph(sim).edges, sys.core, ['dep']).filter((id) => ['infra', 'adapter'].includes(ringOf(sys, id))));
sims.forEach((sim, i) => { sim.stats.coreDeps = coreDeps[i].length; });
push('core-deps', C1, 5200,
  `看業務邏輯（綠框）往外指出去的箭頭。三層式的 OrderService 一路依賴到 ${names(systems[0], coreDeps[0])}，${coreDeps[0].length} 個；六角架構與 Clean Architecture 的核心沒有任何箭頭指向外圈，是 0。它們的箭頭全部從外面指進來。`,
  each((sim, sys, ) => {
    const deps = reach(liveGraph(sim).edges, sys.core, ['dep']);
    const pathEdges = edgeIds(sim, liveGraph(sim).edges.filter((e) => e.from === sys.core || deps.includes(e.from)).map((e) => [e.from, e.to]));
    const state = { [sys.core]: 'focus' };
    deps.filter((id) => ['infra', 'adapter'].includes(ringOf(sys, id))).forEach((id) => { state[id] = 'needed'; });
    return {
      action: '檢查業務邏輯依賴了誰',
      state,
      on: pathEdges,
      wires: { in: false, out: true },
      verdict: sim.stats.coreDeps ? `業務邏輯綁著 ${sim.stats.coreDeps} 個外部元件` : '業務邏輯不依賴任何外部元件',
    };
  }));

// ---- 一個請求 ----
const C2 = '執行一次下單';
const flowLen = Math.max(...systems.map((s) => s.flow.length));
for (let k = 0; k < flowLen; k += 1) {
  const last = k === flowLen - 1;
  const caption = [
    '下單請求進來，先到最外層的入口：三層式是 Controller，六角架構是 HTTP Adapter，Clean Architecture 是 Controller。',
    '入口把請求交給業務邏輯，檢查庫存、計算金額。這一段三邊做的事一樣。',
    '業務邏輯要存訂單。三層式直接呼叫 MySqlOrderRepo；六角架構與 Clean Architecture 呼叫的是核心自己定義的介面，執行時才由 Adapter / Gateway 接手。注意：呼叫往外走，但虛線箭頭是往內指的。',
    '資料寫進 MySQL。執行時的呼叫路徑三邊幾乎一樣，差別只在原始碼的依賴方向，這個差別在下一章換資料庫時才會顯現。',
  ][k];
  push(`flow-${k}`, C2, last ? 4600 : 3200, caption, each((sim, sys) => {
    const at = sys.flow[Math.min(k, sys.flow.length - 1)];
    const prevAt = k > 0 ? sys.flow[Math.min(k - 1, sys.flow.length - 1)] : null;
    const hop = prevAt && prevAt !== at ? sys.edges.filter((e) => (e.from === prevAt && e.to === at) || (e.from === at && e.to === prevAt)).map((e) => e.id) : [];
    const reversed = prevAt && sys.edges.some((e) => e.from === at && e.to === prevAt);
    return {
      action: 'POST /orders',
      state: { [at]: 'active' },
      on: hop,
      tokens: { req: { at, label: '下單' } },
      wires: { in: k === 0, out: last },
      verdict: reversed ? `呼叫 ${nameOf(sys, prevAt)} → ${nameOf(sys, at)}，依賴卻是反方向` : `執行到 ${nameOf(sys, at)}`,
    };
  }));
}

// ---- 換資料庫 ----
const C3 = '換資料庫';
push('swap-plan', C3, 4200,
  '需求來了：資料庫從 MySQL 換成 MongoDB。三邊都得新寫一支存取 MongoDB 的程式（新增的元件），問題是哪些既有的程式也要跟著改。',
  each((sim, sys) => {
    const old = sys.swap.remove.filter((id) => sys.nodes.some((n) => n.id === id));
    return {
      action: '把 MySQL 換成 MongoDB',
      state: Object.fromEntries(old.map((id) => [id, 'old'])),
      wires: { in: true, out: false },
      verdict: `要被換掉：${names(sys, old)}`,
    };
  }));

const swapDiff = each((sim, sys) => {
  const before = liveGraph(sim);
  sys.swap.remove.forEach((id) => { sim.nodes.delete(id); sim.edges.delete(id); });
  sys.swap.add.forEach((id) => (sys.nodes.some((n) => n.id === id) ? sim.nodes.add(id) : sim.edges.add(id)));
  const d = diffNodes(before, liveGraph(sim));
  sim.stats.changed = d.changed.length;
  sim.stats.coreTouched = d.changed.includes(sys.core) ? '是' : '否';
  return d;
});
push('swap-apply', C3, 6000,
  `換完之後比對前後的依賴。三層式要改 ${names(systems[0], swapDiff[0].changed)}：業務邏輯直接依賴資料存取類別，類別換了它就得改。六角架構只改 ${names(systems[1], swapDiff[1].changed)}，Clean Architecture 只改 ${names(systems[2], swapDiff[2].changed)}，都只是組裝時換一個實作，業務邏輯一行都不用動。`,
  each((sim, sys, i) => {
    const d = swapDiff[systems.indexOf(sys)];
    const state = {};
    d.added.forEach((id) => { state[id] = 'new'; });
    d.changed.forEach((id) => { state[id] = 'changed'; });
    return {
      action: '把 MySQL 換成 MongoDB',
      state,
      on: edgeIds(sim, liveGraph(sim).edges.filter((e) => d.added.includes(e.from) || d.added.includes(e.to) || d.changed.includes(e.from)).map((e) => [e.from, e.to])),
      wires: { in: false, out: true },
      verdict: `新增 ${d.added.length} 個，修改 ${names(sys, d.changed)}`,
    };
  }));

// ---- 單元測試 ----
const C4 = '單元測試';
each((sim) => { sim.nodes.add('test'); sim.sys.edges.filter((e) => e.from === 'test' && e.to === sim.sys.core).forEach((e) => sim.edges.add(e.id)); });
push('test-plan', C4, 3800,
  '想替業務邏輯寫單元測試：下單時庫存不足要擋下來。單元測試要快、要穩，最好不必啟動資料庫。',
  each((sim, sys) => ({
    action: '寫業務邏輯的單元測試',
    state: { test: 'new', [sys.core]: 'focus' },
    wires: { in: true, out: false },
    verdict: `測試對象：${nameOf(sys, sys.core)}`,
  })));

const needs = each((sim, sys) => {
  if (sys.testExtra) {
    sys.testExtra.nodes.forEach((id) => sim.nodes.add(id));
    sys.testExtra.edges.forEach((id) => sim.edges.add(id));
  }
  const n = testNeeds(liveGraph(sim).edges, sys.core);
  const real = n.concrete.filter((id) => ringOf(sys, id) === 'infra');
  sim.stats.realDb = real.length ? `要（${names(sys, real)}）` : '不用';
  return n;
});
push('test-run', C4, 6000,
  `沿著業務邏輯的具體依賴往下走，走到的都得真的存在。三層式走到 ${names(systems[0], needs[0].concrete)}，測試得連上真的 MongoDB，又慢又會受資料影響。六角架構與 Clean Architecture 的核心只依賴自己的介面，測試塞一個記憶體裡的假實作就能跑。`,
  each((sim, sys) => {
    const n = needs[systems.indexOf(sys)];
    const state = { test: 'active', [sys.core]: 'focus' };
    n.concrete.forEach((id) => { state[id] = ringOf(sys, id) === 'infra' ? 'needed' : 'focus'; });
    (sys.testExtra ? sys.testExtra.nodes : []).forEach((id) => { state[id] = 'mocked'; });
    const touched = [sys.core, ...n.concrete, 'test', ...(sys.testExtra ? sys.testExtra.nodes : [])];
    return {
      action: '執行單元測試',
      state,
      on: edgeIds(sim, liveGraph(sim).edges.filter((e) => touched.includes(e.from) && touched.includes(e.to)).map((e) => [e.from, e.to])),
      wires: { in: false, out: true },
      verdict: sim.stats.realDb === '不用' ? '用假實作就能測' : '得先準備好資料庫',
    };
  }));

// ---- 對照 ----
const stat = (id) => sims.map((sim) => sim.stats[id]);
export const compare = {
  title: '同一個下單功能，三種分層方式',
  rows: [
    { label: '依賴方向', values: ['由上往下，最後依賴資料庫', '全部指向核心，核心不依賴外面', '由外圈指向內圈，Entity 最穩定'] },
    { label: '業務邏輯依賴的基礎設施', better: 'low', values: stat('coreDeps').map((v) => `${v} 個`), highlight: true },
    { label: '換 DB 要改的既有元件', better: 'low', values: stat('changed').map((v, i) => `${v} 個（${names(systems[i], swapDiff[i].changed)}）`), highlight: true },
    { label: '測業務邏輯要接真 DB', values: stat('realDb'), highlight: true },
    { label: '初期成本', values: ['最低，檔案最少、最直覺', '要多定義 Port 介面與 Adapter', '層數最多，小專案容易過度設計'] },
    { label: '適合', values: ['CRUD 為主、規則簡單的系統', '規則複雜、外部系統常換的服務', '大型、長期維護、多團隊的系統'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '三層式最簡單，但業務邏輯被資料庫綁住。六角架構與 Clean Architecture 用介面把依賴反轉，讓核心不認識外面的世界，代價是多寫介面與組裝程式。',
  data: { kind: 'compare' },
});


// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  intro: '三種寫法都在做同一個「下單」功能。箭頭 A → B 表示 A 的程式直接用到 B：B 一改，A 可能就要跟著改。',
  'core-deps': `看綠色的「業務邏輯」往外指的箭頭：三層式一路牽到資料庫（${coreDeps[0].length} 個），另外兩種是 0 個。`,
  'flow-0': '一筆下單進來，先到最外層的入口。',
  'flow-1': '入口把下單交給業務邏輯，檢查庫存、算金額。三邊做的事一樣。',
  'flow-2': '要存訂單了。三層式直接呼叫資料庫程式；另外兩種呼叫的是自己定的「插座規格」，由外面的轉接程式接手。',
  'flow-3': '訂單存進資料庫。實際執行的路線三邊差不多，差別在程式碼「誰依賴誰」。',
  'swap-plan': '新需求：資料庫要從 MySQL 換成 MongoDB。看看哪些原本的程式要跟著改。',
  'swap-apply': `三層式連業務邏輯（${names(systems[0], swapDiff[0].changed)}）都要改；另外兩種只改負責組裝的 main，業務邏輯一行都不用動。`,
  'test-plan': '想替業務邏輯寫自動測試，最好不用真的開資料庫，測試才會又快又穩。',
  'test-run': '三層式的業務邏輯綁著資料庫，測試得接上真的資料庫；另外兩種接一個假的資料庫就能測。',
  compare: '三層式最簡單，但業務邏輯被資料庫綁住；另外兩種用「插座規格」讓核心不依賴外面，代價是多寫一些程式。',
};
const plain = (s) => PLAIN[s.id];
steps.forEach((s) => { s.detail = s.caption; s.caption = plain(s); });
