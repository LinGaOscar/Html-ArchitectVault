/* Clarity 滑鼠光暈：任何加上 .cl-lit 的元素，滑鼠經過時該處出現柔和光暈。
 * 用法：<script src="design-system/clarity/cursor-light.js" defer></script>
 * 觸控裝置、開啟「減少動態效果」時不作用。 */
(function () {
  if (window.__clarityLight) return;
  window.__clarityLight = true;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var x = null, y = null, raf = 0;
  function paint() {
    raf = 0;
    var els = document.querySelectorAll(".cl-lit");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (x === null) { el.style.setProperty("--lit", "0"); continue; }
      var r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (x - r.left).toFixed(0) + "px");
      el.style.setProperty("--my", (y - r.top).toFixed(0) + "px");
      el.style.setProperty("--lit", x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? "1" : "0");
    }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(paint); }
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    x = e.clientX; y = e.clientY; schedule();
  }, { passive: true });
  document.addEventListener("pointerleave", function () { x = null; schedule(); });
  window.addEventListener("scroll", schedule, { passive: true });
})();
