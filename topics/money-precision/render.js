import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：同一筆帳從輸入流到帳上再拿去對帳，三種存法哪一步出錯同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { dep: '金額流向', iface: '對帳比對' },
    rings: { app: '輸入', core: '程式計算', infra: '存進帳上', test: '正確答案' },
  },
});
