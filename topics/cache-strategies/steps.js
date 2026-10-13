// Cache 讀寫策略動畫：三種策略吃同一串操作、同步前進，同一拍就能看出各自做了什麼。
// 畫面上的數值（cache、DB、DB 讀寫次數）全部由下面的模擬推導，不手填，caption 才不會跟畫面對不上。
// 起始：DB 存 user:1 = v1，cache 是空的。

export const KEY = 'user:1';

export const strategies = [
  { id: 'aside', name: 'Cache-Aside', rule: 'App 自己管 cache：讀 miss 時回源並回填，寫入時先寫 DB，再讓 cache 失效',
    code: 'read(k):\n  v = cache.get(k)\n  if v == null:      <i>// miss</i>\n    v = db.read(k)\n    cache.set(k, v)\n  return v\nwrite(k, v):\n  <b>db.write(k, v)</b>\n  <b>cache.delete(k)</b>   <i>// invalidate</i>' },
  { id: 'through', name: 'Write-Through', rule: '寫入同時寫 cache 與 DB，兩邊都完成才回應 App',
    code: 'read(k):\n  <i>// miss 時由 cache 層回源</i>\n  return cache.get(k)\nwrite(k, v):\n  <b>cache.set(k, v)</b>\n  <b>db.write(k, v)</b>    <i>// 同步</i>\n  return OK         <i>// 兩邊寫完才回應</i>' },
  { id: 'back', name: 'Write-Back', rule: '又稱 Write-Behind。寫入只寫 cache 並標 dirty，之後再批次寫回 DB',
    code: 'read(k):\n  <i>// miss 時由 cache 層回源</i>\n  return cache.get(k)\nwrite(k, v):\n  <b>cache.set(k, v, dirty)</b>\n  return OK         <i>// 不等 DB</i>\nflush():            <i>// 之後批次執行</i>\n  <b>db.writeAll(cache.dirty())</b>' },
];

const fresh = () => ({ cache: null, dirty: false, db: 'v1', reads: 0, writes: 0 });
const clone = (set) => Object.fromEntries(Object.entries(set).map(([k, s]) => [k, { ...s }]));

const main = { aside: fresh(), through: fresh(), back: fresh() };
export const steps = [];

// 每一拍把三種策略各跑一次 fn：fn 改動該策略的模擬狀態並回傳這一拍要畫的標記，
// 畫面的值一律從模擬狀態抄出來，所以計數必定與操作序列一致
function add(id, chapter, duration, op, caption, fns, S = main) {
  const panels = strategies.map(({ id: k }) => {
    const s = S[k];
    const patch = fns[k](s);
    return {
      cache: s.cache, dirty: s.dirty, db: s.db, reads: s.reads, writes: s.writes,
      req: null, res: null, verdict: '', wires: [], idle: false, crashed: false,
      ...patch,
    };
  });
  steps.push({ id, chapter, duration, caption, data: { kind: 'beat', op, panels } });
}

const all = (fn) => ({ aside: fn, through: fn, back: fn });
// 這一拍輪不到的策略要明講「無動作」，讀者才分得清是沒事做還是畫面壞了
const idle = (note) => () => ({ idle: true, verdict: note ? `無動作（${note}）` : '無動作' });
const req = (label, at) => ({ at, label });
const res = (label) => ({ at: 'app', label });

// ---- 讀取：第一次 miss，第二次 hit ----
add('read1-ask', '讀取', 2400, `讀 ${KEY}`,
  '三個面板收到同一個請求：讀 user:1。App 先問 cache，cache 是空的，三邊都是 cache miss（沒命中）。',
  all(() => ({ req: req('讀', 'cache'), verdict: 'miss：cache 裡沒有 user:1', wires: ['ac'] })));

add('read1-db', '讀取', 3600, `讀 ${KEY}`,
  'miss 就要回源 DB 讀值，DB 讀取次數 0 → 1。Cache-Aside 是 App 自己去查 DB；Write-Through 與 Write-Back 這裡假設由 cache 層負責回源（read-through），所以連線畫在 cache 與 DB 之間。',
  {
    aside: (s) => { s.reads++; return { req: req('讀', 'db'), verdict: 'App 自己去查 DB', wires: ['ad'] }; },
    through: (s) => { s.reads++; return { req: req('讀', 'db'), verdict: 'cache 回源查 DB', wires: ['cd'] }; },
    back: (s) => { s.reads++; return { req: req('讀', 'db'), verdict: 'cache 回源查 DB', wires: ['cd'] }; },
  });

