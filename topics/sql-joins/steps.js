// SQL Joins 動畫：四種 JOIN 拿同一份 users / orders，並排同步執行。
// 差異只來自「配不到的列怎麼處理」，所以資料刻意包含四種情況：
// 有配對的 user（Ana、Ben）、一個 user 對多筆訂單（Cleo）、沒有訂單的 user（Dev、Eva）、
// 找不到 user 的訂單（orders #5）。四種 JOIN 的結果列數因此各不相同：4 / 6 / 5 / 7。

export const users = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Ben' },
  { id: 3, name: 'Cleo' },
  { id: 4, name: 'Dev' },
  { id: 5, name: 'Eva' },
];

export const orders = [
  { id: 1, userId: 1, amount: 20 },
  { id: 2, userId: 2, amount: 35 },
  { id: 3, userId: 3, amount: 60 },
  { id: 4, userId: 3, amount: 99 },
  { id: 5, userId: 9, amount: 15 },
];

// keepUser：users 配不到訂單時是否保留（補 NULL）；keepOrder：orders 配不到 user 時是否保留
export const joins = [
  { key: 'INNER', label: 'INNER JOIN', short: 'INNER', rule: '只留兩邊都配到的列', keepUser: false, keepOrder: false },
  { key: 'LEFT', label: 'LEFT JOIN', short: 'LEFT', rule: 'users 全留，配不到補 NULL', keepUser: true, keepOrder: false },
  { key: 'RIGHT', label: 'RIGHT JOIN', short: 'RIGHT', rule: 'orders 全留，配不到補 NULL', keepUser: false, keepOrder: true },
  { key: 'FULL', label: 'FULL OUTER JOIN', short: 'FULL', rule: '兩邊全留，配不到補 NULL', keepUser: true, keepOrder: true },
];

const matchesOf = (user) => orders.filter((o) => o.userId === user.id);
const orphans = orders.filter((o) => !users.some((u) => u.id === o.userId));
const unmatchedUsers = users.filter((u) => matchesOf(u).length === 0);

// 所有可能出現在 RESULT 的列。每一列對應畫面上一個常駐元素，from 是它「長出來」的來源列
export const resultCatalog = [
  ...users.flatMap((u) => {
    const m = matchesOf(u);
    return m.length
      ? m.map((o) => ({ key: `u${u.id}-o${o.id}`, user: u, order: o, from: { table: 'users', id: u.id } }))
      : [{ key: `u${u.id}-null`, user: u, order: null, from: { table: 'users', id: u.id } }];
  }),
  ...orphans.map((o) => ({ key: `null-o${o.id}`, user: null, order: o, from: { table: 'orders', id: o.id } })),
];

// 處理順序：先逐列掃 users，掃完再回頭處理沒被配到的 orders
const events = [
  ...users.map((u) => ({ kind: 'user', user: u, matches: matchesOf(u) })),
  ...orphans.map((o) => ({ kind: 'orphan', order: o })),
];

function keysOf(join, e) {
  if (e.kind === 'user') {
    if (e.matches.length) return e.matches.map((o) => `u${e.user.id}-o${o.id}`);
    return join.keepUser ? [`u${e.user.id}-null`] : [];
  }
  return join.keepOrder ? [`null-o${e.order.id}`] : [];
}

const KEEP = { state: 'keep', mark: '∅' };
const DROP = { state: 'drop', mark: '✕' };
const OK = { state: 'ok', mark: '✓' };

function settle(join, e, uRows, oRows) {
  if (e.kind === 'user') {
    if (e.matches.length) {
      uRows[e.user.id] = OK;
      e.matches.forEach((o) => { oRows[o.id] = OK; });
    } else {
      uRows[e.user.id] = join.keepUser ? KEEP : DROP;
    }
  } else {
    oRows[e.order.id] = join.keepOrder ? KEEP : DROP;
  }
}

