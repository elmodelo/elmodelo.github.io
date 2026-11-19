/** RFC 4180 fields; protect text labels from spreadsheet formula interpretation. */
function csvField(value) {
  let text = String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function cashFlowRowsInDisplayOrder(rows, language) {
  const sections = { INCOME: 0, INVESTMENT: 1, EXPENSE: 2 };
  return [...rows].sort((a, b) => a.currency.localeCompare(b.currency)
    || sections[a.section] - sections[b.section]
    || (a.row_kind !== b.row_kind ? (a.row_kind === 'total' ? 1 : -1) : 0)
    || (a.category_name ?? '').localeCompare(b.category_name ?? '', language));
}

/** Export the visible months and full-year totals without rounding or conversion. */
export function cashFlowCsv(rows, { year, firstMonth, lastMonth, messages }) {
  const sections = { INCOME: messages.cashFlowIncome, INVESTMENT: messages.cashFlowInvestment, EXPENSE: messages.cashFlowExpense };
  const totals = { INCOME: messages.cashFlowIncomeTotal, INVESTMENT: messages.cashFlowInvestmentTotal, EXPENSE: messages.cashFlowExpenseTotal };
  const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) =>
    `${String(year).padStart(4, '0')}-${String(firstMonth + index).padStart(2, '0')}`);
  const records = [[messages.cashFlowYear, messages.cashFlowCurrency, messages.cashFlowSection,
    messages.transactionCategory, ...months, messages.cashFlowAverage, messages.cashFlowAnnual]];
  for (const row of cashFlowRowsInDisplayOrder(rows, messages.language)) {
    records.push([year, row.currency, sections[row.section],
      row.row_kind === 'total' ? totals[row.section] : row.category_name,
      ...row.monthly_amounts, row.monthly_average, row.annual_total]);
  }
  // BOM preserves accented labels when opened in spreadsheet applications.
  return '\uFEFF' + records.map((record) => record.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function downloadCashFlowCsv(rows, options) {
  const blob = new Blob([cashFlowCsv(rows, options)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = options.messages.cashFlowExportFilename.replace('{year}', String(options.year));
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
