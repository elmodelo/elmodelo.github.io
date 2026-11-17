import { createContext, useContext, useEffect, useState, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createStatusMessages, type StatusMessageOptions } from '../lib/statusMessages';

type StatusMessages = ReturnType<typeof createStatusMessages>;
const StatusContext = createContext<StatusMessages | null>(null);

export function StatusMessagesProvider({ children, store }: { children: ReactNode; store?: StatusMessages }) {
  const [messages] = useState(() => store ?? createStatusMessages());
  useEffect(() => () => messages.clear(), [messages]);
  return <StatusContext.Provider value={messages}>{children}</StatusContext.Provider>;
}

function useStatusStore() {
  const store = useContext(StatusContext);
  if (!store) throw new Error('StatusMessagesProvider is required');
  return store;
}

/** Replaces this publisher's status on change; untimed messages belong to its panel. */
export function useStatusMessage({ message, tone = 'info', action, durationSeconds }: StatusMessageOptions) {
  const store = useStatusStore();
  const label = action?.label;
  const onClick = action?.onClick;
  const disabled = action?.disabled;
  const current = useRef<{ remove: () => void; panelScoped: boolean } | null>(null);
  useEffect(() => {
    current.current?.remove();
    current.current = message ? {
      remove: store.publish({
        message, tone, durationSeconds,
        action: label && onClick ? { label, onClick, disabled } : undefined,
      }),
      panelScoped: durationSeconds === undefined,
    } : null;
  }, [store, message, tone, durationSeconds, label, onClick, disabled]);
  useEffect(() => () => {
    // Timed notifications can outlive their panel; permanent panel status cannot.
    if (current.current?.panelScoped) current.current.remove();
  }, [store]);
}

export function useStatusMessages() {
  const store = useStatusStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
