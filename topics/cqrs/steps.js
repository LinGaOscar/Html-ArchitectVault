// CQRS 動畫：傳統 CRUD、CQRS、CQRS + Event Sourcing 處理同一串訂單，三個面板同步前進。
// 範例安排四件事讓差異浮現：
// 1. 下單：寫入路徑。CQRS 寫完之後，讀取端要等 Projector 同步。
// 2. 剛下完單立刻查：CQRS 的讀取端還沒同步，查到舊資料（最終一致）。
// 3. 查訂單列表：CRUD 要 JOIN 多張表，CQRS 讀預先組好的 view。
// 4. 新增「營收報表」：只有 Event Sourcing 能從事件重建出被改價、被取消的歷史。
// 訂單資料、JOIN 數、報表能涵蓋的筆數都由下面的模擬算出，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

// ---- 共同的訂單歷史：三個面板在動畫開始前都經歷過同樣的事 ----
const history = [
  { type: 'OrderPlaced', order: 'o1', amount: 500 },
  { type: 'OrderPlaced', order: 'o2', amount: 300 },
  { type: 'PriceChanged', order: 'o2', amount: 250 },
  { type: 'OrderPlaced', order: 'o3', amount: 800 },
  { type: 'OrderCancelled', order: 'o3' },
];
const NEW_ORDER = { type: 'OrderPlaced', order: 'o4', amount: 400 };

// 一般資料庫只存「目前狀態」：把事件套上去，被改價的只留最新金額，被取消的整筆刪掉
function currentState(events) {
  const rows = {};
  events.forEach((e) => {
    if (e.type === 'OrderPlaced') rows[e.order] = e.amount;
    if (e.type === 'PriceChanged') rows[e.order] = e.amount;
    if (e.type === 'OrderCancelled') delete rows[e.order];
  });
  return rows;
}
const countRows = (events) => Object.keys(currentState(events)).length;

// 訂單列表要顯示：訂單、客戶名稱、品項數。正規化的資料表分在三張表
const LIST_TABLES = ['orders', 'customers', 'order_items'];

const STATS = [
  { id: 'store', label: '寫入端存了什麼' },
  { id: 'fresh', label: '剛下單立刻查得到' },
  { id: 'joins', label: '查訂單列表要 JOIN' },
  { id: 'scaleRead', label: '能單獨擴充讀取端' },
  { id: 'report', label: '新報表能看到的歷史' },
];
const TOKENS = [{ id: 'cmd', tone: 'req' }, { id: 'evt', tone: 'event' }, { id: 'qry', tone: 'data' }];

