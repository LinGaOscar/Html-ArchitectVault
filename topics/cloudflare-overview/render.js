import { createDiagramRender } from '../../assets/js/engine/diagram.js';
import { systems, compare } from './steps.js';

// 畫法在共用的 diagram.js：三個面板是同一個網站的同一張服務圖，三種請求各走哪條路同一拍就能比
export const render = createDiagramRender({
  systems,
  compare,
  labels: {
    kinds: { net: '網路請求', dep: '讀寫資料', event: '丟進佇列／取出工作' },
    rings: { test: '使用者', infra: 'Cloudflare 網路', app: '跑程式的服務', core: '存資料的服務', adapter: '訊息佇列' },
  },
});
