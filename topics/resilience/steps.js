// 重試與熔斷動畫：1000 個請求打同一個下游服務，下游故障 3.5 秒後恢復。三種呼叫端的處理方式並排：
// 1. 立即重試：失敗就馬上再打一次。
// 2. 指數退避＋隨機延遲（jitter）：每次失敗後等待時間加倍，並在範圍內隨機，讓大家錯開。
// 3. 熔斷器＋退避：連續失敗太多就「斷開」，這段時間直接回失敗、不打下游，定時放少量請求試探。
// 下游超過容量時會壅塞崩潰（那一刻進來的請求全部逾時），這是重試風暴讓服務起不來的原因。
// 所有數字都由下面以 100ms 為一格的模擬算出：誰在哪一格送出、下游每格收到多少、誰成功或放棄。

const SLOT = 100; // ms
const SPAN = 10000;
const N = 1000; // 請求數，在第一秒內平均送出
const OUT_START = 500; // 下游故障
const OUT_END = 4000; // 下游修好
const CAP = 150; // 下游每 100ms 能處理的請求數；超過就壅塞崩潰
const GIVE_UP = 8000; // 一個請求最多嘗試這麼久，之後放棄並回報錯誤
const BASE = 200; // 退避的起始等待
const MAX_WAIT = 3200; // 退避的等待上限
const OPEN_MS = 1000; // 熔斷器斷開多久後試探
const PROBES = 5; // 半開時放行幾個試探請求
const TRIP_MIN = 10; // 一格內至少這麼多個失敗、且失敗率過半才斷開
const SAMPLES = [600, 900]; // 畫在時間軸上的兩個代表性請求（都是故障期間送出的）

export const systems = [
  {
    id: 'naive', title: '立即重試', short: '立即重試',
    rule: '失敗就馬上再打一次，直到成功或逾時放棄。最直覺，也是很多 HTTP 用戶端預設的行為。',
    processLabel: '時間軸：下游狀態與兩個代表性請求',
    code: 'for (;;) {\n  try { return await pay(order) }\n  catch { <b>continue</b> } <i>// 馬上重試</i>\n}',
    policy: 'naive',
  },
  {
    id: 'backoff', title: '指數退避＋jitter', short: '退避',
    rule: '每次失敗後的等待時間加倍（0.2、0.4、0.8…最多 3.2 秒），並在 0 到上限之間隨機挑，讓所有請求錯開時間重試。',
    processLabel: '時間軸：下游狀態與兩個代表性請求',
    code: 'for (let i = 0; ; i++) {\n  try { return await pay(order) }\n  catch { await sleep(<b>random(0, min(3200, 200 * 2 ** i))</b>) }\n}',
    policy: 'backoff',
  },
  {
    id: 'breaker', title: '熔斷器＋退避', short: '熔斷器',
    rule: '呼叫端前面加一個熔斷器：失敗太多就斷開，斷開期間直接回失敗、不打下游；1 秒後放 5 個請求試探，成功才恢復放行。',
    processLabel: '時間軸：下游狀態與兩個代表性請求',
    code: 'if (<b>breaker.isOpen()</b>) throw new Error("快速失敗")\ntry { const r = await pay(order); breaker.success(); return r }\ncatch (e) { <b>breaker.failure()</b>; throw e }\n<i>// 外層同樣用退避重試</i>',
    policy: 'breaker',
  },
];

const STATS = [
  { id: 'hits', label: '故障期間打到下游的請求' },
  { id: 'peak', label: '修好後 100ms 內最多湧入' },
  { id: 'ok', label: '最後成功的請求' },
  { id: 'done', label: '開始成功處理請求' },
];
systems.forEach((s) => { s.stats = STATS; });

