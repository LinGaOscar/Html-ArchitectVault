// 一致性雜湊環：用 0-359 度代表雜湊空間。這裡直接指定節點與 key 的位置，
// 不做真的雜湊運算——重點是示範「新增/移除節點只影響環上鄰近的一小段」，
// 用真實雜湊函式反而無法把位置設計得剛好展示這個效果。

const initialNodes = [
  { id: 'node-A', pos: 20 },
  { id: 'node-B', pos: 140 },
  { id: 'node-C', pos: 260 },
];

const keys = [
  { id: 'key-1', pos: 10 },
  { id: 'key-2', pos: 50 },
  { id: 'key-3', pos: 110 },
  { id: 'key-4', pos: 180 },
  { id: 'key-5', pos: 230 },
  { id: 'key-6', pos: 340 },
];

// 找 key 順時針方向遇到的第一個節點（超過最大位置的話繞回第一個節點）。
function assignKeys(nodeList, keyList) {
  const sorted = nodeList.slice().sort((a, b) => a.pos - b.pos);
  return keyList.map((key) => {
    const owner = sorted.find((n) => n.pos >= key.pos) || sorted[0];
    return { ...key, owner: owner.id };
  });
}

function diffOwners(before, after) {
  return after.filter((k) => {
    const prev = before.find((b) => b.id === k.id);
    return prev && prev.owner !== k.owner;
  });
}

const withNodeABC = assignKeys(initialNodes, keys);

const nodesWithD = [...initialNodes, { id: 'node-D', pos: 70 }];
const withNodeD = assignKeys(nodesWithD, keys);

const nodesAfterRemoveB = nodesWithD.filter((n) => n.id !== 'node-B');
const afterRemoveB = assignKeys(nodesAfterRemoveB, keys);

export const steps = [
  {
    id: 'initial',
    caption: '一致性雜湊環上有 3 個節點（A/B/C），每個 key 交給順時針方向第一個遇到的節點負責。',
    duration: 2400,
    data: { nodes: initialNodes, keys: withNodeABC, movedKeyIds: [] },
  },
  {
    id: 'add-d',
    caption: '新增 node-D（放在 70 度）。只有落在 node-D 與它前一個節點之間的 key 會換人負責，其他 key 完全不受影響。',
    duration: 2800,
    data: { nodes: nodesWithD, keys: withNodeD, movedKeyIds: diffOwners(withNodeABC, withNodeD).map((k) => k.id) },
  },
  {
    id: 'remove-b',
    caption: '移除 node-B。原本 node-B 負責的 key 全部轉給下一個順時針節點，其他 key 依然不受影響。',
    duration: 2800,
    data: { nodes: nodesAfterRemoveB, keys: afterRemoveB, movedKeyIds: diffOwners(withNodeD, afterRemoveB).map((k) => k.id) },
  },
];
