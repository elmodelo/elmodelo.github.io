import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createLoadingTasks } from '../lib/loadingTasks';

const LoadingContext = createContext<ReturnType<typeof createLoadingTasks> | null>(null);

export function LoadingDialogProvider({ children }: { children: ReactNode }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [store] = useState(() => createLoadingTasks(() => {
    // Capture before making the page inert, which can blur the current control.
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }));
  const { pending, visible, label } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible && !dialog.open) dialog.showModal();
    else if (!visible) {
      dialog.close();
      const target = returnFocus.current;
      if (!pending && target?.isConnected && !target.closest('[inert]')
        && (document.activeElement === document.body || document.activeElement === dialog)) {
        target.focus({ preventScroll: true });
      }
    }
  }, [visible, pending]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  // Native modal dialogs escape ancestor inertness; block those explicitly too.
  useEffect(() => {
    if (!pending) return;
    const blocked = new Map<HTMLDialogElement, boolean>();
    const blockDialogs = (records: MutationRecord[] = []) => {
      let opened = records.some((record) => record.type === 'attributes'
        && record.target instanceof HTMLDialogElement
        && record.target !== dialogRef.current && record.target.open);
      document.querySelectorAll<HTMLDialogElement>('dialog').forEach((element) => {
        if (element === dialogRef.current || blocked.has(element)) return;
        blocked.set(element, element.inert);
        element.inert = true;
        opened ||= element.open;
      });
      // A newly opened native dialog otherwise moves above an existing spinner.
      const dialog = dialogRef.current;
      if (opened && dialog?.open) { dialog.close(); dialog.showModal(); }
    };
    blockDialogs();
    const observer = new MutationObserver(blockDialogs);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => {
      observer.disconnect();
      blocked.forEach((inert, element) => { element.inert = inert; });
    };
  }, [pending]);

  return <LoadingContext.Provider value={store}>
    <div inert={pending || undefined} aria-busy={pending} style={{ display: 'contents' }}>{children}</div>
    <dialog ref={dialogRef} className="LoadingDialog" aria-label={label || undefined}
      onCancel={(event) => event.preventDefault()}>
      <span className="loading-indicator" aria-hidden="true" />
      <p role="status">{label}</p>
    </dialog>
  </LoadingContext.Provider>;
}

interface LoadingDialogProps {
  label: string;
  open?: boolean;
  priority?: number;
}

export default function LoadingDialog({ label, open = true, priority = 0 }: LoadingDialogProps) {
  const store = useContext(LoadingContext);
  const id = useId();
  useLayoutEffect(() => {
    if (open) return store?.register(id, label, priority);
  }, [store, id, label, open, priority]);
  return null;
}
