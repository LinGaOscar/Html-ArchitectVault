// 系統部署動畫：單體式、模組化單體、微服務實作同一個電商後端（訂單、庫存、付款），三個面板同步前進。
// 虛線外框是「部署單元」：同一個框裡的東西一起啟動、一起擴充、一起掛掉、一起重新部署。
// 每個事件的影響範圍都由「誰跟誰在同一個框裡」與依賴箭頭推導出來，不手寫：
// 1. 一次下單：要跨幾次網路、交易能不能用單一資料庫完成。
// 2. 訂單流量暴增：要多開幾個模組實例。
// 3. 付款模組當機：哪些功能跟著停擺。
// 4. 改一行庫存程式：要重新部署多少東西。
// 5. 把付款拆成獨立服務：要改幾個模組。

import { diffNodes } from '../../assets/js/engine/graph.js';
import { makeSim, liveGraph, view } from '../../assets/js/engine/archsim.js';

const STATS = [
  { id: 'net', label: '一次下單的網路呼叫' },
  { id: 'tx', label: '下單的交易' },
  { id: 'scale', label: '訂單流量 ×3 多開的模組實例' },
  { id: 'down', label: '付款當機時停擺的功能' },
  { id: 'deploy', label: '改庫存要重新部署的模組' },
  { id: 'extract', label: '拆出付款要改的模組' },
];
const TOKENS = [{ id: 'req', tone: 'req' }];
const MODULES = ['inv', 'order', 'pay'];
const mod = (id, name, col) => ({ id, name, sub: '模組', ring: 'module', cell: [1, col] });
const modules = [mod('inv', '庫存', 1), mod('order', '訂單', 2), mod('pay', '付款', 3)];
const FLOW = ['order', 'inv', 'pay'];
const SCALE = 3;

export const systems = [
  {
    id: 'mono',
    title: '單體式（Monolith）',
    rule: '所有功能在同一個程式裡、共用一個資料庫，模組之間直接呼叫彼此的類別。',
    processLabel: '虛線框 = 一個部署單元',
    cols: 3,
    rows: 2,
    groups: [{ id: 'app', name: '單一應用程式', area: [1, 1, 2, 3], members: [...MODULES, 'db'] }],
    nodes: [...modules, { id: 'db', name: '共用 DB', ring: 'infra', cell: [2, 2] }],
    edges: [
      { id: 'oi', from: 'order', to: 'inv', kind: 'dep' },
      { id: 'op', from: 'order', to: 'pay', kind: 'dep' },
      { id: 'po', from: 'pay', to: 'order', kind: 'dep' },
      { id: 'idb', from: 'inv', to: 'db', kind: 'dep' },
      { id: 'odb', from: 'order', to: 'db', kind: 'dep' },
      { id: 'pdb', from: 'pay', to: 'db', kind: 'dep' },
    ],
    dbOf: { inv: 'db', order: 'db', pay: 'db' },
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'modular',
    title: '模組化單體（Modular Monolith）',
    rule: '仍是一個程式、一起部署，但模組之間只能透過公開介面溝通，各自擁有自己的資料表。',
    processLabel: '虛線框 = 一個部署單元，細框 = 模組邊界',
    cols: 3,
    rows: 2,
    groups: [
      { id: 'app', name: '單一應用程式', area: [1, 1, 2, 3], members: [...MODULES, 'db'] },
      ...modules.map((m) => ({ id: `b-${m.id}`, name: '', area: [1, m.cell[1], 1, 1], kind: 'boundary' })),
    ],
    nodes: [...modules, { id: 'db', name: 'DB', sub: '各模組獨立 schema', ring: 'infra', cell: [2, 2] }],
    edges: [
      { id: 'oi', from: 'order', to: 'inv', kind: 'iface' },
      { id: 'op', from: 'order', to: 'pay', kind: 'iface' },
      { id: 'idb', from: 'inv', to: 'db', kind: 'dep' },
      { id: 'odb', from: 'order', to: 'db', kind: 'dep' },
      { id: 'pdb', from: 'pay', to: 'db', kind: 'dep' },
    ],
    dbOf: { inv: 'db', order: 'db', pay: 'db' },
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'micro',
    title: '微服務（Microservices）',
    rule: '每個功能是獨立部署的服務，各有自己的資料庫，服務之間透過網路 API 溝通。',
    processLabel: '虛線框 = 一個部署單元',
    cols: 3,
    rows: 2,
    groups: modules.map((m) => ({ id: `g-${m.id}`, name: `${m.name}服務`, area: [1, m.cell[1], 2, 1], members: [m.id, `db-${m.id}`] })),
    nodes: [...modules, ...modules.map((m) => ({ id: `db-${m.id}`, name: `${m.name} DB`, ring: 'infra', cell: [2, m.cell[1]] }))],
    edges: [
      { id: 'oi', from: 'order', to: 'inv', kind: 'net' },
      { id: 'op', from: 'order', to: 'pay', kind: 'net' },
      ...modules.map((m) => ({ id: `${m.id[0]}db`, from: m.id, to: `db-${m.id}`, kind: 'dep' })),
    ],
    dbOf: { inv: 'db-inv', order: 'db-order', pay: 'db-pay' },
    tokens: TOKENS,
    stats: STATS,
  },
];

