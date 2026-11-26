import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useIdleSession } from './useIdleSession';
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

  useEffect(() => {
    let active = true;
    const rejectSession = async () => {
      if (!active) return;
      setStatus('error');
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (active && !error) {
          setSession(null);
          setStatus('ready');
        }
      } catch { /* Keep access blocked if local sign-out also fails. */ }
    };
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
          void rejectSession();
          return;
        }
        setSession(data.session);
        setStatus('ready');
      })
      .catch(() => {
        void rejectSession();
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const idle = useIdleSession(session, status === 'ready' && mfaVerified);

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

  return { user, idle, appRole, mfaVerified, status, signOutFailed, signingOut, signOut };
}
