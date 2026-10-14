// 前端呼叫 API 動畫：同一個頁面用三種寫法呼叫後端，三個時間軸並排同步前進。
// 1. 同步呼叫：請求沒回來之前，主執行緒整個停住，畫面凍結、點擊沒反應。
// 2. 非同步但逐一 await：畫面不凍結，但三支彼此無關的 API 還是排隊一支一支等；也沒處理「舊回應蓋掉新回應」。
// 3. 非同步並行＋防護：無關的請求一起發（Promise.allSettled），被取代的請求直接取消（AbortController）。
// 三個情境：載入頁面、一支 API 失敗、搜尋框連續輸入。所有時間點都由下面的排程模擬算出，不手寫。

const MS = 'ms';
const THREAD = { id: 'main', name: '主執行緒' };

// 頁面載入要打的三支 API 與各自的回應時間
const APIS = [
  { id: 'user', name: '使用者', ms: 300 },
  { id: 'orders', name: '訂單', ms: 800 },
  { id: 'rec', name: '推薦', ms: 500 },
];
const CLICK_AT = 500; // 載入途中使用者點了一下「收藏」
const FAIL = 'orders'; // 失敗情境裡出錯的那一支
const TICK = 20; // 處理點擊、把資料畫到畫面上這種小工作要花的時間

export const systems = [
  {
    id: 'sync',
    title: '同步呼叫',
    rule: '用同步 XHR 一支一支呼叫，回應回來之前，JavaScript 停在那一行，瀏覽器也無法重畫畫面或處理點擊。',
    processLabel: '時間軸：誰在等、誰被卡住',
    code: 'const xhr = new XMLHttpRequest()\nxhr.open("GET", "/api/user", <b>false</b>) <i>// 同步</i>\nxhr.send()  <i>// 卡在這裡直到回應</i>\nrender(JSON.parse(xhr.responseText))',
    sequential: true,
    blocking: true,
    settled: false,
    abort: false,
  },
  {
    id: 'seq',
    title: '非同步：逐一 await',
    short: '逐一 await',
    rule: '用 fetch + await，等待時主執行緒是空的，畫面照常回應。但寫成一行一行 await，彼此無關的請求也會排隊。',
    processLabel: '時間軸：誰在等、誰被卡住',
    code: 'const user = await fetch("/api/user")\nconst orders = await fetch("/api/orders")\nconst rec = await fetch("/api/rec")\n<i>// 一支回來才發下一支</i>',
    sequential: true,
    blocking: false,
    settled: false,
    abort: false,
  },
  {
    id: 'par',
    title: '非同步：並行＋防護',
    short: '並行＋防護',
    rule: '彼此無關的請求一起發，用 Promise.allSettled 等全部結束，一支失敗不影響其他支；被新輸入取代的請求用 AbortController 取消。',
    processLabel: '時間軸：誰在等、誰被卡住',
    code: '<b>await Promise.allSettled</b>([\n  fetch("/api/user"), fetch("/api/orders"),\n  fetch("/api/rec"),\n])\n<i>// 搜尋：新輸入來了就取消舊請求</i>\n<b>controller.abort()</b>',
    sequential: false,
    blocking: false,
    settled: true,
    abort: true,
  },
];

const STATS = [
  { id: 'load', label: '畫面完整顯示' },
  { id: 'frozen', label: '畫面凍結時間' },
  { id: 'click', label: '點擊多久才有反應' },
  { id: 'fail', label: '訂單 API 失敗時拿到的資料' },
  { id: 'search', label: '搜尋框最後顯示的結果' },
];
systems.forEach((s) => { s.stats = STATS; });

// ---- 排程模擬 ----
// 依寫法排出三支 API 的開始與結束時間；逐一呼叫時，失敗後丟出例外，後面的就不會發
function scheduleApis(sys, failId) {
  let cursor = TICK;
  const out = [];
  for (const api of APIS) {
    const start = sys.sequential ? cursor : TICK;
    const end = start + api.ms;
    const failed = api.id === failId;
    out.push({ ...api, start, end, failed });
    cursor = end;
    if (sys.sequential && failed) break; // 一個 try 包住三行 await：第二支丟例外，第三支根本沒發
  }
  return out;
}

