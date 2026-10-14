// 交易隔離等級動畫：同樣兩筆並行的交易，在 Read Committed、Repeatable Read、Serializable 下跑，三個時間軸並排。
// 兩個情境，各對應一種隔離等級擋不住的異常：
// 1. 不可重複讀：報表交易讀兩次同一個帳戶，中間被轉帳改掉了。Read Committed 會讀到兩個不同的值。
// 2. 寫入偏斜（write skew）：兩位醫師同時請假，各自檢查「至少要有 1 人值班」都通過，結果沒人值班。
//    Repeatable Read（快照隔離）也擋不住，只有 Serializable 會中止其中一筆。
// 每次讀到的值、誰被中止、最後的資料，都由下面的 MVCC 模擬依各等級的規則算出，不手寫。

const MS = 'ms';

export const systems = [
  {
    id: 'rc',
    title: 'Read Committed',
    short: 'RC',
    rule: '每一次讀取都讀「當下已提交」的最新值。別的交易一提交，下一次讀就看得到。',
    processLabel: '時間軸：兩筆交易同時在跑',
    code: 'SET TRANSACTION ISOLATION LEVEL\n  <b>READ COMMITTED</b>;\n<i>-- 每個 SELECT 各自取最新已提交的值</i>',
    level: 'rc',
  },
  {
    id: 'rr',
    title: 'Repeatable Read',
    short: 'RR',
    rule: '交易開始時拍一張快照，整筆交易都讀這張快照。同一筆資料讀幾次都一樣（快照隔離）。',
    processLabel: '時間軸：兩筆交易同時在跑',
    code: 'SET TRANSACTION ISOLATION LEVEL\n  <b>REPEATABLE READ</b>;\n<i>-- 整筆交易讀同一張快照</i>',
    level: 'rr',
  },
  {
    id: 'ser',
    title: 'Serializable',
    short: 'Serializable',
    rule: '保證結果跟「一筆接一筆依序執行」一樣。偵測到並行會造成矛盾時，中止其中一筆，讓它重來。',
    processLabel: '時間軸：兩筆交易同時在跑',
    code: 'SET TRANSACTION ISOLATION LEVEL\n  <b>SERIALIZABLE</b>;\n<i>-- 衝突時提交失敗，應用程式要重試</i>',
    level: 'ser',
  },
];

const STATS = [
  { id: 'nrr', label: '報表兩次讀到的帳戶餘額' },
  { id: 'skew', label: '最後還在值班的醫師' },
  { id: 'aborts', label: '被中止重來的交易' },
];
systems.forEach((s) => { s.stats = STATS; });

// ---- MVCC 模擬 ----
// db: { row: [{ value, at, by }] } 每一列保留所有已提交的版本
// tx 腳本：begin 時間、一串動作；讀取的值依隔離等級決定，寫入在提交前別人看不到
function makeDb(initial) {
  return Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [{ value: v, at: -1, by: null }]]));
}
const committedAt = (db, row, t) => db[row].filter((v) => v.at <= t).pop().value;

// 依時間順序執行所有交易的所有動作，回傳每個動作的結果
function run(level, initial, txs) {
  const db = makeDb(initial);
  const state = Object.fromEntries(txs.map((tx) => [tx.id, { snapshot: tx.begin, writes: {}, reads: new Set(), log: [], aborted: false }]));
  const events = txs.flatMap((tx) => [...tx.ops.map((op) => ({ tx, op, t: op.t })), { tx, op: { type: 'commit' }, t: tx.commit }]);
  events.sort((a, b) => a.t - b.t);
  for (const { tx, op, t } of events) {
    const st = state[tx.id];
    if (st.aborted || st.skipped) continue;
    if (op.type === 'read') {
      // 自己寫過的讀自己的；否則 RC 讀當下最新已提交，RR / Serializable 讀交易開始時的快照
      const values = op.rows.map((row) => (row in st.writes ? st.writes[row] : committedAt(db, row, level === 'rc' ? t : st.snapshot)));
      op.rows.forEach((row) => st.reads.add(row));
      st.log.push({ t, type: 'read', values });
      st.last = values;
    } else if (op.type === 'write') {
      const w = op.compute(st.last);
      if (w === null) {
        st.log.push({ t, type: 'refuse' });
        st.skipped = true; // 檢查沒通過，不寫、直接結束
        continue;
      }
      Object.assign(st.writes, w);
      st.log.push({ t, type: 'write', writes: w });
    } else {
      // Serializable：有寫入的交易提交時，若它讀過的資料在它開始之後被別人提交改過，代表兩筆交易互相看不到對方，中止
      const conflict = level === 'ser' && Object.keys(st.writes).length > 0
        && [...st.reads].some((row) => db[row].some((v) => v.by && v.by !== tx.id && v.at > st.snapshot && v.at <= t));
      if (conflict) {
        st.aborted = true;
        st.log.push({ t, type: 'abort' });
        continue;
      }
      Object.entries(st.writes).forEach(([row, value]) => db[row].push({ value, at: t, by: tx.id }));
      st.log.push({ t, type: 'commit' });
    }
  }
  return { db, state };
}

