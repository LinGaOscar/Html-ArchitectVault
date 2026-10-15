// 錯誤怎麼往上傳動畫：同一個下單流程（API → 下單服務 → 庫存檢查 → 資料庫），資料庫逾時出錯，
// 看錯誤怎麼一路回到使用者面前。三種語言常見的做法並排同步前進：
// 1. 拋出例外（Java、Python、JavaScript、C#）：錯誤直接跳到最近的 catch，中間層不用寫任何東西。
// 2. 回傳錯誤值（Go、C）：錯誤是普通的回傳值，每一層都要自己檢查、自己往上傳。
// 3. Result 型別（Rust；Swift、Kotlin 有類似寫法）：回傳值裡「成功或失敗」二選一，不處理就拿不到值，編譯器會擋。
// 第二段讓「庫存檢查」這一層的人忘了處理錯誤，看三種做法各會發生什麼事。
// 錯誤經過幾層、中間層寫了幾處處理，都由下面每個做法的傳遞規則推出來，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

const CHAIN = ['db', 'stock', 'svc', 'api']; // 錯誤從資料庫往上回到 API
const MIDDLE = ['stock', 'svc'];
const RIGHT_MSG = '下單失敗，請稍後再試';
const WRONG_MSG = '商品已售完';

const NODES = [
  { id: 'api', name: '下單 API', sub: '最上層，回覆使用者', ring: 'app', cell: [1, 1] },
  { id: 'screen', name: '使用者畫面', ring: 'ui', cell: [1, 2] },
  { id: 'svc', name: '下單服務', ring: 'core', cell: [2, 1] },
  { id: 'stock', name: '庫存檢查', ring: 'core', cell: [3, 1] },
  { id: 'db', name: '資料庫', ring: 'infra', cell: [4, 1] },
];
const EDGES = [
  { id: 'c1', from: 'api', to: 'svc', kind: 'dep' },
  { id: 'c2', from: 'svc', to: 'stock', kind: 'dep' },
  { id: 'c3', from: 'stock', to: 'db', kind: 'dep' },
  { id: 'out', from: 'api', to: 'screen', kind: 'net' },
];
const STATS = [
  { id: 'hops', label: '錯誤經過幾層才被處理' },
  { id: 'lines', label: '中間層要寫的錯誤處理' },
  { id: 'msg', label: '使用者看到' },
  { id: 'forgot', label: '有人忘了處理時' },
];
const TOKENS = [{ id: 'q', tone: 'req' }, { id: 'e', tone: 'err' }, { id: 'v', tone: 'data' }];

export const systems = [
  {
    id: 'throw',
    title: '拋出例外',
    short: '例外',
    rule: '出錯就「丟出」例外，程式直接跳到最近的 catch。中間層不用寫任何東西，錯誤自己會往上跑。',
    langs: 'Java、Python、JavaScript、C#',
    code: 'try {\n  placeOrder(item) <i>// 中間層不用管錯誤</i>\n} <b>catch (e)</b> {\n  reply("下單失敗，請稍後再試")\n}',
    // 錯誤怎麼往上走：例外直接跳到有 catch 的那一層
    handles: { api: 'catch' },
    forgotten: 'none', // 中間層本來就不用寫，忘了也一樣往上跑
  },
  {
    id: 'value',
    title: '回傳錯誤值',
    short: '錯誤值',
    rule: '錯誤是普通的回傳值。每一層呼叫完都要自己檢查「有沒有出錯」，有就再往上回傳。',
    langs: 'Go、C',
    code: 'stock, <b>err</b> := db.GetStock(id)\n<b>if err != nil {</b>\n  return 0, err <i>// 每一層都要寫</i>\n}',
    handles: { stock: 'check', svc: 'check', api: 'catch' },
    forgotten: 'silent', // 忘了檢查就拿著空值繼續做
  },
  {
    id: 'result',
    title: 'Result 型別',
    short: 'Result',
    rule: '回傳的是「成功的值或錯誤」二選一的盒子，不拆開處理就拿不到值；用 ? 一個符號就能往上傳。',
    langs: 'Rust；Swift、Kotlin 有類似寫法',
    code: 'fn check(id: u32) -> <b>Result</b>&lt;u32, DbError&gt; {\n  let stock = db.get_stock(id)<b>?</b>; <i>// 出錯就往上傳</i>\n  Ok(stock)\n}',
    handles: { stock: 'check', svc: 'check', api: 'catch' },
    forgotten: 'compile', // 不處理就拿不到值，編譯器直接擋下
  },
];
systems.forEach((sys) => {
  Object.assign(sys, { processLabel: '箭頭 = 誰呼叫誰', cols: 2, rows: 4, nodes: NODES, edges: EDGES, tokens: TOKENS, stats: STATS });
});

