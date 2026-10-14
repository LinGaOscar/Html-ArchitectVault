// Kafka vs RabbitMQ 動畫：同一串訊息同時交給兩種 broker，左右並排同步播放。
// 範例刻意安排三件事讓差異浮現：
// 1. 消費之後，RabbitMQ 的 queue 清空（ack 即刪除），Kafka 的 log 原封不動（只移動 offset）。
// 2. 同一個 user 的訊息，RabbitMQ 輪流分給兩個 consumer，Kafka 依 key 固定在同一個 partition、同一個 consumer。
// 3. 消費完才加入的新服務，RabbitMQ 拿不到任何舊訊息，Kafka 可以從 offset 0 重播全部。
// 畫面上的位置、計數、offset 全部由下面的模擬推導，不手寫。

export const messages = [
  { id: 'm1', key: 'A' },
  { id: 'm2', key: 'B' },
  { id: 'm3', key: 'A' },
  { id: 'm4', key: 'B' },
  { id: 'm5', key: 'A' },
  { id: 'm6', key: 'A' },
];
export const msgIds = messages.map((m) => m.id);
const keyOf = Object.fromEntries(messages.map((m) => [m.id, m.key]));

// 示範用的固定雜湊值：只為了讓 A、B 落在不同 partition
const HASH = { A: 6, B: 3 };
const PARTITIONS = 2;
const partitionOf = (id) => `p${HASH[keyOf[id]] % PARTITIONS}`;

export const consumerDefs = [
  { id: 'c1', name: 'C1', group: '訂單服務' },
  { id: 'c2', name: 'C2', group: '訂單服務' },
  { id: 'an', name: 'A1', group: '分析服務' },
];

export const systems = [
  {
    id: 'rabbit',
    mode: 'move', // 訊息本身被推給 consumer，離開 broker
    title: 'RabbitMQ',
    rule: '訊息放進 queue 推給 consumer，ack 之後就從 queue 刪除。',
    processLabel: 'exchange 把訊息路由到 queue',
    gateName: 'exchange',
    lanes: [{ id: 'orders', name: 'queue: orders' }, { id: 'an', name: 'queue: analytics' }],
    code: 'channel.publish("orders-ex", key, msg)\n<i>// consumer</i>\nchannel.consume("orders", (m) => {\n  handle(m)\n  <b>channel.ack(m)</b>   <i>// ack 後刪除</i>\n})',
  },
  {
    id: 'kafka',
    mode: 'copy', // 訊息留在 log，consumer 讀的是副本
    title: 'Kafka',
    rule: '訊息附加到 partition 的 log 並保留；consumer 自己記讀到哪個 offset。',
    processLabel: '依 key 選 partition，附加到 log',
    gateName: 'partitioner',
    lanes: [{ id: 'p0', name: 'partition P0' }, { id: 'p1', name: 'partition P1' }],
    code: 'producer.send("orders", key, msg)\n<i>// consumer（group: 訂單服務）</i>\nfor (m of consumer.poll()) {\n  handle(m)\n  <b>consumer.commit(m.offset + 1)</b>\n}  <i>// 只記位置，不刪訊息</i>',
  },
];

// ---- 模擬狀態 ----
const R = {
  producer: msgIds.slice(),
  gate: null,
  lanes: { orders: [], an: null }, // null 代表 queue 還沒建立
  consumers: { c1: [], c2: [], an: [] },
  next: 0, // round-robin 輪到誰
};
const K = {
  producer: msgIds.slice(),
  gate: null,
  lanes: { p0: [], p1: [] },
  consumers: { c1: [], c2: [], an: [] },
  offsets: { orders: { p0: 0, p1: 0 }, an: null },
};
let anPresent = false;

const copyLanes = (lanes) => Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v && v.slice()]));
const copyConsumers = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.slice()]));

function view(S, extra) {
  return {
    producer: S.producer.slice(),
    gate: S.gate,
    lanes: copyLanes(S.lanes),
    consumers: copyConsumers(S.consumers),
    offsets: S.offsets ? JSON.parse(JSON.stringify(S.offsets)) : null,
    present: { an: anPresent },
    current: [],
    active: { in: false, lanes: [], consumers: [], phase: null },
    verdict: '',
    ...extra,
  };
}

export const steps = [];
function push(id, chapter, duration, caption, rabbit, kafka) {
  steps.push({ id, chapter, duration, caption, data: { kind: 'run', panels: [rabbit, kafka] } });
}

