import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：箭頭代表「變數指著哪一份資料」，同一行 b = a 在三種語言裡指向哪裡同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { dep: '指著（存的是資料在哪裡）' },
    rings: { app: '變數', core: '訂單資料', infra: '訂單裡的品項清單' },
  },
});
