// Load Balancer 動畫：同一批請求、同樣的連線佔用時間，同時交給 Round Robin 和 Least Connections，
// 兩邊並排同步播放，讓讀者在同一個時間點直接比較「不看負載」與「看負載」差在哪。

export const nodes = ['server-1', 'server-2', 'server-3'];

// holdSteps：這個請求會佔用連線幾個「請求到達」的時間點。
// 兩種演算法共用同一份佔用時間，差異才會只來自分配規則本身。
// 刻意讓每三個請求就有一個長連線：Round Robin 剛好會把它們全輪給同一台，
// 這是「只看順序、不看負載」最典型的失衡情境。
const requests = [
  { id: 1, holdSteps: 7 },
  { id: 2, holdSteps: 1 },
  { id: 3, holdSteps: 1 },
  { id: 4, holdSteps: 7 },
  { id: 5, holdSteps: 1 },
  { id: 6, holdSteps: 1 },
  { id: 7, holdSteps: 7 },
  { id: 8, holdSteps: 1 },
];

export const requestIds = requests.map((r) => r.id);

// 長連線在畫面上要另外標示：它們會不會擠在同一台，是這個主題要讀者看到的重點
export const longIds = requests.filter((r) => r.holdSteps > 1).map((r) => r.id);

const DECIDE_MS = 2600; // 判斷這一拍要讀完兩邊各自「為什麼選它」，給比較久
const DISPATCH_MS = 1600; // 送出這一拍只是看請求移過去、數字跳動

function snapshot(held) {
  return Object.fromEntries(nodes.map((n) => [n, held[n].map((c) => c.id)]));
}

function countsOf(held) {
  return Object.fromEntries(nodes.map((n) => [n, held[n].length]));
}

// 跑完一種演算法，回傳每個請求「判斷當下」與「送出之後」的狀態，之後再跟另一種演算法逐拍對齊。
// pickNode(requestIndex, 分配前各節點連線數) => 選中的節點
// explain(選中的節點, 分配前各節點連線數) => 這一步「為什麼選它」的說明句
function simulate({ algorithm, rule, code, pickLabel, showCounts, pickNode, explain }) {
  const held = Object.fromEntries(nodes.map((n) => [n, []]));
  const base = { algorithm, rule, code, pickLabel, showCounts };
  let peak = 0;
  const intro = { ...base, chosen: null, explain: '', held: snapshot(held) }; // 要在跑任何請求之前先拍下空的初始狀態

  const rounds = requests.map((req, i) => {
    const tick = i + 1;
    // 先讓連線持續時間到期的請求釋放連線，再決定新請求分配給誰
    const released = [];
    nodes.forEach((n) => {
      held[n] = held[n].filter((c) => {
        if (tick - c.tick < c.holdSteps) return true;
        released.push(c.id);
        return false;
      });
    });

    const before = countsOf(held); // 分配前的連線數，說明「為什麼選這個節點」要用這份，不能用分配後的
    const chosen = pickNode(i, before);
    const decide = { ...base, chosen, explain: explain(chosen, before), held: snapshot(held) };

    held[chosen].push({ id: req.id, tick, holdSteps: req.holdSteps });
    peak = Math.max(peak, ...Object.values(countsOf(held)));
    const dispatch = { ...decide, held: snapshot(held) };

    return { chosen, released, decide, dispatch, countAfter: before[chosen] + 1 };
  });

  return { intro, rounds, peak };
}

const roundRobin = simulate({
  algorithm: 'Round Robin',
  rule: '照固定順序輪流分配，不看誰比較忙。',
  code: 's = servers[i]\ni = (i + 1) % N',
  pickLabel: '輪到它',
  showCounts: false, // Round Robin 的 Load Balancer 根本不看連線數，判斷面板就不該出現數字
  pickNode: (i) => nodes[i % nodes.length],
  explain: (chosen, before) => {
    const idle = nodes.find((n) => before[n] < before[chosen]);
    return idle
      ? `順序輪到 ${chosen}；它手上已有 ${before[chosen]} 條連線，${idle} 比它閒，但 Round Robin 不看這個。`
      : `順序輪到 ${chosen}。`;
  },
});

const leastConnections = simulate({
  algorithm: 'Least Connections',
  rule: '每次都給目前連線數最少的那一台。',
  code: 's = min(servers, by=conn)\ns.conn += 1',
  pickLabel: '最少',
  showCounts: true,
  pickNode: (i, before) => nodes.reduce((best, n) => (before[n] < before[best] ? n : best), nodes[0]),
  explain: (chosen, before) => {
    const tied = nodes.filter((n) => before[n] === before[chosen]);
    return tied.length > 1
      ? `${tied.join('、')} 一樣少，取排最前面的 ${chosen}。`
      : `${chosen} 的連線最少。`;
  },
});

// 伺服器要預留幾個連線位置：取兩種演算法中出現過的最大同時連線數
export const slotsPerServer = Math.max(roundRobin.peak, leastConnections.peak);

const RUN = '並排播放';

const runSteps = [{
  id: 'intro',
  chapter: RUN,
  caption: '同一批 8 個請求，左邊交給 Round Robin、右邊交給 Least Connections，兩邊同步處理。橘框是長連線，會佔住伺服器很久。',
  duration: DECIDE_MS,
  data: { kind: 'intro', request: null, queue: requestIds, panels: [roundRobin.intro, leastConnections.intro] },
}];

requests.forEach((req, i) => {
  const rr = roundRobin.rounds[i];
  const lc = leastConnections.rounds[i];
  const queue = requestIds.slice(i + 1);
  const releasedText = rr.released.length ? `${rr.released.map((id) => `#${id}`).join('、')} 已處理完，釋放連線。` : '';
  const verdict = rr.chosen === lc.chosen
    ? `兩邊都選 ${rr.chosen}。`
    : `兩邊選的不一樣：Round Robin 選 ${rr.chosen}，Least Connections 選 ${lc.chosen}。`;

  runSteps.push({
    id: `${req.id}-decide`,
    chapter: RUN,
    caption: `${releasedText}請求 #${req.id} 同時進到兩邊的 Load Balancer。${verdict}`,
    duration: DECIDE_MS,
    data: { kind: 'decide', request: req, queue, panels: [rr.decide, lc.decide] },
  });
  runSteps.push({
    id: `${req.id}-dispatch`,
    chapter: RUN,
    caption: `#${req.id} 送出。Round Robin 的 ${rr.chosen} 現在有 ${rr.countAfter} 條連線，Least Connections 的 ${lc.chosen} 有 ${lc.countAfter} 條。`,
    duration: DISPATCH_MS,
    data: { kind: 'dispatch', request: req, queue, panels: [rr.dispatch, lc.dispatch] },
  });
});

const compareStep = {
  id: 'compare',
  chapter: '對照',
  caption: `同一批請求，Round Robin 曾讓單台同時扛 ${roundRobin.peak} 條連線，Least Connections 最多只有 ${leastConnections.peak} 條。標示的列是兩者分配不同的請求。`,
  duration: DECIDE_MS,
  data: {
    kind: 'compare',
    rows: requests.map((req, i) => ({
      id: req.id,
      holdSteps: req.holdSteps,
      roundRobin: roundRobin.rounds[i].chosen,
      leastConnections: leastConnections.rounds[i].chosen,
    })),
    peaks: { roundRobin: roundRobin.peak, leastConnections: leastConnections.peak },
  },
};

export const steps = [...runSteps, compareStep];
