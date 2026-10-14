// 建立共用播放器：把控制列 UI 整個注入 mount 節點，並依 steps 陣列驅動 render()。
// steps: Array<{ id, caption, duration, data, chapter? }>
// render: (step, stageElement, prevStep) => void
//   prevStep 是時間軸上的前一步（第一步時為 undefined），讓各主題能標出「這一步變了什麼」。
//   換步時播放器不對舞台做任何轉場（只在舞台外圍加章節橫幅、說明文字進場與倒數條）；要流暢的主題自己在 stage 裡保留常駐元素，每一步只更新狀態，
//   讓同一個東西連續地移動、變色，而不是整塊重畫。
// mount: HTMLElement，播放器 UI 會整個掛在這個節點底下
import { reduceMotion } from './motion.js';

export function initPlayer({ steps, render, mount }) {
  // 章節＝連續且 chapter 相同的一段步驟；沒標 chapter 的主題不顯示章節列
  const chapters = [];
  steps.forEach((step, index) => {
    if (step.chapter && (chapters.length === 0 || chapters[chapters.length - 1].name !== step.chapter)) {
      chapters.push({ name: step.chapter, index });
    }
  });
  const chaptersHtml = chapters.length
    ? `<div class="chapters">${chapters
        .map((c) => `<button type="button" data-chapter-index="${c.index}">${c.name}</button>`)
        .join('')}</div>`
    : '';

  mount.innerHTML = `
    <div class="player">
      ${chaptersHtml}
      <div class="stage-wrap">
        <div class="stage" id="stage"></div>
        <div class="chapter-banner" aria-hidden="true"></div>
      </div>
      <div class="player-head">
        <div class="caption-box">
          <p class="caption" id="caption" aria-live="polite"></p>
          <div class="step-progress" aria-hidden="true"><span></span></div>
        </div>
        <div class="transport">
          <button type="button" data-action="prev" aria-label="上一步">⏮</button>
          <button type="button" data-action="play-pause" aria-label="播放">▶</button>
          <button type="button" data-action="next" aria-label="下一步">⏭</button>
          <input type="range" class="scrubber" min="0" max="${steps.length - 1}" value="0" aria-label="時間軸">
          <span class="step-counter"></span>
        </div>
      </div>
    </div>
  `;

  const stageEl = mount.querySelector('#stage');
  const captionEl = mount.querySelector('#caption');
  const playPauseBtn = mount.querySelector('[data-action="play-pause"]');
  const prevBtn = mount.querySelector('[data-action="prev"]');
  const nextBtn = mount.querySelector('[data-action="next"]');
  const scrubberEl = mount.querySelector('.scrubber');
  const counterEl = mount.querySelector('.step-counter');
  const bannerEl = mount.querySelector('.chapter-banner');
  const progressEl = mount.querySelector('.step-progress span');
  let progressAnim = null;
  const chapterBtns = Array.from(mount.querySelectorAll('[data-chapter-index]'));

  let currentIndex = 0;
  let playing = false;
  let timerId = null;

  function goTo(index) {
    currentIndex = Math.min(Math.max(index, 0), steps.length - 1);
    const step = steps[currentIndex];
    const prevChapter = captionEl.dataset.chapter;
    render(step, stageEl, steps[currentIndex - 1]);
    if (captionEl.textContent !== step.caption) {
      captionEl.textContent = step.caption;
      // 說明文字從下方滑入：每一步換句話時，讀者才注意到「現在講到下一件事了」
      if (!reduceMotion) {
        captionEl.animate(
          [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
          { duration: 380, easing: 'cubic-bezier(.2, .8, .3, 1)' },
        );
      }
    }
    captionEl.dataset.chapter = step.chapter || '';
    if (step.chapter && step.chapter !== prevChapter) showBanner(step.chapter);
    scrubberEl.value = String(currentIndex);
    counterEl.textContent = `${currentIndex + 1} / ${steps.length}`;
    chapterBtns.forEach((btn) => {
      if (btn.textContent === step.chapter) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  // 進入新章節時在舞台中央打出章節名稱：段落切換得夠醒目，讀者才跟得上整段教學的結構
  function showBanner(name) {
    if (reduceMotion) return;
    bannerEl.textContent = name;
    bannerEl.getAnimations().forEach((a) => a.cancel());
    bannerEl.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 0) scale(.6)', letterSpacing: '.5em' },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1.06)', letterSpacing: '.12em', offset: 0.25 },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1)', letterSpacing: '.08em', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, -12px) scale(.96)', letterSpacing: '.08em' },
      ],
      { duration: 1500, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    );
  }

  // 自動播放時，說明下方的細條會在這一步的停留時間內填滿：讀者知道下一步什麼時候來
  function runProgress(duration) {
    if (progressAnim) progressAnim.cancel();
    progressAnim = progressEl.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, fill: 'forwards' });
  }

  function pause() {
    if (progressAnim) progressAnim.cancel();
    playing = false;
    playPauseBtn.textContent = '▶';
    playPauseBtn.setAttribute('aria-label', '播放');
    clearTimeout(timerId);
  }

  function scheduleNext() {
    clearTimeout(timerId);
    const current = steps[currentIndex];
    runProgress(current.duration);
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
    if (currentIndex >= steps.length - 1) goTo(0); // 自動播放會停在最後一步，這時按播放代表想重看一次
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

  chapterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      pause();
      goTo(Number(btn.dataset.chapterIndex));
    });
  });

  document.addEventListener('keydown', (event) => {
    const isPlayerControl = mount.contains(event.target);
    if (event.code === 'Space') {
      if (isPlayerControl) return; // 焦點在播放器自己的控制項上時交給瀏覽器原生行為（按鈕的 click、scrubber 的預設行為），避免我們的邏輯又觸發一次造成雙重切換互相抵銷
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
  play(); // 進頁面就開始播：讀者是來看動畫的，不該先找播放鍵
}
