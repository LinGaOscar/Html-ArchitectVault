// SQL Joins 動畫的資料與逐步狀態產生邏輯。
// 用同一份 users/orders 資料，依序示範 INNER / LEFT / RIGHT / FULL OUTER JOIN
// 的比對過程——四種 JOIN 共用同一段生成邏輯，避免手刻四份幾乎一樣的步驟。

const users = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Ben' },
  { id: 3, name: 'Cleo' },
  { id: 4, name: 'Dev' },
  { id: 5, name: 'Eva' },
];

const orders = [
  { id: 1, userId: 1, amount: 20 },
  { id: 2, userId: 2, amount: 35 },
  { id: 3, userId: 3, amount: 60 },
  { id: 4, userId: 3, amount: 99 },
  { id: 5, userId: 9, amount: 15 }, // 沒有對應的 user，示範 RIGHT/FULL 的孤兒列
];

// drive：以哪張表逐列掃描；includeUnmatchedDrive：驅動表掃到沒配對時要不要補 NULL 留在結果；
// includeUnmatchedOther：驅動表掃完後，另一張表裡完全沒被配對到的列要不要額外補上。
const JOIN_DEFS = {
  INNER: { drive: 'users', includeUnmatchedDrive: false, includeUnmatchedOther: false },
  LEFT: { drive: 'users', includeUnmatchedDrive: true, includeUnmatchedOther: false },
  RIGHT: { drive: 'orders', includeUnmatchedDrive: true, includeUnmatchedOther: false },
  FULL: { drive: 'users', includeUnmatchedDrive: true, includeUnmatchedOther: true },
};

export const JOIN_LABELS = {
  INNER: 'INNER JOIN',
  LEFT: 'LEFT JOIN',
  RIGHT: 'RIGHT JOIN',
  FULL: 'FULL OUTER JOIN',
};

function driveLabel(drive, row) {
  return drive === 'users' ? `users #${row.id}(${row.name})` : `orders #${row.id}`;
}

function buildJoinSteps(joinType) {
  const def = JOIN_DEFS[joinType];
  const driveRows = def.drive === 'users' ? users : orders;
  const otherRows = def.drive === 'users' ? orders : users;
  const resultRows = [];
  const matchedOtherIds = new Set();
  const steps = [];

  driveRows.forEach((driveRow) => {
    const matches = otherRows.filter((otherRow) =>
      def.drive === 'users' ? otherRow.userId === driveRow.id : driveRow.userId === otherRow.id
    );
    const highlightedUserIds = [];
    const highlightedOrderIds = [];

    if (def.drive === 'users') {
      highlightedUserIds.push(driveRow.id);
      matches.forEach((m) => highlightedOrderIds.push(m.id));
    } else {
      highlightedOrderIds.push(driveRow.id);
      matches.forEach((m) => highlightedUserIds.push(m.id));
    }

    if (matches.length > 0) {
      matches.forEach((m) => {
        matchedOtherIds.add(m.id);
        resultRows.push(
          def.drive === 'users'
            ? { userId: driveRow.id, userName: driveRow.name, orderId: m.id, amount: m.amount }
            : { userId: m.id, userName: m.name, orderId: driveRow.id, amount: driveRow.amount }
        );
      });
    } else if (def.includeUnmatchedDrive) {
      resultRows.push(
        def.drive === 'users'
          ? { userId: driveRow.id, userName: driveRow.name, orderId: null, amount: null }
          : { userId: null, userName: null, orderId: driveRow.id, amount: driveRow.amount }
      );
    }

    steps.push({
      id: `${joinType}-row-${driveRow.id}`,
      caption: matches.length > 0
        ? `${driveLabel(def.drive, driveRow)} 找到 ${matches.length} 筆配對，加入結果，目前 ${resultRows.length} 列`
        : def.includeUnmatchedDrive
          ? `${driveLabel(def.drive, driveRow)} 沒有配對，補上 NULL，目前 ${resultRows.length} 列`
          : `${driveLabel(def.drive, driveRow)} 沒有配對，${JOIN_LABELS[joinType]} 略過此列`,
      duration: 1400,
      data: { joinType, highlightedUserIds, highlightedOrderIds, resultRows: resultRows.slice() },
    });
  });

  if (def.includeUnmatchedOther) {
    otherRows
      .filter((o) => !matchedOtherIds.has(o.id))
      .forEach((o) => {
        resultRows.push({ userId: null, userName: null, orderId: o.id, amount: o.amount });
        steps.push({
          id: `${joinType}-unmatched-${o.id}`,
          caption: `orders #${o.id} 沒有配對的 user，補上 NULL，目前 ${resultRows.length} 列`,
          duration: 1400,
          data: { joinType, highlightedUserIds: [], highlightedOrderIds: [o.id], resultRows: resultRows.slice() },
        });
      });
  }

  steps.push({
    id: `${joinType}-done`,
    caption: `${JOIN_LABELS[joinType]} 完成，共 ${resultRows.length} 列`,
    duration: 2200,
    data: { joinType, highlightedUserIds: [], highlightedOrderIds: [], resultRows: resultRows.slice() },
  });

  return steps;
}

export const dataset = { users, orders };
export const steps = [
  ...buildJoinSteps('INNER'),
  ...buildJoinSteps('LEFT'),
  ...buildJoinSteps('RIGHT'),
  ...buildJoinSteps('FULL'),
];
