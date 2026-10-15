// 金額計算動畫：同樣三筆帳，用三種方式存金額，三個面板同步前進。
// 1. 浮點數（float、double、JavaScript 的 number）：電腦用二進位存小數，0.1 這種數字存不精確，誤差會累積。
// 2. 整數存「分」：把金額換成最小單位的整數（$1.00 存成 100），加減乘完全精確，除法的餘數也看得見。
// 3. Decimal 型別：用十進位存小數，算起來跟手算一樣，四捨五入規則可以指定。
// 三個情境：十筆 $0.10 加總、$4.30 加 5% 稅後四捨五入、$100 三人分攤。
// 畫面上的每個數字都由下面三種算法實際算出（浮點數就用 JavaScript 的 number 算），不手寫。

import { makeSim, view } from '../../assets/js/engine/archsim.js';

// ---- 三種算法 ----
// Decimal：用 BigInt 存「放大 10000 倍的整數」，模擬十進位小數，乘除後指定四捨五入到小數兩位
const SCALE = 10000n;
const D = (s) => {
  const [i, f = ''] = s.split('.');
  return BigInt(i) * SCALE + BigInt((f + '0000').slice(0, 4));
};
const dStr = (v, places = 2) => {
  const step = SCALE / 10n ** BigInt(places);
  const r = v / step;
  const neg = r < 0n;
  const a = neg ? -r : r;
  const p = 10n ** BigInt(places);
  return `${neg ? '-' : ''}${a / p}.${String(a % p).padStart(places, '0')}`;
};
const dRound2 = (v) => ((v + 50n) / 100n) * 100n; // 四捨五入到分（ROUND_HALF_UP，金額都是正數）
const dMul = (a, b) => (a * b) / SCALE;
const dDiv = (a, n) => a / BigInt(n);

const money = (n) => `$${n.toFixed(2)}`;
const cents = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

const FEES = Array(10).fill('0.10');
const PRICE = '4.30';
const TAX = '1.05';
const BILL = '100.00';
const PEOPLE = 3;

// 每種算法在三個情境各算出：中間過程（給畫面看）、最後的金額、正確答案
const CALC = {
  float() {
    const sum = FEES.reduce((a, f) => a + Number(f), 0);
    const taxed = Number(PRICE) * Number(TAX);
    const rounded = Math.round(taxed * 100) / 100;
    const share = Math.round((Number(BILL) / PEOPLE) * 100) / 100;
    const splitSum = share * PEOPLE;
    return {
      // 畫面上四捨五入後看起來是 $1.00，計數欄改列出電腦裡實際存的值，才看得出哪裡不對
      sum: { work: `0.1 + 0.1 + … = ${sum}`, value: sum, shown: money(sum), stat: `${sum}（不等於 1）`, ok: sum === 1 },
      tax: { work: `${Number(PRICE)} × ${Number(TAX)} = ${taxed}（乘以 100 其實是 ${taxed * 100}）`, value: rounded, shown: money(rounded), ok: rounded === 4.52 },
      split: { work: `${Number(BILL)} ÷ ${PEOPLE} = ${Number(BILL) / PEOPLE}，每人 ${money(share)}`, value: splitSum, shown: money(splitSum), ok: Math.abs(splitSum - 100) < 1e-9 },
    };
  },
  cents() {
    const fees = FEES.map((f) => Math.round(Number(f) * 100));
    const sum = fees.reduce((a, b) => a + b, 0);
    const price = Math.round(Number(PRICE) * 100);
    const raw = price * Math.round(Number(TAX) * 100); // 單位是萬分之一元
    const taxed = Math.floor((raw + 50) / 100);
    const bill = Math.round(Number(BILL) * 100);
    const each = Math.floor(bill / PEOPLE);
    const rest = bill % PEOPLE;
    const shares = Array.from({ length: PEOPLE }, (_, i) => each + (i < rest ? 1 : 0));
    const splitSum = shares.reduce((a, b) => a + b, 0);
    return {
      sum: { work: `10 + 10 + … = ${sum}（分）`, value: sum, shown: cents(sum), ok: sum === 100 },
      tax: { work: `${price} × ${Math.round(Number(TAX) * 100)} = ${raw}（萬分之一元）`, value: taxed, shown: cents(taxed), ok: taxed === 452 },
      split: { work: `${bill} ÷ ${PEOPLE} = ${each} 餘 ${rest}，餘數分給第一個人：${shares.map(cents).join('、')}`, value: splitSum, shown: cents(splitSum), ok: splitSum === bill },
    };
  },
  decimal() {
    const sum = FEES.reduce((a, f) => a + D(f), 0n);
    const taxed = dMul(D(PRICE), D(TAX));
    const rounded = dRound2(taxed);
    const share = dRound2(dDiv(D(BILL), PEOPLE));
    const splitSum = share * BigInt(PEOPLE);
    return {
      sum: { work: `0.10 + 0.10 + … = ${dStr(sum)}`, value: sum, shown: `$${dStr(sum)}`, ok: sum === D('1.00') },
      tax: { work: `${PRICE} × ${TAX} = ${dStr(taxed, 4)}`, value: rounded, shown: `$${dStr(rounded)}`, ok: rounded === D('4.52') },
      split: { work: `${BILL} ÷ ${PEOPLE} = ${dStr(dDiv(D(BILL), PEOPLE), 4)}…，每人 $${dStr(share)}`, value: splitSum, shown: `$${dStr(splitSum)}`, ok: splitSum === D(BILL) },
    };
  },
};