// 固定種子的亂數：每次載入結果都一樣，三個面板也用同一串亂數，差異只來自策略
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(policy) {
  const rand = rng(42);
  const slots = SPAN / SLOT;
  const clients = Array.from({ length: N }, (_, i) => ({ first: Math.floor((i * 1000) / N), next: Math.floor((i * 1000) / N), tries: 0, done: null, log: [] }));
  const load = new Array(slots).fill(0); // 每格真正打到下游的請求數
  const state = new Array(slots).fill('ok'); // 下游每格的狀態：ok、down（故障）、over（壅塞崩潰）
  const breaker = []; // 熔斷器每格的狀態：closed、open、half
  let br = { mode: 'closed', until: 0 };
  const waitFor = (c) => (policy === 'naive' ? SLOT : Math.ceil((rand() * Math.min(MAX_WAIT, BASE * 2 ** c.tries)) / SLOT) * SLOT || SLOT);

  for (let s = 0; s < slots; s += 1) {
    const t = s * SLOT;
    if (policy === 'breaker' && br.mode === 'open' && t >= br.until) br = { mode: 'half', until: 0 };
    breaker.push(policy === 'breaker' ? br.mode : null);
    const due = clients.filter((c) => !c.done && c.next >= t && c.next < t + SLOT);
    // 熔斷器斷開時，請求在呼叫端就被擋下（快速失敗），根本不會打到下游；半開時只放少量試探
    let allowed = due;
    if (policy === 'breaker' && br.mode !== 'closed') allowed = br.mode === 'half' ? due.slice(0, PROBES) : [];
    const blocked = due.filter((c) => !allowed.includes(c));
    load[s] = allowed.length;
    const down = t >= OUT_START && t < OUT_END;
    const over = !down && allowed.length > CAP;
    state[s] = down ? 'down' : over ? 'over' : 'ok';
    const success = !down && !over;
    allowed.forEach((c) => {
      c.log.push({ t: c.next, kind: success ? 'ok' : 'err' });
      if (success) c.done = { t: c.next, ok: true };
    });
    blocked.forEach((c) => c.log.push({ t: c.next, kind: 'fast' }));
    // 失敗的請求排下一次嘗試；超過放棄時限就不再試
    [...allowed.filter(() => !success), ...blocked].forEach((c) => {
      const next = c.next + waitFor(c);
      c.tries += 1;
      if (next - c.first > GIVE_UP) c.done = { t: c.next, ok: false };
      else c.next = next;
    });
    if (policy === 'breaker') {
      const failed = success ? 0 : allowed.length;
      if (br.mode === 'half') br = success && allowed.length ? { mode: 'closed', until: 0 } : allowed.length ? { mode: 'open', until: t + SLOT + OPEN_MS } : br;
      else if (br.mode === 'closed' && failed >= TRIP_MIN) br = { mode: 'open', until: t + SLOT + OPEN_MS };
    }
  }
  const sum = (from, to) => load.slice(from / SLOT, to / SLOT).reduce((a, b) => a + b, 0);
  const firstOk = state.findIndex((st, s) => s * SLOT >= OUT_END && st === 'ok' && load[s] > 0);
  return {
    load, state, breaker, clients,
    hits: sum(OUT_START, OUT_END),
    peak: Math.max(...load.slice(OUT_END / SLOT)),
    ok: clients.filter((c) => c.done && c.done.ok).length,
    recovered: firstOk >= 0 ? firstOk * SLOT : null,
  };
}

// 把逐格的狀態合併成時間軸上的橫條
function runs(arr, toBar, prefix) {
  const out = [];
  let start = 0;
  for (let s = 1; s <= arr.length; s += 1) {
    if (s === arr.length || arr[s] !== arr[start]) {
      const bar = toBar(arr[start]);
      if (bar) out.push({ id: `${prefix}${start}`, start: (start * SLOT) / 1000, end: (s * SLOT) / 1000, ...bar });
      start = s;
    }
  }
  return out;
}