const ERR_LABEL = { throw: 'DbTimeout 例外', value: 'err', result: 'Err(逾時)' };
const NOTE = {
  throw: { stock: '（沒寫錯誤處理）', svc: '（沒寫錯誤處理）', api: 'catch (e)' },
  value: { stock: 'if err != nil { return err }', svc: 'if err != nil { return err }', api: 'if err != nil { 回覆失敗 }' },
  result: { stock: 'get_stock(id)?', svc: 'check(id)?', api: 'match … Err(e) => 回覆失敗' },
};

// 錯誤從資料庫出發後，依序會停在哪幾層：有 catch 或 check 的層才會「接到」它
const pathOf = (sys) => CHAIN.slice(1).filter((id) => sys.handles[id]);
const paths = systems.map(pathOf);

const sims = systems.map(makeSim);
export const steps = [];
const push = (id, chapter, duration, caption, beats) => {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: sims.map((sim, i) => view(sim, beats[i])) } });
};
const each = (fn) => systems.map((sys, i) => fn(sys, sims[i], i));
const nameOf = (id) => NODES.find((n) => n.id === id).name;

// ---- 第一段：資料庫出錯 ----
const C1 = '資料庫出錯';
sims.forEach((sim, i) => { sim.notes = { ...NOTE[systems[i].id], screen: '等待中…' }; });
push('down', C1, 4600,
  '使用者按下「下單」。請求一路往下呼叫：下單 API → 下單服務 → 庫存檢查 → 資料庫。三種寫法的呼叫流程完全一樣，差別只在出錯時。',
  each(() => ({ action: '使用者按下「下單」', on: ['c1', 'c2', 'c3'], state: { db: 'active' }, tokens: { q: { at: 'db', label: '查庫存' } }, wires: { in: true, out: false }, verdict: '請求到了資料庫' })));

push('fail', C1, 4600,
  '資料庫逾時沒回應，出錯了。這個錯誤要一路回到下單 API，才能告訴使用者「下單失敗，請稍後再試」。',
  each((sys) => ({ action: '資料庫逾時', state: { db: 'fail' }, tokens: { e: { at: 'db', label: ERR_LABEL[sys.id] } }, verdict: '錯誤發生在最底層' })));

const hopsMax = Math.max(...paths.map((p) => p.length));
const delivered = systems.map(() => false);
for (let k = 0; k <= hopsMax; k += 1) {
  const caps = [
    '拋出例外：錯誤直接跳到下單 API 的 catch，中間的庫存檢查、下單服務一行錯誤處理都沒寫，直接被跳過。回傳錯誤值與 Result：錯誤先回到庫存檢查，它要自己判斷「出錯了」再往上傳。',
    '拋出例外已經回覆使用者。回傳錯誤值：下單服務又寫了一次 if err != nil 往上傳。Result：用 ? 一個符號往上傳，意思一樣，但寫起來短很多，也一眼看得出這裡可能出錯。',
    '回傳錯誤值與 Result 也把錯誤送到了下單 API，由它決定要回覆什麼。錯誤經過的每一層都留下了處理的程式。',
    `三種做法最後都回覆使用者「${RIGHT_MSG}」。差別在中間層要不要為了錯誤寫程式：例外 0 處，另外兩種各 ${MIDDLE.length} 處。`,
  ];
  push(`up-${k}`, C1, k === hopsMax ? 5600 : 5200, caps[k], each((sys, sim, i) => {
    const path = paths[i];
    const state = { db: 'fail' };
    const tokens = {};
    if (k < path.length) {
      const at = path[k];
      // 例外跳過的層：錯誤直接飛過去，它們剩下的程式都不會執行
      CHAIN.slice(1, CHAIN.indexOf(at)).filter((id) => !path.includes(id)).forEach((id) => { state[id] = 'skip'; });
      path.slice(0, k).forEach((id) => { state[id] = 'pass'; });
      state[at] = at === 'api' ? 'caught' : 'check';
      tokens.e = { at, label: ERR_LABEL[sys.id] };
      sim.stats.hops = k + 1;
      sim.stats.lines = `${path.filter((id) => MIDDLE.includes(id)).length} 處`;
      return { action: '錯誤往上傳', state, tokens, on: [], verdict: at === 'api' ? '最上層接住錯誤' : `${nameOf(at)}檢查到錯誤，往上回傳` };
    }
    if (!delivered[i]) {
      delivered[i] = true;
      sim.notes.screen = RIGHT_MSG;
      sim.stats.msg = RIGHT_MSG;
      MIDDLE.forEach((id) => { state[id] = path.includes(id) ? 'pass' : 'skip'; });
      state.api = 'caught';
      state.screen = 'ok';
      return { action: '回覆使用者', state, on: ['out'], tokens: { e: { at: 'screen', label: ERR_LABEL[sys.id] } }, wires: { in: false, out: true }, verdict: `回覆：${RIGHT_MSG}` };
    }
    MIDDLE.forEach((id) => { state[id] = path.includes(id) ? 'pass' : 'skip'; });
    return { action: '回覆使用者', state: { ...state, screen: 'ok' }, wires: { in: false, out: true }, verdict: '早就回覆使用者了' };
  }));
}

