// Consistent Hashing 動畫：同一批 key、同樣的節點增減事件，左邊用「hash % N」、右邊用一致性雜湊環，
// 兩邊並排同步播放，讀者在同一個時間點就能比較「節點數一變，誰要搬多少 key」。
// 雜湊值是固定的示範數字（0 到 99 的環），不是真的雜湊函式：這樣才能把 key 和節點的位置排到彼此不擠、
// 又能看出差異。但「每個 key 歸誰」「搬了幾個」全部由下面的程式依規則算出，不是手寫。

export const allNodes = ['node-A', 'node-B', 'node-C', 'node-D'];
export const nodePos = { 'node-A': 12, 'node-B': 40, 'node-C': 68, 'node-D': 88 };
export const RING_SIZE = 100;

const initialNodes = ['node-A', 'node-B', 'node-C'];
const ADDED = 'node-D';
const REMOVED = 'node-B';

// 雜湊值刻意挑成：節點數 3 變 4 時 hash % N 幾乎全部改變，但環上只有 node-D 前面那一小段受影響
const hashes = [34, 77, 7, 61, 99, 17, 45, 83, 54, 27];
export const keys = hashes.map((hash, i) => ({ id: `k${i + 1}`, name: `k${i + 1}`, hash }));
export const keyIds = keys.map((k) => k.id);
const byId = Object.fromEntries(keys.map((k) => [k.id, k]));

const shortName = (n) => n.replace('node-', '');

// 環上順時針第一個位置 >= key 的節點；超過最大位置就繞回最小的那個
function ringOwner(nodes, hash) {
  const sorted = nodes.slice().sort((a, b) => nodePos[a] - nodePos[b]);
  return (sorted.find((n) => nodePos[n] >= hash) || sorted[0]);
}

const DEFS = {
  mod: {
    kind: 'mod',
    title: '取餘數',
    rule: '桶號 = hash(key) % N，N 是節點數。',
    ownerOf: (nodes, hash) => nodes[hash % nodes.length],
  },
  ring: {
    kind: 'ring',
    title: 'Consistent Hashing',
    rule: 'key 放在環上，順時針第一個節點負責它。',
    ownerOf: ringOwner,
  },
};

// 一個面板的模擬狀態；每拍結束拍下快照給 render 用
function makePanel(def) {
  return {
    def,
    nodes: initialNodes.slice(),
    owner: {}, // 已放入的 key => 節點
    slot: {}, // 已放入的 key => 在節點裡的位置。搬家時沒搬的 key 位置不變，所以位置要記下來
    events: [],
  };
}

function freeSlot(panel, node) {
  const used = new Set(Object.keys(panel.owner).filter((id) => panel.owner[id] === node).map((id) => panel.slot[id]));
  let i = 0;
  while (used.has(i)) i += 1;
  return i;
}

function put(panel, id) {
  const node = panel.def.ownerOf(panel.nodes, byId[id].hash);
  panel.owner[id] = node;
  panel.slot[id] = freeSlot(panel, node);
  return node;
}

// 節點變動後，每個已放入的 key 重新算歸屬；回傳「歸屬改變」的 key
function pendingMoves(panel, nextNodes) {
  return keyIds.filter((id) => id in panel.owner && panel.def.ownerOf(nextNodes, byId[id].hash) !== panel.owner[id]);
}

function applyMoves(panel, ids) {
  // 先全部離開舊位置再入座，避免兩個搬家的 key 互相搶到對方剛空出來的位置
  ids.forEach((id) => { delete panel.owner[id]; delete panel.slot[id]; });
  ids.forEach((id) => put(panel, id));
}

function snapshot(panel, extra) {
  const bucket = Object.fromEntries(panel.nodes.map((n, i) => [n, i]));
  return {
    kind: panel.def.kind,
    title: panel.def.title,
    rule: panel.def.rule,
    present: panel.nodes.slice(),
    bucket,
    owner: { ...panel.owner },
    slot: { ...panel.slot },
    current: null,
    gate: null,
    line1: '',
    line2: '',
    sweep: null,
    target: null,
    marked: [],
    moved: [],
    moveCount: 0,
    ...extra,
  };
}

const panels = [makePanel(DEFS.mod), makePanel(DEFS.ring)];
const [modP, ringP] = panels;

const DECIDE_MS = 3000;
const PLACE_MS = 2400;
const BATCH_MS = 3200;
const EVENT_MS = 3800;