add('read1-fill', '讀取', 3000, `讀 ${KEY}`,
  '拿到 v1 後回填 cache（cache 由空變成 v1），再回應 App。之後同樣的讀取就不用再打 DB。',
  {
    aside: (s) => { s.cache = 'v1'; return { res: res('v1'), verdict: '回填：App 把 v1 存進 cache', wires: ['ac'] }; },
    through: (s) => { s.cache = 'v1'; return { res: res('v1'), verdict: '回填：cache 存下 v1', wires: ['cd', 'ac'] }; },
    back: (s) => { s.cache = 'v1'; return { res: res('v1'), verdict: '回填：cache 存下 v1', wires: ['cd', 'ac'] }; },
  });

add('read2-ask', '讀取', 2200, `讀 ${KEY}`,
  '再讀一次 user:1。cache 已經有 v1，三邊都命中（cache hit）。',
  all(() => ({ req: req('讀', 'cache'), verdict: 'hit：找到 v1', wires: ['ac'] })));

add('read2-reply', '讀取', 3000, `讀 ${KEY}`,
  '命中就直接從 cache 回 v1，DB 讀取次數維持 1。讀取路徑在三種策略下沒有差別，差異出現在寫入。',
  all(() => ({ res: res('v1'), verdict: 'hit：直接回 v1，不碰 DB', wires: ['ac'] })));

// ---- 第一次寫入 v2 ----
add('write1-ask', '寫入', 3200, `寫 ${KEY} = v2`,
  '寫入 user:1 = v2，第一站就不一樣。Cache-Aside 直接去 DB，cache 先不動；Write-Through 與 Write-Back 都先到 cache。',
  {
    aside: () => ({ req: req('寫 v2', 'db'), verdict: 'cache 先不動', wires: ['ad'] }),
    through: () => ({ req: req('寫 v2', 'cache'), verdict: '同步寫：cache 與 DB 都要寫', wires: ['ac'] }),
    back: () => ({ req: req('寫 v2', 'cache'), verdict: '只寫 cache，不碰 DB', wires: ['ac'] }),
  });

add('write1-land', '寫入', 4200, `寫 ${KEY} = v2`,
  'Cache-Aside：DB 變成 v2（寫入 0 → 1），但 cache 還留著舊的 v1，這一刻兩邊不一致。Write-Through：cache 與 DB 同步變成 v2（DB 寫入 0 → 1），還沒回應。Write-Back：只有 cache 變成 v2 並標 dirty，DB 仍是 v1，而且已經回應 App。',
  {
    aside: (s) => { s.db = 'v2'; s.writes++; return { req: req('寫 v2', 'db'), verdict: 'DB 已是 v2，cache 還是舊的 v1', wires: ['ad'] }; },
    through: (s) => { s.cache = 'v2'; s.db = 'v2'; s.writes++; return { req: req('寫 v2', 'db'), verdict: 'cache 與 DB 都寫成 v2', wires: ['ac', 'cd'] }; },
    back: (s) => { s.cache = 'v2'; s.dirty = true; return { res: res('OK'), verdict: '只寫 cache 並標 dirty，立刻回應', wires: ['ac'] }; },
  });

add('write1-done', '寫入', 4000, `寫 ${KEY} = v2`,
  'Cache-Aside 把 cache 裡的 v1 刪除（invalidate，不去更新成 v2），然後回應，下一次讀會重新載入。Write-Through 兩邊都完成才回應 App，所以寫入要等 DB。Write-Back 這一拍無動作，上一拍就已經回應了。',
  {
    aside: (s) => { s.cache = null; return { req: req('失效', 'cache'), res: res('OK'), verdict: '刪除舊值（invalidate）', wires: ['ac'] }; },
    through: () => ({ res: res('OK'), verdict: '兩邊都完成，才回應', wires: ['ac'] }),
    back: idle('上一拍已回應，DB 仍是 v1'),
  });

// ---- 寫後立刻讀 ----
add('readback-ask', '寫後讀', 3200, `讀 ${KEY}`,
  '寫入後立刻讀 user:1。Cache-Aside 的 cache 剛被刪除，所以 miss；Write-Through 命中 v2；Write-Back 也命中 v2（雖然 DB 還是 v1）。',
  {
    aside: () => ({ req: req('讀', 'cache'), verdict: 'miss：剛被 invalidate 掉', wires: ['ac'] }),
    through: () => ({ req: req('讀', 'cache'), verdict: 'hit：找到 v2', wires: ['ac'] }),
    back: () => ({ req: req('讀', 'cache'), verdict: 'hit：找到 v2（dirty）', wires: ['ac'] }),
  });

