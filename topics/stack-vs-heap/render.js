function renderStackFrame(frame, isTop) {
  const locals = frame.locals
    .map((l) => `<div class="mem-row"><span>${l.name}</span><span>${l.value}</span></div>`)
    .join('');
  return `<div class="mem-frame ${isTop ? 'mem-frame-active' : ''}">
    <strong>${frame.name}()</strong>
    ${locals || '<div class="mem-row"><span style="opacity:.6">（無區域變數）</span></div>'}
  </div>`;
}

function renderHeapBlock(block) {
  const style = block.freed ? 'opacity:.35; text-decoration: line-through;' : '';
  return `<span class="mem-heap-block" style="${style}">${block.label} (${block.size})${block.freed ? ' freed' : ''}</span>`;
}

export function render(step, stage) {
  const { stack, heap } = step.data;
  const framesTopFirst = stack.slice().reverse();
  stage.innerHTML = `
    <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">
        <h3 style="margin-top:0">THE STACK（呼叫結束就自動清空）</h3>
        ${framesTopFirst.length ? framesTopFirst.map((f, i) => renderStackFrame(f, i === 0)).join('') : '<p style="opacity:.6">（空）</p>'}
      </div>
      <div style="flex:1; min-width:220px;">
        <h3 style="margin-top:0">THE HEAP（要 free() 才清空）</h3>
        ${heap.length ? heap.map(renderHeapBlock).join('') : '<p style="opacity:.6">（空）</p>'}
      </div>
    </div>
  `;
}
