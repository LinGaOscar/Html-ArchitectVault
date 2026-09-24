import { nodes } from './steps.js';

function countByNode(assigned) {
  const counts = Object.fromEntries(nodes.map((n) => [n, 0]));
  assigned.forEach((a) => { counts[a.node] += 1; });
  return counts;
}

export function render(step, stage) {
  const { algorithm, assigned, activeCounts } = step.data;
  const totalCounts = countByNode(assigned);
  const last = assigned[assigned.length - 1];

  const nodesHtml = nodes
    .map((n) => {
      const isTarget = last && last.node === n;
      const label = activeCounts ? `目前連線 ${activeCounts[n]}` : `累計分配 ${totalCounts[n]}`;
      return `<div class="node ${isTarget ? 'node-active' : ''}">
        <div>
          <div>${n}</div>
          <div style="font-size:.75rem; opacity:.75;">${label}</div>
        </div>
      </div>`;
    })
    .join('');

  const logHtml = assigned
    .slice(-6)
    .map((a) => `<div class="mem-row"><span>請求 #${a.requestId}</span><span>→ ${a.node}</span></div>`)
    .join('');

  stage.innerHTML = `
    <h3 style="margin-top:0">${algorithm}</h3>
    <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">${nodesHtml}</div>
    <div class="mem-frame">
      <strong>最近分配紀錄</strong>
      ${logHtml}
    </div>
  `;
}
