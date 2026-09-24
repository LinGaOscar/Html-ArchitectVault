// 用瀏覽器原生 View Transitions API 讓換畫面時有補間效果；
// 不支援的瀏覽器（沒有 startViewTransition）就直接切換，不影響功能正確性。
export function renderStep(step, stage, render) {
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => render(step, stage));
  } else {
    render(step, stage);
  }
}