add('readback-reply', '寫後讀', 4000, `讀 ${KEY}`,
  'Cache-Aside 只好回源讀 DB（DB 讀取 1 → 2），這就是寫後第一次讀多出來的一次 DB 讀取。Write-Through 與 Write-Back 直接從 cache 回 v2，不打 DB。Write-Back 回的 v2 比 DB 的 v1 新，讀者拿到的是最新值。',
  {
    aside: (s) => { s.reads++; return { req: req('讀', 'db'), verdict: '回源查 DB，得到 v2', wires: ['ad'] }; },
    through: () => ({ res: res('v2'), verdict: 'hit：直接回 v2', wires: ['ac'] }),
    back: () => ({ res: res('v2'), verdict: 'hit：回 v2（DB 仍是 v1）', wires: ['ac'] }),
  });

add('readback-fill', '寫後讀', 2600, `讀 ${KEY}`,
  'Cache-Aside 把 v2 回填 cache（空 → v2）並回應。另外兩個面板這一拍無動作。',
  {
    aside: (s) => { s.cache = 'v2'; return { res: res('v2'), verdict: '回填 v2', wires: ['ac'] }; },
    through: idle(),
    back: idle(),
  });

// ---- 連續寫入 v3：Write-Back 的 v2 還沒寫回就被蓋掉 ----
add('write2-ask', '連續寫入', 2200, `寫 ${KEY} = v3`,
  '再寫一次 user:1 = v3，各自走和上次相同的路徑。',
  {
    aside: () => ({ req: req('寫 v3', 'db'), verdict: 'cache 先不動', wires: ['ad'] }),
    through: () => ({ req: req('寫 v3', 'cache'), verdict: '同步寫：cache 與 DB 都要寫', wires: ['ac'] }),
    back: () => ({ req: req('寫 v3', 'cache'), verdict: '只寫 cache，不碰 DB', wires: ['ac'] }),
  });

add('write2-land', '連續寫入', 4000, `寫 ${KEY} = v3`,
  'Cache-Aside 與 Write-Through 每次寫入都打 DB，DB 寫入次數都到 2。Write-Back 的 cache 由 v2 蓋成 v3，v2 還沒寫回 DB 就被取代，永遠不會送到 DB，多次寫入被合併成一次。',
  {
    aside: (s) => { s.db = 'v3'; s.writes++; return { req: req('寫 v3', 'db'), verdict: 'DB 已是 v3，cache 還是舊的 v2', wires: ['ad'] }; },
    through: (s) => { s.cache = 'v3'; s.db = 'v3'; s.writes++; return { req: req('寫 v3', 'db'), verdict: 'cache 與 DB 都寫成 v3', wires: ['ac', 'cd'] }; },
    back: (s) => { s.cache = 'v3'; s.dirty = true; return { res: res('OK'), verdict: '蓋掉尚未寫回的 v2，仍是 dirty', wires: ['ac'] }; },
  });

add('write2-done', '連續寫入', 2800, `寫 ${KEY} = v3`,
  'Cache-Aside 再次 invalidate 並回應；Write-Through 兩邊完成後回應；Write-Back 這一拍無動作。目前 DB 寫入次數：Cache-Aside 2、Write-Through 2、Write-Back 0。',
  {
    aside: (s) => { s.cache = null; return { req: req('失效', 'cache'), res: res('OK'), verdict: '刪除舊值（invalidate）', wires: ['ac'] }; },
    through: () => ({ res: res('OK'), verdict: '兩邊都完成，才回應', wires: ['ac'] }),
    back: idle('上一拍已回應，DB 仍是 v1'),
  });

// 故障假設要用 flush 之前的狀態，所以先留一份
const beforeFlush = clone(main);

// ---- Write-Back 的批次 flush ----
add('flush-find', 'Flush', 3200, '（背景排程）',
  '過了一段時間，Write-Back 的背景程式檢查 cache，找到 dirty 的 user:1，目前值是 v3。Cache-Aside 與 Write-Through 沒有待寫回的資料，這一拍無動作。',
  {
    aside: idle(),
    through: idle(),
    back: () => ({ req: req('flush', 'cache'), verdict: '找到 dirty 項目 v3', wires: ['cd'] }),
  });

