// 各主題舞台共用的動作：讓「同一個東西」在畫面上連續移動，而不是在新位置憑空出現。

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TRAIL = 2; // 拖尾分身數：多了會糊成一團，少了看不出方向

// 把絕對定位的元素移到 (x, y)。positions 是呼叫端持有的 Map，用來記住每個 key 上一次的位置。
// 沿一條微微拱起的弧線飛過去、落地時稍微過頭再回穩：
// 直線等速移動看起來像瞬移的殘影，有起伏和緩衝才像一個「東西」在移動。
// 飛行中加上發光與拖尾，落地時打出一圈衝擊波：讀者的視線會被拉到「從哪來、落到哪」。
export function flyTo(el, positions, key, x, y, animate = true) {
  const from = positions.get(key);
  positions.set(key, { x, y });
  el.style.transform = `translate(${x}px, ${y}px)`;
  if (!animate || reduceMotion || !from || (from.x === x && from.y === y)) return;

  const distance = Math.hypot(x - from.x, y - from.y);
  const bulge = Math.min(28, distance * 0.2);
  const tilt = x >= from.x ? 9 : -9;
  const frames = [
    { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg) scale(1)`, easing: 'cubic-bezier(.5, 0, .8, .6)' },
    { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg) scale(.88)`, offset: 0.08, easing: 'cubic-bezier(.5, 0, .8, .6)' },
    { transform: `translate(${(from.x + x) / 2 + bulge}px, ${(from.y + y) / 2}px) rotate(${tilt}deg) scale(1.18)`, easing: 'cubic-bezier(.2, .8, .3, 1.3)' },
    { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)` },
  ];
  const duration = Math.min(950, 420 + distance * 1.5);

  // 同一個元素連續被指派新目的地時，舊的飛行動畫要先停，否則兩段軌跡會疊在一起抖動
  el.getAnimations().forEach((a) => { if (a.id === 'fx-fly') a.cancel(); });
  const flight = el.animate(frames, { duration, id: 'fx-fly' });
  el.classList.add('fx-flying');
  flight.onfinish = () => {
    el.classList.remove('fx-flying');
    land(el, x, y);
  };
  flight.oncancel = () => el.classList.remove('fx-flying');

  for (let i = 1; i <= TRAIL; i++) {
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('data-id');
    ghost.classList.add('fx-ghost');
    ghost.classList.remove('fx-flying');
    ghost.setAttribute('aria-hidden', 'true');
    el.before(ghost); // 排在本體前面，疊放順序才會在本體底下
    const delay = i * 60;
    const trail = ghost.animate(frames, { duration, delay, fill: 'backwards' });
    ghost.animate([{ opacity: 0.5 / i }, { opacity: 0.35 / i, offset: 0.6 }, { opacity: 0 }], { duration: duration + delay, fill: 'forwards' });
    const cleanup = () => ghost.remove();
    trail.onfinish = cleanup;
    trail.oncancel = cleanup;
  }
}

// 落地：先壓扁再彈回（有重量感），同時從落點擴散一圈光環
function land(el, x, y) {
  const at = `translate(${x}px, ${y}px)`;
  el.animate(
    [
      { transform: `${at} scale(1.18, .82)` },
      { transform: `${at} scale(.94, 1.08)`, offset: 0.45 },
      { transform: `${at} scale(1)` },
    ],
    { duration: 320, easing: 'ease-out' },
  );
  ring(el.parentNode, x, y, el.offsetWidth, el.offsetHeight, el);
}

// 一圈往外擴散的光環。疊在 parent 上而不是放進元素裡，元素有 overflow: hidden 時才不會被切掉
function ring(parent, x, y, w, h, source) {
  if (!parent || !w || !h) return;
  const fx = document.createElement('span');
  fx.className = 'fx-ring';
  fx.setAttribute('aria-hidden', 'true');
  fx.style.width = `${w}px`;
  fx.style.height = `${h}px`;
  // 光環沿用來源元素的主題色（若有設定 --fx-c），歸屬色一致才知道是誰落地
  const c = getComputedStyle(source).getPropertyValue('--fx-c');
  if (c) fx.style.setProperty('--fx-c', c);
  parent.appendChild(fx);
  // 往外擴的距離固定幾個像素而不是按比例放大：寬的元素（結果列）按比例放大會撐出舞台、出現橫向捲軸
  const grow = 7;
  const sx = (w + grow * 2) / w;
  const sy = (h + grow * 2) / h;
  const a = fx.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 0.9 },
      { transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})`, opacity: 0 },
    ],
    { duration: 560, easing: 'cubic-bezier(.2, .7, .3, 1)' },
  );
  a.onfinish = () => fx.remove();
  a.oncancel = () => fx.remove();
}

// 數值改變時跳一下並發光，把視線帶到變動的地方
export function pop(el, animate = true) {
  if (!animate || reduceMotion) return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.6)', offset: 0.3 },
      { transform: 'scale(.92)', offset: 0.65 },
      { transform: 'scale(1)' },
    ],
    { duration: 560, easing: 'ease-out' },
  );
  // 重新觸發 CSS 發光動畫：先拿掉 class、強制重排、再加回去
  el.classList.remove('fx-pop');
  void el.offsetWidth;
  el.classList.add('fx-pop');
}
