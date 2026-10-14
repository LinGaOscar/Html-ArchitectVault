// 全站術語小卡：讀者大多不是工程師，術語第一次出現時加上虛線底線，滑鼠移上去或手指點一下就看得到白話解釋。
// 定義集中在這裡，同一個詞在每個主題的解釋都一樣；新增術語只要加一行。
// 同一個概念有好幾種寫法時（中英文、單複數），用 ALIAS 指到同一條定義。

export const TERMS = {
  // ---- 網路與服務 ----
  'API': '程式之間溝通的窗口。前端想要資料，就照約定的格式向後端的 API 發出請求。',
  'HTTP': '網頁和伺服器之間溝通的標準規則。瀏覽器開網頁、呼叫 API 都是發 HTTP 請求。',
  '伺服器': '一直開著、等別人來要資料或交辦工作的電腦或程式。',
  '前端': '使用者眼前看到、操作的那一層，例如網頁畫面。',
  '後端': '在伺服器上運作、使用者看不到的那一層，負責處理資料與規則。',
  '請求': '一方向另一方提出「我要某個資料」或「幫我做某件事」的訊息。',
  '連線': '兩台電腦之間建立好、可以互傳資料的通道。建立和維持連線都要耗資源。',
  '逾時': '等太久還沒收到回應，就當作失敗放棄。',
  '閘道': '所有請求進出都要經過的關口，常負責轉送、驗證和限制等待時間。',
  'Load Balancer': '負載平衡器。站在多台伺服器前面的「分配員」，把進來的請求分給其中一台。',
  '負載': '一台機器目前手上有多少工作要做。',
  '節點': '分散式系統裡的一台機器（或一個程式），大家一起分擔工作。',
  '延遲': '從送出到收到回應之間等待的時間。',
  '容量': '一台機器同一時間最多能處理多少工作，超過就會變慢或失敗。',

  // ---- 程式執行 ----
  '主執行緒': '瀏覽器裡負責跑程式、畫畫面、處理點擊的那一個「工人」。它被卡住，整個畫面就凍住。',
  '同步': '做一件事時停下來等它完成，才做下一件。',
  '非同步': '交代出去就先去做別的事，等結果回來再處理。',
  'await': 'JavaScript 的寫法：「在這裡等這個結果回來再往下」，等待期間主執行緒可以去做別的事。',
  'Promise': 'JavaScript 裡代表「之後才會有結果」的東西，像一張取餐號碼牌。',
  'fetch': '瀏覽器內建、用來發出網路請求的指令，不會卡住畫面。',
  'race condition': '競態條件：好幾件事同時進行，結果取決於誰先完成，順序一亂結果就錯。',
  '函式': '一段有名字、可以重複呼叫的程式，像一個小工具。',
  'Stack': '堆疊。函式呼叫時自動配置、結束時自動清掉的記憶體，像一疊盤子，最後放上去的最先拿走。',
  'Heap': '堆積。程式主動申請、要自己歸還的記憶體，可以活得比建立它的函式久。',
  'frame': '每次呼叫函式時，在 Stack 上疊的一層，放這次呼叫用到的變數。',
  'malloc': 'C 語言向系統「借一塊記憶體」的指令，借來的放在 Heap。',
  'free': 'C 語言把借來的記憶體「還回去」的指令。',
  '指標': '記錄「某塊資料放在記憶體哪個位置」的變數，像一張寫著地址的紙條。',
  'memory leak': '記憶體洩漏：借來的記憶體沒還，又沒有任何人記得它在哪，永遠回收不了。',
  '區域變數': '只在某個函式裡面使用的變數，函式結束就消失。',

  // ---- 資料 ----
  '資料庫': '專門存放、查詢資料的系統，像一個有索引的大型檔案櫃。',
  '資料表': '資料庫裡的一張表格，每一列是一筆資料，每一欄是一種欄位。',
  'SQL': '向資料庫查資料、改資料用的語言。',
  'JOIN': '把兩張資料表依某個欄位對起來，合成一張結果表。',
  'NULL': '「這格沒有值」的意思，不是 0，也不是空字串。',
  '交易': '一組要嘛全部成功、要嘛全部取消的資料庫操作，例如轉帳的扣款與入帳。',
  '提交': '交易做完、正式寫進資料庫，別人從此看得到。',
  '快照': '在某個時間點把資料「拍照存證」，之後讀的都是那張照片。',
  '隔離等級': '資料庫讓同時進行的交易彼此「看得到多少對方的變更」的設定。',
  '快取': '把常用的資料先放在拿得快的地方（記憶體），不用每次都去慢的資料庫拿。',
  '命中': '要的資料剛好在快取裡，直接拿到。',
  '回源': '快取裡沒有，只好回到原本的資料庫去拿。',
  '主庫': '負責接受寫入的那台資料庫，資料以它為準。',
  '從庫': '從主庫複製資料過來的備份資料庫，通常拿來分擔讀取。',
  '複寫': '把一台資料庫的變更，複製到另一台資料庫。',
  'key': '資料的鍵、名字或編號，用它來找到對應的資料。',
  'hash': '雜湊。把任何資料算成一個固定範圍數字的方法，同樣的輸入永遠算出同樣的數字。',
  '最終一致': '資料改了之後，各處不會馬上一致，但只要稍等一下，最後都會變成一樣。',
  '正規化': '把資料拆成多張表、每件事只存一份，避免同一份資料在好幾個地方不一致。',

  // ---- 訊息與事件 ----
  '佇列': '排隊的地方。訊息照順序排進去，再一則一則交給處理的人。',
  'broker': '訊息中介。負責收下訊息、保管、再轉交出去的服務，像郵局。',
  'producer': '生產者：送出訊息的一方。',
  'consumer': '消費者：接收並處理訊息的一方。',
  'ack': '確認回條。處理完訊息後回報「我收到也處理好了」。',
  'offset': '讀到第幾筆的位置記號，像書籤。',
  'partition': '分區。把一條訊息流切成好幾段，讓多個消費者可以同時讀。',
  'exchange': 'RabbitMQ 裡負責「這則訊息該放進哪個佇列」的分信員。',
  '事件': '「發生了某件事」的紀錄，例如「訂單已建立」。',
  '輪詢': '每隔一段時間主動去問一次「好了沒」。',
  '推播': '事情發生時由伺服器主動通知，不用一直問。',
  'WebSocket': '瀏覽器與伺服器之間一條一直開著的雙向連線，伺服器可以隨時主動送訊息。',
  'SSE': 'Server-Sent Events。伺服器透過一條開著的連線，單向持續送訊息給瀏覽器。',

  // ---- 架構 ----
  '依賴': 'A 依賴 B：A 的程式碼裡直接用到 B，B 一改，A 可能就要跟著改。',
  'import': '程式碼開頭寫的「我要用到某個模組」，代表依賴它。',
  '介面': '只約定「要提供哪些功能」、不寫實際做法的規格，像插座的規格，任何符合的插頭都能插。',
  '業務邏輯': '這個系統真正的規則，例如「庫存不足不能下單」，跟用什麼資料庫、什麼畫面無關。',
  '單元測試': '用程式自動檢查某一小段程式是不是照預期運作。',
  '假物件': '測試時用來代替真資料庫、真畫面的替身，讓測試又快又穩。',
  '模組': '程式裡負責一塊功能的一組程式碼，例如「訂單模組」。',
  '部署': '把寫好的程式放到伺服器上、讓使用者能用。',
  '部署單元': '一起打包、一起上線、一起啟動的一整包程式。',
  '微服務': '把一個系統拆成很多個小服務，每個獨立部署、透過網路互相呼叫。',
  'Saga': '跨好幾個服務的長流程交易：一步一步做，失敗時逐一執行「補償動作」把前面做的撤回。',
  '資料綁定': '畫面元件和資料自動同步的機制：資料一改，畫面自動跟著變。',
  '重試': '失敗後再試一次。',
  '退避': '每次失敗後等更久才重試，給對方喘息的時間。',
  'jitter': '在等待時間裡加一點隨機，讓大家不要在同一瞬間一起重試。',
  '熔斷器': '像電路的保險絲：失敗太多就先斷開，暫時不打過去，過一陣子再試探。',
  '冪等': '同一個請求做一次和做好幾次，結果都一樣（例如重送付款不會扣兩次）。',
};