add('flush-land', 'Flush', 3800, '（背景排程）',
  '把 v3 寫回 DB：DB 由 v1 直接變成 v3（寫入 0 → 1），dirty 標記清除。v2 與 v3 兩次寫入只花一次 DB 寫入。其他兩個面板無動作。',
  {
    aside: idle(),
    through: idle(),
    back: (s) => { s.db = 'v3'; s.writes++; s.dirty = false; return { req: req('flush', 'db'), verdict: 'DB v1 → v3，dirty 清除', wires: ['cd'] }; },
  });

const counts = Object.fromEntries(strategies.map(({ id }) => [id, { reads: main[id].reads, writes: main[id].writes }]));

// ---- 故障假設：回到 flush 之前，cache 掛掉 ----
const crashSet = beforeFlush;
add('crash-rewind', '故障假設', 3400, '（假設情境）',
  '假設 flush 之前 cache 就故障，所以倒回 flush 之前的狀態。Cache-Aside 與 Write-Through 的 DB 已經是 v3；Write-Back 的 DB 還是 v1，v2 與 v3 只存在 cache 裡。',
  {
    aside: () => ({ verdict: '正常運作' }),
    through: () => ({ verdict: '正常運作' }),
    back: () => ({ verdict: 'dirty：只有 cache 有 v3' }),
  }, crashSet);
steps[steps.length - 1].data.rewind = true;

add('crash-down', '故障假設', 4200, '（假設情境）',
  'cache 故障，記憶體裡的內容消失（以沒有持久化的記憶體型 cache 為例）。Cache-Aside 與 Write-Through 的資料在 DB 裡，沒有損失。Write-Back 的 v2、v3 只存在 cache，DB 仍是 v1，這兩筆寫入遺失。',
  all((s) => { s.cache = null; s.dirty = false; return { crashed: true, verdict: '故障：cache 內容消失' }; }), crashSet);

add('crash-read', '故障假設', 4000, `讀 ${KEY}`,
  'cache 恢復後再讀 user:1，miss 後回源 DB（三邊 DB 讀取各加 1）。Cache-Aside 與 Write-Through 讀到 v3；Write-Back 只能讀到 v1，App 已經收到成功回應的 v3 不見了。',
  {
    aside: (s) => { s.reads++; s.cache = s.db; return { res: res(s.db), verdict: 'miss 後回源，讀到 v3', wires: ['ad', 'ac'] }; },
    through: (s) => { s.reads++; s.cache = s.db; return { res: res(s.db), verdict: 'miss 後回源，讀到 v3', wires: ['cd', 'ac'] }; },
    back: (s) => { s.reads++; s.cache = s.db; return { res: { ...res(s.db), warn: true }, verdict: 'miss 後回源，只讀到 v1：v3 遺失', wires: ['cd', 'ac'], lost: true }; },
  }, crashSet);

// ---- 對照 ----
export const compareRows = [
  { label: '寫入時誰先誰後', aside: '先寫 DB，再讓 cache 失效', through: '同步寫 cache 與 DB，兩邊都完成才回應', back: '只寫 cache 就回應，之後再非同步 flush 到 DB' },
  { label: '寫入延遲', aside: '等一次 DB 寫入', through: '等 DB 寫入，通常最慢', back: '只等 cache，最快' },
  { label: '資料一致性', aside: 'DB 寫完到 cache 失效之間，cache 仍是舊值；失效後下一次讀會重新載入', through: 'cache 與 DB 同步更新，正常情況下一致', back: 'flush 之前 DB 落後 cache，讀 cache 拿到新值，讀 DB 拿到舊值' },
  { label: 'cache 故障會掉資料嗎', aside: '不會，資料已在 DB', through: '不會，DB 已同步寫入', back: '會，尚未 flush 的寫入遺失' },
  { label: '適合場景', aside: '讀多寫少，最常見的預設做法', through: '寫入後要馬上讀到最新值，且不能掉資料，可接受寫入較慢', back: '寫入密集，能接受極少量資料遺失的風險，例如計數器' },
  {
    label: '本例 DB 讀 / 寫次數',
    aside: `讀 ${counts.aside.reads} / 寫 ${counts.aside.writes}`,
    through: `讀 ${counts.through.reads} / 寫 ${counts.through.writes}`,
    back: `讀 ${counts.back.reads} / 寫 ${counts.back.writes}`,
  },
];

steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6000,
  caption: '同一串操作（讀、讀、寫 v2、讀、寫 v3、flush）跑完。三種策略各自用不同的方式交換寫入速度、資料新鮮度與安全性，沒有哪一種在所有情況都最好。',
  data: { kind: 'compare' },
});
