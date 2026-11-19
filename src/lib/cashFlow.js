/** Current year is year-to-date; historical years show all twelve months. */
export function cashFlowPeriod(year, now = new Date()) {
  return { year, firstMonth: 1, lastMonth: year === now.getFullYear() ? now.getMonth() + 1 : 12 };
}

/** Always offer the current year, plus only historical years returned by the DB. */
export function cashFlowYearOptions(years, currentYear) {
  return [...new Set([currentYear, ...years.filter((year) => year >= 1 && year < currentYear)])]
    .sort((a, b) => b - a);
}

export async function fetchCashFlowYears(client, trackedAccountIds, signal) {
  if (!trackedAccountIds.length) return [];
  const { data, error } = await client.schema('finance').rpc('cash_flow_years', {
    p_accounts: trackedAccountIds,
  }).abortSignal(signal);
  if (error) throw new Error('Cash flow years unavailable', { cause: error });
  if (!Array.isArray(data) || data.some((row) => !Number.isInteger(row?.year) || row.year < 1 || row.year > 9998)) {
    throw new Error('Invalid cash flow years');
  }
  return data.map(({ year }) => year);
}

export async function fetchCashFlow(client, { trackedAccountIds, year, firstMonth, lastMonth, signal }) {
  if (!trackedAccountIds.length) return [];
  const { data, error } = await client.schema('finance').rpc('cash_flow', {
    p_accounts: trackedAccountIds, p_year: year, p_first_month: firstMonth, p_last_month: lastMonth,
  }).abortSignal(signal);
  if (error) throw new Error('Cash flow unavailable', { cause: error });
  if (!Array.isArray(data)) throw new Error('Invalid cash flow');
  const number = (value) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === ''
      || !Number.isFinite(Number(value))) throw new Error('Invalid cash flow amount');
    return Number(value);
  };
  return data.map((row) => {
    if (!row || !['INCOME', 'INVESTMENT', 'EXPENSE'].includes(row.section)
      || !['category', 'total'].includes(row.row_kind)
      || !['CAD', 'USD'].includes(row.currency)
      || (row.row_kind === 'category' && (typeof row.category_id !== 'string' || typeof row.category_name !== 'string'))
      || !Array.isArray(row.monthly_amounts) || row.monthly_amounts.length !== lastMonth - firstMonth + 1) {
      throw new Error('Invalid cash flow row');
    }
    return { ...row, monthly_amounts: row.monthly_amounts.map(number),
      monthly_average: number(row.monthly_average), annual_total: number(row.annual_total) };
  });
}

/** Match the RPC's category and half-open UTC month, including leap years. */
export function cashFlowCellFilters(year, month, categoryId) {
  const start = new Date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return [
    { field: 'category', operator: 'eq', value: categoryId },
    { field: 'posted_at', operator: 'gte', value: start.toISOString() },
    { field: 'posted_at', operator: 'lt', value: end.toISOString() },
  ];
}

export function cashFlowCurrencyAccounts(accounts, trackedAccountIds, currency) {
  return accounts.filter((account) => account.currency === currency && trackedAccountIds.includes(account.id))
    .map(({ id }) => id);
}
