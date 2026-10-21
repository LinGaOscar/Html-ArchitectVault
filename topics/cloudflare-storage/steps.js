// 資料放哪動畫：同一個電商網站的五件事，分別交給 Cloudflare 的四種儲存，四個面板同步前進。
// 1. KV：全球都有副本，讀得最快；但改了要一段時間各地才看到，也不能查詢。
// 2. D1：SQL 資料庫，能查詢、資料一致；寫入集中在一個主資料庫，離得遠就慢一點。
// 3. R2：大檔案倉庫，什麼大小都放得下；但只能用檔名存取，不能查詢、也不適合當計數器。
// 4. Durable Objects：每個物件全世界只有一個、一次處理一個請求，最適合「很多人同時改同一份資料」。
// 讀取延遲是示意值（依網路距離加總）；改完能不能馬上讀到、搶購賣出幾件，都由下面的小模擬算出，不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

const ONE_WAY = { tpe: 90, lon: 40 }; // 台北、倫敦到美東（儲存所在地）的單程網路時間
const LOCAL = 2; // 到同一個機房裡的 KV 副本
const KV_PROPAGATE = 60; // KV 寫入後，各地副本最慢多久會更新（秒）
const PRICE_OLD = 500;
const PRICE_NEW = 450;
const STOCK = 10;
const BUYERS = 50;
const BUYER_GAP = 20; // 搶購時每 20ms 來一個人

const STATS = [
  { id: 'read', label: '台北讀商品（示意）' },
  { id: 'fresh', label: '倫敦改價後台北馬上讀' },
  { id: 'query', label: '找出便宜又熱賣的商品' },
  { id: 'big', label: '存 2 GB 的影片' },
  { id: 'rush', label: `${BUYERS} 人搶最後 ${STOCK} 件` },
];

const W = (id, name, cell) => ({ id, name, sub: 'Worker', ring: 'app', cell });
const BASE_NODES = [W('tpe', '台北', [1, 1]), W('lon', '倫敦', [1, 3])];

export const systems = [
  {
    id: 'kv', title: 'KV', short: 'KV',
    langs: '設定、商品資訊、翻譯文字、登入狀態',
    rule: '用名字（key）存一份資料，全世界每個機房都有副本，讀得最快。改了之後要一段時間各地才更新，也不能查詢。',
    nodes: [...BASE_NODES,
      { id: 'tpeCopy', name: '台北的副本', ring: 'adapter', cell: [2, 1] },
      { id: 'lonCopy', name: '倫敦的副本', ring: 'adapter', cell: [2, 3] },
      { id: 'store', name: 'KV 中央儲存', ring: 'core', cell: [3, 2] }],
    edges: [
      { id: 'tR', from: 'tpe', to: 'tpeCopy', kind: 'dep' },
      { id: 'lR', from: 'lon', to: 'lonCopy', kind: 'dep' },
      { id: 'lW', from: 'lonCopy', to: 'store', kind: 'dep' },
      { id: 'sT', from: 'store', to: 'tpeCopy', kind: 'event' },
      { id: 'sL', from: 'store', to: 'lonCopy', kind: 'event' },
    ],
  },
  {
    id: 'd1', title: 'D1', short: 'D1',
    langs: '訂單、會員、商品目錄、任何要查詢的資料',
    rule: 'SQLite 為基礎的 SQL 資料庫：能篩選、排序、統計，資料一致。寫入集中在一個主資料庫，離得遠就多等一點網路。',
    nodes: [...BASE_NODES, { id: 'store', name: 'D1 資料庫', sub: '主資料庫在美東', ring: 'core', cell: [3, 2] }],
  },
  {
    id: 'r2', title: 'R2', short: 'R2',
    langs: '圖片、影片、備份、使用者上傳的檔案',
    rule: '大檔案倉庫，跟 Amazon S3 用法相容，下載不收流量費。用檔名存取整個檔案，不能查詢內容。',
    nodes: [...BASE_NODES, { id: 'store', name: 'R2 儲存桶', sub: '放在美東', ring: 'core', cell: [3, 2] }],
  },
  {
    id: 'do', title: 'Durable Objects', short: 'DO',
    langs: '庫存、聊天室、多人協作、計數器、遊戲房間',
    rule: '每個物件全世界只有一個，找它的請求排隊、一次處理一個，還自帶儲存。很多人同時改同一份資料也不會亂。',
    nodes: [...BASE_NODES, { id: 'store', name: 'Durable Object', sub: '商品 42・在美東', ring: 'core', cell: [3, 2] }],
  },
];
systems.forEach((sys) => {
  if (!sys.edges) sys.edges = [{ id: 'tR', from: 'tpe', to: 'store', kind: 'dep' }, { id: 'lR', from: 'lon', to: 'store', kind: 'dep' }];
  Object.assign(sys, {
    processLabel: '箭頭 = 讀寫資料的路徑',
    langsLabel: '適合放',
    cols: 3, rows: 3,
    tokens: [{ id: 'q', tone: 'req' }, { id: 'a', tone: 'data' }],
    stats: STATS,
  });
});

