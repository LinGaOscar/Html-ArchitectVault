import { renderStep } from './render-loop.js';

// 建立共用播放器：把控制列 UI 整個注入 mount 節點，並依 steps 陣列驅動 render()。
// steps: Array<{ id, caption, duration, data }>
// render: (step, stageElement) => void
// mount: HTMLElement，播放器 UI 會整個掛在這個節點底下
export function initPlayer({ steps, render, mount }) {
  mount.innerHTML = `
    <div class="player">
      <div class="stage" id="stage"></div>
      <p class="caption" id="caption"></p>
      <div class="transport">
        <button type="button" data-action="prev" aria-label="上一步">⏮</button>
        <button type="button" data-action="play-pause" aria-label="播放">▶</button>
        <button type="button" data-action="next" aria-label="下一步">⏭</button>
        <input type="range" class="scrubber" min="0" max="${steps.length - 1}" value="0" aria-label="時間軸">
      </div>
    </div>
  `;

  const stageEl = mount.querySelector('#stage');
  const captionEl = mount.querySelector('#caption');
  const playPauseBtn = mount.querySelector('[data-action="play-pause"]');
  const prevBtn = mount.querySelector('[data-action="prev"]');
  const nextBtn = mount.querySelector('[data-action="next"]');
  const scrubberEl = mount.querySelector('.scrubber');

  let currentIndex = 0;
  let playing = false;
  let timerId = null;

  function goTo(index) {
    currentIndex = Math.min(Math.max(index, 0), steps.length - 1);
    const step = steps[currentIndex];
    renderStep(step, stageEl, render);
    captionEl.textContent = step.caption;
    scrubberEl.value = String(currentIndex);
  }

  function pause() {
    playing = false;
    playPauseBtn.textContent = '▶';
    playPauseBtn.setAttribute('aria-label', '播放');
    clearTimeout(timerId);
  }

  function scheduleNext() {
    clearTimeout(timerId);
    const current = steps[currentIndex];
    timerId = setTimeout(() => {
      if (currentIndex >= steps.length - 1) {
        pause();
        return;
      }
      goTo(currentIndex + 1);
      scheduleNext();
    }, current.duration);
  }

  function play() {
    if (currentIndex >= steps.length - 1) return; // 已經在最後一步，沒有下一步可播
    playing = true;
    playPauseBtn.textContent = '⏸';
    playPauseBtn.setAttribute('aria-label', '暫停');
    scheduleNext();
  }

  playPauseBtn.addEventListener('click', () => {
    if (playing) pause();
    else play();
  });

  prevBtn.addEventListener('click', () => {
    pause();
    goTo(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    pause();
    goTo(currentIndex + 1);
  });

  scrubberEl.addEventListener('input', () => {
    pause();
    goTo(Number(scrubberEl.value));
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (playing) pause();
      else play();
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      pause();
      goTo(currentIndex - 1);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      pause();
      goTo(currentIndex + 1);
    }
  });

  goTo(0);
}
