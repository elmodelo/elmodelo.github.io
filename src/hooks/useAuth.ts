import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { hasMfaSession } from '../lib/mfa';
import { getSessionAppRole } from '../lib/permissions';

export type AuthStatus = 'loading' | 'ready' | 'error';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const user = session?.user ?? null;
  const mfaVerified = hasMfaSession(session);
  const appRole = mfaVerified ? getSessionAppRole(session) : null;
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
        setSession(session);
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
        setSession(data.session);
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

  return { user, appRole, mfaVerified, status, signOutFailed, signingOut, signOut, retrySessionCheck };
}
