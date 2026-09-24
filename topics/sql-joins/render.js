import { dataset } from './steps.js';

const JOIN_LABELS = {
  INNER: 'INNER JOIN',
  LEFT: 'LEFT JOIN',
  RIGHT: 'RIGHT JOIN',
  FULL: 'FULL OUTER JOIN',
};

function formatCell(value) {
  return value === null || value === undefined ? 'NULL' : String(value);
}

function renderSourceTable(title, rows, highlightedIds, columns) {
  const head = columns.map((col) => `<th>${col}</th>`).join('');
  const body = rows
    .map((row) => {
      const isHighlighted = highlightedIds.includes(row.id);
      const cells = columns.map((col) => `<td>${formatCell(row[col])}</td>`).join('');
      return `<tr class="${isHighlighted ? 'row-highlight' : ''}">${cells}</tr>`;
    })
    .join('');
  return `
    <table class="grid-table">
      <caption>${title}</caption>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderResultTable(resultRows) {
  const body = resultRows
    .map((row) => {
      const isNullRow = row.userId === null || row.orderId === null;
      return `<tr class="${isNullRow ? 'row-null' : ''}">
        <td>${formatCell(row.userId)}</td>
        <td>${formatCell(row.userName)}</td>
        <td>${formatCell(row.orderId)}</td>
        <td>${formatCell(row.amount)}</td>
      </tr>`;
    })
    .join('');
  return `
    <table class="grid-table">
      <caption>RESULT（${resultRows.length} 列）</caption>
      <thead><tr><th>user_id</th><th>name</th><th>order_id</th><th>amount</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

export function render(step, stage) {
  const { joinType, highlightedUserIds, highlightedOrderIds, resultRows } = step.data;
  const { users, orders } = dataset;

  stage.innerHTML = `
    <h3 style="margin-top:0">${JOIN_LABELS[joinType]}</h3>
    <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      ${renderSourceTable('users', users, highlightedUserIds, ['id', 'name'])}
      ${renderSourceTable('orders', orders, highlightedOrderIds, ['id', 'userId', 'amount'])}
    </div>
    ${renderResultTable(resultRows)}
  `;
}