const nameOf = (sys, id) => sys.nodes.find((n) => n.id === id).name;
const unitOf = (sys, id) => sys.groups.find((g) => (g.members || []).includes(id));
const modulesIn = (sys, id) => unitOf(sys, id).members.filter((m) => MODULES.includes(m));
const sims = systems.map(makeSim);
const each = (fn) => sims.map((sim, i) => fn(sim, sim.sys, i));
export const steps = [];
function push(id, chapter, duration, caption, beats) {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: sims.map((sim, i) => view(sim, beats[i])) } });
}
const edgeBetween = (sys, a, b) => sys.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

// ---- 總覽 ----
push('intro', '架構總覽', 5000,
  '三個面板是同一個電商後端：庫存、訂單、付款三個功能。虛線框是部署單元，同一個框裡的東西一起啟動、一起擴充、一起掛掉。單體式和模組化單體只有一個框，微服務有三個。點線箭頭是網路呼叫。',
  each(() => ({ action: '同一個電商後端' })));

// ---- 一次下單 ----
const C2 = '一次下單';
const netCount = sims.map(() => 0);
const dbsTouched = sims.map(() => new Set());
const flowCaptions = [
  '下單請求進到訂單模組，先寫一筆訂單。',
  '訂單要扣庫存。單體式直接呼叫庫存的類別；模組化單體呼叫庫存模組的公開介面，仍在同一個程式裡；微服務要發一次網路請求給庫存服務。',
  '接著扣款。單體式和模組化單體的三筆寫入都在同一個資料庫，一個交易就能全部成功或全部失敗。微服務又跨一次網路，而且三個服務各寫自己的資料庫，沒辦法用一個交易包起來，要改用 Saga：失敗時逐一呼叫補償動作。',
];
FLOW.forEach((at, k) => {
  const last = k === FLOW.length - 1;
  push(`flow-${k}`, C2, last ? 5200 : 3600, flowCaptions[k], each((sim, sys, i) => {
    const hop = k > 0 ? edgeBetween(sys, 'order', at) : [];
    netCount[i] += hop.filter((e) => e.kind === 'net').length;
    dbsTouched[i].add(sys.dbOf[at]);
    sim.stats.net = netCount[i];
    if (last) {
      const n = dbsTouched[i].size;
      sim.stats.tx = n === 1 ? '1 個 DB 交易' : `跨 ${n} 個 DB，要 Saga`;
    }
    const dbEdge = sys.edges.find((e) => e.from === at && e.to === sys.dbOf[at]);
    return {
      action: '下單：訂單 → 扣庫存 → 扣款',
      state: { [at]: 'active', [sys.dbOf[at]]: 'focus' },
      on: [...hop.map((e) => e.id), dbEdge.id],
      tokens: { req: { at, label: '下單' } },
      wires: { in: k === 0, out: last },
      verdict: hop.some((e) => e.kind === 'net') ? `跨網路呼叫${nameOf(sys, at)}服務` : k ? `同一個程式內呼叫${nameOf(sys, at)}` : '寫入訂單',
    };
  }));
});

