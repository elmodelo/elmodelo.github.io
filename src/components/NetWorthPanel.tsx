import { useEffect, useId, useMemo, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { usePreferences } from '../hooks/usePreferences';
import { useStatusMessage } from '../hooks/useStatusMessages';
import { supabase } from '../lib/supabaseClient';
import NetWorthActions from './NetWorthActions';
import AssetSnapshotDialog from './AssetSnapshotDialog';
import NetWorthTableCard from './NetWorthTableCard';
import NetWorthAllocationCard from './NetWorthAllocationCard';
import HistoricalNetWorthDialog from './HistoricalNetWorthDialog';
import { loadNetWorth, recalculateNetWorth, netWorthRateMessage, groupNetWorthRows } from '../lib/netWorth';

interface Props {
  messages: LocaleMessages; accounts: Account[]; trackedAccountIds: string[];
  accountsStatus?: 'loading' | 'ready' | 'error'; onRetryAccounts?: () => void;
}
type Result = Awaited<ReturnType<typeof loadNetWorth>>;

export default function NetWorthPanel({ messages, accounts: allAccounts, trackedAccountIds, accountsStatus = 'ready', onRetryAccounts }: Props) {
  const { preferences, update } = usePreferences();
  const includeResp = preferences.netWorthIncludeResp;
  const accounts = useMemo(() => accountsStatus === 'ready' ? allAccounts.filter(({ id }) => trackedAccountIds.includes(id)) : [], [allAccounts, trackedAccountIds, accountsStatus]);
  const titleId = useId();
  const totalTitleId = useId();
  const [historicalDate, setHistoricalDate] = useState<string | null>(null);
  const [choosingDate, setChoosingDate] = useState(false);
  const [loaded, setLoaded] = useState<{ accounts: Account[]; historicalDate: string | null; result: Result } | null>(null);
  const [failure, setFailure] = useState<{ accounts: Account[]; historicalDate: string | null } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [saved, setSaved] = useState<{ message: string } | null>(null);
  const [creating, setCreating] = useState<'ASSET' | 'LIABILITY' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const available = useMemo(() => loaded?.accounts === accounts && loaded.historicalDate === historicalDate
    ? recalculateNetWorth(loaded.result, includeResp) : null, [loaded, accounts, historicalDate, includeResp]);
  const result = available && accountsStatus !== 'ready'
    ? { ...available, total: null, accountsError: true, incomplete: true } : available;
  const error = failure?.accounts === accounts && failure.historicalDate === historicalDate;
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), 5000);
    return () => window.clearTimeout(timer);
  }, [saved]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadNetWorth(supabase, accounts, controller.signal, undefined, true, false, historicalDate).then((result) => {
      if (active) setLoaded({ accounts, historicalDate, result });
    }).catch(() => { if (active) setFailure({ accounts, historicalDate }); });
    return () => { active = false; controller.abort(); };
  }, [accounts, attempt, historicalDate]);
  useStatusMessage({ message: netWorthRateMessage(messages, result) });
  const retry = () => { setLoaded(null); setFailure(null); setAttempt((value) => value + 1); };

  const groups = groupNetWorthRows(result?.rows ?? [], showInactive);
  const tableNotice = accountsStatus === 'loading' ? <p role="status">{messages.loadingAccounts}</p>
    : accountsStatus === 'error' ? <p role="alert">{messages.accountsError}</p>
      : result?.accountsError ? <p role="alert">{messages.netWorthError}</p>
        : result?.assetsError ? <p role="alert">{messages.assetLoadError}</p> : undefined;
  const holdingSaved = () => { setSaved({ message: messages.assetSaved }); retry(); };
  return <section className="dashboard-panel net-worth-panel" aria-labelledby={titleId}>
    <div className="net-worth-heading">
      <h1 id={titleId}>{messages.netWorth}</h1>
      <NetWorthActions messages={messages} onAdd={setCreating}
        historical={historicalDate !== null} historyAvailable={accountsStatus === 'ready'} onHistorical={() => setChoosingDate(true)}
        showInactive={showInactive} onShowInactiveChange={setShowInactive}
        includeResp={includeResp} onIncludeRespChange={(value) => update('netWorthIncludeResp', value)} />
    </div>
    {historicalDate && <div className="net-worth-historical-bar">
      <p role="status">{messages.netWorthHistoricalAsOf.replace('{date}', new Intl.DateTimeFormat(messages.language, {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      }).format(new Date(historicalDate)))}</p>
      <button type="button" className="button button-secondary" onClick={() => setHistoricalDate(null)}>{messages.netWorthCurrent}</button>
    </div>}
    {choosingDate && <HistoricalNetWorthDialog messages={messages} accounts={accounts} selectedDate={historicalDate}
      onClose={() => setChoosingDate(false)} onSelect={(date) => { setHistoricalDate(date); setChoosingDate(false); }} />}
    {creating && !historicalDate && <AssetSnapshotDialog messages={messages} creationType={creating} onClose={() => setCreating(null)} onSaved={(inactive) => {
      setCreating(null); setSaved({ message: creating === 'LIABILITY' ? messages.liabilityCreated : messages.assetCreated });
      if (inactive) setShowInactive(true);
      retry();
    }} />}
    {saved && <p role="status">{saved.message}</p>}
    {error ? <div role="alert">
      <p className="form-message form-message-error">{messages.netWorthError}</p>
      <button className="button button-secondary" type="button" onClick={retry}>{messages.retry}</button>
    </div> : !result ? <p role="status">{messages.loadingNetWorth}</p>
      : <div className="net-worth-cards">
        <div className="net-worth-tables">
          <div className="net-worth-primary">
            <section className="net-worth-card net-worth-summary-card" aria-labelledby={totalTitleId}>
              <h2 id={totalTitleId}>{messages.netWorth}</h2>
              <div className="net-worth-summary">
                <p className="net-worth-total">{result.total === null ? messages.netWorthUnavailable : formatMoney(result.total, 'CAD', messages.language)}</p>
                {result.incomplete && <p role="status">{messages.netWorthIncomplete}</p>}
                {result.conversionError && <div role="alert">
                  <p className="form-message form-message-error">{messages.netWorthConversionError}</p>
                  <button className="button button-secondary" type="button" onClick={retry}>{messages.retry}</button>
                </div>}
              </div>
              {accountsStatus === 'ready' && !accounts.length && <p>{messages.netWorthNoAccounts}</p>}
              {result.assetsError && <p role="alert">{messages.assetLoadError}</p>}
              {((accountsStatus === 'ready' && result.accountsError) || accountsStatus === 'error' || result.assetsError)
                && <button className="button button-secondary" type="button" onClick={() => {
                  if (accountsStatus === 'error') onRetryAccounts?.();
                  retry();
                }}>{messages.retry}</button>}
            </section>
            <NetWorthTableCard title={messages.netWorthLiabilities} emptyMessage={messages.netWorthLiabilitiesEmpty}
              className="net-worth-liabilities-card" messages={messages} rows={groups.liabilities} defaultAscending
              readOnly={historicalDate !== null} onSaved={holdingSaved} notice={tableNotice} />
          </div>
          <NetWorthTableCard title={messages.netWorthAssets} emptyMessage={messages.netWorthAssetsEmpty}
            className="net-worth-assets-card" messages={messages} rows={groups.assets}
            readOnly={historicalDate !== null} onSaved={holdingSaved} notice={tableNotice} />
        </div>
        <NetWorthAllocationCard messages={messages} result={result} />
      </div>}
  </section>;
}

function formatMoney(amount: number, currency: string, language: string) {
  return new Intl.NumberFormat(language, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
