// Stack vs Heap 動畫：一支 12 行的類 C 程式，逐行執行。
// 每一行拆兩拍：第一拍高亮該行並說明要做什麼，第二拍記憶體才發生變化，
// 讀者先看到「輸入」再看到「輸出」，中間的「處理」就是這一行造成的動作。
// 範例刻意安排三件事：return 時 frame 自動消失、heap 區塊活得比配置它的函式久、
// 最後有一塊 heap 在函式結束後沒人指著也沒 free（memory leak）。

export const codeLines = [
  'char *load() {',
  '  char *p = malloc(4MB);',
  '  return p;',
  '}',
  'void work(char *a) {',
  '  char *t = malloc(2MB);',
  '}',
  'int main() {',
  '  char *a = load();',
  '  work(a);',
  '  free(a);',
  '}',
];

// depth 決定 frame 疊在第幾層；load 與 work 都由 main 呼叫，所以同在第 1 層
export const frameDefs = [
  { id: 'main', depth: 0, vars: ['a'] },
  { id: 'load', depth: 1, vars: ['p'] },
  { id: 'work', depth: 1, vars: ['a', 't'] },
];

// 區塊在 heap 格子裡的位置（1 格 = 1 MB）；owner 是發出 malloc 的函式，區塊從它的 frame 旁飛出來
export const heapGrid = { cols: 4, rows: 3 };
export const blockDefs = [
  { id: 'A', owner: 'load', addr: '0x7f30', size: '4 MB', row: 1, col: 1, span: 4 },
  { id: 'T', owner: 'work', addr: '0x7f94', size: '2 MB', row: 2, col: 1, span: 2 },
];

// 指標連線：frame 裡的哪個變數，指向哪一塊 heap；frac 讓指向同一塊的連線落在不同高度，不會疊在一起
export const wireDefs = [
  { key: 'main.a', frame: 'main', name: 'a', block: 'A', frac: 0.3 },
  { key: 'load.p', frame: 'load', name: 'p', block: 'A', frac: 0.5 },
  { key: 'work.a', frame: 'work', name: 'a', block: 'A', frac: 0.7 },
  { key: 'work.t', frame: 'work', name: 't', block: 'T', frac: 0.5 },
];

const READ_MS = 2400; // 第一拍：讀一行字就夠
const ACT_MS = 2800; // 第二拍：要看 frame 或區塊移動，加上讀 caption

const st = {
  frames: { main: 'before', load: 'before', work: 'before' }, // before 還沒呼叫、live 在 stack 上、done 已 return
  locals: { 'main.a': null, 'load.p': null, 'work.a': null, 'work.t': null }, // null 代表宣告了但還沒有值
  alloc: { A: false, T: false },
  freed: { A: false, T: false },
  transit: null, // return 之後、存進變數之前，地址只存在回傳值裡
  cleaned: 0, // stack 累計自動清掉幾個區域變數
};

function snapshot() {
  const frames = { ...st.frames };
  const locals = { ...st.locals };
  // 連線只在「變數有值、它的 frame 還在、區塊還沒 free」時成立；frame 一消失連線就跟著消失
  const wireOn = Object.fromEntries(
    wireDefs.map((w) => [w.key, locals[w.key] !== null && frames[w.frame] === 'live' && st.alloc[w.block] && !st.freed[w.block]]),
  );
  const blocks = {};
  blockDefs.forEach((b) => {
    if (!st.alloc[b.id]) blocks[b.id] = 'idle';
    else if (st.freed[b.id]) blocks[b.id] = 'freed';
    else if (wireDefs.some((w) => w.block === b.id && wireOn[w.key])) blocks[b.id] = 'live';
    else if (st.transit === b.id) blocks[b.id] = 'transit';
    else blocks[b.id] = 'leak'; // 還在、沒被 free、沒有任何變數保有地址
  });
  const states = Object.values(blocks);
  return {
    frames,
    locals,
    wireOn,
    blocks,
    counts: {
      locals: Object.keys(locals).filter((k) => locals[k] !== null && frames[k.split('.')[0]] === 'live').length,
      blocks: states.filter((s) => s === 'live' || s === 'transit' || s === 'leak').length,
      cleaned: st.cleaned,
      freed: states.filter((s) => s === 'freed').length,
      leaked: states.filter((s) => s === 'leak').length,
    },
  };
}

export const steps = [];

function add(id, chapter, duration, caption, { line = null, beat, kind, label, text, touches = {}, apply }) {
  if (apply) apply();
  steps.push({
    id,
    chapter,
    caption,
    duration,
    data: { kind: 'run', beat, line, verdict: { kind, label, text }, touches, ...snapshot() },
  });
}