export const systems = [
  {
    id: 'crud',
    title: '傳統 CRUD',
    rule: '讀和寫用同一個模型、同一組正規化的資料表；寫進去的下一刻就讀得到。',
    processLabel: '左邊寫入、右邊查詢',
    cols: 3,
    rows: 3,
    nodes: [
      { id: 'api', name: 'Order API', sub: '讀寫共用', ring: 'adapter', cell: [1, 2] },
      { id: 'svc', name: 'OrderService', sub: '同一個模型', ring: 'core', cell: [2, 2] },
      { id: 'db', name: '訂單資料表', sub: '正規化，3 張表', ring: 'infra', cell: [3, 2] },
      { id: 'report', name: '營收報表', sub: '新需求', ring: 'app', cell: [3, 3], hidden: true },
    ],
    edges: [
      { id: 'as', from: 'api', to: 'svc', kind: 'dep' },
      { id: 'sd', from: 'svc', to: 'db', kind: 'dep' },
      { id: 'rd', from: 'report', to: 'db', kind: 'dep', hidden: true },
    ],
    write: ['api', 'svc', 'db'],
    sync: [],
    read: ['api', 'svc', 'db'],
    readStore: 'db',
    readJoins: LIST_TABLES.length - 1,
    separateRead: false,
    eventSourced: false,
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'cqrs',
    title: 'CQRS',
    rule: '寫入（Command）和查詢（Query）拆成兩個模型、兩個資料庫；寫入後由 Projector 非同步更新讀取用的 view。',
    processLabel: '左邊寫入、右邊查詢',
    cols: 3,
    rows: 3,
    nodes: [
      { id: 'cmd', name: 'Command API', sub: '寫入', ring: 'adapter', cell: [1, 1] },
      { id: 'qry', name: 'Query API', sub: '查詢', ring: 'adapter', cell: [1, 3] },
      { id: 'handler', name: 'Command Handler', sub: '業務規則', ring: 'core', cell: [2, 1] },
      { id: 'wdb', name: '寫入 DB', sub: '正規化', ring: 'infra', cell: [3, 1] },
      { id: 'proj', name: 'Projector', sub: '非同步同步', ring: 'app', cell: [3, 2] },
      { id: 'rdb', name: '讀取 DB', sub: '組好的訂單列表', ring: 'infra', cell: [2, 3] },
      { id: 'report', name: '營收報表 view', sub: '新投影', ring: 'infra', cell: [3, 3], hidden: true },
    ],
    edges: [
      { id: 'ch', from: 'cmd', to: 'handler', kind: 'dep' },
      { id: 'hw', from: 'handler', to: 'wdb', kind: 'dep' },
      { id: 'wp', from: 'wdb', to: 'proj', kind: 'event' },
      { id: 'pr', from: 'proj', to: 'rdb', kind: 'dep' },
      { id: 'qr', from: 'qry', to: 'rdb', kind: 'dep' },
      { id: 'prep', from: 'proj', to: 'report', kind: 'dep', hidden: true },
    ],
    write: ['cmd', 'handler', 'wdb'],
    sync: ['proj', 'rdb'],
    read: ['qry', 'rdb'],
    readStore: 'rdb',
    readJoins: 0,
    separateRead: true,
    eventSourced: false,
    tokens: TOKENS,
    stats: STATS,
  },
  {
    id: 'es',
    title: 'CQRS + Event Sourcing',
    rule: '寫入端不存目前狀態，只把發生過的事件依序追加到 Event Store；讀取用的 view 全部由事件投影出來。',
    processLabel: '左邊寫入、右邊查詢',
    cols: 3,
    rows: 3,
    nodes: [
      { id: 'cmd', name: 'Command API', sub: '寫入', ring: 'adapter', cell: [1, 1] },
      { id: 'qry', name: 'Query API', sub: '查詢', ring: 'adapter', cell: [1, 3] },
      { id: 'handler', name: 'Command Handler', sub: '業務規則', ring: 'core', cell: [2, 1] },
      { id: 'store', name: 'Event Store', sub: '只追加事件', ring: 'infra', cell: [3, 1] },
      { id: 'proj', name: 'Projector', sub: '非同步同步', ring: 'app', cell: [3, 2] },
      { id: 'rdb', name: '讀取 DB', sub: '組好的訂單列表', ring: 'infra', cell: [2, 3] },
      { id: 'report', name: '營收報表 view', sub: '新投影', ring: 'infra', cell: [3, 3], hidden: true },
    ],
    edges: [
      { id: 'ch', from: 'cmd', to: 'handler', kind: 'dep' },
      { id: 'hw', from: 'handler', to: 'store', kind: 'dep' },
      { id: 'wp', from: 'store', to: 'proj', kind: 'event' },
      { id: 'pr', from: 'proj', to: 'rdb', kind: 'dep' },
      { id: 'qr', from: 'qry', to: 'rdb', kind: 'dep' },
      { id: 'prep', from: 'proj', to: 'report', kind: 'dep', hidden: true },
    ],
    write: ['cmd', 'handler', 'store'],
    sync: ['proj', 'rdb'],
    read: ['qry', 'rdb'],
    readStore: 'rdb',
    readJoins: 0,
    separateRead: true,
    eventSourced: true,
    tokens: TOKENS,
    stats: STATS,
  },
];

