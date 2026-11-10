import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePersistedState } from './usePersistedState';

export interface Account {
  id: string;
  name: string;
}

function isAccountSelection(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every((id) => typeof id === 'string'));
}

/** Own this in the dashboard and pass trackedAccountIds to panels that query finance data. */
export function useTrackedAccounts(userId: string) {
  // Until the first edit, track all available accounts. An empty array tracks none.
  const [selection, setTrackedAccountIds] = usePersistedState<string[] | null>(
    'trackedAccounts', null, isAccountSelection, userId,
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadAccounts() {
      try {
        const { data, error } = await supabase.schema('finance').from('account')
          .select('id, name').order('name').abortSignal(controller.signal);
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

  function retryAccounts() {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }

  return { accounts, trackedAccountIds, setTrackedAccountIds, status, retryAccounts };
}