// ---- 各種儲存在五件事上的行為 ----
const isKV = (sys) => sys.id === 'kv';
const readMs = (sys, city) => (isKV(sys) ? LOCAL * 2 + 1 : ONE_WAY[city] * 2 + (sys.id === 'r2' ? 10 : 1));

// 搶購：大家同時「讀庫存 → 還有就賣 → 寫回少一件」。
// KV 各地讀到的是快取的副本，在副本更新前都以為還有貨；R2 沒有「一步扣一件」的做法，讀改寫之間會被別人插隊；
// D1 用一行 UPDATE … WHERE 庫存 > 0 在資料庫裡一步完成；Durable Object 一次只處理一個人。
function rush(sys) {
  const buyers = Array.from({ length: BUYERS }, (_, i) => ({ at: i * BUYER_GAP, city: i % 2 ? 'lon' : 'tpe' }));
  if (sys.id === 'd1' || sys.id === 'do') return { sold: Math.min(BUYERS, STOCK) };
  if (isKV(sys)) {
    // 副本在搶購這一秒內都還是舊的庫存數字，每個人讀到的都是 STOCK
    const sold = buyers.filter(() => STOCK > 0).length;
    return { sold };
  }
  // R2：讀在抵達時發生，寫在讀完再一趟網路後才落地
  let value = STOCK;
  const events = buyers.flatMap((b, i) => [
    { t: b.at + ONE_WAY[b.city], kind: 'read', i },
    { t: b.at + ONE_WAY[b.city] * 3, kind: 'write', i },
  ]).sort((x, y) => x.t - y.t || (x.kind === 'write' ? -1 : 1));
  const seen = {};
  let sold = 0;
  events.forEach((e) => {
    if (e.kind === 'read') seen[e.i] = value;
    else if (seen[e.i] > 0) { value = seen[e.i] - 1; sold += 1; }
  });
  return { sold };
}

const BEHAVIOR = {
  kv: {
    fresh: { ok: false, text: `舊價格（最多約 ${KV_PROPAGATE} 秒才更新）` },
    query: { ok: false, text: '做不到：只能用名字拿，要全部讀出來自己篩' },
    big: { ok: false, text: '做不到：一筆最多 25 MB' },
  },
  d1: {
    fresh: { ok: true, text: '新價格' },
    query: { ok: true, text: '一行 SQL 就查到' },
    big: { ok: false, text: '做不到：一列最多約 2 MB' },
  },
  r2: {
    fresh: { ok: true, text: '新價格' },
    query: { ok: false, text: '做不到：只能用檔名拿整個檔案' },
    big: { ok: true, text: '可以，大檔案就該放這裡' },
  },
  do: {
    fresh: { ok: true, text: '新價格' },
    query: { ok: true, text: '可以，但只限這個物件自己的資料' },
    big: { ok: false, text: '做不到：不是放大檔案的地方' },
  },
};
const rushes = systems.map(rush);

