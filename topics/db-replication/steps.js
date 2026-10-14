// 資料庫複寫動畫：同步複寫、非同步複寫、多主複寫面對同樣的四個情境，三個時間軸並排。
// 四個情境刻意讓每個方案各輸一次，讀者才看得出這是取捨，不是誰比較好：
// 1. 寫完立刻讀另一台：非同步與多主會讀到舊值。
// 2. 從庫變慢：同步複寫的每一筆寫入都被拖慢。
// 3. 主庫故障：非同步複寫會遺失已經回覆「成功」的寫入。
// 4. 兩地同時改同一筆：多主複寫會發生衝突，一邊的修改被丟掉。
// 每個時間點都由下面的延遲參數推算，不手寫。

const MS = 'ms';
const LOCAL = 50; // 主庫在本機寫入並提交
const ACK = 200; // 同步複寫：送到從庫、套用、回覆確認的來回時間
const SLOW_ACK = 1000; // 從庫變慢時的確認時間
const SEND = 150; // 非同步複寫：提交後多久才把變更送出（批次）
const NET = 150; // 變更在網路上傳到另一台的時間
const CROSS = 150; // 跨區域單程延遲
const READ_GAP = 20; // 寫入成功後多久另一個人去讀
const CRASH = 280; // 主庫故障的時間點
const DETECT = 300; // 發現主庫故障並把從庫升級為主庫所需時間

export const systems = [
  {
    id: 'sync', title: '同步複寫', short: '同步',
    rule: '主資料庫要等備份資料庫回覆「收到了」，才跟使用者說成功。說過成功的資料，一定至少存在兩台。',
    processLabel: '時間軸：寫入、複寫、讀取',
    code: '<i>-- PostgreSQL</i>\nsynchronous_commit = <b>on</b>\nsynchronous_standby_names = \'replica1\'',
    mode: 'sync',
  },
  {
    id: 'async', title: '非同步複寫', short: '非同步',
    rule: '主資料庫自己寫完就說成功，稍後才複製到備份資料庫。最快，但備份會落後一點點。',
    processLabel: '時間軸：寫入、複寫、讀取',
    code: '<i>-- PostgreSQL / MySQL 預設</i>\nsynchronous_commit = <b>local</b>\n<i>-- 從庫用 WAL / binlog 追上</i>',
    mode: 'async',
  },
  {
    id: 'multi', title: '多主複寫', short: '多主',
    rule: '每個地區各有一台主資料庫，都能寫，彼此再互相同步。就近寫入最快，但兩邊可能同時改到同一筆。',
    processLabel: '時間軸：寫入、複寫、讀取',
    code: '<i>-- 例：跨區域資料庫、CouchDB、</i>\n<i>-- MySQL Group Replication（多主模式）</i>\nconflict_resolution = <b>last_write_wins</b>',
    mode: 'multi',
  },
];

const STATS = [
  { id: 'write', label: '寫入回應時間' },
  { id: 'fresh', label: '寫完立刻從另一台讀' },
  { id: 'slow', label: '從庫變慢時的寫入時間' },
  { id: 'lost', label: '主庫故障：回覆成功卻遺失' },
  { id: 'remote', label: '遠地使用者的寫入時間' },
  { id: 'conflict', label: '兩地同時修改同一筆' },
];
systems.forEach((s) => { s.stats = STATS; });

const names = (sys) => (sys.mode === 'multi' ? ['主庫 A', '主庫 B'] : ['主庫', '從庫']);
// 一筆寫入在主庫提交後，多久回覆使用者、多久出現在另一台
function writeTiming(sys, start, ackWait = ACK) {
  const commit = start + LOCAL;
  if (sys.mode === 'sync') return { commit, ack: commit + ackWait, arrive: commit + ackWait / 2 };
  return { commit, ack: commit, arrive: commit + SEND + NET };
}