const push = (id) => () => { st.frames[id] = 'live'; };
const popFrame = (id) => () => {
  st.frames[id] = 'done';
  const def = frameDefs.find((f) => f.id === id);
  st.cleaned += def.vars.filter((v) => st.locals[`${id}.${v}`] !== null).length;
};

// 一行程式 = 讀（高亮、判定要做什麼）＋ 做（記憶體變化）兩拍
function lineSteps({ id, chapter, line, kind, label, read, act, apply, touches }) {
  add(`${id}-read`, chapter, READ_MS, read.caption, { line, beat: 'read', kind, label, text: read.text });
  add(`${id}-act`, chapter, ACT_MS, act.caption, { line, beat: 'act', kind, label, text: act.text, touches, apply });
}

const C1 = '呼叫與配置';
const C2 = 'return 自動回收';
const C3 = '漏掉的 free';
const C4 = 'free 與結束';

add('start', C1, 4200, '畫面由上往下是輸入、處理、輸出。輸入是程式碼，目前執行的那一行會高亮。處理是這一行造成的動作。輸出是 stack 與 heap 兩塊記憶體，左右並排，各自有計數。', {
  beat: 'start',
  kind: 'none',
  label: '待命',
  text: '還沒有執行任何一行。',
});

lineSteps({
  id: 'enter-main',
  chapter: C1,
  line: 8,
  kind: 'call',
  label: '進入函式',
  read: {
    text: '程式從 main 開始，要先在 stack 為它建立 frame。',
    caption: '第 8 行，程式從 main 開始。每次進入函式，stack 都會為這次呼叫疊上一個新的 frame。',
  },
  act: {
    text: 'stack 疊上 main 的 frame，heap 沒有變化。',
    caption: 'stack 疊上 main 的 frame。frame 裡放這個函式的區域變數，a 目前還沒有值，所以顯示 ?。這一步只移動 stack 的頂端，heap 沒有任何變化。',
  },
  apply: push('main'),
  touches: { stack: true },
});

lineSteps({
  id: 'call-load',
  chapter: C1,
  line: 9,
  kind: 'call',
  label: '呼叫函式',
  read: {
    text: '呼叫 load()，回傳值要存進 a，所以先進入 load。',
    caption: '第 9 行，main 呼叫 load()，回傳值要存進 a。a 要等 load 回傳才有值，所以先進入 load。',
  },
  act: {
    text: 'stack 在 main 上再疊一層 load 的 frame。',
    caption: 'stack 在 main 上面再疊上 load 的 frame，裡面的 p 還沒有值。main 的 frame 仍在下面，a 仍然是 ?。',
  },
  apply: push('load'),
  touches: { stack: true },
});

lineSteps({
  id: 'malloc-a',
  chapter: C1,
  line: 2,
  kind: 'malloc',
  label: '配置記憶體',
  read: {
    text: 'malloc(4MB) 向 heap 要 4 MB，地址存進 p。',
    caption: '第 2 行，load 呼叫 malloc(4MB)，向 heap 要一塊 4MB 的空間，把地址存進 p。',
  },
  act: {
    text: '4 MB 區塊飛進 heap，p 指向它。',
    caption: 'heap 找到 4MB 的空位，區塊從 load 的 frame 旁飛進去，p 存下它的地址 0x7f30，連線從 p 指向區塊。heap 區塊 0 → 1，stack 區域變數 0 → 1。',
  },
  apply: () => {
    st.alloc.A = true;
    st.locals['load.p'] = '0x7f30';
  },
  touches: { stack: true, heap: true },
});

lineSteps({
  id: 'return-load',
  chapter: C2,
  line: 3,
  kind: 'return',
  label: 'return',
  read: {
    text: 'return p：把 p 裡的地址當回傳值交給 main。',
    caption: '第 3 行，load 執行 return p，把 p 裡的地址當作回傳值交給呼叫端 main。接著 load 就結束了。',
  },
  act: {
    text: 'load 的 frame 自動消失，heap 區塊還在。',
    caption: 'load 結束，它的 frame 整個消失，p 也跟著被自動清掉（stack 清掉 1 個值），過程中沒有任何清理的程式碼。heap 區塊沒有消失，此刻只有回傳值帶著它的地址，還沒有變數指著它。',
  },
  apply: () => {
    popFrame('load')();
    st.transit = 'A';
  },
  touches: { stack: true },
});

lineSteps({
  id: 'assign-a',
  chapter: C2,
  line: 9,
  kind: 'assign',
  label: '存進變數',
  read: {
    text: '回到第 9 行，把回傳值存進 main 的 a。',
    caption: '回到第 9 行。load() 已經回傳，回傳值要存進 main 的 a。',
  },
  act: {
    text: 'a 收到地址，改由 a 指向 4 MB 區塊。',
    caption: 'a 收到地址 0x7f30，連線改由 main 的 a 指向區塊。這塊 heap 空間是在 load 裡配置的，卻比 load 活得更久，因為它的壽命跟 frame 無關。',
  },
  apply: () => {
    st.locals['main.a'] = '0x7f30';
    st.transit = null;
  },
  touches: { stack: true },
});

