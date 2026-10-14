// 長時間工作動畫：使用者按「匯出年度報表」，後端要跑 85 秒。三種前後端溝通方式並排，時間軸同步前進。
// 1. 同步等待：一個 HTTP 請求一直等到報表做完。閘道 60 秒逾時，使用者看到錯誤，後端卻還在做。
// 2. 202 + 輪詢：先回「收到了」與工作編號，前端每 10 秒問一次「好了沒」。
// 3. 推播：先回「收到了」，前端開一條 WebSocket / SSE 連線，做完由伺服器主動通知。
// 所有時間點、請求次數、伺服器負擔都由下面的模擬算出，不手寫。

const UNIT = '秒';
const JOB = 85; // 報表要跑多久
const GATEWAY_TIMEOUT = 60; // 閘道（Nginx、API Gateway、負載平衡器）的請求逾時
const POLL_EVERY = 10; // 輪詢間隔
const RETRY_AT = 64; // 同步等待失敗後，使用者以為沒成功又按了一次
const SPAN = 100;
const USERS = 1000; // 同時匯出的人數，用來估伺服器負擔

export const systems = [
  {
    id: 'sync',
    title: '同步等待',
    rule: '一個 HTTP 請求一路等到報表做完才回應。寫起來最簡單，前端只要 await 一次。',
    processLabel: '時間軸：誰在等、誰被佔住',
    code: 'const res = await fetch("/reports", { method: "POST" })\n<i>// 等 85 秒……</i>\ndownload(await res.blob())',
  },
  {
    id: 'poll',
    title: '202 + 輪詢',
    short: '輪詢',
    rule: '伺服器立刻回 202 Accepted 與工作編號，背景慢慢做；前端每隔一段時間問一次「好了沒」。',
    processLabel: '時間軸：誰在等、誰被佔住',
    code: 'const { jobId } = await post("/reports") <i>// 202</i>\nwhile (true) {\n  await sleep(10_000)\n  const job = await get(`/jobs/${jobId}`)\n  if (job.done) <b>return download(job.url)</b>\n}',
  },
  {
    id: 'push',
    title: '推播（WebSocket / SSE）',
    short: '推播',
    rule: '伺服器同樣先回 202；前端保持一條長連線，報表做完由伺服器主動推一則「完成」通知。',
    processLabel: '時間軸：誰在等、誰被佔住',
    code: 'const { jobId } = await post("/reports") <i>// 202</i>\nconst es = new EventSource(`/jobs/${jobId}/events`)\nes.onmessage = (e) => {\n  if (e.data === "done") <b>download(…)</b>\n}',
  },
];

const STATS = [
  { id: 'reqs', label: '發出的 HTTP 請求' },
  { id: 'known', label: '使用者拿到報表' },
  { id: 'wasted', label: '白做的後端工作' },
  { id: 'load', label: `${USERS} 人同時匯出的伺服器負擔` },
];
systems.forEach((s) => { s.stats = STATS; });

const LANES = [
  { id: 'browser', name: '瀏覽器' },
  { id: 'api', name: 'API / 閘道' },
  { id: 'worker', name: '背景工作' },
];

// ---- 模擬：每種做法在時間軸上發生的事 ----
function syncSim() {
  const bars = [
    { id: 'wait1', lane: 'browser', start: 0, end: GATEWAY_TIMEOUT, label: '等待回應…', tone: 'net' },
    { id: 'conn1', lane: 'api', start: 0, end: GATEWAY_TIMEOUT, label: '連線一直佔著', tone: 'conn' },
    { id: 'job1', lane: 'worker', start: 0, end: JOB, label: '產生報表', tone: 'job' },
    { id: 'wait2', lane: 'browser', start: RETRY_AT, end: RETRY_AT + GATEWAY_TIMEOUT, label: '重試，又在等', tone: 'net' },
    { id: 'conn2', lane: 'api', start: RETRY_AT, end: RETRY_AT + GATEWAY_TIMEOUT, label: '又佔一條', tone: 'conn' },
    { id: 'job2', lane: 'worker', start: RETRY_AT, end: RETRY_AT + JOB, label: '重複的報表', tone: 'err' },
  ];
  const marks = [
    { id: 'timeout', lane: 'browser', t: GATEWAY_TIMEOUT, label: '504 逾時', tone: 'err' },
    { id: 'orphan', lane: 'worker', t: JOB, label: '做完了，但沒人收', tone: 'err' },
  ];
  // 事件時間軸：在 t 時刻之前已經發生的事，決定輸出區的數字
  const events = [
    { t: 0, reqs: 1 },
    { t: RETRY_AT, reqs: 1 },
    { t: JOB, wasted: 1 },
  ];
  return { bars, marks, events, knownAt: null, loadText: `${USERS} 條連線各佔 ${GATEWAY_TIMEOUT} 秒` };
}

