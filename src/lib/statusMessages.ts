export interface StatusMessageOptions {
  message?: string | null;
  tone?: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Omit to keep the message until its publishing panel unmounts. */
  durationSeconds?: number;
}
export interface StatusEntry extends StatusMessageOptions { id: number }

/** One shared strip; new publishers appear first, and expiry closes the gap. */
export function createStatusMessages() {
  let entries: StatusEntry[] = [];
  let nextId = 0;
  const listeners = new Set<() => void>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  function notify() { listeners.forEach((listener) => listener()); }
  function remove(id: number) {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
    const remaining = entries.filter((entry) => entry.id !== id);
    if (remaining.length === entries.length) return;
    entries = remaining;
    notify();
  }
  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    clear() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      if (!entries.length) return;
      entries = [];
      notify();
    },
    publish(options: StatusMessageOptions) {
      if (!options.message) return () => {};
      const id = ++nextId;
      entries = [{ ...options, id }, ...entries];
      if (options.durationSeconds !== undefined) {
        timers.set(id, setTimeout(() => remove(id), Math.max(0, options.durationSeconds) * 1000));
      }
      notify();
      return () => remove(id);
    },
  };
}
