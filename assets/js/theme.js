// 深淺色主題：放在 <head> 用一般 script 同步載入（不是 module），在第一次繪製前就套好顏色，
// 才不會先閃一下深色再變淺色。選擇記在 localStorage；沒選過就跟著作業系統的設定。
(function () {
  var KEY = 'architectvault-scheme';
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: light)');

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(scheme) {
    root.dataset.scheme = scheme;
    var btn = document.querySelector('.theme-switch');
    if (btn) {
      var light = scheme === 'light';
      btn.setAttribute('aria-checked', String(light));
      btn.querySelector('.theme-knob').textContent = light ? '☀' : '☾';
      btn.querySelector('.theme-label').textContent = light ? '淺色' : '深色';
    }
  }

  apply(saved() || (media.matches ? 'light' : 'dark'));
  media.addEventListener('change', function (e) {
    if (!saved()) apply(e.matches ? 'light' : 'dark');
  });

  document.addEventListener('DOMContentLoaded', function () {
    var host = document.querySelector('main');
    if (!host) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', '切換淺色主題');
    btn.innerHTML = '<span class="theme-track"><span class="theme-knob"></span></span><span class="theme-label"></span>';
    host.prepend(btn);
    apply(root.dataset.scheme);
    btn.addEventListener('click', function () {
      var next = root.dataset.scheme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (e) { /* 無痕模式存不了，就只切這一頁 */ }
      root.classList.add('theme-fade');
      apply(next);
      setTimeout(function () { root.classList.remove('theme-fade'); }, 400);
    });
  });
})();