const DECIDE_MS = 2800;
const LAND_MS = 2400;
const LONG_MS = 3600;
const list = (ids) => ids.join('、');

// ---- 發送 ----
const C1 = '發送';
push('intro', C1, 3600,
  '同一串 6 則訊息，左邊送進 RabbitMQ，右邊送進 Kafka。藍色是 user A 的訂單，橘色是 user B 的訂單。',
  view(R, { verdict: '等待訊息' }),
  view(K, { verdict: '等待訊息' }));

// 一則訊息從 producer 進 broker：先停在 exchange / partitioner 判斷，再落到 queue / partition
function publishOne(id) {
  const p = partitionOf(id);
  const key = keyOf[id];
  R.producer = R.producer.filter((x) => x !== id);
  K.producer = K.producer.filter((x) => x !== id);
  R.gate = id;
  K.gate = id;
  push(`${id}-route`, C1, DECIDE_MS,
    `${id}（user ${key}）送出。RabbitMQ 的 exchange 依 routing key 決定放進哪個 queue；Kafka 用 key 算 partition：hash(${key}) % ${PARTITIONS} = ${HASH[key] % PARTITIONS}，放進 ${p.toUpperCase()}。`,
    view(R, { current: [id], active: { in: true, lanes: [], consumers: [], phase: null }, verdict: `exchange → queue orders` }),
    view(K, { current: [id], active: { in: true, lanes: [], consumers: [], phase: null }, verdict: `hash(${key}) % ${PARTITIONS} = ${HASH[key] % PARTITIONS} → ${p.toUpperCase()}` }));

  R.gate = null;
  K.gate = null;
  R.lanes.orders.push(id);
  K.lanes[p].push(id);
  const offset = K.lanes[p].length - 1;
  push(`${id}-store`, C1, LAND_MS,
    `${id} 落地。RabbitMQ 排進 queue orders 的尾端；Kafka 附加到 ${p.toUpperCase()} 的 log，拿到 offset ${offset}。`,
    view(R, { current: [id], active: { in: false, lanes: ['orders'], consumers: [], phase: null }, verdict: `排進 queue 尾端` }),
    view(K, { current: [id], active: { in: false, lanes: [p], consumers: [], phase: null }, verdict: `附加到 ${p.toUpperCase()}，offset ${offset}` }));
}
publishOne('m1');
publishOne('m2');

// 其餘訊息一次送出，省時間；落點仍由同一套規則算出
const rest = msgIds.slice(2);
rest.forEach((id) => {
  R.producer = R.producer.filter((x) => x !== id);
  K.producer = K.producer.filter((x) => x !== id);
  R.lanes.orders.push(id);
  K.lanes[partitionOf(id)].push(id);
});
const byPartition = (p) => rest.filter((id) => partitionOf(id) === p);
push('batch-store', C1, LONG_MS,
  `${list(rest)} 一次送出。RabbitMQ 全部排進同一個 queue；Kafka 依 key 分流：${list(byPartition('p0'))} 進 P0，${list(byPartition('p1'))} 進 P1。`,
  view(R, { current: rest, active: { in: true, lanes: ['orders'], consumers: [], phase: null }, verdict: `queue 裡有 ${R.lanes.orders.length} 則` }),
  view(K, { current: rest, active: { in: true, lanes: ['p0', 'p1'], consumers: [], phase: null }, verdict: `P0 ${K.lanes.p0.length} 則、P1 ${K.lanes.p1.length} 則` }));

// ---- 消費 ----
const C2 = '消費';
// RabbitMQ：queue 依序輪流推給 C1、C2，每輪最多各一則
function rabbitRound() {
  const got = [];
  ['c1', 'c2'].forEach(() => {
    if (!R.lanes.orders.length) return;
    const id = R.lanes.orders.shift();
    const c = ['c1', 'c2'][R.next % 2];
    R.next += 1;
    R.consumers[c].push(id);
    got.push({ c, id });
  });
  return got;
}
// Kafka：C1 負責 P0、C2 負責 P1，各自從自己的 offset 往下讀一則
const assignment = { c1: 'p0', c2: 'p1' };
function kafkaRound() {
  const got = [];
  ['c1', 'c2'].forEach((c) => {
    const p = assignment[c];
    const off = K.offsets.orders[p];
    if (off >= K.lanes[p].length) return;
    K.consumers[c].push(K.lanes[p][off]);
    K.offsets.orders[p] = off + 1;
    got.push({ c, id: K.lanes[p][off], p, off });
  });
  return got;
}
const describe = (got) => (got.length ? got.map((g) => `${g.c.toUpperCase()} 拿到 ${g.id}`).join('，') : '沒有訊息可拿');