// 同一個概念的其他寫法
const ALIAS = {
  'Load Balancer': ['負載平衡器'],
  'Stack': ['stack'],
  'Heap': ['heap'],
  'memory leak': ['記憶體洩漏', 'leak'],
  'hash': ['雜湊'],
  '佇列': ['queue'],
  'consumer': ['消費者'],
  'producer': ['生產者'],
  'partition': ['分區'],
  '輪詢': ['polling'],
  '熔斷器': ['Circuit Breaker'],
  'race condition': ['競態條件'],
  '快取': ['cache', 'Cache'],
  '主庫': ['主資料庫'],
  '從庫': ['從資料庫'],
  '最終一致': ['最終一致性'],
};

const lookup = new Map();
Object.entries(TERMS).forEach(([term, def]) => {
  lookup.set(term, { term, def });
  (ALIAS[term] || []).forEach((a) => lookup.set(a, { term, def }));
});

// 長的詞先比對：「主執行緒」要比「執行緒」優先；英文要整個字相符（連字號也算字的一部分），
// 避免在單字中間或 Cache-Aside 這種複合名稱裡誤判
const words = [...lookup.keys()].sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(words.map((w) => (/^[A-Za-z]/.test(w) ? `(?<![A-Za-z-])${escape(w)}(?![A-Za-z-])` : escape(w))).join('|'), 'g');