const sims = systems.map(makeSim);
const each = (fn) => sims.map((sim, i) => fn(sim, sim.sys, i));
export const steps = [];
function push(id, chapter, duration, caption, beats) {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: sims.map((sim, i) => view(sim, beats[i])) } });
}
const edgesOnPath = (sys, path) => sys.edges.filter((e) => path.some((a, i) => i > 0 && ((path[i - 1] === e.from && a === e.to) || (path[i - 1] === e.to && a === e.from)))).map((e) => e.id);

// 每個面板的資料內容：寫入端與讀取端各看得到幾筆
const writeEvents = history.slice();
const readEvents = history.slice(); // 讀取端已經同步到哪裡
const storeNote = (sys) => (sys.eventSourced ? `${writeEvents.length} 個事件` : `${countRows(writeEvents)} 筆訂單`);
const readNote = () => `${countRows(readEvents)} 筆訂單`;
function syncNotes(sim, sys) {
  if (sys.id === 'crud') sim.notes = { db: `${countRows(writeEvents)} 筆訂單` };
  else sim.notes = { [sys.write[2]]: storeNote(sys), rdb: readNote() };
}
each((sim, sys) => {
  syncNotes(sim, sys);
  sim.stats.store = sys.eventSourced ? '所有事件' : '目前狀態';
});

// ---- 總覽 ----
push('intro', '架構總覽', 5200,
  `三個面板處理同一個訂單系統，過去已發生 ${history.length} 件事：o1 下單、o2 下單後改價、o3 下單後取消。CRUD 讀寫共用一組資料表；CQRS 把寫入（左）和查詢（右）拆開，中間由 Projector 同步；Event Sourcing 的寫入端只記事件。`,
  each((sim, sys) => ({ action: '同一個訂單系統', verdict: sys.eventSourced ? `Event Store 有 ${writeEvents.length} 個事件` : `資料表有 ${countRows(writeEvents)} 筆訂單` })));

// ---- 下單 ----
const C2 = '下單';
const writeCaptions = [
  '新訂單 o4 進來，金額 400。CRUD 由共用的 API 接手；CQRS 走專門處理寫入的 Command API。',
  'Command Handler 檢查業務規則（庫存、金額）。三邊做的檢查一樣。',
  'CRUD 與 CQRS 在資料表新增一筆訂單；Event Sourcing 不改任何資料，只在 Event Store 尾端追加一個 OrderPlaced 事件。三邊都回應「下單成功」。',
];
for (let k = 0; k < 3; k += 1) {
  const last = k === 2;
  if (last) writeEvents.push(NEW_ORDER);
  push(`write-${k}`, C2, last ? 5200 : 3400, writeCaptions[k], each((sim, sys) => {
    const at = sys.write[k];
    if (last) syncNotes(sim, sys);
    return {
      action: '下單 o4（NT$400）',
      state: { [at]: last ? 'ok' : 'active' },
      on: edgesOnPath(sys, sys.write.slice(0, k + 1)).filter((id) => k > 0 && edgesOnPath(sys, [sys.write[k - 1], at]).includes(id)),
      tokens: { cmd: { at, label: last && sys.eventSourced ? '+OrderPlaced' : '下單 o4' } },
      wires: { in: k === 0, out: last },
      verdict: last ? (sys.eventSourced ? '追加事件，回應成功' : '寫入一筆，回應成功') : `執行到 ${sys.nodes.find((n) => n.id === at).name}`,
    };
  }));
}

// 查詢的 token 從查詢入口飛出：前一拍先隱形地停在入口
steps[steps.length - 1].data.panels.forEach((p, i) => {
  p.tokens.qry = { at: systems[i].read[0], label: '', hidden: true };
});

