import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：三種分層方式各佔一個面板、同步前進，箭頭方向的差異同一拍就能比
export const render = createDiagramRender({ systems, compare });