// ---- 情境一：寫完立刻讀 ----
function readAfterWrite(sys, ackWait = ACK, span = 500) {
  const [p, r] = names(sys);
  const w = writeTiming(sys, 0, ackWait);
  const readAt = w.ack + READ_GAP;
  const fresh = w.arrive <= readAt;
  const sendAt = sys.mode === 'sync' ? w.commit : w.commit + SEND;
  return {
    span,
    lanes: [{ id: 'u1', name: '使用者 A 寫入' }, { id: 'u2', name: '使用者 B 讀取' }, { id: 'p', name: p }, { id: 'r', name: r }],
    bars: [
      { id: 'w', lane: 'u1', start: 0, end: w.ack, label: sys.mode === 'sync' ? '等從庫確認' : '', tone: sys.mode === 'sync' ? 'wait' : 'write' },
      { id: 'pw', lane: 'p', start: 0, end: w.commit, label: '', tone: 'write' },
      { id: 'rp', lane: 'r', start: sendAt, end: sendAt + (sys.mode === 'sync' ? ackWait : NET), label: sys.mode === 'sync' ? '複寫並確認' : '複寫', tone: 'repl' },
      { id: 'rd', lane: 'u2', start: readAt, end: readAt + 30, label: '', tone: 'read' },
    ],
    marks: [
      { id: 'ack', lane: 'u1', t: w.ack, label: '儲存成功', tone: 'ok' },
      { id: 'res', lane: 'u2', t: readAt + 30, label: fresh ? '讀到新暱稱' : '讀到舊暱稱', tone: fresh ? 'ok' : 'err' },
    ],
    ack: w.ack, fresh,
  };
}

// ---- 情境三：主庫故障 ----
function crash(sys) {
  const [p, r] = names(sys);
  const writes = [{ id: 'W1', start: 0 }, { id: 'W2', start: 100 }].map((x) => {
    const t = writeTiming(sys, x.start);
    // 同步：確認回來之前主庫就掛了，使用者收到失敗；非同步與多主：提交當下就回覆成功
    const acked = t.ack <= CRASH;
    const shipped = sys.mode === 'sync' ? t.arrive <= CRASH : t.commit + SEND <= CRASH;
    return { ...x, ...t, acked, shipped };
  });
  const lost = writes.filter((w) => w.acked && !w.shipped);
  const takeover = sys.mode === 'multi' ? CRASH : CRASH + DETECT;
  const bars = [{ id: 'down', lane: 'p', start: CRASH, end: 700, label: '故障', tone: 'err' }];
  const marks = [];
  writes.forEach((w, i) => {
    const lane = `u${i + 1}`;
    const end = w.acked ? w.ack : CRASH;
    bars.push({ id: `c-${w.id}`, lane, start: w.start, end, label: w.id, tone: sys.mode === 'sync' && w.acked ? 'wait' : w.acked ? 'write' : 'err' });
    bars.push({ id: `cp-${w.id}`, lane: 'p', start: w.start, end: Math.min(w.commit, CRASH), label: '', tone: 'write' });
    marks.push({ id: `ca-${w.id}`, lane, t: end, label: w.acked ? (lost.includes(w) ? '成功（其實會遺失）' : '成功') : '失敗，可重試', tone: w.acked ? (lost.includes(w) ? 'err' : 'ok') : 'click' });
    if (w.shipped) {
      const sendAt = sys.mode === 'sync' ? w.commit : w.commit + SEND;
      bars.push({ id: `cr-${w.id}`, lane: 'r', start: sendAt, end: sendAt + (sys.mode === 'sync' ? ACK / 2 : NET), label: w.id, tone: 'repl' });
    }
  });
  marks.push({
    id: 'take', lane: 'r', t: takeover,
    label: sys.mode === 'multi' ? '照常接受寫入' : `升級為主庫${lost.length ? `，少了 ${lost.map((w) => w.id).join('、')}` : ''}`,
    tone: lost.length && sys.mode !== 'multi' ? 'err' : 'ok',
  });
  return {
    span: 700,
    lanes: [{ id: 'u1', name: '寫入 W1' }, { id: 'u2', name: '寫入 W2' }, { id: 'p', name: p }, { id: 'r', name: r }],
    bars, marks, lost, takeover,
  };
}

