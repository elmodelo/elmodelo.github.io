import { useEffect, useId, useMemo, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { useStatusMessage } from '../hooks/useStatusMessages';
import { supabase } from '../lib/supabaseClient';
import NetWorthActions from './NetWorthActions';
import AssetSnapshotDialog from './AssetSnapshotDialog';
import AssetCard from './AssetCard';
import NetWorthAllocationCard from './NetWorthAllocationCard';
import { loadNetWorth, netWorthRateMessage, sortNetWorthAccounts } from '../lib/netWorth';

interface Props {
  messages: LocaleMessages; accounts: Account[]; trackedAccountIds: string[];
  accountsStatus?: 'loading' | 'ready' | 'error'; onRetryAccounts?: () => void;
}
type Result = Awaited<ReturnType<typeof loadNetWorth>>;

export default function NetWorthPanel({ messages, accounts: allAccounts, trackedAccountIds, accountsStatus = 'ready', onRetryAccounts }: Props) {
  const accounts = useMemo(() => accountsStatus === 'ready' ? allAccounts.filter(({ id }) => trackedAccountIds.includes(id)) : [], [allAccounts, trackedAccountIds, accountsStatus]);
  const titleId = useId();
  const balancesTitleId = useId();
  const totalTitleId = useId();
  const [loaded, setLoaded] = useState<{ accounts: Account[]; result: Result } | null>(null);
  const [failure, setFailure] = useState<Account[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [saved, setSaved] = useState('');
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const available = loaded?.accounts === accounts ? loaded.result : null;
  const result = available && accountsStatus !== 'ready'
    ? { ...available, total: null, accountsError: true, incomplete: true } : available;
  const error = failure === accounts;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadNetWorth(supabase, accounts, controller.signal, undefined, true).then((result) => {
      if (active) setLoaded({ accounts, result });
    }).catch(() => { if (active) setFailure(accounts); });
    return () => { active = false; controller.abort(); };
  }, [accounts, attempt]);
  useStatusMessage({ message: netWorthRateMessage(messages, result) });
  const retry = () => { setLoaded(null); setFailure(null); setAttempt((value) => value + 1); };

  const assets = (result?.rows.filter((row) => row.kind === 'asset') ?? [])
    .filter((asset) => showInactive || (asset.snapshot && asset.snapshot.amount !== 0))
    .sort((a, b) => {
      if (a.cad == null && b.cad != null) return 1;
      if (a.cad != null && b.cad == null) return -1;
      return (b.cad ?? 0) - (a.cad ?? 0)
        || a.name.localeCompare(b.name, messages.language) || a.id.localeCompare(b.id);
    });
  return <section className="dashboard-panel net-worth-panel" aria-labelledby={titleId}>
    <div className="net-worth-heading">
      <h1 id={titleId}>{messages.netWorth}</h1>
      <NetWorthActions messages={messages} onAdd={() => setCreating(true)}
        showInactive={showInactive} onShowInactiveChange={setShowInactive} />
    </div>
    {creating && <AssetSnapshotDialog messages={messages} onClose={() => setCreating(false)} onSaved={(inactive) => {
      setCreating(false); setSaved(messages.assetCreated);
      if (inactive) setShowInactive(true);
      retry();
    }} />}
    {saved && <p role="status">{saved}</p>}
    {error ? <div role="alert">
      <p className="form-message form-message-error">{messages.netWorthError}</p>
      <button className="button button-secondary" type="button" onClick={retry}>{messages.retry}</button>
    </div> : !result ? <p role="status">{messages.loadingNetWorth}</p>
      : <div className="net-worth-cards">
        <div className="net-worth-primary">
          <section className="net-worth-card net-worth-summary-card" aria-labelledby={totalTitleId}>
            <h2 id={totalTitleId}>{messages.netWorth}</h2>
            <div className="net-worth-summary">
              <p className="net-worth-total">{result.total === null ? messages.netWorthUnavailable : formatMoney(result.total, 'CAD', messages.language)}</p>
              <p>{messages.netWorthDescription}</p>
              {result.incomplete && <p role="status">{messages.netWorthIncomplete}</p>}
              {result.conversionError && <div role="alert">
                <p className="form-message form-message-error">{messages.netWorthConversionError}</p>
                <button className="button button-secondary" type="button" onClick={retry}>{messages.retry}</button>
              </div>}
            </div>
            {result.assetsError && <p role="alert">{messages.assetLoadError}</p>}
            {((accountsStatus === 'ready' && result.accountsError) || accountsStatus === 'error' || result.assetsError)
              && <button className="button button-secondary" type="button" onClick={() => {
                if (accountsStatus === 'error') onRetryAccounts?.();
                retry();
              }}>{messages.retry}</button>}
          </section>
          <section className="net-worth-card net-worth-balances-card" aria-labelledby={balancesTitleId}>
            <h2 id={balancesTitleId}>{messages.netWorthBalances}</h2>
            {accountsStatus === 'loading' && <p role="status">{messages.loadingAccounts}</p>}
            {accountsStatus === 'error' && <p role="alert">{messages.accountsError}</p>}
            {accountsStatus === 'ready' && result.accountsError && <p role="alert">{messages.netWorthError}</p>}
            {accounts.length > 0 && !result.accountsError
              && <NetWorthTable messages={messages} result={result} titleId={balancesTitleId} />}
            {accountsStatus === 'ready' && !accounts.length && <p>{messages.netWorthNoAccounts}</p>}
          </section>
        </div>
        <div className="net-worth-secondary" data-has-assets={assets.length > 0}>
          {assets.length > 0 && <div className="net-worth-assets">
            {assets.map((asset) => <AssetCard key={asset.id} asset={asset} messages={messages} onSaved={() => {
              setSaved(messages.assetSaved); retry();
            }} />)}
          </div>}
          <NetWorthAllocationCard messages={messages} result={result} />
        </div>
      </div>}
  </section>;
}

