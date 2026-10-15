// Race Condition 動畫：兩個工人（執行緒、請求都一樣）同時替同一個按讚數 +1，各做三次。三種寫法並排同步前進：
// 1. 不加鎖：「讀出來、加一、寫回去」三步之間會被對方插隊，兩人讀到同一個舊值，其中一次就白做了。
// 2. 加鎖：改之前先拿鎖，同一時間只有一個人能做這三步，另一個人得等。
// 3. 原子操作：交給硬體或資料庫一步做完「加一」，中間不可能被插隊，也不用等鎖。
// 每一毫秒誰在做什麼、讀到幾、寫回幾、鎖在誰手上，都由下面的模擬算出，不手寫。

const START = 10; // 按讚數一開始是 10
const ROUNDS = 3; // 每個工人各按三次讚
const WORK = 20; // 每次 +1 之前要先處理請求的時間（不碰共用資料）
const STEP = 10; // 讀、加一、寫各要的時間
const B_DELAY = 10; // 第二個工人晚一點點開始，兩人的步調就會錯開、互相插隊
const EXPECT = START + ROUNDS * 2;

export const systems = [
  {
    id: 'none',
    title: '不加鎖',
    short: '不加鎖',
    rule: '直接「讀出來 → 加一 → 寫回去」。兩人可能同時讀到同一個舊值，後寫的人把前一個人的結果蓋掉。',
    processLabel: '時間軸：兩個工人與共用的按讚數',
    langs: '每種語言都會遇到（只要有多個工人同時改）',
    code: 'likes = likes + 1\n<i>// 其實是三步：讀出 likes、加一、寫回</i>',
    mode: 'none',
  },
  {
    id: 'lock',
    title: '加鎖',
    short: '加鎖',
    rule: '改之前先拿到鎖，三步做完才放開。同一時間只有一個人能改，另一個人得在門口等。',
    processLabel: '時間軸：兩個工人與共用的按讚數',
    langs: 'Java 的 synchronized、Go 的 sync.Mutex、Python 的 threading.Lock',
    code: '<b>lock.acquire()</b>\nlikes = likes + 1\n<b>lock.release()</b>',
    mode: 'lock',
  },
  {
    id: 'atomic',
    title: '原子操作',
    short: '原子操作',
    rule: '交給硬體或資料庫「一步做完」加一，中間不可能被插隊，也不用排隊拿鎖。',
    processLabel: '時間軸：兩個工人與共用的按讚數',
    langs: 'Java 的 AtomicInteger、Go 的 sync/atomic、資料庫的 UPDATE … + 1',
    code: '<b>likes.incrementAndGet()</b>  <i>// Java</i>\n<b>atomic.AddInt64(&amp;likes, 1)</b>  <i>// Go</i>\n<i>-- SQL：</i>UPDATE post SET likes = <b>likes + 1</b>',
    mode: 'atomic',
  },
];

const STATS = [
  { id: 'value', label: '按讚數現在是' },
  { id: 'lost', label: '白做（被蓋掉）的次數' },
  { id: 'wait', label: '等待時間合計' },
  { id: 'done', label: '六次全部做完' },
];
systems.forEach((s) => { s.stats = STATS; });

