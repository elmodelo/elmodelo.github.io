import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchTransactions, NO_TRANSACTION_FILTERS } from '../lib/transactionQuery';
import type { TransactionFilters } from '../lib/transactionFilters';
import { parseTransactionSearch, resolveSearchNames } from '../lib/transactionSearch';
import { projectTransactionSearch } from '../lib/projectTransactionSearch';
import { buildRelativeDateFilters, type RelativeDateRange } from '../lib/relativeTransactionDates';
import { fetchCategories } from '../lib/transactionCategorization';
import type { LocaleMessages } from '../locales/types';
import TransactionFilterPanel from './TransactionFilterPanel';
import MobileTransactionSearch from './MobileTransactionSearch';
import TransactionTotalStatus from './TransactionTotalStatus';
import { buildTransactionFilters, EMPTY_TRANSACTION_FILTER, type SavedTransactionFilter, type TransactionFilterValues } from '../lib/transactionFilterPresets';
import LoadingDialog from './LoadingDialog';
import CategorizePanel from './CategorizePanel';
import { useStatusMessage } from '../hooks/useStatusMessages';
import { usePreferences } from '../hooks/usePreferences';
import type { SetStateAction } from 'react';
import type { TransactionPreferences } from '../lib/transactionPreferences';
import type { Account } from '../hooks/useTrackedAccounts';
import { usePermissions } from '../hooks/usePermissions';
import {
  PAGE_SIZE_OPTIONS,
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
  scopeKey: string;
  search: string;
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
  accounts: Account[];
  trackedAccountIds: string[];
  filters?: TransactionFilters;
  title?: string;
  initialPreset?: SavedTransactionFilter;
  onCategoriesChanged?: () => void;
}

const EMPTY_SEARCH = { text: '', filters: NO_TRANSACTION_FILTERS, relativeDates: [] as RelativeDateRange[] };