const steps = [];
const total = keys.length;

function push(base, views) {
  steps.push({ ...base, data: { kind: 'run', queue: base.queue, panels: views } });
}

const queueAfter = (n) => keyIds.slice(n);
const nameList = (ids) => ids.map((id) => byId[id].name).join('、');

// 開場
push({
  id: 'intro',
  chapter: '放入 key',
  caption: `資料要分散到多台節點上，每筆資料用 key 決定放哪一台。左邊用「hash % N」決定，右邊用一致性雜湊環決定。兩邊拿到的是同一批 ${total} 個 key、同樣 3 個節點。`,
  duration: DECIDE_MS,
  queue: keyIds,
}, panels.map((p) => snapshot(p, {})));

// 前兩個 key 拆成「算位置」「落到節點」兩拍
keys.slice(0, 2).forEach((key, i) => {
  const queue = queueAfter(i + 1);
  const n = initialNodes.length;
  const calcLine1 = `hash(${key.name}) = ${key.hash}`;
  const modCalc = snapshot(modP, { gate: key.id, current: key.id, line1: calcLine1, line2: `${key.hash} % ${n} = ${key.hash % n}` });
  const ringCalc = snapshot(ringP, { gate: key.id, current: key.id, line1: calcLine1, line2: `環上位置 ${key.hash}，接著順時針找節點` });
  const modNode = put(modP, key.id);
  const ringNode = put(ringP, key.id);
  const same = modNode === ringNode;
  push({
    id: `${key.id}-calc`,
    chapter: '放入 key',
    caption: `${key.name} 先算 hash，得到 ${key.hash}。左邊拿 ${key.hash} 除以 ${n} 取餘數，得到 ${key.hash % n}；右邊把 ${key.name} 放到環上 ${key.hash} 的位置。`,
    duration: DECIDE_MS,
    queue,
  }, [modCalc, ringCalc]);
  push({
    id: `${key.id}-place`,
    chapter: '放入 key',
    caption: same
      ? `${key.name} 兩邊都落在 ${modNode}。左邊是桶 ${key.hash % n} 對應的節點；右邊沿環順時針走到第一個節點 ${ringNode}（位置 ${nodePos[ringNode]}）。`
      : `${key.name} 兩邊落點不同：左邊 ${key.hash} % ${n} = ${key.hash % n}，放進 ${modNode}；右邊沿環順時針走到第一個節點 ${ringNode}（位置 ${nodePos[ringNode]}）。`,
    duration: PLACE_MS,
    queue,
  }, [
    snapshot(modP, { current: key.id, line1: calcLine1, line2: `${key.hash} % ${n} = ${key.hash % n} → ${modNode}`, target: modNode }),
    snapshot(ringP, {
      current: key.id,
      line1: calcLine1,
      line2: `順時針第一個節點：${ringNode}（${nodePos[ringNode]}）`,
      target: ringNode,
      sweep: { from: key.hash, to: nodePos[ringNode] },
    }),
  ]);
});

// 其餘 key 分兩批放入，省時間；每個 key 仍然各自算出落點
[[2, 6], [6, total]].forEach(([from, to]) => {
  const batch = keys.slice(from, to);
  const ids = batch.map((k) => k.id);
  ids.forEach((id) => { put(modP, id); put(ringP, id); });
  const n = initialNodes.length;
  const describe = (p) => batch.map((k) => `${k.name}→${shortName(p.owner[k.id])}`).join('、');
  push({
    id: `batch-${from + 1}-${to}`,
    chapter: '放入 key',
    caption: `${nameList(ids)} 一次放入，各自算出落點。左邊：${describe(modP)}。右邊：${describe(ringP)}。`,
    duration: BATCH_MS,
    queue: queueAfter(to),
  }, [
    snapshot(modP, { line1: `${nameList(ids)} 各自算 hash`, line2: `每個都做 hash % ${n}` }),
    snapshot(ringP, { line1: `${nameList(ids)} 各自算 hash`, line2: '每個都沿環找順時針第一個節點' }),
  ]);
});