// 載入頁面：主執行緒何時被卡住、點擊何時被處理、畫面何時完整顯示
function loadScenario(sys) {
  const calls = scheduleApis(sys, null);
  const allDone = Math.max(...calls.map((c) => c.end));
  const bars = [];
  const marks = [];
  if (sys.blocking) {
    bars.push({ id: 'l-block', lane: 'main', start: 0, end: allDone, label: '卡在 xhr.send()，畫面凍結', tone: 'block' });
  } else {
    bars.push({ id: 'l-send', lane: 'main', start: 0, end: TICK, label: '', tone: 'work' });
  }
  // 點擊事件要等主執行緒空下來才會被處理
  const clickHandled = sys.blocking ? allDone : CLICK_AT;
  bars.push({ id: 'l-click', lane: 'main', start: clickHandled, end: clickHandled + TICK, label: '', tone: 'work' });
  bars.push({ id: 'l-render', lane: 'main', start: allDone + TICK, end: allDone + 3 * TICK, label: '', tone: 'work' });
  calls.forEach((c) => bars.push({ id: `l-${c.id}`, lane: c.id, start: c.start, end: c.end, label: `GET /${c.id} ${c.ms}ms`, tone: 'net' }));
  marks.push({ id: 'l-tap', lane: 'main', t: CLICK_AT, label: sys.blocking ? '點擊（沒反應）' : '點擊 → 立刻反應', tone: sys.blocking ? 'err' : 'ok' });
  marks.push({ id: 'l-done', lane: 'main', t: allDone + 3 * TICK, label: '畫面完整', tone: 'ok' });
  return {
    lanes: [THREAD, ...APIS.map((a) => ({ id: a.id, name: `${a.name} API` }))],
    bars,
    marks,
    allDone: allDone + 3 * TICK,
    frozen: sys.blocking ? allDone : 0,
    clickDelay: clickHandled - CLICK_AT,
    clickHandled,
    span: 1800,
  };
}

// 一支 API 失敗：逐一呼叫在第二支就跳出，並行的其他支照樣拿得到
function failScenario(sys) {
  const calls = scheduleApis(sys, FAIL);
  const known = sys.sequential ? calls.find((c) => c.failed).end : Math.max(...calls.map((c) => c.end));
  const got = calls.filter((c) => !c.failed && (sys.settled || c.end <= known)).length;
  const bars = [];
  if (sys.blocking) bars.push({ id: 'f-block', lane: 'main', start: 0, end: known, label: '畫面凍結', tone: 'block' });
  else bars.push({ id: 'f-send', lane: 'main', start: 0, end: TICK, label: '', tone: 'work' });
  bars.push({ id: 'f-render', lane: 'main', start: known, end: known + 2 * TICK, label: '', tone: 'work' });
  calls.forEach((c) => bars.push({
    id: `f-${c.id}`, lane: c.id, start: c.start, end: c.end,
    label: c.failed ? `500 錯誤` : `GET /${c.id}`, tone: c.failed ? 'err' : 'net',
  }));
  const skipped = APIS.filter((a) => !calls.some((c) => c.id === a.id));
  const marks = [
    { id: 'f-err', lane: FAIL, t: calls.find((c) => c.failed).end, label: '訂單 API 回 500', tone: 'err' },
    ...skipped.map((a) => ({ id: `f-skip-${a.id}`, lane: a.id, t: known, label: '沒發出去', tone: 'err' })),
    { id: 'f-show', lane: 'main', t: known + 2 * TICK, label: got ? `顯示 ${got} 個區塊，訂單區塊顯示錯誤` : '整頁顯示錯誤', tone: got > 1 ? 'ok' : 'err' },
  ];
  return {
    lanes: [THREAD, ...APIS.map((a) => ({ id: a.id, name: `${a.name} API` }))],
    bars, marks, known: known + 2 * TICK, got, skipped: skipped.length, span: 1200,
  };
}

