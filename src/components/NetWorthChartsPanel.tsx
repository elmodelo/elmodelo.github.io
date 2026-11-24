import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { usePreferences } from '../hooks/usePreferences';
import { supabase } from '../lib/supabaseClient';
import { buildMonthlyNetWorth, loadNetWorthCharts } from '../lib/netWorthCharts';
import LoadingDialog from './LoadingDialog';
import { MONTH_WIDTH, createChartScrollCoordinator } from '../lib/netWorthChartViewport';
import MonthlyChart, { type MonthlyRow, type MonthlySeries } from './NetWorthMonthlyChart';
type Result = Awaited<ReturnType<typeof loadNetWorthCharts>>;
interface Props {
  messages: LocaleMessages; accounts: Account[]; trackedAccountIds: string[];
  accountsStatus: 'loading' | 'ready' | 'error'; onRetryAccounts: () => void;
}

export default function NetWorthChartsPanel({ messages, accounts: allAccounts, trackedAccountIds, accountsStatus, onRetryAccounts }: Props) {
  const id = useId();
  const { preferences } = usePreferences();
  const includeResp = preferences.netWorthIncludeResp;
  const accounts = useMemo(() => allAccounts.filter(({ id }) => trackedAccountIds.includes(id)), [allAccounts, trackedAccountIds]);
  const [loaded, setLoaded] = useState<{ accounts: Account[]; includeResp: boolean; attempt: number; result: Result | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = accountsStatus === 'ready';
  const current = loaded?.accounts === accounts && loaded.includeResp === includeResp && loaded.attempt === attempt ? loaded : null;
  const result = ready ? current?.result : null;
  const rows: MonthlyRow[] = useMemo(() => result ? buildMonthlyNetWorth(result.monthly, result.rates) : [], [result]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let active = true;
    void loadNetWorthCharts(supabase, accounts, controller.signal, includeResp)
      .then((result) => { if (active) setLoaded({ accounts, includeResp, attempt, result }); })
      .catch(() => { if (active) setLoaded({ accounts, includeResp, attempt, result: null }); });
    return () => { active = false; controller.abort(); };
  }, [accounts, ready, attempt, includeResp]);
  const retry = () => { if (accountsStatus === 'error') onRetryAccounts(); setAttempt((value) => value + 1); };
  const error = accountsStatus === 'error' || (ready && current && !result);
  const busy = accountsStatus === 'loading' || (ready && !current);

  return <section className="dashboard-panel net-worth-panel net-worth-charts-panel" aria-labelledby={`${id}-title`}>
    <div className="net-worth-charts-heading">
      <h1 id={`${id}-title`}>{messages.netWorth} · {messages.netWorthCharts}</h1>
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
      <Charts key={`${rows[0]?.month}:${rows.at(-1)?.month}`} messages={messages} rows={rows} />
    </>)}
  </section>;
}

function Charts({ messages, rows }: { messages: LocaleMessages; rows: MonthlyRow[] }) {
  const [axisWidth, setAxisWidth] = useState(48);
  const widestAxis = useRef(48);
  const measureAxis = useCallback((labelWidth: number) => {
    const required = Math.ceil(labelWidth) + 12;
    // Share the widest label across all charts; never shrink during a scroll.
    if (required > widestAxis.current) {
      widestAxis.current = required;
      setAxisWidth(required);
    }
  }, []);
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 720 });
  const contentWidth = rows.length * MONTH_WIDTH;
  const coordinator = useMemo(() => createChartScrollCoordinator(setViewport, contentWidth), [contentWidth]);
  const series = useMemo<Record<'totals' | 'growth' | 'portfolio', MonthlySeries[]>>(() => ({
    totals: [
      { key: 'liabilities', label: messages.netWorthLiabilities, color: '#cf6b29' },
      { key: 'assets', label: messages.netWorthAssets, color: '#2878b5' },
      { key: 'netWorth', label: messages.netWorth, color: '#339875' },
    ],
    growth: [
      { key: 'growth', label: messages.netWorthChartsGrowth, color: '#2878b5' },
      { key: 'average', label: messages.netWorthChartsAverage, color: '#cf6b29' },
    ],
    portfolio: [{ key: 'portfolio', label: messages.netWorthChartsPortfolio, color: '#2878b5' }],
  }), [messages]);
  return <div className="net-worth-cards">
    <MonthlyChart messages={messages} title={messages.netWorthChartsTotals} rows={rows} viewport={viewport}
      registerViewport={coordinator.register} axisWidth={axisWidth} onAxisWidth={measureAxis} series={series.totals} />
    <MonthlyChart messages={messages} title={messages.netWorthChartsGrowth} rows={rows} viewport={viewport}
      registerViewport={coordinator.register} axisWidth={axisWidth} onAxisWidth={measureAxis} percent series={series.growth} />
    <MonthlyChart messages={messages} title={messages.netWorthChartsPortfolio} rows={rows} viewport={viewport}
      registerViewport={coordinator.register} axisWidth={axisWidth} onAxisWidth={measureAxis} series={series.portfolio} />
  </div>;
}
