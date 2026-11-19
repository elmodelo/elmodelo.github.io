import { useLayoutEffect, useId, useRef } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import type { TransactionFilters } from '../lib/transactionFilters';
import { cashFlowCellFilters } from '../lib/cashFlow';
import TransactionsPanel from './TransactionsPanel';

interface Props {
  messages: LocaleMessages;
  accounts: Account[];
  trackedAccountIds: string[];
  year: number;
  month: number;
  categoryId: string;
  categoryName: string;
  currency: string;
  onClose: (changed: boolean) => void;
}

export default function CashFlowTransactionsPanel({ messages, accounts, trackedAccountIds, year, month, categoryId, categoryName, currency, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const changedRef = useRef(false);
  const closingRef = useRef(false);
  const titleId = useId();
  const monthLabel = new Intl.DateTimeFormat(messages.language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00Z`));
  const title = messages.cashFlowTransactionsTitle.replace('{category}', () => categoryName)
    .replace('{month}', monthLabel).replace('{currency}', currency);
  const filters = cashFlowCellFilters(year, month, categoryId) as TransactionFilters;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function dismiss() {
    if (closingRef.current) return;
    closingRef.current = true;
    // Close synchronously so focus can return outside the modal before unmount.
    dialogRef.current?.close();
    onClose(changedRef.current);
  }

  return <dialog ref={dialogRef} className="cash-flow-transactions-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); dismiss(); }}
    onClose={(event) => { if (!event.currentTarget.open) dismiss(); }}>
    <div className="cash-flow-dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" autoFocus className="button button-secondary transaction-filter-close"
        aria-label={messages.close} title={messages.close} onClick={dismiss}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <TransactionsPanel messages={messages} accounts={accounts} trackedAccountIds={trackedAccountIds}
      filters={filters} title={messages.transactions} onCategoriesChanged={() => { changedRef.current = true; }} />
  </dialog>;
}
