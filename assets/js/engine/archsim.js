// 架構主題 steps.js 共用的模擬狀態（純函式，不碰 window / document）。
// 每個方案一份 sim：記住目前有哪些元件、哪些依賴、輸出區的計數；
// 每一拍再疊上這一拍才有的標記（誰在動、誰被改、請求在哪），拍成 diagram.js 要的 view。

export function makeSim(sys) {
  return {
    sys,
    nodes: new Set(sys.nodes.filter((n) => !n.hidden).map((n) => n.id)),
    edges: new Set(sys.edges.filter((e) => !e.hidden).map((e) => e.id)),
    stats: Object.fromEntries(sys.stats.map((s) => [s.id, null])),
    notes: {},
  };
}

// 目前這一刻的依賴圖，給 graph.js 推導用
export function liveGraph(sim) {
  const nodes = [...sim.nodes];
  const edges = sim.sys.edges
    .filter((e) => sim.edges.has(e.id) && sim.nodes.has(e.from) && sim.nodes.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
  return { nodes, edges };
}

// 依賴（from → to）對應的 edge id，用來把推導結果標回畫面上的箭頭
export function edgeIds(sim, pairs) {
  return sim.sys.edges.filter((e) => pairs.some(([a, b]) => e.from === a && e.to === b)).map((e) => e.id);
}

export function view(sim, beat = {}) {
  const state = beat.state || {};
  const on = beat.on || [];
  const edgeState = beat.edgeState || {};
  return {
    action: beat.action || '',
    verdict: beat.verdict || '',
    wires: beat.wires || { in: false, out: false },
    nodes: Object.fromEntries(sim.sys.nodes.map((n) => [n.id, {
      show: sim.nodes.has(n.id),
      state: state[n.id] || '',
      note: (beat.notes && beat.notes[n.id]) ?? sim.notes[n.id] ?? '',
      badge: (beat.badges && beat.badges[n.id]) || '',
    }])),
    edges: Object.fromEntries(sim.sys.edges.map((e) => [e.id, {
      show: sim.edges.has(e.id),
      state: on.includes(e.id) ? 'on' : edgeState[e.id] || '',
    }])),
    groups: beat.groups || {},
    tokens: beat.tokens || {},
    stats: { ...sim.stats },
  };
}