const sims = systems.map(makeSim);
export const steps = [];
const statNow = systems.map(() => ({}));

// 一件事拆兩拍：先送出請求（token 飛到儲存），再看結果（答案飛回來、方塊標上狀態）
function op(key, chapter, caps, plains, specA, specB) {
  [specA, specB].forEach((spec, k) => {
    const panels = systems.map((sys, i) => {
      const s = spec(sys, i);
      if (k === 1 && s.stat !== undefined) statNow[i][key] = s.stat;
      sims[i].stats = { ...statNow[i] };
      sims[i].notes = s.notes || {};
      return view(sims[i], { action: s.action, state: s.state, on: s.on, tokens: s.tokens, wires: { in: k === 0, out: k === 1 }, verdict: s.verdict });
    });
    steps.push({ id: `${key}${k}`, chapter, duration: k === 0 ? 5200 : 6400, caption: caps[k], plain: plains[k], data: { kind: 'run', panels } });
  });
}
const routeTo = (sys, city) => (isKV(sys) ? [city === 'tpe' ? 'tR' : 'lR'] : [city === 'tpe' ? 'tR' : 'lR']);
const hit = (sys, city) => (isKV(sys) ? `${city}Copy` : 'store');

// ---- 1. 讀商品 ----
op('read', '讀取',
  ['台北的使用者打開商品頁，Worker 要讀商品 42 的名稱與價格。四種儲存都放了同一份資料，差別在資料離台北多遠。',
    `KV 在台北機房就有副本，${readMs(systems[0], 'tpe')}ms 就讀到；D1、R2、Durable Object 的資料放在美東，要等網路來回，大約 ${readMs(systems[1], 'tpe')}～${readMs(systems[2], 'tpe')}ms。讀很多次、很少改的資料，放 KV 最划算。`],
  ['台北的使用者要讀商品資訊。四種儲存都有同一份資料。', `KV 在台北就有副本，${readMs(systems[0], 'tpe')}ms 讀到；其他三種要到美東，約 ${readMs(systems[1], 'tpe')}ms。`],
  (sys) => ({ action: '台北讀商品 42', state: { [hit(sys, 'tpe')]: 'active' }, on: routeTo(sys, 'tpe'), tokens: { q: { at: hit(sys, 'tpe'), label: '讀商品 42' }, a: { at: hit(sys, 'tpe'), label: `NT$${PRICE_OLD}`, hidden: true } }, verdict: isKV(sys) ? '就近讀台北的副本' : '跨海讀美東的資料' }),
  (sys) => ({ action: '台北讀商品 42', state: { [hit(sys, 'tpe')]: 'ok' }, tokens: { a: { at: 'tpe', label: `NT$${PRICE_OLD}` } }, verdict: `${readMs(sys, 'tpe')}ms 讀到`, stat: `${readMs(sys, 'tpe')} ms` }));