function pollSim() {
  const bars = [
    { id: 'accept', lane: 'api', start: 0, end: 1, label: '', tone: 'work' },
    { id: 'job1', lane: 'worker', start: 0, end: JOB, label: '產生報表', tone: 'job' },
  ];
  const marks = [{ id: '202', lane: 'browser', t: 0, label: '202 收到', tone: 'ok' }];
  const events = [{ t: 0, reqs: 1 }];
  let knownAt = null;
  for (let t = POLL_EVERY; knownAt === null; t += POLL_EVERY) {
    const done = t >= JOB;
    bars.push({ id: `p${t}`, lane: 'api', start: t, end: t + 1, label: '', tone: 'net' });
    // 只標最後一次，前面「還沒好」的輪詢只畫小橫條，避免標籤擠在一起
    if (done) {
      knownAt = t;
      marks.push({ id: 'done', lane: 'browser', t, label: `第 ${t / POLL_EVERY} 次問：好了！`, tone: 'ok' });
    } else {
      marks.push({ id: `q${t}`, lane: 'browser', t, label: '', tone: 'poll' });
    }
    events.push({ t, reqs: 1 });
  }
  marks.push({ id: 'ready', lane: 'worker', t: JOB, label: '做完，等下一次輪詢', tone: 'click' });
  return { bars, marks, events, knownAt, loadText: `每秒 ${USERS / POLL_EVERY} 次輪詢` };
}

function pushSim() {
  const bars = [
    { id: 'accept', lane: 'api', start: 0, end: 1, label: '', tone: 'work' },
    { id: 'stream', lane: 'browser', start: 1, end: JOB, label: '長連線開著（閒置）', tone: 'conn' },
    { id: 'job1', lane: 'worker', start: 0, end: JOB, label: '產生報表', tone: 'job' },
  ];
  const marks = [
    { id: '202', lane: 'browser', t: 0, label: '202', tone: 'ok' },
    { id: 'pushed', lane: 'browser', t: JOB, label: '收到推播：完成', tone: 'ok' },
  ];
  const events = [{ t: 0, reqs: 1 }];
  return { bars, marks, events, knownAt: JOB, loadText: `${USERS} 條閒置長連線` };
}

const sims = [syncSim(), pollSim(), pushSim()];

function statsAt(sim, t) {
  const past = sim.events.filter((e) => e.t <= t);
  const reqs = past.reduce((n, e) => n + (e.reqs || 0), 0);
  const wasted = past.reduce((n, e) => n + (e.wasted || 0), 0);
  let known = null;
  if (sim.knownAt !== null && t >= sim.knownAt) {
    known = sim.knownAt > JOB ? `${sim.knownAt} 秒（晚 ${sim.knownAt - JOB} 秒）` : `${sim.knownAt} 秒（即時）`;
  } else if (sim.knownAt === null && t >= GATEWAY_TIMEOUT) {
    known = '拿不到（504）';
  }
  return { reqs, known, wasted: `${wasted} 份`, load: null };
}

// ---- 拍成步驟 ----
export const steps = [];
const LOAD_CHAPTER = '很多人同時匯出';

function push(id, chapter, duration, caption, t, extra = () => ({})) {
  steps.push({
    id, chapter, duration, caption,
    data: {
      kind: 'run',
      panels: systems.map((sys, i) => {
        const sim = sims[i];
        const e = extra(sys, sim, i);
        const st = statsAt(sim, t);
        if (chapter === LOAD_CHAPTER) st.load = sim.loadText;
        return {
          action: e.action || '按下「匯出年度報表」',
          verdict: e.verdict || '',
          wires: e.wires || { in: false, out: false },
          span: SPAN, unit: UNIT, t, lanes: LANES, bars: sim.bars, marks: sim.marks, stats: st,
        };
      }),
    },
  });
}

const C1 = '送出請求';
push('start', C1, 4400,
  `使用者按下「匯出年度報表」，後端要跑 ${JOB} 秒。同步等待的做法，瀏覽器就這樣等著；另外兩種做法，伺服器立刻回 202 Accepted 與工作編號，報表交給背景工作慢慢做。`,
  0.5, (sys) => ({ wires: { in: true, out: false }, verdict: sys.id === 'sync' ? '一個請求等到底' : '立刻拿到工作編號' }));

