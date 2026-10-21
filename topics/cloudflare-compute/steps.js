// 程式跑在哪動畫：同一支程式放在三種地方執行，三條時間軸並排同步前進。
// 1. 傳統雲端主機：一台一直開著的伺服器，放在美國東岸；什麼程式都能跑，但離得遠的使用者要等網路。
// 2. Workers：程式在離使用者最近的 Cloudflare 機房執行，請求來了才啟動、幾毫秒就好；但只能跑輕量的程式。
// 3. Containers：完整的 Linux 容器，什麼程式都能跑、閒置會休眠省錢；但從休眠醒來要幾秒。
// 四個情境：三地使用者同時呼叫 API、閒置一整晚後的第一個請求、影片轉檔、一整天的帳單。
// 網路單程、啟動、執行時間都是示意值；每個請求要等多久、每天計費多久，都由下面的設定加總算出，不手寫。

const CITIES = [
  { id: 'tpe', name: '台北' },
  { id: 'lon', name: '倫敦' },
  { id: 'nyc', name: '紐約' },
];
// 單程網路時間（ms）：主機固定在美東；Workers 在每個城市都有；Containers 只在部分機房，挑最近的
const NET = {
  vm: { tpe: 90, lon: 40, nyc: 5 },
  workers: { tpe: 5, lon: 5, nyc: 5 },
  containers: { tpe: 20, lon: 10, nyc: 5 },
};
const API_WORK = 20; // 一次 API 要執行的時間
const START = { vm: 0, workers: 5, containers: 2000 }; // 從「沒在執行」到能處理請求要多久
const VIDEO_WORK = 3000; // 影片轉檔要算多久（需要 ffmpeg）
const BUSY = [9, 23]; // 一天裡有流量的時段（時）
const SLEEP_AFTER = 0.25; // Containers 沒有請求後多久休眠（時）
const REQS = 100000; // 一天的請求數
const CPU_MS = 5; // Workers 每個請求實際用掉的 CPU 時間

export const systems = [
  {
    id: 'vm', title: '傳統雲端主機', short: '雲端主機',
    langs: 'AWS EC2、Google Compute Engine、自己的機房',
    rule: '租一台一直開著的伺服器，放在一個地區（這裡是美國東岸）。什麼程式都能跑；但離得遠的使用者要等網路，沒人用時也照樣計費。',
    processLabel: '時間軸：每個請求在等什麼',
    canVideo: true,
  },
  {
    id: 'workers', title: 'Workers', short: 'Workers',
    langs: 'Cloudflare Workers；類似的有 Vercel Edge Functions、Deno Deploy',
    rule: '程式放在全世界幾百個機房，請求從哪裡來就在哪裡執行，幾毫秒就啟動。只能跑 JavaScript、Python 這類輕量程式，CPU 時間和記憶體都有上限。',
    processLabel: '時間軸：每個請求在等什麼',
    canVideo: false,
  },
  {
    id: 'containers', title: 'Containers', short: 'Containers',
    langs: 'Cloudflare Containers；類似的有 Google Cloud Run、AWS Fargate',
    rule: '把整個 Linux 環境打包成容器，什麼程式都能跑。沒人用一陣子就休眠、不計費；但從休眠醒來要幾秒鐘。',
    processLabel: '時間軸：每個請求在等什麼',
    canVideo: true,
  },
];

const STATS = [
  { id: 'tpe', label: '台北使用者呼叫 API' },
  { id: 'cold', label: '閒置一晚後第一個請求' },
  { id: 'video', label: '影片轉檔' },
  { id: 'bill', label: '一天計費的時間' },
];
systems.forEach((s) => { s.stats = STATS; });

