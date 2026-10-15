// 複製 vs 共用動畫：同一份訂單（數量、價格，加上 1000 筆品項），做兩件常見的事：
// 1. 「b = a」複製一份草稿來改；2. 把訂單交給「預覽折扣價」的函式。三種語言行為並排同步前進：
// 1. 複製（值型別）：b 拿到完整的一份，改 b 不影響 a，但每次都要複製全部資料。
// 2. 共用（參考型別）：b 和 a 指著同一份資料，不用複製，但改 b 就改到 a。
// 3. 不可變資料：資料不能原地修改，要改就產生新版本，沒變的部分（1000 筆品項）直接共用。
// 每個變數指著哪份資料、改了誰、複製了多少筆，都由下面的小型模擬算出，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

const ITEMS = 1000;
const START = { qty: 1, price: 1000 };

const STATS = [
  { id: 'orig', label: '正式訂單 a 現在是' },
  { id: 'copied', label: '複製了幾筆資料' },
  { id: 'surprise', label: '正式訂單被意外改到' },
];

const VARS = [
  { id: 'a', name: '變數 a', sub: '正式訂單', cell: [1, 1] },
  { id: 'b', name: '變數 b', sub: '草稿', cell: [1, 2] },
  { id: 'fn', name: '預覽函式', sub: '參數 order', cell: [1, 3] },
];
// 每個變數各自的資料會放在哪一格：o 是訂單本身，i 是它的品項清單
const SLOT = { a: { o: 'o1', i: 'i1' }, b: { o: 'o2', i: 'i2' }, fn: { o: 'o3', i: 'i3' } };
const EDGE_LIST = [['a', 'o1'], ['b', 'o1'], ['b', 'o2'], ['fn', 'o1'], ['fn', 'o3'], ['o1', 'i1'], ['o2', 'i2'], ['o2', 'i1'], ['o3', 'i3'], ['o3', 'i1']];
const eid = (from, to) => `${from}-${to}`;

export const systems = [
  {
    id: 'copy', title: '複製（值型別）', short: '複製',
    rule: '把 a 交給 b 時，b 拿到完整的一份。之後怎麼改 b 都不影響 a，但資料越大，每次複製越花時間和記憶體。',
    langs: 'C、Go、Swift、C# 的 struct；PHP 的陣列',
    code: 'b := a        <i>// Go：整份複製</i>\nb.Qty = 5     <i>// 只改到 b</i>\nfmt.Println(a.Qty) <i>// 1</i>',
    semantics: 'copy',
    names: { o2: '訂單（b 的複本）', o3: '訂單（參數複本）', i2: '品項（複本）', i3: '品項（複本）' },
  },
  {
    id: 'share', title: '共用（參考型別）', short: '共用',
    rule: '把 a 交給 b 時，b 只拿到「資料在哪裡」，兩個變數指著同一份。不用複製，但改 b 就等於改 a。',
    langs: 'JavaScript、Python、Java、C# 的物件',
    code: 'const b = a   <i>// JS：指著同一份</i>\nb.qty = 5\nconsole.log(a.qty) <i>// 5！</i>',
    semantics: 'share',
    names: { o2: '（沒有用到）', o3: '（沒有用到）', i2: '（沒有用到）', i3: '（沒有用到）' },
  },
  {
    id: 'immutable', title: '不可變資料', short: '不可變',
    rule: '資料一旦建立就不能改。要「改」就產生一份新版本，只複製改到的那一層，沒變的部分（品項）新舊版本共用。',
    langs: 'Java record、Kotlin data class、Python 的 tuple；JavaScript 搭配展開寫法、React 的 state',
    code: 'const b = { ...a, qty: 5 } <i>// 新版本</i>\n<i>// a.items 和 b.items 是同一份</i>\nconsole.log(a.qty) <i>// 1</i>',
    semantics: 'immutable',
    names: { o2: '訂單（b 的新版本）', o3: '訂單（預覽的新版本）', i2: '（沒有用到）', i3: '（沒有用到）' },
  },
];
systems.forEach((sys) => {
  Object.assign(sys, {
    processLabel: '箭頭 = 變數指著哪一份資料',
    cols: 3, rows: 3,
    nodes: [
      ...VARS.map((v) => ({ ...v, ring: 'app', hidden: v.id !== 'a' })),
      { id: 'o1', name: '訂單', ring: 'core', cell: [2, 1] },
      { id: 'o2', name: sys.names.o2, ring: 'core', cell: [2, 2], hidden: true },
      { id: 'o3', name: sys.names.o3, ring: 'core', cell: [2, 3], hidden: true },
      { id: 'i1', name: '品項清單', ring: 'infra', cell: [3, 1] },
      { id: 'i2', name: sys.names.i2, ring: 'infra', cell: [3, 2], hidden: true },
      { id: 'i3', name: sys.names.i3, ring: 'infra', cell: [3, 3], hidden: true },
    ],
    edges: EDGE_LIST.map(([from, to]) => ({ id: eid(from, to), from, to, kind: 'dep', hidden: !(from === 'a' || (from === 'o1' && to === 'i1')) })),
    stats: STATS,
  });
});