function scenario(sys) {
  const sim = simulate(sys.policy);
  const bars = [
    ...runs(sim.state, (st) => ({ ok: { label: '正常', tone: 'ok' }, down: { label: '故障', tone: 'err' }, over: { label: '過載崩潰', tone: 'block' } })[st], 's').map((b) => ({ ...b, lane: 'svc' })),
    // 負載以 500ms 為一段：超過容量標紅、超過一半標黃，看得出流量是一波一波還是平均
    ...runs(Array.from({ length: SPAN / 500 }, (_, k) => {
      const avg = sim.load.slice(k * 5, k * 5 + 5).reduce((a, b) => a + b, 0) / 5;
      return avg > CAP ? 'hi' : avg > CAP / 2 ? 'mid' : avg > 0 ? 'lo' : 'none';
    }).flatMap((v) => [v, v, v, v, v]), (v) => ({ hi: { label: '超過容量', tone: 'err' }, mid: { label: '', tone: 'conn' }, lo: { label: '', tone: 'ok' } })[v], 'l').map((b) => ({ ...b, lane: 'load' })),
  ];
  if (sys.policy === 'breaker') {
    bars.push(...runs(sim.breaker, (m) => ({ closed: { label: '關閉：放行', tone: 'ok' }, open: { label: '斷開', tone: 'err' }, half: { label: '', tone: 'wait' } })[m], 'b').map((b) => ({ ...b, lane: 'br' })));
  }
  const marks = [];
  SAMPLES.forEach((idx, k) => {
    const c = sim.clients[idx];
    const lane = `c${k}`;
    c.log.forEach((e, j) => marks.push({ id: `m${k}-${j}`, lane, t: e.t / 1000, label: '', tone: e.kind === 'ok' ? 'ok' : e.kind === 'fast' ? 'abort' : 'err' }));
    if (c.done) marks.push({ id: `d${k}`, lane, t: c.done.t / 1000, label: c.done.ok ? `第 ${c.log.length} 次成功` : `試了 ${c.log.length} 次，放棄`, tone: c.done.ok ? 'ok' : 'err' });
  });
  return {
    span: SPAN / 1000,
    lanes: [
      { id: 'svc', name: '下游狀態' },
      { id: 'load', name: '下游負載' },
      { id: 'br', name: sys.policy === 'breaker' ? '熔斷器' : '（無熔斷器）' },
      { id: 'c0', name: `請求 #${SAMPLES[0]}` },
      { id: 'c1', name: `請求 #${SAMPLES[1]}` },
    ],
    bars, marks, sim,
  };
}

// ---- 拍成步驟 ----
export const steps = [];
const scs = systems.map(scenario);
const sims = scs.map((sc) => sc.sim);
const stats = systems.map(() => Object.fromEntries(STATS.map((s) => [s.id, null])));
const sec = (ms) => `${Math.round(ms / 100) / 10} 秒`;
const hitsUntil = (sim, t) => sim.load.slice(OUT_START / SLOT, Math.min(t, OUT_END) / SLOT).reduce((a, b) => a + b, 0);
const peakUntil = (sim, t) => Math.max(0, ...sim.load.slice(OUT_END / SLOT, Math.max(OUT_END, t) / SLOT));