// ---- 2. 改完馬上讀 ----
op('fresh', '改完馬上讀',
  [`倫敦的管理員把價格從 NT$${PRICE_OLD} 改成 NT$${PRICE_NEW}。KV 的寫入先進中央儲存，再慢慢同步到各地的副本；另外三種只有一份資料，改了就是改了。`,
    `緊接著台北的使用者重新整理。KV：台北的副本還沒更新，讀到舊價格 NT$${PRICE_OLD}，最多要等約 ${KV_PROPAGATE} 秒。D1、R2、Durable Object 都讀到新價格 NT$${PRICE_NEW}。`],
  [`倫敦把價格從 ${PRICE_OLD} 改成 ${PRICE_NEW}。`, `台北馬上讀：KV 的副本還是舊價格 ${PRICE_OLD}；其他三種都讀到新價格。`],
  (sys) => ({ action: `倫敦改價 ${PRICE_OLD} → ${PRICE_NEW}`, state: { store: 'active' }, on: isKV(sys) ? ['lR', 'lW', 'sL'] : ['lR'], tokens: { q: { at: 'store', label: `價格 → ${PRICE_NEW}` } }, notes: { store: `NT$${PRICE_NEW}`, ...(isKV(sys) ? { tpeCopy: `NT$${PRICE_OLD}`, lonCopy: `NT$${PRICE_NEW}` } : {}) }, verdict: isKV(sys) ? '寫進中央儲存，各地副本還沒更新' : '唯一的一份資料已經改好' }),
  (sys) => {
    const b = BEHAVIOR[sys.id].fresh;
    const at = hit(sys, 'tpe');
    return { action: '台北馬上重新整理', state: { [at]: b.ok ? 'ok' : 'stale' }, on: routeTo(sys, 'tpe'), tokens: { a: { at: 'tpe', label: `NT$${b.ok ? PRICE_NEW : PRICE_OLD}` } }, notes: { store: `NT$${PRICE_NEW}`, ...(isKV(sys) ? { tpeCopy: `NT$${PRICE_OLD}`, lonCopy: `NT$${PRICE_NEW}` } : {}) }, verdict: b.text, stat: b.ok ? '新價格' : '舊價格' };
  });

// ---- 3. 查詢 ----
const SQL = 'SELECT * FROM 商品 WHERE 價格 < 500 ORDER BY 銷量 DESC';
op('query', '查詢',
  [`想列出「價格低於 500 元、依銷量排序」的商品。這需要在一大堆資料裡篩選、排序，也就是資料庫的查詢功能：${SQL}`,
    'D1 一行 SQL 就查到。Durable Object 自帶的資料庫也能查，但只限這個物件自己的資料，不能跨所有商品。KV 和 R2 只能用名字拿一筆，要查就得把全部讀出來，自己在程式裡篩。'],
  ['想找出「便宜又熱賣」的商品：要篩選、排序。', 'D1 一行 SQL 就查到；KV 和 R2 只能用名字拿一筆，做不到。'],
  (sys) => ({ action: '找出便宜又熱賣的商品', state: { [hit(sys, 'tpe')]: 'active' }, on: routeTo(sys, 'tpe'), tokens: { q: { at: hit(sys, 'tpe'), label: '查詢' } }, verdict: '送出查詢' }),
  (sys) => {
    const b = BEHAVIOR[sys.id].query;
    return { action: '找出便宜又熱賣的商品', state: { [hit(sys, 'tpe')]: b.ok ? 'ok' : 'no' }, tokens: b.ok ? { a: { at: 'tpe', label: sys.id === 'd1' ? '12 筆結果' : '只有自己的資料' } } : {}, verdict: b.text, stat: b.ok ? (sys.id === 'd1' ? '一行 SQL' : '只限這個物件') : '做不到' };
  });

// ---- 4. 大檔案 ----
op('big', '大檔案',
  ['賣家上傳一支 2 GB 的商品介紹影片，要找地方存。',
    'R2 就是為大檔案設計的倉庫，影片、圖片、備份都放這裡，下載也不收流量費。KV 一筆最多 25 MB，D1 一列最多約 2 MB，Durable Object 也不是放大檔案的地方。'],
  ['賣家上傳一支 2 GB 的影片。', '只有 R2 放得下；其他三種都有單筆大小上限。'],
  (sys) => ({ action: '存一支 2 GB 的影片', state: { store: 'active' }, on: isKV(sys) ? ['tR', 'sT'] : ['tR'], tokens: { q: { at: 'store', label: '影片 2 GB' } }, verdict: '上傳中' }),
  (sys) => {
    const b = BEHAVIOR[sys.id].big;
    return { action: '存一支 2 GB 的影片', state: { store: b.ok ? 'ok' : 'no' }, tokens: b.ok ? { q: { at: 'store', label: '影片 2 GB' } } : {}, verdict: b.text, stat: b.ok ? '可以' : '做不到' };
  });