const STATS = [
  { id: 'sum', label: '十筆 $0.10 加總' },
  { id: 'tax', label: '$4.30 加 5% 稅' },
  { id: 'split', label: '三人分攤加回來' },
  { id: 'errors', label: '對不起來的帳' },
];

export const systems = [
  {
    id: 'float', title: '浮點數', short: '浮點數',
    rule: '程式語言預設的小數。電腦用二進位存，0.1 這種數字只能存「很接近」的值，誤差小但會累積，四捨五入也可能進錯位。',
    langs: 'JavaScript 的 number、Python 的 float、Java 的 double（每種語言都有）',
    code: 'let total = 0\nfor (const fee of fees) total += fee <i>// 0.1</i>\ntotal === 1 <i>// <b>false</b></i>',
    calc: 'float',
  },
  {
    id: 'cents', title: '整數存「分」', short: '整數分',
    rule: '把金額換成最小單位的整數：$1.00 存成 100。整數加減乘完全精確；除法除不盡時，餘數會明明白白留下來。',
    langs: '所有語言都能用；Stripe、PayPal 的 API 也這樣傳金額',
    code: 'let cents = 0\nfor (const fee of fees) cents += fee <i>// 10</i>\ncents === 100 <i>// true</i>\n<i>// 顯示時再除以 100</i>',
    calc: 'cents',
  },
  {
    id: 'decimal', title: 'Decimal 型別', short: 'Decimal',
    rule: '用十進位存小數，算起來跟手算一樣精確，還能指定四捨五入的規則。要用語言內建或函式庫提供的型別。',
    langs: 'Java 的 BigDecimal、Python 的 decimal、C# 的 decimal、資料庫的 DECIMAL',
    code: 'let total = new Decimal(0)\nfor (const fee of fees) total = total.plus(fee)\ntotal.equals("1.00") <i>// true</i>',
    calc: 'decimal',
  },
];
systems.forEach((sys) => {
  Object.assign(sys, {
    processLabel: '金額從輸入流到帳上，再跟正確答案對帳',
    cols: 2, rows: 3,
    nodes: [
      { id: 'input', name: '輸入', ring: 'app', cell: [1, 1] },
      { id: 'calc', name: '程式計算', sub: '電腦裡實際存的值', ring: 'core', cell: [2, 1] },
      { id: 'total', name: '帳上金額', ring: 'infra', cell: [3, 1] },
      { id: 'expect', name: '正確答案', sub: '對帳用', ring: 'test', cell: [3, 2] },
    ],
    edges: [
      { id: 'e1', from: 'input', to: 'calc', kind: 'dep' },
      { id: 'e2', from: 'calc', to: 'total', kind: 'dep' },
      { id: 'e3', from: 'total', to: 'expect', kind: 'iface' },
    ],
    tokens: [{ id: 'm', tone: 'data' }],
    stats: STATS,
  });
});