// 第一輪拆兩拍：先標出誰要拿哪一則，再真的移過去
{
  const rPeek = R.lanes.orders.slice(0, 2);
  const kPeek = ['c1', 'c2'].map((c) => K.lanes[assignment[c]][K.offsets.orders[assignment[c]]]);
  push('round1-pick', C2, DECIDE_MS,
    '訂單服務開了兩個 consumer：C1、C2。RabbitMQ 從 queue 前端依序輪流推給 C1、C2；Kafka 把 partition 分給 consumer，C1 讀 P0、C2 讀 P1，各從 offset 0 開始。',
    view(R, { current: rPeek, active: { in: false, lanes: ['orders'], consumers: ['c1', 'c2'], phase: 'target' }, verdict: '輪流推送：C1、C2、C1、C2…' }),
    view(K, { current: kPeek, active: { in: false, lanes: ['p0', 'p1'], consumers: ['c1', 'c2'], phase: 'target' }, verdict: 'C1 ← P0，C2 ← P1' }));
}

let round = 1;
let rGot = rabbitRound();
let kGot = kafkaRound();
push('round1-take', C2, LAND_MS,
  `RabbitMQ：${describe(rGot)}，consumer ack 後訊息就從 queue 刪掉。Kafka：${describe(kGot)}，訊息仍留在 log，只是兩個 partition 的 offset 都 0 → 1。`,
  view(R, { active: { in: false, lanes: [], consumers: rGot.map((g) => g.c), phase: 'chosen' }, verdict: `ack → 刪除 ${list(rGot.map((g) => g.id))}` }),
  view(K, { active: { in: false, lanes: [], consumers: kGot.map((g) => g.c), phase: 'chosen' }, verdict: `commit offset，${list(kGot.map((g) => g.id))} 仍在 log` }));

// 之後每一輪一拍，直到兩邊都拿完
const rabbitA = () => ['c1', 'c2'].filter((c) => R.consumers[c].some((id) => keyOf[id] === 'A'));
while (R.lanes.orders.length || K.offsets.orders.p0 < K.lanes.p0.length || K.offsets.orders.p1 < K.lanes.p1.length) {
  round += 1;
  rGot = rabbitRound();
  kGot = kafkaRound();
  const kIdle = ['c1', 'c2'].filter((c) => !kGot.some((g) => g.c === c));
  const rText = rGot.length ? `RabbitMQ：${describe(rGot)}${R.lanes.orders.length ? '' : '，queue 已經清空'}。` : 'RabbitMQ 的 queue 已經空了，這一輪無動作。';
  const kText = `Kafka：${describe(kGot)}${kIdle.length ? `；${kIdle.map((c) => c.toUpperCase()).join('、')} 的 partition 讀完了，閒著` : ''}。`;
  const done = !R.lanes.orders.length && K.offsets.orders.p0 >= K.lanes.p0.length && K.offsets.orders.p1 >= K.lanes.p1.length;
  const order = done
    ? `user A 的訊息在 RabbitMQ 被分到 ${rabbitA().map((c) => c.toUpperCase()).join('、')} 兩個 consumer，處理順序無法保證；Kafka 同一個 key 都在 P0，全由 C1 依序處理。`
    : '';
  push(`round${round}-take`, C2, done ? 5200 : LAND_MS,
    `${rText}${kText}${order}`,
    view(R, { active: { in: false, lanes: [], consumers: rGot.map((g) => g.c), phase: 'chosen' }, verdict: rGot.length ? `ack → 刪除 ${list(rGot.map((g) => g.id))}` : 'queue 空了，無動作' }),
    view(K, { active: { in: false, lanes: [], consumers: kGot.map((g) => g.c), phase: 'chosen' }, verdict: `offset P0 ${K.offsets.orders.p0}、P1 ${K.offsets.orders.p1}，log 仍有 ${K.lanes.p0.length + K.lanes.p1.length} 則` }));
}

