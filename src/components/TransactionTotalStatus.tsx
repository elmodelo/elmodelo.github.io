import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { loadTransactionTotal, transactionTotalMessage } from '../lib/transactionTotals';
import { useStatusMessage } from '../hooks/useStatusMessages';
import type { LocaleMessages } from '../locales/types';
import type { TransactionFilters } from '../lib/transactionFilters';

type Total = Awaited<ReturnType<typeof loadTransactionTotal>>;
interface Props {
  messages: LocaleMessages;
  trackedAccountIds: string[];
  filtersKey: string;
  revision: number;
}

/** One total for the complete filter, independent of page, sort and checked rows. */
export default function TransactionTotalStatus({ messages, trackedAccountIds, filtersKey, revision }: Props) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([trackedAccountIds, filtersKey, revision, attempt]);
  const [result, setResult] = useState<{ key: string; total?: Total; error?: boolean } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const [accounts, filters] = JSON.parse(key) as [string[], string];
    void loadTransactionTotal(supabase, {
      trackedAccountIds: accounts, filters: JSON.parse(filters) as TransactionFilters, signal: controller.signal,
    }).then((total) => {
      if (active) setResult({ key, total });
    }).catch(() => {
      if (active) setResult({ key, error: true });
    });
    return () => { active = false; controller.abort(); };
  }, [key]);

  const current = result?.key === key ? result : null;
  const error = !!(current?.error || current?.total?.conversionError);
  useStatusMessage({
    message: !current ? messages.loadingTransactionTotal
      : current.total ? transactionTotalMessage(messages, current.total) : messages.transactionTotalError,
    tone: error ? 'error' : 'info',
    action: error ? { label: messages.retry, onClick: retry } : undefined,
  });
  return null;
}