function verdictOf(join, e, beat) {
  if (e.kind === 'user') {
    const { id } = e.user;
    if (e.matches.length) {
      return beat === 'compare'
        ? `users.id = ${id}，orders.user_id 有 ${e.matches.length} 筆相符`
        : `${e.matches.length} 筆配對各產生一列，放進 RESULT`;
    }
    return beat === 'compare'
      ? `orders.user_id 裡沒有 ${id}，配不到。依規則${join.keepUser ? '要保留這列' : '不留這列'}`
      : join.keepUser ? '補 NULL 後放進 RESULT' : '丟掉，RESULT 不變';
  }
  return beat === 'compare'
    ? `users.id 裡沒有 ${e.order.userId}，配不到。依規則${join.keepOrder ? '要保留這列' : '不留這列'}`
    : join.keepOrder ? '補 NULL 後放進 RESULT' : '丟掉，RESULT 不變';
}

// 給定「第 idx 個事件的比對／產出那一拍」，算出一個面板的完整狀態（不依賴上一步）
function panelAt(join, idx, beat) {
  const done = Math.max(0, beat === 'emit' ? idx + 1 : idx);
  const results = events.slice(0, done).flatMap((e) => keysOf(join, e));
  const userRows = Object.fromEntries(users.map((u) => [u.id, { state: 'idle', mark: '' }]));
  const orderRows = Object.fromEntries(orders.map((o) => [o.id, { state: 'idle', mark: '' }]));
  events.slice(0, done).forEach((e) => settle(join, e, userRows, orderRows));

  const cur = events[idx];
  let cursor = null;
  let wire = null;
  let verdict = '還沒開始，游標在等待，RESULT 是空的';
  if (cur) {
    cursor = cur.kind === 'user' ? { table: 'users', id: cur.user.id } : { table: 'orders', id: cur.order.id };
    verdict = verdictOf(join, cur, beat);
    if (cur.kind === 'user' && cur.matches.length) wire = { from: cur.user.id, to: cur.matches.map((o) => o.id), phase: beat };
    if (beat === 'compare') {
      if (cur.kind === 'user') {
        userRows[cur.user.id] = { state: 'current', mark: '?' };
        cur.matches.forEach((o) => { orderRows[o.id] = { state: 'hit', mark: '' }; });
      } else {
        orderRows[cur.order.id] = { state: 'current', mark: '?' };
      }
    }
  }
  return { key: join.key, results, userRows, orderRows, cursor, wire, verdict };
}

const names = (pred) => joins.filter(pred).map((j) => j.short).join('、');
const keepUserNames = names((j) => j.keepUser);
const dropUserNames = names((j) => !j.keepUser);
const keepOrderNames = names((j) => j.keepOrder);
const dropOrderNames = names((j) => !j.keepOrder);

const COMPARE_MS = 2800; // 比對這一拍要讀完「找什麼、找到什麼」
const EMIT_MS = 2400; // 產出這一拍看結果列飛進 RESULT、列數跳動

function captionOf(e, beat) {
  if (e.kind === 'user') {
    const { id, name } = e.user;
    const n = e.matches.length;
    if (beat === 'compare') {
      return n
        ? `處理：比對 users #${id}（${name}），到 orders 找 user_id = ${id} 的列，找到 ${n} 筆（${e.matches.map((o) => `#${o.id}`).join('、')}）。有配到的列，四種 JOIN 的處理方式相同。`
        : `處理：比對 users #${id}（${name}），orders 裡沒有 user_id = ${id}，配不到。四種 JOIN 對這種列的規則不同：${dropUserNames} 不保留，${keepUserNames} 保留。`;
    }
    if (n) {
      return `產出：每筆配對產生一列 RESULT，四個面板同步 +${n} 列。${n > 1 ? '一個 user 對到多筆訂單時會長出多列，所以 RESULT 可以比 users 還長。' : ''}`;
    }
    return `產出：${dropUserNames} 把 ${name} 這列丟掉，RESULT 不變（標紅）；${keepUserNames} 保留 ${name}，訂單欄位補 NULL，列數 +1（標橘）。`;
  }
  const { id, userId } = e.order;
  return beat === 'compare'
    ? `users 掃完了，再回頭檢查 orders 裡有沒有沒被任何 user 配到的列。orders #${id} 的 user_id = ${userId}，users 裡沒有 id = ${userId}。${dropOrderNames} 不保留這種列，${keepOrderNames} 保留。`
    : `產出：${dropOrderNames} 把這列丟掉（標紅）；${keepOrderNames} 補一列 users 欄位為 NULL 的結果，列數 +1（標橘）。`;
}

