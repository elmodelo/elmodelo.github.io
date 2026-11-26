import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { createIdleSession, getSessionId } from '../lib/idleSession';

type IdleState = { status: 'checking' | 'active' | 'warning' | 'error' | 'expired'; hasAccess: boolean; seconds: number };
const initial: IdleState = { status: 'checking', hasAccess: false, seconds: 0 };

export function useIdleSession(session: Session | null, enabled: boolean) {
  const id = getSessionId(session);
  const key = enabled && session ? `${session.user.id}:${id ?? 'invalid'}` : '';
  const currentKey = useRef(key);
  currentKey.current = key;
  const controller = useRef<ReturnType<typeof createIdleSession> | null>(null);
  const [state, setState] = useState<IdleState & { key: string }>({ ...initial, key: '' });

  useEffect(() => {
    if (!key) return;
    let active = true;
    const storageKey = `elmodelo:session-activity:${id}`;
    const idle = createIdleSession({
      client: supabase,
      onChange: (next: IdleState) => { if (active) setState({ ...next, key }); },
      onActivityRecorded: () => {
        // Notifications cause a server status read in other tabs, never a touch.
        try { localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`); } catch { /* optional */ }
      },
      onExpire: async () => {
        if (currentKey.current !== key) return;
        try { await supabase.schema('app').rpc('end_session'); } catch { /* expiry is already enforced by RLS */ }
        if (currentKey.current !== key) return;
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* keep the expired screen locked */ }
      },
    });
    controller.current = idle;
    const activity = (event: Event) => { if (event.isTrusted && !document.hidden
      && !(event.target instanceof Element && event.target.closest('[data-idle-warning]'))) idle.activity(); };
    const resume = () => { if (!document.hidden) void idle.check(); };
    const storage = (event: StorageEvent) => { if (event.key === storageKey) void idle.check(false); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true, capture: true }));
    window.addEventListener('focus', resume);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', resume);
    const timer = window.setInterval(() => idle.tick(), 1000);
    void idle.start();
    return () => {
      active = false;
      idle.stop();
      if (controller.current === idle) controller.current = null;
      clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity, true));
      window.removeEventListener('focus', resume);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key, id]);

  return {
    ...(key && state.key === key ? state : initial),
    stay: () => controller.current?.stay(),
  };
}
