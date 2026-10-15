// 記憶體回收動畫：同一段程式在三種回收方式下各跑一次，三個面板同步前進。
// 1. 手動釋放（C、C++）：程式設計師自己寫 free，忘了寫會洩漏，寫太早會讀到已經還回去的記憶體。
// 2. 參考計數（Python、Swift、PHP）：每塊資料記著「有幾個人指著我」，歸零就立刻回收；互相指著的一圈永遠不會歸零。
// 3. 追蹤式垃圾回收（Java、Go、JavaScript、C#）：每隔一陣子從「程式正在用的變數」出發，走不到的全部回收；代價是回收時要暫停。
// 三個情境：用完的暫存資料、互相指著的資料、兩個地方共用的資料。
// 每塊資料何時被回收、哪些洩漏、哪裡讀到已歸還的記憶體，都由下面的小型記憶體模擬算出，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

const GC_PAUSE = 15; // 每次垃圾回收暫停的毫秒數（示意）

// 「程式正在用的地方」：函式裡的變數、全域的名單。從這裡指得到的資料才算還在用
const ROOTS = [
  { id: 'req', name: '處理請求的函式', cell: [1, 1] },
  { id: 'login', name: '登入名單', cell: [1, 2] },
  { id: 'rec', name: '推薦區', cell: [1, 3] },
  { id: 'home', name: '首頁', cell: [3, 3] },
];
const OBJS = [
  { id: 'report', name: '報表暫存', mb: 8, cell: [2, 1] },
  { id: 'user', name: '使用者', mb: 1, cell: [2, 2] },
  { id: 'cart', name: '購物車', mb: 2, cell: [3, 2] },
  { id: 'hot', name: '熱門商品', mb: 1, cell: [2, 3] },
];
const EDGE_LIST = [['req', 'report'], ['login', 'user'], ['user', 'cart'], ['cart', 'user'], ['home', 'hot'], ['rec', 'hot']];
const eid = (from, to) => `${from}-${to}`;
const isRoot = (id) => ROOTS.some((r) => r.id === id);
const OBJ = Object.fromEntries(OBJS.map((o) => [o.id, o]));

const STATS = [
  { id: 'used', label: '佔用的記憶體' },
  { id: 'leak', label: '永遠收不回來' },
  { id: 'crash', label: '讀到已歸還的記憶體' },
  { id: 'pause', label: '回收時程式暫停' },
];

export const systems = [
  {
    id: 'manual', title: '手動釋放', short: '手動',
    rule: '用完的記憶體要自己寫 free 還回去。忘了寫會洩漏；別人還在用就還回去，會讀到亂掉的資料甚至當機。',
    langs: 'C、C++（不用智慧指標時）',
    code: 'Report *r = <b>malloc</b>(sizeof(Report));\n…\n<b>free</b>(r); <i>// 忘了寫就洩漏</i>',
    policy: 'manual',
  },
  {
    id: 'rc', title: '參考計數', short: '參考計數',
    rule: '每塊資料記著「有幾個地方指著我」，數字歸零就立刻回收。互相指著的一圈資料，數字永遠不會歸零。',
    langs: 'Python、Swift、PHP、Objective-C',
    code: 'r = Report()   <i># 參考數 1</i>\nr = None       <i># 歸零，立刻回收</i>\n<i># 互相指著的一圈要另外處理</i>',
    policy: 'rc',
  },
  {
    id: 'gc', title: '追蹤式垃圾回收', short: '垃圾回收',
    rule: '每隔一陣子從「程式正在用的變數」出發，順著指向走一遍，走不到的全部回收。不怕互相指著，但回收時程式要暫停一下。',
    langs: 'Java、Go、JavaScript、C#',
    code: 'Report r = new Report();\nr = null; <i>// 不用寫 free</i>\n<i>// 等垃圾回收器下次巡視時回收</i>',
    policy: 'gc',
  },
];
systems.forEach((sys) => {
  Object.assign(sys, {
    processLabel: '箭頭 = 指向（還在用這塊資料）',
    cols: 3, rows: 3,
    nodes: [
      ...ROOTS.map((r) => ({ ...r, ring: 'app', sub: '程式正在用' })),
      ...OBJS.map((o) => ({ id: o.id, name: o.name, sub: `${o.mb} MB`, ring: 'core', cell: o.cell, hidden: true })),
    ],
    edges: EDGE_LIST.map(([from, to]) => ({ id: eid(from, to), from, to, kind: 'dep', hidden: true })),
    tokens: [{ id: 'r', tone: 'req' }],
    stats: STATS,
  });
});