const chapterOf = (e) => (e.kind === 'user' ? '掃描 users' : '剩下的 orders');

const startStep = {
  id: 'start',
  chapter: '掃描 users',
  caption: `輸入是 users 與 orders 兩張表，四種 JOIN 拿同一份資料同時執行。游標會沿 users 逐列往下，到 orders 找 user_id 相同的列；右邊的 RESULT 表是輸出。四種做法的差別只在配不到的列怎麼處理。`,
  duration: 3400,
  data: { kind: 'run', panels: joins.map((j) => panelAt(j, -1, 'compare')) },
};

const eventSteps = events.flatMap((e, i) =>
  ['compare', 'emit'].map((beat) => ({
    id: `${e.kind}-${e.kind === 'user' ? e.user.id : e.order.id}-${beat}`,
    chapter: chapterOf(e),
    caption: captionOf(e, beat),
    duration: beat === 'compare' ? COMPARE_MS : EMIT_MS,
    data: { kind: 'run', panels: joins.map((j) => panelAt(j, i, beat)) },
  })),
);

export const compareRows = joins.map((j) => ({
  label: j.label,
  short: j.short,
  count: events.flatMap((e) => keysOf(j, e)).length,
  keepUser: j.keepUser,
  keepOrder: j.keepOrder,
}));

export const unmatchedUserNames = unmatchedUsers.map((u) => u.name);
export const orphanLabels = orphans.map((o) => `#${o.id}`);

const countText = compareRows.map((r) => `${r.short} ${r.count}`).join('、');

const compareStep = {
  id: 'compare',
  chapter: '對照',
  caption: `對照：結果列數是 ${countText}。同一份資料，差別全在配不到的列：LEFT 多留了 users 配不到的 ${unmatchedUserNames.join('、')}，RIGHT 多留了 orders 配不到的 ${orphanLabels.join('、')}，FULL 兩邊都留，INNER 兩邊都不留。`,
  duration: 6000,
  data: { kind: 'compare' },
};

export const steps = [startStep, ...eventSteps, compareStep];

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
function plain(s) {
  if (s.id === 'start') return '把「使用者」和「訂單」兩張表對起來，合成一張結果表。四種 JOIN 的差別只有一個：對不上的資料要不要留。';
  if (s.id === 'compare') return `結果列數：${countText}。資料一樣，差別全在對不上的那幾列留不留。`;
  const [kind, num, beat] = s.id.split('-');
  if (kind === 'orphan') {
    return beat === 'compare'
      ? `訂單 #${num} 找不到對應的使用者。${dropOrderNames} 不留，${keepOrderNames} 留下。`
      : `${keepOrderNames} 留下訂單 #${num}，使用者欄位空白（NULL）。`;
  }
  const user = users.find((u) => u.id === Number(num));
  const n = matchesOf(user).length;
  if (beat === 'compare') {
    return n ? `${user.name} 在訂單表找到 ${n} 筆訂單，四種 JOIN 都會留下。` : `${user.name} 沒有任何訂單，對不上。四種 JOIN 在這裡做法不同。`;
  }
  if (n) return `每一組配對變成結果表的一列，四邊都多 ${n} 列。${n > 1 ? '一個人兩筆訂單，就變成兩列。' : ''}`;
  return `${dropUserNames} 丟掉 ${user.name}；${keepUserNames} 留下 ${user.name}，訂單欄位空白（NULL）。`;
}
steps.forEach((s) => { s.detail = s.caption; s.caption = plain(s); });
