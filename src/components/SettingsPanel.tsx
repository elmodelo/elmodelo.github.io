import { useEffect, useId, useRef, useState } from 'react';
import type { Language } from '../hooks/useLanguage';
import type { Theme } from '../hooks/useTheme';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';

interface SettingsPanelProps {
  messages: LocaleMessages;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (language: Language) => void;
  accounts: Account[];
  trackedAccountIds: string[];
  onTrackedAccountIdsChange: (ids: string[]) => void;
  accountsStatus: 'loading' | 'ready' | 'error';
  onRetryAccounts: () => void;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function OptionGroup<T extends string>({ legend, name, value, options, onChange }: OptionGroupProps<T>) {
  return (
    <fieldset className="settings-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="settings-option" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function SettingsPanel({
  messages,
  theme,
  onThemeChange,
  onLanguageChange,
  accounts,
  trackedAccountIds,
  onTrackedAccountIdsChange,
  accountsStatus,
  onRetryAccounts,
}: SettingsPanelProps) {
  const accountListId = useId();
  const accountListRef = useRef<HTMLFieldSetElement>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });

  useEffect(() => {
    if (!accountsOpen) return;
    function closeDropdown(event: Event) {
      if (event.target instanceof Node && accountListRef.current?.contains(event.target)) return;
      accountListRef.current?.hidePopover();
    }
    window.addEventListener('resize', closeDropdown);
    window.addEventListener('scroll', closeDropdown, true);
    return () => {
      window.removeEventListener('resize', closeDropdown);
      window.removeEventListener('scroll', closeDropdown, true);
    };
  }, [accountsOpen]);

  return (
    <section className="dashboard-panel" aria-labelledby="settings-title">
      <h1 id="settings-title">{messages.settings}</h1>
      <div className="panel-scroll" tabIndex={0} role="region" aria-labelledby="settings-title">
        <OptionGroup
          legend={messages.theme}
          name="theme"
          value={theme}
          options={[
            { value: 'light', label: messages.themeLight },
            { value: 'dark', label: messages.themeDark },
          ]}
          onChange={onThemeChange}
        />
        <OptionGroup
          legend={messages.languageSetting}
          name="language"
          value={messages.language}
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
          onChange={onLanguageChange}
        />
        <div className="settings-group">
          <button
            className="settings-account-trigger"
            type="button"
            popoverTarget={accountListId}
            aria-expanded={accountsOpen}
            aria-controls={accountListId}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const below = window.innerHeight - rect.bottom - 12;
              const maxHeight = Math.min(320, Math.max(below, rect.top - 12));
              setDropdownPosition({
                top: below >= maxHeight ? rect.bottom + 4 : rect.top - maxHeight - 4,
                left: rect.left,
                width: rect.width,
                maxHeight,
              });
            }}
          >
            <span>{messages.trackedAccounts} ({trackedAccountIds.length}/{accounts.length})</span>
            <span aria-hidden="true">▾</span>
          </button>
          <fieldset
            id={accountListId}
            ref={accountListRef}
            popover="auto"
            className="settings-account-options"
            aria-label={messages.trackedAccounts}
            style={dropdownPosition}
            onToggle={(event) => setAccountsOpen(event.newState === 'open')}
          >
            {accountsStatus === 'loading' ? (
              <p role="status">{messages.loadingAccounts}</p>
            ) : accountsStatus === 'error' ? (
              <div role="alert">
                <p className="form-message form-message-error">{messages.accountsError}</p>
                <button className="button button-secondary" type="button" onClick={onRetryAccounts}>
                  {messages.retry}
                </button>
              </div>
            ) : accounts.length === 0 ? (
              <p>{messages.noAccounts}</p>
            ) : accounts.map((account) => (
              <label className="settings-option" key={account.id}>
                <input
                  type="checkbox"
                  name="trackedAccounts"
                  value={account.id}
                  checked={trackedAccountIds.includes(account.id)}
                  onChange={(event) => onTrackedAccountIdsChange(event.target.checked
                    ? [...trackedAccountIds, account.id]
                    : trackedAccountIds.filter((id) => id !== account.id))}
                />
                <span>{account.name}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </section>
  );
}
