import { createTimelineRender } from '../../assets/js/engine/timeline.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 timeline.js：三種溝通方式各一條時間軸、同步前進，連線佔多久、多晚知道結果同一個時間點就能比
export const render = createTimelineRender({ systems, compare, maxLanes: 3, legend: ['net', 'conn', 'job', 'work', 'err'] });