lineSteps({
  id: 'call-work',
  chapter: C3,
  line: 10,
  kind: 'call',
  label: '呼叫函式',
  read: {
    text: '呼叫 work(a)，把 a 裡的地址複製一份傳進去。',
    caption: '第 10 行，main 呼叫 work(a)，把 a 裡的地址複製一份傳進 work。',
  },
  act: {
    text: 'stack 疊上 work 的 frame，兩個 a 指向同一塊。',
    caption: 'stack 疊上 work 的 frame，參數 a 是地址的副本，所以 main 的 a 與 work 的 a 兩條連線指向同一塊 heap 區塊。t 還沒有值。stack 區域變數 1 → 2。',
  },
  apply: () => {
    push('work')();
    st.locals['work.a'] = '0x7f30';
  },
  touches: { stack: true },
});

lineSteps({
  id: 'malloc-t',
  chapter: C3,
  line: 6,
  kind: 'malloc',
  label: '配置記憶體',
  read: {
    text: 'malloc(2MB) 要第二塊 heap，地址存進 t。',
    caption: '第 6 行，work 呼叫 malloc(2MB)，要第二塊 heap 空間，地址存進 t。',
  },
  act: {
    text: '2 MB 區塊飛進 heap，t 指向它。',
    caption: '第二塊 2MB 的區塊從 work 的 frame 旁飛進 heap，t 指向它。heap 區塊 1 → 2，stack 區域變數 2 → 3。',
  },
  apply: () => {
    st.alloc.T = true;
    st.locals['work.t'] = '0x7f94';
  },
  touches: { stack: true, heap: true },
});

lineSteps({
  id: 'return-work',
  chapter: C3,
  line: 7,
  kind: 'return',
  label: 'return',
  read: {
    text: 'work 結束，但沒有對 t 呼叫 free。',
    caption: '第 7 行，work 結束。注意 work 裡沒有對 t 呼叫 free，而 t 是唯一指著這塊 2MB 的變數。',
  },
  act: {
    text: 'frame 消失，2 MB 區塊沒人指著：leak。',
    caption: 'work 的 frame 消失，a 和 t 一起被自動清掉（累計清掉 3 個值）。4MB 區塊還有 main 的 a 指著。2MB 區塊沒有任何變數指著它，也沒被 free，之後再也沒辦法釋放，這就是 memory leak。',
  },
  apply: popFrame('work'),
  touches: { stack: true },
});

lineSteps({
  id: 'free-a',
  chapter: C4,
  line: 11,
  kind: 'free',
  label: '釋放記憶體',
  read: {
    text: 'free(a)：明確把 a 指向的區塊還給 heap。',
    caption: '第 11 行，main 呼叫 free(a)，明確要求把 a 指向的 4MB 區塊還給 heap。',
  },
  act: {
    text: '4 MB 區塊被釋放，連線消失。',
    caption: '4MB 區塊淡出，heap 區塊 2 → 1。stack 的清除是自動的，heap 只有寫了 free 才會釋放。a 還留著舊地址但已不能再用，所以連線消失。',
  },
  apply: () => {
    st.freed.A = true;
  },
  touches: { heap: true },
});

lineSteps({
  id: 'end-main',
  chapter: C4,
  line: 12,
  kind: 'return',
  label: '程式結束',
  read: {
    text: 'main 結束，整支程式即將跑完。',
    caption: '第 12 行，main 結束，整支程式即將跑完。',
  },
  act: {
    text: 'stack 全空；heap 剩下沒人指著的 2 MB。',
    caption: 'main 的 frame 消失，a 被自動清掉（累計清掉 4 個值），stack 全空。heap 只剩那塊沒人指著、也沒 free 的 2MB，標記為 leak。',
  },
  apply: popFrame('main'),
  touches: { stack: true },
});

const last = steps[steps.length - 1].data;

// 對照表「本例中」那一列用的數字，直接取自最後一個畫面，不另外手寫
export const summary = {
  cleaned: last.counts.cleaned,
  allocated: blockDefs.length,
  freed: last.counts.freed,
  leaked: last.counts.leaked,
  leakedSize: blockDefs.find((b) => last.blocks[b.id] === 'leak').size,
};

steps.push({
  id: 'compare',
  chapter: '對照',
  caption: `對照 stack 與 heap。這支程式 stack 自動清掉 ${summary.cleaned} 個區域變數，heap 配置了 ${summary.allocated} 塊，只有 ${summary.freed} 塊被 free，漏掉的 ${summary.leakedSize} 是 memory leak。`,
  duration: 6500,
  data: { kind: 'compare' },
});
