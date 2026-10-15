import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：箭頭代表「還有人指著這塊資料」，三種回收方式何時把資料收走同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { dep: '指向（還在用這塊資料）' },
    rings: { app: '程式正在用的地方（變數、名單）', core: '記憶體裡的一塊資料' },
  },
});