// 搜尋框連續輸入三個字：舊請求比較慢，會不會晚回來蓋掉新結果
const KEYS = [
  { id: 'k', text: 'k', at: 0, ms: 1000 },
  { id: 'ka', text: 'ka', at: 150, ms: 300 },
  { id: 'kaf', text: 'kaf', at: 300, ms: 400 },
];
function searchScenario(sys) {
  const bars = [];
  const marks = [];
  const renders = []; // 結果畫到畫面上的時間與內容
  let mainFree = 0;
  let frozen = 0;
  KEYS.forEach((k, i) => {
    const next = KEYS[i + 1];
    if (sys.blocking) {
      // 同步：按鍵要等前一個請求結束才被處理，處理時又卡住整段請求時間
      const start = Math.max(k.at, mainFree);
      const end = start + k.ms;
      bars.push({ id: `s-${k.id}`, lane: k.id, start, end, label: `「${k.text}」`, tone: 'net' });
      bars.push({ id: `s-block-${k.id}`, lane: 'main', start, end, label: i === 0 ? '畫面凍結，打的字出不來' : '', tone: 'block' });
      frozen += end - start;
      mainFree = end + TICK; // 先把這次結果畫完，下一個按鍵才輪得到
      renders.push({ at: end, text: k.text });
    } else {
      const aborted = sys.abort && next && next.at < k.at + k.ms;
      const end = aborted ? next.at : k.at + k.ms;
      bars.push({ id: `s-${k.id}`, lane: k.id, start: k.at, end, label: aborted ? `「${k.text}」已取消` : `「${k.text}」`, tone: aborted ? 'abort' : 'net' });
      if (!aborted) renders.push({ at: end, text: k.text });
    }
  });
  renders.sort((a, b) => a.at - b.at);
  renders.forEach((r, i) => {
    const last = i === renders.length - 1;
    const wrong = last && r.text !== KEYS[KEYS.length - 1].text;
    bars.push({ id: `s-render-${r.text}`, lane: 'main', start: r.at, end: r.at + TICK, label: '', tone: 'work' });
    marks.push({ id: `s-show-${r.text}`, lane: KEYS.find((k) => k.text === r.text).id, t: r.at, label: wrong ? `舊「${r.text}」蓋掉新結果` : `顯示「${r.text}」`, tone: wrong ? 'err' : last ? 'ok' : 'click' });
  });
  // 按鍵標記放在各自的泳道：三次按鍵只差 150ms，全擠在主執行緒那一列，文字會疊在一起
  KEYS.forEach((k) => marks.push({ id: `s-key-${k.id}`, lane: k.id, t: k.at, label: '按鍵', tone: 'click' }));
  const final = renders[renders.length - 1];
  return {
    lanes: [THREAD, ...KEYS.map((k) => ({ id: k.id, name: `搜尋「${k.text}」` }))],
    bars, marks, final, frozen, correct: final.text === KEYS[KEYS.length - 1].text, span: 1800,
  };
}

// ---- 拍成步驟 ----
export const steps = [];
const stats = systems.map(() => Object.fromEntries(STATS.map((s) => [s.id, null])));

function push(id, chapter, duration, caption, scenarios, t, extra) {
  steps.push({
    id, chapter, duration, caption,
    data: {
      kind: 'run',
      panels: systems.map((sys, i) => {
        const sc = scenarios[i];
        const e = extra(sys, sc, i);
        return {
          action: e.action, verdict: e.verdict, wires: e.wires || { in: false, out: false },
          span: sc.span, unit: MS, t, lanes: sc.lanes, bars: sc.bars, marks: sc.marks,
          stats: { ...stats[i] },
        };
      }),
    },
  });
}

// 載入頁面
const C1 = '載入頁面';
const load = systems.map(loadScenario);
const loadBeats = [
  { t: 0, d: 4200, cap: '三個面板載入同一個頁面，要打三支 API：使用者 300ms、訂單 800ms、推薦 500ms。上排是主執行緒，它被卡住時，畫面不能重畫、點擊也不會被處理。' },
  { t: 320, d: 3600, cap: '使用者 API 回來了。同步呼叫這段時間主執行緒一直卡在 xhr.send()（紅色斜紋）；兩種非同步寫法發完請求就把主執行緒讓出來了。並行的寫法三支請求同時在跑。' },
  { t: CLICK_AT + 40, d: 4400, cap: `第 ${CLICK_AT}ms 使用者點了一下「收藏」。同步呼叫的主執行緒還卡著，點擊進不來；兩種非同步寫法立刻處理。` },
  { t: 860, d: 4000, cap: '並行的寫法三支都回來了，畫面已經完整顯示。逐一 await 的寫法還在等訂單，推薦根本還沒發出去：三支互不相關，卻排隊等。' },
  { t: 1700, d: 5600, cap: `同步呼叫與逐一 await 都到 ${load[0].allDone}ms 才顯示完整畫面，並行只要 ${load[2].allDone}ms。同步呼叫還讓畫面凍結 ${load[0].frozen}ms，那次點擊晚了 ${load[0].clickDelay}ms 才反應，使用者會以為當機。` },
];
loadBeats.forEach((b, k) => {
  systems.forEach((sys, i) => {
    const sc = load[i];
    if (b.t >= sc.allDone) stats[i].load = `${sc.allDone}ms`;
    stats[i].frozen = `${Math.min(b.t, sc.frozen)}ms`;
    if (b.t >= sc.clickHandled) stats[i].click = sc.clickDelay ? `${sc.clickDelay}ms` : '立即';
  });
  push(`load-${k}`, C1, b.d, b.cap, load, b.t, (sys, sc) => ({
    action: '載入頁面：3 支 API',
    wires: { in: k === 0, out: k === loadBeats.length - 1 },
    verdict: b.t >= sc.allDone ? `${sc.allDone}ms 畫面完整` : sys.blocking ? '主執行緒卡住中' : '等待中，畫面可操作',
  }));
});

