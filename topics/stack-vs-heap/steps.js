// Stack vs Heap 動畫：一段 main → handle → load/decode/unpack → free 的呼叫序列，
// 每一步直接給出當下完整的 stack（陣列，索引 0 是最先呼叫的 main）與 heap 快照。
// 敘事只有一條線、不重複，所以直接手刻每一步的快照，不建生成邏輯。

export const steps = [
  {
    id: 'call-main',
    caption: 'main() 開始執行，堆疊多了一層 main 的呼叫框。',
    duration: 1600,
    data: { stack: [{ name: 'main', locals: [] }], heap: [] },
  },
  {
    id: 'call-handle',
    caption: 'main 呼叫 handle(request)，堆疊再疊一層。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
      ],
      heap: [],
    },
  },
  {
    id: 'call-load',
    caption: 'handle 呼叫 load(request)。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
        { name: 'load', locals: [{ name: 'request', value: '88' }] },
      ],
      heap: [],
    },
  },
  {
    id: 'malloc-photo',
    caption: 'load 呼叫 malloc(4MB) 要一塊 heap 空間，photo 這個區域變數指向它。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }] },
        { name: 'load', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'return-load',
    caption: 'load 執行完畢，return——它那層堆疊框自己消失，但 photo 指向的 heap 區塊還在。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'call-decode',
    caption: 'handle 呼叫 decode(photo)。',
    duration: 1600,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'decode', locals: [{ name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [{ id: 'photo', label: 'photo', size: '4 MB', freed: false }],
    },
  },
  {
    id: 'malloc-rows',
    caption: 'decode 呼叫 malloc(2MB) 給 rows。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'decode', locals: [{ name: 'photo', value: '→ photo (heap)' }, { name: 'rows', value: '→ rows (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
      ],
    },
  },
  {
    id: 'malloc-pixels',
    caption: 'decode 再呼叫 malloc(4MB) 給 pixels。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        {
          name: 'decode',
          locals: [
            { name: 'photo', value: '→ photo (heap)' },
            { name: 'rows', value: '→ rows (heap)' },
            { name: 'pixels', value: '→ pixels (heap)' },
          ],
        },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-decode',
    caption: 'decode 執行完畢，它的堆疊框消失，但 rows、pixels 兩塊 heap 都還留著。',
    duration: 2000,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'call-unpack',
    caption: 'handle 呼叫 unpack(rows)，unpack 這層是全新的堆疊框，有自己的區域變數。',
    duration: 2200,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
        { name: 'unpack', locals: [{ name: 'width', value: '1920' }, { name: 'height', value: '1080' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-unpack',
    caption: 'unpack 執行完畢，堆疊框消失。',
    duration: 1800,
    data: {
      stack: [
        { name: 'main', locals: [] },
        { name: 'handle', locals: [{ name: 'request', value: '88' }, { name: 'photo', value: '→ photo (heap)' }] },
      ],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'return-handle',
    caption: 'handle 執行完畢，回到 main，順便把三個指標交回來。三塊 heap 空間沒有人主動釋放，繼續留著。',
    duration: 2200,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: false },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-photo',
    caption: 'main 呼叫 free(photo)，這塊 heap 才真正釋放。',
    duration: 2000,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: false },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-rows',
    caption: 'main 呼叫 free(rows)。',
    duration: 1800,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: false },
      ],
    },
  },
  {
    id: 'free-pixels',
    caption: 'main 呼叫 free(pixels)，三塊 heap 空間全部釋放完畢。',
    duration: 2000,
    data: {
      stack: [{
        name: 'main',
        locals: [
          { name: 'photo', value: '→ photo (heap)' },
          { name: 'rows', value: '→ rows (heap)' },
          { name: 'pixels', value: '→ pixels (heap)' },
        ],
      }],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: true },
      ],
    },
  },
  {
    id: 'return-main',
    caption: 'main 執行完畢：堆疊在呼叫結束時自動清空；heap 要靠你自己 free() 才會清空。',
    duration: 2600,
    data: {
      stack: [],
      heap: [
        { id: 'photo', label: 'photo', size: '4 MB', freed: true },
        { id: 'rows', label: 'rows', size: '2 MB', freed: true },
        { id: 'pixels', label: 'pixels', size: '4 MB', freed: true },
      ],
    },
  },
];
