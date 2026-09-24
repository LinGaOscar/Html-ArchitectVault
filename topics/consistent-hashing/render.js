const RADIUS = 120;
const CENTER = 140;

function pointOnCircle(pos) {
  const angle = (pos / 360) * 2 * Math.PI - Math.PI / 2; // 0 度對應正上方
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

export function render(step, stage) {
  const { nodes, keys, movedKeyIds } = step.data;

  const nodeMarks = nodes
    .map((n) => {
      const { x, y } = pointOnCircle(n.pos);
      return `
        <circle cx="${x}" cy="${y}" r="10" fill="var(--bs-primary)" />
        <text x="${x}" y="${y - 16}" text-anchor="middle" fill="var(--bs-body-color)" font-size="12">${n.id}</text>
      `;
    })
    .join('');

  const keyMarks = keys
    .map((k) => {
      const { x, y } = pointOnCircle(k.pos);
      const moved = movedKeyIds.includes(k.id);
      return `
        <circle cx="${x}" cy="${y}" r="5" fill="${moved ? 'var(--bs-warning)' : 'var(--bs-info)'}" />
        <text x="${x}" y="${y + 16}" text-anchor="middle" fill="var(--bs-secondary-color)" font-size="10">${k.id}→${k.owner}</text>
      `;
    })
    .join('');

  stage.innerHTML = `
    <svg viewBox="0 0 280 280" width="280" height="280" style="display:block; margin:0 auto;">
      <circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke="var(--bs-border-color)" stroke-width="2" />
      ${nodeMarks}
      ${keyMarks}
    </svg>
    <p style="text-align:center; font-family: var(--bs-font-sans-serif); color: var(--bs-secondary-color);">
      ${movedKeyIds.length > 0 ? `這次變動只影響：${movedKeyIds.join(', ')}` : '目前沒有 key 換過負責節點'}
    </p>
  `;
}
