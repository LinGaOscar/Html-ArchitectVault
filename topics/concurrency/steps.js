// 同時處理很多請求動畫：同一台伺服器、同樣的記憶體預算，三種「同時做很多事」的做法並排同步前進。
// 1. Event Loop：只有一個主執行緒，等資料庫時先去處理別人，但計算一次只能做一件。
// 2. 多執行緒：每個請求分到一條執行緒，大家各做各的，執行緒很輕，記憶體預算內可以開很多條。
// 3. 多行程：每個工人是一整份程式，彼此完全隔開，但很佔記憶體，同樣預算只開得出幾個。
// 兩個情境：一般查詢（大多時間在等資料庫）、混進一個要算很久的報表。
// 每個請求每一毫秒在做什麼（排隊、等 CPU、計算、等資料庫）都由下面的模擬算出，不手寫。

const CORES = 4; // CPU 核心數：同一時間最多 4 段計算一起跑
const BUDGET = 100; // 記憶體預算（MB）
const BASE_MB = 30; // 一份程式本身要的記憶體
const THREAD_MB = 1; // 多開一條執行緒大約多要的記憶體

const QUERY = (id, at) => ({ id, name: `查詢 ${id.slice(1)}`, at, segs: [['cpu', 20], ['io', 200], ['cpu', 20]] });

export const systems = [
  {
    id: 'loop',
    title: 'Event Loop（單一主執行緒）',
    short: 'Event Loop',
    rule: '只有一個工人。等資料庫時不乾等，先去處理下一個請求；但計算一次只能做一件。',
    langs: 'Node.js、瀏覽器 JavaScript、Python asyncio',
    processLabel: '時間軸：每個請求在做什麼',
    code: 'app.get("/orders", <b>async</b> (req, res) => {\n  const rows = <b>await</b> db.query(sql) <i>// 等的時候去忙別的</i>\n  res.json(rows)\n})',
    mode: 'loop',
    workers: 1,
  },
  {
    id: 'threads',
    title: '多執行緒',
    short: '多執行緒',
    rule: '每個請求分到一條執行緒，各做各的。執行緒很輕，同樣的記憶體可以開很多條；但大家共用同一份資料。',
    langs: 'Java、C#、Go（goroutine）',
    processLabel: '時間軸：每個請求在做什麼',
    code: '<i>// 伺服器替每個請求開一條執行緒</i>\n@GetMapping("/orders")\nList&lt;Order&gt; orders() {\n  return db.query(sql) <i>// 這條執行緒在這裡等</i>\n}',
    mode: 'thread',
    workers: Math.floor((BUDGET - BASE_MB) / THREAD_MB),
  },
  {
    id: 'procs',
    title: '多行程',
    short: '多行程',
    rule: '每個工人是一整份獨立的程式，互不干擾，一個當掉不影響別人；但很佔記憶體，同樣預算只開得出幾個。',
    langs: 'Python（gunicorn）、PHP-FPM、Ruby（Unicorn）',
    processLabel: '時間軸：每個請求在做什麼',
    code: '<i># 啟動 3 份一樣的程式，輪流接請求</i>\n$ gunicorn app:app <b>--workers 3</b>\ndef orders():\n    return db.query(sql) <i># 整個工人在這裡等</i>',
    mode: 'proc',
    workers: Math.floor(BUDGET / BASE_MB),
  },
];

const STATS = [
  { id: 'workers', label: '同時能接幾個請求' },
  { id: 'mem', label: '記憶體用量' },
  { id: 'slowest', label: '最慢的查詢花了' },
  { id: 'stuck', label: '排隊、被卡住合計' },
];
systems.forEach((s) => { s.stats = STATS; });

// ---- 模擬：每 1ms 一格 ----
// 每個請求是一串「計算」與「等資料庫」交錯的片段。計算要有 CPU（Event Loop 只有一個主執行緒能算），
// 等資料庫不佔 CPU；多執行緒與多行程的請求要先分到一個工人才能開始，多行程的工人在等資料庫時也被佔住。
function simulate(sys, reqs, span) {
  const cpuSlots = sys.mode === 'loop' ? 1 : CORES;
  const rs = reqs.map((r, i) => ({ ...r, i, seg: 0, left: r.segs[0][1], worker: sys.mode === 'loop', readyAt: r.at, log: [], done: null }));
  const queue = [];
  let freeWorkers = sys.mode === 'loop' ? Infinity : sys.workers;
  let peak = 0;
  for (let t = 0; t < span; t += 1) {
    rs.filter((r) => r.at === t && !r.worker).forEach((r) => queue.push(r));
    while (queue.length && freeWorkers > 0) {
      const r = queue.shift();
      r.worker = true;
      r.readyAt = t;
      freeWorkers -= 1;
    }
    peak = Math.max(peak, rs.filter((r) => r.worker && !r.done && r.at <= t).length);
    // 這一格誰拿到 CPU：先準備好的先算
    const wantCpu = rs.filter((r) => r.at <= t && r.worker && !r.done && r.segs[r.seg][0] === 'cpu').sort((a, b) => a.readyAt - b.readyAt || a.i - b.i);
    const running = new Set(wantCpu.slice(0, cpuSlots));
    rs.forEach((r) => {
      if (r.at > t || r.done) { r.log.push(r.done ? 'done' : 'none'); return; }
      if (!r.worker) { r.log.push('queue'); return; }
      const kind = r.segs[r.seg][0];
      if (kind === 'cpu' && !running.has(r)) { r.log.push('wait'); return; }
      r.log.push(kind);
      r.left -= 1;
      if (r.left === 0) {
        r.seg += 1;
        if (r.seg === r.segs.length) {
          r.done = t + 1;
          if (sys.mode !== 'loop') freeWorkers += 1;
        } else {
          r.left = r.segs[r.seg][1];
          r.readyAt = t + 1;
        }
      }
    });
  }
  const mem = sys.mode === 'loop' ? BASE_MB : sys.mode === 'thread' ? BASE_MB + peak * THREAD_MB : BASE_MB * sys.workers;
  return { rs, mem };
}

