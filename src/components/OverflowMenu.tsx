import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export default function OverflowMenu({ label, children }: {
  label: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);
  const menuItems = () => Array.from(container.current?.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"], [role="menuitemcheckbox"]',
  ) ?? []);
  useEffect(() => {
    if (!open) return;
    const items = menuItems();
    (focusLast.current ? items.at(-1) : items[0])?.focus();
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
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="net-worth-actions" ref={container} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="net-worth-overflow" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { focusLast.current = false; setOpen((value) => !value); }} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); focusLast.current = event.key === 'ArrowUp';
          if (open) {
            const items = menuItems();
            (focusLast.current ? items.at(-1) : items[0])?.focus();
          } else setOpen(true);
        }
      }}><span aria-hidden="true">⋯</span></button>
    {open && <div id={id} role="menu" aria-label={label} className="net-worth-actions-menu"
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = menuItems();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      {children(close)}
    </div>}
  </div>;
}
