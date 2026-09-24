// Load Balancer 動畫：同一批請求，先示範 Round Robin，再示範 Least Connections，
// 對照兩種演算法在同樣的請求序列下，分配結果為什麼不一樣。

export const nodes = ['server-1', 'server-2', 'server-3'];

// holdSteps：這個請求會佔用連線幾個「請求到達」的時間點，只有 Least Connections 用得到，
// 用來讓「目前連線數最少」在不同時間點真的會指向不同節點。
const requests = [
  { id: 1, holdSteps: 3 },
  { id: 2, holdSteps: 1 },
  { id: 3, holdSteps: 2 },
  { id: 4, holdSteps: 4 },
  { id: 5, holdSteps: 1 },
  { id: 6, holdSteps: 2 },
  { id: 7, holdSteps: 3 },
  { id: 8, holdSteps: 1 },
];

function buildRoundRobinSteps() {
  const assigned = [];
  return requests.map((req, i) => {
    const chosenNode = nodes[i % nodes.length];
    assigned.push({ requestId: req.id, node: chosenNode });
    return {
      id: `rr-${req.id}`,
      caption: `Round Robin：請求 #${req.id} 依序輪到 ${chosenNode}`,
      duration: 1400,
      data: { algorithm: 'Round Robin', assigned: assigned.slice(), activeCounts: null },
    };
  });
}

function buildLeastConnectionsSteps() {
  const active = Object.fromEntries(nodes.map((n) => [n, 0]));
  const assignedAt = {};
  const assigned = [];
  const steps = [];
  let tick = 0;

  requests.forEach((req) => {
    tick += 1;
    // 先讓連線持續時間到期的請求釋放連線，再決定新請求分配給誰
    Object.keys(assignedAt).forEach((rid) => {
      const info = assignedAt[rid];
      if (!info.released && tick - info.tick >= info.holdSteps) {
        active[info.node] -= 1;
        info.released = true;
      }
    });

    const beforeActive = { ...active }; // 分配前的連線數快照，caption 說明「為什麼選這個節點」要用這份，不能用分配後的

    let chosenNode = nodes[0];
    nodes.forEach((n) => {
      if (active[n] < active[chosenNode]) chosenNode = n;
    });
    active[chosenNode] += 1;
    assignedAt[req.id] = { node: chosenNode, tick, holdSteps: req.holdSteps, released: false };
    assigned.push({ requestId: req.id, node: chosenNode });

    steps.push({
      id: `lc-${req.id}`,
      caption: `Least Connections：請求 #${req.id} 分配給連線數最少的 ${chosenNode}（分配前各節點連線數：${nodes
        .map((n) => `${n}=${beforeActive[n]}`)
        .join(', ')}）`,
      duration: 1600,
      data: { algorithm: 'Least Connections', assigned: assigned.slice(), activeCounts: { ...active } },
    });
  });

  return steps;
}

export const steps = [...buildRoundRobinSteps(), ...buildLeastConnectionsSteps()];