export default function TransactionsPanel({ messages, accounts, trackedAccountIds, filters = NO_TRANSACTION_FILTERS, title = messages.transactions, initialPreset, onCategoriesChanged }: TransactionsPanelProps) {
  const [filterOpen, setFilterOpen] = useState<'edit' | 'save-search' | null>(null);
  const [{ values: filterValues, presetId }, setAppliedFilter] = useState({
    values: initialPreset?.values ?? EMPTY_TRANSACTION_FILTER,
    presetId: initialPreset?.id ?? '',
  });
  const [searchText, setSearchText] = useState('');
  const [{ text: search, filters: searchFilters, relativeDates }, setAppliedSearch] = useState(EMPTY_SEARCH);
  const [searchIssue, setSearchIssue] = useState<{ text: string; unknown: string[] | null } | null>(null);
  const parsedSearch = useMemo(() => parseTransactionSearch(searchText), [searchText]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const savedFiltersButtonRef = useRef<HTMLButtonElement>(null);
  const savedFiltersId = useId();
  const savedFiltersRef = useRef<HTMLDivElement>(null);
  const { canWrite: canCategorize } = usePermissions();
  const { preferences: applicationPreferences, update } = usePreferences();
  const activePreset = applicationPreferences.transaction_filters.find((preset) => preset.id === presetId);
  const heading = activePreset?.name ?? title;
  const preferences = applicationPreferences.transactions;
  const setPreferences = (value: SetStateAction<TransactionPreferences>) => update('transactions', value);
  const { sortColumn, ascending, postedAtAscending, pageSize } = preferences;
  const asOf = new Date();
  const panelFilters = buildTransactionFilters(filterValues, asOf);
  const relativeSearchFilters = relativeDates.flatMap((range) => buildRelativeDateFilters(range, asOf));
  // Compare serialized values so newly allocated, equivalent filters do not reload the panel.
  const filtersKey = JSON.stringify([...filters, ...panelFilters, ...searchFilters, ...relativeSearchFilters]);
  const [pagination, setPagination] = useState({ filtersKey, page: 0 });
  const page = pagination.filtersKey === filtersKey ? pagination.page : 0;
  if (pagination.filtersKey !== filtersKey) {
    setPagination({ filtersKey, page: 0 });
  }
  function setPage(nextPage: number) {
    setPagination({ filtersKey, page: nextPage });
  }
  const [retry, setRetry] = useState(0);
  function applyFilter(values: TransactionFilterValues, presetId: string) {
    setAppliedFilter({ values, presetId });
    setSearchText('');
    setAppliedSearch(EMPTY_SEARCH);
    setSearchIssue(null);
    setRetry((previous) => previous + 1);
  }
  const [result, setResult] = useState<TransactionResult | null>(null);
  const previousPageRef = useRef<HTMLButtonElement>(null);
  const nextPageRef = useRef<HTMLButtonElement>(null);
  const scopeKey = JSON.stringify([canCategorize, trackedAccountIds, filtersKey, retry]);
  const requestKey = `${scopeKey}:${sortColumn}:${ascending}:${postedAtAscending}:${page}:${pageSize}`;
  const currentResult = result;
  const matchingCount = result?.scopeKey === scopeKey && !result.error ? result.count : null;
  const isLoading = result?.key !== requestKey;
  const showLoadingDialog = isLoading && (!result || result.search === search);
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: requestKey, ids: [] });
  const selectedIds = selection.key === requestKey ? selection.ids : [];
  if (selection.key !== requestKey) setSelection({ key: requestKey, ids: [] });
  const [categorizing, setCategorizing] = useState<{ ids: string[]; isSelection: boolean; anchorRow: HTMLTableRowElement; anchorCell: HTMLTableCellElement } | null>(null);
  if (!canCategorize && categorizing) setCategorizing(null);
  const selectPageRef = useRef<HTMLInputElement>(null);
  const rowPointerRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const allPageSelected = !!currentResult?.transactions.length
    && currentResult.transactions.every((transaction) => selectedIds.includes(transaction.id));

  useEffect(() => {
    if (parsedSearch.status !== 'ready' || searchText.trim() === search) return;
    const controller = new AbortController();
    const { filters, names, relativeDates = [] } = parsedSearch;
    const timer = window.setTimeout(async () => {
      try {
        const resolved = await resolveFilters(names, filters, accounts, controller.signal);
        if (controller.signal.aborted) return;
        if (resolved.unknown.length) {
          setSearchIssue({ text: searchText, unknown: resolved.unknown });
          return;
        }
        setSearchIssue(null);
        setAppliedSearch({ text: searchText.trim(), filters: resolved.filters, relativeDates });
      } catch {
        if (!controller.signal.aborted) setSearchIssue({ text: searchText, unknown: null });
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accounts, parsedSearch, searchText, search]);

  const currentIssue = searchIssue?.text === searchText ? searchIssue : null;
  const unknownNames = currentIssue?.unknown?.join(', ');
  const searchInvalid = parsedSearch.status === 'invalid' || !!currentIssue;
  useStatusMessage({
    tone: searchInvalid ? 'error' : 'info',
    message: parsedSearch.status === 'open' ? messages.transactionSearchOpen
      : parsedSearch.status === 'invalid' ? messages.transactionSearchInvalid
        : unknownNames
          ? messages.transactionSearchUnknown.replace('{names}', () => unknownNames)
          : currentIssue ? messages.categoriesError : null,
  });

  useEffect(() => {
    if (selectPageRef.current) {
      selectPageRef.current.indeterminate = selectedIds.length > 0 && !allPageSelected;
    }
  }, [selectedIds.length, allPageSelected]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (showLoadingDialog || filterOpen || categorizing || event.defaultPrevented || event.repeat || event.isComposing
        || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement
        && (event.target.isContentEditable
          || event.target.closest('input, textarea, select, [role="textbox"], [role="combobox"], dialog'))) return;

      const searchInput = searchInputRef.current;
      if (event.key === '/' && searchInput) {
        event.preventDefault();
        const dropdown = savedFiltersRef.current;
        if (dropdown?.matches(':popover-open')) dropdown.hidePopover();
        if (searchInput.getClientRects().length) searchInput.focus();
        else mobileSearchButtonRef.current?.click();
        return;
      }

      if (isLoading || event.shiftKey || (event.target instanceof Element
        && event.target.closest('.transaction-filter-buttons'))) return;
      const button = event.key === 'ArrowLeft' ? previousPageRef.current
        : event.key === 'ArrowRight' ? nextPageRef.current : null;
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isLoading, showLoadingDialog, filterOpen, categorizing]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const queryState = { key: requestKey, scopeKey, search, page, pageSize, sortColumn, ascending };

    async function loadTransactions() {
      try {
        const { data, count, error } = await fetchTransactions(supabase, {
          trackedAccountIds,
          filters: JSON.parse(filtersKey) as TransactionFilters,
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
  }, [trackedAccountIds, filtersKey, sortColumn, ascending, postedAtAscending, page, pageSize, requestKey, scopeKey, search]);

  // This is the complete matching query count, across all pages, not checked rows.
  useStatusMessage({
    message: !isLoading && result && !result.error
      ? messages.transactionCount.replace('{count}', new Intl.NumberFormat(messages.language).format(result.count))
      : null,
  });

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

  const locale = messages.language === 'es' ? 'es' : 'en';
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const totalPages = currentResult ? Math.max(1, Math.ceil(currentResult.count / currentResult.pageSize)) : 1;

  async function submitMobileSearch(text: string, signal: AbortSignal) {
    const parsed = parseTransactionSearch(text);
    if (parsed.status !== 'ready') return messages.transactionSearchInvalid;
    const resolved = await resolveFilters(parsed.names, parsed.filters, accounts, signal);
    if (signal.aborted) return null;
    if (resolved.unknown.length) {
      return messages.transactionSearchUnknown.replace('{names}', () => resolved.unknown.join(', '));
    }
    setSearchIssue(null);
    setSearchText(text);
    setAppliedSearch({ text: text.trim(), filters: resolved.filters, relativeDates: parsed.relativeDates ?? [] });
    return null;
  }

  return (
    <section className="dashboard-panel transactions-panel" aria-labelledby="transactions-title">
      <div className="transactions-heading">
        <h1 id="transactions-title">{heading}</h1>
        <div className="transaction-filter-tools">
          <input ref={searchInputRef} className="transaction-filter-search" type="search"
            aria-label={messages.transactionSearch} aria-keyshortcuts="/" placeholder={messages.transactionSearch}
            aria-invalid={searchInvalid || undefined} title={messages.transactionSearchHelp}
            value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          <MobileTransactionSearch buttonRef={mobileSearchButtonRef} messages={messages}
            query={search} onSearch={submitMobileSearch} />
          <div className="transaction-filter-buttons" role="group" aria-label={messages.filterTransactions}
            onKeyDown={(event) => {
              if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
                || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              const dropdown = savedFiltersRef.current;
              if (!dropdown?.matches(':popover-open')) return;
              const items = Array.from(dropdown.querySelectorAll('button'));
              const index = items.findIndex((item) => item === event.target);
              if (!items.length || (index === -1 && event.target !== savedFiltersButtonRef.current)) return;
              event.preventDefault();
              const next = event.key === 'ArrowDown'
                ? (index + 1) % items.length
                : index <= 0 ? items.length - 1 : index - 1;
              items[next]?.focus();
            }}>
            <button ref={filterButtonRef} type="button" className="button button-secondary transaction-filter-trigger"
              aria-label={messages.filterTransactions} title={messages.filterTransactions} aria-expanded={filterOpen !== null}
              aria-haspopup="dialog" data-active={panelFilters.length || activePreset ? '' : undefined}
              onClick={() => setFilterOpen('edit')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" /></svg>
            </button>
            <button ref={savedFiltersButtonRef} type="button" className="button button-secondary transaction-saved-filters-trigger"
              aria-label={messages.savedFilters} title={messages.savedFilters} popoverTarget={savedFiltersId}
              onClick={(event) => {
                const dropdown = savedFiltersRef.current;
                const group = event.currentTarget.parentElement;
                if (!dropdown || !group) return;
                const bounds = group.getBoundingClientRect();
                const width = Math.min(288, window.innerWidth - 24);
                const below = window.innerHeight - bounds.bottom - 16;
                const above = bounds.top - 16;
                const openAbove = below < 240 && above > below;
                dropdown.style.width = `${width}px`;
                dropdown.style.left = `${Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12))}px`;
                dropdown.style.top = openAbove ? 'auto' : `${bounds.bottom + 4}px`;
                dropdown.style.bottom = openAbove ? `${window.innerHeight - bounds.top + 4}px` : 'auto';
                dropdown.style.maxHeight = `${Math.min(240, openAbove ? above : below)}px`;
              }}>
              <span aria-hidden="true">▾</span>
            </button>
            <div id={savedFiltersId} ref={savedFiltersRef} popover="auto" className="transaction-saved-filters">
              {search && matchingCount !== null && (
                <button type="button" className="menu-button" onClick={() => {
                  savedFiltersRef.current?.hidePopover();
                  setFilterOpen('save-search');
                }}>{messages.saveCurrentSearch}</button>
              )}
              {applicationPreferences.transaction_filters.length === 0
                ? <p>{messages.noSavedFilters}</p>
                : applicationPreferences.transaction_filters.map((preset) => (
                  <button key={preset.id} type="button" className="menu-button" title={preset.values.sourceSearch}
                    onClick={() => {
                      savedFiltersRef.current?.hidePopover();
                      applyFilter(preset.values, preset.id);
                    }}>
                    {preset.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
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
          <div key={currentResult.key} className="panel-scroll" tabIndex={0} role="region" aria-labelledby="transactions-title" aria-busy={isLoading}>
            <table className="transaction-table">
              <thead>
                <tr>
                  {canCategorize && <th scope="col" className="transaction-selection">
                    <input
                      ref={selectPageRef}
                      type="checkbox"
                      aria-label={messages.selectPage}
                      checked={allPageSelected}
                      disabled={isLoading || currentResult.transactions.length === 0}
                      onChange={(event) => setSelection({ key: requestKey, ids: event.target.checked ? currentResult.transactions.map((transaction) => transaction.id) : [] })}
                    />
                  </th>}
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
                  <tr
                    key={transaction.id}
                    className={canCategorize && !isLoading ? 'transaction-selectable-row' : undefined}
                    data-categorize-target={canCategorize && categorizing?.ids.includes(transaction.id) ? '' : undefined}
                    onPointerDown={(event) => {
                      rowPointerRef.current = canCategorize && !isLoading && event.isPrimary && event.button === 0
                        ? { x: event.clientX, y: event.clientY, dragged: false } : null;
                    }}
                    onPointerMove={(event) => {
                      const pointer = rowPointerRef.current;
                      if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) {
                        pointer.dragged = true;
                      }
                    }}
                    onPointerCancel={() => { rowPointerRef.current = null; }}
                    onClick={(event) => {
                      const pointer = rowPointerRef.current;
                      rowPointerRef.current = null;
                      if (!canCategorize || isLoading || event.defaultPrevented) return;
                      // Interactive controls handle their own clicks. In particular,
                      // checkbox clicks must not toggle selection a second time.
                      if (event.target instanceof Element
                        && event.target.closest('input, button, a, select, textarea, .transaction-category-cell')) return;
                      if (pointer && (pointer.dragged
                        || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4)) return;
                      const textSelection = window.getSelection();
                      if (textSelection && !textSelection.isCollapsed) return;
                      setSelection((previous) => {
                        const ids = previous.key === requestKey ? previous.ids : [];
                        return { key: requestKey, ids: ids.includes(transaction.id)
                          ? ids.filter((id) => id !== transaction.id) : [...ids, transaction.id] };
                      });
                    }}
                  >
                    {canCategorize && <td className="transaction-selection">
                      <input
                        type="checkbox"
                        aria-label={messages.selectTransaction.replace('{description}', transaction.description?.name ?? transaction.description?.memo ?? '—').replace('{date}', dateFormatter.format(new Date(transaction.posted_at)))}
                        checked={selectedIds.includes(transaction.id)}
                        disabled={isLoading}
                        onChange={(event) => setSelection({ key: requestKey, ids: event.target.checked ? [...selectedIds, transaction.id] : selectedIds.filter((id) => id !== transaction.id) })}
                      />
                    </td>}
                    <td>{dateFormatter.format(new Date(transaction.posted_at))}</td>
                    <td>{transaction.account?.name ?? '—'}</td>
                    <td>{transaction.description?.name ?? '—'}</td>
                    <td>{transaction.description?.memo ?? '—'}</td>
                    <td className={canCategorize ? 'transaction-category-cell' : undefined}>
                      {canCategorize ? <button
                        type="button"
                        className="category-cell-button"
                        disabled={isLoading}
                        aria-label={`${messages.categorizeTransaction}: ${transaction.category?.name ?? messages.uncategorized}`}
                        onClick={(event) => {
                          const anchorRow = event.currentTarget.closest('tr');
                          const anchorCell = event.currentTarget.closest('td');
                          if (anchorRow && anchorCell) setCategorizing({ ids: selectedIds.length ? [...selectedIds] : [transaction.id], isSelection: selectedIds.length > 0, anchorRow, anchorCell });
                        }}
                      >{transaction.category?.name ?? '—'}</button>
                        : transaction.category?.name ?? '—'}
                    </td>
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
            {canCategorize && selectedIds.length > 0 && (
              <span className="pagination-selection" role="status">
                {messages.selectedTransactions.replace('{count}', String(selectedIds.length))}
              </span>
            )}
            <div className="pagination-controls">
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
          </div>
        </>
      )}
      {canCategorize && categorizing && (
        <CategorizePanel
          messages={messages}
          transactionIds={categorizing.ids}
          isSelection={categorizing.isSelection}
          anchorRow={categorizing.anchorRow}
          anchorCell={categorizing.anchorCell}
          onClose={(changed) => {
            setCategorizing(null);
            if (changed) {
              setRetry((previous) => previous + 1);
              onCategoriesChanged?.();
            }
          }}
        />
      )}
      {filtersKey !== '[]' && matchingCount !== null && <TransactionTotalStatus messages={messages}
        trackedAccountIds={trackedAccountIds} filtersKey={filtersKey} revision={retry}
        hasMatches={matchingCount > 0} />}
      {filterOpen && <TransactionFilterPanel messages={messages} trackedAccountIds={trackedAccountIds}
        values={projectTransactionSearch(filterValues, search, searchFilters, relativeDates)}
        activePresetId={search ? undefined : activePreset?.id}
        focusName={filterOpen === 'save-search'}
        onClose={() => { setFilterOpen(null); filterButtonRef.current?.focus(); }}
        onApply={(values, appliedPresetId) => {
          applyFilter(values, appliedPresetId);
          setFilterOpen(null);
          filterButtonRef.current?.focus();
        }} />}
      {showLoadingDialog && <LoadingDialog label={messages.loadingTransactions} />}
    </section>
  );
}

async function resolveFilters(names: string[], filters: TransactionFilters, accounts: Account[], signal: AbortSignal) {
  if (!names.length) return { filters, unknown: [] };
  const available = await fetchCategories(supabase, signal);
  signal.throwIfAborted();
  const resolved = resolveSearchNames(names, available, accounts);
  return { filters: [...filters, ...resolved.filters], unknown: resolved.unknown };
}
