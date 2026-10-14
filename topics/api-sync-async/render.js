import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：三種寫法各一條時間軸、同步前進，誰在等、誰被卡住同一個時間點就能比
export const render = createTimelineRender({ systems, compare, maxLanes: 4, legend: ['block', 'work', 'net', 'abort', 'err'] });