// ---- 情境一：不可重複讀 ----
const ACCOUNT = 1000;
const TRANSFER = 300;
const nrrTxs = () => [
  { id: 'T1', begin: 0, commit: 600, ops: [{ t: 100, type: 'read', rows: ['A'] }, { t: 500, type: 'read', rows: ['A'] }] },
  {
    id: 'T2', begin: 200, commit: 400,
    ops: [{ t: 250, type: 'read', rows: ['A'] }, { t: 300, type: 'write', compute: ([a]) => ({ A: a - TRANSFER }) }],
  },
];

function nrrScenario(sys) {
  const { db, state } = run(sys.level, { A: ACCOUNT }, nrrTxs());
  const reads = state.T1.log.filter((e) => e.type === 'read').map((e) => e.values[0]);
  const t2read = state.T2.log.find((e) => e.type === 'read').values[0];
  const t2write = state.T2.log.find((e) => e.type === 'write').writes.A;
  const versions = db.A;
  return {
    span: 700,
    lanes: [{ id: 'T1', name: 'T1 報表' }, { id: 'T2', name: 'T2 轉帳' }, { id: 'db', name: '已提交的 A' }],
    bars: [
      { id: 'n-t1', lane: 'T1', start: 0, end: 600, label: '產生月報', tone: 'read' },
      { id: 'n-t2', lane: 'T2', start: 200, end: 400, label: `轉出 ${TRANSFER}`, tone: 'write' },
      ...versions.map((v, i) => ({
        id: `n-db${i}`, lane: 'db', start: Math.max(0, v.at), end: versions[i + 1] ? versions[i + 1].at : 700, label: `A = ${v.value}`, tone: i ? 'write' : 'ok',
      })),
    ],
    marks: [
      { id: 'n-r1', lane: 'T1', t: 100, label: `讀 A = ${reads[0]}`, tone: 'read' },
      { id: 'n-r2', lane: 'T1', t: 500, label: `讀 A = ${reads[1]}`, tone: reads[1] === reads[0] ? 'read' : 'err' },
      { id: 'n-w', lane: 'T2', t: 300, label: `讀 ${t2read} → 寫 ${t2write}`, tone: 'write' },
      { id: 'n-c', lane: 'db', t: 400, label: 'T2 提交', tone: 'ok' },
    ],
    reads,
  };
}

// ---- 情境二：寫入偏斜 ----
// 規則：任何時候至少要有 1 位醫師值班。兩人同時請假，各自檢查「目前值班人數 ≥ 2」才讓自己下班
const onCall = (values) => values.filter(Boolean).length;
const leave = (who) => (values) => (onCall(values) >= 2 ? { [who]: false } : null);
const skewTxs = (withRetry) => [
  { id: 'T1', begin: 0, commit: 500, ops: [{ t: 100, type: 'read', rows: ['alice', 'bob'] }, { t: 300, type: 'write', compute: leave('alice') }] },
  { id: 'T2', begin: 50, commit: 600, ops: [{ t: 150, type: 'read', rows: ['alice', 'bob'] }, { t: 350, type: 'write', compute: leave('bob') }] },
  ...(withRetry ? [{ id: 'T2b', begin: 650, commit: 760, ops: [{ t: 700, type: 'read', rows: ['alice', 'bob'] }, { t: 730, type: 'write', compute: leave('bob') }] }] : []),
];