// ---- 訂單流量暴增 ----
const C3 = '流量暴增';
push('scale-plan', C3, 3800,
  `促銷開始，訂單流量變成平常的 ${SCALE} 倍，庫存和付款的負載不變。要多開機器分攤訂單的負載。`,
  each(() => ({ action: `訂單流量 ×${SCALE}`, state: { order: 'focus' }, wires: { in: true, out: false }, verdict: '只有訂單需要擴充' })));
push('scale-apply', C3, 5600,
  (() => {
    const added = systems.map((sys) => modulesIn(sys, 'order').length * (SCALE - 1));
    return `擴充的單位是整個部署單元。單體式與模組化單體只能把整個程式複製 ${SCALE} 份，用不到的庫存和付款也跟著多開，共多 ${added[0]} 個模組實例。微服務只複製訂單服務，多 ${added[2]} 個。`;
  })(),
  each((sim, sys) => {
    const unit = unitOf(sys, 'order');
    const mods = modulesIn(sys, 'order');
    sim.stats.scale = mods.length * (SCALE - 1);
    return {
      action: `訂單流量 ×${SCALE}`,
      state: Object.fromEntries(mods.map((m) => [m, m === 'order' ? 'active' : 'focus'])),
      groups: { [unit.id]: { state: 'scaled', badge: `×${SCALE}`, reps: SCALE } },
      wires: { in: false, out: true },
      verdict: `複製「${unit.name}」×${SCALE}，多 ${sim.stats.scale} 個模組實例`,
    };
  }));

// ---- 付款當機 ----
const C4 = '付款當機';
push('crash-plan', C4, 3600,
  '付款模組有記憶體洩漏，程序被作業系統砍掉。',
  each(() => ({ action: '付款模組記憶體洩漏', state: { pay: 'needed' }, wires: { in: true, out: false }, verdict: '付款所在的程序崩潰' })));
push('crash-apply', C4, 5600,
  '同一個部署單元裡的東西一起掛掉。單體式和模組化單體整個程式停了，連庫存查詢、建立訂單都不能用。微服務只有付款服務停擺，訂單照收，付款稍後重試。',
  each((sim, sys) => {
    const unit = unitOf(sys, 'pay');
    const mods = modulesIn(sys, 'pay');
    sim.stats.down = mods.length;
    return {
      action: '付款模組記憶體洩漏',
      state: Object.fromEntries(unit.members.map((m) => [m, 'broken'])),
      groups: { [unit.id]: { state: 'broken', badge: '停擺' } },
      wires: { in: false, out: true },
      verdict: `停擺：${mods.map((m) => nameOf(sys, m)).join('、')}`,
    };
  }));

// ---- 改一行庫存 ----
const C5 = '部署小改動';
push('deploy-plan', C5, 3400,
  '庫存模組改了一行折扣判斷，要上線。',
  each(() => ({ action: '庫存改一行程式', state: { inv: 'changed' }, wires: { in: true, out: false }, verdict: '只有庫存的程式碼變了' })));
push('deploy-apply', C5, 5400,
  '部署的單位也是部署單元。單體式和模組化單體得重新建置、重新部署整個程式，三個模組一起重啟、一起回歸測試。微服務只重新部署庫存服務。',
  each((sim, sys) => {
    const unit = unitOf(sys, 'inv');
    const mods = modulesIn(sys, 'inv');
    sim.stats.deploy = mods.length;
    return {
      action: '庫存改一行程式',
      state: Object.fromEntries(mods.map((m) => [m, 'deploy'])),
      groups: { [unit.id]: { state: 'deploy', badge: '重新部署' } },
      wires: { in: false, out: true },
      verdict: `重新部署：${mods.map((m) => nameOf(sys, m)).join('、')}`,
    };
  }));

