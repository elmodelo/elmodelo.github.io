import { useEffect, useId, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';

export default function NetWorthActions({ messages, onAdd }: { messages: LocaleMessages; onAdd: () => void }) {
  const { canWrite } = usePermissions();
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); setOpen(false); trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (!canWrite) return null;
  return <div className="net-worth-actions" ref={container} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="net-worth-overflow" aria-label={messages.netWorthActions}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen((value) => !value)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true); item.current?.focus();
        }
      }}><span aria-hidden="true">⋯</span></button>
    {open && <div id={id} role="menu" aria-label={messages.netWorthActions} className="net-worth-actions-menu">
      <button type="button" ref={item} role="menuitem" tabIndex={-1} onClick={() => {
        setOpen(false); trigger.current?.focus(); onAdd();
      }} onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); item.current?.focus();
        }
      }}>{messages.assetAdd}</button>
    </div>}
  </div>;
}