function skewScenario(sys) {
  let { db, state } = run(sys.level, { alice: true, bob: true }, skewTxs(false));
  const aborted = state.T2.aborted;
  // 被中止的交易由應用程式重試：重跑一次，這次 T2 從頭讀
  if (aborted) ({ db, state } = run(sys.level, { alice: true, bob: true }, skewTxs(true)));
  const names = (t) => ['alice', 'bob'].filter((r) => committedAt(db, r, t)).map((r) => (r === 'alice' ? 'Alice' : 'Bob'));
  const changes = [-1, ...new Set(Object.values(db).flatMap((vs) => vs.map((v) => v.at)).filter((t) => t >= 0))].sort((a, b) => a - b);
  const finalOnCall = names(Infinity).length;
  const read = (id) => state[id].log.find((e) => e.type === 'read');
  const bars = [
    { id: 's-t1', lane: 'T1', start: 0, end: 500, label: 'Alice 請假', tone: 'write' },
    { id: 's-t2', lane: 'T2', start: 50, end: 600, label: 'Bob 請假', tone: aborted ? 'err' : 'write' },
    ...changes.map((t, i) => {
      const who = names(t);
      return { id: `s-db${i}`, lane: 'db', start: Math.max(0, t), end: changes[i + 1] ?? 800, label: who.length ? `值班：${who.join('、')}` : '沒人值班', tone: who.length ? 'ok' : 'err' };
    }),
  ];
  const marks = [
    { id: 's-r1', lane: 'T1', t: 100, label: `讀到 ${onCall(read('T1').values)} 人`, tone: 'read' },
    { id: 's-w1', lane: 'T1', t: 300, label: 'Alice 下班', tone: 'write' },
    { id: 's-r2', lane: 'T2', t: 150, label: `讀到 ${onCall(read('T2').values)} 人`, tone: 'read' },
    { id: 's-w2', lane: 'T2', t: 350, label: 'Bob 下班', tone: 'write' },
  ];
  if (aborted) {
    marks.push({ id: 's-ab', lane: 'T2', t: 600, label: '提交失敗', tone: 'err' });
    bars.push({ id: 's-t2b', lane: 'T2b', start: 650, end: 760, label: '重試', tone: 'read' });
    marks.push({ id: 's-r3', lane: 'T2b', t: 700, label: `讀到 ${onCall(read('T2b').values)} 人 → 拒絕請假`, tone: 'ok' });
  }
  return {
    span: 800,
    lanes: [{ id: 'T1', name: 'T1 Alice' }, { id: 'T2', name: 'T2 Bob' }, { id: 'T2b', name: 'T2 重試' } /* 三個面板都留這條泳道（沒重試就空著），下面的值班表才對得齊 */, { id: 'db', name: '已提交的值班表' }],
    bars, marks, aborted, finalOnCall,
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
          span: sc.span, unit: MS, t, lanes: sc.lanes.filter((l) => l.name), bars: sc.bars, marks: sc.marks,
          stats: { ...stats[i] },
        };
      }),
    },
  });
}

const C1 = '不可重複讀';
const nrr = systems.map(nrrScenario);
const [rcReads, rrReads] = [nrr[0].reads, nrr[1].reads];
[
  { t: 30, d: 4400, cap: `帳戶 A 有 ${ACCOUNT}。T1 是產生月報的交易，會讀 A 兩次（一次算總額、一次列明細）；T2 是一筆轉帳，會從 A 轉出 ${TRANSFER}。三個面板跑的是完全一樣的兩筆交易，只有隔離等級不同。` },
  { t: 160, d: 3400, cap: `T1 第一次讀 A，三邊都讀到 ${rcReads[0]}。` },
  { t: 440, d: 4400, cap: `T1 還沒結束，T2 讀到 ${ACCOUNT}、寫入 ${ACCOUNT - TRANSFER} 並提交了。資料庫裡 A 已經是 ${ACCOUNT - TRANSFER}。` },
  { t: 660, d: 6200, cap: `T1 第二次讀 A。Read Committed 讀當下最新的已提交值，讀到 ${rcReads[1]}，同一份月報前後兩個數字對不起來，這就是不可重複讀。Repeatable Read 與 Serializable 讀交易開始時的快照，兩次都是 ${rrReads[1]}。` },
].forEach((b, k, arr) => {
  if (k === arr.length - 1) {
    nrr.forEach((sc, i) => {
      const [a, c] = sc.reads;
      stats[i].nrr = a === c ? `${a}、${c}` : `${a}、${c}（不一致）`;
    });
  }
  push(`nrr-${k}`, C1, b.d, b.cap, nrr, b.t, (sys, sc) => ({
    action: `月報讀 A 兩次，中間有一筆轉帳`,
    wires: { in: k === 0, out: k === arr.length - 1 },
    verdict: b.t >= 500 ? (sc.reads[0] === sc.reads[1] ? '兩次讀到的一樣' : '兩次讀到的不一樣') : '交易進行中',
  }));
});

