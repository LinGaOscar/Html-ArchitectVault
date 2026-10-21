import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：同一支程式放在三種地方，等網路、等啟動、真正執行各花多久同一條時間軸就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 3,
  legend: [
    { tone: 'net', label: '網路來回' },
    { tone: 'wait', label: '啟動中（冷啟動）' },
    { tone: 'work', label: '執行程式' },
    { tone: 'err', label: '跑不了' },
    { tone: 'conn', label: '開著／計費中' },
    { tone: 'abort', label: '休眠' },
    { tone: 'job', label: '按次計費' },
    { tone: 'ok', label: '完成' },
  ],
});
