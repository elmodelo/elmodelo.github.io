import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getAnchoredPanelPosition } from '../lib/anchoredPanelPosition';

export default function OverflowMenu({ label, children }: {
  label: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight?: number }>({ left: 0, top: 0 });
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);
  const menuItems = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"], [role="menuitemcheckbox"]',
  ) ?? []);
  const contains = (target: EventTarget | null) => target instanceof Node
    && (container.current?.contains(target) || panel.current?.contains(target));

  useEffect(() => {
    // Inherit the active theme without inheriting a card's clipping or stacking context.
    setPortalTarget(trigger.current?.closest<HTMLElement>('.app-shell') ?? document.body);
  }, []);

  useLayoutEffect(() => {
    if (!open || !portalTarget) return;
    const updatePosition = () => {
      if (!trigger.current || !panel.current) return;
      const rect = panel.current.getBoundingClientRect();
      const styles = getComputedStyle(panel.current);
      const viewport = window.visualViewport;
      setPosition(getAnchoredPanelPosition(trigger.current.getBoundingClientRect(), {
        width: rect.width,
        height: panel.current.scrollHeight + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth),
      }, {
        left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
      }, 6));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, portalTarget]);

  useEffect(() => {
    if (!open || !portalTarget) return;
    const items = menuItems();
    (focusLast.current ? items.at(-1) : items[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!contains(event.target)) {
        setOpen(false);
        trigger.current?.focus();
      }
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
  }, [open, portalTarget]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="net-worth-actions" ref={container} onBlur={(event) => {
    if (!contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="net-worth-overflow" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={portalTarget ? id : undefined}
      onClick={() => { focusLast.current = false; setOpen((value) => !value); }} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); focusLast.current = event.key === 'ArrowUp';
          if (open) {
            const items = menuItems();
            (focusLast.current ? items.at(-1) : items[0])?.focus();
          } else setOpen(true);
        }
      }}><span aria-hidden="true">⋯</span></button>
    {portalTarget && createPortal(<div className="overflow-menu-layer" data-expanded={open}>
      <div className="overflow-menu-backdrop" aria-hidden="true" />
      <div ref={panel} id={id} role="menu" aria-label={label} className="net-worth-actions-menu" style={position}
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
      </div>
    </div>, portalTarget)}
  </div>;
}