// ---- 立刻查詢：讀取端還沒同步 ----
const C3 = '立刻查詢';
const freshNow = (sys) => (sys.readStore === 'db' ? true : countRows(readEvents) === countRows(writeEvents));
each((sim, sys) => { sim.stats.fresh = freshNow(sys) ? '查得到' : '查不到（還沒同步）'; });
push('read-stale', C3, 6000,
  '使用者下完單馬上打開「我的訂單」。CRUD 讀的是同一組資料表，o4 已經在裡面。CQRS 讀的是另一個資料庫，Projector 還沒把 o4 同步過去，列表少一筆，這就是最終一致性：寫入成功和查得到之間有一段延遲。',
  each((sim, sys) => {
    const fresh = freshNow(sys);
    const store = sys.readStore;
    return {
      action: '剛下單，立刻查我的訂單',
      state: { [store]: fresh ? 'ok' : 'stale' },
      on: edgesOnPath(sys, sys.read),
      tokens: { qry: { at: store, label: `查到 ${countRows(sys.readStore === 'db' ? writeEvents : readEvents)} 筆` } },
      wires: { in: true, out: true },
      verdict: fresh ? '馬上查得到 o4' : `只查到 ${countRows(readEvents)} 筆，o4 還沒出現`,
    };
  }));

// ---- 同步 ----
readEvents.push(NEW_ORDER);
push('sync', C3, 5600,
  'Projector 收到「o4 已建立」的通知，把它寫進讀取用的 view，順便把客戶名稱、品項數一起組好。幾十毫秒到幾秒後，CQRS 也查得到 o4 了。CRUD 沒有這一步。',
  each((sim, sys) => {
    if (sys.readStore === 'db') {
      return { action: 'Projector 同步讀取端', verdict: '沒有讀取端要同步', wires: { in: false, out: false } };
    }
    syncNotes(sim, sys);
    sim.stats.fresh = '稍後才查得到';
    return {
      action: 'Projector 同步讀取端',
      state: { proj: 'active', rdb: 'ok' },
      on: edgesOnPath(sys, [sys.write[2], ...sys.sync]),
      tokens: { evt: { at: 'rdb', label: 'o4 已建立' } },
      wires: { in: false, out: true },
      verdict: `讀取端更新為 ${countRows(readEvents)} 筆`,
    };
  }));
// 同步事件的 token 從寫入端飛出：前一拍先隱形地停在寫入端
steps[steps.length - 2].data.panels.forEach((p, i) => {
  if (systems[i].readStore !== 'db') p.tokens.evt = { at: systems[i].write[2], label: 'o4 已建立', hidden: true };
});

// ---- 查訂單列表 ----
const C4 = '查詢與擴充';
each((sim, sys) => { sim.stats.joins = sys.readJoins ? `${sys.readJoins} 次（${LIST_TABLES.length} 張表）` : '0 次'; });
push('list', C4, 6000,
  `後台要查訂單列表，每列顯示訂單、客戶名稱、品項數。CRUD 的資料表是為寫入設計的（正規化），得把 ${LIST_TABLES.join('、')} ${LIST_TABLES.length} 張表 JOIN 起來。CQRS 的讀取端早就照畫面需要組好了，直接讀一張表。`,
  each((sim, sys) => ({
    action: '查訂單列表（含客戶名、品項數）',
    state: { [sys.readStore]: sys.readJoins ? 'needed' : 'ok' },
    on: edgesOnPath(sys, sys.read),
    tokens: { qry: { at: sys.readStore, label: sys.readJoins ? `JOIN ×${sys.readJoins}` : '直接讀' } },
    wires: { in: true, out: true },
    verdict: sys.readJoins ? `每次查詢都要 JOIN ${sys.readJoins} 次` : '讀一張組好的表，不用 JOIN',
  })));

each((sim, sys) => { sim.stats.scaleRead = sys.separateRead ? '可以' : '不行，讀寫綁在一起'; });
push('scale', C4, 5600,
  '查詢量是寫入量的 100 倍。CQRS 的讀取端是獨立的資料庫與服務，可以只把它複製多份，寫入端不動。CRUD 的讀寫在同一個服務、同一組資料表，要擴充只能整組一起。',
  each((sim, sys) => ({
    action: '查詢量是寫入的 100 倍',
    state: sys.separateRead ? { qry: 'active', rdb: 'active' } : { api: 'focus', svc: 'focus', db: 'needed' },
    badges: sys.separateRead ? { qry: '×4', rdb: '×4' } : {},
    wires: { in: true, out: true },
    verdict: sys.separateRead ? '只擴充讀取端 ×4' : '讀寫共用，只能整組擴充',
  })));