function formatMoney(amount: number, currency: string, language: string) {
  return new Intl.NumberFormat(language, { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
}

export function NetWorthTable({ messages, result, titleId }: { messages: LocaleMessages; result: Result; titleId: string }) {
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  type SortColumn = 'postedAt' | 'name' | 'balance' | 'cad';
  const [sort, setSort] = useState<{ column: SortColumn; ascending: boolean }>({ column: 'cad', ascending: false });
  const rows = sortNetWorthAccounts(result.rows, messages.language, sort.column, sort.ascending);
  const columns: { id: SortColumn; label: string; amount?: boolean }[] = [
    { id: 'postedAt', label: messages.netWorthDate },
    { id: 'name', label: messages.transactionAccount },
    { id: 'balance', label: messages.netWorthBalance, amount: true },
    { id: 'cad', label: messages.netWorthCad, amount: true },
  ];
  const columnClass = (index: number, amount = false) => [
    amount ? 'net-worth-amount' : '', hoveredColumn === index ? 'net-worth-column-hover' : '',
  ].filter(Boolean).join(' ') || undefined;
  return <div className="panel-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
    <table className="net-worth-table"
      onPointerOver={(event) => {
        if (event.pointerType === 'touch' || !(event.target instanceof Element)) return;
        const cell = event.target.closest<HTMLTableCellElement>('th, td');
        setHoveredColumn(cell?.closest('table') === event.currentTarget ? cell.cellIndex : null);
      }}
      onPointerLeave={() => setHoveredColumn(null)} onPointerCancel={() => setHoveredColumn(null)}>
      <thead><tr>
        {columns.map((column, index) => <th key={column.id} scope="col" className={columnClass(index, column.amount)}
          aria-sort={sort.column === column.id ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
          <button type="button" className="sort-button" onClick={() => setSort((previous) => ({
            column: column.id, ascending: previous.column === column.id ? !previous.ascending : column.id === 'name',
          }))}>
            <span className="net-worth-sort-label">{column.label}</span>
            <span className={sort.column === column.id ? 'sort-icon active' : 'sort-icon'} aria-hidden="true">
              {sort.column === column.id && !sort.ascending ? '▼' : '▲'}
            </span>
          </button>
        </th>)}
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className={columnClass(0)}>{row.snapshot ? <time dateTime={row.snapshot.postedAt}>{new Intl.DateTimeFormat(messages.language, {
          year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
        }).format(new Date(row.snapshot.postedAt))}</time> : '—'}</td>
        <th scope="row" className={columnClass(1)}>{row.name}</th>
        <td className={columnClass(2, true)}>{row.snapshot ? formatMoney(row.snapshot.amount, row.currency, messages.language) : messages.netWorthMissing}</td>
        <td className={columnClass(3, true)}>{row.cad === null ? '—' : formatMoney(row.cad, 'CAD', messages.language)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
