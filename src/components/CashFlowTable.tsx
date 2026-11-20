import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cashFlowRowsInDisplayOrder, downloadCashFlowCsv } from '../lib/cashFlowCsv';
import type { LocaleMessages } from '../locales/types';

export interface CashFlowRow {
  section: 'INCOME' | 'INVESTMENT' | 'EXPENSE';
  row_kind: 'category' | 'total';
  category_id: string | null;
  category_name: string | null;
  currency: string;
  monthly_amounts: number[];
  monthly_average: number;
  annual_total: number;
}

export interface CashFlowFocusTarget {
  categoryId: string;
  currency: string;
  month: number;
}

interface Props {
  messages: LocaleMessages;
  rows: CashFlowRow[];
  year: number;
  firstMonth: number;
  lastMonth: number;
  busy?: boolean;
  exportTarget?: HTMLDivElement | null;
  returnFocus?: CashFlowFocusTarget | null;
  onCellClick: (row: CashFlowRow, month: number) => void;
}

export default function CashFlowTable({ messages, rows, year, firstMonth, lastMonth, onCellClick, busy = false, returnFocus, exportTarget }: Props) {
  const id = useId();
  const [exportError, setExportError] = useState(false);
  const [hoveredColumn, setHoveredColumn] = useState<{ currency: string; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!returnFocus || busy) return;
    // Resolve the current button after refresh rather than a potentially replaced node.
    const buttons = scrollRef.current?.querySelectorAll<HTMLButtonElement>('.cash-flow-cell');
    const target = Array.from(buttons ?? []).find((button) =>
      button.dataset.category === returnFocus.categoryId && button.dataset.currency === returnFocus.currency
      && Number(button.dataset.month) === returnFocus.month);
    target?.focus();
  }, [returnFocus, busy, rows]);
  const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => firstMonth + index);
  const monthFormatter = new Intl.DateTimeFormat(messages.language, { month: 'short', timeZone: 'UTC' });
  const fullMonthFormatter = new Intl.DateTimeFormat(messages.language, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const numberFormatter = new Intl.NumberFormat(messages.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sectionLabels = { INCOME: messages.cashFlowIncome, INVESTMENT: messages.cashFlowInvestment, EXPENSE: messages.cashFlowExpense };
  const totalLabels = { INCOME: messages.cashFlowIncomeTotal, INVESTMENT: messages.cashFlowInvestmentTotal, EXPENSE: messages.cashFlowExpenseTotal };
  const orderedRows = cashFlowRowsInDisplayOrder(rows, messages.language);
  const currencies = [...new Set(orderedRows.map((row) => row.currency))];
  const monthDate = (month: number) => new Date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00Z`);

  function columnClass(currency: string, index: number, summary = false) {
    return [summary ? 'cash-flow-summary' : '',
      hoveredColumn?.currency === currency && hoveredColumn.index === index ? 'cash-flow-column-hover' : '']
      .filter(Boolean).join(' ') || undefined;
  }

  const exportButton = <button type="button" className="button button-secondary" disabled={busy}
    onClick={() => {
      try {
        downloadCashFlowCsv(rows, { year, firstMonth, lastMonth, messages });
        setExportError(false);
      } catch { setExportError(true); }
    }}>{messages.cashFlowExportCsv}</button>;

  return <>
    {exportTarget ? createPortal(exportButton, exportTarget) : <div className="cash-flow-export">{exportButton}</div>}
    {exportError && <p className="form-message form-message-error" role="alert">{messages.cashFlowExportError}</p>}
    <div ref={scrollRef} className="panel-scroll cash-flow-scroll" tabIndex={0} role="region" aria-label={messages.cashFlow} aria-busy={busy}>
    {currencies.map((currency) => <table key={currency} className="cash-flow-table" aria-label={currency}
      onPointerOver={(event) => {
        if (event.pointerType === 'touch' || !(event.target instanceof Element)) return;
        const cell = event.target.closest<HTMLTableCellElement>('th, td');
        if (!cell || cell.closest('table') !== event.currentTarget || cell.colSpan !== 1) {
          setHoveredColumn(null);
          return;
        }
        const index = cell.cellIndex;
        setHoveredColumn((previous) => previous?.currency === currency && previous.index === index
          ? previous : { currency, index });
      }}
      onPointerLeave={() => setHoveredColumn(null)} onPointerCancel={() => setHoveredColumn(null)}>
      <thead><tr>
        <th scope="col" className={columnClass(currency, 0)}>{messages.transactionCategory}</th>
        {months.map((month, index) => <th key={month} scope="col" className={columnClass(currency, index + 1)}>{monthFormatter.format(monthDate(month))}</th>)}
        <th scope="col" className={columnClass(currency, months.length + 1, true)} title={messages.cashFlowAverageHelp}>{messages.cashFlowAverage}</th>
        <th scope="col" className={columnClass(currency, months.length + 2, true)} title={messages.cashFlowAnnualHelp}>{messages.cashFlowAnnual}</th>
      </tr></thead>
      {(['INCOME', 'INVESTMENT', 'EXPENSE'] as const).map((section) => <tbody key={section} aria-labelledby={`${id}-${currency}-${section}`}>
        <tr className="cash-flow-section"><th id={`${id}-${currency}-${section}`} scope="rowgroup" colSpan={months.length + 3}>
          {sectionLabels[section]}
        </th></tr>
        {orderedRows.filter((row) => row.currency === currency && row.section === section)
          .map((row) => <tr key={row.category_id ?? 'total'} className={row.row_kind === 'total' ? 'cash-flow-total' : undefined}>
            <th scope="row" className={columnClass(currency, 0)}>{row.row_kind === 'total' ? totalLabels[section] : row.category_name}</th>
            {row.monthly_amounts.map((amount, index) => <td key={months[index]} className={columnClass(currency, index + 1)}>
              {row.row_kind === 'category' ? <button type="button" className="cash-flow-cell" aria-haspopup="dialog"
                data-category={row.category_id} data-currency={currency} data-month={months[index]}
                aria-label={messages.cashFlowCellLabel.replace('{category}', () => row.category_name ?? '')
                  .replace('{month}', fullMonthFormatter.format(monthDate(months[index])))
                  .replace('{amount}', numberFormatter.format(amount)).replace('{currency}', currency)}
                onClick={(event) => {
                  // Establish the native dialog's return target, including browsers
                  // that do not focus buttons on pointer activation.
                  event.currentTarget.focus();
                  onCellClick(row, months[index]);
                }}>
                {numberFormatter.format(amount)}
              </button> : numberFormatter.format(amount)}
            </td>)}
            <td className={columnClass(currency, months.length + 1, true)}>{numberFormatter.format(row.monthly_average)}</td>
            <td className={columnClass(currency, months.length + 2, true)}>{numberFormatter.format(row.annual_total)}</td>
          </tr>)}
      </tbody>)}
    </table>)}
  </div></>;
}
