import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：三種複寫方式各一條時間軸，誰在等確認、資料何時到另一台同一個時間點就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 4,
  legend: [
    { tone: 'write', label: '寫入 / 已生效的值' },
    { tone: 'wait', label: '等待從庫確認或跨區傳輸' },
    { tone: 'repl', label: '複寫到另一台' },
    { tone: 'read', label: '讀取' },
    { tone: 'ok', label: '已提交的舊值' },
    { tone: 'err', label: '故障 / 失敗' },
  ],
});