const SKIP = 'a, code, pre, h1, h2, h3, h4, dt, button, .term, .lesson-why > b, .stage';

// 把容器裡每個術語「第一次出現」的地方換成可點的小卡。seen 讓同一頁的多個區塊共用「已經解釋過」的紀錄
export function annotate(root, seen = new Set()) {
  if (!root) return seen;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const text = node.nodeValue;
    let last = 0;
    let changed = false;
    const frag = document.createDocumentFragment();
    text.replace(pattern, (match, offset) => {
      const entry = lookup.get(match);
      if (!entry || seen.has(entry.term)) return match;
      seen.add(entry.term);
      frag.append(text.slice(last, offset));
      const el = document.createElement('span');
      el.className = 'term';
      el.tabIndex = 0;
      el.dataset.def = entry.def;
      el.dataset.term = entry.term;
      el.textContent = match;
      frag.append(el);
      last = offset + match.length;
      changed = true;
      return match;
    });
    if (!changed) return;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  });
  return seen;
}

// 小卡本體：整頁共用一個浮動框，貼在術語下方，左右不超出畫面
let pop = null;
function show(el) {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'term-pop';
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
  }
  pop.innerHTML = '';
  const title = document.createElement('b');
  title.textContent = el.dataset.term;
  pop.append(title, document.createTextNode(el.dataset.def));
  pop.hidden = false;
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY}px`;
}
function hide() {
  if (pop) pop.hidden = true;
}

let wired = false;
export function wireTooltips() {
  if (wired) return;
  wired = true;
  document.addEventListener('pointerover', (e) => { const t = e.target.closest?.('.term'); if (t) show(t); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest?.('.term')) hide(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('.term'); if (t) show(t); else hide(); });
  // 手機沒有滑鼠移上去，點一下術語就顯示，點別的地方就收起
  document.addEventListener('click', (e) => { const t = e.target.closest?.('.term'); if (t) show(t); else hide(); });
  window.addEventListener('scroll', hide, { passive: true });
}
