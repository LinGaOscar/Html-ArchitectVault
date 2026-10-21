// Cloudflare 全貌動畫：同一個蓋在 Cloudflare 上的電商網站，三種常見請求並排同步前進，
// 看一個請求會經過哪些服務：邊緣網路、Workers、KV、D1、R2、Durable Objects、Queues、Containers。
// 1. 看商品頁：讀多寫少，KV 就近讀、邊緣快取幫下一個人省掉整趟。
// 2. 上傳商品圖片：大檔案進 R2，縮圖這種重工作丟進 Queues，交給 Containers 在背景做。
// 3. 下單：庫存交給 Durable Object 一次處理一個人，訂單寫進 D1，寄信丟進佇列。
// 每一跳的耗時是示意值；使用者等多久、經過幾個服務，都由下面每條路徑一跳一跳加總出來，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

const NODES = [
  { id: 'user', name: '使用者', sub: '瀏覽器、App', ring: 'test', cell: [1, 2] },
  { id: 'edge', name: 'Cloudflare 邊緣', sub: 'DNS・防護・CDN 快取', ring: 'infra', cell: [2, 2] },
  { id: 'kv', name: 'KV', sub: '全球鍵值快取', ring: 'core', cell: [3, 1] },
  { id: 'worker', name: 'Workers', sub: '你的程式', ring: 'app', cell: [3, 2] },
  { id: 'queue', name: 'Queues', sub: '背景工作排隊', ring: 'adapter', cell: [3, 3] },
  { id: 'container', name: 'Containers', sub: '完整 Linux 環境', ring: 'app', cell: [3, 4] },
  { id: 'do', name: 'Durable Objects', sub: '一次只服務一人', ring: 'core', cell: [4, 1] },
  { id: 'd1', name: 'D1', sub: 'SQL 資料庫', ring: 'core', cell: [4, 2] },
  { id: 'r2', name: 'R2', sub: '大檔案倉庫', ring: 'core', cell: [4, 3] },
];
const EDGES = [
  { id: 'ue', from: 'user', to: 'edge', kind: 'net' },
  { id: 'ew', from: 'edge', to: 'worker', kind: 'net' },
  { id: 'wk', from: 'worker', to: 'kv', kind: 'dep' },
  { id: 'wd', from: 'worker', to: 'd1', kind: 'dep' },
  { id: 'wr', from: 'worker', to: 'r2', kind: 'dep' },
  { id: 'wo', from: 'worker', to: 'do', kind: 'dep' },
  { id: 'wq', from: 'worker', to: 'queue', kind: 'event' },
  { id: 'qc', from: 'queue', to: 'container', kind: 'event' },
  { id: 'cr', from: 'container', to: 'r2', kind: 'dep' },
];
const NAME = Object.fromEntries(NODES.map((n) => [n.id, n.name]));
const STORES = ['kv', 'd1', 'r2', 'do'];

const STATS = [
  { id: 'wait', label: '使用者等待（示意）' },
  { id: 'path', label: '經過的服務' },
  { id: 'stores', label: '用到的儲存' },
  { id: 'bg', label: '背景工作' },
];

