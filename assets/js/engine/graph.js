// 架構主題共用的依賴圖推導（純函式，不碰 window / document，steps.js 才能在 node 匯入檢查）。
// 架構比較的結論（要改幾個元件、測試要接哪些真實依賴）全部從依賴圖算出來，不手寫，
// 讀者看到的數字才保證跟畫面上的箭頭一致。
// edges: Array<{ from, to, kind }>；kind 為 'iface' 代表依賴的是介面（可替換），其餘都是具體依賴。

const sig = (edges, id) => edges.filter((e) => e.from === id).map((e) => `${e.to}:${e.kind}`).sort().join('|');

// 一次修改後要動到的「既有」元件：它往外的依賴有任何一條變了（目標換了、多了、少了），它的原始碼就得改。
// 新增的元件另外回傳，因為新寫一支和改既有的程式，風險不同。
export function diffNodes(before, after) {
  const added = after.nodes.filter((n) => !before.nodes.includes(n));
  const changed = after.nodes.filter((n) => before.nodes.includes(n) && sig(before.edges, n) !== sig(after.edges, n));
  return { added, changed };
}

// 從 start 出發，沿著指定種類的依賴一路走下去，回傳走得到的元件（不含 start）
export function reach(edges, start, kinds) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    edges.filter((e) => e.from === cur && kinds.includes(e.kind)).forEach((e) => {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    });
  }
  seen.delete(start);
  return [...seen];
}

// 測試 start 時：沿具體依賴走得到的元件都得真的存在；碰到介面依賴就可以換成假物件，不再往下走
export function testNeeds(edges, start) {
  const concrete = reach(edges, start, ['dep', 'call', 'net']);
  const mocks = edges.filter((e) => e.kind === 'iface' && (e.from === start || concrete.includes(e.from))).map((e) => e.to);
  return { concrete, mocks: [...new Set(mocks)] };
}
