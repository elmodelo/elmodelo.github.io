import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocaleMessages } from '../locales/types';

export type AppSection = 'transactions' | 'uncategorized' | 'settings' | 'account';

interface MenuProps {
  messages: LocaleMessages;
  section: AppSection;
  onSelect: (section: AppSection) => void;
  toggleTarget: HTMLElement | null;
  uncategorizedCount?: number;
}

export default function Menu({ messages, section, onSelect, toggleTarget, uncategorizedCount = 0 }: MenuProps) {
  const [expanded, setExpanded] = useState(false);
  const menuId = useId();
  const items: { id: AppSection; label: string }[] = [
    { id: 'transactions', label: messages.transactions },
    { id: 'settings', label: messages.settings },
    { id: 'account', label: messages.myAccount },
  ];

  return (
    <nav className="main-menu" aria-label={messages.mainMenu}>
      {toggleTarget && createPortal(<button
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
        {items.map((item, index) => (
          <div className={index === 1 ? 'menu-item menu-item-separated' : 'menu-item'} key={item.id}>
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
          </div>
        ))}
      </div>
    </nav>
  );
}
