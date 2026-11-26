import { useEffect, useRef, type CSSProperties } from 'react';
import type { LocaleMessages } from '../locales/types';
import { IDLE_WARNING_MS } from '../lib/idleSession';

export default function IdleWarning({ seconds, messages, onStay, onSignOut }: {
  seconds: number; messages: LocaleMessages; onStay: () => void; onSignOut: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dimProgress = Math.max(0, Math.min(1, (IDLE_WARNING_MS / 1000 - seconds) / (IDLE_WARNING_MS / 1000 - 10)));
  const backdropStyle = {
    '--idle-backdrop-opacity': 0.25 + 0.75 * dimProgress,
    '--idle-backdrop-blur': `${12 * dimProgress}px`,
  } as CSSProperties;
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return <dialog ref={dialog} className="result-dialog" style={backdropStyle} data-idle-warning aria-labelledby="idle-warning-title"
    aria-describedby="idle-warning-message" onCancel={(event) => { event.preventDefault(); onStay(); }}>
    <h2 id="idle-warning-title">{messages.idleWarningTitle}</h2>
    <p id="idle-warning-message">{messages.idleWarning.replace('{seconds}', String(seconds))}</p>
    <div className="idle-warning-actions">
      <button className="button button-primary" type="button" onClick={onStay} autoFocus>{messages.idleStay}</button>
      <button className="button button-secondary" type="button" onClick={onSignOut}>{messages.signOut}</button>
    </div>
  </dialog>;
}