// ---- 新服務加入：能不能拿到過去的訊息 ----
const C3 = '新服務加入';
anPresent = true;
R.lanes.an = []; // 新服務要在 RabbitMQ 收訊息，得建立自己的 queue 綁到 exchange
K.offsets.an = { p0: 0, p1: 0 }; // Kafka 只要用新的 group 訂閱，從 offset 0 開始
push('an-join', C3, LONG_MS,
  '訊息都處理完之後，新的分析服務上線，也想看所有訂單。RabbitMQ 要建立新的 queue analytics 綁到 exchange；Kafka 只要用新的 consumer group 訂閱同一個 topic，offset 從 0 開始。',
  view(R, { active: { in: false, lanes: ['an'], consumers: ['an'], phase: 'target' }, verdict: '新建 queue analytics' }),
  view(K, { active: { in: false, lanes: ['p0', 'p1'], consumers: ['an'], phase: 'target' }, verdict: '新 group：分析服務，offset 0' }));

['p0', 'p1'].forEach((p) => {
  K.lanes[p].forEach((id) => K.consumers.an.push(id));
  K.offsets.an[p] = K.lanes[p].length;
});
const replayed = K.consumers.an.length;
push('an-replay', C3, 5200,
  `RabbitMQ 的新 queue 是空的：舊訊息在 ack 時就刪了，新服務只收得到之後才送出的訊息。Kafka 的分析服務把 log 從頭重播，${replayed} 則全部拿到，而且不影響訂單服務的 offset。`,
  view(R, { active: { in: false, lanes: [], consumers: [], phase: null }, verdict: `queue analytics：0 則，舊訊息拿不回來` }),
  view(K, { current: K.consumers.an.slice(), active: { in: false, lanes: [], consumers: ['an'], phase: 'chosen' }, verdict: `從 offset 0 重播，拿到 ${replayed} 則` }));

// ---- 對照 ----
const last = steps[steps.length - 1].data.panels;
const retained = (p) => Object.values(p.lanes).reduce((n, ids) => n + (ids ? ids.length : 0), 0);
export const compareRows = [
  { label: '儲存模型', rabbit: 'queue：訊息推給 consumer，ack 後刪除', kafka: '分區的 append-only log：訊息依保留期限留著' },
  { label: '誰記得讀到哪', rabbit: 'broker 追蹤每則訊息是否已 ack', kafka: 'consumer group 自己記 offset' },
  { label: '本例處理完後 broker 還留幾則', rabbit: `${retained(last[0])} 則`, kafka: `${retained(last[1])} 則` },
  { label: '本例新服務拿到幾則舊訊息', rabbit: `${last[0].consumers.an.length} 則`, kafka: `${last[1].consumers.an.length} 則（重播）` },
  { label: '同一個 key 的順序', rabbit: `多個 consumer 輪流拿，順序不保證（本例 user A 分到 ${rabbitA().map((c) => c.toUpperCase()).join('、')}）`, kafka: '同一個 partition 內有序，同 key 固定由同一個 consumer 處理' },
  { label: '擴充 consumer', rabbit: '同一個 queue 多加 consumer 就能分攤', kafka: '上限是 partition 數，多出來的 consumer 會閒著' },
  { label: '適合場景', rabbit: '工作佇列、任務派發、需要複雜路由（topic、header exchange）', kafka: '事件串流、要重播或多個服務各自讀同一份資料、高吞吐量日誌' },
];

steps.push({
  id: 'compare',
  chapter: '對照',
  duration: 6000,
  caption: 'RabbitMQ 像郵局：信送到就從櫃台移走，重點是把工作派出去。Kafka 像帳本：每筆都記下來，誰要看都能從任何一頁開始讀。',
  data: { kind: 'compare' },
});

// 每條 queue / partition、每個 consumer 要預留的位置數：取所有步驟中出現過的最大值
const maxOf = (pick) => steps.reduce((m, s) => (s.data.kind === 'run' ? Math.max(m, ...s.data.panels.map(pick)) : m), 0);
export const slotCounts = {
  lanes: Object.fromEntries(systems.map((sys, i) => [sys.id, Object.fromEntries(sys.lanes.map((l) => [
    l.id,
    Math.max(1, steps.reduce((m, s) => (s.data.kind === 'run' ? Math.max(m, (s.data.panels[i].lanes[l.id] || []).length) : m), 0)),
  ]))])),
  consumers: Object.fromEntries(consumerDefs.map((c) => [c.id, Math.max(1, maxOf((p) => p.consumers[c.id].length))])),
};