const results = systems.map((sys) => CALC[sys.calc]());
const sims = systems.map(makeSim);
const errors = systems.map(() => 0);

const SCENES = [
  { key: 'sum', chapter: '加總', input: '10 筆手續費，每筆 $0.10', token: '$0.10 × 10', expect: '$1.00',
    caps: [
      '十筆手續費，每筆 $0.10，加起來應該剛好 $1.00。三種存法都從同樣的帳單開始。',
      `程式把十筆加起來。浮點數：電腦裡存的是 ${results[0].sum.value}，不是 1。整數分：10 分加十次，正好 100 分。Decimal：0.10 加十次，正好 1.00。`,
      `帳上金額：三種在畫面上都顯示 $1.00，但對帳程式拿去比「等不等於 1.00」，浮點數的 ${results[0].sum.value} 不相等，對帳失敗。另外兩種相等。`,
    ] },
  { key: 'tax', chapter: '加稅', input: `商品 $${PRICE}，加 5% 營業稅`, token: `$${PRICE} × ${TAX}`, expect: '$4.52',
    caps: [
      `商品 $${PRICE}，加 5% 稅：4.30 × 1.05 = 4.515，四捨五入到分應該是 $4.52。`,
      `浮點數：算出來印出來是 4.515，但乘以 100 後其實是 ${Number(PRICE) * Number(TAX) * 100}，比 451.5 小一點點。整數分：430 × 105 = 45150（萬分之一元），精確。Decimal：4.30 × 1.05 = 4.5150，精確。`,
      `四捨五入：浮點數因為那「小一點點」被捨掉，變成 ${results[0].tax.shown}，少收了一分錢。整數分加 50 再除以 100，得到 ${results[1].tax.shown}；Decimal 指定「四捨五入」，也是 ${results[2].tax.shown}。`,
    ] },
  { key: 'split', chapter: '分攤', input: `$${BILL.split('.')[0]} 晚餐，${PEOPLE} 人平分`, token: `$${BILL.split('.')[0]} ÷ ${PEOPLE}`, expect: '$100.00',
    caps: [
      `一頓 $100 的晚餐，${PEOPLE} 個人平分。每人 $33.33…，除不盡。`,
      `浮點數：${Number(BILL) / PEOPLE}，每人收 $33.33。整數分：10000 ÷ 3 = 3333 餘 1，那 1 分錢明明白白留在那裡，程式得決定給誰。Decimal：33.3333…，每人收 $33.33。`,
      `三個人付的錢加回來：浮點數 ${results[0].split.shown}、Decimal ${results[2].split.shown}，都少了一分錢；整數分把餘數分給第一個人，加回來正好 ${results[1].split.shown}。除不盡時，不管哪種存法都要自己決定餘數歸誰，只是整數的除法把餘數擺在眼前。`,
    ] },
];

