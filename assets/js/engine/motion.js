// 各主題舞台共用的動作：讓「同一個東西」在畫面上連續移動，而不是在新位置憑空出現。

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 把絕對定位的元素移到 (x, y)。positions 是呼叫端持有的 Map，用來記住每個 key 上一次的位置。
// 沿一條微微拱起的弧線飛過去、落地時稍微過頭再回穩：
// 直線等速移動看起來像瞬移的殘影，有起伏和緩衝才像一個「東西」在移動。
export function flyTo(el, positions, key, x, y, animate = true) {
  const from = positions.get(key);
  positions.set(key, { x, y });
  el.style.transform = `translate(${x}px, ${y}px)`;
  if (!animate || reduceMotion || !from || (from.x === x && from.y === y)) return;

  const distance = Math.hypot(x - from.x, y - from.y);
  const bulge = Math.min(22, distance * 0.16);
  const tilt = x >= from.x ? 7 : -7;
  el.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg) scale(1)`, easing: 'cubic-bezier(.5, 0, .8, .6)' },
      { transform: `translate(${(from.x + x) / 2 + bulge}px, ${(from.y + y) / 2}px) rotate(${tilt}deg) scale(1.12)`, easing: 'cubic-bezier(.2, .8, .3, 1.25)' },
      { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)` },
    ],
    { duration: Math.min(900, 380 + distance * 1.5) },
  );
}

// 數值改變時跳一下，把視線帶到變動的地方
export function pop(el, animate = true) {
  if (!animate || reduceMotion) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
}