// ---- 小型模擬：變數指著哪份資料、每份資料長什麼樣 ----
function makeStore(semantics) {
  return {
    semantics,
    vars: { a: 'o1' },
    objs: { o1: { ...START, items: 'i1' }, i1: { n: ITEMS } },
    copied: 0,
    surprise: 0,
    touched: new Set(), // 這一拍被新建或修改的資料
    created: new Set(),
  };
}
const ops = {
  // dst = src：複製就整份（含品項）複製一份；共用與不可變都只是多一個變數指著同一份
  assign(s, dst, src) {
    if (s.semantics !== 'copy') { s.vars[dst] = s.vars[src]; return; }
    const from = s.objs[s.vars[src]];
    const { o, i } = SLOT[dst];
    s.objs[i] = { n: s.objs[from.items].n };
    s.objs[o] = { ...from, items: i };
    s.vars[dst] = o;
    s.copied += 1 + s.objs[i].n;
    [o, i].forEach((id) => { s.created.add(id); s.touched.add(id); });
  },
  // 改某個變數的欄位：不可變資料不能原地改，產生只複製外層的新版本，品項沿用舊的那份
  set(s, name, field, value) {
    const cur = s.vars[name];
    if (s.semantics === 'immutable') {
      const o = SLOT[name].o;
      s.objs[o] = { ...s.objs[cur], [field]: value };
      s.vars[name] = o;
      s.copied += 1;
      s.created.add(o);
      s.touched.add(o);
      return;
    }
    s.objs[cur][field] = value;
    s.touched.add(cur);
    // 改的不是 a，卻改到了 a 指著的那份：意外
    if (name !== 'a' && cur === s.vars.a) s.surprise += 1;
  },
  drop(s, name) { delete s.vars[name]; },
  // 換一份乾淨的正式訂單，讓第二段不受第一段的結果影響（不算複製，也不算修改）
  fresh(s) { s.objs.o1 = { ...START, items: 'i1' }; s.objs.i1 = { n: ITEMS }; s.vars.a = 'o1'; },
};

const stores = systems.map((sys) => makeStore(sys.semantics));
const sims = systems.map(makeSim);
const fmt = (o) => `數量 ${o.qty}・${o.price} 元`;

function snapshot(s, sim, beat) {
  // 從變數出發走得到的資料才畫出來
  const shown = new Set(Object.keys(s.vars));
  Object.values(s.vars).forEach((o) => { shown.add(o); shown.add(s.objs[o].items); });
  const edges = new Set();
  Object.entries(s.vars).forEach(([v, o]) => edges.add(eid(v, o)));
  [...shown].filter((id) => id.startsWith('o')).forEach((o) => edges.add(eid(o, s.objs[o].items)));
  sim.nodes = shown;
  sim.edges = edges;
  const notes = {};
  [...shown].forEach((id) => {
    if (id.startsWith('o')) notes[id] = fmt(s.objs[id]);
    if (id.startsWith('i')) notes[id] = `${s.objs[id].n} 筆`;
  });
  const state = {};
  s.touched.forEach((id) => { if (shown.has(id)) state[id] = s.created.has(id) ? 'new' : 'edited'; });
  // 共用的品項：被兩份訂單指著
  const sharers = (i) => [...shown].filter((o) => o.startsWith('o') && s.objs[o].items === i).length;
  [...shown].filter((id) => id.startsWith('i') && sharers(id) > 1).forEach((id) => { state[id] = 'shared'; });
  if (beat.surprised && s.objs[s.vars.a][beat.surprised.field] !== beat.surprised.expect) { state.a = 'surprise'; state[s.vars.a] = 'surprise'; }
  sim.stats = {
    orig: fmt(s.objs[s.vars.a]),
    copied: `${s.copied.toLocaleString('en-US')} 筆`,
    surprise: `${s.surprise} 次`,
  };
  return { state, notes };
}