// 每一跳：token 停在哪、亮哪條線、哪個方塊是什麼狀態、這一跳花多久（示意毫秒）；bg 代表使用者已經收到回應，之後在背景做
export const systems = [
  {
    id: 'read', title: '看商品頁', short: '看商品頁',
    rule: '讀多寫少：同一頁一天被看幾萬次，內容很少改。重點是「離使用者近、讀得快」。',
    token: 'GET 商品 42',
    hops: [
      { at: 'user', verdict: '使用者打開商品頁' },
      { at: 'edge', on: ['ue'], ms: 5, state: { edge: 'miss' }, verdict: '最近的 Cloudflare 機房：快取裡還沒有這頁' },
      { at: 'worker', on: ['ew'], ms: 1, verdict: 'Worker 就在同一個機房執行，幾毫秒就啟動' },
      { at: 'kv', on: ['wk'], ms: 5, state: { kv: 'hit' }, note: { kv: '商品 42：名稱、價格' }, verdict: 'KV 在附近就有一份，馬上讀到' },
      { at: 'user', on: ['ew', 'ue'], ms: 5, respond: true, label: '商品頁', state: { edge: 'cached' }, note: { edge: '這頁已快取 60 秒' }, verdict: '回應使用者，順手把這頁存進邊緣快取' },
      { at: 'edge', on: ['ue'], label: '第二個人', state: { edge: 'hit' }, verdict: '第二個人來看：邊緣直接回，連 Worker 都不用跑' },
    ],
  },
  {
    id: 'upload', title: '上傳商品圖片', short: '上傳圖片',
    rule: '大檔案加重工作：原圖要找地方放，還要產生三種尺寸的縮圖。縮圖很花時間，不該讓使用者等。',
    token: '圖片 3 MB',
    hops: [
      { at: 'user', verdict: '賣家上傳一張 3 MB 的商品照' },
      { at: 'edge', on: ['ue'], ms: 5, state: { edge: 'pass' }, verdict: '邊緣先擋掉攻擊與異常流量，再往裡送' },
      { at: 'worker', on: ['ew'], ms: 2, verdict: 'Worker 檢查登入與檔案格式' },
      { at: 'r2', on: ['wr'], ms: 60, state: { r2: 'saved' }, note: { r2: 'photos/42.jpg' }, verdict: '原圖存進 R2，大檔案的倉庫' },
      { at: 'queue', on: ['wq'], ms: 5, label: '縮圖工作', state: { queue: 'queued' }, verdict: '丟一張「產生縮圖」的工作單進佇列' },
      { at: 'user', on: ['ew', 'ue'], ms: 5, respond: true, label: '上傳成功', verdict: '馬上回應「上傳成功」，不等縮圖' },
      { at: 'container', on: ['qc'], bg: true, job: '產生縮圖（Containers）', label: '縮圖工作', state: { container: 'busy' }, note: { container: '執行 ImageMagick' }, verdict: '背景：縮圖程式要用 ImageMagick，在 Container 裡跑' },
      { at: 'r2', on: ['cr'], bg: true, label: '3 張縮圖', state: { r2: 'saved' }, note: { r2: '原圖＋3 種尺寸' }, verdict: '背景：三種尺寸的縮圖存回 R2' },
    ],
  },
  {
    id: 'order', title: '下單', short: '下單',
    rule: '絕對不能出錯：最後幾件商品很多人同時搶，庫存不能扣成負的，訂單要確實存好。',
    token: '下單 1 件',
    hops: [
      { at: 'user', verdict: '買家按下「下單」' },
      { at: 'edge', on: ['ue'], ms: 5, state: { edge: 'pass' }, verdict: '邊緣檢查後往裡送；下單不能快取' },
      { at: 'worker', on: ['ew'], ms: 1, verdict: 'Worker 接手下單流程' },
      { at: 'do', on: ['wo'], ms: 15, state: { do: 'busy' }, note: { do: '庫存 10 → 9' }, verdict: '商品 42 的庫存物件一次只處理一個人，扣掉 1 件' },
      { at: 'd1', on: ['wd'], ms: 20, state: { d1: 'saved' }, note: { d1: '訂單 #1001' }, verdict: '訂單寫進 D1 資料庫，之後可以用 SQL 查' },
      { at: 'queue', on: ['wq'], ms: 5, label: '寄信工作', state: { queue: 'queued' }, verdict: '丟一張「寄確認信」的工作單進佇列' },
      { at: 'user', on: ['ew', 'ue'], ms: 5, respond: true, label: '下單成功', verdict: '回應「下單成功」，不等寄信' },
      { at: 'worker', on: ['wq'], bg: true, job: '寄確認信（Workers）', label: '寄信', state: { worker: 'busy' }, verdict: '背景：另一個 Worker 從佇列取出工作，寄出確認信' },
    ],
  },
];
systems.forEach((sys) => {
  Object.assign(sys, { processLabel: '箭頭 = 請求往哪裡走', cols: 4, rows: 4, nodes: NODES, edges: EDGES, stats: STATS, tokens: [{ id: 'q', tone: 'req' }, { id: 'j', tone: 'event' }] });
});

// 一條路徑走到第 k 跳時的累計結果：使用者等多久、經過哪些服務、用了哪些儲存
function progress(sys, k) {
  const done = sys.hops.slice(0, k + 1);
  const replied = done.findIndex((h) => h.respond);
  const waited = done.slice(0, replied >= 0 ? replied + 1 : done.length).reduce((a, h) => a + (h.ms || 0), 0);
  const visited = [...new Set(done.map((h) => h.at).filter((id) => id !== 'user'))];
  const bgJobs = done.filter((h) => h.job);
  return {
    wait: replied >= 0 ? `${waited} ms` : null,
    path: visited.length ? `${visited.length} 個` : null,
    stores: visited.filter((id) => STORES.includes(id)).map((id) => NAME[id]).join('、') || null,
    bg: bgJobs.length ? bgJobs.map((h) => h.job).join('、') : replied >= 0 ? '無' : null,
  };
}

const sims = systems.map(makeSim);
const BEATS = Math.max(...systems.map((s) => s.hops.length));
export const steps = [];