export const steps = [];
SCENES.forEach((sc) => {
  sc.caps.forEach((cap, k) => {
    const panels = systems.map((sys, i) => {
      const sim = sims[i];
      const r = results[i][sc.key];
      const base = { input: sc.input, expect: sc.expect, calc: '', total: '' };
      if (k === 0) {
        sim.notes = base;
        return view(sim, { action: sc.input, state: { input: 'active' }, tokens: { m: { at: 'input', label: sc.token } }, wires: { in: true, out: false }, verdict: `正確答案是 ${sc.expect}` });
      }
      if (k === 1) {
        sim.notes = { ...base, calc: r.work };
        return view(sim, { action: sc.input, state: { calc: 'active' }, on: ['e1'], tokens: { m: { at: 'calc', label: sc.token } }, verdict: '計算中' });
      }
      if (!r.ok) errors[i] += 1;
      sim.stats[sc.key] = r.stat || `${r.shown}${r.ok ? '' : '（錯）'}`;
      sim.stats.errors = `${errors[i]} 筆`;
      sim.notes = { ...base, calc: r.work, total: r.shown };
      return view(sim, {
        action: sc.input,
        state: { total: r.ok ? 'ok' : 'wrong', expect: r.ok ? 'ok' : 'wrong' },
        on: ['e2', 'e3'],
        tokens: { m: { at: 'total', label: r.shown } },
        wires: { in: false, out: true },
        verdict: r.ok ? `對帳正確：${r.shown}` : sc.key === 'sum' ? `畫面顯示 ${r.shown}，但實際存的不等於 1，對帳失敗` : `${r.shown}，應該是 ${sc.expect}`,
      });
    });
    steps.push({ id: `${sc.key}${k}`, chapter: sc.chapter, duration: k === 2 ? 6400 : k === 1 ? 6000 : 4600, caption: cap, data: { kind: 'run', panels } });
  });
});

// ---- 對照 ----
const col = (id) => sims.map((sim) => sim.stats[id]);
export const compare = {
  title: '同樣三筆帳，三種存金額的方式',
  rows: [
    { label: '十筆 $0.10 加總', values: col('sum'), highlight: true },
    { label: '$4.30 加 5% 稅', values: col('tax'), highlight: true },
    { label: '$100 三人分攤加回來', values: col('split'), highlight: true },
    { label: '對不起來的帳', better: 'low', values: col('errors'), highlight: true },
    { label: '代價', values: ['不能用在金額；誤差平常看不見，對帳或四捨五入時才冒出來', '要先決定最小單位（分、厘）；顯示時要換算；不同幣別小數位數不同', '比浮點數慢、寫法比較囉嗦；要用語言或函式庫提供的型別'] },
    { label: '適合', values: ['科學計算、圖形、統計這種「差一點點沒關係」的數字', '金額、點數、庫存等可以換成整數單位的數字', '利率、匯率、稅率這種需要很多位小數和指定捨入規則的計算'] },
    { label: '常見語言', values: systems.map((s) => s.langs) },
  ],
};
steps.push({
  id: 'compare', chapter: '對照', duration: 7000,
  caption: '金額不要用浮點數存。用整數存最小單位，或用 Decimal 型別；資料庫欄位也要用 DECIMAL 或整數。除不盡時，不管用哪一種，都要明確寫出餘數給誰、四捨五入用哪種規則。',
  data: { kind: 'compare' },
});

// ---- 給入門讀者的白話說明 ----
// 畫面上一次只放一兩句、先講結果；原本完整的說明移到 detail，讀者按「看詳細說明」才展開
const PLAIN = {
  sum0: '十筆 $0.10 的手續費，加起來應該是 $1.00。',
  sum1: `浮點數加出來，電腦裡存的是 ${results[0].sum.value}，不是 1；另外兩種正好是 1。`,
  sum2: '三種畫面上都顯示 $1.00，但浮點數拿去對帳「不等於 1」，對帳失敗。',
  tax0: `$${PRICE} 加 5% 稅是 4.515，四捨五入應該是 $4.52。`,
  tax1: '浮點數算出來的 4.515，其實比 4.515 小一點點；另外兩種是精確的 4.515。',
  tax2: `四捨五入後，浮點數變成 ${results[0].tax.shown}，少收一分錢；另外兩種是 $4.52。`,
  split0: `$100 晚餐 ${PEOPLE} 人平分，除不盡。`,
  split1: '整數除法得到「3333 分，餘 1 分」，那 1 分錢擺在眼前，程式得決定給誰。',
  split2: `加回來：浮點數和 Decimal 都只有 ${results[0].split.shown}；整數分把餘數分給一個人，正好 $100.00。`,
  compare: '金額不要用浮點數。用整數存「分」或用 Decimal；除不盡時，要明確決定餘數給誰。',
};
steps.forEach((s) => { s.detail = s.caption; s.caption = PLAIN[s.id]; });
