import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：三種做法各一張時間軸，每個請求一條泳道，誰在排隊、誰被卡住同一個時間點就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 5,
  legend: [
    { tone: 'work', label: '計算（要用 CPU）' },
    { tone: 'net', label: '等資料庫（不用 CPU）' },
    { tone: 'block', label: '被別的請求卡住' },
    { tone: 'wait', label: '排隊等空的工人' },
    { tone: 'ok', label: '完成，花了多久' },
  ],
});