// ---- 小型記憶體模擬 ----
function makeHeap(policy) {
  return { policy, alive: new Set(), freed: new Set(), edges: new Set(), crashes: 0, pauses: 0, frees: 0, justFreed: new Set() };
}
// 某塊資料目前被幾個地方指著（只算還活著的來源）
const countOf = (h, id) => [...h.edges].filter((e) => {
  const [from, to] = e.split('>');
  return to === id && (isRoot(from) || h.alive.has(from));
}).length;
function reachable(h) {
  const seen = new Set(ROOTS.map((r) => r.id));
  const queue = [...seen];
  while (queue.length) {
    const cur = queue.shift();
    [...h.edges].map((e) => e.split('>')).filter(([from, to]) => from === cur && h.alive.has(to) && !seen.has(to)).forEach(([, to]) => {
      seen.add(to);
      queue.push(to);
    });
  }
  return seen;
}
function release(h, id) {
  h.alive.delete(id);
  h.freed.add(id);
  h.justFreed.add(id);
  // 資料被回收後，它往外的指向也跟著消失；別人指向它的箭頭還在（手動釋放時就變成懸空）
  [...h.edges].filter((e) => e.startsWith(`${id}>`)).forEach((e) => h.edges.delete(e));
}
function cascade(h) {
  if (h.policy !== 'rc') return;
  let again = true;
  while (again) {
    again = false;
    [...h.alive].forEach((id) => {
      if (countOf(h, id) === 0) { release(h, id); again = true; }
    });
  }
}
const ops = {
  alloc(h, id, from) { h.alive.add(id); h.freed.delete(id); h.edges.add(`${from}>${id}`); },
  link(h, from, to) { h.edges.add(`${from}>${to}`); },
  unlink(h, from, to) { h.edges.delete(`${from}>${to}`); cascade(h); },
  // 只有手動釋放的程式會寫 free；另外兩種語言根本沒有這行
  free(h, id) { if (h.policy === 'manual') { h.frees += 1; release(h, id); } },
  gc(h) {
    if (h.policy !== 'gc') return;
    h.pauses += 1;
    const live = reachable(h);
    [...h.alive].filter((id) => !live.has(id)).forEach((id) => release(h, id));
  },
  read(h, from, id) { if (!h.alive.has(id)) h.crashes += 1; },
};

const heaps = systems.map((s) => makeHeap(s.policy));
const sims = systems.map(makeSim);

function snapshot(h, sim, beat) {
  const live = reachable(h);
  const state = {};
  const notes = {};
  const shownNodes = new Set(ROOTS.map((r) => r.id));
  const edgeState = {};
  OBJS.forEach(({ id }) => {
    if (h.alive.has(id)) {
      shownNodes.add(id);
      if (!live.has(id)) state[id] = h.policy === 'gc' ? 'garbage' : 'leak';
      if (h.policy === 'rc') notes[id] = `參考數 ${countOf(h, id)}`;
    } else if (h.freed.has(id)) {
      // 剛回收的這一拍還留著，讓讀者看到它被收走；之後就消失。手動釋放後仍被指著的，變成懸空
      const dangling = [...h.edges].some((e) => e.endsWith(`>${id}`));
      if (dangling || h.justFreed.has(id)) {
        shownNodes.add(id);
        state[id] = dangling ? 'dangling' : 'freed';
        if (h.policy === 'rc') notes[id] = '參考數 0';
      }
    }
  });
  (beat.touch || []).forEach((id) => { if (h.alive.has(id) && !state[id]) state[id] = 'active'; });
  if (beat.crash && h.crashes > beat.crashBefore) state[beat.crash] = 'crash';
  if (beat.marking && h.policy === 'gc') [...live].filter((id) => !isRoot(id)).forEach((id) => { if (!state[id]) state[id] = 'marked'; });
  const shownEdges = new Set();
  [...h.edges].forEach((e) => {
    const [from, to] = e.split('>');
    if (shownNodes.has(from) && shownNodes.has(to)) {
      shownEdges.add(eid(from, to));
      if (!h.alive.has(to)) edgeState[eid(from, to)] = 'cut';
    }
  });
  sim.nodes = shownNodes;
  sim.edges = shownEdges;
  const mb = (ids) => ids.reduce((a, id) => a + OBJ[id].mb, 0);
  const aliveObjs = [...h.alive];
  sim.stats = {
    used: `${mb(aliveObjs)} MB`,
    leak: `${mb(aliveObjs.filter((id) => !live.has(id) && h.policy !== 'gc'))} MB`,
    crash: `${h.crashes} 次`,
    pause: `${h.pauses * GC_PAUSE} ms`,
  };
  return { state, notes, edgeState };
}

