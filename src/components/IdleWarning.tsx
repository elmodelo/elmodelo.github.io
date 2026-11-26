import { useEffect, useRef, type CSSProperties } from 'react';
import type { LocaleMessages } from '../locales/types';
import { IDLE_WARNING_MS } from '../lib/idleSession';

export default function IdleWarning({ open, checking, seconds, messages, onStay, onSignOut }: {
  open: boolean; checking: boolean; seconds: number; messages: LocaleMessages; onStay: () => void; onSignOut: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dimProgress = Math.max(0, Math.min(1, (IDLE_WARNING_MS / 1000 - seconds) / (IDLE_WARNING_MS / 1000 - 10)));
  const concealProgress = Math.max(0, Math.min(1, (10 - seconds) / 10));
  const shade = `rgb(0 0 0 / ${0.55 * (1 - concealProgress)})`;
  // Keep the filtered page visible through the tint. Opacity on the entire
  // backdrop would blend the original sharp page back over the blur.
  const signInGlow = `color-mix(in srgb, color-mix(in srgb, var(--sign-in-accent) var(--sign-in-glow), transparent) ${100 * concealProgress}%, transparent)`;
  const backdropStyle = {
    '--idle-backdrop-background': concealProgress < 1
      ? `linear-gradient(${shade}, ${shade}), radial-gradient(ellipse at 50% 40%, ${signInGlow}, transparent 48%), color-mix(in srgb, var(--sign-in-page) ${100 * concealProgress}%, transparent)`
      : 'var(--sign-in-background)',
    '--idle-backdrop-opacity': open ? 1 : 0,
    '--idle-backdrop-blur': `${open ? 16 * dimProgress : 0}px`,
  } as CSSProperties;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      element.removeAttribute('data-closing');
      if (!element.open) element.showModal();
    } else if (element.open) {
      element.setAttribute('data-closing', '');
      const timer = window.setTimeout(() => element.close(),
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
      return () => window.clearTimeout(timer);
    }
  }, [open]);
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="result-dialog" style={backdropStyle} data-idle-warning aria-labelledby="idle-warning-title"
    data-verifying={checking && seconds <= 0 ? '' : undefined} aria-busy={checking}
    aria-describedby="idle-warning-message" onCancel={(event) => { event.preventDefault(); if (!checking) onStay(); }}>
    <h2 id="idle-warning-title">{messages.idleWarningTitle}</h2>
    <p id="idle-warning-message">{messages.idleWarning.replace('{seconds}', String(seconds))}</p>
    <div className="idle-warning-actions">
      <button className="button button-primary" type="button" disabled={checking || !open} onClick={onStay} autoFocus>{messages.idleStay}</button>
      <button className="button button-secondary" type="button" disabled={checking || !open} onClick={onSignOut}>{messages.signOut}</button>
    </div>
  </dialog>;
}