// ---- 第二段：有一層忘了處理 ----
const C2 = '忘了處理';
const FORGOT = {
  throw: '（沒寫錯誤處理）',
  value: 'stock, _ := db.GetStock(id)',
  result: 'let stock = db.get_stock(id);',
};
push('forget', C2, 5600,
  '這次寫「庫存檢查」的人忘了處理錯誤。拋出例外：這一層本來就不用寫，沒差。回傳錯誤值：他用 _ 把錯誤丟掉，只拿庫存數字。Result：他直接把盒子當數字用，編譯器馬上報錯：「你還沒處理失敗的情況」。',
  each((sys, sim) => {
    sim.notes = { ...NOTE[sys.id], stock: FORGOT[sys.id], screen: '等待中…' };
    const state = { stock: sys.forgotten === 'none' ? '' : sys.forgotten === 'compile' ? 'reject' : 'forgot' };
    return { action: '庫存檢查忘了處理錯誤', state, wires: { in: true, out: false }, verdict: sys.forgotten === 'compile' ? '編譯不過，這段程式上不了線' : sys.forgotten === 'silent' ? '編譯照樣通過' : '中間層本來就沒寫，不影響' };
  }));

push('fail-2', C2, 4600,
  '上線後資料庫又逾時了。Result 那一份程式因為編譯不過，早在上線前就被修好，照第一段的流程把錯誤傳回去。',
  each((sys) => ({
    action: '資料庫又逾時',
    state: { db: 'fail', stock: sys.forgotten === 'silent' ? 'forgot' : '' },
    // 「庫存 = 0」這個錯的值下一拍才從庫存檢查冒出來，先隱形地停在那裡，出現時才看得到它往上飛
    tokens: { e: { at: 'db', label: ERR_LABEL[sys.id] }, ...(sys.forgotten === 'silent' ? { v: { at: 'stock', label: '庫存 = 0', hidden: true } } : {}) },
    verdict: '錯誤發生在最底層',
  })));

// 忘了檢查的那一層拿到的是「空值」：Go 的整數預設是 0，於是以為庫存是 0
push('wrong', C2, 6000,
  `拋出例外：照樣跳到下單 API 的 catch，回覆「${RIGHT_MSG}」。回傳錯誤值：庫存檢查沒看錯誤，拿到預設的 0 就當成庫存 0，回報「沒庫存」，錯誤從這裡就消失了。Result：修好的程式正常把錯誤往上傳。`,
  each((sys) => {
    if (sys.forgotten === 'silent') {
      return { action: '錯誤被丟掉', state: { db: 'fail', stock: 'wrong' }, tokens: { v: { at: 'svc', label: '庫存 = 0' } }, on: ['c2'], verdict: '庫存檢查回報「沒庫存」，沒有人知道資料庫出錯' };
    }
    const at = sys.id === 'throw' ? 'api' : 'stock';
    return { action: '錯誤往上傳', state: { db: 'fail', [at]: sys.id === 'throw' ? 'caught' : 'check', ...(sys.id === 'throw' ? { stock: 'skip', svc: 'skip' } : {}) }, tokens: { e: { at, label: ERR_LABEL[sys.id] } }, verdict: sys.id === 'throw' ? '最上層照樣接住' : '庫存檢查檢查到錯誤，往上回傳' };
  }));

