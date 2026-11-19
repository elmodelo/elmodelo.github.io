import { useEffect, useId, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { supabase } from '../lib/supabaseClient';
import { cashFlowPeriod, cashFlowYearOptions, cashFlowCurrencyAccounts, fetchCashFlow, fetchCashFlowYears } from '../lib/cashFlow';
import CashFlowTable, { type CashFlowFocusTarget, type CashFlowRow } from './CashFlowTable';
import CashFlowTransactionsPanel from './CashFlowTransactionsPanel';

interface Props {
  messages: LocaleMessages;
  accounts: Account[];
  cashFlowAccountIds: string[];
  onCategoriesChanged?: () => void;
}

export default function CashFlowPanel(props: Props) {
  // Account changes reset the year choices, report, and any open drill-down.
  return <CashFlowWorkspace key={JSON.stringify(props.cashFlowAccountIds)} {...props} />;
}

function CashFlowWorkspace({ messages, accounts, cashFlowAccountIds, onCategoriesChanged }: Props) {
  const titleId = useId();
  const yearId = useId();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearsResult, setYearsResult] = useState<{ years: number[]; error: boolean } | null>(null);
  const [yearsAttempt, setYearsAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [returnFocus, setReturnFocus] = useState<CashFlowFocusTarget | null>(null);
  const [cell, setCell] = useState<{ row: CashFlowRow; month: number } | null>(null);
  const years = cashFlowYearOptions(yearsResult?.years ?? [], currentYear);
  const year = years.includes(selectedYear) ? selectedYear : currentYear;
  const { firstMonth, lastMonth } = cashFlowPeriod(year);

  useEffect(() => {
    if (!cashFlowAccountIds.length) return;
    const controller = new AbortController();
    let active = true;
    async function loadYears() {
      try {
        const years = await fetchCashFlowYears(supabase, cashFlowAccountIds, controller.signal);
        if (active) setYearsResult({ years, error: false });
      } catch {
        if (active) setYearsResult({ years: [], error: true });
      }
    }
    void loadYears();
    return () => { active = false; controller.abort(); };
  }, [cashFlowAccountIds, yearsAttempt]);

  return <section className="dashboard-panel cash-flow-panel" aria-labelledby={titleId}>
    <div className="cash-flow-heading">
      <h1 id={titleId}>{messages.cashFlow}</h1>
      <div className="cash-flow-year">
        <label htmlFor={yearId}>{messages.cashFlowYear}</label>
        <select id={yearId} value={year} disabled={!cashFlowAccountIds.length || !yearsResult || yearsResult.error}
          onChange={(event) => { setSelectedYear(Number(event.target.value)); setCell(null); setReturnFocus(null); }}>
          {years.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    </div>
    {!cashFlowAccountIds.length ? <p>{messages.cashFlowNoAccounts}</p> : <>
      {!yearsResult && <p role="status">{messages.cashFlowLoadingYears}</p>}
      {yearsResult?.error && <div role="alert" className="cash-flow-error">
        <p className="form-message form-message-error">{messages.cashFlowYearsError}</p>
        <button type="button" className="button button-secondary" onClick={() => {
          setYearsResult(null); setYearsAttempt((previous) => previous + 1);
        }}>{messages.retry}</button>
      </div>}
      <p className="cash-flow-help">{messages.cashFlowPeriodHelp}</p>
      <CashFlowReport key={`${year}:${lastMonth}`} messages={messages} cashFlowAccountIds={cashFlowAccountIds}
        year={year} firstMonth={firstMonth} lastMonth={lastMonth} revision={revision} returnFocus={returnFocus} onCellClick={(row, month) => { setReturnFocus(null); setCell({ row, month }); }} />
    </>}
    {cell && <CashFlowTransactionsPanel messages={messages} accounts={accounts}
      trackedAccountIds={cashFlowCurrencyAccounts(accounts, cashFlowAccountIds, cell.row.currency)}
      year={year} month={cell.month} categoryId={cell.row.category_id!} categoryName={cell.row.category_name!}
      currency={cell.row.currency} onClose={(changed) => {
        setCell(null);
        setReturnFocus({ categoryId: cell.row.category_id!, currency: cell.row.currency, month: cell.month });
        if (changed) { setRevision((previous) => previous + 1); onCategoriesChanged?.(); }
      }} />}
  </section>;
}

interface ReportProps {
  messages: LocaleMessages;
  cashFlowAccountIds: string[];
  year: number;
  firstMonth: number;
  lastMonth: number;
  onCellClick: (row: CashFlowRow, month: number) => void;
  revision: number;
  returnFocus: CashFlowFocusTarget | null;
}

function CashFlowReport({ messages, cashFlowAccountIds, year, firstMonth, lastMonth, onCellClick, revision, returnFocus }: ReportProps) {
  const [result, setResult] = useState<{ rows: CashFlowRow[]; error: boolean; revision: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadReport() {
      try {
        const rows = await fetchCashFlow(supabase, { trackedAccountIds: cashFlowAccountIds, year, firstMonth, lastMonth, signal: controller.signal });
        if (active) setResult({ rows, error: false, revision });
      } catch {
        if (active) setResult({ rows: [], error: true, revision });
      }
    }
    void loadReport();
    return () => { active = false; controller.abort(); };
  }, [cashFlowAccountIds, year, firstMonth, lastMonth, attempt, revision]);

  if (!result) return <p role="status">{messages.loadingCashFlow}</p>;
  if (result.error) return <div role="alert">
    <p className="form-message form-message-error">{messages.cashFlowError}</p>
    <button className="button button-secondary" type="button" onClick={() => {
      setResult(null); setAttempt((previous) => previous + 1);
    }}>{messages.retry}</button>
  </div>;
  if (!result.rows.length) return <p>{messages.cashFlowEmpty}</p>;
  return <CashFlowTable messages={messages} rows={result.rows} year={year} firstMonth={firstMonth} lastMonth={lastMonth} busy={result.revision !== revision} returnFocus={returnFocus} onCellClick={onCellClick} />;
}
