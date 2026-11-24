import { useEffect, useId, useMemo, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { usePreferences } from '../hooks/usePreferences';
import { supabase } from '../lib/supabaseClient';
import { buildMonthlyNetWorth, loadNetWorthCharts } from '../lib/netWorthCharts';
import LoadingDialog from './LoadingDialog';
import { MONTH_WIDTH, createChartScrollCoordinator } from '../lib/netWorthChartViewport';
import MonthlyChart, { type MonthlyRow } from './NetWorthMonthlyChart';
type Result = Awaited<ReturnType<typeof loadNetWorthCharts>>;
interface Props {
  messages: LocaleMessages; accounts: Account[]; trackedAccountIds: string[];
  accountsStatus: 'loading' | 'ready' | 'error'; onRetryAccounts: () => void;
}

export default function NetWorthChartsPanel({ messages, accounts: allAccounts, trackedAccountIds, accountsStatus, onRetryAccounts }: Props) {
  const id = useId();
  const { preferences, update } = usePreferences();
  const accounts = useMemo(() => allAccounts.filter(({ id }) => trackedAccountIds.includes(id)), [allAccounts, trackedAccountIds]);
  const [loaded, setLoaded] = useState<{ accounts: Account[]; attempt: number; result: Result | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectedStart = preferences.netWorthChartsStartMonth;
  const setSelectedStart = (month: string) => update('netWorthChartsStartMonth', month);
  const ready = accountsStatus === 'ready';
  const current = loaded?.accounts === accounts && loaded.attempt === attempt ? loaded : null;
  const result = ready ? current?.result : null;
  const rows: MonthlyRow[] = useMemo(() => result ? buildMonthlyNetWorth(result.history, result.rates, preferences.netWorthIncludeResp) : [], [result, preferences.netWorthIncludeResp]);
  const first = rows[0]?.month ?? '';
  const last = rows.at(-1)?.month ?? '';
  // Clamp to available history without overwriting the saved selection when
  // tracked accounts temporarily expose a narrower range.
  const start = selectedStart ? (selectedStart < first ? first : selectedStart > last ? last : selectedStart) : first;
  const visible = rows.filter(({ month }) => month >= start);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let active = true;
    void loadNetWorthCharts(supabase, accounts, controller.signal)
      .then((result) => { if (active) setLoaded({ accounts, attempt, result }); })
      .catch(() => { if (active) setLoaded({ accounts, attempt, result: null }); });
    return () => { active = false; controller.abort(); };
  }, [accounts, ready, attempt]);
  const retry = () => { if (accountsStatus === 'error') onRetryAccounts(); setAttempt((value) => value + 1); };
  const error = accountsStatus === 'error' || (ready && current && !result);
  const busy = accountsStatus === 'loading' || (ready && !current);
  const years = Array.from(new Set(rows.map(({ month }) => month.slice(0, 4))));
  const months = rows.filter(({ month }) => month.slice(0, 4) === start.slice(0, 4));
  const monthLabel = (month: string, long = false) => new Intl.DateTimeFormat(messages.language, { month: long ? 'long' : 'short', ...(long ? {} : { year: 'numeric' as const }), timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  return <section className="dashboard-panel net-worth-panel net-worth-charts-panel" aria-labelledby={`${id}-title`}>
    <div className="net-worth-charts-heading">
      <h1 id={`${id}-title`}>{messages.netWorth} · {messages.netWorthCharts}</h1>
      {!!rows.length && <div className="net-worth-charts-date">
        <span>{messages.netWorthChartsStart}</span>
        <label htmlFor={`${id}-year`}>{messages.netWorthHistoryYear}</label>
        <select id={`${id}-year`} value={start.slice(0, 4)} onChange={(event) => {
          const options = rows.filter(({ month }) => month.startsWith(`${event.target.value}-`));
          const wanted = `${event.target.value}-${start.slice(5)}`;
          setSelectedStart(wanted < options[0].month ? options[0].month : wanted > options.at(-1)!.month ? options.at(-1)!.month : wanted);
        }}>{years.map((year) => <option key={year}>{year}</option>)}</select>
        <label htmlFor={`${id}-month`}>{messages.netWorthHistoryMonth}</label>
        <select id={`${id}-month`} value={start} onChange={(event) => setSelectedStart(event.target.value)}>
          {months.map(({ month }) => <option value={month} key={month}>{monthLabel(month, true)}</option>)}
        </select>
      </div>}
    </div>
    {busy && <LoadingDialog label={messages.loadingNetWorth} />}
    {error && <div role="alert"><p>{accountsStatus === 'error' ? messages.accountsError : messages.netWorthChartsError}</p>
      <button type="button" className="button button-secondary" onClick={retry}>{messages.retry}</button></div>}
    {result && (!rows.length ? <p>{messages.netWorthHistoryEmpty}</p> : <>
      <p className="net-worth-charts-help">{messages.netWorthChartsHelp}</p>
      {(result.conversionError || rows.some((row) => row.netWorth === null || row.portfolio === null)) && <div role="status">
        <p>{messages.netWorthChartsIncomplete}</p>
        <button type="button" className="button button-secondary" onClick={retry}>{messages.retry}</button>
      </div>}
      <Charts key={`${start}:${last}`} messages={messages} rows={visible} />
    </>)}
  </section>;
}

function Charts({ messages, rows }: { messages: LocaleMessages; rows: MonthlyRow[] }) {
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 720 });
  const contentWidth = rows.length * MONTH_WIDTH;
  const coordinator = useMemo(() => createChartScrollCoordinator(setViewport, contentWidth), [contentWidth]);
  return (
      <div className="net-worth-cards">
        <MonthlyChart messages={messages} title={messages.netWorthChartsTotals} rows={rows} viewport={viewport} registerViewport={coordinator.register} series={[
          { key: 'liabilities', label: messages.netWorthLiabilities, color: '#cf6b29' },
          { key: 'assets', label: messages.netWorthAssets, color: '#2878b5' },
          { key: 'netWorth', label: messages.netWorth, color: '#339875' },
        ]} />
        <MonthlyChart messages={messages} title={messages.netWorthChartsGrowth} description={messages.netWorthChartsGrowthHelp} rows={rows} viewport={viewport} registerViewport={coordinator.register} percent series={[
          { key: 'growth', label: messages.netWorthChartsGrowth, color: '#2878b5' },
          { key: 'average', label: messages.netWorthChartsAverage, color: '#cf6b29' },
        ]} />
        <MonthlyChart messages={messages} title={messages.netWorthChartsPortfolio} description={messages.netWorthChartsPortfolioHelp} rows={rows} viewport={viewport} registerViewport={coordinator.register} series={[
          { key: 'portfolio', label: messages.netWorthChartsPortfolio, color: '#2878b5' },
        ]} />
      </div>
  );
}