// ---- 模擬：每 1ms 一格 ----
function simulate(mode) {
  const plan = (who) => Array.from({ length: ROUNDS }, () => [
    ['work', WORK],
    ...(mode === 'lock' ? [['acq', 0]] : []),
    ...(mode === 'atomic' ? [['atomic', STEP]] : [['read', STEP], ['calc', STEP], ['write', STEP]]),
    ...(mode === 'lock' ? [['rel', 0]] : []),
  ]).flat().map(([kind, ms]) => ({ kind, ms, who }));
  const ws = ['A', 'B'].map((id, i) => ({ id, ops: plan(id), op: 0, left: null, startAt: i * B_DELAY, local: null, log: [], reads: [], done: null, waitFrom: null }));
  let value = START;
  let holder = null; // 鎖在誰手上
  let busy = null; // 原子操作正在進行的人
  const lockLog = [];
  const writes = []; // { t, who, value, lost }
  let lastWritten = START;
  let lost = 0;
  const head = (w) => w.ops[w.op];
  for (let t = 0; t < 400 && ws.some((w) => !w.done); t += 1) {
    // 先處理拿鎖：鎖空著就拿走，先來等的人先拿
    ws.filter((w) => !w.done && t >= w.startAt && head(w) && head(w).kind === 'acq')
      .sort((x, y) => (x.waitFrom ?? t) - (y.waitFrom ?? t))
      .forEach((w) => {
        if (holder === null) { holder = w.id; w.op += 1; w.waitFrom = null; } else if (w.waitFrom === null) w.waitFrom = t;
      });
    lockLog.push(holder);
    ws.forEach((w) => {
      if (w.done) { w.log.push('done'); return; }
      if (t < w.startAt) { w.log.push('none'); return; }
      const o = head(w);
      if (o.kind === 'acq' || (o.kind === 'atomic' && busy && busy !== w.id)) { w.log.push('wait'); return; }
      if (w.left === null) {
        w.left = o.ms;
        if (o.kind === 'read') { w.local = value; w.reads.push({ t, v: value, who: w.id }); }
        if (o.kind === 'atomic') busy = w.id;
      }
      w.log.push(o.kind);
      w.left -= 1;
      if (w.left > 0) return;
      w.left = null;
      w.op += 1;
      if (o.kind === 'write' || o.kind === 'atomic') {
        value = o.kind === 'write' ? w.local + 1 : value + 1;
        const wasted = value <= lastWritten;
        if (wasted) lost += 1;
        lastWritten = Math.max(lastWritten, value);
        writes.push({ t: t + 1, who: w.id, value, lost: wasted });
        w.local = null;
        if (o.kind === 'atomic') busy = null;
      }
      // 寫完立刻放鎖，下一格等在門口的人就拿得到
      if (head(w) && head(w).kind === 'rel') { holder = null; w.op += 1; }
      if (!head(w)) w.done = t + 1;
    });
  }
  return { ws, writes, lockLog, end: Math.max(...ws.map((w) => w.done)), lost };
}

const sims = systems.map((s) => simulate(s.mode));
const SPAN = Math.ceil((Math.max(...sims.map((s) => s.end)) + 10) / 20) * 20; // 留一點尾巴，最後的值才看得到

const TONE = {
  work: { tone: 'click', label: '處理請求' },
  read: { tone: 'read', label: '讀' },
  calc: { tone: 'job', label: '+1' },
  write: { tone: 'write', label: '寫回' },
  atomic: { tone: 'write', label: '+1' },
  wait: { tone: 'wait', label: '等' },
};

function runs(arr, toBar, prefix, lane) {
  const out = [];
  let start = 0;
  for (let t = 1; t <= arr.length; t += 1) {
    if (t === arr.length || arr[t] !== arr[start]) {
      const bar = toBar(arr[start]);
      if (bar) out.push({ id: `${prefix}${start}`, lane, start, end: t, ...bar });
      start = t;
    }
  }
  return out;
}

function scenario(sys, sim) {
  const valueAt = (t) => sim.writes.filter((w) => w.t <= t).reduce((v, w) => w.value, START);
  const values = Array.from({ length: SPAN }, (_, t) => valueAt(t));
  const bars = [
    ...sim.ws.flatMap((w) => runs(w.log, (k) => TONE[k], `${w.id}`, w.id)),
    ...runs(values, (v) => ({ tone: 'ok', label: String(v) }), 'v', 'val'),
    ...(sys.mode === 'lock' ? runs(sim.lockLog, (h) => (h ? { tone: 'conn', label: `${h} 拿著` } : null), 'k', 'lock') : []),
  ];
  const marks = [
    ...sim.ws.flatMap((w) => w.reads.map((r, j) => ({ id: `r${w.id}${j}`, lane: w.id, t: r.t, label: `讀到 ${r.v}`, tone: 'read' }))),
    ...sim.writes.map((w, j) => ({ id: `w${j}`, lane: 'val', t: w.t, label: w.lost ? `${w.who} 蓋掉` : '', tone: w.lost ? 'err' : 'ok' })),
  ];
  if (sys.mode === 'atomic') {
    sim.writes.forEach((w, j) => marks.push({ id: `a${j}`, lane: w.who, t: w.t, label: `→ ${w.value}`, tone: 'write' }));
  }
  return {
    lanes: [
      { id: 'A', name: '工人 A' },
      { id: 'B', name: '工人 B' },
      { id: 'lock', name: sys.mode === 'lock' ? '鎖' : '（沒有鎖）' },
      { id: 'val', name: '按讚數' },
    ],
    bars, marks, valueAt,
  };
}