// ---- 新報表：能不能看到歷史 ----
const C5 = '新增報表';
push('report-plan', C5, 4400,
  '財務要一張新的營收報表：每筆訂單的原價、改價紀錄，以及被取消的訂單金額，要涵蓋上線以來全部的資料。',
  each((sim, sys) => {
    sim.nodes.add('report');
    return { action: '新增營收報表（含改價、取消紀錄）', state: { report: 'new' }, wires: { in: true, out: false }, verdict: '需要過去發生的每一件事' };
  }));

// 能重建的資料：一般資料庫只剩目前狀態，Event Store 有全部事件
const allEvents = writeEvents;
const reportCover = (sys) => (sys.eventSourced
  ? { events: allEvents.length, text: `全部 ${allEvents.length} 個事件` }
  : { events: countRows(allEvents), text: `只有目前 ${countRows(allEvents)} 筆` });
const lost = allEvents.length - countRows(allEvents);
push('report-build', C5, 6400,
  `CRUD 和 CQRS 的資料庫只存目前狀態：o2 只剩改價後的 250，原價 300 不見了；被取消的 o3 已經刪除。報表只能做 ${countRows(allEvents)} 筆。Event Sourcing 讓新的 Projector 從第一個事件重播到最後一個，${allEvents.length} 個事件全部還在，改價和取消都算得出來；另外兩邊有 ${lost} 件事已經無從得知。`,
  each((sim, sys) => {
    const cover = reportCover(sys);
    sim.stats.report = cover.text;
    const source = sys.id === 'crud' ? 'db' : sys.eventSourced ? 'store' : 'wdb';
    if (sys.id !== 'crud') sim.edges.add('prep');
    else sim.edges.add('rd');
    return {
      action: '新增營收報表（含改價、取消紀錄）',
      state: { report: sys.eventSourced ? 'ok' : 'stale', [source]: sys.eventSourced ? 'active' : 'needed' },
      on: sys.id === 'crud' ? ['rd'] : ['wp', 'prep'],
      tokens: { evt: { at: 'report', label: sys.eventSourced ? `重播 ${allEvents.length} 個事件` : `${countRows(allEvents)} 筆目前狀態` } },
      wires: { in: false, out: true },
      verdict: sys.eventSourced ? '從頭重播，歷史完整' : `改價前的金額、取消的訂單都找不回來`,
    };
  }));
steps[steps.length - 2].data.panels.forEach((p, i) => {
  const sys = systems[i];
  p.tokens.evt = { at: sys.id === 'crud' ? 'db' : sys.write[2], label: '', hidden: true };
});

// ---- 對照 ----
const stat = (id) => sims.map((sim) => sim.stats[id]);
export const compare = {
  title: '同一個訂單系統，三種讀寫方式',
  rows: [
    { label: '寫入端存了什麼', values: stat('store') },
    { label: '剛下單立刻查得到', values: stat('fresh'), highlight: true },
    { label: '查訂單列表要 JOIN', values: stat('joins'), highlight: true },
    { label: '能單獨擴充讀取端', values: stat('scaleRead'), highlight: true },
    { label: '新報表能看到的歷史', values: stat('report'), highlight: true },
    { label: '代價', values: ['讀寫互相拖累，複雜查詢與寫入搶同一組表', '兩套模型、資料同步、要處理最終一致', '再加上事件版本管理、重播時間、快照，學習成本最高'] },
    { label: '適合', values: ['大部分一般的業務系統', '讀寫比例懸殊、查詢畫面很多樣', '需要稽核軌跡、回溯歷史、金融或訂單流程'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: 'CQRS 讓讀和寫各自用最適合的模型，代價是讀取端會晚一步。Event Sourcing 再進一步把「發生過的事」當成唯一的真相，任何時候都能重建出新的 view。兩者都會增加複雜度，只在真的需要時才用。',
  data: { kind: 'compare' },
});
