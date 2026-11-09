import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export type AuthStatus = 'loading' | 'ready' | 'error';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setStatus('ready');
        setSignOutFailed(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStatus('error');
          return;
        }
        setUser(data.session?.user ?? null);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [retryCount]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutFailed(true);
    } catch {
      setSignOutFailed(true);
    } finally {
      setSigningOut(false);
    }
  }, []);

  const retrySessionCheck = useCallback(() => {
    setStatus('loading');
    setRetryCount((count) => count + 1);
  }, []);

  return { user, status, signOutFailed, signingOut, signOut, retrySessionCheck };
}
