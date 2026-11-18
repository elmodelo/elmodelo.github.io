import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { LocaleMessages } from '../locales/types';

interface Props {
  buttonRef: RefObject<HTMLButtonElement | null>;
  messages: LocaleMessages;
  query: string;
  onSearch: (text: string, signal: AbortSignal) => Promise<string | null>;
}

export default function MobileTransactionSearch({ buttonRef, messages, query, onSearch }: Props) {
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const dialog = dialogRef.current;
    function updateViewport() {
      if (!dialog || !viewport) return;
      dialog.style.setProperty('--search-viewport-height', `${viewport.height}px`);
      dialog.style.setProperty('--search-viewport-top', `${viewport.offsetTop}px`);
    }
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      requestRef.current?.abort();
    };
  }, []);

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    const advanced = query.startsWith('`') && query.endsWith('`');
    const plainSearch = query ? 'text:"' + query.replace(/["\\]/g, '\\$&') + '"' : '';
    setDraft(advanced ? query.slice(1, -1) : query.includes('`') ? query : plainSearch);
    setError(null);
    buttonRef.current?.focus();
    dialog.showModal();
    inputRef.current?.focus();
  }

  function close() {
    requestRef.current?.abort();
    requestRef.current = null;
    setPending(false);
    dialogRef.current?.close();
  }

  function addTextTerm() {
    const input = inputRef.current;
    if (!input) return;
    const opening = draft.indexOf('`');
    const closing = opening === -1 ? -1 : draft.indexOf('`', opening + 1);
    const before = (closing === -1 ? draft : draft.slice(0, closing)).trimEnd();
    const after = closing === -1 ? '' : draft.slice(closing);
    const prefix = /(?:^|[\s`])text:$/.test(before) ? before
      : before + (before && !before.endsWith('`') ? ' ' : '') + 'text:';
    const next = prefix + after;
    input.value = next;
    setDraft(next);
    setError(null);
    input.focus();
    input.setSelectionRange(prefix.length, prefix.length);
  }

  async function submit() {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    const text = draft.trim();
    try {
      const problem = await onSearch(text && !text.includes('`') ? '`' + text + '`' : text, controller.signal);
      if (controller.signal.aborted) return;
      if (problem) setError(problem);
      else close();
    } catch {
      if (!controller.signal.aborted) setError(messages.categoriesError);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="button button-secondary mobile-transaction-search-trigger"
        aria-label={messages.transactionSearch} aria-haspopup="dialog" aria-keyshortcuts="/" onClick={open}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </button>
      <dialog ref={dialogRef} className="mobile-transaction-search-dialog" aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); close(); }}>
        <h2 id={titleId}>{messages.transactionSearch}</h2>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <textarea ref={inputRef} className="transaction-filter-search" aria-label={messages.transactionSearch}
            aria-describedby={helpId} aria-invalid={!!error || undefined}
            placeholder={messages.transactionSearch} rows={3} value={draft} readOnly={pending}
            onChange={(event) => { setDraft(event.target.value); setError(null); }} />
          <button type="button" className="text-button" disabled={pending} onClick={addTextTerm}>
            {messages.transactionPowerSearchAddText}
          </button>
          <p id={helpId}>{messages.transactionPowerSearchExample}</p>
          {error && <p className="form-message form-message-error" role="alert">{error}</p>}
          <div className="transaction-filter-actions">
            <button type="button" className="button button-secondary" onClick={close}>{messages.cancel}</button>
            <button type="submit" className="button button-primary" disabled={pending}>{messages.transactionSearch}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