export const steps = [];
function beat(id, chapter, duration, caption, spec) {
  stores.forEach((s) => { s.touched = new Set(); s.created = new Set(); });
  spec.ops.forEach(([op, ...args]) => stores.forEach((s) => ops[op](s, ...args)));
  const panels = stores.map((s, i) => {
    const snap = snapshot(s, sims[i], spec);
    return view(sims[i], {
      action: spec.action,
      state: snap.state,
      notes: snap.notes,
      on: (spec.on ? spec.on(s) : []).filter((e) => sims[i].edges.has(e)),
      wires: { in: Boolean(spec.first), out: Boolean(spec.last) },
      verdict: spec.verdict(s, i),
    });
  });
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels } });
}
const said = (i, ...xs) => xs[i];
const pointsTo = (s, v) => [eid(v, s.vars[v])];

// ---- 第一段：複製一份草稿來改 ----
const C1 = '複製一份來改';
beat('s0', C1, 4800,
  `變數 a 指著一份正式訂單：${fmt(START)}，裡面還有 ${ITEMS} 筆品項。三種語言一開始都一樣。`,
  { action: '建立正式訂單', ops: [], first: true, on: (s) => pointsTo(s, 'a'), verdict: () => 'a 指著正式訂單' });
beat('s1', C1, 6000,
  `想做一份草稿來改，寫下 b = a。複製：b 拿到完整的一份，連 ${ITEMS} 筆品項一起複製。共用：b 只拿到「訂單在哪裡」，跟 a 指著同一份。不可變：也是指著同一份，反正誰都改不了它。`,
  { action: 'b = a', ops: [['assign', 'b', 'a']], on: (s) => pointsTo(s, 'b'),
    verdict: (s, i) => said(i, `複製了 ${(1 + ITEMS).toLocaleString('en-US')} 筆`, 'a 和 b 指著同一份', 'a 和 b 指著同一份（不可修改）') });
beat('s2', C1, 6400,
  '在草稿上把數量改成 5。複製：只改到 b 自己那一份。共用：改的是 a、b 共用的那一份，正式訂單也變成 5 了。不可變：不能原地改，於是產生一份數量 5 的新版本給 b，品項沒變，新舊版本共用同一份。',
  { action: 'b.數量 = 5', ops: [['set', 'b', 'qty', 5]], on: (s) => pointsTo(s, 'b'), surprised: { field: 'qty', expect: START.qty },
    verdict: (s, i) => said(i, '只改到 b 的複本', '改到了 a、b 共用的那一份', '產生新版本，品項沿用舊的') });
beat('s3', C1, 6000,
  `回頭看正式訂單 a：複製是數量 ${stores[0].objs[stores[0].vars.a].qty}；共用變成數量 ${stores[1].objs[stores[1].vars.a].qty}，明明沒碰 a，它卻被改了；不可變是數量 ${stores[2].objs[stores[2].vars.a].qty}，而且只多複製了 1 筆。`,
  { action: '讀取 a.數量', ops: [], last: true, on: (s) => pointsTo(s, 'a'), surprised: { field: 'qty', expect: START.qty },
    verdict: (s) => (s.objs[s.vars.a].qty === START.qty ? `a 還是數量 ${START.qty}` : `a 被改成數量 ${s.objs[s.vars.a].qty}`) });