const CHAPTER = (k) => (k <= 2 ? '進門' : k <= 5 ? '讀寫資料' : '背景工作');
const CAPTIONS = [
  '同一個電商網站，三種請求同時發生：有人在看商品、賣家在上傳圖片、買家在下單。整個網站都蓋在 Cloudflare 上：程式放在 Workers，資料分別放在 KV、D1、R2、Durable Objects。',
  '每個請求先到離使用者最近的 Cloudflare 機房（邊緣）。這裡負責 DNS、擋掉攻擊、快取網頁；看商品頁的請求先查快取，裡面還沒有這一頁。',
  'Workers 就在同一個機房裡執行你的程式。它不是一台一直開著的伺服器，而是請求來了才啟動的輕量程式，幾毫秒就能開始工作。',
  '開始讀寫資料，三種請求各找最適合的儲存：商品資訊從 KV 就近讀出；原圖是大檔案，存進 R2；庫存交給專屬的 Durable Object，它一次只處理一個人，不會扣成負數。',
  '看商品頁已經回應了，還順手把這一頁存進邊緣快取。上傳圖片把「產生縮圖」丟進 Queues 佇列；下單把訂單寫進 D1 資料庫，之後可以用 SQL 查詢與統計。',
  '第二個人來看同一個商品，邊緣快取直接回應，連 Worker 都不用執行。上傳圖片已經回應「上傳成功」，下單也排好了寄信工作。',
  '使用者都已經收到回應，剩下的在背景做：縮圖需要 ImageMagick 這種完整的程式，Workers 跑不了，交給 Containers；下單也回應了「下單成功」。',
  '縮圖存回 R2；另一個 Worker 從佇列取出寄信工作寄出確認信。慢的、可以晚一點做的事丟進佇列，使用者就不用陪著等。',
];
const PLAIN = [
  '同一個網站，三種請求同時發生：看商品、上傳圖片、下單。',
  '每個請求先到最近的 Cloudflare 機房，這裡負責擋攻擊和快取網頁。',
  'Workers 在同一個機房執行你的程式，請求來了才啟動，幾毫秒就好。',
  '各找各的儲存：商品資訊從 KV 讀、原圖存進 R2、庫存交給 Durable Object。',
  '看商品頁已經回應；上傳圖片把縮圖工作排進佇列；訂單寫進 D1 資料庫。',
  '第二個人看同一頁，直接從快取拿。另外兩種也快回應了。',
  '使用者都收到回應了。縮圖需要完整的程式，在背景交給 Containers 做。',
  '縮圖存回 R2，確認信也寄出了。慢的事丟進佇列，使用者不用陪著等。',
];

for (let k = 0; k < BEATS; k += 1) {
  const panels = systems.map((sys, i) => {
    const sim = sims[i];
    sim.stats = progress(sys, Math.min(k, sys.hops.length - 1));
    if (k >= sys.hops.length) {
      return view(sim, { action: sys.title, verdict: '這個請求已經完成', wires: { in: false, out: true } });
    }
    const h = sys.hops[k];
    const prevDone = sys.hops.slice(0, k).some((x) => x.respond);
    const notes = Object.assign({}, ...sys.hops.slice(0, k + 1).map((x) => x.note || {}));
    const state = { ...(h.state || {}) };
    if (!h.state || !h.state[h.at]) state[h.at] = h.at === 'user' ? (h.respond ? 'ok' : 'active') : 'active';
    // 背景工作用另一個顏色的 token：使用者那條請求已經結束了
    const tokens = h.bg ? { j: { at: h.at, label: h.label } } : { q: { at: h.at, label: h.label || sys.token } };
    // 下一跳才出現的背景 token，先隱形地停在出發點，出現時才看得到它從那裡飛出去
    const next = sys.hops[k + 1];
    if (next && next.bg && !h.bg) tokens.j = { at: 'queue', label: next.label, hidden: true };
    return view(sim, {
      action: sys.title,
      state,
      notes,
      on: h.on || [],
      tokens,
      wires: { in: k === 0, out: Boolean(h.respond) || prevDone },
      verdict: h.verdict,
    });
  });
  steps.push({ id: `h${k}`, chapter: CHAPTER(k), duration: k === 0 ? 5600 : 5200, caption: CAPTIONS[k], data: { kind: 'run', panels } });
}

// ---- 對照 ----
const finals = systems.map((sys) => progress(sys, sys.hops.length - 1));
export const compare = {
  title: '同一個網站，三種請求在 Cloudflare 上怎麼走',
  rows: [
    { label: '使用者等待（示意）', better: 'low', values: finals.map((f) => f.wait), highlight: true },
    { label: '經過的服務', values: finals.map((f) => f.path), highlight: true },
    { label: '用到的儲存', values: finals.map((f) => f.stores), highlight: true },
    { label: '背景工作', values: finals.map((f) => f.bg), highlight: true },
    { label: '關鍵', values: ['邊緣快取與 KV：資料離使用者越近越快', 'R2 放大檔案；Queues 讓重工作不擋住使用者；Containers 跑完整程式', 'Durable Objects 一次處理一個人，庫存不會扣錯；D1 存要查詢的資料'] },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: 'Workers 是中心，負責接請求、做決定；資料依特性放在不同地方：常讀少改的放 KV、要查詢的放 D1、大檔案放 R2、需要一次只處理一個人的放 Durable Objects。慢的事丟進 Queues，需要完整環境的交給 Containers。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
steps.forEach((s, k) => {
  s.detail = s.caption;
  s.caption = s.id === 'compare' ? 'Workers 接請求；常讀少改放 KV、要查詢放 D1、大檔案放 R2、要排隊處理放 Durable Objects。' : PLAIN[k];
});