const TONE = {
  queue: { tone: 'wait', label: '排隊' },
  wait: { tone: 'block', label: '被卡住' },
  cpu: { tone: 'work', label: '計算' },
  io: { tone: 'net', label: '等資料庫' },
};

// 把每格的狀態合併成橫條
function bars(r, prefix) {
  const out = [];
  let start = 0;
  for (let t = 1; t <= r.log.length; t += 1) {
    if (t === r.log.length || r.log[t] !== r.log[start]) {
      const k = r.log[start];
      if (TONE[k]) out.push({ id: `${prefix}${r.id}-${start}`, lane: r.id, start, end: t, ...TONE[k] });
      start = t;
    }
  }
  return out;
}

const SCENES = [
  {
    key: 'q',
    chapter: '一般查詢',
    span: 600,
    reqs: ['q1', 'q2', 'q3', 'q4', 'q5'].map((id, k) => QUERY(id, k * 30)),
    beats: [60, 200, 600],
  },
  {
    key: 'r',
    chapter: '混進一個重計算',
    span: 1000,
    reqs: [{ id: 'rp', name: '報表', at: 0, segs: [['cpu', 600]] }, ...['q1', 'q2', 'q3', 'q4'].map((id, k) => QUERY(id, 50 + k * 50))],
    beats: [200, 620, 1000],
  },
];

const runs = SCENES.map((sc) => systems.map((sys) => simulate(sys, sc.reqs, sc.span)));

function view(sc, sim, sys, t, first, last) {
  const lat = (r) => (r.done && r.done <= t ? r.done - r.at : null);
  const queries = sim.rs.filter((r) => r.id.startsWith('q'));
  const doneLat = queries.map(lat).filter((v) => v !== null);
  const stuck = sim.rs.reduce((a, r) => a + r.log.slice(0, t).filter((k) => k === 'queue' || k === 'wait').length, 0);
  const now = (r) => r.log[Math.min(t, r.log.length) - 1];
  const blocked = sim.rs.filter((r) => ['queue', 'wait'].includes(now(r)));
  return {
    action: sc.key === 'q' ? `${queries.length} 個查詢陸續進來` : '先來一個報表，再來 4 個查詢',
    verdict: blocked.length
      ? `${blocked.map((r) => r.name).join('、')} ${now(blocked[0]) === 'queue' ? '沒有空的工人，排隊中' : '在等主執行緒算完別人的'}`
      : doneLat.length === queries.length ? '全部完成' : '沒有人被卡住',
    wires: { in: first, out: last },
    span: sc.span,
    unit: 'ms',
    t,
    lanes: sim.rs.map((r) => ({ id: r.id, name: r.name })),
    bars: sim.rs.flatMap((r) => bars(r, sc.key)),
    marks: sim.rs.filter((r) => r.done).map((r) => ({ id: `${sc.key}d-${r.id}`, lane: r.id, t: r.done, label: `${r.done - r.at}ms`, tone: 'ok' })),
    stats: {
      workers: sys.mode === 'loop' ? '不限（1 個工人輪流）' : `${sys.workers} 個`,
      mem: `${sim.mem} MB`,
      slowest: doneLat.length ? `${Math.max(...doneLat)} ms` : null,
      stuck: `${stuck} ms`,
    },
  };
}

// ---- 拍成步驟 ----
export const steps = [];
const finals = SCENES.map((sc, s) => runs[s].map((sim, i) => view(sc, sim, systems[i], sc.span, false, true)));
const [qLoop, qThr, qProc] = finals[0];
const [rLoop, rThr, rProc] = finals[1];

