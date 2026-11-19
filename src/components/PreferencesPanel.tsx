import { useEffect, useId, useRef, useState } from 'react';
import type { Language } from '../hooks/useLanguage';
import type { Theme } from '../hooks/useTheme';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import type { SavedTransactionFilter } from '../lib/transactionFilterPresets';

interface PreferencesPanelProps {
  messages: LocaleMessages;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (language: Language) => void;
  accounts: Account[];
  trackedAccountIds: string[];
  cashFlowAccountIds: string[];
  onCashFlowAccountIdsChange: (ids: string[]) => void;
  onTrackedAccountIdsChange: (ids: string[]) => void;
  accountsStatus: 'loading' | 'ready' | 'error';
  onRetryAccounts: () => void;
  savedFilters: readonly SavedTransactionFilter[];
  onPinFilter: (id: string, pinned: boolean) => void;
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
    <fieldset className="preferences-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="preferences-option" key={option.value}>
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

interface AccountSelectionProps {
  messages: LocaleMessages;
  label: string;
  name: string;
  accounts: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  accountsStatus: 'loading' | 'ready' | 'error';
  onRetryAccounts: () => void;
}

function AccountSelection({ messages, label, name, accounts, selectedIds, onChange, accountsStatus, onRetryAccounts }: AccountSelectionProps) {
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
    <div className="preferences-group">
      <button
        className="preferences-account-trigger"
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
        <span>{label} ({selectedIds.length}/{accounts.length})</span>
        <span aria-hidden="true">▾</span>
      </button>
      <fieldset
        id={accountListId}
        ref={accountListRef}
        popover="auto"
        className="preferences-account-options"
        aria-label={label}
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
          <label className="preferences-option" key={account.id}>
            <input
              type="checkbox"
              name={name}
              value={account.id}
              checked={selectedIds.includes(account.id)}
              onChange={(event) => onChange(event.target.checked
                ? [...selectedIds, account.id]
                : selectedIds.filter((id) => id !== account.id))}
            />
            <span>{account.name}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export default function PreferencesPanel({
  messages,
  theme,
  onThemeChange,
  onLanguageChange,
  accounts,
  trackedAccountIds,
  cashFlowAccountIds = [],
  onCashFlowAccountIdsChange,
  onTrackedAccountIdsChange,
  accountsStatus,
  onRetryAccounts,
  savedFilters,
  onPinFilter,
}: PreferencesPanelProps) {
  return (
    <section className="dashboard-panel" aria-labelledby="preferences-title">
      <h1 id="preferences-title">{messages.preferences}</h1>
      <div className="panel-scroll" tabIndex={0} role="region" aria-labelledby="preferences-title">
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
        <AccountSelection messages={messages} label={messages.trackedAccounts} name="trackedAccounts"
          accounts={accounts} selectedIds={trackedAccountIds} onChange={onTrackedAccountIdsChange}
          accountsStatus={accountsStatus} onRetryAccounts={onRetryAccounts} />
        <AccountSelection messages={messages} label={messages.cashFlowAccounts} name="cashFlowAccounts"
          accounts={accounts} selectedIds={cashFlowAccountIds} onChange={onCashFlowAccountIdsChange}
          accountsStatus={accountsStatus} onRetryAccounts={onRetryAccounts} />
        <fieldset className="preferences-group">
          <legend>{messages.savedFilters}</legend>
          {savedFilters.length === 0 ? <p>{messages.noSavedFilters}</p> : (
            <>
              <p className="preferences-pin-label">{messages.pinToMenu}</p>
              {savedFilters.map((preset) => (
                <label className="preferences-option preferences-filter-option" key={preset.id}>
                  <input type="checkbox" checked={preset.pin_to_menu === true}
                    aria-label={`${messages.pinToMenu}: ${preset.name}`}
                    onChange={(event) => onPinFilter(preset.id, event.target.checked)} />
                  <span>{preset.name}</span>
                </label>
              ))}
            </>
          )}
        </fieldset>
      </div>
    </section>
  );
}
