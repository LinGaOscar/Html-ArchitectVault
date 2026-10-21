import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：四種儲存各一個面板，同一件事交給誰做得到、誰做錯同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { dep: '讀寫資料', event: '同步到各地的副本' },
    rings: { app: '各地的 Worker', adapter: '各地機房裡的副本', core: '資料存放的地方' },
  },
});