const C2 = '寫入偏斜';
const skew = systems.map(skewScenario);
[
  { t: 20, d: 4800, cap: '醫院規定任何時候至少要有 1 位醫師值班。Alice 和 Bob 幾乎同時按下請假，每筆交易都先數目前有幾人值班，「至少 2 人」才讓自己下班。' },
  { t: 200, d: 4000, cap: '兩筆交易各自讀到「2 人值班」，檢查都通過。兩筆都還沒提交，誰也看不到對方的變更。' },
  { t: 420, d: 3600, cap: 'T1 把 Alice 設為下班，T2 把 Bob 設為下班。兩筆改的是不同的資料列，彼此沒有寫入衝突。' },
  { t: 560, d: 3800, cap: 'T1 提交，值班表剩 Bob 一人。' },
  { t: 640, d: 6400, cap: `T2 提交。Read Committed 與 Repeatable Read 都讓它成功，值班表變成 ${skew[0].finalOnCall} 人：兩筆交易各自都守了規則，合起來卻違反了規則，這就是寫入偏斜。Repeatable Read 的快照擋得住「讀到不同的值」，卻擋不住「根據過期的快照做決定」。Serializable 發現 T2 讀過的資料已被 T1 改掉，讓 T2 提交失敗。` },
  { t: 790, d: 5600, cap: `應用程式重試 T2。這次讀到只剩 1 人值班，檢查不通過，拒絕 Bob 請假。Serializable 最後還有 ${skew[2].finalOnCall} 人值班，代價是多跑了一次交易。` },
].forEach((b, k, arr) => {
  skew.forEach((sc, i) => {
    if (b.t >= 600 && (!sc.aborted || b.t >= 760)) stats[i].skew = `${sc.finalOnCall} 人${sc.finalOnCall ? '' : '（違規）'}`;
    if (b.t >= 600) stats[i].aborts = sc.aborted ? 1 : 0;
  });
  push(`skew-${k}`, C2, b.d, b.cap, skew, b.t, (sys, sc) => ({
    action: 'Alice 和 Bob 同時請假',
    wires: { in: k === 0, out: k >= arr.length - 2 },
    verdict: b.t < 600 ? '交易進行中' : sc.aborted ? (b.t >= 760 ? '重試後拒絕請假，還有 1 人值班' : 'T2 提交失敗，要重試') : '兩筆都成功，沒人值班',
  }));
});

// ---- 對照 ----
const col = (id) => stats.map((s) => s[id]);
const yesNo = (ok) => (ok ? '擋得住' : '擋不住');
export const compare = {
  title: '同樣兩組並行交易，三種隔離等級',
  rows: [
    { label: '報表兩次讀到的帳戶餘額', values: col('nrr'), highlight: true },
    { label: '不可重複讀', values: nrr.map((sc) => yesNo(sc.reads[0] === sc.reads[1])), highlight: true },
    { label: '最後還在值班的醫師', better: 'high', values: col('skew'), highlight: true },
    { label: '寫入偏斜', values: skew.map((sc) => yesNo(sc.finalOnCall > 0)), highlight: true },
    { label: '被中止重來的交易', better: 'low', values: col('aborts').map((v) => `${v} 筆`), highlight: true },
    { label: '代價', values: ['最低；同一筆交易內的讀取可能前後不一致', '要保留舊版本資料；仍擋不住寫入偏斜', '衝突時交易會失敗，應用程式必須能重試；並行越多，失敗越多'] },
    { label: '常見預設', values: ['PostgreSQL、Oracle、SQL Server 的預設', 'MySQL InnoDB 的預設', '需要明確設定；金融、庫存等不容許矛盾的交易'] },
  ],
};
steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6500,
  caption: '隔離等級越高，擋得住的異常越多，但並行能力越差、失敗重試越多。多數系統用預設的 Read Committed，再針對真正需要的那幾筆交易提高等級，或用 SELECT … FOR UPDATE 明確鎖住要檢查的資料。',
  data: { kind: 'compare' },
});
