import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePreferences } from './usePreferences';

export interface Account {
  id: string;
  name: string;
  currency: string;
}

/** Load accounts once and resolve independent transaction and Cash Flow selections. */
export function useTrackedAccounts(userId: string) {
  // Each selection defaults to all accounts independently; an empty array selects none.
  const { preferences, update } = usePreferences();
  const selection = preferences.trackedAccounts;
  const cashFlowSelection = preferences.cashFlowAccounts;
  const setTrackedAccountIds = (ids: string[]) => update('trackedAccounts', ids);
  const setCashFlowAccountIds = (ids: string[]) => update('cashFlowAccounts', ids);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadAccounts() {
      try {
        const { data, error } = await supabase.schema('finance').from('account')
          .select('id, name, currency').order('name').abortSignal(controller.signal);
        if (!active) return;
        if (error || data === null) {
          setStatus('error');
          return;
        }
        setAccounts(data);
        setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    }

    void loadAccounts();
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, attempt]);

  const trackedAccountIds = useMemo(
    () => accounts.filter((account) => selection === null || selection.includes(account.id))
      .map((account) => account.id),
    [accounts, selection],
  );

  // Cash Flow has its own selection over all available accounts, including untracked ones.
  const cashFlowAccountIds = useMemo(
    () => accounts.filter((account) => cashFlowSelection === null || cashFlowSelection.includes(account.id))
      .map((account) => account.id),
    [accounts, cashFlowSelection],
  );

  function retryAccounts() {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }

  return { accounts, trackedAccountIds, setTrackedAccountIds, cashFlowAccountIds, setCashFlowAccountIds, status, retryAccounts };
}