// ---- 第二段：交給函式 ----
const C2 = '交給函式';
beat('f0', C2, 5600,
  '草稿用完了。另一個常見情境：把正式訂單交給「預覽折扣價」函式，它只是要算給使用者看，不該改到正式訂單。呼叫函式時，參數就像 b = a，三種語言的規則一模一樣。',
  { action: '預覽折扣價(a)',
    ops: [['drop', 'b'], ['fresh'], ['assign', 'fn', 'a']], first: true, on: (s) => pointsTo(s, 'fn'),
    verdict: (s, i) => said(i, `參數拿到一份複本，又複製了 ${(1 + ITEMS).toLocaleString('en-US')} 筆`, '參數和 a 指著同一份', '參數和 a 指著同一份') });
beat('f1', C2, 6400,
  '函式裡把價格打八折，改成 800 元。複製：改的是參數自己的複本。共用：改的是 a 那一份，預覽一下，正式訂單的價格就被改掉了。不可變：產生一份 800 元的新版本回傳，正式訂單不受影響。',
  { action: 'order.價格 = 800', ops: [['set', 'fn', 'price', 800]], on: (s) => pointsTo(s, 'fn'), surprised: { field: 'price', expect: START.price },
    verdict: (s, i) => said(i, '只改到參數的複本', '正式訂單也被打了八折', '回傳 800 元的新版本') });
beat('f2', C2, 6400,
  `函式結束。正式訂單 a：複製 ${stores[0].objs[stores[0].vars.a].price} 元、共用 ${stores[1].objs[stores[1].vars.a].price} 元、不可變 ${stores[2].objs[stores[2].vars.a].price} 元。這種「呼叫了一個函式，資料卻被偷偷改掉」的 bug，是共用語言裡最常見的錯誤之一。`,
  { action: '預覽結束', ops: [['drop', 'fn']], last: true, on: (s) => pointsTo(s, 'a'), surprised: { field: 'price', expect: START.price },
    verdict: (s) => (s.objs[s.vars.a].price === START.price ? `a 還是 ${START.price} 元` : `a 被改成 ${s.objs[s.vars.a].price} 元`) });

// ---- 對照 ----
const finals = sims.map((sim) => sim.stats);
export const compare = {
  title: '同一份訂單，複製一份來改、交給函式，三種語言行為',
  rows: [
    { label: '正式訂單最後是', values: finals.map((f) => f.orig), highlight: true },
    { label: '正式訂單被意外改到', better: 'low', values: finals.map((f) => f.surprise), highlight: true },
    { label: '複製了幾筆資料', better: 'low', values: finals.map((f) => f.copied), highlight: true },
    { label: '代價', values: ['資料大時複製很慢、很佔記憶體；函式裡改了參數，呼叫的人看不到（要記得回傳）', '不知道誰還指著同一份，任何一處修改都可能影響別處', '每次修改都產生新版本；要用支援「共用沒變部分」的寫法，不然一樣慢'] },
    { label: '常見語言', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '同一行 b = a，在不同語言裡意思不同：可能是整份複製，也可能只是多一個名字指著同一份。不確定時先查清楚；資料要在很多地方傳來傳去時，不可變資料讓「誰改了它」這個問題直接消失。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  s0: `變數 a 指著一份訂單：${fmt(START)}，裡面有 ${ITEMS} 筆品項。箭頭表示「指著哪一份」。`,
  s1: 'b = a。複製：b 拿到完整的一份；共用和不可變：b 跟 a 指著同一份。',
  s2: '把草稿 b 的數量改成 5。共用那一份，連 a 也一起變了；不可變則產生一份新版本。',
  s3: `回頭看 a：只有共用那一份被改成數量 ${stores[1].objs[stores[1].vars.a].qty}。不可變只多複製了 1 筆。`,
  f0: '把正式訂單交給「預覽折扣價」函式。呼叫函式時，規則跟 b = a 一樣。',
  f1: '函式裡把價格改成 800 元。共用那一份，正式訂單也被打了八折。',
  f2: `函式結束。共用那一份的正式訂單變成 ${stores[1].objs[stores[1].vars.a].price} 元，另外兩種還是 ${START.price} 元。`,
  compare: '同一行 b = a，可能是整份複製，也可能只是指著同一份。不可變資料讓「誰改了它」這個問題消失。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
