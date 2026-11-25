/** Coalesce sequential stages into one wait, delaying only the first presentation. */
export function createLoadingTasks(onStart?: () => void) {
  const tasks = new Map<string, { label: string; priority: number }>();
  let snapshot = { pending: false, visible: false, label: '' };
  let reveal: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(next: typeof snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function refresh() {
    const task = [...tasks.values()].sort((a, b) => b.priority - a.priority)[0];
    if (task) publish({ ...snapshot, pending: true, label: task.label });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    register(id: string, label: string, priority = 0) {
      clearTimeout(settle);
      tasks.set(id, { label, priority });
      if (!snapshot.pending) {
        onStart?.();
        reveal = setTimeout(() => {
          if (tasks.size) publish({ ...snapshot, visible: true });
        }, 200);
      }
      refresh();
      return () => {
        tasks.delete(id);
        if (tasks.size) refresh();
        else settle = setTimeout(() => {
          clearTimeout(reveal);
          publish({ pending: false, visible: false, label: '' });
        }, 0);
      };
    },
  };
}