const CAPTIONS = {
  q: [
    `五個查詢每隔 30ms 進來一個，每個都是「算 20ms、等資料庫 200ms、再算 20ms」。三種做法用同樣 ${BUDGET} MB 記憶體：Event Loop 只有一個主執行緒；多執行緒開得出 ${systems[1].workers} 條；多行程每份程式要 ${BASE_MB} MB，只開得出 ${systems[2].workers} 個工人。`,
    `Event Loop 在請求等資料庫時就去處理下一個，五個請求一起在等，彼此幾乎不卡。多執行緒每個請求一條執行緒，也一樣。多行程的 ${systems[2].workers} 個工人都在等資料庫，第 4、5 個查詢沒有空的工人，只能排隊。`,
    `最慢的查詢：Event Loop ${qLoop.stats.slowest}、多執行緒 ${qThr.stats.slowest}、多行程 ${qProc.stats.slowest}。記憶體：Event Loop ${qLoop.stats.mem}、多執行緒 ${qThr.stats.mem}、多行程 ${qProc.stats.mem}。大部分時間在「等」的工作，Event Loop 用最少的資源接最多請求。`,
  ],
  r: [
    '換一個情境：先進來一個要連續計算 600ms 的報表（例如產生 PDF、壓縮圖片），之後每 50ms 來一個一般查詢。',
    `Event Loop 唯一的主執行緒被報表佔住，後面的查詢連第一段 20ms 的計算都輪不到，全部卡著等。多執行緒把報表交給一條執行緒，其他執行緒照常處理查詢；多行程也一樣，只是剩下的 ${systems[2].workers - 1} 個工人不夠分，查詢稍微排隊。`,
    `最慢的查詢：Event Loop ${rLoop.stats.slowest}、多執行緒 ${rThr.stats.slowest}、多行程 ${rProc.stats.slowest}。一個算很久的請求，就能讓 Event Loop 上所有人一起變慢，所以重計算要丟給另外的執行緒或背景工作。`,
  ],
};

SCENES.forEach((sc, s) => {
  sc.beats.forEach((t, k) => {
    steps.push({
      id: `${sc.key}${k}`,
      chapter: sc.chapter,
      duration: k === sc.beats.length - 1 ? 6400 : 5200,
      caption: CAPTIONS[sc.key][k],
      data: { kind: 'run', panels: runs[s].map((sim, i) => view(sc, sim, systems[i], t, k === 0, k === sc.beats.length - 1)) },
    });
  });
});

// ---- 對照 ----
export const compare = {
  title: `同樣 ${BUDGET} MB 記憶體，三種同時處理請求的方式`,
  rows: [
    { label: '同時能接幾個請求', values: systems.map((sys) => (sys.mode === 'loop' ? '不限（1 個主執行緒輪流處理）' : `${sys.workers} 個`)) },
    { label: '一般查詢：最慢花了', better: 'low', values: finals[0].map((v) => v.stats.slowest), highlight: true },
    { label: '一般查詢：記憶體', better: 'low', values: finals[0].map((v) => v.stats.mem), highlight: true },
    { label: '有重計算時：最慢的查詢', better: 'low', values: finals[1].map((v) => v.stats.slowest), highlight: true },
    { label: '大家共用同一份資料？', values: ['是，但同一時間只有一段程式在跑，不容易互相干擾', '是，要自己加鎖，否則會互相蓋掉（見 Race Condition）', '否，要共用就得放資料庫或快取'] },
    { label: '一個請求把程式弄當機', values: ['整個伺服器一起倒', '通常整個程式一起倒', '只倒一個工人，其他照常，會自動補一個'] },
    { label: '常見語言', values: systems.map((sys) => sys.langs) },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 7000,
  caption: '三種做法都能「同時處理很多請求」，差別在工人有幾個、多重、共不共用資料。Event Loop 擅長大量等待，怕重計算；多執行緒什麼都能並行，但共用資料要小心；多行程最隔離、最穩，但最吃記憶體。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  q0: `五個查詢陸續進來，每個大部分時間在等資料庫。三種做法用一樣多的記憶體。`,
  q1: `Event Loop 和多執行緒都能讓五個請求一起等；多行程只有 ${systems[2].workers} 個工人，後面兩個要排隊。`,
  q2: `最慢的查詢：Event Loop ${qLoop.stats.slowest}、多行程 ${qProc.stats.slowest}。Event Loop 只用了 ${qLoop.stats.mem}。`,
  r0: '這次先來一個要連續計算 600ms 的報表，再來四個一般查詢。',
  r1: 'Event Loop 唯一的工人被報表佔住，後面的查詢全部卡住；另外兩種由別的工人照常處理查詢。',
  r2: `最慢的查詢：Event Loop ${rLoop.stats.slowest}，多執行緒只要 ${rThr.stats.slowest}。一個重計算拖慢了所有人。`,
  compare: 'Event Loop 擅長大量等待、怕重計算；多執行緒什麼都能並行，但共用資料要小心；多行程最穩，但最吃記憶體。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