export const steps = [];
// 每一拍：對三個記憶體做同一串動作（各自的規則決定結果），再拍成畫面
function beat(id, chapter, duration, caption, spec) {
  const crashBefore = heaps.map((h) => h.crashes);
  heaps.forEach((h) => { h.justFreed = new Set(); });
  spec.ops.forEach(([op, ...args]) => heaps.forEach((h) => ops[op](h, ...args)));
  const panels = heaps.map((h, i) => {
    const snap = snapshot(h, sims[i], { ...spec, crashBefore: crashBefore[i] });
    const v = view(sims[i], {
      action: spec.action,
      state: snap.state,
      notes: snap.notes,
      edgeState: snap.edgeState,
      on: (spec.on || []).filter((e) => sims[i].edges.has(e)),
      tokens: spec.tokens || {},
      wires: { in: spec.first, out: spec.last },
      verdict: spec.verdict(h, i, snap),
    });
    return v;
  });
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels } });
}
const said = (i, a, b, c) => [a, b, c][i];

// ---- 第一段：用完的暫存資料 ----
const C1 = '用完的暫存資料';
beat('a1', C1, 4800,
  `處理請求的函式產生一份 ${OBJ.report.mb} MB 的報表暫存。三種語言都一樣：向系統要一塊記憶體，函式裡的變數指著它。`,
  { action: '產生報表暫存', ops: [['alloc', 'report', 'req']], touch: ['report'], on: [eid('req', 'report')], first: true,
    verdict: () => '函式正在用這份報表' });
beat('a2', C1, 6000,
  '函式結束，變數消失，報表沒人用了。手動釋放：這段程式在某個提早 return 的分支忘了寫 free，報表永遠收不回來。參考計數：指著它的數字歸零，立刻回收。垃圾回收：先留著，等回收器下次巡視。',
  { action: '函式結束', ops: [['unlink', 'req', 'report']],
    verdict: (h, i) => said(i, '忘了 free：洩漏', '參考數歸零，立刻回收', '沒人指著了，等下次回收') });
beat('a3', C1, 5600,
  `過了一陣子，垃圾回收器開始巡視：從程式正在用的地方出發，走不到報表，就把它收掉。這一次程式暫停了約 ${GC_PAUSE}ms。手動釋放的報表還是洩漏著，程式跑越久、洩漏越多。`,
  { action: '垃圾回收器巡視', ops: [['gc']], marking: true,
    verdict: (h, i) => said(i, `洩漏的 ${OBJ.report.mb} MB 還在`, '早就回收了', `收掉報表，暫停 ${GC_PAUSE}ms`) });

// ---- 第二段：互相指著的資料 ----
const C2 = '互相指著';
beat('b1', C2, 5600,
  '使用者登入：登入名單指著「使用者」，使用者指著自己的「購物車」，購物車也記著「主人是誰」指回使用者。兩塊資料互相指著，形成一個圈。',
  { action: '使用者登入', ops: [['alloc', 'user', 'login'], ['alloc', 'cart', 'user'], ['link', 'cart', 'user']], touch: ['user', 'cart'],
    on: [eid('login', 'user'), eid('user', 'cart'), eid('cart', 'user')], first: true,
    verdict: () => '使用者和購物車互相指著' });
beat('b2', C2, 6400,
  `使用者登出，登入名單不再指著他。手動釋放：這次程式設計師記得把兩塊都 free 掉。參考計數：使用者還被購物車指著、購物車還被使用者指著，數字都停在 1，永遠不會歸零，${OBJ.user.mb + OBJ.cart.mb} MB 洩漏。垃圾回收：兩塊都走不到了，等下次巡視。`,
  { action: '使用者登出', ops: [['unlink', 'login', 'user'], ['free', 'cart'], ['free', 'user']],
    verdict: (h, i) => said(i, '程式設計師手動 free 了兩塊', '互相指著，參考數停在 1：洩漏', '兩塊都走不到了，等下次回收') });
beat('b3', C2, 5600,
  '垃圾回收器再次巡視：它不管誰指著誰，只看「從程式正在用的地方走不走得到」。走不到這一圈，整圈收掉。參考計數的這一圈還留在記憶體裡。',
  { action: '垃圾回收器巡視', ops: [['gc']], marking: true,
    verdict: (h, i) => said(i, '早就手動釋放了', '這一圈永遠收不回來', `整圈收掉，又暫停 ${GC_PAUSE}ms`) });

