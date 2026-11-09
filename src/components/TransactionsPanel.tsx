import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchTransactions } from '../lib/transactionQuery';
import type { LocaleMessages } from '../locales/types';
import LoadingDialog from './LoadingDialog';

type SortColumn = 'posted_at' | 'account(name)' | 'description(name)' |
  'description(memo)' | 'category(name)' | 'amount';

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
}

export default function TransactionsPanel({ messages }: TransactionsPanelProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('posted_at');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const requestKey = `${sortColumn}:${ascending}:${page}:${pageSize}:${retry}`;
  const currentResult = result;
  const isLoading = result?.key !== requestKey;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const queryState = { key: requestKey, page, pageSize, sortColumn, ascending };

    async function loadTransactions() {
      try {
        const { data, count, error } = await fetchTransactions(supabase, {
          sortColumn,
          ascending,
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
  }, [sortColumn, ascending, page, pageSize, requestKey]);

  const columns: { id: SortColumn; label: string }[] = [
    { id: 'posted_at', label: messages.transactionDate },
    { id: 'account(name)', label: messages.transactionAccount },
    { id: 'description(name)', label: messages.transactionName },
    { id: 'description(memo)', label: messages.transactionMemo },
    { id: 'category(name)', label: messages.transactionCategory },
    { id: 'amount', label: messages.transactionAmount },
  ];

  function changeSort(column: SortColumn) {
    if (column === sortColumn) {
      setAscending(!ascending);
    } else {
      setSortColumn(column);
      setAscending(true);
    }
    setPage(0);
  }

  const locale = messages.language === 'es' ? 'es' : 'en';
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const totalPages = currentResult ? Math.max(1, Math.ceil(currentResult.count / currentResult.pageSize)) : 1;

  return (
    <section className="dashboard-panel" aria-labelledby="transactions-title">
      <h1 id="transactions-title">{messages.transactions}</h1>
      {!currentResult ? null : currentResult.error ? (
        <div role="alert">
          <p className="form-message form-message-error">{messages.transactionsError}</p>
          <button className="button button-secondary" type="button" onClick={() => setRetry(retry + 1)}>
            {messages.retry}
          </button>
        </div>
      ) : (
        <>
          <div className="panel-scroll" tabIndex={0} role="region" aria-label={messages.transactions}>
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
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="pagination-navigation">
              <span className="page-count">
                {messages.pageOf.replace('{page}', String(currentResult.page + 1)).replace('{total}', String(totalPages))}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="pagination-button"
                  aria-label={messages.previousPage}
                  title={messages.previousPage}
                  disabled={currentResult.page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5m7-7-7 7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="pagination-button"
                  aria-label={messages.nextPage}
                  title={messages.nextPage}
                  disabled={currentResult.page + 1 >= totalPages}
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
      {isLoading && <LoadingDialog label={messages.loadingTransactions} />}
    </section>
  );
}
