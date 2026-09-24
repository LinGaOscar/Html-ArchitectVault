function renderBox(title, content, isHighlighted) {
  return `<div class="mem-frame ${isHighlighted ? 'mem-frame-active' : ''}">
    <strong>${title}</strong>
    ${content}
  </div>`;
}

export function render(step, stage) {
  const { strategy, cache, db, event, highlight } = step.data;

  const cacheContent = cache
    ? `<div class="mem-row"><span>user:42</span><span>${cache.value}${cache.dirty ? ' (dirty)' : ''}</span></div>`
    : '<p style="opacity:.6; margin:0;">（空，Cache Miss）</p>';

  const dbContent = `<div class="mem-row"><span>user:42</span><span>${db.value}</span></div>`;

  stage.innerHTML = `
    <h3 style="margin-top:0">${strategy}</h3>
    <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
      ${renderBox('CACHE', cacheContent, highlight === 'cache' || highlight === 'both')}
      ${renderBox('DATABASE', dbContent, highlight === 'db' || highlight === 'both')}
    </div>
    <p style="margin-top:1rem; opacity:.75; font-family: var(--bs-font-sans-serif);">事件：${event}</p>
  `;
}
