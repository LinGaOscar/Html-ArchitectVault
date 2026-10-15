import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：兩個工人與共用的按讚數各一條泳道，誰讀到舊值、誰把誰蓋掉同一個時間點就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 4,
  legend: [
    { tone: 'click', label: '處理請求（不碰按讚數）' },
    { tone: 'read', label: '讀出按讚數' },
    { tone: 'job', label: '加一' },
    { tone: 'write', label: '寫回' },
    { tone: 'wait', label: '等鎖' },
    { tone: 'conn', label: '鎖在誰手上' },
    { tone: 'err', label: '被蓋掉的 +1' },
  ],
});