// ---- 拆出付款服務 ----
const C6 = '拆出服務';
push('extract-plan', C6, 3800,
  '付款要交給另一個團隊獨立維護，決定把它拆成獨立服務。拆出去之後，模組之間的呼叫都得改成網路呼叫。',
  each((sim, sys) => ({
    action: '把付款拆成獨立服務',
    state: { pay: 'focus' },
    on: edgeBetween(sys, 'pay', 'order').map((e) => e.id),
    wires: { in: true, out: false },
    verdict: sys.id === 'micro' ? '付款本來就是獨立服務' : '找出所有跟付款相連的呼叫',
  })));

// 拆出去之後：直接呼叫類別的地方要改寫成網路呼叫；透過介面呼叫的，只要換一個走網路的介面實作，呼叫端不必動
const extractDiff = each((sim, sys) => {
  if (sys.id === 'micro') return null;
  const before = liveGraph(sim);
  const after = {
    nodes: before.nodes,
    edges: before.edges.map((e) => ((e.from === 'pay' || e.to === 'pay') && MODULES.includes(e.from) && MODULES.includes(e.to) && e.kind === 'dep' ? { ...e, kind: 'net' } : e)),
  };
  const d = diffNodes(before, after);
  sim.stats.extract = d.changed.length;
  return d;
});
sims[2].stats.extract = '已經獨立';
push('extract-apply', C6, 6000,
  `單體式的訂單和付款互相直接呼叫對方的類別，拆開要改${extractDiff[0].changed.map((id) => nameOf(systems[0], id)).join('、')}的程式。模組化單體的訂單本來就只透過介面呼叫付款，換一個走網路的介面實作就好，模組程式 ${extractDiff[1].changed.length} 個要改。這是模組化單體的價值：先在單體裡守住邊界，需要時再拆。`,
  each((sim, sys, i) => {
    const d = extractDiff[i];
    if (!d) return { action: '把付款拆成獨立服務', state: { pay: 'ok' }, wires: { in: false, out: true }, verdict: '不用拆，早就獨立了' };
    const coupling = edgeBetween(sys, 'pay', 'order');
    const state = { pay: 'focus' };
    d.changed.forEach((id) => { state[id] = 'changed'; });
    return {
      action: '把付款拆成獨立服務',
      state,
      on: coupling.filter((e) => e.kind === 'iface').map((e) => e.id),
      edgeState: Object.fromEntries(coupling.filter((e) => e.kind === 'dep').map((e) => [e.id, 'cut'])),
      wires: { in: false, out: true },
      verdict: d.changed.length ? `要改：${d.changed.map((id) => nameOf(sys, id)).join('、')}` : '模組程式不用改，只換介面實作',
    };
  }));

// ---- 對照 ----
const stat = (id) => sims.map((sim) => sim.stats[id]);
const unitCount = systems.map((sys) => sys.groups.filter((g) => (g.kind || 'unit') === 'unit').length);
export const compare = {
  title: '同一個電商後端，三種部署方式',
  rows: [
    { label: '部署單元', values: unitCount.map((n) => `${n} 個`) },
    { label: '一次下單的網路呼叫', values: stat('net').map((v) => `${v} 次`), highlight: true },
    { label: '下單的交易', values: stat('tx'), highlight: true },
    { label: '訂單流量 ×3 多開的模組實例', values: stat('scale').map((v) => `${v} 個`), highlight: true },
    { label: '付款當機時停擺的功能', values: stat('down').map((v) => `${v} 個`), highlight: true },
    { label: '改庫存要重新部署的模組', values: stat('deploy').map((v) => `${v} 個`), highlight: true },
    { label: '拆出付款要改的模組', values: stat('extract').map((v) => (typeof v === 'number' ? `${v} 個` : v)), highlight: true },
    { label: '代價', values: ['規模變大後模組糾纏，牽一髮動全身', '要靠紀律或工具守住模組邊界', '網路延遲、分散式交易、監控與維運成本都變高'] },
    { label: '適合', values: ['小團隊、新產品、需求還在變', '中型團隊，想保留未來拆分的彈性', '多團隊獨立交付、各功能負載差異大'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '微服務換來獨立擴充、獨立部署、故障隔離，代價是網路呼叫和分散式交易。模組化單體先守住程式碼邊界、保留單體的簡單，是兩者之間常見的起點。',
  data: { kind: 'compare' },
});