// 一支 API 失敗
const C2 = '一支失敗';
const fail = systems.map(failScenario);
const failBeats = [
  { t: 0, d: 3600, cap: '再載入一次，這次訂單 API 會在 800ms 後回 500 錯誤。' },
  { t: 560, d: 3600, cap: '並行的寫法已經拿到使用者和推薦；逐一 await 的寫法還在等訂單。' },
  { t: 1200, d: 6200, cap: `逐一呼叫的兩種寫法用一個 try 包住三行，訂單丟出例外就直接跳到 catch，推薦 API 根本沒發出去，只拿到 ${fail[1].got} 支。並行＋allSettled 的寫法三支各自結算，拿到 ${fail[2].got} 支，只有訂單區塊顯示錯誤。注意：若用 Promise.all，一支失敗整個 Promise 就失敗，成功的結果也拿不到。` },
];
failBeats.forEach((b, k) => {
  systems.forEach((sys, i) => {
    if (b.t >= fail[i].known) stats[i].fail = `${fail[i].got} / ${APIS.length} 支`;
  });
  push(`fail-${k}`, C2, b.d, b.cap, fail, b.t, (sys, sc) => ({
    action: '載入頁面：訂單 API 會失敗',
    wires: { in: k === 0, out: k === failBeats.length - 1 },
    verdict: b.t >= sc.known ? `拿到 ${sc.got} 支${sc.skipped ? `，${sc.skipped} 支沒發出去` : ''}` : '等待中',
  }));
});

// 搜尋框連續輸入
const C3 = '回應順序亂掉';
const search = systems.map(searchScenario);
const searchBeats = [
  { t: 0, d: 4200, cap: '使用者在搜尋框依序打出 k、ka、kaf，每打一個字就發一次搜尋。剛好「k」的結果最多，伺服器回得最慢。' },
  { t: 520, d: 4400, cap: '逐一 await 的寫法每個請求各自等、回來就畫：「ka」先回來先畫。並行＋防護的寫法每打一個新字，就取消上一個還沒回來的請求。同步呼叫還卡在第一個字，後面打的字連輸入框都還沒出現。' },
  { t: 1100, d: 6000, cap: `「k」最慢，${search[1].final.at}ms 才回來。逐一 await 的寫法照樣把它畫上去，舊結果蓋掉了正確的「kaf」，這就是 race condition。並行＋防護的寫法早就取消了「k」，畫面停在正確的「kaf」。` },
  { t: 1800, d: 5200, cap: `同步呼叫不會亂序，因為一次只做一件事，但代價是整段輸入期間凍結了 ${search[0].frozen}ms，使用者打字完全沒反應。` },
];
searchBeats.forEach((b, k) => {
  systems.forEach((sys, i) => {
    const sc = search[i];
    if (b.t >= sc.final.at) stats[i].search = sc.correct ? `「${sc.final.text}」正確` : `「${sc.final.text}」錯誤`;
  });
  push(`search-${k}`, C3, b.d, b.cap, search, b.t, (sys, sc) => ({
    action: '搜尋框依序打 k → ka → kaf',
    wires: { in: k === 0, out: k === searchBeats.length - 1 },
    verdict: b.t >= sc.final.at ? (sc.correct ? '最後顯示「kaf」，正確' : `最後顯示「${sc.final.text}」，被舊結果蓋掉`) : '等待搜尋結果',
  }));
});

// ---- 對照 ----
const col = (id) => stats.map((s) => s[id]);
export const compare = {
  title: '同一個頁面，三種呼叫 API 的寫法',
  rows: [
    { label: '畫面完整顯示', better: 'low', values: col('load'), highlight: true },
    { label: '畫面凍結時間', better: 'low', values: col('frozen'), highlight: true },
    { label: '點擊多久才有反應', values: col('click'), highlight: true },
    { label: '訂單 API 失敗時拿到的資料', better: 'high', values: col('fail'), highlight: true },
    { label: '搜尋框最後顯示的結果', values: col('search'), highlight: true },
    { label: '為什麼會這樣', values: ['JavaScript 只有一條主執行緒，同步等待就是讓它什麼都不能做', '等待時讓出主執行緒，但每個 await 都要等前一個結束', '無關的工作同時等，總時間只取決於最慢的那一支'] },
    { label: '什麼時候用', values: ['幾乎不用；瀏覽器已不建議主執行緒上的同步 XHR', '後一支 API 真的需要前一支的結果時（例如先拿 token 再查資料）', '彼此獨立的請求、會被新輸入取代的請求（搜尋、篩選）'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '非同步讓主執行緒在等網路時能做別的事，畫面才不會凍結。但「非同步」不等於「快」：彼此無關的請求要並行發，被取代的請求要取消，失敗要各自處理。',
  data: { kind: 'compare' },
});
