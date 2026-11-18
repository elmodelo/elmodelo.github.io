import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { loadTransactionTotal, transactionTotalFailureMessage, transactionTotalMessage } from '../lib/transactionTotals';
import { useStatusMessage } from '../hooks/useStatusMessages';
import type { LocaleMessages } from '../locales/types';
import type { TransactionFilters } from '../lib/transactionFilters';

type Total = Awaited<ReturnType<typeof loadTransactionTotal>>;
interface Props {
  messages: LocaleMessages;
  trackedAccountIds: string[];
  filtersKey: string;
  revision: number;
  hasMatches: boolean;
}

/** One total for the complete filter, independent of page, sort and checked rows. */
export default function TransactionTotalStatus({ messages, trackedAccountIds, filtersKey, revision, hasMatches }: Props) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([trackedAccountIds, filtersKey, revision, attempt]);
  const [result, setResult] = useState<{ key: string; total: Total } | { key: string; error: unknown } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!hasMatches) return;
    let active = true;
    const controller = new AbortController();
    const [accounts, filters] = JSON.parse(key) as [string[], string];
    void loadTransactionTotal(supabase, {
      trackedAccountIds: accounts, filters: JSON.parse(filters) as TransactionFilters, signal: controller.signal,
    }).then((total) => {
      if (active) setResult({ key, total });
    }).catch((error: unknown) => {
      if (active) setResult({ key, error });
    });
    return () => { active = false; controller.abort(); };
  }, [hasMatches, key]);

  const current = result?.key === key ? result : null;
  const error = hasMatches && !!current && ('error' in current || current.total.conversionError);
  useStatusMessage({
    message: !hasMatches ? transactionTotalMessage(messages, { cad: 0 })
      : !current ? messages.loadingTransactionTotal
        : 'total' in current ? transactionTotalMessage(messages, current.total)
          : transactionTotalFailureMessage(messages, current.error, JSON.parse(filtersKey) as TransactionFilters),
    tone: error ? 'error' : 'info',
    action: error ? { label: messages.retry, onClick: retry } : undefined,
  });
  return null;
}