const FOUND = { none: '照樣往上跑，有接住', silent: '錯誤消失，客訴才發現', compile: '寫程式時就被擋下' };
push('result-2', C2, 6800,
  `使用者看到的訊息：拋出例外「${RIGHT_MSG}」；回傳錯誤值「${WRONG_MSG}」，明明是資料庫出錯，卻告訴使用者沒貨了，而且沒有任何錯誤紀錄；Result 一樣是「${RIGHT_MSG}」。`,
  each((sys, sim) => {
    const wrong = sys.forgotten === 'silent';
    sim.notes.screen = wrong ? WRONG_MSG : RIGHT_MSG;
    sim.stats.forgot = FOUND[sys.forgotten];
    sim.stats.msg = wrong ? `${WRONG_MSG}（錯的）` : RIGHT_MSG;
    return {
      action: '回覆使用者',
      state: wrong ? { db: 'fail', stock: 'wrong', api: 'pass', svc: 'pass', screen: 'misled' } : { db: 'fail', api: 'caught', screen: 'ok' },
      tokens: wrong ? { v: { at: 'screen', label: '沒庫存' } } : { e: { at: 'screen', label: ERR_LABEL[sys.id] } },
      on: ['out'],
      wires: { in: false, out: true },
      verdict: wrong ? `回覆：${WRONG_MSG}（其實是資料庫出錯）` : `回覆：${RIGHT_MSG}`,
    };
  }));

// ---- 對照 ----
const col = (id) => sims.map((sim) => sim.stats[id]);
export const compare = {
  title: '同一個資料庫錯誤，三種往上傳的方式',
  rows: [
    { label: '錯誤經過幾層才被處理', values: col('hops').map((v) => `${v} 層`), highlight: true },
    { label: '中間層要寫的錯誤處理', better: 'low', values: col('lines'), highlight: true },
    { label: '有人忘了處理時', values: col('forgot'), highlight: true },
    { label: '使用者看到', values: col('msg'), highlight: true },
    { label: '讀程式時看得出哪裡會出錯？', values: ['看不出來，要追進每個函式', '看得出來，每個 err 都寫在明處', '看得出來，型別上就寫著可能失敗'] },
    { label: '代價', values: ['錯誤會默默穿過很多層；有人寫了空的 catch 也會把錯誤吞掉', '每層都要重複寫檢查，程式變長；忘了寫編譯器不會提醒', '要多學一套寫法；每個可能失敗的地方都得明確處理'] },
    { label: '常見語言', values: systems.map((sys) => sys.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '三種做法都能把錯誤送回最上層，差別在「忘了處理」時會怎樣：例外會自己往上跑；錯誤值會悄悄消失；Result 在寫程式時就擋下來。不管用哪種語言，原則都一樣：錯誤要嘛處理，要嘛往上傳，不可以默默吞掉。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  down: '使用者按下「下單」，請求一路往下傳到資料庫。三種寫法走的路一樣。',
  fail: '資料庫逾時出錯了。這個錯誤要一路回到最上層，才能告訴使用者。',
  'up-0': '例外直接跳到最上層，中間兩層被跳過；另外兩種要一層一層檢查、往上傳。',
  'up-1': '例外已經回覆使用者；另外兩種又往上傳了一層，Result 只要寫一個 ? 符號。',
  'up-2': '另外兩種也把錯誤送到了最上層。',
  'up-3': `三種最後都回覆「${RIGHT_MSG}」，差別在中間層要不要為錯誤寫程式。`,
  forget: '這次「庫存檢查」忘了處理錯誤。例外不受影響；錯誤值照樣能上線；Result 編譯不過。',
  'fail-2': '上線後資料庫又出錯了。',
  wrong: '錯誤值那一份：庫存檢查沒看到錯誤，把庫存當成 0，錯誤就在這裡消失了。',
  'result-2': `錯誤值那一份告訴使用者「${WRONG_MSG}」，其實是資料庫出錯；另外兩種都回覆正確的訊息。`,
  compare: '錯誤要嘛處理、要嘛往上傳，不能默默吞掉。三種做法的差別在「忘了處理」時誰會提醒你。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
