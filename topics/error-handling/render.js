import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：同一條呼叫鏈在三種做法下各一個面板，錯誤停在哪幾層、跳過哪幾層同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { dep: '呼叫', net: '回覆使用者' },
    rings: { app: '最上層（入口）', core: '中間層', infra: '資料庫', ui: '使用者看到的畫面' },
  },
});
