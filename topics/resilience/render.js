import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：三種處理方式各一條時間軸，下游被打得多兇、何時恢復同一個時間點就能比
export const render = createTimelineRender({
  systems,
  compare,
  maxLanes: 5,
  legend: [
    { tone: 'ok', label: '正常 / 成功' },
    { tone: 'err', label: '故障 / 失敗 / 超過容量' },
    { tone: 'block', label: '過載崩潰（重試風暴）' },
    { tone: 'conn', label: '負載偏高' },
    { tone: 'abort', label: '熔斷器擋下（快速失敗）' },
    { tone: 'wait', label: '熔斷器半開試探' },
  ],
});
