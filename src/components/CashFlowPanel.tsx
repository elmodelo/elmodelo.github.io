import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { supabase } from '../lib/supabaseClient';
import { cashFlowPeriod, cashFlowYearOptions, cashFlowCurrencyAccounts, fetchCashFlow, fetchCashFlowYears } from '../lib/cashFlow';
import CashFlowTable, { type CashFlowFocusTarget, type CashFlowRow } from './CashFlowTable';
import CashFlowTransactionsPanel from './CashFlowTransactionsPanel';
import LoadingDialog from './LoadingDialog';

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
  const [exportTarget, setExportTarget] = useState<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearsResult, setYearsResult] = useState<{ years: number[]; error: boolean } | null>(null);
  const [yearsAttempt, setYearsAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [returnFocus, setReturnFocus] = useState<CashFlowFocusTarget | null>(null);
  const [cell, setCell] = useState<{ row: CashFlowRow; month: number } | null>(null);
  const loadingDialogRef = useRef<HTMLDialogElement>(null);
  const yearFrame = useRef<number | null>(null);
  const years = cashFlowYearOptions(yearsResult?.years ?? [], currentYear);
  const year = years.includes(selectedYear) ? selectedYear : currentYear;
  const { firstMonth, lastMonth } = cashFlowPeriod(year);

  useEffect(() => () => {
    if (yearFrame.current !== null) cancelAnimationFrame(yearFrame.current);
  }, []);

  function selectYear(nextYear: number) {
    if (nextYear === year) {
      if (yearFrame.current !== null) {
        cancelAnimationFrame(yearFrame.current);
        yearFrame.current = null;
        loadingDialogRef.current?.close();
      }
      return;
    }
    if (yearFrame.current !== null) cancelAnimationFrame(yearFrame.current);
    const dialog = loadingDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // The first frame paints the spinner. Begin report rendering/fetching on
    // the next frame, so even expensive renders or cached responses cannot
    // postpone all visible feedback until the request is nearly finished.
    yearFrame.current = requestAnimationFrame(() => {
      yearFrame.current = requestAnimationFrame(() => {
        yearFrame.current = null;
        setSelectedYear(nextYear); setCell(null); setReturnFocus(null);
      });
    });
  }

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
          onChange={(event) => selectYear(Number(event.target.value))}>
          {years.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <div className="cash-flow-export" ref={setExportTarget} />
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
      <CashFlowReport messages={messages} cashFlowAccountIds={cashFlowAccountIds} showLoadingDialog={!cell} loadingDialogRef={loadingDialogRef}
        year={year} firstMonth={firstMonth} lastMonth={lastMonth} revision={revision} exportTarget={exportTarget} returnFocus={returnFocus} onCellClick={(row, month) => { setReturnFocus(null); setCell({ row, month }); }} />
    </>}
    {cell && <CashFlowTransactionsPanel messages={messages} accounts={accounts}
      trackedAccountIds={cashFlowCurrencyAccounts(accounts, cashFlowAccountIds, cell.row.currency)}
      year={year} month={cell.month} categoryId={cell.row.category_id!} categoryName={cell.row.category_name!}
      onCategoriesChanged={() => {
        setRevision((previous) => previous + 1);
        onCategoriesChanged?.();
      }} onClose={() => {
        setCell(null);
        setReturnFocus({ categoryId: cell.row.category_id!, currency: cell.row.currency, month: cell.month });
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
  exportTarget: HTMLDivElement | null;
  returnFocus: CashFlowFocusTarget | null;
  showLoadingDialog: boolean;
  loadingDialogRef: RefObject<HTMLDialogElement | null>;
}

function CashFlowReport({ messages, cashFlowAccountIds, year, firstMonth, lastMonth, onCellClick, revision, exportTarget, returnFocus, showLoadingDialog, loadingDialogRef }: ReportProps) {
  const [result, setResult] = useState<{
    rows: CashFlowRow[]; error: boolean; key: string; year: number; firstMonth: number; lastMonth: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${year}:${firstMonth}:${lastMonth}:${revision}:${attempt}`;
  const busy = result?.key !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const queryState = { key: requestKey, year, firstMonth, lastMonth };
    async function loadReport() {
      try {
        const rows = await fetchCashFlow(supabase, { trackedAccountIds: cashFlowAccountIds, year, firstMonth, lastMonth, signal: controller.signal });
        if (active) setResult({ ...queryState, rows, error: false });
      } catch {
        if (active) setResult({ ...queryState, rows: [], error: true });
      }
    }
    void loadReport();
    return () => { active = false; controller.abort(); };
  }, [cashFlowAccountIds, year, firstMonth, lastMonth, requestKey]);

  return <>
    <LoadingDialog label={messages.loadingCashFlow} open={busy && showLoadingDialog} dialogRef={loadingDialogRef} />
    {result && (result.error ? <div role="alert">
      <p className="form-message form-message-error">{messages.cashFlowError}</p>
      <button className="button button-secondary" type="button" onClick={() => setAttempt((previous) => previous + 1)}>{messages.retry}</button>
    </div> : !result.rows.length ? <p>{messages.cashFlowEmpty}</p>
      : <CashFlowTable key={result.key} messages={messages} rows={result.rows} year={result.year}
        firstMonth={result.firstMonth} lastMonth={result.lastMonth} busy={busy} exportTarget={exportTarget}
        returnFocus={returnFocus} onCellClick={onCellClick} />)}
  </>;
}