// 一個請求：去程網路 → （需要的話）啟動 → 執行 → 回程網路，回傳橫條與總等待時間
function request(sys, lane, { net, start = 0, work, prefix, at = 0, fail }) {
  const bars = [];
  let t = at;
  const add = (len, tone, label) => {
    if (len <= 0) return;
    bars.push({ id: `${prefix}${lane}-${bars.length}`, lane, start: t, end: t + len, tone, label });
    t += len;
  };
  add(net, 'net', '網路');
  add(start, 'wait', '啟動中');
  if (fail) {
    add(work, 'err', fail);
    return { bars, total: null, end: t };
  }
  add(work, 'work', '執行');
  add(net, 'net', '網路');
  return { bars, total: t - at, end: t };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const SCENES = [
  {
    key: 'api', chapter: '一般請求', span: 250, unit: 'ms',
    action: '台北、倫敦、紐約同時呼叫 API',
    run: (sys) => {
      const rs = CITIES.map((c) => ({ c, ...request(sys, c.id, { net: NET[sys.id][c.id], work: API_WORK, prefix: 'a' }) }));
      return {
        lanes: CITIES.map((c) => ({ id: c.id, name: `${c.name}使用者` })),
        bars: rs.flatMap((r) => r.bars),
        marks: rs.map((r) => ({ id: `a-${r.c.id}`, lane: r.c.id, t: r.end, label: `${r.total}ms`, tone: 'ok' })),
        stat: { tpe: `${rs[0].total} ms` },
        verdictAt: (t) => (t < Math.max(...rs.map((r) => r.end)) ? `${rs.filter((r) => r.end > t).map((r) => r.c.name).join('、')}還在等` : `最慢的是${rs.slice().sort((a, b) => b.total - a.total)[0].c.name}：${Math.max(...rs.map((r) => r.total))}ms`),
      };
    },
    beats: [60, 250],
  },
  {
    key: 'cold', chapter: '閒置之後', span: 2500, unit: 'ms',
    action: '凌晨三點，台北的第一個請求',
    run: (sys) => {
      const r = request(sys, 'tpe', { net: NET[sys.id].tpe, start: START[sys.id], work: API_WORK, prefix: 'c' });
      // 服務本身的狀態：主機一直開著；Workers 請求來了才啟動；Containers 先從休眠醒來，之後保持醒著一段時間
      const arrive = NET[sys.id].tpe;
      const ready = arrive + START[sys.id];
      const svc = sys.id === 'vm'
        ? [{ start: 0, end: 2500, tone: 'conn', label: '一直開著' }]
        : sys.id === 'workers'
          ? [{ start: arrive, end: ready + API_WORK, tone: 'work', label: '啟動＋執行' }]
          : [{ start: 0, end: arrive, tone: 'abort', label: '休眠' }, { start: arrive, end: ready, tone: 'wait', label: '醒來、啟動容器' }, { start: ready, end: 2500, tone: 'conn', label: '醒著' }];
      return {
        lanes: [{ id: 'tpe', name: '台北使用者' }, { id: 'svc', name: '服務狀態' }],
        bars: [...r.bars, ...svc.map((b, j) => ({ id: `c-svc${j}`, lane: 'svc', ...b }))],
        marks: [{ id: 'c-done', lane: 'tpe', t: r.end, label: `${r.total}ms`, tone: r.total > 1000 ? 'err' : 'ok' }],
        stat: { cold: `${r.total} ms` },
        verdictAt: (t) => (t < r.end ? (START[sys.id] > 100 && t > NET[sys.id].tpe ? '容器從休眠醒來中…' : '請求處理中') : `等了 ${r.total}ms`),
      };
    },
    beats: [900, 2500],
  },
  {
    key: 'video', chapter: '影片轉檔', span: 3500, unit: 'ms',
    action: '使用者上傳影片，要用 ffmpeg 轉檔',
    run: (sys) => {
      const r = request(sys, 'tpe', { net: NET[sys.id].tpe, work: sys.canVideo ? VIDEO_WORK : 400, prefix: 'v', fail: sys.canVideo ? null : '跑不了 ffmpeg' });
      return {
        lanes: [{ id: 'tpe', name: '台北使用者' }],
        bars: r.bars,
        marks: [{ id: 'v-done', lane: 'tpe', t: r.end, label: r.total ? `${(r.total / 1000).toFixed(1)} 秒完成` : '做不到', tone: r.total ? 'ok' : 'err' }],
        stat: { video: r.total ? `可以（${(r.total / 1000).toFixed(1)} 秒）` : '做不到' },
        verdictAt: (t) => (t < r.end ? (sys.canVideo ? '轉檔中' : '嘗試執行…') : r.total ? '轉檔完成' : '沒有 ffmpeg，記憶體與 CPU 時間也不夠'),
      };
    },
    beats: [1200, 3500],
  },
  {
    key: 'bill', chapter: '一天的帳單', span: 24, unit: '時',
    action: `流量集中在 ${BUSY[0]} 點到 ${BUSY[1]} 點`,
    run: (sys) => {
      // 計費的時段：主機整天；Workers 只算處理請求的那一點點時間；Containers 醒著的時間（最後一個請求後再撐一下才休眠）
      const billed = sys.id === 'vm' ? [[0, 24]] : sys.id === 'workers' ? [] : [[BUSY[0], BUSY[1] + SLEEP_AFTER]];
      const hours = sys.id === 'workers' ? (REQS * CPU_MS) / 1000 / 3600 : sum(billed.map(([a, b]) => b - a));
      return {
        lanes: [{ id: 'traffic', name: '流量' }, { id: 'bill', name: '計費中' }],
        bars: [
          { id: 'b-t', lane: 'traffic', start: BUSY[0], end: BUSY[1], tone: 'net', label: '有人在用' },
          ...billed.map(([a, b], j) => ({ id: `b-b${j}`, lane: 'bill', start: a, end: b, tone: 'conn', label: '計費中' })),
        ],
        // Workers 只在處理請求的瞬間計費：畫成零星的點，而不是一整段
        marks: sys.id === 'workers' ? Array.from({ length: BUSY[1] - BUSY[0] + 1 }, (_, j) => ({ id: `b-m${j}`, lane: 'bill', t: BUSY[0] + j, label: '', tone: 'job' })) : [],
        stat: { bill: sys.id === 'workers' ? `${Math.round(hours * 100) / 100} 小時` : `${Math.round(hours * 10) / 10} 小時` },
        verdictAt: (t) => (t < 24 ? '一天過去中' : sys.id === 'vm' ? '沒人用的半夜也在計費' : sys.id === 'workers' ? '沒有請求就沒有費用' : '半夜休眠，不計費'),
      };
    },
    beats: [12, 24],
  },
];

const runs = SCENES.map((sc) => systems.map((sys) => sc.run(sys)));
const stats = systems.map(() => Object.fromEntries(STATS.map((s) => [s.id, null])));
export const steps = [];

const CAPTIONS = {
  api: [
    '台北、倫敦、紐約三個使用者同時呼叫同一支 API。程式只要執行 20ms，差別在網路要跑多遠：傳統主機放在美國東岸，台北的請求要飛過半個地球；Workers 就在每個使用者的城市執行。',
    `結果：台北使用者呼叫傳統主機要等 ${runs[0][0].stat.tpe}，Workers 只要 ${runs[0][1].stat.tpe}，Containers 是 ${runs[0][2].stat.tpe}（容器只在部分機房，要到最近的那一個）。真正在執行程式的時間都一樣，差的全是網路距離。`,
  ],
  cold: [
    '凌晨三點，已經好幾個小時沒人用。傳統主機一直開著，隨時可以處理；Workers 不需要預先開著，請求來了幾毫秒就啟動；Containers 已經休眠，要先把整個容器叫醒。',
    `第一個請求：傳統主機 ${runs[1][0].stat.cold}、Workers ${runs[1][1].stat.cold}、Containers ${runs[1][2].stat.cold}。容器醒來後，接下來的請求就跟平常一樣快；這幾秒是「休眠省錢」的代價，叫做冷啟動。`,
  ],
  video: [
    '使用者上傳影片，要用 ffmpeg 轉成手機看得順的格式。這需要一個完整的程式、很多記憶體，算好幾秒。',
    `傳統主機和 Containers 都能跑 ffmpeg，轉檔完成。Workers 沒有完整的作業系統，裝不了 ffmpeg，記憶體和 CPU 時間也有上限，這種工作要交給 Containers（或其他伺服器）。`,
  ],
  bill: [
    `一整天的流量集中在 ${BUSY[0]} 點到 ${BUSY[1]} 點。傳統主機不管有沒有人用都在計費；Workers 只算處理請求那一點點時間；Containers 在有人用的時段醒著，沒人用一陣子就休眠。`,
    `一天下來：傳統主機計費 ${runs[3][0].stat.bill}；Containers ${runs[3][2].stat.bill}；Workers 只算 ${REQS.toLocaleString('en-US')} 個請求各 ${CPU_MS}ms 的執行時間，合計 ${runs[3][1].stat.bill}。流量越不平均，「用多少付多少」越划算；流量整天都很滿時，一直開著的主機反而單純。`,
  ],
};
const PLAIN = {
  api: ['三地的使用者同時呼叫 API。程式只要 20ms，差別在網路要跑多遠。', `台北使用者：傳統主機要 ${runs[0][0].stat.tpe}，Workers 只要 ${runs[0][1].stat.tpe}。差的全是網路距離。`],
  cold: ['凌晨三點，很久沒人用了。Containers 已經休眠，要先醒來。', `第一個請求：Workers ${runs[1][1].stat.cold}，Containers 要 ${runs[1][2].stat.cold}，這叫冷啟動。`],
  video: ['影片要用 ffmpeg 轉檔，需要完整的程式和很多記憶體。', '傳統主機和 Containers 都能轉；Workers 跑不了這種程式。'],
  bill: ['流量集中在白天。誰在半夜也要付錢？', `計費時間：傳統主機 ${runs[3][0].stat.bill}、Containers ${runs[3][2].stat.bill}、Workers 只有 ${runs[3][1].stat.bill}。`],
};

SCENES.forEach((sc, s) => {
  sc.beats.forEach((t, k) => {
    const last = k === sc.beats.length - 1;
    if (last) systems.forEach((sys, i) => Object.assign(stats[i], runs[s][i].stat));
    steps.push({
      id: `${sc.key}${k}`, chapter: sc.chapter, duration: last ? 6400 : 5600,
      caption: CAPTIONS[sc.key][k],
      plain: PLAIN[sc.key][k],
      data: {
        kind: 'run',
        panels: systems.map((sys, i) => {
          const r = runs[s][i];
          return { action: sc.action, verdict: r.verdictAt(t), wires: { in: k === 0, out: last }, span: sc.span, unit: sc.unit, t, lanes: r.lanes, bars: r.bars, marks: r.marks, stats: { ...stats[i] } };
        }),
      },
    });
  });
});

// ---- 對照 ----
export const compare = {
  title: '同一支程式，放在三種地方執行',
  rows: [
    { label: '台北使用者呼叫 API（示意）', better: 'low', values: stats.map((s) => s.tpe), highlight: true },
    { label: '閒置一晚後第一個請求', better: 'low', values: stats.map((s) => s.cold), highlight: true },
    { label: '影片轉檔', values: stats.map((s) => s.video), highlight: true },
    { label: '一天計費的時間（示意）', better: 'low', values: stats.map((s) => s.bill), highlight: true },
    { label: '能跑什麼', values: ['任何程式', 'JavaScript、TypeScript、Python、WebAssembly；有 CPU 時間與記憶體上限', '任何能打包成容器的程式'] },
    { label: '適合', values: ['流量穩定、需要長時間運作或特殊環境的服務', 'API、網頁、轉址、驗證這種輕量又要快的請求', '需要完整環境的重工作：轉檔、縮圖、跑既有的程式'] },
    { label: '常見於', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '不是三選一：實務上常把 Workers 放在最前面接所有請求，輕量的事直接處理；需要完整環境的重工作轉給 Containers；既有的大型服務或資料庫留在傳統主機，Workers 再透過 Hyperdrive 之類的服務連過去。',
  plain: 'Workers 接請求、做輕量的事；重工作交給 Containers；既有的大型服務可以留在傳統主機。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
steps.forEach((s) => {
  s.detail = s.caption;
  s.caption = s.plain;
  delete s.plain;
});