const [naive, backoff, breaker] = sims;
const beats = [
  { t: 450, d: 4600, ch: '下游故障', cap: `${N} 個付款請求在第一秒內陸續送出。下游付款服務每 100ms 最多處理 ${CAP} 個，目前一切正常。時間軸上的圓點是兩個代表性請求的每一次嘗試，紅點是失敗。` },
  { t: 1600, d: 5200, ch: '下游故障', cap: `第 ${OUT_START / 1000} 秒下游故障。立即重試的請求每 100ms 就再打一次，下游負載整片紅色；退避的請求等待時間越拉越長；熔斷器發現大量失敗，馬上斷開，之後的請求在呼叫端就直接失敗（灰點），不再打擾下游。` },
  { t: OUT_END - 100, d: 5600, ch: '下游故障', cap: `故障持續到第 ${OUT_END / 1000} 秒。這段時間打到下游的請求：立即重試 ${naive.hits} 個、退避 ${backoff.hits} 個、熔斷器只有 ${breaker.hits} 個。正在故障的服務還被這麼多請求轟炸，會讓它更難修復。` },
  { t: OUT_END + 600, d: 6400, ch: '恢復之後', cap: `第 ${OUT_END / 1000} 秒下游修好了。立即重試的請求全部擠在同一刻重打，100ms 內湧入 ${naive.peak} 個，遠超過容量 ${CAP}，下游一修好就被壓垮，這就是重試風暴。退避的請求被隨機錯開，最多 ${backoff.peak} 個；熔斷器先放 ${PROBES} 個試探，成功才全面放行。` },
  { t: 7000, d: 5200, ch: '恢復之後', cap: '退避與熔斷器的請求陸續成功。立即重試的請求還在一起撞牆，下游始終處在過載崩潰。' },
  { t: SPAN, d: 6600, ch: '恢復之後', cap: `立即重試的請求撐到 ${GIVE_UP / 1000} 秒上限紛紛放棄，負載降下來，下游直到${naive.recovered === null ? '最後都沒' : `第 ${naive.recovered / 1000} 秒才`}恢復，最後只有 ${naive.ok} 個成功。退避與熔斷器都是 ${backoff.ok} 個全部成功；熔斷器要等下一次試探（第 ${breaker.recovered / 1000} 秒）才重新放行，比退避晚一點，這是它保護下游的代價。` },
];
beats.forEach((b, k) => {
  sims.forEach((sim, i) => {
    if (b.t >= OUT_START) stats[i].hits = hitsUntil(sim, b.t);
    if (b.t > OUT_END) stats[i].peak = peakUntil(sim, b.t);
    if (k === beats.length - 1) {
      stats[i].ok = `${sim.ok} / ${N}`;
      stats[i].done = sim.recovered === null ? '10 秒內沒恢復' : `第 ${sec(sim.recovered)}`;
    }
  });
  steps.push({
    id: `b${k}`, chapter: b.ch, duration: b.d, caption: b.cap,
    data: {
      kind: 'run',
      panels: systems.map((sys, i) => {
        const sc = scs[i];
        const st = sc.sim.state[Math.min(sc.sim.state.length - 1, Math.floor(b.t / SLOT))];
        return {
          action: b.t < OUT_START ? `${N} 個付款請求` : b.t < OUT_END ? '下游付款服務故障中' : '下游已修好',
          verdict: st === 'down' ? '下游故障' : st === 'over' ? '下游被重試壓垮' : '下游正常處理',
          wires: { in: k === 0, out: k === beats.length - 1 },
          span: sc.span, unit: '秒', t: b.t / 1000, lanes: sc.lanes, bars: sc.bars, marks: sc.marks,
          stats: { ...stats[i] },
        };
      }),
    },
  });
});

// ---- 對照 ----
const col = (id) => stats.map((s) => s[id]);
export const compare = {
  title: `同樣 ${N} 個請求、同一次下游故障，三種處理方式`,
  rows: [
    { label: '故障期間打到下游的請求', better: 'low', values: col('hits').map((v) => `${v} 個`), highlight: true },
    { label: '修好後 100ms 內最多湧入', better: 'low', values: col('peak').map((v) => `${v} 個`), highlight: true },
    { label: '最後成功的請求', better: 'high', values: col('ok'), highlight: true },
    { label: '開始成功處理請求', values: col('done'), highlight: true },
    { label: '代價', values: ['幾乎沒有實作成本，但會放大故障', '要設定上限與放棄時間；單一請求可能等比較久', '要調整門檻與試探策略；斷開期間連可能成功的請求也直接失敗'] },
    { label: '適合', values: ['只適合極少量、確定是瞬間網路抖動的情況', '所有會重試的地方的基本配備', '呼叫外部或關鍵下游服務，需要保護自己與對方'] },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 6500,
  caption: '重試本身沒有錯，錯在所有人同一時間重試。退避加 jitter 把重試錯開，熔斷器在對方明顯掛掉時乾脆不打，讓它有機會恢復。兩者通常一起用，再加上逾時與重試次數上限。',
  data: { kind: 'compare' },
});
