import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchTransactions } from '../lib/transactionQuery';
import type { LocaleMessages } from '../locales/types';
import LoadingDialog from './LoadingDialog';
import ResultDialog from './ResultDialog';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  DEFAULT_TRANSACTION_PREFERENCES, PAGE_SIZE_OPTIONS, isTransactionPreferences,
  changeTransactionSort, type SortColumn,
} from '../lib/transactionPreferences';

interface Transaction {
  id: string;
  posted_at: string;
  amount: number;
  account: { name: string; currency: string } | null;
  description: { name: string | null; memo: string | null } | null;
  category: { name: string } | null;
}

interface TransactionResult {
  key: string;
  page: number;
  pageSize: number;
  sortColumn: SortColumn;
  ascending: boolean;
  transactions: Transaction[];
  count: number;
  error: boolean;
}

interface TransactionsPanelProps {
  messages: LocaleMessages;
  userId: string;
  trackedAccountIds: string[];
}

export default function TransactionsPanel({ messages, userId, trackedAccountIds }: TransactionsPanelProps) {
  const [preferences, setPreferences] = usePersistedState(
    'transactions', DEFAULT_TRANSACTION_PREFERENCES, isTransactionPreferences, userId,
  );
  const { sortColumn, ascending, postedAtAscending, pageSize } = preferences;
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ count: string } | { error: true } | null>(null);
  const backfillPendingRef = useRef(false);
  const previousPageRef = useRef<HTMLButtonElement>(null);
  const nextPageRef = useRef<HTMLButtonElement>(null);
  const requestKey = `${JSON.stringify(trackedAccountIds)}:${sortColumn}:${ascending}:${postedAtAscending}:${page}:${pageSize}:${retry}`;
  const currentResult = result;
  const isLoading = result?.key !== requestKey;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isLoading || event.defaultPrevented || event.repeat || event.isComposing
        || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement
        && (event.target.isContentEditable
          || event.target.closest('input, textarea, select, [role="textbox"], [role="combobox"], dialog'))) return;

      const button = event.key === 'ArrowLeft' ? previousPageRef.current
        : event.key === 'ArrowRight' ? nextPageRef.current : null;
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isLoading]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const queryState = { key: requestKey, page, pageSize, sortColumn, ascending };

    async function loadTransactions() {
      try {
        const { data, count, error } = await fetchTransactions(supabase, {
          trackedAccountIds,
          sortColumn,
          ascending,
          postedAtAscending,
          page,
          pageSize,
          signal: controller.signal,
        });

        if (!active) return;
        if (error || count === null || data === null) {
          setResult({ ...queryState, transactions: [], count: 0, error: true });
          return;
        }

        const lastPage = Math.max(0, Math.ceil(count / pageSize) - 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setResult({ ...queryState, transactions: data, count, error: false });
      } catch {
        if (active) {
          setResult({ ...queryState, transactions: [], count: 0, error: true });
        }
      }
    }

    void loadTransactions();
    return () => {
      active = false;
      controller.abort();
    };
  }, [trackedAccountIds, sortColumn, ascending, postedAtAscending, page, pageSize, requestKey]);

  const columns: { id: SortColumn; label: string }[] = [
    { id: 'posted_at', label: messages.transactionDate },
    { id: 'account(name)', label: messages.transactionAccount },
    { id: 'description(name)', label: messages.transactionName },
    { id: 'description(memo)', label: messages.transactionMemo },
    { id: 'category(name)', label: messages.transactionCategory },
    { id: 'amount', label: messages.transactionAmount },
  ];

  function changeSort(column: SortColumn) {
    setPreferences((previous) => changeTransactionSort(previous, column));
    setPage(0);
  }

  async function backfillCategories() {
    if (backfillPendingRef.current) return;
    backfillPendingRef.current = true;
    setIsBackfilling(true);
    try {
      const { data, error } = await supabase.schema('finance').rpc('backfill_transaction_categories');
      if (error || data === null) throw new Error('Category backfill failed');
      setBackfillResult({ count: String(data) });
      setRetry((previous) => previous + 1);
    } catch {
      setBackfillResult({ error: true });
    } finally {
      backfillPendingRef.current = false;
      setIsBackfilling(false);
    }
  }

  const locale = messages.language === 'es' ? 'es' : 'en';
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const totalPages = currentResult ? Math.max(1, Math.ceil(currentResult.count / currentResult.pageSize)) : 1;

  return (
    <section className="dashboard-panel transactions-panel" aria-labelledby="transactions-title">
      <div className="transactions-heading">
        <h1 id="transactions-title">{messages.transactions}</h1>
        <button
          className="button button-secondary"
          type="button"
          disabled={isBackfilling}
          onClick={() => void backfillCategories()}
        >
          {messages.backfillCategories}
        </button>
      </div>
      {!currentResult ? null : currentResult.error ? (
        <div role="alert">
          <p className="form-message form-message-error">{messages.transactionsError}</p>
          <button className="button button-secondary" type="button" onClick={() => setRetry(retry + 1)}>
            {messages.retry}
          </button>
        </div>
      ) : (
        <>
          <div key={currentResult.key} className="panel-scroll" tabIndex={0} role="region" aria-label={messages.transactions}>
            <table className="transaction-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={column.id === currentResult.sortColumn ? (currentResult.ascending ? 'ascending' : 'descending') : 'none'}
                    >
                      <button type="button" className="sort-button" onClick={() => changeSort(column.id)}>
                        <span>{column.label}</span>
                        <span className={column.id === currentResult.sortColumn ? 'sort-icon active' : 'sort-icon'} aria-hidden="true">
                          {column.id === currentResult.sortColumn && !currentResult.ascending ? '▼' : '▲'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentResult.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{dateFormatter.format(new Date(transaction.posted_at))}</td>
                    <td>{transaction.account?.name ?? '—'}</td>
                    <td>{transaction.description?.name ?? '—'}</td>
                    <td>{transaction.description?.memo ?? '—'}</td>
                    <td>{transaction.category?.name ?? '—'}</td>
                    <td className="transaction-amount">
                      {transaction.account
                        ? new Intl.NumberFormat(locale, { style: 'currency', currency: transaction.account.currency }).format(transaction.amount)
                        : new Intl.NumberFormat(locale).format(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {currentResult.count === 0 && <p className="empty-transactions">{messages.noTransactions}</p>}
          <div className="pagination">
            <div className="pagination-page-size">
              <label htmlFor="page-size">{messages.rowsPerPage}</label>
              <select
                id="page-size"
                value={currentResult.pageSize}
                onChange={(event) => {
                  const pageSize = Number(event.target.value);
                  setPreferences((previous) => ({ ...previous, pageSize }));
                  setPage(0);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="pagination-navigation">
              <span className="page-count">
                {messages.pageOf.replace('{page}', String(currentResult.page + 1)).replace('{total}', String(totalPages))}
              </span>
              <div className="pagination-actions">
                <button
                  ref={previousPageRef}
                  type="button"
                  className="pagination-button"
                  aria-label={messages.previousPage}
                  title={messages.previousPage}
                  disabled={isLoading || currentResult.page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5m7-7-7 7 7 7" />
                  </svg>
                </button>
                <button
                  ref={nextPageRef}
                  type="button"
                  className="pagination-button"
                  aria-label={messages.nextPage}
                  title={messages.nextPage}
                  disabled={isLoading || currentResult.page + 1 >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14m-7-7 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {(isBackfilling || (isLoading && !backfillResult)) && (
        <LoadingDialog label={isBackfilling ? messages.backfillingCategories : messages.loadingTransactions} />
      )}
      {backfillResult && (
        <ResultDialog
          title={messages.backfillCategories}
          message={'error' in backfillResult ? messages.backfillCategoriesError
            : messages.backfillCategoriesResult.replace('{count}', backfillResult.count)}
          closeLabel={messages.close}
          onClose={() => setBackfillResult(null)}
        />
      )}
    </section>
  );
}
