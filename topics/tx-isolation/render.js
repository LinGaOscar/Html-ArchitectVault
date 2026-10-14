import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：同樣兩筆交易在三種隔離等級下各一條時間軸，誰讀到什麼、誰被中止同一個時間點就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 4,
  legend: [
    { tone: 'read', label: '讀取為主的交易' },
    { tone: 'write', label: '會寫入的交易' },
    { tone: 'ok', label: '資料庫裡已提交的值' },
    { tone: 'err', label: '異常 / 提交失敗' },
  ],
});