const C2 = '等待中';
push('wait-30', C2, 4200,
  `過了 30 秒。輪詢的做法已經問了 ${statsAt(sims[1], 30).reqs - 1} 次「好了沒」，每次都是「還沒」。推播的做法什麼都不用做，連線開著等通知。同步等待的那條連線從頭到尾佔著。`,
  30, (sys) => ({ verdict: sys.id === 'poll' ? '每 10 秒問一次' : sys.id === 'push' ? '安靜等通知' : '還在等' }));
push('wait-60', C2, 5600,
  `第 ${GATEWAY_TIMEOUT} 秒，同步等待撞上閘道的逾時上限，瀏覽器收到 504。使用者以為失敗了，但後端的報表其實還在做。另外兩種做法的請求都很短，不受逾時限制。`,
  GATEWAY_TIMEOUT + 1, (sys) => ({ verdict: sys.id === 'sync' ? '504：使用者以為失敗' : '照常等待' }));
push('retry', C2, 4800,
  `第 ${RETRY_AT} 秒，使用者又按了一次匯出。後端開始做第二份一模一樣的報表，而且這次一樣會在 ${GATEWAY_TIMEOUT} 秒後逾時。`,
  RETRY_AT + 2, (sys) => ({ verdict: sys.id === 'sync' ? '重試：又做一份' : '照常等待' }));

const C3 = '報表完成';
push('done', C3, 5600,
  `第 ${JOB} 秒報表做完。推播的做法伺服器立刻通知，使用者馬上拿到。同步等待的第一份做完了，但那條連線早就斷了，結果沒人收，白做。輪詢的做法要等下一次詢問才知道。`,
  JOB + 1, (sys) => ({ wires: { in: false, out: sys.id === 'push' }, verdict: sys.id === 'push' ? '伺服器主動推播' : sys.id === 'sync' ? '做完了，沒人收' : '等下一次輪詢' }));
push('poll-hit', C3, 5200,
  `第 ${sims[1].knownAt} 秒，輪詢的第 ${sims[1].knownAt / POLL_EVERY} 次詢問終於拿到「完成」，比實際完成晚了 ${sims[1].knownAt - JOB} 秒。輪詢間隔越短越即時，但請求也越多。`,
  sims[1].knownAt + 1, (sys) => ({ wires: { in: false, out: sys.id !== 'sync' }, verdict: sys.id === 'sync' ? '還在等第二次重試' : '拿到報表' }));

push('load', LOAD_CHAPTER, 6400,
  `如果 ${USERS} 人同時匯出：同步等待要同時佔住 ${USERS} 條連線、每條 ${GATEWAY_TIMEOUT} 秒，執行緒或連線池很快就滿了。輪詢每秒湧進 ${USERS / POLL_EVERY} 個「好了沒」，大多是白問。推播要維持 ${USERS} 條閒置的長連線，需要支援大量長連線的伺服器。`,
  SPAN, () => ({ action: `${USERS} 人同時匯出`, wires: { in: true, out: true } }));

// ---- 對照 ----
const last = steps[steps.length - 1].data.panels;
const col = (id) => last.map((p) => p.stats[id]);
export const compare = {
  title: `同一份 ${JOB} 秒的報表，三種溝通方式`,
  rows: [
    { label: '發出的 HTTP 請求', better: 'low', values: col('reqs').map((v) => `${v} 次`), highlight: true },
    { label: '使用者拿到報表', values: col('known'), highlight: true },
    { label: '白做的後端工作', better: 'low', values: col('wasted'), highlight: true },
    { label: `${USERS} 人同時匯出的伺服器負擔`, values: col('load'), highlight: true },
    { label: '為什麼這樣設計', values: ['讓前端程式最簡單：一個請求就拿到結果', '用最普通的短 HTTP 請求就能做，任何伺服器、代理都支援', '讓伺服器在「事情發生的那一刻」通知，不浪費詢問也不延遲'] },
    { label: '適合', values: ['幾秒內一定做完的工作', '工作時間不確定、對即時性要求不高（數十秒到數分鐘）', '要即時通知、使用者盯著畫面等（進度條、聊天、通知）'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '工作超過幾秒，就不該讓一個請求等到底：先回 202 把「接收」和「完成」拆開。之後用輪詢還是推播，取決於要多即時、伺服器能不能維持大量長連線。',
  data: { kind: 'compare' },
});
