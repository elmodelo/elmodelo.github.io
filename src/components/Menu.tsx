import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocaleMessages } from '../locales/types';
import type { SavedTransactionFilter } from '../lib/transactionFilterPresets';

export type AppSection = 'transactions' | 'net-worth' | 'cash-flow' | 'uncategorized' | 'preferences' | 'account' | `saved-filter:${string}`;

export function savedFilterSection(id: string): AppSection {
  return `saved-filter:${id}`;
}

interface MenuProps {
  messages: LocaleMessages;
  section: AppSection;
  onSelect: (section: AppSection) => void;
  toggleTarget: HTMLElement | null;
  uncategorizedCount?: number;
  pinnedFilters?: readonly SavedTransactionFilter[];
}

export default function Menu({ messages, section, onSelect, toggleTarget, uncategorizedCount = 0, pinnedFilters = [] }: MenuProps) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);
  const items: { id: AppSection; label: string }[] = [
    { id: 'transactions', label: messages.transactions },
    { id: 'net-worth', label: messages.netWorth },
    { id: 'cash-flow', label: messages.cashFlow },
    { id: 'preferences', label: messages.preferences },
    { id: 'account', label: messages.myAccount },
  ];

  return (
    <>
      <button
        type="button"
        className="menu-backdrop"
        data-expanded={expanded}
        aria-label={messages.close}
        tabIndex={-1}
        onClick={() => {
          setExpanded(false);
          toggleRef.current?.focus();
        }}
      />
      <nav className="main-menu" aria-label={messages.mainMenu}>
        {toggleTarget && createPortal(<button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-label={messages.mainMenu}
          aria-expanded={expanded}
          aria-controls={menuId}
          onClick={() => setExpanded((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>, toggleTarget)}
        <div id={menuId} className="menu-items" data-expanded={expanded}>
          {items.map((item) => (
            <div className={item.id === 'preferences' ? 'menu-item menu-item-separated' : 'menu-item'} key={item.id}>
              <button
                type="button"
                className="menu-button"
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => {
                  onSelect(item.id);
                  setExpanded(false);
                }}
              >
                {item.label}
              </button>
              {item.id === 'transactions' && uncategorizedCount > 0 && (
                <button
                  type="button"
                  className="menu-button menu-subsection"
                  aria-current={section === 'uncategorized' ? 'page' : undefined}
                  onClick={() => {
                    onSelect('uncategorized');
                    setExpanded(false);
                  }}
                >
                  {messages.uncategorized} ({uncategorizedCount})
                </button>
              )}
              {item.id === 'transactions' && pinnedFilters.map((preset) => {
                const id = savedFilterSection(preset.id);
                return (
                  <button key={id} type="button" className="menu-button menu-subsection"
                    aria-current={section === id ? 'page' : undefined}
                    onClick={() => {
                      onSelect(id);
                      setExpanded(false);
                    }}>
                    {preset.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