const scs = systems.map((s, i) => scenario(s, sims[i]));

function view(i, t, first, last) {
  const sim = sims[i];
  const sc = scs[i];
  const lostSoFar = sim.writes.filter((w) => w.t <= t && w.lost).length;
  const wait = sim.ws.reduce((a, w) => a + w.log.slice(0, t).filter((k) => k === 'wait').length, 0);
  const now = (w) => w.log[Math.min(t, w.log.length) - 1];
  const waiting = sim.ws.filter((w) => now(w) === 'wait');
  const events = [...sim.ws.flatMap((w) => w.reads.map((r) => ({ ...r, kind: 'read' }))), ...sim.writes.map((w) => ({ ...w, kind: 'write' }))]
    .filter((e) => e.t <= t).sort((x, y) => x.t - y.t || (x.kind === 'write' ? -1 : 1)); // 同一刻先寫後讀
  const latest = events[events.length - 1];
  // 兩個人手上拿著同一個還沒寫回的舊值：其中一次 +1 注定會白做
  const holding = sim.ws.filter((w) => {
    const r = w.reads.filter((x) => x.t <= t).slice(-1)[0];
    const wrote = sim.writes.some((x) => x.who === w.id && r && x.t > r.t && x.t <= t);
    return r && !wrote;
  }).map((w) => w.reads.filter((x) => x.t <= t).slice(-1)[0]);
  let verdict = '兩個工人都在處理請求';
  if (t >= SPAN) verdict = lostSoFar ? `應該是 ${EXPECT}，結果只有 ${sc.valueAt(t)}` : `正確：${EXPECT}`;
  else if (holding.length === 2 && holding[0].v === holding[1].v) verdict = `A、B 都讀到 ${holding[0].v}，其中一次 +1 會白做`;
  else if (waiting.length) verdict = `${waiting.map((w) => w.id).join('、')} 在等${systems[i].mode === 'lock' ? '鎖' : '對方做完'}`;
  else if (sim.ws.some((w) => now(w) === 'atomic')) verdict = `${sim.ws.find((w) => now(w) === 'atomic').id} 正在一步做完 +1，沒人能插隊`;
  else if (latest && latest.kind === 'write') verdict = latest.lost ? `${latest.who} 寫回 ${latest.value}，把對方的 +1 蓋掉了` : `${latest.who} 寫回 ${latest.value}`;
  else if (latest) verdict = `${latest.who} 讀到 ${latest.v}，正在 +1`;
  return {
    action: `A、B 各按 ${ROUNDS} 次讚`,
    verdict,
    wires: { in: first, out: last },
    span: SPAN, unit: 'ms', t,
    lanes: sc.lanes, bars: sc.bars, marks: sc.marks,
    stats: {
      value: sc.valueAt(t),
      lost: lostSoFar,
      wait: `${wait} ms`,
      done: t >= sim.end ? `${sim.end} ms` : null,
    },
  };
}