// ---- 第三段：兩個地方共用 ----
const C3 = '共用的資料';
beat('c1', C3, 5200,
  '首頁產生一份「熱門商品」資料，推薦區也拿來用。現在有兩個地方指著同一塊資料。',
  { action: '首頁與推薦區共用熱門商品', ops: [['alloc', 'hot', 'home'], ['link', 'rec', 'hot']], touch: ['hot'],
    on: [eid('home', 'hot'), eid('rec', 'hot')], first: true,
    tokens: { r: { at: 'rec', label: '讀取', hidden: true } },
    verdict: () => '兩個地方共用熱門商品' });
beat('c2', C3, 6400,
  '首頁畫完了，不再需要熱門商品。手動釋放：寫首頁的人以為「我用完了」就 free 掉，卻不知道推薦區還指著它，推薦區手上的指向變成懸空。參考計數：數字從 2 變 1，還有人用，不回收。垃圾回收：推薦區還走得到，不回收。',
  { action: '首頁用完了', ops: [['unlink', 'home', 'hot'], ['free', 'hot']],
    tokens: { r: { at: 'rec', label: '讀取', hidden: true } },
    verdict: (h, i) => said(i, '太早 free：推薦區指著已歸還的記憶體', '參考數 2 → 1，還在用', '推薦區還走得到，保留') });
beat('c3', C3, 6400,
  '推薦區去讀熱門商品。手動釋放：那塊記憶體已經還給系統，可能被別的資料蓋掉了，讀到亂碼或直接當機，而且不是每次都會發生，很難追。另外兩種都正常讀到。',
  { action: '推薦區讀取熱門商品', ops: [['read', 'rec', 'hot']], crash: 'hot', touch: ['hot'], on: [eid('rec', 'hot')], last: true,
    tokens: { r: { at: 'hot', label: '讀取' } },
    verdict: (h, i) => said(i, '讀到已歸還的記憶體：亂碼或當機', '正常讀到', '正常讀到') });

// ---- 對照 ----
const finals = sims.map((sim) => sim.stats);
export const compare = {
  title: '同一段程式，三種記憶體回收方式',
  rows: [
    { label: '最後永遠收不回來', better: 'low', values: finals.map((f) => f.leak), highlight: true },
    { label: '讀到已歸還的記憶體', better: 'low', values: finals.map((f) => f.crash), highlight: true },
    { label: '回收時程式暫停', better: 'low', values: finals.map((f) => f.pause), highlight: true },
    { label: '要自己寫的釋放程式', better: 'low', values: heaps.map((h) => `${h.frees} 處`), highlight: true },
    { label: '什麼時候回收', values: ['寫 free 的那一刻', '沒人指著的那一刻', '回收器下次巡視時'] },
    { label: '代價', values: ['忘了寫會洩漏，寫太早會當機，兩種錯都很難找', '每次改指向都要更新數字；互相指著的一圈要用「弱參照」或另外的回收器處理', '回收時要暫停；記憶體要等下次巡視才釋放，平常會多佔一些'] },
    { label: '常見語言', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '三種方式都在回答同一個問題：這塊記憶體什麼時候可以還回去？手動釋放交給人判斷，最快也最容易出錯；參考計數即時回收，但怕互相指著；垃圾回收最省心，代價是偶爾暫停。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  a1: `函式產生一份 ${OBJ.report.mb} MB 的報表。箭頭表示「還有人在用這塊資料」。`,
  a2: '函式結束，報表沒人用了。手動：忘了歸還，洩漏；參考計數：立刻回收；垃圾回收：等下次巡視。',
  a3: `垃圾回收器巡視，把沒人用的報表收掉，程式暫停了約 ${GC_PAUSE}ms。手動那份還洩漏著。`,
  b1: '使用者登入。使用者指著購物車，購物車也指回使用者，兩塊互相指著。',
  b2: '使用者登出。參考計數：兩塊互相指著，數字永遠不會歸零，洩漏了；手動這次記得歸還。',
  b3: '垃圾回收器只看「程式還走不走得到」，整圈收掉。參考計數那一圈還留著。',
  c1: '首頁和推薦區共用同一份「熱門商品」。',
  c2: '首頁用完了。手動：首頁就把它歸還，卻不知道推薦區還在用；另外兩種都知道還有人用。',
  c3: '推薦區去讀。手動那份讀到已經歸還的記憶體，可能是亂碼或直接當機。',
  compare: '手動最快但最容易出錯；參考計數即時回收，但怕互相指著；垃圾回收最省心，代價是偶爾暫停。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
