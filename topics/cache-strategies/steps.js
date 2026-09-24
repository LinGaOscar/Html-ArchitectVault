// Cache 讀寫策略動畫：用同一個 key（user:42）分別示範
// Cache-Aside、Write-Through、Write-Back 三種策略下，Cache 與 DB 的狀態如何變化。
// 三段敘事彼此不同、不重複，直接手刻每一步。

export const steps = [
  // --- Cache-Aside ---
  {
    id: 'aside-1',
    caption: 'Cache-Aside：讀取 user:42，Cache 是空的，Cache Miss。',
    duration: 1800,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice' }, event: 'cache miss', highlight: 'cache' },
  },
  {
    id: 'aside-2',
    caption: 'Cache Miss 之後，應用程式自己去 DB 查詢，拿到 user:42 = "Alice"。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice' }, event: 'read from DB', highlight: 'db' },
  },
  {
    id: 'aside-3',
    caption: '應用程式把查到的值寫回 Cache，下次同樣的讀取就能命中。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice' }, event: 'fill cache', highlight: 'cache' },
  },
  {
    id: 'aside-4',
    caption: '再讀一次 user:42：這次 Cache Hit，不用查 DB。',
    duration: 1800,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice' }, event: 'cache hit', highlight: 'cache' },
  },
  {
    id: 'aside-5',
    caption: '寫入 user:42 = "Alice V2"：Cache-Aside 直接寫 DB，不碰 Cache。',
    duration: 2000,
    data: { strategy: 'Cache-Aside', cache: { value: 'Alice', dirty: false }, db: { value: 'Alice V2' }, event: 'write to DB', highlight: 'db' },
  },
  {
    id: 'aside-6',
    caption: '寫完 DB 後把 Cache 裡的舊值刪除（invalidate），避免下次讀到過期資料。',
    duration: 2200,
    data: { strategy: 'Cache-Aside', cache: null, db: { value: 'Alice V2' }, event: 'invalidate cache', highlight: 'cache' },
  },

  // --- Write-Through ---
  {
    id: 'through-1',
    caption: 'Write-Through：寫入 user:42 = "Bob"，Cache 與 DB 同一時間一起寫入。',
    duration: 2200,
    data: { strategy: 'Write-Through', cache: { value: 'Bob', dirty: false }, db: { value: 'Bob' }, event: 'write both', highlight: 'both' },
  },
  {
    id: 'through-2',
    caption: '讀取 user:42：Cache Hit，兩邊資料本來就一致。',
    duration: 1800,
    data: { strategy: 'Write-Through', cache: { value: 'Bob', dirty: false }, db: { value: 'Bob' }, event: 'cache hit', highlight: 'cache' },
  },

  // --- Write-Back ---
  {
    id: 'back-1',
    caption: 'Write-Back：寫入 user:42 = "Carol"，只先寫進 Cache，標記為 dirty（還沒同步到 DB）。',
    duration: 2200,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: true }, db: { value: 'Bob' }, event: 'write cache only', highlight: 'cache' },
  },
  {
    id: 'back-2',
    caption: '讀取 user:42：Cache Hit，拿到最新的 "Carol"，但這時候 DB 裡還是舊值 "Bob"。',
    duration: 2200,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: true }, db: { value: 'Bob' }, event: 'cache hit (DB stale)', highlight: 'cache' },
  },
  {
    id: 'back-3',
    caption: '背景排程觸發 flush：把 dirty 的資料寫回 DB，DB 更新為 "Carol"，Cache 標記回乾淨。',
    duration: 2400,
    data: { strategy: 'Write-Back', cache: { value: 'Carol', dirty: false }, db: { value: 'Carol' }, event: 'flush to DB', highlight: 'db' },
  },
];