// ---- 情境四：兩地同時改同一筆 ----
// 主庫（單主）在區域 A。區域 B 的使用者要跨區寫入；多主時各自寫進自己區域的主庫
function conflict(sys) {
  const [p, r] = names(sys);
  const A = { start: 0, label: 'A 版標題' };
  const B = { start: 20, label: 'B 版標題' };
  const bars = [];
  const marks = [];
  let remote;
  let lostEdit = null;
  if (sys.mode === 'multi') {
    const a = writeTiming(sys, A.start);
    const b = writeTiming(sys, B.start);
    remote = b.ack - B.start;
    // 兩邊各自先生效，複寫到對方時才發現衝突；用「最後寫入者勝」，時間較晚的 B 版留下
    const aAtB = a.arrive;
    const bAtA = b.arrive;
    lostEdit = 'A';
    bars.push(
      { id: 'xa', lane: 'u1', start: A.start, end: a.ack, label: '', tone: 'write' },
      { id: 'xb', lane: 'u2', start: B.start, end: b.ack, label: '', tone: 'write' },
      { id: 'pa1', lane: 'p', start: a.commit, end: bAtA, label: A.label, tone: 'ok' },
      { id: 'pa2', lane: 'p', start: bAtA, end: 700, label: B.label, tone: 'write' },
      { id: 'pb1', lane: 'r', start: b.commit, end: 700, label: B.label, tone: 'write' },
    );
    marks.push(
      { id: 'xr', lane: 'r', t: aAtB, label: '收到較舊的 A 版：丟棄', tone: 'err' },
      { id: 'xl', lane: 'p', t: bAtA, label: 'A 版被覆蓋', tone: 'err' },
      { id: 'xak', lane: 'u2', t: b.ack, label: '成功', tone: 'ok' },
    );
  } else {
    // 單主：兩筆寫入都進同一台主庫，依到達順序一筆一筆套用，不會分歧
    const a = writeTiming(sys, A.start);
    const bArrive = B.start + CROSS;
    const b = writeTiming(sys, Math.max(bArrive, a.commit));
    const bAck = b.ack + CROSS;
    remote = bAck - B.start;
    const aRep = a.arrive;
    const bRep = b.arrive;
    bars.push(
      { id: 'xa', lane: 'u1', start: A.start, end: a.ack, label: '', tone: sys.mode === 'sync' ? 'wait' : 'write' },
      { id: 'xb', lane: 'u2', start: B.start, end: bAck, label: '跨區寫入', tone: 'wait' },
      { id: 'pa1', lane: 'p', start: a.commit, end: b.commit, label: A.label, tone: 'ok' },
      { id: 'pa2', lane: 'p', start: b.commit, end: 700, label: B.label, tone: 'write' },
      { id: 'pb1', lane: 'r', start: aRep, end: bRep, label: A.label, tone: 'ok' },
      { id: 'pb2', lane: 'r', start: bRep, end: 700, label: B.label, tone: 'write' },
    );
    marks.push(
      { id: 'xo', lane: 'p', t: b.commit, label: '依序套用', tone: 'ok' },
      { id: 'xak', lane: 'u2', t: bAck, label: '成功', tone: 'ok' },
    );
  }
  return {
    span: 700,
    lanes: [{ id: 'u1', name: '區域 A 使用者' }, { id: 'u2', name: '區域 B 使用者' }, { id: 'p', name: p }, { id: 'r', name: r }],
    bars, marks, remote, lostEdit,
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
          span: sc.span, unit: MS, t, lanes: sc.lanes, bars: sc.bars, marks: sc.marks, stats: { ...stats[i] },
        };
      }),
    },
  });
}
// 每個情境的最後一拍才把結果寫進輸出區
function chapter(key, title, scenarios, beats, action, verdict, record) {
  beats.forEach((b, k) => {
    if (k === beats.length - 1) scenarios.forEach((sc, i) => record(stats[i], sc, systems[i]));
    push(`${key}-${k}`, title, b.d, b.cap, scenarios, b.t, (sys, sc) => ({
      action, wires: { in: k === 0, out: k === beats.length - 1 }, verdict: verdict(sys, sc, b.t),
    }));
  });
}