// ---- 5. 搶購 ----
const soldText = (r) => `賣出 ${r.sold} 件${r.sold > STOCK ? `（超賣 ${r.sold - STOCK}）` : ''}`;
op('rush', '搶購',
  [`最後 ${STOCK} 件商品開賣，台北和倫敦共 ${BUYERS} 個人在一秒內一起按下購買。每個人都要「讀庫存 → 還有就賣 → 庫存減一」。`,
    `D1 用一行 UPDATE … WHERE 庫存 > 0 讓資料庫一步扣完，Durable Object 一次只處理一個人，都剛好賣出 ${STOCK} 件。KV 各地讀到的都是還沒更新的副本，每個人都以為還有貨：${soldText(rushes[0])}。R2 讀和寫之間被別人插隊（見 Race Condition）：${soldText(rushes[2])}。`],
  [`最後 ${STOCK} 件，${BUYERS} 個人同時搶購。`, `D1 和 Durable Object 剛好賣 ${STOCK} 件；KV ${soldText(rushes[0])}，R2 ${soldText(rushes[2])}。`],
  (sys) => ({ action: `${BUYERS} 人搶最後 ${STOCK} 件`, state: isKV(sys) ? { tpeCopy: 'active', lonCopy: 'active' } : { store: 'active' }, on: isKV(sys) ? ['tR', 'lR'] : ['tR', 'lR'], tokens: { q: { at: hit(sys, 'tpe'), label: `${BUYERS} 人搶購` } }, notes: { store: `庫存 ${STOCK}` }, verdict: sys.id === 'do' ? '大家排隊，一次處理一個' : '大家同時讀庫存' }),
  (sys, i) => {
    const r = rushes[i];
    const over = r.sold > STOCK;
    return { action: `${BUYERS} 人搶最後 ${STOCK} 件`, state: isKV(sys) ? { tpeCopy: over ? 'oversold' : 'ok', lonCopy: over ? 'oversold' : 'ok' } : { store: over ? 'oversold' : 'ok' }, tokens: { a: { at: 'tpe', label: `賣出 ${r.sold}` } }, notes: { store: `庫存 ${over ? 0 : STOCK - r.sold}` }, verdict: over ? `${soldText(r)}：多賣的要一一退款` : `剛好賣出 ${STOCK} 件`, stat: soldText(r) };
  });

// ---- 對照 ----
const col = (id) => statNow.map((s) => s[id]);
export const compare = {
  title: '同一個網站的五件事，交給四種儲存',
  rows: [
    { label: '台北讀商品（示意）', better: 'low', values: col('read'), highlight: true },
    { label: '倫敦改價後台北馬上讀', values: col('fresh'), highlight: true },
    { label: '找出便宜又熱賣的商品', values: col('query'), highlight: true },
    { label: '存 2 GB 的影片', values: col('big'), highlight: true },
    { label: `${BUYERS} 人搶最後 ${STOCK} 件`, values: col('rush'), highlight: true },
    { label: '最擅長', values: ['全世界都要讀、很少改的資料', '要查詢、要一致的結構化資料', '大檔案', '很多人同時改同一份資料、即時連線'] },
    { label: '適合放', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '沒有一種儲存什麼都最好，實際的系統通常一起用：商品資訊放 KV 讓全世界讀得快，訂單和會員放 D1 方便查詢，圖片影片放 R2，庫存和聊天室這種要排隊處理的交給 Durable Objects。',
  plain: '常讀少改放 KV、要查詢放 D1、大檔案放 R2、很多人同時改的放 Durable Objects。通常一起用。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
steps.forEach((s) => {
  s.detail = s.caption;
  s.caption = s.plain;
  delete s.plain;
});