// 節點增減事件：先一拍標出受影響的 key，再一拍搬家
function nodeEvent({ id, chapter, label, nextNodes, announce }) {
  const stats = panels.map((p) => ({ panel: p, ids: pendingMoves(p, nextNodes), before: p.nodes.length }));
  const [m, r] = stats;
  panels.forEach((p) => { p.nodes = nextNodes.slice(); });
  const ctx = { m: m.ids, r: r.ids, before: m.before, after: nextNodes.length };

  push({
    id: `${id}-announce`,
    chapter,
    caption: announce(ctx),
    duration: EVENT_MS,
    queue: [],
  }, [
    snapshot(modP, {
      marked: m.ids,
      line1: `N：${m.before} → ${nextNodes.length}`,
      line2: `用 hash % ${nextNodes.length} 重算，${m.ids.length} / ${total} 個 key 的桶號變了`,
    }),
    snapshot(ringP, {
      marked: r.ids,
      line1: label,
      line2: `只有環上相鄰的一段換人，${r.ids.length} / ${total} 個 key 受影響`,
      sweep: null,
    }),
  ]);

  panels.forEach((p, i) => { applyMoves(p, stats[i].ids); p.events.push({ label, moved: stats[i].ids.length, before: stats[i].before, after: nextNodes.length }); });

  push({
    id: `${id}-move`,
    chapter,
    caption: `受影響的 key 搬家。左邊搬了 ${m.ids.length} / ${total} 個（${nameList(m.ids)}），右邊只搬了 ${r.ids.length} / ${total} 個（${nameList(r.ids)}），其餘 key 原地不動。`,
    duration: EVENT_MS,
    queue: [],
  }, [
    snapshot(modP, { moved: m.ids, moveCount: m.ids.length, line1: `搬家：${m.ids.length} / ${total}`, line2: `${Math.round((m.ids.length / total) * 100)}% 的 key 換節點` }),
    snapshot(ringP, { moved: r.ids, moveCount: r.ids.length, line1: `搬家：${r.ids.length} / ${total}`, line2: `${Math.round((r.ids.length / total) * 100)}% 的 key 換節點` }),
  ]);
}

nodeEvent({
  id: 'add',
  chapter: '新增節點',
  label: `${ADDED} 加入環，位置 ${nodePos[ADDED]}`,
  nextNodes: [...initialNodes, ADDED],
  announce: ({ m, r, before, after }) =>
    `新增 ${ADDED}，節點數 ${before} → ${after}。左邊 N 變了，${m.length} / ${total} 個 key 的 hash % N 結果不同。右邊 ${ADDED} 落在環上 ${nodePos[ADDED]}，只接手它前面那一段，受影響的只有 ${nameList(r)}。`,
});

const afterAdd = [...initialNodes, ADDED];
nodeEvent({
  id: 'remove',
  chapter: '移除節點',
  label: `${REMOVED} 離開環`,
  nextNodes: afterAdd.filter((n) => n !== REMOVED),
  announce: ({ m, r, before, after }) =>
    `移除 ${REMOVED}，節點數 ${before} → ${after}。左邊 N 又變了，剩下節點重新編號，${m.length} / ${total} 個 key 換桶。右邊只有 ${REMOVED} 手上的 ${nameList(r)} 要交給順時針下一個節點。`,
});

// 對照
const [modEvents, ringEvents] = [modP.events, ringP.events];
const compareRows = modEvents.map((e, i) => ({
  label: `${i === 0 ? '新增' : '移除'} ${i === 0 ? ADDED : REMOVED}（${e.before} → ${e.after} 個節點）`,
  mod: e.moved,
  ring: ringEvents[i].moved,
  total,
  theory: (total / Math.max(e.before, e.after)).toFixed(1),
}));

steps.push({
  id: 'compare',
  chapter: '對照',
  caption: `同樣 ${total} 個 key、同樣的節點增減：取餘數搬了 ${modEvents.map((e) => e.moved).join('、')} 個，一致性雜湊只搬了 ${ringEvents.map((e) => e.moved).join('、')} 個。理論上一致性雜湊平均只搬動約 K/N 個 key（K 是 key 總數，N 是節點數）。`,
  duration: 6000,
  data: { kind: 'compare', rows: compareRows, total },
});

// 每個節點要預留的位置數：取所有拍中任何節點同時持有的最大 key 數
export const slotsPerNode = steps.reduce((max, s) => {
  if (s.data.kind !== 'run') return max;
  return s.data.panels.reduce((m2, view) => {
    const counts = {};
    Object.keys(view.owner).forEach((id) => { counts[view.owner[id]] = (counts[view.owner[id]] || 0) + 1; });
    return Math.max(m2, ...Object.values(counts), 0);
  }, max);
}, 0);

export { steps };