const raw = systems.map((s) => readAfterWrite(s));
chapter('read', '寫完立刻讀', raw, [
  { t: 0, d: 4600, cap: '使用者 A 改了暱稱，使用者 B（或 A 自己重新整理）馬上從另一台資料庫讀。讀取通常會分散到從庫，減輕主庫負擔。' },
  { t: 120, d: 4000, cap: `非同步與多主複寫，主庫寫完 ${LOCAL}ms 就回覆成功；同步複寫還在等從庫確認。` },
  { t: 500, d: 6200, cap: `同步複寫要 ${raw[0].ack}ms 才回覆，但回覆時從庫已經有新暱稱，讀得到。非同步與多主只要 ${raw[1].ack}ms，可是變更還在路上，另一台讀到的是舊暱稱：使用者會以為剛剛沒存成功。` },
], '改暱稱後，另一個人馬上讀', (sys, sc, t) => (t >= sc.ack + READ_GAP + 30 ? (sc.fresh ? '讀到新值' : '讀到舊值') : '寫入中'),
(st, sc) => { st.write = `${sc.ack}ms`; st.fresh = sc.fresh ? '新值' : '舊值'; });

const slow = systems.map((s) => readAfterWrite(s, SLOW_ACK, 1200));
chapter('slow', '從庫變慢', slow, [
  { t: 0, d: 4200, cap: `從庫所在的網路壅塞，回應時間變成 ${SLOW_ACK}ms。同樣再寫一次暱稱。` },
  { t: 1200, d: 6200, cap: `同步複寫的每一筆寫入都得等這台慢吞吞的從庫，寫入時間變成 ${slow[0].ack}ms；從庫要是完全斷線，寫入會整個卡住。非同步與多主照樣 ${slow[1].ack}ms 回覆，只是從庫落後得更多。` },
], '從庫變慢後再寫一次', (sys, sc, t) => (t >= sc.ack ? `${sc.ack}ms 回覆` : '寫入中'),
(st, sc) => { st.slow = `${sc.ack}ms`; });

const crashes = systems.map(crash);
chapter('crash', '主庫故障', crashes, [
  { t: 0, d: 4000, cap: '連續兩筆寫入 W1、W2，主庫在第 280ms 突然故障，硬碟也壞了。' },
  { t: 300, d: 5400, cap: '非同步與多主早就對 W1、W2 都回覆了成功，但 W2 還沒送出去主庫就掛了。同步複寫的 W1 已在從庫確認、回覆成功；W2 還在等確認，使用者收到的是失敗，知道要重試。' },
  { t: 700, d: 6400, cap: `單主的兩種做法要花時間發現故障、把從庫升級成新主庫，期間無法寫入。同步複寫沒有遺失任何回覆過成功的資料；非同步複寫的新主庫少了 W2，使用者明明看到「成功」，資料卻不見了。多主的另一台主庫一直可以寫，不用切換，但 W2 困在故障的主庫 A 上。` },
], 'W1、W2 寫入後主庫故障', (sys, sc, t) => (t < CRASH ? '寫入中' : t < sc.takeover ? '主庫故障' : sc.lost.length ? `遺失 ${sc.lost.map((w) => w.id).join('、')}` : '沒有遺失'),
(st, sc, sys) => { st.lost = sc.lost.length ? `${sc.lost.length} 筆${sys.mode === 'multi' ? '（困在主庫 A）' : ''}` : '0 筆'; });

