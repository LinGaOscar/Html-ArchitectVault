import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：三種讀寫方式各佔一個面板、同步前進，讀取端晚一步的那一拍才看得出來
export const render = createDiagramRender({ systems, compare });
