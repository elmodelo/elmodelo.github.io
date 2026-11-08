import type { LocaleMessages } from '../locales/types';

export type AppSection = 'transactions' | 'settings' | 'account';

interface MenuProps {
  messages: LocaleMessages;
  section: AppSection;
  onSelect: (section: AppSection) => void;
}

export default function Menu({ messages, section, onSelect }: MenuProps) {
  const items: { id: AppSection; label: string }[] = [
    { id: 'transactions', label: messages.transactions },
    { id: 'settings', label: messages.settings },
    { id: 'account', label: messages.myAccount },
  ];

  return (
    <nav className="main-menu" aria-label={messages.mainMenu}>
      {items.map((item, index) => (
        <div className={index === 1 ? 'menu-item menu-item-separated' : 'menu-item'} key={item.id}>
          <button
            type="button"
            className="menu-button"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        </div>
      ))}
    </nav>
  );
}