const conflicts = systems.map(conflict);
chapter('conflict', '兩地同時修改', conflicts, [
  { t: 0, d: 4600, cap: '區域 A 與區域 B 的編輯幾乎同時修改同一篇文章的標題。單主的兩種做法，主庫在區域 A，區域 B 的寫入得跨區域傳過去。' },
  { t: 300, d: 5000, cap: `多主複寫兩邊都在本地寫入，${conflicts[2].remote}ms 就回覆成功；但此時兩個區域看到的標題不一樣。單主的兩筆寫入都進同一台主庫，依序套用。` },
  { t: 700, d: 6400, cap: `多主複寫在互相同步時發現衝突，用「最後寫入者勝」解決：時間較晚的 B 版留下，A 的修改被默默丟掉，A 自己卻收到過「成功」。單主不會分歧，代價是區域 B 的寫入要 ${conflicts[0].remote}ms（同步）或 ${conflicts[1].remote}ms（非同步）。` },
], '兩個區域同時改同一筆', (sys, sc, t) => (t < 400 ? '寫入中' : sc.lostEdit ? 'A 的修改被覆蓋' : '依序套用，結果一致'),
(st, sc) => { st.remote = `${sc.remote}ms`; st.conflict = sc.lostEdit ? 'A 的修改被丟棄' : '依序套用'; });

// ---- 對照 ----
const col = (id) => stats.map((s) => s[id]);
export const compare = {
  title: '同樣的四個情境，三種複寫方式',
  rows: [
    { label: '寫入回應時間', better: 'low', values: col('write'), highlight: true },
    { label: '寫完立刻從另一台讀', values: col('fresh'), highlight: true },
    { label: '從庫變慢時的寫入時間', better: 'low', values: col('slow'), highlight: true },
    { label: '主庫故障：回覆成功卻遺失', better: 'low', values: col('lost'), highlight: true },
    { label: '遠地使用者的寫入時間', better: 'low', values: col('remote'), highlight: true },
    { label: '兩地同時修改同一筆', values: col('conflict'), highlight: true },
    { label: '適合', values: ['不能遺失任何一筆的資料：金流、帳務', '大多數系統的預設，搭配「讀自己剛寫的資料走主庫」', '多區域服務、離線可寫的應用，且能接受或處理衝突'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '同步複寫用寫入速度換資料安全；非同步複寫用短暫的落後換速度；多主複寫用衝突處理換就近寫入與高可用。實務上常折衷：只等「其中一台」從庫確認（半同步），或讀取自己剛寫的資料時改讀主庫。',
  data: { kind: 'compare' },
});


// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  'read-0': '使用者 A 改了暱稱，另一個人馬上從另一台資料庫讀。',
  'read-1': `非同步和多主寫完 ${raw[1].ack}ms 就說「成功」；同步還在等備份資料庫回覆。`,
  'read-2': `同步要 ${raw[0].ack}ms 才說成功，但另一台已經有新暱稱；另外兩種雖然快，另一台讀到的卻是舊暱稱。`,
  'slow-0': `備份資料庫那邊網路變慢，要 ${SLOW_ACK}ms 才回應。`,
  'slow-1': `同步每次寫入都得等它，變成 ${slow[0].ack}ms；另外兩種不受影響，照樣 ${slow[1].ack}ms。`,
  'crash-0': `連續寫入 W1、W2，主資料庫在第 ${CRASH}ms 突然壞掉，硬碟也毀了。`,
  'crash-1': '非同步和多主早就對 W1、W2 都說了「成功」，但 W2 還沒複製出去。同步的 W2 還沒確認，使用者收到的是失敗。',
  'crash-2': '同步沒有弄丟任何說過「成功」的資料；非同步的 W2 不見了。多主不用切換、另一台照常可寫，但 W2 卡在壞掉的那台。',
  'conflict-0': '兩個地區的編輯，幾乎同時修改同一篇文章的標題。',
  'conflict-1': `多主兩邊各自寫進本地，${conflicts[2].remote}ms 就說成功，但兩地看到的標題不一樣。單一主資料庫則依序處理。`,
  'conflict-2': `多主互相同步時發現衝突，較晚的 B 版留下，A 的修改被默默丟掉。單一主資料庫不會衝突，但遠方的編輯要等 ${conflicts[1].remote}ms 以上。`,
  compare: '同步用速度換「不掉資料」；非同步用短暫的落後換速度；多主用處理衝突換「就近寫、不停機」。',
};
const plain = (s) => PLAIN[s.id];
steps.forEach((s) => { s.detail = s.caption; s.caption = plain(s); });
