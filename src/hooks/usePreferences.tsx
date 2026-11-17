import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type SetStateAction } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createPreferencesWriter, parsePreferences, type ApplicationPreferences } from '../lib/preferences';

export type PreferencesStatus = 'loading' | 'load-error' | 'idle' | 'saving' | 'saved' | 'save-error';
interface PreferencesContextValue {
  preferences: ApplicationPreferences;
  status: PreferencesStatus;
  update: <K extends keyof ApplicationPreferences>(key: K, value: SetStateAction<ApplicationPreferences[K]>) => void;
  retry: () => void;
}
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Key this provider by user ID to isolate state and in-flight requests across sessions. */
export function PreferencesProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [state, setState] = useState(() => ({ preferences: parsePreferences(null), revision: 0 }));
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(userId ? 'loading' : 'ready');
  const [savedRevision, setSavedRevision] = useState(0);
  const [dismissedRevision, setDismissedRevision] = useState(0);
  const [failedRevision, setFailedRevision] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const write = useMemo(() => createPreferencesWriter(async (preferences) => {
    const { error } = await supabase.schema('app').from('preferences')
      .upsert({ user: userId, preferences }, { onConflict: 'user' });
    if (error) throw error;
  }), [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.schema('app').from('preferences')
          .select('preferences').eq('user', userId).abortSignal(controller.signal).maybeSingle();
        if (!active) return;
        if (error) throw error;
        setState({ preferences: parsePreferences(data?.preferences), revision: 0 });
        setLoadStatus('ready');
      } catch {
        if (active) setLoadStatus('error');
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [userId, attempt]);

  useEffect(() => {
    if (!userId || loadStatus !== 'ready' || state.revision === 0) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void write(state.preferences).then(() => {
        if (active) setSavedRevision(state.revision);
      }).catch(() => {
        if (active) setFailedRevision(state.revision);
      });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [userId, loadStatus, state, write]);

  // Success feedback is temporary; failures stay visible until retry or another edit.
  useEffect(() => {
    if (savedRevision === 0 || savedRevision !== state.revision) return;
    const timer = window.setTimeout(() => setDismissedRevision(savedRevision), 4000);
    return () => window.clearTimeout(timer);
  }, [savedRevision, state.revision]);

  const update = useCallback<PreferencesContextValue['update']>((key, value) => {
    // Never overwrite preferences with defaults while loading or after a load error.
    if (loadStatus !== 'ready') return;
    setState((previous) => ({
      preferences: {
        ...previous.preferences,
        [key]: typeof value === 'function' ? value(previous.preferences[key]) : value,
      },
      revision: previous.revision + 1,
    }));
  }, [loadStatus]);

  const status: PreferencesStatus = loadStatus === 'loading' ? 'loading'
    : loadStatus === 'error' ? 'load-error'
    : failedRevision === state.revision ? 'save-error'
    : !userId || state.revision === 0 ? 'idle'
    : savedRevision === state.revision ? (dismissedRevision === state.revision ? 'idle' : 'saved') : 'saving';
  function retry() {
    if (loadStatus === 'error') {
      setLoadStatus('loading');
      setAttempt((previous) => previous + 1);
    } else {
      setState((previous) => ({ ...previous, revision: previous.revision + 1 }));
    }
  }

  return <PreferencesContext.Provider value={{ preferences: state.preferences, status, update, retry }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('PreferencesProvider is required');
  return context;
}
