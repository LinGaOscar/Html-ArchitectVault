import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：三種模式各佔一個面板、同步前進，資料怎麼回到畫面同一拍就能比
export const render = createDiagramRender({ systems, compare });