// ---- 拍成步驟 ----
// 關鍵時刻：A 讀到值、B 也讀到同一個值、兩人先後寫回、做完三輪
const [none, lock, atomic] = sims;
const firstRead = (sim, who) => sim.ws.find((w) => w.id === who).reads[0];
const bRead = firstRead(none, 'B');
const secondWrite = none.writes[1];
const BEATS = [
  { t: firstRead(none, 'A').t + 2, ch: '同時按讚', d: 5200,
    cap: `按讚數現在是 ${START}。工人 A、B 各自收到按讚請求，先花 ${WORK}ms 處理，再替按讚數 +1，各做 ${ROUNDS} 次，正確答案是 ${EXPECT}。A 先開始，讀到 ${START}。` },
  { t: bRead.t + 2, ch: '同時按讚', d: 6000,
    cap: `不加鎖：A 還沒寫回，B 也讀到 ${bRead.v}。加鎖：A 拿著鎖，B 只能在門口等。原子操作：A 已經一步做完，B 讀到的是新的值。` },
  { t: secondWrite.t + 2, ch: '同時按讚', d: 6400,
    cap: `不加鎖：A 寫回 ${none.writes[0].value}，B 也寫回 ${secondWrite.value}。兩個人都按了讚，數字卻只加一，B 把 A 的結果蓋掉了。另外兩種都正確變成 ${START + 2}。` },
  { t: SPAN, ch: '做完三輪', d: 7000,
    cap: `做完 ${ROUNDS} 輪：不加鎖最後是 ${none.writes.slice(-1)[0].value}，白做了 ${none.lost} 次；加鎖正確是 ${EXPECT}，但等鎖總共花了 ${lock.ws.reduce((a, w) => a + w.log.filter((k) => k === 'wait').length, 0)}ms；原子操作也是 ${EXPECT}，而且最快做完（${atomic.end}ms）。` },
];

export const steps = BEATS.map((b, k) => ({
  id: `b${k}`, chapter: b.ch, duration: b.d, caption: b.cap,
  data: { kind: 'run', panels: systems.map((_, i) => view(i, b.t, k === 0, k === BEATS.length - 1)) },
}));

// ---- 對照 ----
const finals = systems.map((_, i) => view(i, SPAN, false, true).stats);
export const compare = {
  title: `兩個工人各按 ${ROUNDS} 次讚，三種寫法`,
  rows: [
    { label: '最後的按讚數（應該是 ' + EXPECT + '）', better: 'high', values: finals.map((f) => f.value), highlight: true },
    { label: '白做（被蓋掉）的次數', better: 'low', values: finals.map((f) => `${f.lost} 次`), highlight: true },
    { label: '等待時間合計', better: 'low', values: finals.map((f) => f.wait), highlight: true },
    { label: '全部做完', better: 'low', values: finals.map((f) => f.done), highlight: true },
    { label: '代價', values: ['結果會錯，而且不是每次都錯，很難重現', '大家排隊，鎖拿太久會變慢；兩把鎖互等會卡死', '只能做簡單的動作（加減、比較後交換），複雜的修改還是要鎖或交易'] },
    { label: '適合', values: ['只有一個人會改的資料', '一次要改好幾個值、要保持一致', '計數器、庫存扣減這種單一數字的加減'] },
    { label: '常見寫法', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '「讀出來、改、寫回去」只要分成好幾步，中間就可能被插隊。要嘛用鎖讓大家排隊，要嘛把修改變成一步完成的原子操作；資料在資料庫裡時，就交給資料庫做（UPDATE … SET x = x + 1）。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  b0: `按讚數是 ${START}。兩個工人各要替它 +1 三次，正確答案是 ${EXPECT}。A 先讀到 ${START}。`,
  b1: `不加鎖：A 還沒寫回，B 也讀到 ${bRead.v}。加鎖：B 在門口等。原子操作：A 已經一步做完。`,
  b2: `不加鎖：A、B 都寫回 ${secondWrite.value}。兩個人按讚，只加了一次，B 蓋掉了 A。`,
  b3: `不加鎖最後只有 ${none.writes.slice(-1)[0].value}；加鎖和原子操作都正確是 ${EXPECT}，原子操作還最快。`,
  compare: '分好幾步的修改，中間就可能被插隊。用鎖讓大家排隊，或改成一步完成的原子操作。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
